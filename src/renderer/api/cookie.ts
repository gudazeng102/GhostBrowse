/**
 * Cookie 管理 API
 * Phase 2.2: 窗口 Cookie / 缓存核心管理
 */

import request from './request'

/**
 * 获取 Cookie 状态
 */
export function getCookieStatus(profileId: number) {
  return request.get(`/profiles/${profileId}/cookies`)
}

/**
 * 手动导出 Cookie
 */
export function exportCookies(profileId: number) {
  return request.post(`/profiles/${profileId}/cookies/export`)
}

/**
 * 从备份恢复 Cookie
 */
export function restoreCookies(profileId: number, backupId: number) {
  return request.post(`/profiles/${profileId}/cookies/restore`, { backupId })
}

/**
 * 清理缓存
 */
export function clearCookies(profileId: number, mode: 'all' | 'cookies_only' | 'cache_only') {
  return request.post(`/profiles/${profileId}/cookies/clear`, { mode })
}

/**
 * 获取备份列表
 */
export function getCookieBackups(profileId: number) {
  return request.get(`/profiles/${profileId}/cookies/backups`)
}

/**
 * 删除备份
 */
export function deleteCookieBackup(profileId: number, backupId: number) {
  return request.delete(`/profiles/${profileId}/cookies/backups/${backupId}`)
}

// 类型定义
export interface CookieStatus {
  cookieCount: number
  domains: string[]
  domainCount: number
  platforms: string[]
  cookiesFileExists: boolean
  localStorageExists: boolean
  sessionStorageExists: boolean
  indexedDBExists: boolean
  cacheExists: boolean
  totalSizeBytes: number
}

export interface CookieBackup {
  id: number
  profileId: number
  backupType: 'auto' | 'manual'
  backupPath: string
  cookieCount: number
  sizeBytes: number
  createdAt: number
}

export interface ClearCookieResult {
  mode: string
  clearedItems: string[]
}