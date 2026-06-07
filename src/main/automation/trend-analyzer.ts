/**
 * Trend Analyzer — AI 热点分析串联器
 *
 * 职责：
 * 1. 通过现有采集链路获取话题推文数据
 * 2. 压缩摘要后组装 Prompt
 * 3. 调用 DeepSeek API 执行分析
 * 4. 解析 JSON 结果
 * 5. 本地风险规则引擎二次校验
 * 6. 返回结构化结果给渲染层
 *
 * 不修改任何现有模块，纯串联逻辑。
 */

import { DeepSeekClient } from '../../shared/ai/deepseek-client'
import { extractValidJSON } from '../../shared/ai/json-extractor'
import { stripThinkingBlocks } from '../../shared/ai/thinking-filter'
import { buildTrendRadarPrompt, summarizeRawTweets, extractMentionedHandles, extractUserInfoMap, type UserInfo } from '../../shared/ai/prompts/trend-radar'
import { evaluateHotspotRisks, isActionAllowed, type HotspotRisk } from '../../shared/ai/risk-engine'
import { loadAIConfig } from '../ai/config'
import { getDatabase } from '../server/db'
import { Logger } from '../../shared/utils/logger'
import type {
  TrendAnalysisRequest,
  TrendAnalysisHotspot,
  TrendAnalysisStrategy,
  TrendAnalysisResult,
  TrendAnalysisRiskResult
} from '../../shared/ai/trend-radar-types'

const logger = new Logger('TrendAnalyzer')

// ==================== 主逻辑 ====================

/**
 * 执行热点分析全流程
 *
 * @param req 分析请求参数
 * @param signal 可选的 AbortSignal
 */
export { TrendAnalysisRequest, TrendAnalysisResult, TrendAnalysisHotspot, TrendAnalysisStrategy, TrendAnalysisRiskResult }

