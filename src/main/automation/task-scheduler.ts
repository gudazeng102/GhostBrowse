/**
 * 任务调度器（迭代 4.0）
 * 内存队列 + 自动出队执行 + 状态持久化到 task_runs 表
 *
 * 当前为单窗口串行模式（多窗口并发留给迭代 6.0）
 */

import { getDatabase } from '../server/db'
import { executeTask, TaskCallbacks } from './task-executor'
import { TaskPlan, TaskProgress } from '../../shared/automation/task-types'

// ==================== 类型 ====================

export const TASK_STATES = ['pending', 'running', 'completed', 'failed', 'aborted'] as const
export type TaskState = (typeof TASK_STATES)[number]

export interface TaskRunRow {
  id: number
  user_id: number
  profile_id: number
  template_id: number | null
  plan_json: string
  status: TaskState
  progress_json: string | null
  logs_json: string | null
  scheduled_at: number | null
  started_at: number | null
  finished_at: number | null
  error_message: string | null
  created_at: number
}

export interface TaskTemplateRow {
  id: number
  user_id: number
  name: string
  platform: string
  plan_json: string
  created_at: number
  updated_at: number
}

export interface EnqueueOptions {
  profileId: number
  plan: TaskPlan
  userId: number
  templateId?: number
  scheduledAt?: number // 定时执行（unix ms）
}

// ==================== 调度器状态 ====================

/** 当前正在运行的任务 */
let currentRun: { runId: number; profileId: number; abortController: AbortController; logs: string[] } | null = null

/** 状态变更回调（供路由层注册，用于通知前端） */
type StatusListener = () => void
const statusListeners = new Set<StatusListener>()

