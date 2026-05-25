/**
 * Twitter / X 的 URL 构造器
 */

const X_BASE = 'https://x.com'

/** 用户主页 URL */
export function buildTwitterUserUrl(username: string): string {
  const clean = username.replace(/^@/, '').trim()
  return `${X_BASE}/${encodeURIComponent(clean)}`
}

/** 用户搜索 URL（直接定位到 user tab） */
export function buildTwitterSearchUrl(query: string): string {
  return `${X_BASE}/search?q=${encodeURIComponent(query)}&f=user`
}

/** 首页 URL */
export function buildTwitterHomeUrl(): string {
  return `${X_BASE}/home`
}

/** 关注页面 URL */
export function buildTwitterFollowingUrl(): string {
  return `${X_BASE}/following`
}

/** 探索页面 URL */
export function buildTwitterExploreUrl(): string {
  return `${X_BASE}/explore`
}