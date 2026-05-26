/**
 * Ollama API 客户端
 * 来自 yanghao.js LocalAIAgent 的重写版
 *
 * 改进：
 * - 使用标准 fetch 替代 GM_xmlhttpRequest（Node / Browser 通用）
 * - 支持 AbortController 全链路取消
 * - 配置外置化（url / model / 超时 / temperature）
 */

export interface OllamaConfig {
  /** Ollama API 地址，默认 http://127.0.0.1:11434 */
  baseUrl?: string
  /** 模型名称，默认 qwen3-twitter */
  model?: string
  /** 请求超时毫秒数，默认 600000（10 分钟） */
  timeout?: number
  /** 温度，默认 0.0 */
  temperature?: number
  /** top_p，默认 0.1 */
  topP?: number
  /** 上下文长度，默认 8192 */
  numCtx?: number
  /** 最大预测 token 数，默认 800 */
  numPredict?: number
  /**
   * 是否启用思考模式（仅 qwen3 等思考模型有效）
   * 设为 false 可极大提升速度（5~10 倍），适合结构化输出和短文本生成
   * 默认 false（追求速度）
   */
  think?: boolean
}

export interface OllamaResponse {
  content: string
  thinking: string
  /** 总耗时毫秒 */
  duration: number
  /** 提取来源（content / thinking / 等） */
  extractSource?: string
}

export type ProgressCallback = (elapsed: number, message: string) => void

const DEFAULT_CONFIG: Required<OllamaConfig> = {
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen3-twitter',
  timeout: 600000,
  temperature: 0.0,
  topP: 0.1,
  numCtx: 8192,
  numPredict: 800,
  think: false
}

export class OllamaClient {
  public readonly config: Required<OllamaConfig>
  private isAvailable: boolean = false

  constructor(config: OllamaConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** 更新配置 */
  updateConfig(partial: Partial<OllamaConfig>): void {
    Object.assign(this.config, partial)
  }

  /** 检测 Ollama 是否在线 */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timer)

      this.isAvailable = res.ok
      return this.isAvailable
    } catch {
      this.isAvailable = false
      return false
    }
  }

  /** 获取在线状态 */
  getIsAvailable(): boolean {
    return this.isAvailable
  }

  /**
   * 调用 Ollama generate 接口
   * @param prompt 完整 prompt
   * @param options 可选参数
   */
  async generate(
    prompt: string,
    options?: {
      /** 进度回调（每 5 秒调用一次） */
      onProgress?: ProgressCallback
      /** AbortSignal（用于取消） */
      signal?: AbortSignal
    }
  ): Promise<OllamaResponse> {
    const startTime = Date.now()
    let lastProgress = 0

    // 心跳进度
    const heartbeatInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      if (elapsed > lastProgress + 5) {
        lastProgress = elapsed
        options?.onProgress?.(elapsed, `AI思考中...(${elapsed}秒)`)
      }
    }, 5000)

    try {
      const controller = new AbortController()

      // 如果外部 signal 触发，也中止内部 controller
      const externalSignal = options?.signal
      if (externalSignal) {
        if (externalSignal.aborted) {
          throw new Error('用户已暂停')
        }
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }

      // 超时定时器
      const timeoutTimer = setTimeout(() => controller.abort(), this.config.timeout)
      if (externalSignal?.aborted) clearTimeout(timeoutTimer)

      // 双重保险关闭思考模式：
      // 1) Ollama 0.5+ 支持顶层 think 参数（qwen3 等思考模型）
      // 2) qwen3 还支持 prompt 内 `/no_think` 指令（兼容老版 Ollama）
      const finalPrompt = this.config.think ? prompt : `${prompt}\n\n/no_think`

      const requestBody: any = {
        model: this.config.model,
        prompt: finalPrompt,
        stream: false,
        think: this.config.think,
        options: {
          temperature: this.config.temperature,
          top_p: this.config.topP,
          num_ctx: this.config.numCtx,
          num_predict: this.config.numPredict
        }
      }

      const res = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      clearTimeout(timeoutTimer)

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json() as any
      const content: string = data.response || ''
      const thinking: string = data.thinking || ''
      const duration = Date.now() - startTime

      return { content, thinking, duration }
    } finally {
      clearInterval(heartbeatInterval)
    }
  }
}