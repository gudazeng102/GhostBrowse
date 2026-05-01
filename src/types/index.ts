/**
 * 全局类型定义
 * Phase 1.0: 基础类型
 * Phase 1.8: 认证相关类型
 * Phase 2.0: 指纹检测类型
 */

// ==================== Phase 1.0: 代理和窗口基础类型 ====================

export interface Proxy {
  id: number
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
  remark?: string
  createdAt?: number
  updatedAt?: number
}

export interface Profile {
  id: number
  title: string
  proxyId: number | null
  chromeVersion: string
  os: string
  webrtcMode: string
  timezoneMode: string
  geolocationMode: string
  languageMode: string
  uiLanguage: string
  screenResolution: string
  font: string
  canvasMode: string
  webglMode: string
  mediaDeviceMode: string
  startupUrl?: string
  createdAt?: number
  updatedAt?: number
  proxy?: Proxy | null
}

// ==================== Phase 1.8: 认证相关类型 ====================

export interface User {
  id: number
  username: string | null
  email: string
  display_name: string | null
  status: string
}

export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  email: string
  password: string
  confirmPassword: string
  code: string
}

// ==================== Phase 2.0: 指纹检测类型 ====================

/** 指纹检测请求参数 */
export interface FingerprintCheckParams {
  profileId: number
}

/** 指纹检测结果 - 窗口信息 */
export interface FingerprintProfile {
  id: number
  title: string
  chromeVersion: string
  os: string
}

/** 指纹检测结果 - 代理信息 */
export interface FingerprintProxy {
  status: 'success' | 'fail' | 'no_proxy'
  address: string
  type: string
  ip: string
  country: string
  city: string
  latency: number
}

/** 指纹检测结果 - 纯洁度评分 */
export interface FingerprintPurity {
  score: number
  level: string
  levelText: string
}

/** 指纹检测结果 - 完整返回 */
export interface FingerprintCheckResult {
  id: number
  profile: FingerprintProfile
  proxy: FingerprintProxy
  purity: FingerprintPurity
  fingerprint: {
    chromeVersion: string
    os: string
    userAgent: string
    webrtcMode: string
    timezoneMode: string
    geolocationMode: string
    languageMode: string
    uiLanguage: string
    screenResolution: string
    font: string
    canvasMode: string
    webglMode: string
    mediaDeviceMode: string
  }
  warnings: string[]
  checkedAt: number
}

/** 指纹检测历史记录 */
export interface FingerprintCheckRecord {
  id: number
  profileId: number
  profileTitle: string
  proxyStatus: string
  proxyIp: string
  proxyCountry: string
  proxyCity: string
  proxyLatency: number
  purityScore: number
  purityLevel: string
  fingerprintSnapshot: Record<string, any> | null
  riskWarnings: string[]
  checkedAt: number
}

// ==================== Phase 2.2: Cookie 管理类型 ====================

/** Cookie 状态信息 */
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

/** Cookie 备份记录 */
export interface CookieBackup {
  id: number
  profileId: number
  backupType: 'auto' | 'manual'
  backupPath: string
  cookieCount: number
  sizeBytes: number
  createdAt: number
}

/** 清理缓存结果 */
export interface ClearCookieResult {
  mode: string
  clearedItems: string[]
}

// ==================== Phase 2.3: 指纹配置智能跟随代理IP类型 ====================

/** 国家 → 指纹配置映射 */
export interface GeoFingerprintConfig {
  language: string
  font: string
  timezone: string
  resolution: string
  webrtc: string
}

/** 智能配置结果 */
export interface SmartConfigResult {
  country: string
  ui_language: string
  font: string
  screen_resolution: string
  timezone_mode: string
  geolocation_mode: string
  language_mode: string
  webrtc_mode: string
}
