/**
 * 代理管理 API 封装
 * Phase 1.1: 基于 request 实例封装代理相关 API
 * Phase 1.2: 追加代理检测相关 API
 */

import request from './request'

// ==================== 类型定义 ====================

/** 代理类型 */
export type ProxyType = 'http' | 'https' | 'socks5'

/** 代理记录 */
export interface ProxyRecord {
  id: number
  name: string
  type: ProxyType
  host: string
  port: number
  username: string | null
  password: string | null
  remark: string | null
  created_at: number
  updated_at: number
}

/** 创建/更新代理请求体 */
export interface ProxyDto {
  name: string
  type: ProxyType
  host: string
  port: number
  username?: string
  password?: string
  remark?: string
}

/** 检测渠道 */
export type CheckChannel = 'ip.sb' | 'ipinfo.io' | 'ip-api.com'

/** 检测代理请求体 */
export interface CheckProxyDto {
  channel: CheckChannel
}

/** 代理检测结果 */
export interface ProxyCheckResult {
  id: number
  proxyId: number
  channel: CheckChannel
  status: 'success' | 'fail'
  ip: string | null
  country: string | null
  city: string | null
  region: string
  latency: number | null
  error?: string
  checkedAt: number
  checkedAtStr?: string
}

// ==================== API 函数 ====================

/**
 * 获取代理列表
 * @param keyword 搜索关键词（可选）
 */
export async function getProxyList(keyword?: string): Promise<ProxyRecord[]> {
  const response = await request.get<any>('/proxies', {
    params: { keyword }
  })
  return response.data.data || []
}

/**
 * 获取代理详情
 * @param id 代理 ID
 */
export async function getProxyDetail(id: number): Promise<ProxyRecord> {
  const response = await request.get<any>(`/proxies/${id}`)
  return response.data.data
}

/**
 * 创建代理
 * @param data 代理信息
 */
export async function createProxy(data: ProxyDto): Promise<{ id: number }> {
  const response = await request.post<any>('/proxies', data)
  return response.data.data
}

/**
 * 更新代理
 * @param id 代理 ID
 * @param data 代理信息
 */
export async function updateProxy(id: number, data: ProxyDto): Promise<{ changes: number }> {
  const response = await request.put<any>(`/proxies/${id}`, data)
  return response.data.data
}

/**
 * 删除代理
 * @param id 代理 ID
 */
export async function deleteProxy(id: number): Promise<{ changes: number }> {
  const response = await request.delete<any>(`/proxies/${id}`)
  return response.data.data
}

/**
 * 批量删除代理（使用事务）
 * @param ids 代理 ID 数组
 */
export async function batchDeleteProxy(ids: number[]): Promise<{ deletedCount: number }> {
  const response = await request.post<any>('/proxies/batch-delete', { ids })
  return response.data.data
}

// ==================== Phase 1.2: 代理检测 API ====================

/**
 * 检测代理连通性
 * @param id 代理 ID
 * @param channel 检测渠道
 */
export async function checkProxy(id: number, channel: CheckChannel): Promise<ProxyCheckResult> {
  const response = await request.post<any>(`/proxies/${id}/check`, { channel })
  return response.data.data
}

/**
 * 获取代理检测历史记录
 * @param id 代理 ID
 */
export async function getProxyChecks(id: number): Promise<ProxyCheckResult[]> {
  const response = await request.get<any>(`/proxies/${id}/checks`)
  return response.data.data || []
}
