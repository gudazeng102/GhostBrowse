import { describe, it, expect, vi } from 'vitest'
import { Logger } from '../logger'

describe('Logger', () => {
  it('能注册并触发 handler', () => {
    const logger = new Logger('TEST')
    const handler = vi.fn()
    logger.addHandler(handler)
    logger.info('hello')

    expect(handler).toHaveBeenCalledTimes(1)
    const entry = handler.mock.calls[0][0]
    expect(entry.level).toBe('info')
    expect(entry.message).toBe('[TEST] hello')
    expect(entry.time).toBeTypeOf('number')
  })

  it('支持多个 handler', () => {
    const logger = new Logger()
    const h1 = vi.fn()
    const h2 = vi.fn()
    logger.addHandler(h1)
    logger.addHandler(h2)
    logger.warning('w')

    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('能移除 handler', () => {
    const logger = new Logger()
    const h = vi.fn()
    logger.addHandler(h)
    logger.removeHandler(h)
    logger.info('x')
    expect(h).not.toHaveBeenCalled()
  })

  it('handler 抛错不影响主流程', () => {
    const logger = new Logger()
    logger.addHandler(() => { throw new Error('boom') })
    const ok = vi.fn()
    logger.addHandler(ok)
    expect(() => logger.info('x')).not.toThrow()
    expect(ok).toHaveBeenCalled()
  })

  it('child Logger 共享 handlers + 拼接 prefix', () => {
    const parent = new Logger('A')
    const handler = vi.fn()
    parent.addHandler(handler)
    const child = parent.child('B')
    child.error('msg')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].message).toBe('[A:B] msg')
  })

  it('支持所有 5 个级别', () => {
    const logger = new Logger()
    const handler = vi.fn()
    logger.addHandler(handler)
    logger.debug('d')
    logger.info('i')
    logger.success('s')
    logger.warning('w')
    logger.error('e')
    expect(handler).toHaveBeenCalledTimes(5)
    expect(handler.mock.calls.map(c => c[0].level)).toEqual(['debug', 'info', 'success', 'warning', 'error'])
  })
})