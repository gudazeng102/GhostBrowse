/**
 * Chrome 浏览器启动模块
 * Phase 1.3: 实现带有指纹注入的 Chrome 启动逻辑
 * Phase 2.6: 重构为内嵌 Chromium 便携版 + rcedit 图标替换
 * 
 * 职责：
 * - 根据 Profile 配置启动带有指纹的 Chrome 浏览器
 * - 优先使用内嵌 Chromium 便携版（resources/browser/{version}/chrome.exe）
 * - 启动前用 rcedit 修改 chrome.exe 图标（预修改方案）
 * - 动态生成指纹注入 Extension
 * - 管理浏览器进程
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app, screen } from 'electron'
import * as http from 'http'
import * as net from 'net'
import * as tls from 'tls'
import { getDatabase } from '../server/db'
import { detectProxyCountry } from '../server/utils/proxy-geo'
import { resolveGeoConfig } from '../server/utils/geo-config'
import { saveProfileCookieJson } from '../server/services/cookie-snapshot'

// ==================== Phase 3.5 Rev4: Session Tab Manager（Electron 主进程集中心跳）====================

interface TabInfo {
  url: string
  title: string | null
  active: number
  updatedAt: number
}

// 每个 profile 的标签页管理器
const profileTabManagers = new Map<number, {
  tabs: TabInfo[]
  syncTimer: NodeJS.Timeout | null
  pollTimer: NodeJS.Timeout | null
  cookieSyncTimer: NodeJS.Timeout | null  // ✅ Phase 4.1: 30 秒一次的 Cookie 快照
  debugPort: number
  pageTargets: Map<string, { url: string; title: string | null }>  // targetId -> tab info
}>()

/**
 * 通过 HTTP POST /api/v1/profiles/:id/session-tabs/bulk 同步标签页到后端
 */
async function syncSessionTabs(profileId: number) {
  const manager = profileTabManagers.get(profileId)
  if (!manager) return

  // 过滤掉空数组，避免无意义同步
  const validTabs = manager.tabs.filter(t => t.url && !t.url.startsWith('about:') && !t.url.startsWith('chrome://'))
  if (validTabs.length === 0) {
    console.log(`[SessionManager] Profile ${profileId} 无有效标签页，跳过同步`)
    return
  }

  try {
    const body = JSON.stringify({ tabs: validTabs })
    const res = await fetch(`http://localhost:3000/api/v1/profiles/${profileId}/session-tabs/bulk`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Internal-Request': 'electron-main'  // ✅ 标记为本地主进程内部调用
      },
      body
    })
    if (res.ok) {
      console.log(`[SessionManager] Profile ${profileId} 同步 ${validTabs.length} 个标签页 ✅`)
    } else {
      const errText = await res.text().catch(() => 'unknown')
      console.error(`[SessionManager] Profile ${profileId} 同步失败 ❌ HTTP ${res.status}: ${errText}`)
    }
  } catch (err: any) {
    if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
      return
    }
    console.warn(`[SessionManager] Profile ${profileId} 同步异常: ${err.message || err}`)
  }
}

/**
 * Phase 3.5 Fix: 强制修改 Chrome Preferences 并清理 Session 恢复文件
 * 确保 Chrome 启动时听从命令行传入的 URLs，而不是恢复旧 session
 */
function patchChromePreferences(userDataDir: string, startupUrls: string[]) {
  const defaultDir = path.join(userDataDir, 'Default')
  const prefsPath = path.join(defaultDir, 'Preferences')

  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true })
  }

  let prefs: any = {}
  if (fs.existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'))
    } catch (e) {
      console.warn('[BrowserLauncher] 读取 Preferences 失败，将创建新文件')
    }
  }

  // 强制启动行为：打开 startup_urls 中指定的页面
  prefs.session = prefs.session || {}
  prefs.session.restore_on_startup = 4           // 4 = 打开特定页面
  prefs.session.startup_urls = startupUrls.filter(u => u && !u.startsWith('about:') && !u.startsWith('chrome://'))
  
  // 清理干扰字段
  delete prefs.session.restore_on_startup_migrated
  delete prefs.session.restore_session_state
  delete prefs.session.last_session_exited_cleanly
  delete prefs.session.restore_on_startup_migrated_to_synchronous

  // ✅ FIX: 彻底清理 Chrome 的 Session 恢复文件，防止它覆盖我们的 URLs
  const filesToDelete = [
    path.join(defaultDir, 'Last Session'),
    path.join(defaultDir, 'Current Session'),
    path.join(defaultDir, 'Last Tabs'),
    path.join(defaultDir, 'Current Tabs'),
    path.join(defaultDir, 'Last Session Crash'),
    path.join(defaultDir, 'Current Session Crash'),
  ]
  const dirsToClean = [
    path.join(defaultDir, 'Sessions'),
    path.join(defaultDir, 'Session Storage'),
  ]

  for (const file of filesToDelete) {
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file) } catch (e) {}
    }
  }
  for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          fs.unlinkSync(path.join(dir, file))
        }
      } catch (e) {}
    }
  }

  try {
    fs.writeFileSync(prefsPath, JSON.stringify(prefs))
    console.log(`[BrowserLauncher] Preferences 已修复: restore_on_startup=4, startup_urls=${JSON.stringify(prefs.session.startup_urls)}`)
  } catch (e) {
    console.warn('[BrowserLauncher] 写入 Preferences 失败:', e)
  }
}

/**
 * Phase 3.5 Rev5: 启动 Session Tab Manager
 * 停掉持续 CDP 轮询，改为一次性兜底同步（仅当数据库为空时）
 */
