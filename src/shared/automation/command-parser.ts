/**
 * 关键词命令解析器（迭代 7.0 — 支持分段指令）
 *
 * 职责：用纯逻辑（正则 + 关键词）代替 AI 解析通用指令，
 *       仅在不匹配时回退到 AI 模型。
 *
 * 支持的操作：
 *   - 点赞（like）
 *   - 转发（retweet）
 *   - 浏览（view）
 *   - 导航到首页（navigate home）
 *   - 导航到指定账号（navigate profile）
 *   - 评论（comment）—— 仅识别意图，评论内容仍需 AI 生成
 *
 * 支持分段指令（逗号/句号分隔）：
 *   "点赞前5条，转发后4条"
 *   "去 @xxx 点赞前3条，转发后2条"
 *
 * Usage:
 *   import { parseCommandLocally } from '../../shared/automation/command-parser'
 *   const result = parseCommandLocally('点赞前 3 条')
 *   if (result.plan) use the plan directly, else fallback to AI.
 */

import type { TaskPlan, TaskSegment, OperationType } from './task-types'

export interface LocalParseResult {
  plan: TaskPlan | null
  needsAI: boolean
  warnings: string[]
}

/**
 * 解析单个段落的指令
 * 如 "点赞前5条" → { action: 'like', count: 5, isTail: false }
 */
function parseSingleSegment(segText: string): { action: OperationType | null; count: number; isTail: boolean } | null {
  const text = segText.toLowerCase().trim()
  let action: OperationType | null = null
  if (/点赞|赞|like|喜欢|thumbs/.test(text)) action = 'like'
  else if (/转发|转推|retweet|rt/.test(text)) action = 'retweet'
  else if (/^浏览|^看\s|^查看|^view|只浏览|只看/.test(text) || /浏览/.test(text)) action = 'view'
  else if (/评论|回复|comment|reply/.test(text)) return null // 评论走 AI

  if (!action) return null

  // 提取数量
  const numMatch = text.match(/(?:前|后|尾|最后)\s*(\d+)|(\d+)\s*(?:条|个|篇)/)
  let count = 1
  let isTail = false

  if (/后|尾|最后/.test(text)) isTail = true

  if (numMatch) {
    count = parseInt(numMatch[1] || numMatch[2], 10)
    if (isNaN(count) || count < 1) count = 1
  } else {
    // 有"前"但无数值默认 1
    if (/前/.test(text)) count = 1
  }

  return { action, count, isTail }
}

/**
 * 本地解析自然语言指令
 * 匹配成功返回 plan，失败返回 needsAI = true
 */
