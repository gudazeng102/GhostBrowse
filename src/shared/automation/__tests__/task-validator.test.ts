import { describe, it, expect } from 'vitest'
import { validatePlan, normalizePlan } from '../task-validator'

describe('validatePlan', () => {
  it('合法 plan 校验通过', () => {
    const plan = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 10, like_count: 3, selective: true },
      duration_minutes: 0,
      pause_after: false
    }
    const result = validatePlan(plan)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('缺少 action 报错', () => {
    const result = validatePlan({})
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少 action')
  })

  it('无效 action 报错', () => {
    const result = validatePlan({ action: 'xxx' })
    expect(result.valid).toBe(false)
  })

  it('targeted_interaction 缺 target_accounts 报错', () => {
    const plan = {
      action: 'targeted_interaction',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 5, like_count: 0, selective: false },
      duration_minutes: 0,
      pause_after: false
    }
    const result = validatePlan(plan)
    expect(result.valid).toBe(false)
  })

  it('position_plan 超过 view_count 警告', () => {
    const plan = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 3, like_count: 0, selective: false, position_plan: '1-5:like' },
      duration_minutes: 0,
      pause_after: false
    }
    const result = validatePlan(plan)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('非对象 plan 报错', () => {
    expect(validatePlan(null).valid).toBe(false)
    expect(validatePlan('string').valid).toBe(false)
  })
})

describe('normalizePlan', () => {
  it('基本规范化', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 10, like_count: 3, selective: true },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw)
    expect(plan.action).toBe('home_warming')
    expect(plan.constraints.view_count).toBe(10)
  })

  it('position_plan 时从 plan 推导 like_count, selective=false', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 3, like_count: 5, selective: true, position_plan: '1-3:like' },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw)
    // like_count 不再强制归零，而是从 position_plan 统计 :like 次数
    expect(plan.constraints.like_count).toBe(3)
    expect(plan.constraints.selective).toBe(false)
    // 自动补 view
    expect(plan.operations).toContain('view')
  })

  it('position_plan 最大位置超过 view_count 时自动修正', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 3, like_count: 0, selective: false, position_plan: '1-8:like' },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw)
    expect(plan.constraints.view_count).toBe(8)
  })

  it('targeted_interaction 缺账号时从 userCommand 补抓', () => {
    const raw = {
      action: 'targeted_interaction',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 5, like_count: 0, selective: false },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw, '去@FRIEREN_INFO点赞5条')
    expect(plan.target_accounts).toEqual(['FRIEREN_INFO'])
  })

  it('targeted_interaction 缺账号且无法补抓时抛错', () => {
    const raw = {
      action: 'targeted_interaction',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 5, like_count: 0, selective: false },
      duration_minutes: 0,
      pause_after: false
    }
    expect(() => normalizePlan(raw, '首页点赞5条')).toThrow('定向模式但未找到目标账号')
  })

  it('userCommand 含"X分钟" + 无 position_plan → 切时间模式', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['comment'],
      constraints: { view_count: 10, like_count: 0, selective: false },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw, '去首页评论5分钟后暂停')
    expect(plan.duration_minutes).toBe(5)
    expect(plan.constraints.view_count).toBe(0)
    expect(plan.pause_after).toBe(true)
  })

  it('userCommand 含"X分钟" + 有 position_plan → 保留位置计划不清 view_count', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 4, like_count: 0, selective: false, position_plan: '1-3:like;4:comment' },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw, '去首页点赞前3条并评论第4条，持续5分钟后暂停')
    expect(plan.constraints.view_count).toBe(4)  // 保留
    expect(plan.constraints.position_plan).toBeTruthy()
  })

  it('userCommand 含"暂停/停止/完成后" → pause_after = true', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 5, like_count: 0, selective: false },
      duration_minutes: 0,
      pause_after: false
    }
    expect(normalizePlan(raw, '浏览5条后停止').pause_after).toBe(true)
    expect(normalizePlan(raw, '完成后暂停').pause_after).toBe(true)
  })

  it('非法 action 抛错', () => {
    expect(() => normalizePlan({ action: 'xxx' })).toThrow('无效 action')
  })

  it('非对象抛错', () => {
    expect(() => normalizePlan(null)).toThrow('plan 不是对象')
  })

  it('字符串数字被 parseInt 正确处理', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: '10', like_count: '3', selective: true },
      duration_minutes: '5',
      pause_after: false
    }
    const plan = normalizePlan(raw)
    expect(plan.constraints.view_count).toBe(10)
    expect(plan.constraints.like_count).toBe(3)
    expect(plan.duration_minutes).toBe(5)
  })

  it('raw_command 被保留', () => {
    const raw = {
      action: 'home_warming',
      target_accounts: [],
      operations: ['like'],
      constraints: { view_count: 5, like_count: 0, selective: false },
      duration_minutes: 0,
      pause_after: false
    }
    const plan = normalizePlan(raw, '浏览5条')
    expect(plan.raw_command).toBe('浏览5条')
  })
})