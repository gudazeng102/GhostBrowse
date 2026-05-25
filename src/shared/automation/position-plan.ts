/**
 * position_plan 字符串解析器
 * 来自 yanghao.js TwitterWarmer._parsePositionPlan 的重写版
 *
 * 格式示例: "1-5:like;6-7:comment;8:retweet,like"
 * - 分号分隔多个段
 * - 冒号前是位置（支持范围 1-5、离散 1,3,5、混合 1,3,5-8）
 * - 冒号后是操作（逗号分隔多个操作）
 *
 * 修复原版 bug：
 * - 健壮处理空白
 * - 不再静默吞掉超出 totalTweets 的位置（通过 strict 选项控制）
 * - 操作白名单可注入（不同平台支持不同操作）
 */

import { OperationType, SlotMap } from './task-types'

const DEFAULT_OPERATIONS: OperationType[] = ['like', 'retweet', 'comment', 'view']

export interface ParsePositionPlanOptions {
  /** 总条数上限（用于裁剪超出位置） */
  totalTweets?: number
  /** 允许的操作白名单（默认 like/retweet/comment/view） */
  allowedOps?: OperationType[]
  /** 严格模式：超出 totalTweets 时报错而不是裁剪 */
  strict?: boolean
}

export class PositionPlanParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PositionPlanParseError'
  }
}

/**
 * 解析 position_plan 字符串
 * @param planStr 计划字符串
 * @param options 选项
 * @returns SlotMap：位置 → 操作集合
 */
export function parsePositionPlan(
  planStr: string | null | undefined,
  options: ParsePositionPlanOptions = {}
): SlotMap | null {
  if (!planStr || typeof planStr !== 'string') return null

  const { totalTweets = Infinity, allowedOps = DEFAULT_OPERATIONS, strict = false } = options
  const allowedOpsSet = new Set(allowedOps)
  const slotMap: SlotMap = new Map()

  const segments = planStr.split(';').map(s => s.trim()).filter(Boolean)

  for (const seg of segments) {
    const colonIdx = seg.indexOf(':')
    if (colonIdx === -1) {
      if (strict) throw new PositionPlanParseError(`段缺少冒号: "${seg}"`)
      continue
    }

    const posPart = seg.slice(0, colonIdx).trim()
    const opsPart = seg.slice(colonIdx + 1).trim()

    // 解析操作列表
    const ops = opsPart
      .split(',')
      .map(s => s.trim().toLowerCase() as OperationType)
      .filter(s => allowedOpsSet.has(s))

    if (ops.length === 0) {
      if (strict) throw new PositionPlanParseError(`段无有效操作: "${seg}"`)
      continue
    }

    // 解析位置
    const positions = parsePositions(posPart, totalTweets, strict)
    if (positions.size === 0) continue

    // 写入 slotMap
    for (const pos of positions) {
      if (!slotMap.has(pos)) slotMap.set(pos, new Set())
      const set = slotMap.get(pos)!
      for (const op of ops) set.add(op)
    }
  }

  return slotMap.size > 0 ? slotMap : null
}

/**
 * 解析位置部分（"1-5,7,9-12" → Set<number>）
 */
function parsePositions(posPart: string, totalTweets: number, strict: boolean): Set<number> {
  const positions = new Set<number>()
  const ranges = posPart.split(',').map(s => s.trim()).filter(Boolean)

  for (const r of ranges) {
    if (r.includes('-')) {
      const parts = r.split('-').map(s => s.trim())
      if (parts.length !== 2) {
        if (strict) throw new PositionPlanParseError(`无效范围: "${r}"`)
        continue
      }
      const start = Number(parts[0])
      const end = Number(parts[1])
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        if (strict) throw new PositionPlanParseError(`范围非数字: "${r}"`)
        continue
      }
      if (start > end) {
        if (strict) throw new PositionPlanParseError(`范围反向: "${r}"`)
        continue
      }
      for (let idx = Math.max(1, start); idx <= end; idx++) {
        if (idx > totalTweets) {
          if (strict) throw new PositionPlanParseError(`位置 ${idx} 超过总数 ${totalTweets}`)
          break
        }
        positions.add(idx)
      }
    } else {
      const n = Number(r)
      if (!Number.isFinite(n)) {
        if (strict) throw new PositionPlanParseError(`位置非数字: "${r}"`)
        continue
      }
      if (n < 1) {
        if (strict) throw new PositionPlanParseError(`位置必须 >= 1: ${n}`)
        continue
      }
      if (n > totalTweets) {
        if (strict) throw new PositionPlanParseError(`位置 ${n} 超过总数 ${totalTweets}`)
        continue
      }
      positions.add(n)
    }
  }

  return positions
}

/**
 * 计算 position_plan 涉及的最大位置编号
 * 用于校验 view_count 是否覆盖
 */
export function getMaxPosition(planStr: string | null | undefined): number {
  if (!planStr) return 0
  let max = 0
  const segments = planStr.split(';').map(s => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const colonIdx = seg.indexOf(':')
    if (colonIdx === -1) continue
    const posPart = seg.slice(0, colonIdx).trim()
    const ranges = posPart.split(',').map(s => s.trim()).filter(Boolean)
    for (const r of ranges) {
      if (r.includes('-')) {
        const parts = r.split('-').map(s => Number(s.trim()))
        if (parts.length === 2 && Number.isFinite(parts[1])) {
          max = Math.max(max, parts[1])
        }
      } else {
        const n = Number(r)
        if (Number.isFinite(n)) max = Math.max(max, n)
      }
    }
  }
  return max
}