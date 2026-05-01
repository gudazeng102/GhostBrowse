/**
 * 代理国家检测工具
 * Phase 2.3: 指纹配置智能跟随代理IP
 * 
 * 职责：
 * - 通过代理访问 ip-api.com 获取代理出口IP的国家代码
 * - 复用已有代理构建逻辑（与 proxy.ts 中检测逻辑一致）
 */

import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Proxy 配置类型
 */
interface ProxyConfig {
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
}

/**
 * 通过代理检测获取出口IP的国家代码
 * @param proxy 代理配置
 * @returns 国家代码（如 'DE', 'US'）或 null
 */
export async function detectProxyCountry(proxy: ProxyConfig | null): Promise<string | null> {
  if (!proxy) {
    console.log('[ProxyGeo] 无代理配置，跳过国家检测');
    return null;
  }

  try {
    let agent: SocksProxyAgent | undefined;
    let proxyConfig: any = {};

    // 构建代理配置（与 launcher.ts 中逻辑一致）
    if (proxy.type === 'socks5') {
      const socksUrl = proxy.username
        ? `socks5://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
        : `socks5://${proxy.host}:${proxy.port}`;
      agent = new SocksProxyAgent(socksUrl);
    } else {
      proxyConfig = {
        protocol: proxy.type === 'https' ? 'https' : 'http',
        host: proxy.host,
        port: proxy.port,
        auth: proxy.username ? { username: proxy.username, password: proxy.password } : undefined
      };
    }

    console.log(`[ProxyGeo] 通过代理 ${proxy.host}:${proxy.port} 检测国家...`);

    const res = await axios.get('http://ip-api.com/json/', {
      timeout: 10000,
      proxy: proxy.type === 'socks5' ? false : proxyConfig,
      httpAgent: agent,
      httpsAgent: agent,
    });

    const countryCode = res.data?.countryCode || null;
    console.log(`[ProxyGeo] 代理出口国家: ${countryCode || '未知'}`);
    return countryCode;

  } catch (err: any) {
    console.error('[ProxyGeo] 检测代理国家失败:', err.message);
    return null;
  }
}