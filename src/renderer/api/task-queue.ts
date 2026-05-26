/**
 * 任务队列 API 封装（迭代 4.0）
 */

import request from './request'

// ==================== 类型 ====================

export interface TaskRun {
  id: number
  user_id: number
  profile_id: number
  template_id: number | null
  plan_json: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'
  progress_json: string | null
  logs_json: string | null
  scheduled_at: number | null
  started_at: number | null
  finished_at: number | null
  error_message: string | null
  created_at: number
}

export interface TaskTemplate {
  id: number
  user_id: number
  name: string
  platform: string
  plan_json: string
  created_at: number
  updated_at: number
}

// ==================== API ====================

/** 将任务加入队列 */
export async function enqueueTask(params: {
  profileId: number
  plan: any
  scheduledAt?: number
  templateId?: number
}): Promise<TaskRun> {
  const res = await request.post<any>('/tasks/enqueue', params)
  return res.data.data
}

/** 获取当前运行中的任务 */
export async function getCurrentTask(): Promise<TaskRun | null> {
  const res = await request.get<any>('/tasks/current')
  return res.data.data
}

/** 获取队列（pending + running） */
export async function getTaskQueue(): Promise<TaskRun[]> {
  const res = await request.get<any>('/tasks/queue')
  return res.data.data
}

/** 获取历史记录 */
export async function getTaskHistory(limit = 20, offset = 0): Promise<TaskRun[]> {
  const res = await request.get<any>('/tasks/history', { params: { limit, offset } })
  return res.data.data
}

/** 获取单个任务详情 */
export async function getTaskRun(runId: number): Promise<TaskRun> {
  const res = await request.get<any>(`/tasks/${runId}`)
  return res.data.data
}

/** 中止任务 */
export async function abortTaskRun(runId: number): Promise<void> {
  await request.post<any>(`/tasks/${runId}/abort`)
}

/** 删除任务记录 */
export async function deleteTaskRun(runId: number): Promise<void> {
  await request.delete<any>(`/tasks/${runId}`)
}

/** 重试失败的任务 */
export async function retryTaskRun(runId: number): Promise<TaskRun> {
  const res = await request.post<any>(`/tasks/${runId}/retry`)
  return res.data.data
}

// ==================== 模板 ====================

/** 保存模板 */
export async function saveTaskTemplate(params: {
  name: string
  platform?: string
  plan: any
}): Promise<TaskTemplate> {
  const res = await request.post<any>('/tasks/templates', params)
  return res.data.data
}

/** 获取模板列表 */
export async function getTaskTemplates(): Promise<TaskTemplate[]> {
  const res = await request.get<any>('/tasks/templates')
  return res.data.data
}

/** 删除模板 */
export async function deleteTaskTemplate(templateId: number): Promise<void> {
  await request.delete<any>(`/tasks/templates/${templateId}`)
}