/**
 * 评论生成器
 * 基于推文内容用 Ollama AI 生成评论
 *
 * 流程：tweetText → detectLanguage → buildPrompt → Ollama → cleanComment → 评论
 */

import { OllamaClient } from '../../shared/ai/ollama-client'
import { detectLanguage, LanguageInfo } from '../../shared/ai/language-detector'
import { buildCommentPrompt, pickRandomEmoji } from '../../shared/ai/prompts/comment-reply'
import { getPlatformById } from '../../shared/platforms'
import { Logger } from '../../shared/utils/logger'
import { retry } from '../../shared/utils/retry'
import { loadAIConfig } from './config'

const logger = new Logger('CommentGenerator')

export interface GenerateCommentOptions {
  /** 平台 ID（默认 twitter） */
  platformId?: string
  /** AbortSignal */
  signal?: AbortSignal
  /** 强制使用 emoji（如检测到不支持的语言时） */
  forceEmoji?: boolean
}

export interface GenerateCommentResult {
  /** 最终评论文本 */
  comment: string
  /** 检测到的语言 */
  language: LanguageInfo
  /** AI 原始输出（用于调试） */
  rawOutput: string
  /** 是否走了 emoji 兜底 */
  fallbackToEmoji: boolean
  /** 重试次数 */
  retries: number
}

/**
 * 生成评论
 * @param tweetText 推文/帖子原文
 * @param options 选项
 */
export async function generateComment(
  tweetText: string,
  options: GenerateCommentOptions = {}
): Promise<GenerateCommentResult> {
  const config = loadAIConfig()
  const platformId = options.platformId || 'twitter'
  const platform = getPlatformById(platformId)
  if (!platform) {
    throw new Error(`未知平台: ${platformId}`)
  }

  // 1. 检测语言
  const language = detectLanguage(tweetText)

  // 2. 仅 emoji 内容或强制走 emoji 兜底
  if (language.isEmojiOnly || options.forceEmoji) {
    const emoji = pickRandomEmoji()
    logger.info(`emoji 兜底: lang=${language.code}, comment=${emoji}`)
    return {
      comment: emoji,
      language,
      rawOutput: '',
      fallbackToEmoji: true,
      retries: 0
    }
  }

  // 3. 构建 prompt
  const prompt = buildCommentPrompt(tweetText, language)

  // 4. 创建 Ollama client
  // 关闭 think 模式 → 评论生成速度提升 5~10 倍；评论是短文本，不需要长思考
  const client = new OllamaClient({
    baseUrl: config.ollamaHost,
    model: config.commentModel,
    timeout: config.requestTimeoutMs,
    // 评论用稍高一点的温度让结果更自然
    temperature: 0.7,
    topP: 0.9,
    numPredict: 200,
    numCtx: 2048,
    think: false
  })

  let lastRaw = ''
  let retries = 0

  try {
    const comment = await retry(
      async () => {
        const resp = await client.generate(prompt, { signal: options.signal })
        lastRaw = resp.content

        // 平台特定清洗（含 think 检测、长度裁剪、前缀去除）
        const cleaned = platform.cleanComment(resp.content, language)
        if (!cleaned) {
          throw new Error('清洗后评论为空')
        }
        return cleaned
      },
      {
        maxRetries: config.commentMaxRetries,
        initialDelay: 800,
        backoffFactor: 2,
        maxDelay: 5000,
        abortChecker: () => options.signal?.aborted === true,
        onRetry: (attempt, err, delay) => {
          retries = attempt
          logger.warning(`generateComment 重试 #${attempt}: ${err.message}, ${delay}ms 后重试`)
        }
      }
    )

    return {
      comment,
      language,
      rawOutput: lastRaw,
      fallbackToEmoji: false,
      retries
    }
  } catch (err: any) {
    // 终极兜底：返回 emoji
    logger.error(`generateComment 全部重试失败，回退到 emoji: ${err.message}`)
    return {
      comment: pickRandomEmoji(),
      language,
      rawOutput: lastRaw,
      fallbackToEmoji: true,
      retries
    }
  }
}