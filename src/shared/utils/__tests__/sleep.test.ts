import { describe, it, expect } from 'vitest'
import { sleep, sleepFixed } from '../sleep'

describe('sleep', () => {
  it('单参数固定延迟', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(150)
  })

  it('范围延迟应在 [min, max] 之间', async () => {
    const start = Date.now()
    await sleep(30, 80)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(25)
    expect(elapsed).toBeLessThan(180)
  })

  it('sleepFixed 精确延迟', async () => {
    const start = Date.now()
    await sleepFixed(40)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(35)
  })

  it('返回 Promise', () => {
    const p = sleep(1)
    expect(p).toBeInstanceOf(Promise)
  })
})