/**
 * 指纹检测路由
 * Phase 2.0: 实现窗口指纹检测和纯洁度评估 API
 */

import { Router, Response } from 'express'
import { getDatabase } from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import axios from 'axios'
import { SocksProxyAgent } from 'socks-proxy-agent'

// 创建路由实例
const router = Router()

// 所有指纹检测接口需要登录
router.use(authMiddleware)

// ==================== 类型定义 ====================

/** 代理记录 */
interface ProxyRecord {
  id: number
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
}

/** Profile 记录 */
interface ProfileRecord {
  id: number
  title: string
  proxy_id: number | null
  chrome_version: string
  os: string
  webrtc_mode: string
  timezone_mode: string
  geolocation_mode: string
  language_mode: string
  ui_language: string
  screen_resolution: string
  font: string
  canvas_mode: string
  webgl_mode: string
  media_device_mode: string
}

/** 代理检测结果 */
interface ProxyCheckResult {
  status: 'success' | 'fail' | 'no_proxy'
  ip: string
  country: string
  city: string
  latency: number
}

/** 纯洁度评分结果 */
interface PurityResult {
  score: number
  level: string
  levelText: string
  warnings: string[]
}

// ==================== 辅助函数 ====================

/**
 * 通过代理访问 IP 检测接口，获取出口 IP 信息
 */
async function checkProxyConnectivity(proxy: ProxyRecord): Promise<ProxyCheckResult> {
  const startTime = Date.now()

  try {
    // 构建 axios 配置
    const axiosConfig: any = {
      timeout: 10000,
      validateStatus: () => true // 不抛出错误，接受任何状态码
    }

    // 根据代理类型配置代理（与 proxy.ts 保持一致）
    if (proxy.type === 'http' || proxy.type === 'https') {
      // HTTP/HTTPS 代理使用 axios 内置 proxy 配置
      axiosConfig.proxy = {
        host: proxy.host,
        port: proxy.port,
        auth: proxy.username ? {
          username: proxy.username,
          password: proxy.password || ''
        } : undefined
      }
    } else if (proxy.type === 'socks5') {
      // SOCKS5 代理使用 socks-proxy-agent
      const agent = new SocksProxyAgent({
        hostname: proxy.host,
        port: proxy.port,
        userId: proxy.username || undefined,
        password: proxy.password || undefined
      })
      axiosConfig.httpAgent = agent
      axiosConfig.httpsAgent = agent
    }

    // 通过代理访问 ip-api.com 获取出口 IP（与代理管理检测保持一致）
    const response = await axios.get('http://ip-api.com/json/', axiosConfig)
    const latency = Date.now() - startTime

    if (response.status === 200) {
      const ip = response.data?.ip || response.data?.origin || response.request?.socket?.remoteAddress || 'unknown'
      return {
        status: 'success',
        ip: String(ip).trim(),
        country: response.data?.country || 'Unknown',
        city: response.data?.city || 'Unknown',
        latency
      }
    }

    return {
      status: 'fail',
      ip: '',
      country: '',
      city: '',
      latency
    }
  } catch (err: any) {
    console.error('[Fingerprint] 代理连通性检测失败:', err.message)
    return {
      status: 'fail',
      ip: '',
      country: '',
      city: '',
      latency: Date.now() - startTime
    }
  }
}

/**
 * 计算指纹纯洁度评分
 */