export function startSessionTabManager(profileId: number, debugPort: number) {
  if (profileTabManagers.has(profileId)) {
    stopSessionTabManager(profileId)
  }

  const manager = {
    tabs: [] as TabInfo[],
    syncTimer: null as NodeJS.Timeout | null,
    pollTimer: null as NodeJS.Timeout | null,
    cookieSyncTimer: null as NodeJS.Timeout | null,  // ✅ Phase 4.1: 30 秒一次的 Cookie 快照
    debugPort,
    pageTargets: new Map()
  }
  profileTabManagers.set(profileId, manager)

  const cdpUrl = `http://localhost:${debugPort}/json`

  async function fetchCDPTabs() {
    try {
      const res = await fetch(cdpUrl)
      console.log(`[CDP诊断] Profile ${profileId} CDP fetch 状态: ${res.status}, URL: ${cdpUrl}`)
      if (!res.ok) return []
      const pages = await res.json() as any[]
      console.log(`[CDP诊断] Profile ${profileId} CDP 返回 ${pages.length} 个页面`)
      return pages.filter((p: any) => {
        const url = p.url || ''
        const type = p.type || ''
        return type === 'page'
          && !url.startsWith('about:')
          && !url.startsWith('chrome://')
          && !url.startsWith('chrome-extension://')
          && !url.startsWith('devtools://')
          && !url.startsWith('edge://')
          && !url.startsWith('blob:')
          && !url.startsWith('javascript:')
      })
    } catch (err: any) {
      console.log(`[CDP诊断] Profile ${profileId} CDP fetch 失败: ${err?.message || err}`)
      return []
    }
  }

  // ✅ 启动时一次性兜底同步（仅当数据库为空时执行）
  async function bootstrapSync() {
    try {
      const dbCheck = await fetch(`http://localhost:3000/api/v1/profiles/${profileId}/session-tabs`, {
        method: 'GET',
        headers: { 'X-Internal-Request': 'electron-main' }
      })
      const dbData = await dbCheck.json().catch(() => ({ data: { tabs: [] } })) as { data: { tabs: any[] } }
      const existingCount = dbData?.data?.tabs?.length || 0

      console.log(`[SessionManager] Profile ${profileId} 数据库检查完成，现有 ${existingCount} 个标签页`)
      
      if (existingCount > 0) {
        // ✅ Phase 3.6 Fix: 直接用数据库已有数据初始化内存基准（Extension 会持续上报，无需等 CDP）
        const dbTabs = dbData?.data?.tabs || []
        manager.tabs = dbTabs.map((t: any) => ({
          url: t.url || '',
          title: t.title || null,
          active: t.active || 0,
          updatedAt: Date.now()
        }))
        console.log(`[SessionManager] Profile ${profileId} 用数据库初始化 ${manager.tabs.length} 个标签页到内存（Extension 会持续上报更新）`)
        return
      }
      const pages = await fetchCDPTabs()
      if (pages.length === 0) return

      const now = Date.now()
      const activePage = pages.find((p: any) => p.active) || pages[0]
      const tabs = pages.map((p: any) => ({
        url: p.url || '',
        title: p.title || null,
        active: p.id === activePage?.id ? 1 : 0,
        updatedAt: now
      }))
      await fetch(`http://localhost:3000/api/v1/profiles/${profileId}/session-tabs/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'electron-main'
        },
        body: JSON.stringify({ tabs })
      })
      // ✅ Phase 3.6 Fix: 同步后也更新内存基准，确保轮询能正确检测关闭
      manager.tabs = tabs
      console.log(`[SessionManager] Profile ${profileId} CDP 兜底同步 ${tabs.length} 个标签页`)
    } catch (err: any) {
      console.warn(`[SessionManager] Profile ${profileId} 兜底同步失败: ${err.message}`)
    }
  }

  // ✅ FIX: 用变量标记是否已执行过，避免重复执行
  let bootstrapDone = false
  setTimeout(() => {
    if (bootstrapDone) return
    bootstrapDone = true
    bootstrapSync()
  }, 3000)

  // ✅ Phase 3.6: 全量同步轮询（每 2 秒）
  // CDP 是实时数据源，直接全量同步到数据库（Extension 心跳只负责数据库，此处负责清理已关闭标签页）
  const pollTimer = setInterval(async () => {
    const m = profileTabManagers.get(profileId)
    if (!m) {
      console.log(`[轮询诊断] Profile ${profileId} manager 不存在，跳过`)
      return
    }

    let pages: any[] = []
    try {
      pages = await fetchCDPTabs()
    } catch (err: any) {
      console.log(`[轮询诊断] Profile ${profileId} fetchCDPTabs 异常: ${err?.message || err}`)
      return
    }
    
    console.log(`[轮询诊断] Profile ${profileId} 轮询执行，获取 ${pages.length} 个页面`)

    const now = Date.now()
    const activePage = pages.find((p: any) => p.active) || pages[0]
    const newTabs = pages.map((p: any) => ({
      url: p.url || '',
      title: p.title || null,
      active: p.id === activePage?.id ? 1 : 0,
      updatedAt: now
    }))

    // ✅ 核心逻辑：用 CDP 数据全量同步到数据库
    // Extension 负责 INSERT/UPDATE，轮询负责 DELETE 已关闭的标签页
    try {
      const body = JSON.stringify({ tabs: newTabs })
      const res = await fetch(`http://localhost:3000/api/v1/profiles/${profileId}/session-tabs/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'electron-main'
        },
        body
      })
      if (res.ok) {
        m.tabs = newTabs
      }
    } catch (err: any) {
      // 网络错误静默忽略
    }
  }, 2000)

  manager.pollTimer = pollTimer

  // ✅ Phase 4.1: 每 30 秒抓取一次实时 Cookie 写回 profiles.cookie_json
  // 静默失败，不影响主流程；窗口关闭时由 closeProfile 兜底再写一次
  const cookieSyncTimer = setInterval(async () => {
    const m = profileTabManagers.get(profileId)
    if (!m) return
    try {
      await saveProfileCookieJson(profileId, { silent: true })
    } catch {
      // saveProfileCookieJson 内部已 silent，这里二次兜底
    }
  }, 30000)
  manager.cookieSyncTimer = cookieSyncTimer

  console.log(`[SessionManager] Profile ${profileId} Session Tab Manager 已启动，debugPort=${debugPort}`)
}

/**
 * 停止某 profile 的 Session Tab Manager
 * ✅ FIX: 改为 async，await 最后一次同步完成后再清理
 */
export async function stopSessionTabManager(profileId: number) {
  const manager = profileTabManagers.get(profileId)
  if (!manager) return

  if (manager.pollTimer) {
    clearInterval(manager.pollTimer)
    manager.pollTimer = null
  }
  if (manager.syncTimer) {
    clearInterval(manager.syncTimer)
    manager.syncTimer = null
  }
  if (manager.cookieSyncTimer) {
    clearInterval(manager.cookieSyncTimer)
    manager.cookieSyncTimer = null
  }
  
  // ✅ FIX: await 最后一次同步，确保关闭前数据一定落库
  console.log(`[SessionManager] Profile ${profileId} 正在执行关闭前最终同步...`)
  await syncSessionTabs(profileId)
  
  profileTabManagers.delete(profileId)
  console.log(`[SessionManager] Profile ${profileId} Session Tab Manager 已停止`)
}

/**
 * 获取某 profile 的所有标签页
 */
export function getProfileTabs(profileId: number): TabInfo[] {
  return profileTabManagers.get(profileId)?.tabs || []
}

// ==================== 类型定义 ====================

/** Profile 配置（来自数据库） */
export interface Profile {
  id: number
  title: string
  proxyId: number | null
  chromeVersion: string
  os: string
  webrtcMode: string
  timezoneMode: string
  geolocationMode: string
  languageMode: string
  uiLanguage: string
  screenResolution: string
  font: string
  canvasMode: string
  webglMode: string
  mediaDeviceMode: string
  iconPath?: string
  // Phase 4.0: Cookie 预置 JSON
  cookie_json?: string
}