export async function analyzeTrend(
  req: TrendAnalysisRequest,
  signal?: AbortSignal
): Promise<TrendAnalysisResult> {
  const config = loadAIConfig()
  const topic = req.topic.replace(/^#/, '').trim()

  // ---------- Step 1: 获取采集数据 ----------
  let rawTweets: any[]
  try {
    rawTweets = await fetchLatestTweets(topic, req.extractionRunId, req.maxCount || 50)
  } catch (err: any) {
    return {
      success: false,
      error: `采集数据获取失败: ${err.message}`,
      hotspots: [],
      selectedStrategy: { targetAccount: '', action: 'original', language: 'en', reason: '' },
      contents: [],
      riskResults: [],
      rawAIOutput: '',
      aiDurationMs: 0,
      tweetCount: 0
    }
  }

  if (!rawTweets || rawTweets.length === 0) {
    return {
      success: false,
      error: `话题 "#${topic}" 下暂无推文数据，请先点击“下发到所有运行中的窗口”按钮进行采集`,
      hotspots: [],
      selectedStrategy: { targetAccount: '', action: 'original', language: 'en', reason: '' },
      contents: [],
      riskResults: [],
      rawAIOutput: '',
      aiDurationMs: 0,
      tweetCount: 0
    }
  }

  // ---------- Step 2: 压缩摘要 ----------
  const summarized = summarizeRawTweets(rawTweets)

  // ---------- Step 2.5: 提取作者列表 ----------
  const userInfoMap = extractUserInfoMap(rawTweets)

  // ---------- Step 2.5: 获取当前窗口的登录账号（自己的 handle）----------
  const selfHandle = await fetchSelfHandle(topic, req.extractionRunId)

  // 从作者列表中移除自己的账号，防止 AI 推荐自己
  if (selfHandle) {
    userInfoMap.delete(selfHandle.toLowerCase())
    logger.info(`已从作者列表中排除自己: @${selfHandle}`)
  }

  // ---------- Step 2.6: 用户指令自动补全 ----------
  const finalInstruction = req.userInstruction?.trim()
    ? req.userInstruction.trim()
    : buildDefaultInstruction(topic, rawTweets.length)

  // ---------- Step 2.6: 提取作者列表，强制 AI 只能从中选择 ----------
  const authorHandles = Array.from(userInfoMap.values())
    .map(u => `@${u.handle}` + (u.displayName ? ` (${u.displayName})` : ''))
  const authorList = authorHandles.join('\n')

  // ---------- Step 3: 调用 DeepSeek API ----------
  const prompt = buildTrendRadarPrompt({
    topic,
    count: rawTweets.length,
    authorList,
    rawDataJson: summarized,
    userInstruction: finalInstruction,
    accountPersona: req.accountPersona || '通用账号'
  })

  const client = new DeepSeekClient({
    apiKey: config.deepseekApiKey,
    baseUrl: config.deepseekBaseUrl,
    model: config.deepseekModel,
    timeout: config.requestTimeoutMs,
    temperature: 0.3,    // 创意文案可容忍稍高温度
    topP: 0.3,
    maxTokens: 3000      // 热点分析需要更多输出空间
  })

  let aiContent = ''
  const startTime = Date.now()
  try {
    const resp = await client.generate(prompt, { signal })
    aiContent = resp.content
  } catch (err: any) {
    if (signal?.aborted) {
      return {
        success: false,
        error: '分析已取消',
        hotspots: [],
        selectedStrategy: { targetAccount: '', action: 'original', language: 'en', reason: '' },
        contents: [],
        riskResults: [],
        rawAIOutput: '',
        aiDurationMs: Date.now() - startTime,
        tweetCount: rawTweets.length
      }
    }
    return {
      success: false,
      error: `DeepSeek API 调用失败: ${err.message}`,
      hotspots: [],
      selectedStrategy: { targetAccount: '', action: 'original', language: 'en', reason: '' },
      contents: [],
      riskResults: [],
      rawAIOutput: aiContent,
      aiDurationMs: Date.now() - startTime,
      tweetCount: rawTweets.length
    }
  }

  const aiDurationMs = Date.now() - startTime

  // ---------- Step 4: 解析 JSON ----------
  const cleaned = stripThinkingBlocks(aiContent)
  const json = extractValidJSON(cleaned, { requireKey: 'hotspots' })

  if (!json) {
    return {
      success: false,
      error: `AI 返回格式异常，无法提取有效 JSON。原始输出前 200 字: ${aiContent.substring(0, 200)}`,
      hotspots: [],
      selectedStrategy: { targetAccount: '', action: 'original', language: 'en', reason: '' },
      contents: [],
      riskResults: [],
      rawAIOutput: aiContent,
      aiDurationMs,
      tweetCount: rawTweets.length
    }
  }

  // ---------- Step 5: 规范化输出 ----------
  const hotspots: TrendAnalysisHotspot[] = (json.hotspots || []).map((h: any) => ({
    topic: h.topic || '未知',
    risk: h.risk || 'low',
    riskType: h.risk_type || 'none',
    matchScore: h.match_score || 0,
    lifecycle: h.lifecycle || 'rising'
  }))

  // ==================== AI 返回的 target_account 强制校验 ====================
  // 规则：
  //   1. targetAccount 必须在 userInfoMap（真实发推作者）中
  //      → 不在 = AI 编造的 → 强制清空
  //   2. targetAccount 不能是当前登录用户自己
  //      → 自己 = 清空
  //   3. @提及（allValidHandles）不算有效作者，因为 ZIMA 等常被提及但不是推主
  //      只认 userInfoMap（谁发了推）
  const strategyRaw = json.selected_strategy || {}
  let targetAccount = (strategyRaw.target_account || '').replace(/^@/, '').trim()
  let targetAccountName = ''
  let targetAccountHandle = ''
  let targetAccountWarning: string | undefined

  if (targetAccount) {
    // 规则一：拒绝自己的账号（优先）
    if (selfHandle && targetAccount.toLowerCase() === selfHandle.toLowerCase()) {
      targetAccountWarning = `AI 推荐了 @${targetAccount}（这是当前窗口的登录账号，已自动屏蔽）`
      logger.warning(`AI 试图推荐自己的账号 @${targetAccount}，已屏蔽`)
      targetAccount = ''
      targetAccountName = ''
      targetAccountHandle = ''
    }
    // 规则二：不在作者列表中 → 只加警告，不清空 targetAccount
    // 保留 AI 推荐的账号值，让用户自己去判断是否要去评论
    else {
      const userInfo = userInfoMap.get(targetAccount.toLowerCase())
      if (userInfo) {
        targetAccountName = userInfo.displayName
        targetAccountHandle = userInfo.handle
        // 校验通过，无告警
      } else {
        // 从 allValidHandles 判断目标是否在 @提及中出现过
        const allValidHandles = extractMentionedHandles(rawTweets)
        const mentioned = allValidHandles.has(targetAccount.toLowerCase())
        targetAccountWarning = mentioned
          ? `AI 推荐了 @${targetAccount}（该账号在推文文本中被 @提及，不在采集数据的推文作者中，建议人工确认是否为真实目标）`
          : `AI 推荐了 @${targetAccount}（该账号不在本次采集数据中，建议人工确认该账号是否存在）`
        logger.warning(`AI 推荐了 "@${targetAccount}"，不在推文作者列表中，已保留给用户确认`)
        targetAccountName = targetAccount
        targetAccountHandle = targetAccount
      }
    }
  }

  // 提取采集数据中 @提及 仅用于日志
  const allValidHandles = extractMentionedHandles(rawTweets)
  if (targetAccount && allValidHandles.has(targetAccount.toLowerCase())) {
    logger.info(`targetAccount @${targetAccount} 在采集数据的 @提及 中出现过`)
  }

  const selectedAction = strategyRaw.action || 'original'

  const selectedStrategy: TrendAnalysisStrategy = {
    targetAccount: targetAccount ? `@${targetAccount}` : '',
    targetAccountName: targetAccountName || undefined,
    targetAccountHandle: targetAccountHandle || undefined,
    targetAccountWarning,
    action: selectedAction,
    language: strategyRaw.language || 'en',
    reason: strategyRaw.reason || ''
  }

  const contents: string[] = Array.isArray(json.contents) ? json.contents.slice(0, 3) : []

  // ---------- Step 6: 风险引擎二次校验 ----------
  const hotspotRisks: HotspotRisk[] = hotspots.map(h => ({
    topic: h.topic,
    aiRisk: h.risk,
    aiRiskType: h.riskType as any,
    matchScore: h.matchScore,
    lifecycle: h.lifecycle
  }))

  const rawRiskResults = evaluateHotspotRisks(hotspotRisks)

  const riskResults = rawRiskResults.map(r => {
    const perm = isActionAllowed(r.finalRisk, hotspots.find(h => h.topic === r.topic)?.matchScore || 0)
    return {
      topic: r.topic,
      finalRisk: r.finalRisk,
      finalRiskType: r.finalRiskType,
      originalRisk: r.originalRisk,
      matchedRules: r.matchedRules,
      overridden: r.overridden,
      allowed: perm.allowed,
      buttonState: perm.buttonState,
      hint: perm.hint
    }
  })

  // 同步更新选中的策略热点风险状态
  const selectedHotspotRisk = riskResults.length > 0 ? riskResults[0] : null

  return {
    success: true,
    hotspots,
    selectedStrategy,
    contents,
    riskResults,
    rawAIOutput: aiContent,
    aiDurationMs,
    tweetCount: rawTweets.length
  }
}

// ==================== 默认指令自动补全 ====================

/**
 * 当用户未输入分析指令时，根据话题自动生成默认指令
 * 方案B：让用户无需输入，AI 自动判断分析角度
 */
function buildDefaultInstruction(topic: string, count: number): string {
  return `分析话题 "#${topic}" 的 ${count} 条热门推文，提取当前最值得关注的 3 个子话题，根据推文所在语言圈自动匹配文案语言，生成自然融入热点的借势文案。重点关注与账号定位（技术/AI/出海方向）相关的话题，优先推荐安全的中低风险策略。`
}

// ==================== 数据获取 ====================

/**
 * 从同一采集任务中获取当前窗口登录的 Twitter 账号（自己）
 * 采集阶段 task-executor 会在登录检查后通过 onData('self_handle', ...) 上报
 */
function fetchSelfHandle(topic: string, runId?: number): string | null {
  try {
    const db = getDatabase()

    if (runId) {
      const row = db.prepare(
        `SELECT raw_data FROM extraction_results WHERE task_run_id = ? AND data_type = 'self_handle' LIMIT 1`
      ).get(runId) as { raw_data: string } | undefined
      if (row) {
        const parsed = JSON.parse(row.raw_data)
        return parsed.handle || null
      }
      return null
    }

    // 自动查找：先找到匹配话题的 task_run，再查其 self_handle
    const tag = topic.replace(/^#/, '')
    const runs = db.prepare(`
      SELECT DISTINCT er.task_run_id FROM extraction_results er
      JOIN task_runs tr ON tr.id = er.task_run_id
      WHERE tr.plan_json LIKE ? AND er.data_type = 'tweet'
      ORDER BY tr.created_at DESC
      LIMIT 1
    `).all(`%${tag}%`) as { task_run_id: number }[]

    if (!runs || runs.length === 0) return null

    const row = db.prepare(
      `SELECT raw_data FROM extraction_results WHERE task_run_id = ? AND data_type = 'self_handle' LIMIT 1`
    ).get(runs[0].task_run_id) as { raw_data: string } | undefined

    if (row) {
      const parsed = JSON.parse(row.raw_data)
      return parsed.handle || null
    }
    return null
  } catch {
    return null
  }
}

/**
 * 从数据库获取最近一次匹配话题的采集结果
 * 不调用采集脚本，只查已有数据
 */
function fetchLatestTweets(
  topic: string,
  runId?: number,
  maxCount: number = 50
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    try {
      const db = getDatabase()

      if (runId) {
        // 指定了采集任务 ID（只取推文，排除 self_handle 等系统类型）
        const rows = db.prepare(
          `SELECT * FROM extraction_results WHERE task_run_id = ? AND data_type = 'tweet' ORDER BY collected_at ASC LIMIT ?`
        ).all(runId, maxCount)
        resolve(rows as any[])
        return
      }

      // 自动查找最近一次包含该话题的采集任务
      const tag = topic.replace(/^#/, '')
      // 先找匹配的 task_run
      const runs = db.prepare(`
        SELECT tr.id FROM task_runs tr
        JOIN extraction_results er ON er.task_run_id = tr.id
        WHERE tr.plan_json LIKE ? AND er.data_type = 'tweet'
        GROUP BY tr.id
        ORDER BY tr.created_at DESC
        LIMIT 1
      `).all(`%${tag}%`) as any[]

      if (!runs || runs.length === 0) {
        resolve([])
        return
      }

      const rows = db.prepare(
        `SELECT * FROM extraction_results WHERE task_run_id = ? AND data_type = 'tweet' ORDER BY collected_at ASC LIMIT ?`
      ).all(runs[0].id, maxCount)
      resolve(rows as any[])
    } catch (err: any) {
      reject(err)
    }
  })
}