/**
 * AI 服务配置（DeepSeek + 可选 Ollama 降级）
 *
 * 默认使用 DeepSeek API；如需切回 Ollama，设置环境变量 AI_PROVIDER=ollama。
 */

export interface AIConfig {
  /** 当前 AI 提供商：deepseek | ollama */
  provider: 'deepseek' | 'ollama'

  // --- DeepSeek 配置 ---
  /** DeepSeek API Key */
  deepseekApiKey: string
  /** DeepSeek API 地址 */
  deepseekBaseUrl: string
  /** DeepSeek 默认模型 */
  deepseekModel: string

  // --- Ollama 配置（保留兼容）---
  ollamaHost: string
  defaultModel: string
  commentModel: string
  commandModel: string

  /** 单次请求超时（ms） */
  requestTimeoutMs: number
  /** 命令解析重试次数 */
  commandMaxRetries: number
  /** 评论生成重试次数 */
  commentMaxRetries: number
}

let cached: AIConfig | null = null

/**
 * 加载 AI 配置（首次调用时读取 env，后续返回缓存）
 */
export function loadAIConfig(): AIConfig {
  if (cached) return cached

  cached = {
    provider: (process.env.AI_PROVIDER || 'deepseek') as 'deepseek' | 'ollama',

    deepseekApiKey: process.env.DEEPSEEK_API_KEY || 'sk-753cdb5b8ce74b9f928aa0db7fcd22f7',
    deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',

    ollamaHost: (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, ''),
    defaultModel: process.env.OLLAMA_MODEL || 'qwen3:32b-q4_K_M',
    commentModel: process.env.OLLAMA_COMMENT_MODEL || process.env.OLLAMA_MODEL || 'qwen3:32b-q4_K_M',
    commandModel: process.env.OLLAMA_COMMAND_MODEL || process.env.OLLAMA_MODEL || 'qwen3:32b-q4_K_M',

    requestTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || '120000', 10),
    commandMaxRetries: parseInt(process.env.AI_COMMAND_RETRIES || '3', 10),
    commentMaxRetries: parseInt(process.env.AI_COMMENT_RETRIES || '1', 10)
  }
  return cached
}

/**
 * 重置配置缓存（仅测试用）
 */
export function _resetAIConfig() {
  cached = null
}