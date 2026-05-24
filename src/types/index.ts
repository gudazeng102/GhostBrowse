/**
 * 类型定义 - Phase 4.0
 * 追加 PlatformAccount 接口和 Profile 的 platform_accounts 字段
 */

// ==================== 已有类型（保留）====================

// 用户信息
export interface User {
  id: number
  email: string
  username: string
  createdAt: number
}

// 代理信息
export interface Proxy {
  id: number
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
  remark: string | null
  createdAt: number
  updatedAt: number
}

// WebRTC 模式
export type WebRtcMode = 'forward' | 'replace' | 'real' | 'disable'

// 时区模式
export type TimezoneMode = 'ip' | 'custom' | 'real'

// 地理位置模式
export type GeolocationMode = 'ip' | 'custom' | 'real'

// 语言模式
export type LanguageMode = 'ip' | 'mask' | 'custom'

// Canvas 模式
export type CanvasMode = 'noise' | 'block' | 'fake'

// WebGL 模式
export type WebGLMode = 'mock' | 'disable' | 'real'

// 媒体设备模式
export type MediaDeviceMode = 'mock' | 'disable' | 'real'

// ==================== Phase 4.0: 平台账号类型 ====================

// 平台类型枚举（Phase 4.2 支持 outlook，Phase 4.3 支持 tiktok）
export type PlatformType = 'twitter' | 'outlook' | 'tiktok'

/**
 * 平台账号接口
 * - 后端返回的 password/two_fa_secret 为 '********'（不暴露密文）
 * - 后端返回的 two_fa_backup_codes 为解密后的数组
 */
export interface PlatformAccount {
  id?: number
  profile_id: number
  user_id?: number
  platform: PlatformType   // Phase 4.2 支持 'twitter' / 'outlook'
  account: string    // 用户名/邮箱/手机号
  password?: string  // 前端表单用，后端不返回明文
  username_confirm?: string | null  // 账号名确认（@开头的 Twitter 用户名，用于异常账号登录二次验证）
  two_fa_type?: 'totp' | 'sms' | null
  two_fa_secret?: string  // 前端表单用，后端不返回明文
  two_fa_backup_codes?: string[] | null  // 解密后的恢复码数组
  is_active?: boolean
  created_at?: number
  updated_at?: number
}

// ==================== 已有 Profile 接口（追加 platform_accounts 字段）====================

/**
 * 窗口配置（Profile）
 * Phase 1.3 创建
 * Phase 3.0 追加指纹参数字段
 * Phase 4.0 追加 platform_accounts 字段
 */
export interface Profile {
  id?: number
  title: string
  proxyId?: number
  chromeVersion?: string
  os?: string
  webrtcMode?: WebRtcMode
  timezoneMode?: TimezoneMode
  geolocationMode?: GeolocationMode
  languageMode?: LanguageMode
  uiLanguage?: string
  screenResolution?: string
  font?: string
  canvasMode?: CanvasMode
  webglMode?: WebGLMode
  mediaDeviceMode?: MediaDeviceMode
  startupUrl?: string
  iconPath?: string
  createdAt?: number
  updatedAt?: number
  // Phase 3.0: 指纹参数
  deviceName?: string
  macAddress?: string
  canvasNoiseSeed?: string
  audioNoiseSeed?: string
  rectsNoiseSeed?: string
  webglVendor?: string
  webglRenderer?: string
  userAgent?: string
  // Phase 4.0: Cookie 预置 JSON
  cookie_json?: string
  cookieJson?: string
  // Phase 4.0: 平台账号列表
  platform_accounts?: PlatformAccount[]
  // 关联代理信息
  proxy?: Proxy | null
}

// ==================== 已有 DTO 接口（保留）====================

/**
 * 创建/更新 Profile 请求体
 */
export interface ProfileDto {
  title: string
  proxyId?: number
  chromeVersion?: string
  os?: string
  webrtcMode?: WebRtcMode
  timezoneMode?: TimezoneMode
  geolocationMode?: GeolocationMode
  languageMode?: LanguageMode
  uiLanguage?: string
  screenResolution?: string
  font?: string
  canvasMode?: CanvasMode
  webglMode?: WebGLMode
  mediaDeviceMode?: MediaDeviceMode
  startupUrl?: string
  iconPath?: string
  // Phase 3.0
  deviceName?: string
  macAddress?: string
  canvasNoiseSeed?: string
  audioNoiseSeed?: string
  rectsNoiseSeed?: string
  webglVendor?: string
  webglRenderer?: string
  userAgent?: string
  // Phase 4.0
  cookie_json?: string
  cookieJson?: string
}

/**
 * Profile 列表项（查询返回的简化版）
 */
export interface ProfileRecord {
  id: number
  title: string
  proxyId: number | null
  chromeVersion: string
  os: string
  webrtcMode: WebRtcMode
  timezoneMode: TimezoneMode
  geolocationMode: GeolocationMode
  languageMode: LanguageMode
  uiLanguage: string
  screenResolution: string
  font: string
  canvasMode: CanvasMode
  webglMode: WebGLMode
  mediaDeviceMode: MediaDeviceMode
  startupUrl?: string
  iconPath?: string
  createdAt: number
  updatedAt: number
  cookie_json?: string
  cookieJson?: string
  // Phase 4.0: 平台账号
  platform_accounts?: PlatformAccount[]
  proxy?: Proxy | null
}

/**
 * API 响应格式
 */
export interface ApiResponse<T> {
  code: number
  data: T
  message: string
}

/**
 * 列表响应格式
 */
export interface ListResponse<T> {
  code: number
  data: T[]
  message: string
}

/**
 * 指纹检测结果
 */
export interface FingerprintCheck {
  id?: number
  profileId: number
  proxyId?: number
  proxyStatus: 'success' | 'fail' | 'no_proxy'
  proxyIp?: string
  proxyCountry?: string
  proxyCity?: string
  proxyLatency?: number
  purityScore: number
  purityLevel: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
  fingerprintSnapshot?: string
  riskWarnings?: string
  checkedAt: number
}

/**
 * 代理检测结果
 */
export interface ProxyCheck {
  id?: number
  proxyId: number
  status: 'success' | 'fail'
  ip?: string
  country?: string
  city?: string
  latency?: number
  checkedAt: number
}