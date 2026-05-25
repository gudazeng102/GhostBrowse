/**
 * TaskPlan 校验与修正
 * 来自 yanghao.js executeSmartCommand 中的后处理逻辑
 *
 * 提供两个层次：
 * - validatePlan: 只校验，返回错误列表
 * - normalizePlan: 校验 + 自动修正（用于 AI 输出后处理）
 */

import { TaskPlan, TaskAction, OperationType } from './task-types'
import { getMaxPosition } from './position-plan'

const VALID_ACTIONS: TaskAction[] = ['targeted_interaction', 'home_warming', 'following_warming', 'custom']
const VALID_OPS: OperationType[] = ['like', 'retweet', 'comment', 'view', 'subscribe', 'upvote', 'follow']

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * 校验 TaskPlan 结构
 */
export function validatePlan(plan: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['plan 不是对象'], warnings: [] }
  }

  // action
  if (!plan.action) {
    errors.push('缺少 action')
  } else if (!VALID_ACTIONS.includes(plan.action)) {
    errors.push(`无效 action: ${plan.action}`)
  }

  // target_accounts
  if (!Array.isArray(plan.target_accounts)) {
    errors.push('target_accounts 必须是数组')
  }

  if (plan.action === 'targeted_interaction') {
    if (!plan.target_accounts || plan.target_accounts.length === 0) {
      errors.push('targeted_interaction 必须指定 target_accounts')
    }
  }

  // operations
  if (!Array.isArray(plan.operations)) {
    errors.push('operations 必须是数组')
  } else {
    for (const op of plan.operations) {
      if (!VALID_OPS.includes(op)) {
        warnings.push(`未知操作: ${op}`)
      }
    }
  }

  // constraints
  if (!plan.constraints || typeof plan.constraints !== 'object') {
    errors.push('缺少 constraints')
  } else {
    const c = plan.constraints
    if (typeof c.view_count !== 'number' || c.view_count < 0) {
      errors.push('view_count 必须是非负数')
    }
    if (typeof c.like_count !== 'number' || c.like_count < 0) {
      errors.push('like_count 必须是非负数')
    }
    if (typeof c.selective !== 'boolean') {
      warnings.push('selective 应为布尔值')
    }

    // position_plan + view_count 一致性
    if (c.position_plan) {
      const maxPos = getMaxPosition(c.position_plan)
      if (maxPos > c.view_count) {
        warnings.push(`position_plan 最大位置 ${maxPos} 超过 view_count ${c.view_count}`)
      }
    }
  }

  // duration_minutes
  if (typeof plan.duration_minutes !== 'number' || plan.duration_minutes < 0) {
    errors.push('duration_minutes 必须是非负数')
  }

  // pause_after
  if (typeof plan.pause_after !== 'boolean') {
    warnings.push('pause_after 应为布尔值')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * 规范化（校验 + 修正）TaskPlan
 * 用于 AI 输出后处理，保证下游拿到的 plan 一定合法
 *
 * @param raw AI 返回的原始对象
 * @param userCommand 用户原始指令（用于补抓账号、判定时间模式等）
 */
export function normalizePlan(raw: any, userCommand?: string): TaskPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('plan 不是对象')
  }
  if (!raw.action || !VALID_ACTIONS.includes(raw.action)) {
    throw new Error(`无效 action: ${raw.action}`)
  }

  const plan: TaskPlan = {
    action: raw.action,
    target_accounts: Array.isArray(raw.target_accounts) ? raw.target_accounts.filter(Boolean) : [],
    operations: Array.isArray(raw.operations)
      ? raw.operations.filter((o: any): o is OperationType => VALID_OPS.includes(o))
      : [],
    constraints: {
      view_count: 0,
      like_count: 0,
      selective: false,
      position_plan: undefined
    },
    duration_minutes: 0,
    pause_after: false,
    raw_command: userCommand
  }

  // constraints
  if (raw.constraints && typeof raw.constraints === 'object') {
    const c = raw.constraints
    plan.constraints.view_count = Math.max(0, parseInt(c.view_count, 10) || 0)
    plan.constraints.like_count = Math.max(0, parseInt(c.like_count, 10) || 0)
    plan.constraints.selective = c.selective === true
    if (typeof c.position_plan === 'string' && c.position_plan.trim()) {
      plan.constraints.position_plan = c.position_plan.trim()
    }
  }

  plan.duration_minutes = Math.max(0, parseInt(raw.duration_minutes, 10) || 0)
  plan.pause_after = raw.pause_after === true

  // === 强制修正规则 ===

  // 1. 启用 position_plan 时，like_count = 0，selective = false
  if (plan.constraints.position_plan) {
    plan.constraints.like_count = 0
    plan.constraints.selective = false

    // view_count 必须覆盖 position_plan 最大位置
    const maxPos = getMaxPosition(plan.constraints.position_plan)
    if (plan.constraints.view_count < maxPos) {
      plan.constraints.view_count = maxPos
    }
  }

  // 2. targeted_interaction 缺账号时从 userCommand 补抓
  if (plan.action === 'targeted_interaction' && plan.target_accounts.length === 0 && userCommand) {
    const accountMatch = userCommand.match(/去@?([a-zA-Z0-9_]+)/)
    if (accountMatch) {
      plan.target_accounts = [accountMatch[1]]
    } else {
      throw new Error('定向模式但未找到目标账号')
    }
  }

  // 3. userCommand 含"X分钟" + 无 position_plan + view_count > 0 → 切换为时间模式
  //    （有 position_plan 时保留 duration_minutes 作为补充浏览，不清 view_count）
  if (userCommand && !plan.constraints.position_plan) {
    const timeMatch = userCommand.match(/(\d+)\s*分钟?/)
    if (timeMatch && plan.constraints.view_count > 0 && plan.duration_minutes === 0) {
      plan.duration_minutes = parseInt(timeMatch[1], 10)
      plan.constraints.view_count = 0
      plan.constraints.like_count = 0
    }
  }

  // 4. userCommand 含"暂停/停止/完成后" → pause_after = true
  if (userCommand && (userCommand.includes('暂停') || userCommand.includes('停止') || userCommand.includes('完成后'))) {
    plan.pause_after = true
  }

  return plan
}