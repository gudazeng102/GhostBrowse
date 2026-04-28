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
import * as http from 'http'
import * as net from 'net'
import * as tls from 'tls'

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

// ==================== 本地代理转发器（解决 HTTPS over TLS 代理）====================

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
  console.log(`[LocalProxy] 启动: http://127.0.0.1:${localPort} -> ${proxy.host}:${proxy.port}`)
  
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

// ==================== Chrome 路径查找 ====================

function findChromePath(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
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
    proxy_ip: proxy?.host || null
  }
  
  contentScript = contentScript.replace('{{CONFIG}}', JSON.stringify(config))
  fs.writeFileSync(path.join(tempDir, 'content-script.js'), contentScript)
  
  console.log(`[BrowserLauncher] Extension 生成到: ${tempDir}`)
  
  return tempDir
}

// ==================== 主启动函数 ====================

export async function launchChrome(
  profile: Profile,
  proxy: Proxy | null
): Promise<LaunchResult> {
  console.log('[BrowserLauncher] 开始启动 Chrome...')
  console.log(`[BrowserLauncher] 窗口: ${profile.title} (ID: ${profile.id})`)
  
  const chromePath = findChromePath()
  if (!chromePath) {
    throw new Error('未找到 Chrome 浏览器，请安装 Google Chrome 或 Microsoft Edge')
  }
  
  const userDataDir = path.join(
    app.isPackaged ? app.getPath('userData') : process.cwd(),
    'profiles',
    String(profile.id)
  )
  
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }
  console.log(`[BrowserLauncher] 用户数据目录: ${userDataDir}`)
  
  const extensionPath = generateExtension(profile, proxy)
  
  // 4. 构建代理参数（检测是否需要本地转发）
  let proxyServer = ''
  let localProxyServer: http.Server | null = null
  
  if (proxy) {
    // 检测是否需要 TLS 转发（端口 443 或类型为 https）
    const needsTlsForward = proxy.port === 443 || proxy.type === 'https'
    
    if (needsTlsForward) {
      // 创建本地 HTTP 转发代理
      const localProxy = createLocalProxy(proxy)
      localProxyServer = localProxy.server
      proxyServer = localProxy.url
      console.log(`[BrowserLauncher] 使用本地转发: ${proxyServer}`)
    } else {
      // 明文代理，直接连接
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
    `--disable-blink-features=AutomationControlled`,
    `--disable-features=IsolateOrigins,site-per-process`,
    `--enable-features=ChromeExtensionsOnChromeURLs`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `--no-sandbox`,
    `--disable-dev-shm-usage`,
    `--load-extension=${extensionPath}`,
    `ip.sb`
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
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '0'
        }
      })
      
      const pid = chromeProcess.pid ?? -1
      console.log(`[BrowserLauncher] Chrome 进程已启动，PID: ${pid}`)
      
      chromeProcess.on('error', (err) => {
        console.error(`[BrowserLauncher] Chrome 进程错误: ${err.message}`)
        reject(err)
      })
      
      chromeProcess.on('exit', (code, signal) => {
        console.log(`[BrowserLauncher] Chrome 进程退出，code: ${code}, signal: ${signal}`)
        // 关闭本地代理
        if (localProxyServer) {
          localProxyServer.close()
          console.log('[LocalProxy] 已关闭')
        }
        // 清理临时 Extension 目录
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
  console.log(`[BrowserLauncher] 注册进程: Profile ${profileId} -> PID ${pid}`)
}

export function getChromeProcessPid(profileId: number): number {
  return profileProcessMap.get(profileId)?.pid ?? -1
}

export function unregisterChromeProcess(profileId: number): void {
  profileProcessMap.delete(profileId)
  console.log(`[BrowserLauncher] 注销进程: Profile ${profileId}`)
}

export function getRunningProfiles(): number[] {
  const result: number[] = []
  
  for (const [profileId, info] of profileProcessMap.entries()) {
    try {
      process.kill(info.pid, 0)
      result.push(profileId)
    } catch {
      console.log(`[BrowserLauncher] 进程已死亡，自动清理: Profile ${profileId} -> PID ${info.pid}`)
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
    console.log(`[BrowserLauncher] 关闭窗口失败: Profile ${profileId} 未运行`)
    return false
  }
  
  console.log(`[BrowserLauncher] 关闭窗口: Profile ${profileId} -> PID ${info.pid}`)
  
  try {
    process.kill(info.pid, 'SIGTERM')
    
    setTimeout(() => {
      try {
        process.kill(info.pid, 0)
        console.log(`[BrowserLauncher] SIGTERM 失败，使用 SIGKILL: PID ${info.pid}`)
        process.kill(info.pid, 'SIGKILL')
      } catch {
        // 进程已正常终止
      }
    }, 1000)
    
    profileProcessMap.delete(profileId)
    console.log(`[BrowserLauncher] 关闭窗口成功: Profile ${profileId}`)
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
