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
  proxy: ProxyInfo | null
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
}

/** Chrome 启动结果 */
export interface LaunchResult {
  pid: number
  userDataDir: string
}

// ==================== API 函数 ====================

/**
 * 获取窗口列表
 */
export async function getProfileList(): Promise<ProfileRecord[]> {
  const response = await request.get<any>('/profiles')
  return response.data.data || []
}

/**
 * 获取窗口详情
 * @param id 窗口 ID
 */
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
