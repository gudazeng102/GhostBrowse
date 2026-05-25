import { describe, it, expect } from 'vitest'
import { selectRandomIndices, createSeededRng, weightedPick } from '../random-selector'

describe('selectRandomIndices', () => {
  it('返回升序排列', () => {
    const result = selectRandomIndices(10, 3, createSeededRng(42))
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1])
    }
  })

  it('数量不超过总数', () => {
    const result = selectRandomIndices(5, 10)
    expect(result.length).toBe(5)
  })

  it('种子 RNG 结果可重现', () => {
    const rng1 = createSeededRng(123)
    const rng2 = createSeededRng(123)
    const r1 = selectRandomIndices(100, 5, rng1)
    const r2 = selectRandomIndices(100, 5, rng2)
    expect(r1).toEqual(r2)
  })

  it('不同种子结果不同', () => {
    const r1 = selectRandomIndices(100, 5, createSeededRng(1))
    const r2 = selectRandomIndices(100, 5, createSeededRng(2))
    expect(r1).not.toEqual(r2)
  })

  it('0 总数返回空', () => {
    expect(selectRandomIndices(0, 5)).toEqual([])
  })

  it('0 选择返回空', () => {
    expect(selectRandomIndices(10, 0)).toEqual([])
  })

  it('不重复', () => {
    const result = selectRandomIndices(20, 10, createSeededRng(99))
    const set = new Set(result)
    expect(set.size).toBe(result.length)
  })

  it('所有值在 [0, total) 范围内', () => {
    const result = selectRandomIndices(50, 20, createSeededRng(7))
    for (const idx of result) {
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(50)
    }
  })
})

describe('createSeededRng', () => {
  it('返回 [0, 1) 范围', () => {
    const rng = createSeededRng(42)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('weightedPick', () => {
  it('空输入返回 null', () => {
    expect(weightedPick([], [])).toBeNull()
  })

  it('长度不匹配返回 null', () => {
    expect(weightedPick([1, 2], [1])).toBeNull()
  })

  it('单元素必然返回该元素', () => {
    expect(weightedPick(['a'], [10])).toBe('a')
  })

  it('权重 0 的元素不被选中（极端情况）', () => {
    // 用确定性 RNG 确保不偶然选中
    const result = weightedPick(['a', 'b'], [0, 10], createSeededRng(1))
    expect(result).toBe('b')
  })

  it('全 0 权重返回 null', () => {
    expect(weightedPick(['a', 'b'], [0, 0])).toBeNull()
  })
})