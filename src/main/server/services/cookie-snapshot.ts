/**
 * Cookie 快照服务（Phase 4.1）
 *
 * 职责：把运行中浏览器的实时 Cookie 通过 CDP 抓取下来，
 *      映射成 AdsPower 兼容的 JSON 格式，写回 profiles.cookie_json 字段。
 *
 * 触发时机（由调用方决定）：
 *   1. closeProfile() 关闭浏览器进程之前
 *   2. startSessionTabManager() 定时器（30 秒一次）
 *   3. 前端"💾 保存到本窗口配置"按钮（POST /cookie-manager/:id/save-to-profile）
 *
 * 设计原则：
 *   - 全程容错：失败只 console.warn，绝不抛异常影响调用方
 *   - 整体超时 8s（CDP 连接 5s + getAllCookies 时间）
 *   - 与现有 importPresetCookies 的字段约定保持一致，确保下次启动可直接回灌
 */

import WebSocket from 'ws'
import http from 'http'
import { getDatabase } from '../db'
import { getProfileDebugPort, isProfileRunning } from '../../browser/launcher'

// ==================== 类型定义 ====================

/**
 * CDP Network.Cookie 返回对象
 * 参考：https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-Cookie
 */
interface CDPCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number          // 秒级时间戳，session cookie 为 -1
  size?: number
  httpOnly: boolean
  secure: boolean
  session: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  priority?: 'Low' | 'Medium' | 'High'
  sameParty?: boolean
  sourceScheme?: string
  sourcePort?: number
  partitionKey?: { topLevelSite?: string; hasCrossSiteAncestor?: boolean } | string
  partitionKeyOpaque?: boolean
}

/**
 * AdsPower 兼容的 Cookie 输出格式（与你给的样例对齐）
 */
interface AdsPowerCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  session: boolean
  expires: number
  sameSite: 'strict' | 'lax' | 'no_restriction' | 'unspecified'
  CookiePartitionKey?: string
}

interface CDPTarget {
  id: string
  title: string
  type: string
  webSocketDebuggerUrl: string
}

// ==================== CDP 工具函数 ====================

/**
 * 获取 Chrome 第一个 page target 的 WebSocket URL
 */
