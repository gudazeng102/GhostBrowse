/**
 * 平台适配器注册表
 *
 * 添加新平台只需：
 * 1. 在 src/shared/platforms/<id>/ 下实现 PlatformAdapter
 * 2. 在此文件 import 并加入 ALL_PLATFORMS
 */

import { PlatformAdapter } from './_adapter'
import { TwitterPlatform } from './twitter'

export { TwitterPlatform }
export * from './_adapter'

/** 所有已注册的平台 */
export const ALL_PLATFORMS: PlatformAdapter[] = [
  TwitterPlatform
  // 后续：YouTubePlatform, RedditPlatform, ...
]

/** 按 id 查找平台适配器 */
export function getPlatformById(id: string): PlatformAdapter | null {
  return ALL_PLATFORMS.find(p => p.id === id) || null
}

/** 按 hostname 查找平台适配器 */
export function getPlatformByHostname(hostname: string): PlatformAdapter | null {
  if (!hostname) return null
  const lower = hostname.toLowerCase()
  for (const p of ALL_PLATFORMS) {
    for (const host of p.hostnames) {
      if (lower === host || lower.endsWith('.' + host)) return p
    }
  }
  return null
}

/** 列出所有平台 ID */
export function listPlatformIds(): string[] {
  return ALL_PLATFORMS.map(p => p.id)
}