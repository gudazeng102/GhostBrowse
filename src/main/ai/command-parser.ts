/**
 * 命令解析器
 * 将用户自然语言指令通过 AI（DeepSeek）解析为 TaskPlan
 *
 * 流程：userCommand → buildPrompt → DeepSeek → extractJSON → normalizePlan → TaskPlan
 */

import { DeepSeekClient } from '../../shared/ai/deepseek-client'
import { extractValidJSON } from '../../shared/ai/json-extractor'
import { stripThinkingBlocks } from '../../shared/ai/thinking-filter'
import { buildTwitterCommandPrompt } from '../../shared/ai/prompts/twitter-command'
import { normalizePlan, validatePlan } from '../../shared/automation/task-validator'
import { TaskPlan } from '../../shared/automation/task-types'
import { getPlatformById } from '../../shared/platforms'
import { Logger } from '../../shared/utils/logger'
import { retry } from '../../shared/utils/retry'
import { loadAIConfig } from './config'

const logger = new Logger('CommandParser')

export interface ParseCommandResult {
  /** 解析后的计划 */
  plan: TaskPlan
  /** 校验警告 */
  warnings: string[]
  /** AI 原始输出 */
  rawOutput: string
  /** 重试次数 */
  retries: number
}

/**
 * 解析用户指令
 * @param userCommand 用户自然语言指令
 * @param platformId 平台 ID（默认 twitter）
 * @param signal AbortSignal
 */
export async function parseCommand(
  userCommand: string,
  platformId: string = 'twitter',
  signal?: AbortSignal
): Promise<ParseCommandResult> {
  const config = loadAIConfig()
  const platform = getPlatformById(platformId)
  if (!platform) {
    throw new Error(`未知平台: ${platformId}`)
  }

  // 构建 prompt
  const prompt = buildTwitterCommandPrompt(userCommand)

  // 创建 AI 客户端
  const client = new DeepSeekClient({
    apiKey: config.deepseekApiKey,
    baseUrl: config.deepseekBaseUrl,
    model: config.deepseekModel,
    timeout: config.requestTimeoutMs,
    // 命令解析用低温度确保稳定输出
    temperature: 0.0,
    topP: 0.1,
    maxTokens: 512
  })

  let lastRaw = ''
  let retries = 0

  const plan = await retry(
    async () => {
      const resp = await client.generate(prompt, { signal })
      lastRaw = resp.content

      // 去 think 块（content 内有时也含 <think>）
      const cleaned = stripThinkingBlocks(resp.content)

      // 提取 JSON
      const json = extractValidJSON(cleaned, { requireKey: 'action' })
      if (!json) {
        throw new Error(`AI 输出无法提取有效 JSON: ${resp.content.substring(0, 100)}`)
      }

      // 规范化
      try {
        return normalizePlan(json, userCommand)
      } catch (e: any) {
        throw new Error(`normalizePlan 失败: ${e.message}`)
      }
    },
    {
      maxRetries: config.commandMaxRetries,
      initialDelay: 1000,
      backoffFactor: 2,
      maxDelay: 8000,
      abortChecker: () => signal?.aborted === true,
      onRetry: (attempt, err, delay) => {
        retries = attempt
        logger.warning(`parseCommand 重试 #${attempt}: ${err.message}, ${delay}ms 后重试`)
      }
    }
  )

  // 校验
  const validation = validatePlan(plan)
  if (!validation.valid) {
    throw new Error(`解析后 plan 仍不合法: ${validation.errors.join('; ')}`)
  }

  return {
    plan,
    warnings: validation.warnings,
    rawOutput: lastRaw,
    retries
  }
}