export function onQueueChange(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

function notifyChange() {
  for (const fn of statusListeners) fn()
}

// ==================== 入队 ====================

export async function enqueueTask(opts: EnqueueOptions): Promise<TaskRunRow> {
  const db = getDatabase()
  const now = Date.now()

  const result = db
    .prepare(
      `INSERT INTO task_runs (user_id, profile_id, template_id, plan_json, status, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(opts.userId, opts.profileId, opts.templateId ?? null, JSON.stringify(opts.plan), opts.scheduledAt ?? null, now)

  const row = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(result.lastInsertRowid) as TaskRunRow

  notifyChange()
  scheduleNext()

  return row
}

// ==================== 调度逻辑 ====================

function scheduleNext(): void {
  // 如果已经有正在运行的任务，不调度
  if (currentRun) return

  const db = getDatabase()
  const now = Date.now()

  // 取第一个 pending 且已到时间的任务
  const next = db
    .prepare(
      `SELECT * FROM task_runs
       WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= ?)
       ORDER BY scheduled_at ASC NULLS FIRST, created_at ASC
       LIMIT 1`
    )
    .get(now) as TaskRunRow | undefined

  if (!next) return

  startRun(next)
}

async function startRun(run: TaskRunRow): Promise<void> {
  const db = getDatabase()
  const plan: TaskPlan = JSON.parse(run.plan_json)

  const abortController = new AbortController()
  const logs: string[] = []

  currentRun = {
    runId: run.id,
    profileId: run.profile_id,
    abortController,
    logs
  }

  // 更新为 running
  db.prepare('UPDATE task_runs SET status = ?, started_at = ? WHERE id = ?').run('running', Date.now(), run.id)

  notifyChange()

  const callbacks: TaskCallbacks = {
    onProgress: (progress: TaskProgress) => {
      db.prepare('UPDATE task_runs SET progress_json = ? WHERE id = ?').run(JSON.stringify(progress), run.id)
    },
    onLog: (message: string) => {
      const ts = `[${new Date().toLocaleTimeString()}] ${message}`
      logs.push(ts)
      if (logs.length > 200) logs.shift()
      db.prepare('UPDATE task_runs SET logs_json = ? WHERE id = ?').run(JSON.stringify(logs), run.id)
      notifyChange()
    },
    onError: (error: string) => {
      console.error(`[TaskScheduler:${run.id}] ERROR: ${error}`)
    },
    onComplete: () => {
      console.log(`[TaskScheduler:${run.id}] 任务完成`)
    }
  }

  try {
    await executeTask(run.profile_id, plan, callbacks, abortController.signal)

    // 完成
    db.prepare('UPDATE task_runs SET status = ?, finished_at = ?, progress_json = ?, logs_json = ? WHERE id = ?').run(
      'completed',
      Date.now(),
      JSON.stringify({ processed: plan.constraints.view_count || 0, total: plan.constraints.view_count || 0, liked: 0, retweeted: 0, commented: 0 }),
      JSON.stringify(logs),
      run.id
    )
  } catch (err: any) {
    if (abortController.signal.aborted) {
      db.prepare('UPDATE task_runs SET status = ?, finished_at = ?, error_message = ?, logs_json = ? WHERE id = ?').run('aborted', Date.now(), '用户中止', JSON.stringify(logs), run.id)
    } else {
      db.prepare('UPDATE task_runs SET status = ?, finished_at = ?, error_message = ?, logs_json = ? WHERE id = ?').run('failed', Date.now(), err.message || String(err), JSON.stringify(logs), run.id)
    }
  } finally {
    currentRun = null
    notifyChange()

    // 5 分钟后清理旧运行记录 (8 天以上的记录)
    db.prepare("DELETE FROM task_runs WHERE status IN ('completed','failed','aborted') AND finished_at < ?").run(Date.now() - 8 * 86400000)

    // 继续取下一个任务
    scheduleNext()
  }
}

// ==================== 查询 ====================

export function getCurrentRun(): TaskRunRow | null {
  const db = getDatabase()
  if (!currentRun) return null
  return db.prepare('SELECT * FROM task_runs WHERE id = ?').get(currentRun.runId) as TaskRunRow | null
}

export function getQueue(userId: number): TaskRunRow[] {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM task_runs WHERE user_id = ? AND status IN ('pending','running') ORDER BY scheduled_at ASC NULLS FIRST, created_at ASC")
    .all(userId) as TaskRunRow[]
}

export function getHistory(userId: number, limit: number = 20, offset: number = 0): TaskRunRow[] {
  const db = getDatabase()
  return db
    .prepare("SELECT * FROM task_runs WHERE user_id = ? AND status IN ('completed','failed','aborted') ORDER BY finished_at DESC LIMIT ? OFFSET ?")
    .all(userId, limit, offset) as TaskRunRow[]
}

export function getRunById(runId: number): TaskRunRow | null {
  const db = getDatabase()
  return db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as TaskRunRow | null
}

// ==================== 操作 ====================

export function abortRun(runId: number): boolean {
  const db = getDatabase()
  const run = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as TaskRunRow | undefined

  if (!run) return false

  if (run.status === 'running') {
    // 如果正在运行，发 abort 信号
    if (currentRun && currentRun.runId === runId) {
      currentRun.abortController.abort()
      return true
    }
    return false
  }

  if (run.status === 'pending') {
    db.prepare('UPDATE task_runs SET status = ?, finished_at = ? WHERE id = ?').run('aborted', Date.now(), runId)
    notifyChange()
    return true
  }

  return false
}

export function deleteRun(runId: number): boolean {
  const db = getDatabase()
  db.prepare('DELETE FROM task_runs WHERE id = ?').run(runId)
  notifyChange()
  return true
}

export async function retryRun(runId: number): Promise<TaskRunRow | null> {
  const db = getDatabase()
  const original = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as TaskRunRow | undefined
  if (!original) return null

  // 创建新运行记录
  return await enqueueTask({
    profileId: original.profile_id,
    plan: JSON.parse(original.plan_json),
    userId: original.user_id,
    templateId: original.template_id ?? undefined,
    scheduledAt: undefined
  })
}

// ==================== 模板 ====================

export function saveTemplate(userId: number, name: string, platform: string, plan: TaskPlan): TaskTemplateRow {
  const db = getDatabase()
  const now = Date.now()

  const result = db
    .prepare('INSERT INTO task_templates (user_id, name, platform, plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, name, platform, JSON.stringify(plan), now, now)

  return db.prepare('SELECT * FROM task_templates WHERE id = ?').get(result.lastInsertRowid) as TaskTemplateRow
}

export function getTemplates(userId: number): TaskTemplateRow[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM task_templates WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as TaskTemplateRow[]
}

export function deleteTemplate(templateId: number): boolean {
  const db = getDatabase()
  db.prepare('DELETE FROM task_templates WHERE id = ?').run(templateId)
  return true
}

// ==================== 初始化（启动时恢复） ====================

export function initScheduler(): void {
  const db = getDatabase()

  // 把上次未清理的 'running' 状态改为 'failed'（可能意外崩溃）
  db.prepare("UPDATE task_runs SET status = 'failed', finished_at = ?, error_message = '服务重启' WHERE status = 'running'").run(Date.now())

  // 尝试启动下一个任务
  scheduleNext()
}