export function parseCommandLocally(input: string): LocalParseResult {
  const text = input.trim()
  if (!text) {
    return { plan: null, needsAI: true, warnings: ['输入为空'] }
  }

  const lower = text.toLowerCase()
  const warnings: string[] = []

  // ==================== 辅助函数 ====================

  /** 提取数字（第一个匹配的数字，默认 1） */
  function extractCount(regex: RegExp, defaultVal: number = 1): number {
    const m = lower.match(regex)
    if (m && m[1] !== undefined) {
      const n = parseInt(m[1], 10)
      return isNaN(n) || n < 1 ? defaultVal : n
    }
    return defaultVal
  }

  /**
   * 从指令中提取目标账号
   */
  function extractTargetAccount(): string | null {
    const patterns = [
      /@([a-zA-Z0-9_]{2,30})/,
      /(?:去|到|进入|打开|访问)\s*@?([a-zA-Z0-9_]{2,30})\s*(?:的)?(?:主页|首页|个人页|页面|账号)?/,
      /([a-zA-Z0-9_]{2,30})\s*(?:的)?(?:账号|主页|首页)\s*(?:下)?/
    ]
    for (const p of patterns) {
      const m = lower.match(p)
      if (m && m[1]) return m[1]
    }
    return null
  }

  const targetAccount = extractTargetAccount()

  // ==================== 分段检测 ====================
  // "浏览5条内容，点赞前3条，转发后2条" → 3 个段落
  // "去首页点赞前5条，转发后4条" → 2 个段落
  // "浏览5条并点赞前3条" → "并" "且" 也作为分隔符
  const segments_raw = text.split(/(?:[,，、。. ；;]|并|且)/).map(s => s.trim()).filter(s => s.length > 0)

  // 解析每个段落
  const parsedSegments: { action: OperationType; count: number; isTail: boolean }[] = []
  for (const seg of segments_raw) {
    const result = parseSingleSegment(seg)
    if (result && result.action) {
      parsedSegments.push(result as { action: OperationType; count: number; isTail: boolean })
    }
  }

  // 多段指令 → 按出现顺序分配位置范围
  if (parsedSegments.length >= 2) {
    let currentPos = 1
    const segments: TaskSegment[] = []
    let totalCount = 0

    for (const ps of parsedSegments) {
      totalCount += ps.count
    }

    for (const ps of parsedSegments) {
      const endPos = currentPos + ps.count - 1
      segments.push({
        start: currentPos,
        end: endPos,
        operations: [ps.action]
      })
      currentPos = endPos + 1
    }

    // 计算 like_budget（从所有段中累计）
    let likeBudget = 0
    const allOps: OperationType[] = []
    for (const seg of segments) {
      for (const op of seg.operations) {
        if (!allOps.includes(op)) allOps.push(op)
        if (op === 'like') likeBudget += (seg.end - seg.start + 1)
      }
    }

    const plan: TaskPlan = {
      action: 'targeted_interaction',
      target_accounts: targetAccount ? [targetAccount] : [],
      operations: allOps,
      constraints: {
        view_count: totalCount,
        like_count: likeBudget,
        selective: false
      },
      segments,
      duration_minutes: 0,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // ==================== 单段指令（原有逻辑） ====================

  // 1. 点赞 + 转发混合（"点赞并转发前3条"）
  if (/点赞|赞|like|喜欢|thumbs/.test(lower) && /转发|转推|retweet|rt/.test(lower)) {
    const count = extractCount(/(?:前\s*)?(\d+)\s*(?:条|个|篇)?/, 1)
    const segments: TaskSegment[] = [
      { start: 1, end: count, operations: ['like', 'retweet'] }
    ]
    const plan: TaskPlan = {
      action: 'targeted_interaction',
      target_accounts: targetAccount ? [targetAccount] : [],
      operations: ['like', 'retweet'],
      constraints: {
        view_count: count,
        like_count: count,
        selective: false
      },
      segments,
      duration_minutes: 0,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // 2. 点赞
  if (/点赞|赞|like|喜欢|thumbs/.test(lower)) {
    const count = extractCount(/(?:前\s*)?(\d+)\s*(?:条|个|篇)?/, 1)
    const indexMatch = lower.match(/第\s*(\d+)\s*条/)
    const plan: TaskPlan = {
      action: 'targeted_interaction',
      target_accounts: targetAccount ? [targetAccount] : [],
      operations: ['like'],
      constraints: {
        view_count: count,
        like_count: count,
        selective: false,
        position_plan: indexMatch ? `1-${count}:like` : undefined
      },
      duration_minutes: 0,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // 3. 转发
  if (/转发|转推|retweet|rt/.test(lower)) {
    const count = extractCount(/(?:前\s*)?(\d+)\s*(?:条|个|篇)?/, 1)
    const plan: TaskPlan = {
      action: 'targeted_interaction',
      target_accounts: targetAccount ? [targetAccount] : [],
      operations: ['retweet'],
      constraints: {
        view_count: count,
        like_count: 0,
        selective: false
      },
      duration_minutes: 0,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // 4. 浏览
  if (/^浏览|^看\s|^查看|^view|只浏览|只看/.test(lower) || /浏览/.test(lower)) {
    const count = extractCount(/(?:前\s*)?(\d+)\s*(?:条|个|篇)?/, 5)
    const plan: TaskPlan = {
      action: 'targeted_interaction',
      target_accounts: targetAccount ? [targetAccount] : [],
      operations: ['view'],
      constraints: {
        view_count: count,
        like_count: 0,
        selective: false
      },
      duration_minutes: 0,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // 5. 导航到首页
  if (/^(?:去\s*)?(?:首页|主页|时间线|home|timeline)\s*$/.test(lower)) {
    const plan: TaskPlan = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['view'],
      constraints: {
        view_count: 1,
        like_count: 0,
        selective: false
      },
      duration_minutes: 1,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // 6. 纯导航到指定账号
  if (targetAccount && !/点赞|赞|转发|转推|浏览|评论/.test(lower)) {
    const plan: TaskPlan = {
      action: 'targeted_interaction',
      target_accounts: [targetAccount],
      operations: ['view'],
      constraints: {
        view_count: 1,
        like_count: 0,
        selective: false
      },
      duration_minutes: 0,
      pause_after: false,
      raw_command: input
    }
    return { plan, needsAI: false, warnings }
  }

  // 7. 评论（走 AI）
  if (/评论|回复|comment|reply/.test(lower)) {
    return { plan: null, needsAI: true, warnings: ['评论内容需 AI 生成'] }
  }

  // 8. 未匹配
  return { plan: null, needsAI: true, warnings: ['未能通过关键词解析，需要 AI 辅助'] }
}