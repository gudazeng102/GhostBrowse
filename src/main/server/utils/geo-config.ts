/**
 * 国家 → 指纹配置映射表
 * Phase 2.3: 指纹配置智能跟随代理IP
 * 
 * 职责：
 * - 定义主要国家的指纹配置（语言、字体、时区、分辨率、WebRTC）
 * - 提供 resolveGeoConfig 函数根据国家代码获取配置
 */

export interface GeoFingerprintConfig {
  language: string;      // 如 'de-DE'
  font: string;           // 如 'Arial'
  timezone: string;       // 如 'Europe/Berlin'
  resolution: string;     // 如 '1920x1080'
  webrtc: string;         // 如 'disable'
}

/**
 * 国家 → 指纹配置映射表
 * 覆盖主要国家和地区
 */
export const GEO_CONFIG_MAP: Record<string, GeoFingerprintConfig> = {
  'US': { language: 'en-US', font: 'Arial', timezone: 'America/New_York', resolution: '1920x1080', webrtc: 'replace' },
  'GB': { language: 'en-GB', font: 'Arial', timezone: 'Europe/London', resolution: '1920x1080', webrtc: 'replace' },
  'DE': { language: 'de-DE', font: 'Arial', timezone: 'Europe/Berlin', resolution: '1920x1080', webrtc: 'replace' },
  'FR': { language: 'fr-FR', font: 'Arial', timezone: 'Europe/Paris', resolution: '1920x1080', webrtc: 'replace' },
  'JP': { language: 'ja-JP', font: 'Meiryo', timezone: 'Asia/Tokyo', resolution: '1366x768', webrtc: 'replace' },
  'KR': { language: 'ko-KR', font: 'Malgun Gothic', timezone: 'Asia/Seoul', resolution: '1920x1080', webrtc: 'replace' },
  'CN': { language: 'zh-CN', font: 'Microsoft YaHei', timezone: 'Asia/Shanghai', resolution: '1920x1080', webrtc: 'replace' },
  'TW': { language: 'zh-TW', font: 'Microsoft JhengHei', timezone: 'Asia/Taipei', resolution: '1920x1080', webrtc: 'replace' },
  'RU': { language: 'ru-RU', font: 'Arial', timezone: 'Europe/Moscow', resolution: '1920x1080', webrtc: 'replace' },
  'BR': { language: 'pt-BR', font: 'Arial', timezone: 'America/Sao_Paulo', resolution: '1920x1080', webrtc: 'replace' },
  'CA': { language: 'en-CA', font: 'Arial', timezone: 'America/Toronto', resolution: '1920x1080', webrtc: 'replace' },
  'AU': { language: 'en-AU', font: 'Arial', timezone: 'Australia/Sydney', resolution: '1920x1080', webrtc: 'replace' },
  'IN': { language: 'en-IN', font: 'Arial', timezone: 'Asia/Kolkata', resolution: '1366x768', webrtc: 'replace' },
  'SG': { language: 'en-SG', font: 'Arial', timezone: 'Asia/Singapore', resolution: '1920x1080', webrtc: 'replace' },
  'NL': { language: 'nl-NL', font: 'Arial', timezone: 'Europe/Amsterdam', resolution: '1920x1080', webrtc: 'replace' },
  'IT': { language: 'it-IT', font: 'Arial', timezone: 'Europe/Rome', resolution: '1920x1080', webrtc: 'replace' },
  'ES': { language: 'es-ES', font: 'Arial', timezone: 'Europe/Madrid', resolution: '1920x1080', webrtc: 'replace' },
  'MX': { language: 'es-MX', font: 'Arial', timezone: 'America/Mexico_City', resolution: '1920x1080', webrtc: 'replace' },
  'SE': { language: 'sv-SE', font: 'Arial', timezone: 'Europe/Stockholm', resolution: '1920x1080', webrtc: 'replace' },
  'PL': { language: 'pl-PL', font: 'Arial', timezone: 'Europe/Warsaw', resolution: '1920x1080', webrtc: 'replace' },
};

/**
 * 默认兜底配置（未匹配到国家时使用）
 */
export const DEFAULT_GEO_CONFIG: GeoFingerprintConfig = {
  language: 'en-US',
  font: 'Arial',
  timezone: 'America/New_York',
  resolution: '1920x1080',
  webrtc: 'replace'
};

/**
 * 根据代理检测结果解析国家代码，获取对应指纹配置
 * @param proxyCountryCode ISO 国家代码（如 'DE', 'US'）
 * @returns GeoFingerprintConfig
 */
export function resolveGeoConfig(proxyCountryCode?: string | null): GeoFingerprintConfig {
  if (!proxyCountryCode) return DEFAULT_GEO_CONFIG;
  const code = proxyCountryCode.toUpperCase();
  return GEO_CONFIG_MAP[code] || DEFAULT_GEO_CONFIG;
}

/**
 * 获取国家中文名称（用于智能配置提示）
 */
export function getCountryName(countryCode: string): string {
  const countryNames: Record<string, string> = {
    'US': '美国', 'GB': '英国', 'DE': '德国', 'FR': '法国',
    'JP': '日本', 'KR': '韩国', 'CN': '中国', 'TW': '台湾',
    'RU': '俄罗斯', 'BR': '巴西', 'CA': '加拿大', 'AU': '澳大利亚',
    'IN': '印度', 'SG': '新加坡', 'NL': '荷兰', 'IT': '意大利',
    'ES': '西班牙', 'MX': '墨西哥', 'SE': '瑞典', 'PL': '波兰'
  };
  return countryNames[countryCode.toUpperCase()] || countryCode;
}