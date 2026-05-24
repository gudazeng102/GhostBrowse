/**
 * 窗口配置（Profile）API 封装
 * Phase 1.3: 基于 request 实例封装窗口配置相关 API
 */

import request from './request'

// ==================== 类型定义 ====================

/** WebRTC 模式 */
export type WebRtcMode = 'forward' | 'replace' | 'disable'

/** 代理信息（简化版） */
export interface ProxyInfo {
  id: number
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
}

/** Profile 记录 */
export interface ProfileRecord {
  id: number
  title: string
  proxyId: number | null
  chromeVersion: string
  os: string
  webrtcMode: WebRtcMode
  timezoneMode: string
  geolocationMode: string
  languageMode: string
  uiLanguage: string
  screenResolution: string
  font: string
  canvasMode: string
  webglMode: string
  mediaDeviceMode: string
  createdAt: number
  updatedAt: number
  startupUrl?: string
  proxy: ProxyInfo | null
  // Phase 3.0: 指纹参数
  deviceName?: string
  macAddress?: string
  canvasNoiseSeed?: string
  audioNoiseSeed?: string
  rectsNoiseSeed?: string
  webglVendor?: string
  webglRenderer?: string
  // Phase 4.0: Cookie 预置
  cookieJson?: string
  // Phase 5.0: 窗口分组
  groupId?: number | null
  group?: { id: number; name: string; color: string } | null
}

/** 创建/更新 Profile 请求体 */
export interface ProfileDto {
  title: string
  proxyId?: number
  chromeVersion?: string
  os?: string
  webrtcMode?: WebRtcMode
  timezoneMode?: string
  geolocationMode?: string
  languageMode?: string
  uiLanguage?: string
  screenResolution?: string
  font?: string
  canvasMode?: string
  webglMode?: string
  mediaDeviceMode?: string
  startupUrl?: string
  // Phase 3.0: 指纹参数
  deviceName?: string
  macAddress?: string
  canvasNoiseSeed?: string
  audioNoiseSeed?: string
  rectsNoiseSeed?: string
  webglVendor?: string
  webglRenderer?: string
  // Phase 4.0: Cookie 预置
  cookieJson?: string
  // Phase 5.0: 窗口分组
  groupId?: number | null
}

/** Chrome 启动结果 */
export interface LaunchResult {
  pid: number
  userDataDir: string
}

// ==================== API 函数 ====================

/**
 * 获取窗口列表
 * @param groupId 分组过滤：number=指定分组ID，'ungrouped'=未分组，undefined=全部
 * @param keyword 关键词模糊搜索（标题/代理名/代理host/分组名）
 */
export async function getProfileList(
  groupId?: number | 'ungrouped' | null,
  keyword?: string
): Promise<ProfileRecord[]> {
  const params: string[] = []
  if (groupId !== undefined && groupId !== null) {
    params.push(`groupId=${groupId === 'ungrouped' ? 'null' : groupId}`)
  }
  if (keyword && keyword.trim()) {
    params.push(`keyword=${encodeURIComponent(keyword.trim())}`)
  }
  const url = '/profiles' + (params.length ? `?${params.join('&')}` : '')
  const response = await request.get<any>(url)
  return response.data.data || []
}

/**
 * 获取窗口详情
 * @param id 窗口 ID
 */
/**
 * 智能配置窗口指纹
 * @param id 窗口 ID
 */
export async function smartConfigProfile(id: number): Promise<any> {
  const response = await request.post<any>(`/profiles/${id}/smart-config`)
  return response.data
}

export async function getProfileDetail(id: number): Promise<ProfileRecord> {
  const response = await request.get<any>(`/profiles/${id}`)
  return response.data.data
}

/**
 * 创建窗口
 * @param data 窗口信息
 */
export async function createProfile(data: ProfileDto): Promise<{ id: number }> {
  const response = await request.post<any>('/profiles', data)
  return response.data.data
}

/**
 * 更新窗口
 * @param id 窗口 ID
 * @param data 窗口信息
 */
export async function updateProfile(id: number, data: ProfileDto): Promise<{ changes: number }> {
  const response = await request.put<any>(`/profiles/${id}`, data)
  return response.data.data
}

/**
 * 删除窗口
 * @param id 窗口 ID
 */
export async function deleteProfile(id: number): Promise<{ changes: number }> {
  const response = await request.delete<any>(`/profiles/${id}`)
  return response.data.data
}

/**
 * 启动 Chrome 窗口
 * @param id 窗口 ID
 */
export async function launchProfile(id: number): Promise<LaunchResult> {
  const response = await request.post<any>(`/profiles/${id}/launch`)
  return response.data.data
}

// ==================== Phase 1.4: 窗口运行状态 API ====================

/** 窗口状态响应 */
export interface ProfileStatus {
  runningIds: number[]
}

/** 关闭窗口结果 */
export interface CloseProfileResult {
  success: boolean
  message?: string
}

/**
 * 获取所有运行中的窗口 ID 列表
 */
export async function getProfilesStatus(): Promise<ProfileStatus> {
  const response = await request.get<any>('/profiles/status')
  return response.data.data
}

/**
 * 关闭窗口
 * @param id 窗口 ID
 */
export async function closeProfile(id: number): Promise<CloseProfileResult> {
  const response = await request.post<any>(`/profiles/${id}/close`)
  return response.data.data
}

// ==================== Phase 3.0: 生成新指纹 API ====================

/**
 * 生成随机指纹配置
 * @param proxyId 可选的代理 ID，用于根据代理国家匹配指纹
 */
export async function generateFingerprint(proxyId?: number): Promise<any> {
  const response = await request.post<any>('/profiles/generate-fingerprint', { proxyId })
  return response.data
}

