/**
 * TaskPlan 校验与修正
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

  if (!plan.action) {
    errors.push('缺少 action')
  } else if (!VALID_ACTIONS.includes(plan.action)) {
    errors.push(`无效 action: ${plan.action}`)
  }

  if (!Array.isArray(plan.target_accounts)) {
    errors.push('target_accounts 必须是数组')
  }

  if (plan.action === 'targeted_interaction') {
    if (!plan.target_accounts || plan.target_accounts.length === 0) {
      errors.push('targeted_interaction 必须指定 target_accounts')
    }
  }

  if (!Array.isArray(plan.operations)) {
    errors.push('operations 必须是数组')
  } else {
    for (const op of plan.operations) {
      if (!VALID_OPS.includes(op)) {
        warnings.push(`未知操作: ${op}`)
      }
    }
  }

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
    if (c.position_plan) {
      const maxPos = getMaxPosition(c.position_plan)
      if (maxPos > c.view_count) {
        warnings.push(`position_plan 最大位置 ${maxPos} 超过 view_count ${c.view_count}`)
      }
    }
  }

  if (typeof plan.duration_minutes !== 'number' || plan.duration_minutes < 0) {
    errors.push('duration_minutes 必须是非负数')
  }

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
    raw_command: userCommand,
    presetCommentText: raw.presetCommentText
  }

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

  // 1. 启用 position_plan 时，selective = false，并从 position_plan 推导 like_count
  if (plan.constraints.position_plan) {
    plan.constraints.selective = false

    const likeSegments = plan.constraints.position_plan.split(';')
    let likeCount = 0
    for (const seg of likeSegments) {
      if (!seg.includes(':like')) continue
      const part = seg.split(':')[0]
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number)
        likeCount += (b - a + 1)
      } else {
        likeCount++
      }
    }
    plan.constraints.like_count = likeCount

    const maxPos = getMaxPosition(plan.constraints.position_plan)
    if (plan.constraints.view_count < maxPos) {
      plan.constraints.view_count = maxPos
    }
  }

  // 1b. operations 中有交互操作但无 view，自动补 view
  const hasView = plan.operations.includes('view')
  const hasInteraction = plan.operations.some(op => op !== 'view')
  if (!hasView && hasInteraction) {
    plan.operations.unshift('view')
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

  // 5. return_to_home
  plan.return_to_home = raw.return_to_home === true
  if (userCommand && (userCommand.includes('回到首页') || userCommand.includes('返回首页') || userCommand.includes('回首页'))) {
    plan.return_to_home = true
  }

  // 6. 兜底：AI 没输出 position_plan 但指令包含精确位置/数量描述
  //    通过 userCommand 正则补 position_plan
  //    注意：即使 AI 输出了 segments 也执行（segments 优先级高但常不准确）
  if (userCommand && !plan.constraints.position_plan) {
    // 浏览X条...从第Y条开始...(点赞|评论|转发)接下来的Z条
    const viewMatch = userCommand.match(/浏览\s*(\d+)\s*条/)
    const fromMatch = userCommand.match(/从\s*第\s*(\d+)\s*条\s*开始/)
    const actionNMatch = userCommand.match(/(点赞|评论|转发)\s*接下来\s*的\s*(\d+)\s*条/)

    if (viewMatch && fromMatch) {
      const viewCount = parseInt(viewMatch[1], 10)
      const fromPos = parseInt(fromMatch[1], 10)
      let actionCount = 1
      let actions: string[] = []
      if (actionNMatch) {
        actionCount = parseInt(actionNMatch[2], 10)
        const act = actionNMatch[1]
        if (act === '点赞') actions.push('like')
        else if (act === '评论') actions.push('comment')
        else if (act === '转发') actions.push('retweet')
      } else {
        actions = plan.operations.filter(op => op !== 'view')
      }
      if (actions.length === 0) actions = ['like']

      const actionPart = `${fromPos}-${fromPos + actionCount - 1}:${actions.join(',')}`
      if (viewCount > 0) {
        const viewPart = viewCount < fromPos ? `1-${viewCount}:view` : `1-${fromPos - 1}:view`
        plan.constraints.position_plan = `${viewPart};${actionPart}`
      } else {
        plan.constraints.position_plan = actionPart
      }
      plan.constraints.selective = false
      plan.constraints.like_count = 0
      const maxPos = getMaxPosition(plan.constraints.position_plan)
      if (plan.constraints.view_count < maxPos) plan.constraints.view_count = maxPos
    }

    // 浏览X条...第Y条到第Z条（点赞|评论|转发）
    if (!plan.constraints.position_plan) {
      const viewMatch2 = userCommand.match(/浏览\s*(\d+)\s*条/)
      const rangeOpsMatch = userCommand.match(/第\s*(\d+)\s*条\s*(?:到|至|和|,)\s*第\s*(\d+)\s*条.*(点赞|评论|转发)/)
      if (viewMatch2 && rangeOpsMatch) {
        const viewCount = parseInt(viewMatch2[1], 10)
        const rangeStart = parseInt(rangeOpsMatch[1], 10)
        const rangeEnd = parseInt(rangeOpsMatch[2], 10)
        const act = rangeOpsMatch[3]
        let action = 'like'
        if (act === '评论') action = 'comment'
        else if (act === '转发') action = 'retweet'

        const viewPart = viewCount < rangeStart ? `1-${viewCount}:view` : `1-${rangeStart - 1}:view`
        plan.constraints.position_plan = `${viewPart};${rangeStart}-${rangeEnd}:${action}`
        plan.constraints.selective = false
        plan.constraints.like_count = 0
        const maxPos = getMaxPosition(plan.constraints.position_plan)
        if (plan.constraints.view_count < maxPos) plan.constraints.view_count = maxPos
      }
    }

    // 单独的"评论X条"（无"浏览"前导）
    if (!plan.constraints.position_plan) {
      const commentOnlyMatch = userCommand.match(/评论\s*(\d+)\s*条/)
      if (commentOnlyMatch) {
        const commentCount = parseInt(commentOnlyMatch[1], 10)
        plan.constraints.position_plan = `1-${commentCount}:comment`
        plan.constraints.selective = false
        plan.constraints.like_count = 0
        const maxPos = getMaxPosition(plan.constraints.position_plan)
        if (plan.constraints.view_count < maxPos) plan.constraints.view_count = maxPos
        if (!plan.operations.includes('comment')) plan.operations.push('comment')
        if (!plan.operations.includes('view')) plan.operations.unshift('view')
      }
    }

    // "返回到首页后继续...N条并点赞评论"（无"和"字，如"并点赞评论"）
    if (!plan.constraints.position_plan) {
      // 匹配 "继续浏览N条并点赞评论" 或 "继续N条并点赞" 等
      const continueMatch = userCommand.match(/继续(?:\s*浏览)?\s*(\d+)\s*条\s*并\s*(点赞|评论|转发)(?:\s*(点赞|评论|转发))?/)
      if (continueMatch) {
        const count = parseInt(continueMatch[1], 10)
        const act1 = continueMatch[2]
        const act2 = continueMatch[3]
        let actions: string[] = []
        const actMap: Record<string, string> = { '点赞': 'like', '评论': 'comment', '转发': 'retweet' }
        if (actMap[act1]) actions.push(actMap[act1])
        if (act2 && actMap[act2]) actions.push(actMap[act2])
        if (actions.length === 0) actions = ['like', 'comment']
        plan.constraints.position_plan = `1-${count}:${actions.join(',')}`
        plan.constraints.selective = false
        plan.constraints.like_count = 0
        const maxPos = getMaxPosition(plan.constraints.position_plan)
        if (plan.constraints.view_count < maxPos) plan.constraints.view_count = maxPos
        for (const a of actions) { if (!plan.operations.includes(a as any)) plan.operations.push(a as any) }
        if (!plan.operations.includes('view')) plan.operations.unshift('view')
      }
    }
  }

  // 8. 如果已有 position_plan（如"1-5:comment"）且用户指令包含"返回到首页后继续"，追加第二阶段
  //    第二阶段从第一阶段结束位置+1开始
  if (plan.constraints.position_plan && userCommand) {
    const secondContinue = userCommand.match(/返回到首页后\s*继续(?:\s*浏览)?\s*(\d+)\s*条\s*并\s*(点赞|评论|转发)(?:\s*(点赞|评论|转发))?/)
    if (secondContinue) {
      const firstMaxPos = getMaxPosition(plan.constraints.position_plan || '')
      const secondCount = parseInt(secondContinue[1], 10)
      const act1 = secondContinue[2]
      const act2 = secondContinue[3]
      const actMap: Record<string, string> = { '点赞': 'like', '评论': 'comment', '转发': 'retweet' }
      let actions: string[] = []
      if (actMap[act1]) actions.push(actMap[act1])
      if (act2 && actMap[act2]) actions.push(actMap[act2])
      if (actions.length === 0) actions = ['like', 'comment']

      const secondStart = firstMaxPos + 1
      const secondEnd = secondStart + secondCount - 1
      plan.constraints.position_plan = `${plan.constraints.position_plan};${secondStart}-${secondEnd}:${actions.join(',')}`
      plan.constraints.selective = false

      // view_count 覆盖最大位置
      const maxPos = getMaxPosition(plan.constraints.position_plan)
      if (plan.constraints.view_count < maxPos) plan.constraints.view_count = maxPos

      for (const a of actions) { if (!plan.operations.includes(a as any)) plan.operations.push(a as any) }
      if (!plan.operations.includes('view')) plan.operations.unshift('view')
    }
  }

  // 7. 强制修正：如果 AI 输出了 segments（自创格式），清掉 segments让 position_plan 路径执行
  //    因为 executeOperations 里 segments 优先级最高，会绕过 position_plan
  if (plan.segments && plan.segments.length > 0) {
    // 如果还没有 position_plan，尝试从 segments 生成
    if (!plan.constraints.position_plan) {
      const parts: string[] = []
      for (const seg of plan.segments) {
        const ops = (seg.operations || ['view']).filter(o => o !== 'view')
        if (ops.length > 0) {
          parts.push(`${seg.start}-${seg.end}:${ops.join(',')}`)
        }
      }
      if (parts.length > 0) {
        plan.constraints.position_plan = parts.join(';')
        plan.constraints.selective = false
      }
    }
    // 用户指令有精确描述时，清掉 segments 让 position_plan 路径执行
    if (userCommand) {
      const hasPositionCmd = userCommand.match(/评论\s*\d+\s*条|浏览\s*\d+\s*条|从\s*第\s*\d+\s*条|前\s*\d+\s*条|继续/)
      if (hasPositionCmd) {
        plan.segments = undefined
      }
    }
  }

  return plan
}