/** Proxy 配置 */
export interface Proxy {
  id: number
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
}

/** Chrome 启动结果 */
export interface LaunchResult {
  pid: number
  userDataDir: string
}

/** Chrome 版本对应的 User-Agent */
const CHROME_USER_AGENTS: Record<string, string> = {
  '121': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.86 Safari/537.36',
  '122': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.95 Safari/537.36',
  '123': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.87 Safari/537.36',
  '124': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.79 Safari/537.36',
  '140': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.81 Safari/537.36',
  '141': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.77 Safari/537.36',
  '142': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.60 Safari/537.36',
  '143': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.41 Safari/537.36',
  '144': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7559.97 Safari/537.36',
  '145': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.76 Safari/537.36',
  '147': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.56 Safari/537.36'
}

// ==================== Phase 2.6: 内嵌 Chromium 路径管理 ====================

/**
 * Phase 2.6: 获取内嵌 Chromium 的 chrome.exe 路径
 * 优先使用 resources/browser/{version}/chrome.exe
 */
function getEmbeddedChromeExePath(version: string): string {
  // ✅ 修复：去除 "Chrome " 前缀，只保留纯数字版本号
  const cleanVersion = version.replace(/^Chrome\s*/i, '').trim()
  
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'browser', cleanVersion)
    : path.join(process.cwd(), 'resources', 'browser', cleanVersion)

  return path.join(baseDir, 'chrome.exe')
}

/**
 * Phase 2.6: 获取默认图标路径
 */
function getDefaultIconPath(): string {
  const iconDir = app.isPackaged
    ? path.join(process.resourcesPath, 'icons')
    : path.join(process.cwd(), 'resources', 'icons')

  return path.join(iconDir, 'default.ico')
}

/**
 * Phase 2.6: 检查指定版本的 Chromium 是否存在
 */
export function checkChromeVersion(version: string): { exists: boolean; path: string } {
  const exePath = getEmbeddedChromeExePath(version)
  return {
    exists: fs.existsSync(exePath),
    path: exePath,
  }
}

/**
 * Phase 2.6: 查找可用的 Chrome 路径
 * 优先级：内嵌 Chromium > 系统 Chrome > 系统 Edge
 */
function findAvailableChromePath(preferredVersion: string): string | null {
  // 1. 首先检查内嵌 Chromium
  const embeddedPath = getEmbeddedChromeExePath(preferredVersion)
  if (fs.existsSync(embeddedPath)) {
    return embeddedPath
  }

  // 2. 尝试其他版本的内嵌 Chromium（按版本号降序）
  for (const version of ['147', '145', '144', '143', '142', '141', '140', '124', '123', '122', '121',]) {
    if (version === preferredVersion) continue
    const otherPath = getEmbeddedChromeExePath(version)
    if (fs.existsSync(otherPath)) {
      return otherPath
    }
  }

  // 3. 查找系统 Chrome
  const systemCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]

  for (const candidate of systemCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // 4. 查找系统 Edge（备用）
  const edgeCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]

  for (const candidate of edgeCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

// ==================== Phase 2.6: rcedit 图标修改 ====================

/**
 * Phase 2.6: 使用 rcedit 修改 chrome.exe 图标
 * 预修改方案：首次修改后写入 .patched 标记，后续跳过
 */
async function patchChromeIcon(chromeExePath: string, iconPath: string): Promise<void> {
  const patchedMarker = chromeExePath + '.patched'

  // 如果已修改过，跳过
  if (fs.existsSync(patchedMarker)) {
    return
  }

  // 查找 rcedit 可执行文件
  let rceditPath: string

  // 优先级：node_modules > resources/tools > 相对路径
  const nodeModulesRcedit = path.join(process.cwd(), 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')
  const resourcesToolsRcedit = app.isPackaged
    ? path.join(process.resourcesPath, 'tools', 'rcedit.exe')
    : path.join(process.cwd(), 'resources', 'tools', 'rcedit.exe')

  if (fs.existsSync(nodeModulesRcedit)) {
    rceditPath = nodeModulesRcedit
  } else if (fs.existsSync(resourcesToolsRcedit)) {
    rceditPath = resourcesToolsRcedit
  } else {
    throw new Error('rcedit 未找到，请执行 npm install rcedit')
  }

  // 备份原文件（仅备份一次）
  const backupPath = chromeExePath + '.bak'
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(chromeExePath, backupPath)
    } catch (e) {
      console.warn(`[rcedit] 备份失败（不影响继续）: ${e}`)
    }
  }

  // 调用 rcedit 修改图标
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process')
    const cmd = `"${rceditPath}" "${chromeExePath}" --set-icon "${iconPath}"`

    exec(cmd, { timeout: 30000, windowsHide: true }, (err: any, stdout: string, stderr: string) => {
      if (err) {
        console.error(`[rcedit] 修改图标失败: ${err.message}`)
        if (stderr) console.error(`[rcedit] stderr: ${stderr}`)
        // 图标修改失败不影响启动，只是任务栏显示默认图标
        console.warn(`[rcedit] 图标修改失败，将使用默认图标继续启动`)
        resolve() // 不 reject，继续启动
        return
      }

      // 写入标记文件
      try {
        fs.writeFileSync(patchedMarker, JSON.stringify({
          icon: iconPath,
          patchedAt: new Date().toISOString()
        }))
      } catch (e) {
        console.warn(`[rcedit] 写入标记文件失败: ${e}`)
      }

      resolve()
    })
  })
}

// ==================== 本地代理转发器（Phase 1.6 验证可用，严禁修改）====================

/**
 * 创建本地 HTTP 代理服务器
 * Chrome -> 本地 HTTP (127.0.0.1:随机端口) -> TLS -> 远程 HTTPS 代理 -> 目标
 */
