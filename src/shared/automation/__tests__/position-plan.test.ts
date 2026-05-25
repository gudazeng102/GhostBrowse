import { describe, it, expect } from 'vitest'
import { parsePositionPlan, getMaxPosition, PositionPlanParseError } from '../position-plan'

describe('parsePositionPlan', () => {
  it('null/empty 返回 null', () => {
    expect(parsePositionPlan(null)).toBeNull()
    expect(parsePositionPlan('')).toBeNull()
    expect(parsePositionPlan(undefined)).toBeNull()
  })

  it('简单连续范围', () => {
    const map = parsePositionPlan('1-3:like')!
    expect(map.size).toBe(3)
    expect([...map.get(1)!]).toEqual(['like'])
    expect([...map.get(2)!]).toEqual(['like'])
    expect([...map.get(3)!]).toEqual(['like'])
    expect(map.has(4)).toBe(false)
  })

  it('单点位置', () => {
    const map = parsePositionPlan('5:retweet')!
    expect(map.size).toBe(1)
    expect([...map.get(5)!]).toEqual(['retweet'])
  })

  it('多操作（逗号分隔）', () => {
    const map = parsePositionPlan('1:like,retweet')!
    expect([...map.get(1)!].sort()).toEqual(['like', 'retweet'])
  })

  it('多段（分号分隔）', () => {
    const map = parsePositionPlan('1-2:like;3:comment;5-6:retweet')!
    expect(map.has(1)).toBe(true)
    expect(map.has(2)).toBe(true)
    expect(map.has(3)).toBe(true)
    expect([...map.get(3)!]).toEqual(['comment'])
    expect(map.has(4)).toBe(false)
    expect(map.has(5)).toBe(true)
    expect(map.has(6)).toBe(true)
  })

  it('混合：离散 + 范围', () => {
    const map = parsePositionPlan('1,3,5-7:like')!
    expect(map.size).toBe(5)
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([1, 3, 5, 6, 7])
  })

  it('同位置不同段操作合并', () => {
    const map = parsePositionPlan('1:like;1:retweet')!
    expect([...map.get(1)!].sort()).toEqual(['like', 'retweet'])
  })

  it('totalTweets 限制裁剪', () => {
    const map = parsePositionPlan('1-10:like', { totalTweets: 3 })!
    expect(map.size).toBe(3)
    expect(map.has(4)).toBe(false)
  })

  it('单点超出 totalTweets 被静默丢弃', () => {
    const map = parsePositionPlan('5:like;10:retweet', { totalTweets: 7 })!
    expect(map.has(5)).toBe(true)
    expect(map.has(10)).toBe(false)
  })

  it('strict 模式：超出抛错', () => {
    expect(() =>
      parsePositionPlan('1-10:like', { totalTweets: 3, strict: true })
    ).toThrow(PositionPlanParseError)
  })

  it('未知操作被过滤', () => {
    const map = parsePositionPlan('1:like,xxx,retweet')!
    expect([...map.get(1)!].sort()).toEqual(['like', 'retweet'])
  })

  it('全是未知操作的段被忽略', () => {
    const map = parsePositionPlan('1:xxx;2:like')!
    expect(map.has(1)).toBe(false)
    expect(map.has(2)).toBe(true)
  })

  it('allowedOps 白名单覆盖默认', () => {
    const map = parsePositionPlan('1:like,retweet', { allowedOps: ['like'] })!
    expect([...map.get(1)!]).toEqual(['like'])
  })

  it('忽略空段和多余空格', () => {
    const map = parsePositionPlan(' 1-2 : like ; ; 3 : comment ')!
    expect(map.size).toBe(3)
  })

  it('损坏段在非严格模式被忽略', () => {
    const map = parsePositionPlan('1-2:like;invalid;3:comment')!
    expect(map.has(1)).toBe(true)
    expect(map.has(3)).toBe(true)
  })

  it('反向范围（5-3）非严格被忽略，严格抛错', () => {
    expect(parsePositionPlan('5-3:like')).toBeNull()
    expect(() => parsePositionPlan('5-3:like', { strict: true })).toThrow()
  })

  it('真实案例：1-5:like;6-7:comment;8:retweet', () => {
    const map = parsePositionPlan('1-5:like;6-7:comment;8:retweet')!
    expect(map.size).toBe(8)
    expect([...map.get(1)!]).toEqual(['like'])
    expect([...map.get(5)!]).toEqual(['like'])
    expect([...map.get(6)!]).toEqual(['comment'])
    expect([...map.get(7)!]).toEqual(['comment'])
    expect([...map.get(8)!]).toEqual(['retweet'])
  })

  it('真实案例：1,3,5:like;2:comment;4:retweet', () => {
    const map = parsePositionPlan('1,3,5:like;2:comment;4:retweet')!
    expect(map.size).toBe(5)
    expect([...map.get(1)!]).toEqual(['like'])
    expect([...map.get(2)!]).toEqual(['comment'])
    expect([...map.get(3)!]).toEqual(['like'])
    expect([...map.get(4)!]).toEqual(['retweet'])
    expect([...map.get(5)!]).toEqual(['like'])
  })

  it('真实案例：1-3:like,retweet;4:comment;5-10:view', () => {
    const map = parsePositionPlan('1-3:like,retweet;4:comment;5-10:view')!
    expect([...map.get(1)!].sort()).toEqual(['like', 'retweet'])
    expect([...map.get(4)!]).toEqual(['comment'])
    expect([...map.get(10)!]).toEqual(['view'])
  })
})

describe('getMaxPosition', () => {
  it('null/empty', () => {
    expect(getMaxPosition(null)).toBe(0)
    expect(getMaxPosition('')).toBe(0)
  })

  it('单点', () => {
    expect(getMaxPosition('5:like')).toBe(5)
  })

  it('范围', () => {
    expect(getMaxPosition('1-8:like')).toBe(8)
  })

  it('多段取最大', () => {
    expect(getMaxPosition('1-3:like;7:comment;10-15:view')).toBe(15)
  })

  it('混合', () => {
    expect(getMaxPosition('1,3,5-12:like;20:comment')).toBe(20)
  })
})