function calculatePurity(profile: ProfileRecord): PurityResult {
  let score = 0
  const warnings: string[] = []

  // 1. User-Agent 模拟（+15）
  const uaVersions = ['124', '128', '130', '132', '134']
  if (uaVersions.includes(profile.chrome_version)) {
    score += 15
  } else {
    warnings.push('Chrome 版本不在常见模拟范围内，可能被识别')
  }

  // 2. Canvas 防护（+15）
  if (profile.canvas_mode === 'noise') {
    score += 15
  } else if (profile.canvas_mode === 'block') {
    score += 10
    warnings.push('Canvas 被完全阻止，部分网站功能可能异常')
  } else {
    warnings.push('Canvas 未添加噪声保护，指纹可被追踪')
  }

  // 3. WebGL 防护（+15）
  if (profile.webgl_mode === 'mock') {
    score += 15
  } else {
    warnings.push('WebGL 未伪装，显卡信息可能泄露真实身份')
  }

  // 4. WebRTC 防护（+20）—— 权重最高
  if (profile.webrtc_mode === 'disable') {
    score += 20
  } else if (profile.webrtc_mode === 'replace') {
    score += 15
  } else if (profile.webrtc_mode === 'forward') {
    score += 10
    warnings.push('WebRTC Forward 模式仍可能通过 STUN 泄露局部网络信息')
  } else {
    warnings.push('WebRTC 未做任何防护，真实 IP 极易泄露')
  }

  // 5. 时区/地理位置（+10）
  if (profile.timezone_mode === 'ip' || profile.geolocation_mode === 'ip') {
    score += 10
  } else {
    warnings.push('时区或地理位置未跟随 IP，可能与代理位置不一致')
  }

  // 6. 语言一致性（+10）
  if (profile.language_mode === 'ip' || profile.ui_language) {
    score += 10
  } else {
    warnings.push('语言设置未配置，可能暴露系统默认语言')
  }

  // 7. 分辨率常见度（+5）
  const commonResolutions = ['1920x1080', '1366x768', '1440x900', '1536x864', '1280x720']
  if (commonResolutions.includes(profile.screen_resolution)) {
    score += 5
  } else {
    warnings.push(`分辨率 ${profile.screen_resolution} 不常见，易形成唯一指纹`)
  }

  // 8. 媒体设备伪装（+5）
  if (profile.media_device_mode === 'mock') {
    score += 5
  } else {
    warnings.push('媒体设备列表未伪装，真实摄像头/麦克风信息可能泄露')
  }

  // 评级
  let level = 'unknown'
  let levelText = '未知'
  if (score >= 90) {
    level = 'excellent'
    levelText = '优秀'
  } else if (score >= 75) {
    level = 'good'
    levelText = '良好'
  } else if (score >= 50) {
    level = 'fair'
    levelText = '一般'
  } else {
    level = 'poor'
    levelText = '较差'
  }

  return { score, level, levelText, warnings }
}

/**
 * 构建指纹配置快照
 */
function buildFingerprintSnapshot(profile: ProfileRecord) {
  return {
    chromeVersion: profile.chrome_version,
    os: profile.os,
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.chrome_version}.0.0.0 Safari/537.36`,
    webrtcMode: profile.webrtc_mode,
    timezoneMode: profile.timezone_mode,
    geolocationMode: profile.geolocation_mode,
    languageMode: profile.language_mode,
    uiLanguage: profile.ui_language,
    screenResolution: profile.screen_resolution,
    font: profile.font,
    canvasMode: profile.canvas_mode,
    webglMode: profile.webgl_mode,
    mediaDeviceMode: profile.media_device_mode
  }
}

// ==================== API 路由 ====================

/**
 * POST /api/v1/fingerprint/check
 * 执行指纹检测
 * 
 * 请求体: { "profileId": 1 }
 */
router.post('/check', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { profileId } = req.body as { profileId: number }

    if (!profileId) {
      return res.status(400).json({
        code: 400,
        message: '缺少 profileId 参数'
      })
    }

    const db = getDatabase()

    // 步骤 1：权限校验 - 查询窗口配置
    const profile = db.prepare(`
      SELECT * FROM profiles WHERE id = ? AND user_id = ?
    `).get(profileId, userId) as ProfileRecord | undefined

    if (!profile) {
      return res.status(404).json({
        code: 404,
        message: '窗口不存在或无权限访问'
      })
    }

    // 步骤 2：读取代理信息
    let proxyInfo: ProxyRecord | null = null
    if (profile.proxy_id) {
      const proxy = db.prepare(`
        SELECT * FROM proxies WHERE id = ? AND user_id = ?
      `).get(profile.proxy_id, userId) as ProxyRecord | undefined
      if (proxy) {
        proxyInfo = proxy
      }
    }

    // 步骤 3：代理联通检测
    let proxyResult: ProxyCheckResult
    if (proxyInfo) {
      console.log(`[Fingerprint] 检测代理: ${proxyInfo.host}:${proxyInfo.port} (${proxyInfo.type})`)
      proxyResult = await checkProxyConnectivity(proxyInfo)
      console.log(`[Fingerprint] 代理检测结果: ${proxyResult.status}, IP: ${proxyResult.ip}, 延迟: ${proxyResult.latency}ms`)
    } else {
      proxyResult = {
        status: 'no_proxy',
        ip: '',
        country: '',
        city: '',
        latency: 0
      }
      console.log('[Fingerprint] 窗口未绑定代理')
    }

    // 步骤 4：计算纯洁度评分
    const purity = calculatePurity(profile)
    console.log(`[Fingerprint] 纯洁度评分: ${purity.score}分 (${purity.levelText}), 风险项: ${purity.warnings.length}`)

    // 步骤 5：构建指纹快照
    const snapshot = buildFingerprintSnapshot(profile)

    // 步骤 6：写入数据库
    const now = Date.now()
    const insertResult = db.prepare(`
      INSERT INTO fingerprint_checks 
      (profile_id, user_id, proxy_id, proxy_status, proxy_ip, proxy_country, proxy_city, proxy_latency, 
       purity_score, purity_level, fingerprint_snapshot, risk_warnings, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      userId,
      profile.proxy_id || null,
      proxyResult.status,
      proxyResult.ip,
      proxyResult.country,
      proxyResult.city,
      proxyResult.latency,
      purity.score,
      purity.level,
      JSON.stringify(snapshot),
      JSON.stringify(purity.warnings),
      now
    )

    console.log(`[Fingerprint] 检测记录已保存, ID: ${insertResult.lastInsertRowid}`)

    // 步骤 7：返回结果
    res.json({
      code: 200,
      message: '检测完成',
      data: {
        id: insertResult.lastInsertRowid,
        profile: {
          id: profile.id,
          title: profile.title,
          chromeVersion: profile.chrome_version,
          os: profile.os
        },
        proxy: {
          status: proxyResult.status,
          address: proxyInfo ? `${proxyInfo.host}:${proxyInfo.port}` : '',
          type: proxyInfo?.type || '',
          ip: proxyResult.ip,
          country: proxyResult.country,
          city: proxyResult.city,
          latency: proxyResult.latency
        },
        purity: {
          score: purity.score,
          level: purity.level,
          levelText: purity.levelText
        },
        fingerprint: snapshot,
        warnings: purity.warnings,
        checkedAt: now
      }
    })
  } catch (err: any) {
    console.error('[Fingerprint] 指纹检测失败:', err)
    res.status(500).json({
      code: 500,
      message: err.message || '检测失败'
    })
  }
})

