/**
 * Trend Radar — AI 热点分析路由
 * 挂载在 /api/v1/trend-radar
 *
 * 接口：
 * - POST /api/v1/trend-radar/analyze → 执行热点分析
 *   Body: { topic, userInstruction, accountPersona, extractionRunId?, maxCount? }
 *   返回 TrendAnalysisResult
 *
 * 安全措施：
 * - 频率限制：每分钟最多 5 次分析请求（按来源 IP）
 * - 输入校验：topic 不能为空，maxCount 限制 1-200
 */

import { Router, Request, Response } from 'express'
import { analyzeTrend } from '../../automation/trend-analyzer'

const router = Router()

// ==================== 频率限制（内存中控） ====================

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

/** 每分钟最多分析次数 */
const RATE_LIMIT = 5
/** 窗口时间 ms */
const RATE_WINDOW_MS = 60_000

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now >= entry.resetAt) {
    // 新窗口
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT - 1, resetInMs: RATE_WINDOW_MS }
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetInMs: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT - entry.count, resetInMs: entry.resetAt - now }
}

/**
 * POST /api/v1/trend-radar/analyze
 * 执行热点分析全流程
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    // ---- 频率限制 ----
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
    const rateCheck = checkRateLimit(clientIp)
    if (!rateCheck.allowed) {
      res.status(429).json({
        code: 429,
        data: null,
        message: `分析请求过于频繁，请 ${Math.ceil(rateCheck.resetInMs / 1000)} 秒后再试`
      })
      return
    }

    // ---- 参数校验 ----
    const { topic, userInstruction, accountPersona, extractionRunId, maxCount } = req.body

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      res.status(400).json({
        code: 400,
        data: null,
        message: '缺少 topic 参数'
      })
      return
    }

    // 限制 maxCount 范围
    let safeMaxCount = 50
    if (maxCount !== undefined) {
      safeMaxCount = Math.max(1, Math.min(200, Number(maxCount) || 50))
    }

    const result = await analyzeTrend({
      topic: topic.trim(),
      userInstruction: (userInstruction || '').trim(),
      accountPersona: accountPersona || '通用账号',
      extractionRunId: extractionRunId ? Number(extractionRunId) : undefined,
      maxCount: safeMaxCount
    })

    res.json({
      code: result.success ? 0 : 500,
      data: { ...result, rateLimitRemaining: rateCheck.remaining },
      message: result.success ? 'success' : (result.error || '分析失败')
    })
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || String(err)
    })
  }
})

export default router
