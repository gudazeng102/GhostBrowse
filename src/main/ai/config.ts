/**
 * AI 服务配置
 * 优先读取环境变量，提供合理默认值
 */

export interface AIConfig {
  /** Ollama 服务 host（如 http://10.0.0.115:11434） */
  ollamaHost: string
  /** 默认模型 */
  defaultModel: string
  /** 评论生成模型（可与默认模型不同，便于用更小模型评论） */
  commentModel: string
  /** 命令解析模型 */
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
    ollamaHost: (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, ''),
    // 默认模型：qwen3:32b-q4_K_M（高质量但较慢，需 ~20GB 显存）
    defaultModel: process.env.OLLAMA_MODEL || 'qwen3:32b-q4_K_M',
    commentModel: process.env.OLLAMA_COMMENT_MODEL || process.env.OLLAMA_MODEL || 'qwen3:32b-q4_K_M',
    commandModel: process.env.OLLAMA_COMMAND_MODEL || process.env.OLLAMA_MODEL || 'qwen3:32b-q4_K_M',
    // 32B 模型评论思考较慢，超时给到 10 分钟
    requestTimeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '600000', 10),
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