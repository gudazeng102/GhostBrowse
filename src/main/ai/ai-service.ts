/**
 * AI 服务统一入口
 *
 * 职责：
 * - 提供 health check（连通性 + 模型可用性）
 * - 任务级别的取消（按 taskId 注册 AbortController）
 * - 主进程中长生命周期的单例
 */

import { OllamaClient } from '../../shared/ai/ollama-client'
import { Logger } from '../../shared/utils/logger'
import { loadAIConfig } from './config'
import { parseCommand, ParseCommandResult } from './command-parser'
import { generateComment, GenerateCommentOptions, GenerateCommentResult } from './comment-generator'

const logger = new Logger('AIService')

export interface HealthCheckResult {
  /** Ollama 服务是否在线 */
  online: boolean
  /** 服务地址 */
  host: string
  /** 默认模型 */
  defaultModel: string
  /** 已加载的模型列表（仅在线时有值） */
  models?: string[]
  /** 默认模型是否已下载 */
  defaultModelInstalled?: boolean
  /** 错误信息（仅离线/异常时有值） */
  error?: string
  /** 健康检查耗时 ms */
  durationMs: number
}

class AIService {
  /** taskId → AbortController */
  private abortControllers = new Map<string, AbortController>()

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const config = loadAIConfig()
    const start = Date.now()

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(`${config.ollamaHost}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timer)

      if (!res.ok) {
        return {
          online: false,
          host: config.ollamaHost,
          defaultModel: config.defaultModel,
          error: `HTTP ${res.status}`,
          durationMs: Date.now() - start
        }
      }

      const data = (await res.json()) as { models?: Array<{ name: string }> }
      const models = (data.models || []).map(m => m.name)

      return {
        online: true,
        host: config.ollamaHost,
        defaultModel: config.defaultModel,
        models,
        defaultModelInstalled: models.includes(config.defaultModel),
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        online: false,
        host: config.ollamaHost,
        defaultModel: config.defaultModel,
        error: err.message || String(err),
        durationMs: Date.now() - start
      }
    }
  }

  /**
   * 注册一个任务（创建 AbortController），返回 signal 供下游使用
   * 同 taskId 重复注册会先取消旧的
   */
  registerTask(taskId: string): AbortSignal {
    const existing = this.abortControllers.get(taskId)
    if (existing) {
      existing.abort()
    }
    const controller = new AbortController()
    this.abortControllers.set(taskId, controller)
    return controller.signal
  }

  /**
   * 取消指定任务
   */
  cancelTask(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(taskId)
      logger.info(`任务 ${taskId} 已取消`)
      return true
    }
    return false
  }

  /**
   * 任务完成后清理
   */
  unregisterTask(taskId: string): void {
    this.abortControllers.delete(taskId)
  }

  /**
   * 解析用户命令（自动管理 AbortController）
   */
  async parseCommand(
    userCommand: string,
    options?: {
      platformId?: string
      taskId?: string
    }
  ): Promise<ParseCommandResult> {
    const taskId = options?.taskId
    const signal = taskId ? this.registerTask(taskId) : undefined

    try {
      return await parseCommand(userCommand, options?.platformId || 'twitter', signal)
    } finally {
      if (taskId) this.unregisterTask(taskId)
    }
  }

  /**
   * 生成评论
   */
  async generateComment(
    tweetText: string,
    options?: GenerateCommentOptions & { taskId?: string }
  ): Promise<GenerateCommentResult> {
    const taskId = options?.taskId
    const signal = taskId ? this.registerTask(taskId) : options?.signal

    try {
      return await generateComment(tweetText, { ...options, signal })
    } finally {
      if (taskId) this.unregisterTask(taskId)
    }
  }

  /**
   * 直接对 Ollama 做一次原始 generate 调用（调试 / 灵活扩展）
   */
  async rawGenerate(prompt: string, model?: string, signal?: AbortSignal) {
    const config = loadAIConfig()
    const client = new OllamaClient({
      baseUrl: config.ollamaHost,
      model: model || config.defaultModel,
      timeout: config.requestTimeoutMs
    })
    return client.generate(prompt, { signal })
  }
}

export const aiService = new AIService()
export type { ParseCommandResult, GenerateCommentResult, GenerateCommentOptions }