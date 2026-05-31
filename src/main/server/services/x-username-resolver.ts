/**
 * X 当前登录用户名解析器
 *
 * 目标：按 Profile 独立识别该浏览器窗口当前真实登录的 X handle。
 *
 * 原则：
 * - 不硬编码 username
 * - 不使用 profileName 充当 username
 * - 优先从该 Profile 自己的页面/CDP 状态读取
 * - 置信度不足返回空字符串
 * - 返回值不带 @，前端统一负责展示 @username
 */

import http from 'http'
import WebSocket from 'ws'
import { Logger } from '../../../shared/utils/logger'

const logger = new Logger('XUsernameResolver')

const USERNAME_CACHE_TTL = 5 * 60 * 1000
const NEGATIVE_CACHE_TTL = 30 * 1000
const USER_BY_REST_ID_QID = 'IGgvgiOx4QZndDHuD3x9TQ'

interface UsernameCacheEntry {
  username: string
  ts: number
  negative?: boolean
}

interface CdpTarget {
  type: string
  url?: string
  title?: string
  webSocketDebuggerUrl?: string
}

interface UsernameCandidate {
  username: string
  score: number
  source: string
  count?: number
}

interface CookieLike {
  name: string
  value: string
  domain?: string
}

const usernameCache = new Map<number, UsernameCacheEntry>()

function normalizeUsername(raw: string): string {
  const value = String(raw || '').trim().replace(/^@+/, '')
  if (!/^[A-Za-z0-9_]{1,15}$/.test(value)) return ''
  const lower = value.toLowerCase()
  const reserved = new Set([
    'home',
    'explore',
    'notifications',
    'messages',
    'i',
    'settings',
    'compose',
    'search',
    'login',
    'logout',
    'intent',
    'hashtag',
    'privacy',
    'tos',
    'download',
    'jobs',
    'about',
    'help'
  ])
  if (reserved.has(lower)) return ''
  return value
}

function getCached(profileId: number): string | null {
  const hit = usernameCache.get(profileId)
  if (!hit) return null
  const ttl = hit.negative ? NEGATIVE_CACHE_TTL : USERNAME_CACHE_TTL
  if (Date.now() - hit.ts > ttl) {
    usernameCache.delete(profileId)
    return null
  }
  return hit.username
}

function setCached(profileId: number, username: string): void {
  usernameCache.set(profileId, {
    username,
    ts: Date.now(),
    negative: !username
  })
}

function httpGetJson<T = any>(url: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('CDP target JSON 解析失败'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeout, () => {
      req.destroy()
      reject(new Error('CDP target 请求超时'))
    })
  })
}

async function getTargets(profileId: number): Promise<CdpTarget[]> {
  const debugPort = 9000 + profileId
  const targets = await httpGetJson<CdpTarget[]>(`http://127.0.0.1:${debugPort}/json`)
  return Array.isArray(targets) ? targets : []
}

function sortTargets(targets: CdpTarget[]): CdpTarget[] {
  const pages = targets.filter(t => t.type === 'page' && t.webSocketDebuggerUrl)
  return pages.sort((a, b) => {
    const au = String(a.url || '')
    const bu = String(b.url || '')
    const ax = /(^https?:\/\/)?(x\.com|twitter\.com)\//i.test(au) ? 1 : 0
    const bx = /(^https?:\/\/)?(x\.com|twitter\.com)\//i.test(bu) ? 1 : 0
    return bx - ax
  })
}