/**
 * GET /api/v1/fingerprint/history
 * 获取检测历史
 */
router.get('/history', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const profileId = req.query.profileId as string | undefined

    const db = getDatabase()

    let sql = `
      SELECT fc.*, p.title as profile_title
      FROM fingerprint_checks fc
      LEFT JOIN profiles p ON fc.profile_id = p.id
      WHERE fc.user_id = ?
    `
    const params: any[] = [userId]

    if (profileId) {
      sql += ' AND fc.profile_id = ?'
      params.push(Number(profileId))
    }

    sql += ' ORDER BY fc.checked_at DESC LIMIT 50'

    const records = db.prepare(sql).all(...params) as any[]

    // 格式化返回数据
    const formatted = records.map(record => ({
      id: record.id,
      profileId: record.profile_id,
      profileTitle: record.profile_title,
      proxyStatus: record.proxy_status,
      proxyIp: record.proxy_ip,
      proxyCountry: record.proxy_country,
      proxyCity: record.proxy_city,
      proxyLatency: record.proxy_latency,
      purityScore: record.purity_score,
      purityLevel: record.purity_level,
      fingerprintSnapshot: record.fingerprint_snapshot ? JSON.parse(record.fingerprint_snapshot) : null,
      riskWarnings: record.risk_warnings ? JSON.parse(record.risk_warnings) : [],
      checkedAt: record.checked_at
    }))

    res.json({
      code: 200,
      data: formatted,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Fingerprint] 获取检测历史失败:', err)
    res.status(500).json({
      code: 500,
      message: err.message || '获取历史记录失败'
    })
  }
})

/**
 * DELETE /api/v1/fingerprint/history
 * 清除检测历史
 */
router.delete('/history', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { profileId } = req.body as { profileId?: number }

    const db = getDatabase()

    let sql = 'DELETE FROM fingerprint_checks WHERE user_id = ?'
    const params: any[] = [userId]

    if (profileId) {
      sql += ' AND profile_id = ?'
      params.push(profileId)
    }

    const result = db.prepare(sql).run(...params)

    res.json({
      code: 200,
      data: {
        deleted: result.changes
      },
      message: '清除成功'
    })
  } catch (err: any) {
    console.error('[Fingerprint] 清除检测历史失败:', err)
    res.status(500).json({
      code: 500,
      message: err.message || '清除失败'
    })
  }
})

export default router