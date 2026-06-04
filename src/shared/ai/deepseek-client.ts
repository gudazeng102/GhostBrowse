/**
 * DeepSeek API 客户端（OpenAI 兼容格式）
 *
 * 用法：
 *   const client = new DeepSeekClient({ apiKey: 'sk-xxx', model: 'deepseek-chat' })
 *   const resp = await client.generate(prompt, { signal })
 *
 * 与 OllamaClient 接口完全一致，便于无缝替换。
 */

export interface DeepSeekConfig {
  /** DeepSeek API Key */
  apiKey?: string
  /** API 地址，默认 https://api.deepseek.com */
  baseUrl?: string
  /** 模型名称，默认 deepseek-chat */
  model?: string
  /** 请求超时毫秒数，默认 120000（2 分钟） */
  timeout?: number
  /** 温度，默认 0.0 */
  temperature?: number
  /** top_p，默认 0.1 */
  topP?: number
  /** 最大预测 token 数，默认 800 */
  maxTokens?: number
}

export interface DeepSeekResponse {
  /** AI 返回的文本内容 */
  content: string
  /** 总耗时毫秒 */
  duration: number
}

export type ProgressCallback = (elapsed: number, message: string) => void

const DEFAULT_CONFIG: Required<Omit<DeepSeekConfig, 'maxTokens'>> & { maxTokens: number } = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  timeout: 120000,
  temperature: 0.0,
  topP: 0.1,
  maxTokens: 800
}

export class DeepSeekClient {
  public readonly config: typeof DEFAULT_CONFIG
  private isAvailable = false

  constructor(config: DeepSeekConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** 更新配置 */
  updateConfig(partial: Partial<DeepSeekConfig>): void {
    Object.assign(this.config, partial)
  }

  /** 检测 DeepSeek API 是否连通 */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
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
   * 调用 DeepSeek chat/completions 接口
   * 接口与 OllamaClient.generate 完全一致，便于无缝替换
   *
   * @param prompt 完整 prompt 文本
   * @param options 可选参数
   */
  async generate(
    prompt: string,
    options?: {
      onProgress?: ProgressCallback
      signal?: AbortSignal
    }
  ): Promise<DeepSeekResponse> {
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

      const requestBody = {
        model: this.config.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: false,
        temperature: this.config.temperature,
        top_p: this.config.topP,
        max_tokens: this.config.maxTokens
      }

      const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      clearTimeout(timeoutTimer)

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`DeepSeek HTTP ${res.status}: ${res.statusText}${errText ? ' - ' + errText : ''}`)
      }

      const data = (await res.json()) as any
      const content: string = data?.choices?.[0]?.message?.content || ''
      const duration = Date.now() - startTime

      return { content, duration }
    } finally {
      clearInterval(heartbeatInterval)
    }
  }
}