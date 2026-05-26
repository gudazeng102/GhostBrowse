/**
 * AI 控制台状态管理（迭代 3.0）
 * 简单的响应式状态对象，不依赖 Pinia
 */

import { reactive } from 'vue'
import type { TaskPlan } from '../../shared/automation/task-types'
import type { AIHealthInfo, ParseCommandResult, GenerateCommentResult } from '../api/ai'

interface AIStoreState {
  /** Ollama 健康信息 */
  health: AIHealthInfo | null
  /** 健康检查是否在请求中 */
  healthLoading: boolean
  /** 上次健康检查时间戳 */
  healthCheckedAt: number

  /** 用户输入的指令 */
  commandInput: string
  /** 解析中... */
  parsing: boolean
  /** 解析结果 */
  parseResult: ParseCommandResult | null
  /** 解析错误 */
  parseError: string | null
  /** 解析开始时间（用于显示耗时） */
  parseStartedAt: number

  /** 评论原文 */
  commentInput: string
  /** 生成中... */
  generating: boolean
  /** 生成结果 */
  commentResult: GenerateCommentResult | null
  /** 生成错误 */
  commentError: string | null
  /** 生成开始时间 */
  commentStartedAt: number

  /** 编辑中的 plan（克隆自 parseResult.plan，便于用户微调） */
  editedPlan: TaskPlan | null
}

export const aiStore = reactive<AIStoreState>({
  health: null,
  healthLoading: false,
  healthCheckedAt: 0,

  commandInput: '在首页浏览 5 条内容并点赞前 3 条',
  parsing: false,
  parseResult: null,
  parseError: null,
  parseStartedAt: 0,

  commentInput: '刚发布了新功能，超开心！',
  generating: false,
  commentResult: null,
  commentError: null,
  commentStartedAt: 0,

  editedPlan: null
})

/** 重置解析相关状态 */
export function resetParseState() {
  aiStore.parsing = false
  aiStore.parseResult = null
  aiStore.parseError = null
  aiStore.editedPlan = null
}

/** 重置评论相关状态 */
export function resetCommentState() {
  aiStore.generating = false
  aiStore.commentResult = null
  aiStore.commentError = null
}

/** 深拷贝 plan，用于编辑 */
export function clonePlanForEdit(plan: TaskPlan): TaskPlan {
  return JSON.parse(JSON.stringify(plan))
}