import { describe, it, expect, vi } from 'vitest'
import { retry, RetryAbortedError, RetryExhaustedError } from '../retry'

describe('retry', () => {
  it('一次成功不重试', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('失败后能重试并最终成功', async () => {
    let attempts = 0
    const fn = vi.fn().mockImplementation(async () => {
      attempts++
      if (attempts < 3) throw new Error('fail ' + attempts)
      return 'ok'
    })
    const result = await retry(fn, { maxRetries: 3, initialDelay: 10, backoffFactor: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('超过最大重试次数抛 RetryExhaustedError', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'))
    await expect(
      retry(fn, { maxRetries: 2, initialDelay: 10, backoffFactor: 1 })
    ).rejects.toBeInstanceOf(RetryExhaustedError)
    expect(fn).toHaveBeenCalledTimes(3)  // 首次 + 2 次重试
  })

  it('abortChecker 触发抛 RetryAbortedError', async () => {
    let abort = false
    const fn = vi.fn().mockImplementation(async () => {
      abort = true
      throw new Error('fail')
    })
    await expect(
      retry(fn, {
        maxRetries: 5,
        initialDelay: 50,
        abortChecker: () => abort
      })
    ).rejects.toBeInstanceOf(RetryAbortedError)
  })

  it('onRetry 回调被调用', async () => {
    const onRetry = vi.fn()
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    await retry(fn, { maxRetries: 2, initialDelay: 10, backoffFactor: 1, onRetry }).catch(() => {})
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry.mock.calls[0][0]).toBe(1)  // attempt
    expect(onRetry.mock.calls[1][0]).toBe(2)
  })

  it('指数退避：delay 应递增', async () => {
    const delays: number[] = []
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    await retry(fn, {
      maxRetries: 2,
      initialDelay: 10,
      backoffFactor: 2,
      maxDelay: 1000,
      onRetry: (_a, _e, d) => delays.push(d)
    }).catch(() => {})
    expect(delays.length).toBe(2)
    expect(delays[0]).toBeLessThan(delays[1])
  })
})