function createLocalProxy(proxy: Proxy): { url: string; server: http.Server } {
  const localPort = 30000 + Math.floor(Math.random() * 10000)
  
  const server = http.createServer()
  
  server.on('request', (req, res) => {
    // HTTP 请求：直接转发到远程代理
    const reqUrl = req.url || '/'
    const options = {
      hostname: proxy.host,
      port: proxy.port,
      path: reqUrl,
      method: req.method,
      headers: { ...req.headers, host: new URL(reqUrl).host },
      rejectUnauthorized: false,
      agent: false
    } as any
    
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    })
    
    proxyReq.on('error', (err) => {
      console.error('[LocalProxy] HTTP 错误:', err.message)
      res.writeHead(502)
      res.end('Proxy Error: ' + err.message)
    })
    
    req.pipe(proxyReq)
  })
  
  server.on('connect', (req, clientSocket, head) => {
    // HTTPS 请求：建立 CONNECT 隧道
    const reqUrl = req.url || ''
    const urlParts = reqUrl.split(':')
    const hostname = urlParts[0]
    const port = parseInt(urlParts[1]) || 443
    
    // 直接用 TCP 连接远程代理，发送 HTTP CONNECT 请求
    const netSocket = net.connect({
      host: proxy.host,
      port: proxy.port
    }, () => {
      // 构建 CONNECT 请求，带认证
      let connectReq = `CONNECT ${hostname}:${port} HTTP/1.1\r\n`
        + `Host: ${proxy.host}:${proxy.port}\r\n`
      
      if (proxy.username) {
        const auth = Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64')
        connectReq += `Proxy-Authorization: Basic ${auth}\r\n`
      }
      connectReq += `\r\n`
      
      netSocket.write(connectReq)
      
      // 等待代理响应
      netSocket.once('data', (data) => {
        const response = data.toString()
        if (response.includes('200')) {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          netSocket.pipe(clientSocket)
          clientSocket.pipe(netSocket)
        } else {
          console.error('[LocalProxy] CONNECT 被拒绝:', response)
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
          clientSocket.end()
          netSocket.end()
        }
      })
    })
    
    netSocket.on('error', (err) => {
      console.error('[LocalProxy] 连接错误:', err.message)
      try {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
        clientSocket.end()
      } catch {}
    })
  })
  
  server.listen(localPort, '127.0.0.1')

  return {
    url: `http://127.0.0.1:${localPort}`,
    server
  }
}

/** Chrome Extension 模板目录 
 * 开发模式: 使用 src/main/browser/extension
 * 打包模式: 使用 extraResources 下的 extension 目录
 */
function getExtensionTemplateDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'extension')
  } else {
    return path.join(process.cwd(), 'src', 'main', 'browser', 'extension')
  }
}

// ==================== Phase 4.1: 时区偏移量计算辅助函数 ====================

/**
 * 根据时区名称计算标准偏移量（分钟）
 * 返回值：UTC - 本地时间的分钟差（正值表示时区在 UTC 以西，如 EST=300）
 */
function getTimezoneOffset(tzName: string): number {
  try {
    const now = new Date()
    // 使用 Intl.DateTimeFormat 精确计算时区偏移
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    })
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    })
    
    const tzParts = tzFormatter.formatToParts(now)
    const utcParts = utcFormatter.formatToParts(now)
    
    const getPart = (parts: any[], type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)
    
    const tzDate = new Date(
      getPart(tzParts, 'year'), getPart(tzParts, 'month') - 1, getPart(tzParts, 'day'),
      getPart(tzParts, 'hour'), getPart(tzParts, 'minute'), getPart(tzParts, 'second')
    )
    const utcDate = new Date(
      getPart(utcParts, 'year'), getPart(utcParts, 'month') - 1, getPart(utcParts, 'day'),
      getPart(utcParts, 'hour'), getPart(utcParts, 'minute'), getPart(utcParts, 'second')
    )
    
    return Math.round((utcDate.getTime() - tzDate.getTime()) / 60000)
  } catch (e) {
    console.warn(`[BrowserLauncher] 计算时区偏移量失败: ${tzName}`, e)
    // 常见时区兜底映射
    const fallbackOffsets: Record<string, number> = {
      'Asia/Shanghai': -480, 'Asia/Tokyo': -540, 'Asia/Seoul': -540,
      'Asia/Singapore': -480, 'Asia/Bangkok': -420, 'Asia/Kolkata': -330,
      'Asia/Dubai': -240, 'Europe/Berlin': 60, 'Europe/London': 0,
      'Europe/Paris': 60, 'Europe/Moscow': 180, 'Europe/Rome': 60,
      'Europe/Madrid': 60, 'Europe/Amsterdam': 60, 'Europe/Stockholm': 60,
      'Europe/Warsaw': 60, 'America/New_York': 300, 'America/Los_Angeles': 480,
      'America/Chicago': 360, 'America/Toronto': 300, 'America/Vancouver': 480,
      'America/Sao_Paulo': 180, 'America/Mexico_City': 360,
      'Australia/Sydney': -600, 'Australia/Melbourne': -600
    }
    return fallbackOffsets[tzName] !== undefined ? fallbackOffsets[tzName] : -480
  }
}

// ==================== Extension 动态生成 ====================

function generateExtension(
  profile: Profile,
  proxy: Proxy | null,
  detectedTimezone?: string,
  detectedTimezoneOffset?: number
): string {
  const tempDir = path.join(os.tmpdir(), `ghostbrowse-ext-${profile.id}`)
  
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  
  fs.mkdirSync(tempDir, { recursive: true })
  
  const manifestPath = path.join(getExtensionTemplateDir(), 'manifest.json')
  let manifestContent = fs.readFileSync(manifestPath, 'utf-8')
  fs.writeFileSync(path.join(tempDir, 'manifest.json'), manifestContent)
  
  const contentScriptPath = path.join(getExtensionTemplateDir(), 'content-script.js')
  let contentScript = fs.readFileSync(contentScriptPath, 'utf-8')
  
  // Phase 4.1: 使用检测到的时区（如果 timezoneMode='ip' 且检测成功）
  const timezone = detectedTimezone || 'Asia/Shanghai'
  const timezoneOffset = detectedTimezoneOffset !== undefined ? detectedTimezoneOffset : -480
  
  // Phase 3.2: 追加指纹噪声种子字段到 config
  const config = {
    profile_id: profile.id,
    // Phase 4.0: 传递浏览器版本和操作系统，供 userAgentData 使用
    chrome_version: profile.chromeVersion || '128',
    os: profile.os || 'windows',
    canvas_mode: profile.canvasMode || 'noise',
    webgl_mode: profile.webglMode || 'mock',
    webrtc_mode: profile.webrtcMode || 'replace',
    timezone_mode: profile.timezoneMode || 'ip',
    geolocation_mode: profile.geolocationMode || 'ip',
    media_device_mode: profile.mediaDeviceMode || 'mock',
    screen_resolution: profile.screenResolution || '1920x1080',
    ui_language: profile.uiLanguage || 'zh-CN',
    timezone: timezone,
    timezone_offset: timezoneOffset,
    latitude: 39.9042,
    longitude: 116.4074,
    proxy_ip: proxy?.host || null,
    // Phase 3.0: 噪声种子（用于深度指纹伪装）
    canvas_noise_seed: (profile as any).canvasNoiseSeed || '19AC8B24',
    audio_noise_seed: (profile as any).audioNoiseSeed || '8F3E2A1B',
    rects_noise_seed: (profile as any).rectsNoiseSeed || '13104F15',
    // Phase 3.2: WebGL 完整伪装参数
    webgl_vendor: (profile as any).webglVendor || 'Intel Inc.',
    webgl_renderer: (profile as any).webglRenderer || 'Intel Iris Xe Graphics'
  }
  
  contentScript = contentScript.split('{{CONFIG}}').join(JSON.stringify(config))
  fs.writeFileSync(path.join(tempDir, 'content-script.js'), contentScript)
  
  return tempDir
}

