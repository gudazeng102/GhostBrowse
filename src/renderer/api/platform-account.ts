/**
 * 平台账号 API - Phase 4.0
 * CRUD 接口封装
 */

import request from './request'
import type { PlatformAccount } from '@/types'

export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

/** 查询指定 Profile 的平台账号列表 */
export async function getPlatformAccounts(profileId: number): Promise<PlatformAccount[]> {
  const res = await request.get<ApiResponse<PlatformAccount[]>>(`/platform-accounts?profile_id=${profileId}`)
  if (res.data.code === 0) return res.data.data || []
  return []
}

/** 创建平台账号 */
export async function createPlatformAccount(data: {
  profile_id: number
  platform?: string
  account: string
  password: string
  two_fa_type?: 'totp' | 'sms' | null
  two_fa_secret?: string
  two_fa_backup_codes?: string
  is_active?: boolean
}): Promise<PlatformAccount | null> {
  const res = await request.post<ApiResponse<PlatformAccount>>('/platform-accounts', data)
  if (res.data.code === 0) return res.data.data
  return null
}

/** 更新平台账号 */
export async function updatePlatformAccount(id: number, data: Partial<{
  account: string
  password: string
  two_fa_type: string | null
  two_fa_secret: string
  two_fa_backup_codes: string
  is_active: boolean
}>): Promise<PlatformAccount | null> {
  const res = await request.put<ApiResponse<PlatformAccount>>(`/platform-accounts/${id}`, data)
  if (res.data.code === 0) return res.data.data
  return null
}

/** 删除平台账号 */
export async function deletePlatformAccount(id: number): Promise<boolean> {
  const res = await request.delete<ApiResponse<{ deleted: boolean }>>(`/platform-accounts/${id}`)
  return res.data.code === 0
}