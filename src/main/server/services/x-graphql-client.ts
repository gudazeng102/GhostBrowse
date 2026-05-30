/**
 * 迭代 6.0: X GraphQL API 客户端
 *
 * 职责：
 * - 通过已登录浏览器的 Cookie 调用 X 内部 GraphQL 接口
 * - Cursor 分页拉取 Following 列表
 * - Rate Limit 监控 + 休眠保护
 */

import WebSocket from 'ws'
import http from 'http'
import https from 'https'
import { sleepFixed } from '../../../shared/utils/sleep'
import { Logger } from '../../../shared/utils/logger'

const logger = new Logger('XGraphQLClient')

export interface XCookieSet { auth_token: string; ct0: string; [key: string]: string }
export interface XRateLimit { remaining: number; reset: number; total: number }

const QUERY_IDS: Record<string, string> = {
  'Following': 'XRzHZz4sLnhSgz55WGMCbg',
  'UserByScreenName': 'IGgvgiOx4QZndDHuD3x9TQ',
  'UserByRestId': 'IGgvgiOx4QZndDHuD3x9TQ',
}

export class XGraphQLClient {
  private cookies: XCookieSet | null = null
  private queryIdCache: Map<string, string> = new Map()

  async loadCookiesFromProfile(profileId: number): Promise<XCookieSet> {
    const debugPort = 9000 + profileId
    const cookies = await this.fetchCookiesViaCDP(debugPort)
    const authToken = cookies.find(c => c.name === 'auth_token')?.value
    const ct0 = cookies.find(c => c.name === 'ct0')?.value
    if (!authToken || !ct0) throw new Error('浏览器未登录 X')
    this.cookies = { auth_token: authToken, ct0 }
    return this.cookies
  }

  async extractQueryId(_profileId: number, queryName: string): Promise<string> {
    const cacheKey = `_global:${queryName}`
    if (this.queryIdCache.has(cacheKey)) return this.queryIdCache.get(cacheKey)!
    const qid = QUERY_IDS[queryName]
    if (!qid) throw new Error(`未知 queryName: ${queryName}`)
    this.queryIdCache.set(cacheKey, qid)
    return qid
  }

