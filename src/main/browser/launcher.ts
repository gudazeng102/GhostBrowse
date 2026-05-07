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

// ==================== Phase 3.5 Rev2: Session Tab Manager（Electron 主进程集中心跳）====================

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
  debugPort: number
}>()

/**
 * 通过 HTTP POST /api/v1/profiles/:id/session-tabs/bulk 同步标签页到后端
 */
async function syncSessionTabs(profileId: number) {
  const manager = profileTabManagers.get(profileId)
  if (!manager) return

  try {
    const body = JSON.stringify({ tabs: manager.tabs })
    const res = await fetch(`http://localhost:3000/api/v1/profiles/${profileId}/session-tabs/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })
    if (res.ok) {
      console.log(`[SessionManager] Profile ${profileId} 同步 ${manager.tabs.length} 个标签页`)
    }
  } catch (err) {
    console.warn(`[SessionManager] Profile ${profileId} 同步失败: ${err}`)
  }
}

/**
 * 启动某 profile 的 Session Tab Manager
 * 监听 CDP 事件并每 5 秒同步
 */
export function startSessionTabManager(profileId: number, debugPort: number) {
  if (profileTabManagers.has(profileId)) {
    stopSessionTabManager(profileId)
  }

  const manager = {
    tabs: [] as TabInfo[],
    syncTimer: null as NodeJS.Timeout | null,
    pollTimer: null as NodeJS.Timeout | null,
    debugPort
  }
  profileTabManagers.set(profileId, manager)

  // 每 5 秒同步一次到后端
  manager.syncTimer = setInterval(() => {
    syncSessionTabs(profileId)
  }, 5000)

  // 通过 CDP 监听标签页变化
  // Chrome DevTools Protocol over HTTP
  const cdpUrl = `http://localhost:${debugPort}/json`

  async function fetchCDPTabs() {
    try {
      const res = await fetch(cdpUrl)
      if (!res.ok) return []
      return await res.json() as any[]
    } catch {
      return []
    }
  }

  // 轮询方式监听标签页（每 2 秒检查一次）
  const pollTimer = setInterval(async () => {
    const pages = await fetchCDPTabs()
    if (pages.length > 0) {
      const now = Date.now()
      // 取所有页面中 active 状态最新的作为 active
      const activePage = pages.find((p: any) => p.active) || pages[0]
      manager.tabs = pages.map((p: any, idx: number) => ({
        url: p.url || p.url,
        title: p.title || null,
        active: p.id === activePage?.id ? 1 : 0,
        updatedAt: now
      }))
     // console.log(`[SessionManager] Profile ${profileId} 更新标签页: ${manager.tabs.length} 个`)
      console.log(`[SessionManager] Profile ${profileId} 更新标签页: ${manager.tabs.length} 个`)

    }
  }, 2000)

  // 清理时同时清理轮询
  const originalStop = () => {
    clearInterval(pollTimer)
    if (manager.syncTimer) {
      clearInterval(manager.syncTimer)
      manager.syncTimer = null
    }
    // 窗口关闭前同步一次
    syncSessionTabs(profileId)
  }

  console.log(`[SessionManager] Profile ${profileId} Session Tab Manager 已启动，debugPort=${debugPort}`)
}

/**
 * 停止某 profile 的 Session Tab Manager
 */
export function stopSessionTabManager(profileId: number) {
  const manager = profileTabManagers.get(profileId)
  if (!manager) return

  if (manager.pollTimer) {
    clearInterval(manager.pollTimer)
  }
  if (manager.syncTimer) {
    clearInterval(manager.syncTimer)
  }
  // 最后同步一次
  syncSessionTabs(profileId)
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

// ==================== Extension 动态生成 ====================

function generateExtension(profile: Profile, proxy: Proxy | null): string {
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
  
  // Phase 3.2: 追加指纹噪声种子字段到 config
  const config = {
    profile_id: profile.id,
    canvas_mode: profile.canvasMode || 'noise',
    webgl_mode: profile.webglMode || 'mock',
    webrtc_mode: profile.webrtcMode || 'replace',
    timezone_mode: profile.timezoneMode || 'ip',
    geolocation_mode: profile.geolocationMode || 'ip',
    media_device_mode: profile.mediaDeviceMode || 'mock',
    screen_resolution: profile.screenResolution || '1920x1080',
    ui_language: profile.uiLanguage || 'zh-CN',
    timezone: 'Asia/Shanghai',
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

  // const version = profile.chromeVersion || '128'





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


  // === 生成指纹注入 Extension ===
  const extensionPath = generateExtension(profile, proxy)
  
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
  // 默认使用本地 homepage.html（显示 img 目录下的 webp 图片）
  const getDefaultHomepage = (): string => {
    const homepagePath = app.isPackaged
      ? path.join(process.resourcesPath, 'browser', version, 'homepage.html')
      : path.join(process.cwd(), 'resources', 'browser', version, 'homepage.html')
    return fs.existsSync(homepagePath) ? `file://${homepagePath.replace(/\\/g, '/')}` : ' https://browserleaks.com/webgl'//'https://www.google.com'
  }
  
  // Phase 3.5: Session 标签页持久化恢复逻辑
  // 优先级：startup_url > Session 恢复 > 默认 homepage
  let startupUrls: string[] = []
  
  if ((profile as any).startupUrl) {
    // Phase 2.1: 用户手动指定了启动页面，优先使用（保持原有逻辑）
    startupUrls = [(profile as any).startupUrl]

  } else {
    // Phase 3.5: 无 startup_url，尝试从数据库恢复 Session 标签页
    try {
      const db = getDatabase()
      // 查询该 profile 的所有标签页，按 sort_order 排序
      const tabs = db.prepare(`
        SELECT url FROM profile_session_tabs 
        WHERE profile_id = ? 
        ORDER BY sort_order ASC, updated_at DESC
      `).all(profile.id) as { url: string }[]
      
      if (tabs && tabs.length > 0) {
        startupUrls = tabs.map((t: { url: string }) => t.url)

      } else {

        startupUrls = [getDefaultHomepage()]
      }
    } catch (err) {
      console.warn(`[BrowserLauncher] 查询 Session 失败: ${err}，使用默认首页`)
      startupUrls = [getDefaultHomepage()]
    }
  }
  
  const args: string[] = [
    `--user-data-dir=${userDataDir}`,
    `--lang=${profile.uiLanguage || 'zh-CN'}`,
    `--user-agent=${userAgent}`,
    `--window-size=${windowWidth},${windowHeight}`,
    `--window-position=${positionX},${positionY}`,
      `--remote-debugging-port=${9000 + profile.id}`,
      // Phase 3.1: 已删除 --test-type（防止显示"自动化测试控制"提示条）
    `--disable-features=IsolateOrigins,site-per-process`,
    `--enable-features=ChromeExtensionsOnChromeURLs`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `--disable-dev-shm-usage`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
      `--use-angle=swiftshader`,        // 强制 CPU 渲染
  `--disable-gpu-sandbox`,           // 配合 SwiftShader 必需
    ...startupUrls
  ]
  
  if (shouldMaximize) {
    args.push(`--start-maximized`)
  }
  
  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`)
  }
  


  
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

      
      chromeProcess.on('error', (err) => {
        console.error(`[BrowserLauncher] Chrome 进程错误: ${err.message}`)
        reject(err)
      })
      
      chromeProcess.on('exit', (code, signal) => {
        // Phase 3.5 Rev2: 停止 Session Tab Manager
        stopSessionTabManager(profile.id)

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

        }
      })
      
      chromeProcess.stderr?.on('data', (data) => {
        const log = data.toString().trim()
        if (log && !log.includes('DevTools listening')) {
          console.warn(`[Chrome stderr] ${log}`)
        }
      })
      
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

export function unregisterChromeProcess(profileId: number): void {
  profileProcessMap.delete(profileId)

}

export function getRunningProfiles(): number[] {
  const result: number[] = []
  
  for (const [profileId, info] of profileProcessMap.entries()) {
    try {
      process.kill(info.pid, 0)
      result.push(profileId)
    } catch {

      profileProcessMap.delete(profileId)
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

export async function closeChrome(profileId: number): Promise<{ success: boolean; message?: string }> {
  const info = profileProcessMap.get(profileId)
  if (!info) {
    return { success: false, message: '窗口未运行' }
  }
  
  const success = closeProfile(profileId)
  return {
    success,
    message: success ? '窗口已关闭' : '关闭窗口失败'
  }
}