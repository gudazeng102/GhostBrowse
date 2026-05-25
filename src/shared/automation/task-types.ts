/**
 * 自动化任务相关的类型定义
 * 这些类型在 shared / main / renderer / extension 之间传递
 */

/** 操作类型 */
export type OperationType = 'like' | 'retweet' | 'comment' | 'view' | 'subscribe' | 'upvote' | 'follow'

/** 任务行为 */
export type TaskAction = 'targeted_interaction' | 'home_warming' | 'following_warming' | 'custom'

/** 任务状态 */
export type TaskStatus = 'pending' | 'running' | 'paused' | 'done' | 'error' | 'aborted'

/** 任务约束（来自 AI 解析的 plan） */
export interface TaskConstraints {
  /** 总浏览数量 */
  view_count: number
  /** 点赞数量（传统模式） */
  like_count: number
  /** 是否随机选择（传统模式） */
  selective: boolean
  /** 精确位置计划字符串，如 "1-5:like;6-7:comment" */
  position_plan?: string
}

/** AI 解析后的任务计划 */
export interface TaskPlan {
  /** 任务行为 */
  action: TaskAction
  /** 目标账号列表（仅 targeted_interaction 使用） */
  target_accounts: string[]
  /** 操作类型列表 */
  operations: OperationType[]
  /** 约束 */
  constraints: TaskConstraints
  /** 持续时间（分钟），0 表示按数量执行 */
  duration_minutes: number
  /** 完成后是否暂停 */
  pause_after: boolean
  /** 平台标识（可选，默认 twitter） */
  platform?: string
  /** 用户原始指令（可选，便于追溯） */
  raw_command?: string
}

/** 任务进度 */
export interface TaskProgress {
  /** 已处理数量 */
  processed: number
  /** 总目标数量 */
  total: number
  /** 已点赞 */
  liked: number
  /** 已转发 */
  retweeted: number
  /** 已评论 */
  commented: number
  /** 当前阶段描述 */
  stage?: string
  /** 错误信息 */
  error?: string
}

/** 完整任务记录（包含运行时状态） */
export interface TaskRecord {
  id: string
  profile_id: number
  plan: TaskPlan
  status: TaskStatus
  progress: TaskProgress
  started_at: number
  finished_at?: number
}

/** position_plan 解析后的槽位映射 */
export type SlotMap = Map<number, Set<OperationType>>