function cdpCall<T = any>(
  wsUrl: string,
  method: string,
  params: any = {},
  timeout = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = 1
    const timer = setTimeout(() => {
      try { ws.close() } catch {}
      reject(new Error('CDP 调用超时: ' + method))
    }, timeout)

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }))
    })

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id !== id) return
        clearTimeout(timer)
        ws.close()
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        } else {
          resolve(msg.result as T)
        }
      } catch (e: any) {
        clearTimeout(timer)
        ws.close()
        reject(e)
      }
    })

    ws.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const PAGE_USERNAME_SCRIPT = `
(() => {
  const reserved = new Set([
    'home','explore','notifications','messages','i','settings','compose','search',
    'login','logout','intent','hashtag','privacy','tos','download','jobs','about','help'
  ])
  const map = new Map()
  function norm(v) {
    const s = String(v || '').trim().replace(/^@+/, '')
    if (!/^[A-Za-z0-9_]{1,15}$/.test(s)) return ''
    if (reserved.has(s.toLowerCase())) return ''
    return s
  }
  function add(v, score, source) {
    const u = norm(v)
    if (!u) return
    const prev = map.get(u) || { username: u, score: 0, source: '', count: 0 }
    prev.count += 1
    prev.score = Math.max(prev.score, score) + Math.min(prev.count, 2) * 2
    prev.source = prev.source ? (prev.source + ',' + source) : source
    map.set(u, prev)
  }
  function collectText(el, score, source) {
    const text = (el && (el.innerText || el.textContent || '')) || ''
    const matches = text.match(/@[A-Za-z0-9_]{1,15}/g) || []
    for (const m of matches) add(m, score, source)
    const aria = el && el.getAttribute ? (el.getAttribute('aria-label') || '') : ''
    const ariaMatches = aria.match(/@[A-Za-z0-9_]{1,15}/g) || []
    for (const m of ariaMatches) add(m, score, source + ':aria')
  }
  function collectHref(el, score, source) {
    const href = el && el.getAttribute ? (el.getAttribute('href') || '') : ''
    let m = href.match(/^\\/([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/)
    if (!m) m = href.match(/^https?:\\/\\/(?:x\\.com|twitter\\.com)\\/([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i)
    if (m) add(m[1], score, source + ':href')
  }

  // 只读取“当前账号按钮”和“左侧个人资料入口”。不再扫描全页面正文/时间线，
  // 避免把别人推文里的 @handle 误识别成当前登录账号。
  const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
  if (accountButton) {
    collectText(accountButton, 100, 'current-account-button')
    for (const a of Array.from(accountButton.querySelectorAll('a[href]'))) collectHref(a, 98, 'current-account-button')
  }

  const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')
  if (profileLink) {
    collectText(profileLink, 96, 'profile-nav-link')
    collectHref(profileLink, 96, 'profile-nav-link')
  }

  return {
    url: location.href,
    candidates: Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 10)
  }
})()
`

async function evaluateUsernameFromPage(wsUrl: string): Promise<UsernameCandidate[]> {
  const result: any = await cdpCall(wsUrl, 'Runtime.evaluate', {
    expression: PAGE_USERNAME_SCRIPT,
    returnByValue: true,
    awaitPromise: true
  })
  const value = result?.result?.value
  const candidates = Array.isArray(value?.candidates) ? value.candidates : []
  return candidates
    .map((c: any) => ({
      username: normalizeUsername(c.username),
      score: Number(c.score || 0),
      source: String(c.source || ''),
      count: Number(c.count || 0)
    }))
    .filter((c: UsernameCandidate) => c.username)
}

async function fetchCookiesViaCDP(profileId: number): Promise<CookieLike[]> {
  const targets = sortTargets(await getTargets(profileId))
  const wsUrl = targets[0]?.webSocketDebuggerUrl
  if (!wsUrl) return []
  const result: any = await cdpCall(wsUrl, 'Network.getAllCookies', {}, 8000)
  return Array.isArray(result?.cookies) ? result.cookies : []
}

function buildCookieHeader(cookies: CookieLike[]): string {
  return cookies
    .filter(c => c.name && c.value)
    .map(c => `${c.name}=${c.value}`)
    .join('; ')
}

