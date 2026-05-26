/**
 * AI 服务 API 封装（迭代 3.0）
 * 调用主进程 Express 提供的 /api/v1/ai/* 接口
 */

import request from './request'
import type { TaskPlan } from '../../shared/automation/task-types'

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

export interface GenerateCommentResult {
  comment: string
  language: {
    code: string
    name: string
    isEmojiOnly: boolean
    instruction: string
  }
  rawOutput: string
  fallbackToEmoji: boolean
  retries: number
}

// ==================== API 函数 ====================

/** AI 服务超时设置（评论 32B 思考可能需要 10 分钟） */
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
 * @param command 用户输入的自然语言
 * @param platformId 平台（默认 twitter）
 * @param taskId 可选任务 ID（便于后续 cancel）
 */
export async function parseCommand(
  command: string,
  platformId: string = 'twitter',
  taskId?: string
): Promise<ParseCommandResult> {
  const res = await request.post<any>(
    '/ai/parse-command',
    { command, platformId, taskId },
    { timeout: AI_REQUEST_TIMEOUT }
  )
  return res.data.data
}

/**
 * 根据推文文本生成评论
 */
export async function generateComment(
  text: string,
  platformId: string = 'twitter',
  options: { taskId?: string; forceEmoji?: boolean } = {}
): Promise<GenerateCommentResult> {
  const res = await request.post<any>(
    '/ai/generate-comment',
    { text, platformId, ...options },
    { timeout: AI_REQUEST_TIMEOUT }
  )
  return res.data.data
}

/**
 * 取消正在运行的 AI 任务
 */
export async function cancelAITask(taskId: string): Promise<{ canceled: boolean }> {
  const res = await request.post<any>(`/ai/cancel/${encodeURIComponent(taskId)}`)
  return res.data.data
}

// ==================== 迭代 3.5: 任务执行 ====================

export interface ExecuteTaskResponse {
  taskId: string
}

export interface TaskStatus {
  taskId: string
  progress: import('../../shared/automation/task-types').TaskProgress | null
  logs: string[]
  running: boolean
}

/**
 * 启动任务执行（在指定 Profile 的浏览器中执行 TaskPlan）
 */
export async function executeAITask(
  profileId: number,
  plan: import('../../shared/automation/task-types').TaskPlan
): Promise<ExecuteTaskResponse> {
  const res = await request.post<any>('/ai/execute', { profileId, plan })
  return res.data.data
}

/**
 * 获取任务执行状态
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const res = await request.get<any>(`/ai/execute/${encodeURIComponent(taskId)}/status`)
  return res.data.data
}

/**
 * 中止任务执行
 */
export async function abortTask(taskId: string): Promise<{ canceled: boolean }> {
  const res = await request.post<any>(`/ai/execute/${encodeURIComponent(taskId)}/abort`)
  return res.data.data
}
