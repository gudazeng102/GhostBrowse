/**
 * 自动化任务相关的类型定义
 * 这些类型在 shared / main / renderer / extension 之间传递
 */

/** 操作类型 */
export type OperationType = 'like' | 'retweet' | 'comment' | 'view' | 'subscribe' | 'upvote' | 'follow' | 'collect'

/** 任务行为 */
export type TaskAction = 'targeted_interaction' | 'home_warming' | 'following_warming' | 'custom' | 'extraction'

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

/** 分段操作：从第 start 条到第 end 条执行指定操作 */
export interface TaskSegment {
  start: number
  end: number
  operations: OperationType[]
}

/** 采集数据类型 */
export type CollectTargetType = 'tweet' | 'user_profile' | 'followers' | 'following' | 'hashtag_tweets' | 'comments'

/** 迭代 5.0: 采集任务计划（扩展 TaskPlan） */
export interface ExtractionPlan {
  /** 采集目标类型 */
  targetType: CollectTargetType
  /** 目标标识（@用户名 / #话题 / 关键词） */
  target: string
  /** 最大采集数量 */
  maxCount: number
  /** 平台 */
  platform: string
  /** 是否需要在采集前检查登录态 */
  requireLogin: boolean
}

/** 迭代 5.3: 采集后的联动操作配置 */
export interface FollowUpAction {
  /** 操作类型：like / retweet / comment */
  operations: OperationType[]
  /** 执行数量（0 表示全部） */
  count: number
  /** 评论内容（可选，留空则 AI 生成） */
  commentText?: string
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
  /** 分段计划（可选，优先级高于 operations + constraints 的简单模式） */
  segments?: TaskSegment[]
  /** 采集配置（可选，仅 extraction 类型使用） */
  extraction?: ExtractionPlan
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
  /** 采集数量（迭代 5.0） */
  collected?: number
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