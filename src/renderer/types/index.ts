/**
 * 全局 TypeScript 类型定义
 * Phase 1.0: 预留，后续扩展
 */

// ==================== API 响应类型 ====================

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

// ==================== 代理相关类型 ====================

/**
 * 代理类型枚举
 */
export type ProxyType = 'http' | 'https' | 'socks5'

/**
 * 代理信息
 */
export interface Proxy {
  id: number
  name: string
  type: ProxyType
  host: string
  port: number
  username?: string
  password?: string
  remark?: string
  created_at: number
  updated_at: number
}

/**
 * 创建代理请求
 */
export interface CreateProxyRequest {
  name: string
  type: ProxyType
  host: string
  port: number
  username?: string
  password?: string
  remark?: string
}

// ==================== 指纹窗口配置相关类型 ====================

/**
 * WebRTC 模式枚举
 */
export type WebRTCMode = 'forward' | 'replace' | 'disable'

/**
 * 指纹配置模式枚举
 */
export type FingerprintMode = 'ip' | 'custom' | 'disable'

/**
 * 指纹窗口配置（Profile）
 */
export interface Profile {
  id: number
  title: string
  proxy_id?: number
  chrome_version: string
  os: string
  webrtc_mode: WebRTCMode
  timezone_mode: FingerprintMode
  geolocation_mode: FingerprintMode
  language_mode: FingerprintMode
  ui_language: string
  screen_resolution: string
  font: string
  canvas_mode: string
  webgl_mode: string
  media_device_mode: string
  created_at: number
  updated_at: number
}

// ==================== 代理检测相关类型 ====================

/**
 * 代理检测状态
 */
export type ProxyCheckStatus = 'success' | 'fail'

/**
 * 代理检测记录
 */
export interface ProxyCheck {
  id: number
  proxy_id: number
  channel: string
  status: ProxyCheckStatus
  ip?: string
  country?: string
  city?: string
  latency?: number
  checked_at: number
}

// ==================== 系统相关类型 ====================

/**
 * 系统状态信息
 */
export interface SystemStatus {
  status: 'running' | 'stopped' | 'error'
  port: number
  version: string
  environment: 'development' | 'production'
}

/**
 * 健康检查响应
 */
export interface HealthCheck {
  healthy: boolean
  timestamp: number
}