async function resolveByAccountSettings(profileId: number): Promise<string> {
  try {
    const cookies = await fetchCookiesViaCDP(profileId)
    const authToken = cookies.find(c => c.name === 'auth_token')?.value
    const ct0 = cookies.find(c => c.name === 'ct0')?.value
    if (!authToken || !ct0) return ''

    const headers: Record<string, string> = {
      'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'x-csrf-token': ct0,
      'cookie': buildCookieHeader(cookies),
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'origin': 'https://x.com',
      'referer': 'https://x.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }

    const urls = [
      'https://x.com/i/api/1.1/account/settings.json',
      'https://api.x.com/1.1/account/settings.json',
      'https://api.twitter.com/1.1/account/settings.json'
    ]

    for (const url of urls) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      try {
        const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
        clearTimeout(timer)
        if (!res.ok) continue
        const json: any = await res.json()
        const username = normalizeUsername(json?.screen_name || json?.user?.screen_name || json?.user?.legacy?.screen_name || '')
        if (username) return username
      } catch {
        clearTimeout(timer)
      }
    }
    return ''
  } catch (e: any) {
    logger.info('[Resolver] account/settings 解析失败 profile=' + profileId + ': ' + (e.message || String(e)))
    return ''
  }
}

async function resolveByTwid(profileId: number): Promise<string> {
  try {
    const cookies = await fetchCookiesViaCDP(profileId)
    const authToken = cookies.find(c => c.name === 'auth_token')?.value
    const ct0 = cookies.find(c => c.name === 'ct0')?.value
    const twidRaw = cookies.find(c => c.name === 'twid')?.value
    if (!authToken || !ct0 || !twidRaw) return ''

    const twid = decodeURIComponent(twidRaw)
    const userId = twid.match(/u=(\d+)/)?.[1] || ''
    if (!userId) return ''

    const headers: Record<string, string> = {
      'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'content-type': 'application/json; charset=utf-8',
      'x-csrf-token': ct0,
      'cookie': buildCookieHeader(cookies),
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'origin': 'https://x.com',
      'referer': 'https://x.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      'accept': '*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }

    const payload = Buffer.from(JSON.stringify({
      variables: { userId, withSafetyModeUserFields: false },
      features: {
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false
      }
    }), 'utf8')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(`https://x.com/i/api/graphql/${USER_BY_REST_ID_QID}/UserByRestId`, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal
    })
    clearTimeout(timer)

    if (!res.ok) return ''
    const json: any = await res.json()
    const r = json?.data?.user?.result
    return normalizeUsername(r?.core?.screen_name || r?.legacy?.screen_name || r?.screen_name || '')
  } catch (e: any) {
    logger.info('[Resolver] twid 兜底失败 profile=' + profileId + ': ' + (e.message || String(e)))
    return ''
  }
}

export async function resolveCurrentXUsername(profileId: number, forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const cached = getCached(profileId)
    if (cached !== null) return cached
  }

  try {
    // 优先走当前账号专属接口/cookie，不再优先扫页面正文，避免拿到时间线里的其他 @用户名。
    const bySettings = await resolveByAccountSettings(profileId)
    if (bySettings) {
      setCached(profileId, bySettings)
      return bySettings
    }

    const byTwid = await resolveByTwid(profileId)
    if (byTwid) {
      setCached(profileId, byTwid)
      return byTwid
    }

    // 最后才读取严格限定的账号区域 DOM；只接受高置信度候选。
    const targets = sortTargets(await getTargets(profileId))
    let best: UsernameCandidate | null = null

    for (const t of targets.slice(0, 3)) {
      if (!t.webSocketDebuggerUrl) continue
      try {
        const candidates = await evaluateUsernameFromPage(t.webSocketDebuggerUrl)
        for (const c of candidates) {
          if (!best || c.score > best.score) best = c
        }
      } catch (e: any) {
        logger.info('[Resolver] 页面解析失败 profile=' + profileId + ': ' + (e.message || String(e)))
      }
      if (best && best.score >= 96) break
    }

    if (best && best.score >= 96) {
      setCached(profileId, best.username)
      return best.username
    }

    setCached(profileId, '')
    return ''
  } catch (e: any) {
    logger.info('[Resolver] username 解析失败 profile=' + profileId + ': ' + (e.message || String(e)))
    setCached(profileId, '')
    return ''
  }
}

export function clearXUsernameCache(profileId?: number): void {
  if (typeof profileId === 'number') usernameCache.delete(profileId)
  else usernameCache.clear()
}