// ==================== 主启动函数 ====================

export async function launchChrome(
  profile: Profile,
  proxy: Proxy | null
): Promise<LaunchResult> {
  // 在 launchChrome 函数开头
  const rawVersion = profile.chromeVersion || '128'
  const version = rawVersion.replace(/^Chrome\s*/i, '').trim()  // ✅ 提取纯数字

  // === Phase 2.6: 查找可用的 Chrome 路径 ===
  const chromePath = findAvailableChromePath(version)
  if (!chromePath) {
    throw new Error(
      `未找到 Chrome 浏览器。\n` +
      `请选择以下任一方式：\n` +
      `1. 将 Chromium 便携版放入 resources/browser/${version}/ 目录（包含 chrome.exe）\n` +
      `2. 安装 Google Chrome 或 Microsoft Edge\n`
    )
  }

  // === Phase 2.6: 图标处理 ===
  // 优先级：用户选择 > 默认图标
  const defaultIconName = 'favicon.ico'
  let iconFullPath: string | null = null

  if (profile.iconPath) {
    // 用户选择了自定义图标
    iconFullPath = app.isPackaged
      ? path.join(process.resourcesPath, profile.iconPath)
      : path.join(process.cwd(), 'resources', profile.iconPath)
  } else {
    // 使用默认图标
    iconFullPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icons', defaultIconName)
      : path.join(process.cwd(), 'resources', 'icons', defaultIconName)
  }

  // 检查图标文件是否存在
  if (iconFullPath && fs.existsSync(iconFullPath)) {
    try {
      await patchChromeIcon(chromePath, iconFullPath)
    } catch (e: any) {
      console.warn(`[rcedit] 图标修改失败，使用默认图标启动: ${e.message}`)
    }
  } else {
    console.warn(`[rcedit] 图标文件不存在: ${iconFullPath}，使用 Chrome 默认图标`)
  }

  // === 构建 user-data-dir ===
  const userDataDir = path.join(
    app.isPackaged ? app.getPath('userData') : process.cwd(),
    'profiles',
    String(profile.id)
  )
  
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  // === Phase 4.1: 时区跟随代理IP（如果 timezoneMode='ip'）===
  let detectedTimezone: string | undefined
  let detectedTimezoneOffset: number | undefined

  if (profile.timezoneMode === 'ip' && proxy) {
    try {
      const countryCode = await detectProxyCountry(proxy)
      if (countryCode) {
        const geoConfig = resolveGeoConfig(countryCode)
        detectedTimezone = geoConfig.timezone
        detectedTimezoneOffset = getTimezoneOffset(detectedTimezone)
        console.log(`[BrowserLauncher] 代理IP国家检测: ${countryCode} → 时区: ${detectedTimezone}, 偏移: ${detectedTimezoneOffset}分钟`)
      } else {
        console.warn('[BrowserLauncher] 代理国家检测失败，使用时区兜底值 Asia/Shanghai')
      }
    } catch (e: any) {
      console.warn('[BrowserLauncher] 时区跟随代理IP检测失败:', e.message)
    }
  }

  // === 生成指纹注入 Extension ===
  const extensionPath = generateExtension(profile, proxy, detectedTimezone, detectedTimezoneOffset)
  
  // === 构建代理参数 ===
  let proxyServer = ''
  let localProxyServer: http.Server | null = null
  
  if (proxy) {
    const needsTlsForward = proxy.port === 443 || proxy.type === 'https'
    
    if (needsTlsForward) {
      const localProxy = createLocalProxy(proxy)
      localProxyServer = localProxy.server
      proxyServer = localProxy.url
    } else {
      const encode = (str: string | null) => str ? encodeURIComponent(str) : ''
      const user = encode(proxy.username)
      const pass = encode(proxy.password)
      const auth = proxy.username ? `${user}:${pass}@` : ''
      
      let scheme: string
      switch (proxy.type) {
        case 'socks5':
          scheme = 'socks5'
          break
        case 'http':
        case 'https':
        default:
          scheme = 'http'
      }
      
      proxyServer = `${scheme}://${auth}${proxy.host}:${proxy.port}`
    }
  }
  
  // === 获取 User-Agent ===
  const userAgent = CHROME_USER_AGENTS[version] || CHROME_USER_AGENTS['128']
  
  // === 解析分辨率 ===
  const resolution = profile.screenResolution || '1920x1080'
  const [screenWidth, screenHeight] = resolution.split('x').map(Number)
  
  // Phase 2.2: 智能窗口布局逻辑
  const primaryDisplay = screen.getPrimaryDisplay()
  const displayWidth = primaryDisplay.workAreaSize.width
  const displayHeight = primaryDisplay.workAreaSize.height
  
  let windowWidth = screenWidth
  let windowHeight = screenHeight
  let positionX = 0
  let positionY = 0
  let shouldMaximize = false
  
  if (screenWidth >= displayWidth && screenHeight >= displayHeight) {
    shouldMaximize = true
  } else {
    positionX = Math.floor((displayWidth - screenWidth) / 2)
    positionY = Math.floor((displayHeight - screenHeight) / 2)
  }
  
  // === 构建 Chrome 启动参数 ===
  const debugPort = 9000 + profile.id
  
  // ✅ FIX: Session 恢复逻辑彻底重写
  // 策略：
  // 1. 有 startupUrl → 只打开该 URL，不恢复 session
  // 2. 无 startupUrl → 从数据库读取上次标签页，作为启动参数传入
  //    同时保留 userDataDir 让 Chrome 自行恢复 session 作为兜底
  
  // === Phase 3.5 Rev5: Session 恢复逻辑（过滤广告 + 去重）===
  // 策略：
  // 1. 有 startupUrl → 只打开该 URL，不恢复 session
  // 2. 无 startupUrl → 从数据库读取上次标签页，过滤广告域名 + 去重后作为启动参数传入

  // 广告域名黑名单
  const AD_DOMAINS = [
    'googlesyndication.com',
    'doubleclick.net',
    'googleads.g.doubleclick.net',
    'pagead2.googlesyndication.com',
    'google.com/recaptcha',
    'www.google.com/recaptcha',
    'gstatic.com',
    'google-analytics.com',
    'googletagmanager.com',
    'googleusercontent.com',
    'youtube.com/embed',
    'facebook.com/plugins',
  ]

  function isAdUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase()
      return AD_DOMAINS.some(d => host === d || host.endsWith('.' + d))
    } catch {
      return true
    }
  }
  
  let startupUrls: string[] = []

  if ((profile as any).startupUrl) {
    // 用户手动指定了启动页面，优先使用
    startupUrls = [(profile as any).startupUrl]
    console.log(`[BrowserLauncher] 使用用户指定启动页: ${startupUrls[0]}`)
  } else {
    // 从数据库恢复 Session 标签页
    try {
      const db = getDatabase()
      const tabs = db.prepare(`
        SELECT url FROM profile_session_tabs 
        WHERE profile_id = ? 
          AND url NOT LIKE 'about:%' 
          AND url NOT LIKE 'chrome:%'
          AND url NOT LIKE 'edge:%'
          AND url NOT LIKE 'devtools:%'
          AND url NOT LIKE 'chrome-extension:%'
        ORDER BY sort_order ASC, updated_at DESC
      `).all(profile.id) as { url: string }[]
      
      if (tabs && tabs.length > 0) {
        // 过滤广告域名 + 去重
        const seen = new Set<string>()
        startupUrls = tabs
          .map((t: { url: string }) => t.url)
          .filter(url => {
            if (isAdUrl(url)) return false
            if (seen.has(url)) return false
            seen.add(url)
            return true
          })
        console.log(`[BrowserLauncher] 从数据库恢复 ${startupUrls.length} 个标签页（已过滤广告/去重）: ${JSON.stringify(startupUrls)}`)
      } else {
        console.log(`[BrowserLauncher] 数据库无 Session 记录，将使用默认首页`)
      }
    } catch (err) {
      console.warn(`[BrowserLauncher] 查询 Session 失败: ${err}`)
    }
  }
  
  // 默认首页兜底
  const getDefaultHomepage = (): string => {
    const homepagePath = app.isPackaged
      ? path.join(process.resourcesPath, 'browser', version, 'homepage.html')
      : path.join(process.cwd(), 'resources', 'browser', version, 'homepage.html')
   // return fs.existsSync(homepagePath) ? `file://${homepagePath.replace(/\\/g, '/')}` : 'https://browserleaks.com/webgl'
   // return fs.existsSync(homepagePath) ? `file://${homepagePath.replace(/\\/g, '/')}` : 'https://www.baidu.com'
    return fs.existsSync(homepagePath) ? `file://${homepagePath.replace(/\\/g, '/')}` : 'https://www.google.com'

  }
  
  if (startupUrls.length === 0) {
    startupUrls = [getDefaultHomepage()]
  }
  
  // Phase 3.5 Fix: 强制修改 Chrome Preferences，确保启动时恢复我们的 URLs
  patchChromePreferences(userDataDir, startupUrls)
  
  const args: string[] = [
    `--user-data-dir=${userDataDir}`,
    `--lang=${profile.uiLanguage || 'zh-CN'}`,
    `--user-agent=${userAgent}`,
    `--window-size=${windowWidth},${windowHeight}`,
    `--window-position=${positionX},${positionY}`,
    `--remote-debugging-port=${debugPort}`,
    `--remote-allow-origins=`,
    `--disable-features=IsolateOrigins,site-per-process`,
    `--enable-features=ChromeExtensionsOnChromeURLs`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `--disable-dev-shm-usage`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--disable-gpu-sandbox`
  ]

  // Phase 4.0 Fix: Chrome 128+ 废弃 SwiftShader，低版本保留软件渲染
  const chromeVerNum = parseInt(version) || 128
  if (chromeVerNum < 128) {
    args.push(`--use-angle=swiftshader`)
  }

  if (shouldMaximize) {
    args.push(`--start-maximized`)
  }
  
  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`)
  }
  
  // ✅ FIX: 启动参数传所有 URL，让 Chrome 同时打开多个标签页
  // 注意：不要和 --restore-last-session 混用，否则行为不可预测
  args.push(...startupUrls)

  // === 启动 Chrome 进程 ===
  return new Promise((resolve, reject) => {
    try {
      const chromeProcess = spawn(chromePath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '0'
        }
      })
      
      const pid = chromeProcess.pid ?? -1

      // ✅ Phase 4.0: 启动成功后注册到进程映射表（无论是否通过 API 调用）
      registerChromeProcess(profile.id, pid, userDataDir)

      // ✅ Phase 4.0: 启动成功后导入预置 Cookie（非阻塞，不影响启动）
      if (profile.cookie_json) {
        console.log(`[BrowserLauncher] Profile ${profile.id} 启动成功，导入预置 Cookie，长度=${profile.cookie_json.length}`)
        importPresetCookies(profile.id, profile.cookie_json).then(r => {
          console.log(`[BrowserLauncher] Profile ${profile.id} 预置 Cookie 导入结果: ${r.message}`)
        }).catch(e => {
          console.warn(`[BrowserLauncher] Profile ${profile.id} 预置 Cookie 导入失败: ${e.message}`)
        })
      }

      // ✅ Phase 4.2 关键：启动 CDP 时区覆盖（这是 AdsPower/Puppeteer/Playwright 的标准做法）
      // V8 不读 Windows 的 TZ 环境变量，所以必须通过 CDP Emulation.setTimezoneOverride
      const timezoneToApply = detectedTimezone || (profile as any).timezone
      if (timezoneToApply) {
        installTimezoneOverride(profile.id, timezoneToApply).catch(e => {
          console.warn(`[BrowserLauncher] Profile ${profile.id} CDP 时区覆盖失败: ${e.message}`)
        })
      }

      // ✅ REMOVED: startSessionTabManager 改到 profile.ts 里调用，避免重复启动
      // 原来在这里调用会导致旧进程退出时触发 stop，然后新进程又触发 start
      // 现在统一由 profile.ts 的 launch 成功回调调用一次

      chromeProcess.on('error', (err) => {
        console.error(`[BrowserLauncher] Chrome 进程错误: ${err.message}`)
        reject(err)
      })
      
      chromeProcess.on('exit', async (code, signal) => {
        // Phase 3.5 Rev4: 停止 Session Tab Manager
        await stopSessionTabManager(profile.id)

        // Phase 4.2: 停止 CDP 时区覆盖
        stopTimezoneOverride(profile.id)

        if (localProxyServer) {
          localProxyServer.close()
        }
        try {
          if (fs.existsSync(extensionPath)) {
            fs.rmSync(extensionPath, { recursive: true, force: true })
          }
        } catch (e) {
          console.warn(`[BrowserLauncher] 清理 Extension 目录失败: ${e}`)
        }
      })
      
      chromeProcess.stdout?.on('data', (data) => {
        const log = data.toString().trim()
        if (log) {
           console.log(`[Chrome stdout] ${log}`)
        }
      })
      
      // chromeProcess.stderr?.on('data', (data) => {
      //   const log = data.toString().trim()
      //   if (log && !log.includes('DevTools listening')) {
      //     console.warn(`[Chrome stderr] ${log}`)
      //   }
      // })
      
      resolve({
        pid,
        userDataDir
      })
    } catch (err) {
      console.error(`[BrowserLauncher] 启动失败: ${err}`)
      reject(err)
    }
  })
}

