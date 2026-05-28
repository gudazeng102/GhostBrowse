/**
 * AI 服务 API 封装
 * 调用主进程 Express 提供的 /api/v1/ai/* 接口
 * 
 * 群控管理中使用的功能：
 *   - getAIHealth(): Ollama 健康检查
 *   - parseCommand(): 自然语言 → TaskPlan（含本地关键词解析回退）
 */

import request from './request'
import type { TaskPlan } from '../../shared/automation/task-types'
import { parseCommandLocally } from '../../shared/automation/command-parser'

// ==================== 类型定义 ====================

export interface AIHealthInfo {
  online: boolean
  host: string
  defaultModel: string
  models?: string[]
  defaultModelInstalled?: boolean
  durationMs: number
  error?: string
}

export interface ParseCommandResult {
  plan: TaskPlan
  warnings: string[]
  rawOutput: string
  retries: number
}

// ==================== API 函数 ====================

/** AI 请求超时 */
const AI_REQUEST_TIMEOUT = 15 * 60 * 1000

/**
 * 健康检查
 */
export async function getAIHealth(): Promise<AIHealthInfo> {
  const res = await request.get<any>('/ai/health', {
    timeout: 30 * 1000
  })
  return res.data.data
}

/**
 * 解析自然语言指令为 TaskPlan
 * 先尝试本地关键词解析（0 延迟），不命中再走 AI
 */
export async function parseCommand(
  command: string,
  platformId: string = 'twitter',
  taskId?: string
): Promise<ParseCommandResult> {
  const localResult = parseCommandLocally(command)
  if (localResult.plan && !localResult.needsAI) {
    console.log(`[ParseCommand] 本地关键词解析命中: "${command}" →`, localResult.plan)
    return {
      plan: localResult.plan,
      warnings: localResult.warnings,
      rawOutput: command,
      retries: 0
    }
  }

  console.log(`[ParseCommand] 本地解析未命中，回退到 AI: "${command}"`)
  const res = await request.post<any>(
    '/ai/parse-command',
    { command, platformId, taskId },
    { timeout: AI_REQUEST_TIMEOUT }
  )
  return res.data.data
}