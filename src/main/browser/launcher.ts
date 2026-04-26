/**
 * Chrome 浏览器启动模块
 * Phase 1.3: 实现带有指纹注入的 Chrome 启动逻辑
 * 
 * 职责：
 * - 根据 Profile 配置启动带有指纹的 Chrome 浏览器
 * - 动态生成指纹注入 Extension
 * - 管理浏览器进程
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'

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
  '124': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  '128': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  '130': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  '132': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  '134': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
}

/** Chrome Extension 模板目录 */
const EXTENSION_TEMPLATE_DIR = path.join(__dirname, 'extension')

// ==================== Chrome 路径查找 ====================

/**
 * 查找系统 Chrome 路径
 * 优先查找 Chrome，其次 Edge
 */
function findChromePath(): string | null {
  const candidates = [
    // Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Edge
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Chromium
    path.join(os.homedir(), 'AppData', 'Local', 'Chromium', 'Application', 'chrome.exe'),
  ]
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[BrowserLauncher] 找到浏览器: ${candidate}`)
      return candidate
    }
  }
  
  return null
}

// ==================== Extension 动态生成 ====================

/**
 * 动态生成指纹注入 Extension 到临时目录
 * 
 * @param profile Profile 配置
 * @param proxy Proxy 配置（可选）
 * @returns 临时 Extension 目录路径
 */
function generateExtension(profile: Profile, proxy: Proxy | null): string {
  // 临时目录路径
  const tempDir = path.join(os.tmpdir(), `ghostbrowse-ext-${profile.id}`)
  
  // 如果目录已存在，先删除
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  
  // 创建目录
  fs.mkdirSync(tempDir, { recursive: true })
  
  // 读取 manifest 模板
  const manifestPath = path.join(EXTENSION_TEMPLATE_DIR, 'manifest.json')
  let manifestContent = fs.readFileSync(manifestPath, 'utf-8')
  fs.writeFileSync(path.join(tempDir, 'manifest.json'), manifestContent)
  
  // 读取 content-script 模板并替换配置
  const contentScriptPath = path.join(EXTENSION_TEMPLATE_DIR, 'content-script.js')
  let contentScript = fs.readFileSync(contentScriptPath, 'utf-8')
  
  // 构建配置对象
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
    // 后续根据代理 IP 查时区，Phase 1.3 简化使用固定值
    timezone: 'Asia/Shanghai',
    latitude: 39.9042,
    longitude: 116.4074,
    // WebRTC 替换模式使用的 IP
    proxy_ip: proxy?.host || null
  }
  
  // 替换 {{CONFIG}} 占位符
  contentScript = contentScript.replace('{{CONFIG}}', JSON.stringify(config))
  
  // 写入 content-script.js
  fs.writeFileSync(path.join(tempDir, 'content-script.js'), contentScript)
  
  console.log(`[BrowserLauncher] Extension 生成到: ${tempDir}`)
  
  return tempDir
}

// ==================== 主启动函数 ====================

/**
 * 启动 Chrome 浏览器
 * 
 * @param profile Profile 配置
 * @param proxy Proxy 配置（可选）
 * @returns 启动结果，包含 PID 和用户数据目录
 */
export async function launchChrome(
  profile: Profile,
  proxy: Proxy | null
): Promise<LaunchResult> {
  console.log('[BrowserLauncher] 开始启动 Chrome...')
  console.log(`[BrowserLauncher] 窗口: ${profile.title} (ID: ${profile.id})`)
  
  // 1. 查找 Chrome 路径
  const chromePath = findChromePath()
  if (!chromePath) {
    throw new Error('未找到 Chrome 浏览器，请安装 Google Chrome 或 Microsoft Edge')
  }
  
  // 2. 构建用户数据目录（每个窗口独立）
  const userDataDir = path.join(
    app.isPackaged ? app.getPath('userData') : process.cwd(),
    'profiles',
    String(profile.id)
  )
  
  // 确保目录存在
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }
  console.log(`[BrowserLauncher] 用户数据目录: ${userDataDir}`)
  
  // 3. 生成指纹注入 Extension
  const extensionPath = generateExtension(profile, proxy)
  
  // 4. 构建代理参数字符串
  let proxyServer = ''
  if (proxy) {
    if (proxy.type === 'socks5') {
      // SOCKS5 代理
      if (proxy.username && proxy.password) {
        proxyServer = `socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      } else {
        proxyServer = `socks5://${proxy.host}:${proxy.port}`
      }
    } else {
      // HTTP/HTTPS 代理
      if (proxy.username && proxy.password) {
        proxyServer = `${proxy.type}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
      } else {
        proxyServer = `${proxy.type}://${proxy.host}:${proxy.port}`
      }
    }
  }
  
  // 5. 获取 User-Agent
  const userAgent = CHROME_USER_AGENTS[profile.chromeVersion] || CHROME_USER_AGENTS['128']
  
  // 6. 解析分辨率
  const resolution = profile.screenResolution || '1920x1080'
  const [screenWidth, screenHeight] = resolution.split('x').map(Number)
  
  // 7. 构建 Chrome 启动参数
  const args: string[] = [
    `--user-data-dir=${userDataDir}`,
    `--lang=${profile.uiLanguage || 'zh-CN'}`,
    `--user-agent=${userAgent}`,
    `--window-size=${screenWidth},${screenHeight}`,
    // 禁用自动化特征
    `--disable-blink-features=AutomationControlled`,
    // 禁用同源隔离（允许 Extension 正常工作）
    `--disable-features=IsolateOrigins,site-per-process`,
    // 指纹保护相关
    `--enable-features=ChromeExtensionsOnChromeURLs`,
    // 基本启动参数
    `--no-first-run`,
    `--no-default-browser-check`,
    `--no-sandbox`,  // Electron 环境下需要
    `--disable-dev-shm-usage`,  // 避免共享内存问题
    // 加载指纹注入 Extension
    `--load-extension=${extensionPath}`,
    // 启动页面
    `about:blank`
  ]
  
  // 如果有代理，添加代理参数
  if (proxyServer) {
    args.push(`--proxy-server=${proxyServer}`)
  }
  
  console.log(`[BrowserLauncher] Chrome 路径: ${chromePath}`)
  console.log(`[BrowserLauncher] 启动参数: ${args.join(' ')}`)
  
  // 8. 启动 Chrome 进程
  return new Promise((resolve, reject) => {
    try {
      const chromeProcess = spawn(chromePath, args, {
        detached: false,  // Electron 退出时跟随关闭
        stdio: ['ignore', 'pipe', 'pipe'],  // 忽略 stdin，捕获 stdout/stderr
        env: {
          ...process.env,
          // 确保 Electron 环境变量存在
          ELECTRON_RUN_AS_NODE: '0'
        }
      })
      
      // 记录 PID
      const pid = chromeProcess.pid ?? -1
      console.log(`[BrowserLauncher] Chrome 进程已启动，PID: ${pid}`)
      
      // 监听进程错误
      chromeProcess.on('error', (err) => {
        console.error(`[BrowserLauncher] Chrome 进程错误: ${err.message}`)
        reject(err)
      })
      
      // 监听进程退出
      chromeProcess.on('exit', (code, signal) => {
        console.log(`[BrowserLauncher] Chrome 进程退出，code: ${code}, signal: ${signal}`)
        // 清理临时 Extension 目录
        try {
          if (fs.existsSync(extensionPath)) {
            fs.rmSync(extensionPath, { recursive: true, force: true })
          }
        } catch (e) {
          console.warn(`[BrowserLauncher] 清理 Extension 目录失败: ${e}`)
        }
      })
      
      // 处理输出日志（可选，便于调试）
      chromeProcess.stdout?.on('data', (data) => {
        const log = data.toString().trim()
        if (log) {
          console.log(`[Chrome stdout] ${log}`)
        }
      })
      
      chromeProcess.stderr?.on('data', (data) => {
        const log = data.toString().trim()
        if (log && !log.includes('DevTools listening')) {
          console.warn(`[Chrome stderr] ${log}`)
        }
      })
      
      // 返回成功结果
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

/**
 * 关闭指定 Profile 的 Chrome 窗口
 * 
 * Phase 1.4 实现：维护进程映射表，支持关闭窗口
 */
export async function closeChrome(profileId: number): Promise<void> {
  console.log(`[BrowserLauncher] 关闭窗口 (Profile ID: ${profileId})`)
  // TODO: Phase 1.4 实现
  // 1. 从进程映射表查找 PID
  // 2. 发送关闭信号或强制终止
}

// ==================== 进程映射（Phase 1.4 使用） ====================

/** Profile ID -> Chrome 进程 PID 映射 */
const profileProcessMap = new Map<number, number>()

/**
 * 注册 Chrome 进程
 */
export function registerChromeProcess(profileId: number, pid: number): void {
  profileProcessMap.set(profileId, pid)
  console.log(`[BrowserLauncher] 注册进程: Profile ${profileId} -> PID ${pid}`)
}

/**
 * 获取 Chrome 进程 PID
 */
export function getChromeProcessPid(profileId: number): number {
  return profileProcessMap.get(profileId) ?? -1
}

/**
 * 注销 Chrome 进程
 */
export function unregisterChromeProcess(profileId: number): void {
  profileProcessMap.delete(profileId)
  console.log(`[BrowserLauncher] 注销进程: Profile ${profileId}`)
}