// ==================== 进程映射 ====================

const profileProcessMap = new Map<number, { pid: number; userDataDir: string; startTime: number }>()

export function registerChromeProcess(profileId: number, pid: number, userDataDir: string): void {
  profileProcessMap.set(profileId, { pid, userDataDir, startTime: Date.now() })
}

export function getChromeProcessPid(profileId: number): number {
  return profileProcessMap.get(profileId)?.pid ?? -1
}

// ==================== Phase 4.2: CDP 时区覆盖 ====================

/**
 * 通过 CDP Emulation.setTimezoneOverride 在浏览器进程内强制覆盖时区
 * Windows V8 不读 TZ 环境变量，唯一可靠方案是 CDP（Puppeteer/Playwright/AdsPower 标准做法）
 */
const timezoneOverrideCleanup = new Map<number, () => void>()

export async function installTimezoneOverride(profileId: number, timezone: string): Promise<void> {
  if (!timezone) return

  const debugPort = 9000 + profileId
  const maxWaitMs = 30000
  const startTs = Date.now()

  // 等待 browser-level CDP 就绪
  let browserWsUrl: string | null = null
  while (Date.now() - startTs < maxWaitMs) {
    try {
      const res = await fetch(`http://localhost:${debugPort}/json/version`)
      if (res.ok) {
        const data = await res.json() as any
        if (data?.webSocketDebuggerUrl) {
          browserWsUrl = data.webSocketDebuggerUrl
          break
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500))
  }

  if (!browserWsUrl) {
    console.warn(`[Timezone] Profile ${profileId} CDP browser endpoint 未就绪，时区覆盖失败`)
    return
  }

  const WebSocket = require('ws')
  const ws = new WebSocket(browserWsUrl)
  let cmdId = 0
  const pendingCmds = new Map<number, (resp: any) => void>()
  const sessionTimezoneApplied = new Set<string>()

  function send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++cmdId
      pendingCmds.set(id, resolve)
      const msg: any = { id, method, params }
      if (sessionId) msg.sessionId = sessionId
      ws.send(JSON.stringify(msg), (err: Error | undefined) => {
        if (err) {
          pendingCmds.delete(id)
          reject(err)
        }
      })
      setTimeout(() => {
        if (pendingCmds.has(id)) {
          pendingCmds.delete(id)
          reject(new Error(`CDP ${method} timeout`))
        }
      }, 5000)
    })
  }

  async function applyTimezone(sessionId: string) {
    if (sessionTimezoneApplied.has(sessionId)) return
    try {
      await send('Emulation.setTimezoneOverride', { timezoneId: timezone }, sessionId)
      sessionTimezoneApplied.add(sessionId)
      console.log(`[Timezone] Profile ${profileId} session=${sessionId.slice(0, 8)} 已应用时区: ${timezone}`)
    } catch (e: any) {
      // service_worker / shared_worker 等不支持 Emulation 域，静默忽略
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => { ws.off('error', onError); resolve() }
    const onError = (e: Error) => { ws.off('open', onOpen); reject(e) }
    ws.on('open', onOpen)
    ws.on('error', onError)
    setTimeout(() => reject(new Error('CDP browser connect timeout')), 5000)
  }).catch(err => {
    console.warn(`[Timezone] Profile ${profileId} CDP 连接失败: ${err.message}`)
    throw err
  })

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.id && pendingCmds.has(msg.id)) {
        const handler = pendingCmds.get(msg.id)!
        pendingCmds.delete(msg.id)
        handler(msg)
      }
      if (msg.method === 'Target.attachedToTarget') {
        const sessionId = msg.params?.sessionId
        const targetType = msg.params?.targetInfo?.type
        if (sessionId && (targetType === 'page' || targetType === 'iframe' || targetType === 'webview')) {
          applyTimezone(sessionId)
        }
      }
    } catch {}
  })

  ws.on('close', () => {
    console.log(`[Timezone] Profile ${profileId} CDP 连接关闭`)
  })
  ws.on('error', (e: Error) => {
    console.warn(`[Timezone] Profile ${profileId} CDP 错误: ${e.message}`)
  })

  try {
    await send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    })
    console.log(`[Timezone] Profile ${profileId} CDP auto-attach 已启用，时区: ${timezone}`)
  } catch (e: any) {
    console.warn(`[Timezone] Profile ${profileId} setAutoAttach 失败: ${e.message}`)
  }

  // 兜底：定期对所有 page target 手动 attach + setTimezone
  const refreshTimer = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(refreshTimer)
      return
    }
    try {
      const res = await fetch(`http://localhost:${debugPort}/json`)
      if (!res.ok) return
      const targets = await res.json() as any[]
      for (const t of targets) {
        if (t.type !== 'page' || !t.id) continue
        try {
          const attachResp: any = await send('Target.attachToTarget', {
            targetId: t.id,
            flatten: true
          }).catch(() => null)
          if (attachResp?.result?.sessionId) {
            await applyTimezone(attachResp.result.sessionId)
          }
        } catch {}
      }
    } catch {}
  }, 10000)

  const cleanup = () => {
    clearInterval(refreshTimer)
    try { ws.close() } catch {}
  }
  timezoneOverrideCleanup.set(profileId, cleanup)
}

