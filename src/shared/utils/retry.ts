/**
 * 通用重试工具
 * 支持指数退避、最大重试次数、可中断
 */

export interface RetryOptions {
  /** 最大重试次数（不含首次执行），默认 3 */
  maxRetries?: number
  /** 初始延迟毫秒数，默认 500 */
  initialDelay?: number
  /** 最大延迟毫秒数，默认 10000 */
  maxDelay?: number
  /** 退避倍数，默认 2 */
  backoffFactor?: number
  /** 中断检查器，返回 true 时立即停止重试 */
  abortChecker?: () => boolean
  /** 每次重试前的回调（可用于日志） */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void
}

export class RetryAbortedError extends Error {
  constructor(message: string = '重试已被中断') {
    super(message)
    this.name = 'RetryAbortedError'
  }
}

export class RetryExhaustedError extends Error {
  public readonly lastError: Error
  constructor(lastError: Error, attempts: number) {
    super(`重试 ${attempts} 次后仍失败: ${lastError.message}`)
    this.name = 'RetryExhaustedError'
    this.lastError = lastError
  }
}

/**
 * 重试执行一个 Promise 函数
 * @param fn 要执行的异步函数
 * @param options 重试配置
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 500,
    maxDelay = 10000,
    backoffFactor = 2,
    abortChecker,
    onRetry
  } = options

  let lastError: Error | undefined
  let delay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortChecker && abortChecker()) {
      throw new RetryAbortedError()
    }

    try {
      return await fn()
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt >= maxRetries) break

      if (onRetry) {
        try {
          onRetry(attempt + 1, lastError, delay)
        } catch {
          // 回调异常不影响主流程
        }
      }

      // 延迟时也支持中断
      const start = Date.now()
      while (Date.now() - start < delay) {
        if (abortChecker && abortChecker()) {
          throw new RetryAbortedError()
        }
        await new Promise(r => setTimeout(r, Math.min(100, delay - (Date.now() - start))))
      }

      delay = Math.min(delay * backoffFactor, maxDelay)
    }
  }

  throw new RetryExhaustedError(lastError!, maxRetries + 1)
}