function getPageWsUrl(debugPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${debugPort}/json`, (res) => {
      let data = ''
      res.on('data', chunk => (data += chunk))
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
    })
    req.on('error', reject)
    req.setTimeout(3000, () => {
      req.destroy()
      reject(new Error('CDP /json 请求超时'))
    })
  })
}

/**
 * 等待 WebSocket open
 */
function waitWsOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      ws.off('open', onOpen)
      ws.off('error', onError)
      resolve()
    }
    const onError = (e: Error) => {
      ws.off('open', onOpen)
      ws.off('error', onError)
      reject(e)
    }
    ws.on('open', onOpen)
    ws.on('error', onError)
    setTimeout(() => {
      ws.off('open', onOpen)
      ws.off('error', onError)
      reject(new Error(`CDP 连接超时（${timeoutMs}ms）`))
    }, timeoutMs)
  })
}

/**
 * 发送一条 CDP 命令并等待返回
 */
function sendCDPCommand(ws: WebSocket, id: number, method: string, params: object = {}, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler)
      reject(new Error(`CDP 命令 ${method} 超时`))
    }, timeoutMs)
    const handler = (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id === id) {
          clearTimeout(timer)
          ws.off('message', handler)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
      } catch {
        /* ignore */
      }
    }
    ws.on('message', handler)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

// ==================== 字段映射 ====================

/**
 * CDP sameSite → AdsPower sameSite
 */
function mapSameSite(s: CDPCookie['sameSite']): AdsPowerCookie['sameSite'] {
  switch (s) {
    case 'Strict': return 'strict'
    case 'Lax':    return 'lax'
    case 'None':   return 'no_restriction'
    default:       return 'unspecified'
  }
}

/**
 * CDP partitionKey → AdsPower CookiePartitionKey 字符串
 * CDP 新版本是对象 { topLevelSite, hasCrossSiteAncestor }，老版本是字符串
 */
function extractPartitionKey(pk: CDPCookie['partitionKey']): string | undefined {
  if (!pk) return undefined
  if (typeof pk === 'string') return pk
  if (typeof pk === 'object' && pk.topLevelSite) return pk.topLevelSite
  return undefined
}

/**
 * 把 CDP 返回的 Cookie 数组映射为 AdsPower 格式
 *
 * 关键决策：
 *   - session cookie（expires === -1）：session=true，expires 填一个统一的"now + 365 天"占位值
 *     这与 AdsPower 导出行为一致（你给的样例里全是同一个 expires=1810832529）
 *   - 持久 cookie：session=false，expires=Math.floor(原值)
 *   - 丢弃 size/priority/sourceScheme/sourcePort 等无关字段
 */
function mapCookies(cdpCookies: CDPCookie[]): AdsPowerCookie[] {
  // 统一的 session cookie 占位过期时间：当前时间 + 365 天（秒级）
  const sessionExpiresFallback = Math.floor(Date.now() / 1000) + 365 * 24 * 3600

  return cdpCookies.map(c => {
    const isSession = c.session === true || c.expires === -1 || c.expires === undefined
    const out: AdsPowerCookie = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      session: isSession,
      expires: isSession ? sessionExpiresFallback : Math.floor(c.expires),
      sameSite: mapSameSite(c.sameSite)
    }
    const pk = extractPartitionKey(c.partitionKey)
    if (pk) out.CookiePartitionKey = pk
    return out
  })
}

// ==================== 主入口 ====================

/**
 * 把 profileId 对应窗口的实时 Cookie 抓取并保存到 profiles.cookie_json
 *
 * @param profileId Profile 主键
 * @param options.silent  true 表示静默失败（关闭流程/定时器调用），false 表示让调用方拿到 throw（手动接口调用）
 * @returns 抓到并写入的 cookie 数量；失败时返回 0
 */
export async function saveProfileCookieJson(
  profileId: number,
  options: { silent?: boolean } = {}
): Promise<number> {
  const silent = options.silent !== false  // 默认 true

  // 前置校验：窗口必须在跑
  if (!isProfileRunning(profileId)) {
    const msg = `[CookieSnapshot] Profile ${profileId} 未运行，跳过快照`
    if (silent) {
      console.warn(msg)
      return 0
    }
    throw new Error('窗口未运行')
  }

  let ws: WebSocket | null = null
  try {
    const debugPort = getProfileDebugPort(profileId)
    const wsUrl = await getPageWsUrl(debugPort)
    ws = new WebSocket(wsUrl)
    await waitWsOpen(ws, 5000)

    // 抓全量 cookie
    const result = await sendCDPCommand(ws, 1, 'Network.getAllCookies', {}, 5000)
    const cdpCookies: CDPCookie[] = result?.cookies || []

    // 映射成 AdsPower 格式
    const adsPowerCookies = mapCookies(cdpCookies)
    const json = JSON.stringify(adsPowerCookies)

    // 写库
    const db = getDatabase()
    const stmt = db.prepare('UPDATE profiles SET cookie_json = ?, updated_at = ? WHERE id = ?')
    stmt.run(json, Date.now(), profileId)

    console.log(`[CookieSnapshot] Profile ${profileId} 已保存 ${adsPowerCookies.length} 条 Cookie 到 cookie_json`)
    return adsPowerCookies.length
  } catch (e: any) {
    const msg = `[CookieSnapshot] Profile ${profileId} 保存 Cookie 失败: ${e.message}`
    if (silent) {
      console.warn(msg)
      return 0
    }
    throw e
  } finally {
    try { ws?.close() } catch { /* ignore */ }
  }
}