export function stopTimezoneOverride(profileId: number) {
  const fn = timezoneOverrideCleanup.get(profileId)
  if (fn) {
    try { fn() } catch {}
    timezoneOverrideCleanup.delete(profileId)
  }
}

export function unregisterChromeProcess(profileId: number): void {
  profileProcessMap.delete(profileId)
}

export async function getRunningProfiles(): Promise<number[]> {
  const result: number[] = []
  
  // 遍历所有可能的 profile（通过 debugPort 9000 + profileId）
  // 用 CDP 检测替代 process.kill，避免 pid 无效的问题
  const maxProfileId = 200  // 假设最大 200 个 profile
  
  for (let profileId = 1; profileId <= maxProfileId; profileId++) {
    const debugPort = 9000 + profileId
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1000)
      const res = await fetch(`http://localhost:${debugPort}/json`, {
        signal: controller.signal
      })
      clearTimeout(timeout)
      if (res.ok) {
        result.push(profileId)
      }
    } catch {
      // CDP 连接失败，说明该 profile 未运行
    }
  }
  
  return result
}

export function isProfileRunning(profileId: number): boolean {
  const info = profileProcessMap.get(profileId)
  if (!info) return false
  
  try {
    process.kill(info.pid, 0)
    return true
  } catch {
    profileProcessMap.delete(profileId)
    return false
  }
}

export function closeProfile(profileId: number): boolean {
  const info = profileProcessMap.get(profileId)
  if (!info) {
    return false
  }
  
  try {
    process.kill(info.pid, 'SIGTERM')
    
    setTimeout(() => {
      try {
        process.kill(info.pid, 0)
        process.kill(info.pid, 'SIGKILL')
      } catch {
        // 进程已正常终止
      }
    }, 1000)
    
    profileProcessMap.delete(profileId)
    return true
  } catch (err: any) {
    console.error(`[BrowserLauncher] 关闭窗口失败: ${err.message}`)
    profileProcessMap.delete(profileId)
    return false
  }
}