  private async httpFetch(url: string, options: RequestInit & { timeout?: number }, retries = 2): Promise<Response> {
    const controller = new AbortController()
    const timeout = options.timeout || 30000
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      return res
    } catch (err: any) {
      // 网络层错误（DNS 解析失败、TLS 握手失败、ETIMEDOUT 等）自动重试
      if (retries > 0 && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.name === 'AbortError')) {
        const wait = 3000 // 固定等 3 秒再试
        logger.info(`[XGraphQL] 网络请求失败 (${err.code || err.name})，${wait / 1000} 秒后重试（剩余 ${retries} 次）`)
        await sleepFixed(wait)
        return this.httpFetch(url, options, retries - 1)
      }
      const code = err.code || err.cause || ''
      throw new Error(`HTTP 请求失败 [${err.name}${code ? ': ' + code : ''}]: ${url.substring(0, 80)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  async graphqlRequest<T = any>(queryId: string, queryName: string, variables: any, features?: any): Promise<{ data: T; rateLimit: XRateLimit }> {
    if (!this.cookies) throw new Error('未设置 Cookie')
    const headers: Record<string, string> = {
      'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'content-type': 'application/json; charset=utf-8',
      'x-csrf-token': this.cookies.ct0,
      'cookie': Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      'origin': 'https://x.com',
      'referer': 'https://x.com/',
      'sec-fetch-site': 'same-origin',
'sec-fetch-mode': 'cors',
'sec-fetch-dest': 'empty',
'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
'accept': '*/*',
'te': 'trailers',

    }
    const body: any = { variables }
    if (features) body.features = features
    const payload = Buffer.from(JSON.stringify(body), 'utf8')
    const res = await this.httpFetch(`https://x.com/i/api/graphql/${queryId}/${queryName}`, {
      method: 'POST',
      headers,
      body: payload,
      timeout: 30000
    })
    const rateLimit: XRateLimit = {
      remaining: parseInt(res.headers.get('x-rate-limit-remaining') || '50', 10),
      reset: parseInt(res.headers.get('x-rate-limit-reset') || '0', 10),
      total: parseInt(res.headers.get('x-rate-limit-limit') || '50', 10)
    }
    if (res.status === 429) {
      const resetSec = parseInt(res.headers.get('x-rate-limit-reset') || '0', 10)
      const sleepMs = Math.min((resetSec * 1000 - Date.now()) + 2000, 16 * 60 * 1000)
      logger.info(`[XGraphQL] Rate Limit 耗尽 (429)，等待 ${Math.round(sleepMs / 1000)} 秒后重试`)
      await sleepFixed(Math.max(sleepMs, 5000))
      return this.graphqlRequest(queryId, queryName, variables, features)
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`X API 请求失败 (${res.status}): ${text.substring(0, 200)}`)
    }
    const json: any = await res.json()
    return { data: json as T, rateLimit }
  }

  async batchFetchUserDetails(screenNames: string[], profileId: number, onProgress?: (c: number, t: number) => void): Promise<{ screenName: string; data: any }[]> {
    if (!this.cookies) await this.loadCookiesFromProfile(profileId)
    const qid = await this.extractQueryId(profileId, 'UserByScreenName')
    const results: { screenName: string; data: any }[] = []
    const total = screenNames.length
    let consecutiveErrors = 0
    for (let i = 0; i < total; i += 10) {
      const batch = screenNames.slice(i, i + 10)
      const batchPromises = batch.map(async (sn) => {
        const variables = { screen_name: sn, withSafetyModeUserFields: false }
        const features = { responsive_web_graphql_timeline_navigation_enabled: true, responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false }
        try {
          const { data, rateLimit } = await this.graphqlRequest(qid, 'UserByScreenName', variables, features)
          if (rateLimit.remaining <= 1) {
            const s = Math.min((rateLimit.reset * 1000 - Date.now()) + 1000, 15 * 60 * 1000)
            if (s > 0) { await sleepFixed(s) }
          }
          const r = data?.data?.user?.result
          if (!r) return { screenName: sn, data: null }
          const l = r.legacy || {}
          return { screenName: sn, data: { displayName: l.name || '', bio: l.description || '', followers: (l.followers_count || 0).toString(), following: (l.friends_count || 0).toString(), tweetCount: (l.statuses_count || 0).toString(), location: l.location || '', avatarUrl: l.profile_image_url_https || '', verified: r.is_blue_verified || l.verified || false, handle: sn, joinDate: l.created_at || '', profileUrl: `https://x.com/${sn}` } }
        } catch (e: any) { consecutiveErrors++; logger.error(`查询 @${sn} 失败: ${e.message}`); return { screenName: sn, data: null } }
      })
      const br = await Promise.all(batchPromises)
      for (const r of br) { if (r.data) results.push(r) }
      onProgress?.(Math.min(i + 10, total), total)
      if (consecutiveErrors > 3) { await sleepFixed(30000); consecutiveErrors = 0 } else { await sleepFixed(500) }
    }
    return results
  }

  async resolveUserId(screenName: string, profileId: number): Promise<string> {
    if (!this.cookies) await this.loadCookiesFromProfile(profileId)
    const qid = await this.extractQueryId(profileId, 'UserByScreenName')
    const variables = { screen_name: screenName, withSafetyModeUserFields: false }
    const features = { responsive_web_graphql_timeline_navigation_enabled: true }
    const { data } = await this.graphqlRequest(qid, 'UserByScreenName', variables, features)
    const userId = data?.data?.user?.result?.rest_id || ''
    if (!userId) throw new Error(`未找到用户 ${screenName} 的数字 ID`)
    return userId
  }

  async fetchFollowingList(target: string, profileId: number, onProgress?: (c: number, cursor?: string) => void): Promise<{ screenName: string; name: string; userId: string; data: any }[]> {
    if (!this.cookies) await this.loadCookiesFromProfile(profileId)
    const qid = await this.extractQueryId(profileId, 'Following')
    const targetUserId = await this.resolveUserId(target, profileId)
    let all: { screenName: string; name: string; userId: string; data: any }[] = []
    let cursor: string | null = null
    let ce = 0
    const seen = new Set<string>()
    const features = { responsive_web_graphql_timeline_navigation_enabled: true, rweb_tipjar_consumption_enabled: true, responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false }
    let prevLen = 0
    for (let p = 1; p <= 500; p++) {
      const v: any = { userId: targetUserId, count: 200, includePromotedContent: false, __fs_dont_use_me_cursor: false, withSuperFollowsUserFields: false }
      if (cursor) v.cursor = cursor
      try {
        const { data, rateLimit } = await this.graphqlRequest(qid, 'Following', v, features)
        if (rateLimit.remaining <= 1) {
          const s = Math.min((rateLimit.reset * 1000 - Date.now()) + 1000, 15 * 60 * 1000)
          if (s > 0) { await sleepFixed(s) }
        }
        const instructions = data?.data?.user?.result?.timeline?.timeline?.instructions || []
        let entries: any[] = []
        for (const inst of instructions) { if (inst.type === 'TimelineAddEntries') { entries = inst.entries || []; break } }
        if (entries.length === 0) { if (instructions.some((i: any) => i.type === 'TimelineTerminateTimeline')) break; ce++; if (ce >= 3) break; continue }
        ce = 0
        let bc: string | null = null
        for (const e of entries) {
          if (e.content?.entryType === 'TimelineTimelineCursor') { if (e.content?.cursorType === 'Bottom') bc = e.content.value; continue }
          const u = e?.content?.itemContent?.user_results?.result
          if (u) {
            const sn = u.core?.screen_name || u.legacy?.screen_name || u.screen_name || ''
            const nm = u.core?.name || u.legacy?.name || u.name || ''
            const uid = u.rest_id || u.id || ''
            if (sn && !seen.has(sn)) {
              seen.add(sn)
              const l = u.legacy || {}
              all.push({ screenName: sn, name: nm, userId: uid, data: {
                displayName: l.name || nm || '',
                bio: l.description || '',
                followers: (l.followers_count || 0).toString(),
                following: (l.friends_count || 0).toString(),
                tweetCount: (l.statuses_count || 0).toString(),
                location: l.location || '',
                avatarUrl: l.profile_image_url_https || '',
                verified: u.is_blue_verified || l.verified || false,
                handle: sn,
                joinDate: l.created_at || '',
                profileUrl: `https://x.com/${sn}`
              }})
            }
          }
        }
        onProgress?.(all.length, bc || undefined)
        if (!bc || all.length === prevLen) break
        prevLen = all.length
        cursor = bc
        await sleepFixed(1500)
      } catch (e: any) { ce++; if (ce >= 3) break; await sleepFixed(5000) }
    }
    return all
  }

  private async fetchCookiesViaCDP(debugPort: number): Promise<{ name: string; value: string }[]> {
    const wsUrl = await this.getPageWsUrl(debugPort)
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl); let c = 0
      ws.on('open', () => { c++; ws.send(JSON.stringify({ id: c, method: 'Network.getAllCookies', params: {} })) })
      ws.on('message', (d: WebSocket.Data) => {
        try { const m = JSON.parse(d.toString()); if (m.id === c && m.result) { ws.close(); resolve((m.result.cookies || []) as any) } } catch {}
      })
      ws.on('error', reject)
      setTimeout(() => reject(new Error('CDP Cookie 获取超时')), 10000)
    })
  }

  private getPageWsUrl(debugPort: number): Promise<string> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${debugPort}/json`, (res) => {
        let d = ''; res.on('data', (c) => d += c); res.on('end', () => { try { const t = JSON.parse(d); const p = t.find((x: any) => x.type === 'page' && x.webSocketDebuggerUrl); if (p?.webSocketDebuggerUrl) resolve(p.webSocketDebuggerUrl); else reject(new Error('未找到 page')) } catch { reject(new Error('解析失败')) } })
      }).on('error', reject)
    })
  }
}