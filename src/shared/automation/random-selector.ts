/**
 * 随机选择工具
 * 来自 yanghao.js TwitterWarmer.selectRandomIndices 的重写版
 *
 * 改进：
 * - 支持注入随机源（便于测试）
 * - 复杂度优化：使用 Fisher-Yates shuffle
 */

export type RandomFn = () => number

/**
 * 从 [0, total) 中随机选 count 个不重复索引（升序返回）
 * @param total 总数
 * @param count 选择数量
 * @param rng 可选随机函数（默认 Math.random，用于测试时注入确定性 RNG）
 * @returns 升序排列的索引数组
 */
export function selectRandomIndices(
  total: number,
  count: number,
  rng: RandomFn = Math.random
): number[] {
  if (total <= 0 || count <= 0) return []

  const actualCount = Math.min(count, total)

  // 构建 [0, total) 池
  const pool: number[] = []
  for (let i = 0; i < total; i++) pool.push(i)

  // Fisher-Yates 部分洗牌（只洗前 actualCount 项）
  for (let i = 0; i < actualCount; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }

  return pool.slice(0, actualCount).sort((a, b) => a - b)
}

/**
 * 创建一个种子伪随机函数（mulberry32）
 * 用于测试或需要可重现结果的场景
 */
export function createSeededRng(seed: number): RandomFn {
  let s = seed >>> 0
  return function() {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 加权随机选一个元素
 * @param items 候选项
 * @param weights 与 items 等长的权重数组
 * @param rng 可选随机函数
 */
export function weightedPick<T>(items: T[], weights: number[], rng: RandomFn = Math.random): T | null {
  if (items.length === 0 || items.length !== weights.length) return null
  let total = 0
  for (const w of weights) total += Math.max(0, w)
  if (total <= 0) return null

  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i])
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}