/**
 * ✅ Phase 4.1: 异步关闭窗口（带 Cookie 快照）
 * 在 SIGTERM 之前先抓一次 Cookie 写回 cookie_json，确保下次启动能回灌
 *
 * 时序：
 *   1. saveProfileCookieJson(silent=true)  - 整体超时 ~6s，失败只 warn
 *   2. closeProfile(profileId)              - 同步路径不变（SIGTERM + 1s 后 SIGKILL）
 */
async function closeProfileWithCookieSnapshot(profileId: number): Promise<boolean> {
  if (!profileProcessMap.has(profileId)) return false

  // 1) 先抓最后一次 Cookie（带 6s 总超时，避免拖延关闭流程）
  try {
    await Promise.race([
      saveProfileCookieJson(profileId, { silent: true }),
      new Promise<number>(resolve => setTimeout(() => {
        console.warn(`[BrowserLauncher] Profile ${profileId} 关闭前 Cookie 快照超时（6s），跳过`)
        resolve(0)
      }, 6000))
    ])
  } catch (e: any) {
    console.warn(`[BrowserLauncher] Profile ${profileId} 关闭前 Cookie 快照异常: ${e.message}`)
  }

  // 2) 真正杀进程
  return closeProfile(profileId)
}

export async function closeChrome(profileId: number): Promise<{ success: boolean; message?: string }> {
  const info = profileProcessMap.get(profileId)
  if (!info) {
    return { success: false, message: '窗口未运行' }
  }

  // ✅ Phase 4.1: 先做 Cookie 快照，再杀进程
  const success = await closeProfileWithCookieSnapshot(profileId)
  return {
    success,
    message: success ? '窗口已关闭' : '关闭窗口失败'
  }
}

// ==================== Phase 4.0: Cookie 预置支持 ====================

/**
 * Phase 4.0: 获取 Profile 的 CDP Debug Port
 * 规则：debugPort = 9000 + profileId
 */
export function getProfileDebugPort(profileId: number): number {
  return 9000 + profileId
}

interface CDPTarget {
  id: string
  title: string
  type: string
  webSocketDebuggerUrl: string
}

/**
 * 获取 Chrome 第一个 page target 的 WebSocket URL
 */
function getPageWsUrl(debugPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${debugPort}/json`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const targets: CDPTarget[] = JSON.parse(data)
          const page = targets.find(t => t.type === 'page')
          if (page?.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl)
          } else {
            reject(new Error('未找到可用的 page target'))
          }
        } catch (e: any) {
          reject(new Error('解析 CDP /json 失败: ' + e.message))
        }
      })
    }).on('error', reject)
  })
}

/**
 * Phase 4.0 Fix: 轮询等待 CDP page target 就绪
 */
async function waitForPageWsUrl(debugPort: number, maxWaitMs: number = 30000): Promise<string> {
  const start = Date.now()
  const interval = 1000
  while (Date.now() - start < maxWaitMs) {
    try {
      const url = await getPageWsUrl(debugPort)
      return url
    } catch {
      await new Promise(r => setTimeout(r, interval))
    }
  }
  throw new Error(`等待 CDP 就绪超时（${maxWaitMs}ms）`)
}

/**
 * Phase 4.0: 通过 CDP 导入预置 Cookie
 * 在 Chrome 启动后调用，将 profiles.cookie_json 写入浏览器
 */
export async function importPresetCookies(profileId: number, cookieJson: string): Promise<{ success: boolean; message: string }> {
  if (!cookieJson || !cookieJson.trim()) {
    return { success: true, message: '无预置 Cookie，跳过' }
  }

  const debugPort = getProfileDebugPort(profileId)

  try {
    const cookies = JSON.parse(cookieJson) as any[]
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { success: true, message: 'Cookie 数组为空，跳过' }
    }

    // 整体重试：最多2次（首次 + 1次重试），确保 CDP 就绪后再导入
    let lastError: any = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await doImportPresetCookies(debugPort, cookies)
        return result
      } catch (e: any) {
        lastError = e
        console.warn(`[importPresetCookies] Profile ${profileId} 尝试 ${attempt + 1} 失败: ${e.message}`)
        if (attempt < 1) {
          console.log(`[importPresetCookies] 等待 3 秒后重试...`)
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }
    throw lastError
  } catch (err: any) {
    console.error('[importPresetCookies] 导入预置 Cookie 失败:', err)
    return { success: false, message: err.message || '导入失败' }
  }
}

async function doImportPresetCookies(debugPort: number, cookies: any[]): Promise<{ success: boolean; message: string }> {
  const wsUrl = await waitForPageWsUrl(debugPort, 30000)
  console.log(`[importPresetCookies] CDP page wsUrl=${wsUrl}`)

  const ws = new (require('ws'))(wsUrl)
  
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
    const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
    ws.on('open', onOpen)
    ws.on('error', onError)
    setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时')) }, 5000)
  })

  // Phase 4.0 Fix: 启用 Network Domain，确保 setCookie 正常工作
  await new Promise<void>((resolve, reject) => {
    const id = 0
    const timeout = setTimeout(() => reject(new Error('Network.enable 超时')), 5000)
    const handler = (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const resp = JSON.parse(data.toString())
        if (resp.id === id) {
          clearTimeout(timeout)
          ws.off('message', handler)
          resolve()
        }
      } catch {}
    }
    ws.on('message', handler)
    ws.send(JSON.stringify({ id, method: 'Network.enable', params: {} }))
  })

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i]
    try {
      await new Promise<void>((resolve, reject) => {
        const id = i + 1
        const timeout = setTimeout(() => reject(new Error(`命令 ${id} 超时`)), 5000)
        const handler = (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const resp = JSON.parse(data.toString())
            if (resp.id === id) {
              clearTimeout(timeout)
              ws.off('message', handler)
              if (resp.error) reject(new Error(resp.error.message))
              else resolve()
            }
          } catch {}
        }
        ws.on('message', handler)
        ws.send(JSON.stringify({
          id,
          method: 'Network.setCookie',
          params: {
            name: c.name || '',
            value: c.value || '',
            domain: c.domain || '',
            path: c.path || '/',
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            sameSite: c.sameSite || 'unspecified',
            expires: c.expires ?? -1
          }
        }))
      })
      successCount++
    } catch (e: any) {
      failCount++
      console.warn(`[importPresetCookies] Cookie 导入失败: ${c.name}`, e.message)
    }
  }

  ws.close()
  return {
    success: failCount === 0,
    message: `导入完成：成功 ${successCount}，失败 ${failCount}`
  }
}
