/**
 * 任务调度器（迭代 6.0 — 多窗口群控）
 * 支持多个 Profile 并行执行不同任务
 *
 * 每个 profile 独立一个执行 slot，互不阻塞
 */

import { getDatabase } from '../server/db'
import { executeTask, TaskCallbacks } from './task-executor'
import { TaskPlan, TaskProgress } from '../../shared/automation/task-types'
import { getActiveProfileIds } from '../browser/launcher'

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
  scheduledAt?: number
}

// ==================== 调度器状态 ====================

/** 每个 Profile 的运行时状态 */
interface ProfileRun {
  runId: number
  profileId: number
  abortController: AbortController
  logs: string[]
}

/** profileId → ProfileRun */
const profileRuns = new Map<number, ProfileRun>()

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
  trySchedule(row.profile_id)

  return row
}

// ==================== 调度逻辑 ====================

/** 尝试为某个 profile 调度下一个 pending 任务 */
function trySchedule(profileId: number): void {
  // 如果该 profile 已经有任务在跑，跳过
  if (profileRuns.has(profileId)) return

  const db = getDatabase()
  const now = Date.now()

  const next = db
    .prepare(
      `SELECT * FROM task_runs
       WHERE status = 'pending' AND profile_id = ? AND (scheduled_at IS NULL OR scheduled_at <= ?)
       ORDER BY scheduled_at ASC NULLS FIRST, created_at ASC
       LIMIT 1`
    )
    .get(profileId, now) as TaskRunRow | undefined

  if (!next) return

  startRun(next)
}

/** 全局调度：为所有有 pending 任务的 profile 尝试启动 */
function scheduleAll(): void {
  const db = getDatabase()
  const now = Date.now()

  const pendingProfiles = db
    .prepare(
      `SELECT DISTINCT profile_id FROM task_runs
       WHERE status = 'pending' AND (scheduled_at IS NULL OR scheduled_at <= ?)`
    )
    .all(now) as { profile_id: number }[]

  for (const { profile_id } of pendingProfiles) {
    trySchedule(profile_id)
  }
}

async function startRun(run: TaskRunRow): Promise<void> {
  const db = getDatabase()
  const plan: TaskPlan = JSON.parse(run.plan_json)
  const abortController = new AbortController()
  const logs: string[] = []

  const profileRun: ProfileRun = {
    runId: run.id,
    profileId: run.profile_id,
    abortController,
    logs
  }

  profileRuns.set(run.profile_id, profileRun)

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
    },
    // 迭代 5.0: 采集数据回写入 extraction_results 表
    onData: (type: string, data: string) => {
      try {
        const plan = JSON.parse(run.plan_json) as TaskPlan
        const extraction = plan.extraction
        // 从 raw_data 中解析 handle 作为 user_name
        let userName: string | null = null
        if (type === 'user_profile') {
          try {
            const parsed = JSON.parse(data)
            userName = parsed.handle || null
          } catch {}
        }
        db.prepare(`
          INSERT INTO extraction_results (user_id, profile_id, task_run_id, platform, target_type, target, user_name, data_type, raw_data, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(run.user_id, run.profile_id, run.id, extraction?.platform || 'twitter', extraction?.targetType || 'tweet', extraction?.target || null, userName, type, data, Date.now())
      } catch (e: any) {
        console.error(`[TaskScheduler:${run.id}] onData 写入失败:`, e.message)
      }
    }
  }

  try {
    await executeTask(run.profile_id, plan, callbacks, abortController.signal)

    // 迭代 5.3: 采集完成后自动创建联动养号任务
    if (plan.action === 'extraction' && plan.extraction) {
      const extraction = plan.extraction
      // 从 extraction_results 表读取本次采集到的推文 URL
      const collected = db.prepare('SELECT raw_data FROM extraction_results WHERE task_run_id = ? ORDER BY id ASC').all(run.id) as { raw_data: string }[]
      // 从请求中的 followUp 参数（存在 task_runs 的原始 request body 里）
      const planObj = db.prepare('SELECT plan_json FROM task_runs WHERE id = ?').get(run.id) as { plan_json: string } | undefined
      let followUp: any = null
      try {
        const parsed = JSON.parse(planObj?.plan_json || '{}')
        followUp = parsed.followUp
      } catch {}

      if (followUp && followUp.operations && followUp.operations.length > 0 && collected.length > 0) {
        const count = Math.min(followUp.count || collected.length, collected.length)
        const ops = followUp.operations as string[]
        logs.push(`[${new Date().toLocaleTimeString()}] 采集完成，自动发起 ${count} 条联动操作...`)

        // 构建 segments：对前 count 条采集到的推文执行指定操作
        const segments = []
        let pos = 1
        for (let i = 0; i < count; i++) {
          segments.push({ start: pos, end: pos, operations: ops })
          pos++
        }

        const followUpPlan: TaskPlan = {
          action: 'targeted_interaction',
          target_accounts: plan.target_accounts,
          operations: ops as import('../../shared/automation/task-types').OperationType[],
          constraints: { view_count: count, like_count: ops.includes('like') ? count : 0, selective: false },
          segments,
          duration_minutes: 0,
          pause_after: false,
          platform: extraction.platform || 'twitter',
          raw_command: `[联动] 对采集到的 ${count} 条推文执行 ${ops.join('/')}`
        }
        await enqueueTask({ profileId: run.profile_id, plan: followUpPlan, userId: run.user_id })
        logs.push(`[${new Date().toLocaleTimeString()}] ✅ 联动任务已入队 (${count} 条, ${ops.join('/')})`)
      }
    }

    // 从 DB 读取执行期间的最终进度（executeTask 内部通过 onProgress 不断写入）
    const finalRow = db.prepare('SELECT progress_json FROM task_runs WHERE id = ?').get(run.id) as { progress_json: string | null } | undefined
    const finalProgress = finalRow?.progress_json ? JSON.parse(finalRow.progress_json) : null
    db.prepare('UPDATE task_runs SET status = ?, finished_at = ?, logs_json = ? WHERE id = ?').run(
      'completed',
      Date.now(),
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
    profileRuns.delete(run.profile_id)
    notifyChange()

    // 清理 8 天前记录
    db.prepare("DELETE FROM task_runs WHERE status IN ('completed','failed','aborted') AND finished_at < ?").run(Date.now() - 8 * 86400000)

    // 继续为该 profile 调度下一个任务
    trySchedule(run.profile_id)
  }
}

// ==================== 查询 ====================

export function getCurrentRuns(): TaskRunRow[] {
  if (profileRuns.size === 0) return []
  const db = getDatabase()
  const ids = [...profileRuns.values()].map(r => r.runId)
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(`SELECT * FROM task_runs WHERE id IN (${placeholders})`).all(...ids) as TaskRunRow[]
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

/** 池状态：所有 profile 的运行状态 */
export function getPoolStatus(userId: number): Record<number, { running: boolean; status: string; runId: number | null }> {
  const result: Record<number, { running: boolean; status: string; runId: number | null }> = {}

  // 先查所有运行中的
  for (const [profileId, run] of profileRuns) {
    result[profileId] = { running: true, status: 'running', runId: run.runId }
  }

  // 查数据库 pending 的
  const db = getDatabase()
  const pendingList = db
    .prepare("SELECT * FROM task_runs WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC")
    .all(userId) as TaskRunRow[]

  for (const p of pendingList) {
    if (!result[p.profile_id]) {
      result[p.profile_id] = { running: false, status: 'pending', runId: p.id }
    }
  }

  // 迭代 6.0: 包含已启动浏览器但空闲的窗口（无任务）
  // getActiveProfileIds() 从 launcher.ts 的 profileProcessMap 获取已启动浏览器的 profile ID
  try {
    const activeProfileIds = getActiveProfileIds()
    for (const profileId of activeProfileIds) {
      if (!result[profileId]) {
        result[profileId] = { running: false, status: 'idle', runId: null }
      }
    }
  } catch (e) {
    // launcher 未初始化或未导入时静默忽略
  }

  return result
}

// ==================== 操作 ====================

export function abortRun(runId: number): boolean {
  const db = getDatabase()
  const run = db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as TaskRunRow | undefined

  if (!run) return false

  // 正在运行 → 终止执行器
  if (run.status === 'running') {
    const profileRun = profileRuns.get(run.profile_id)
    if (profileRun && profileRun.runId === runId) {
      profileRun.abortController.abort()
      db.prepare('UPDATE task_runs SET status = ?, finished_at = ?, error_message = ? WHERE id = ?').run('aborted', Date.now(), '用户中止', runId)
      notifyChange()
      return true
    }
    // running 但 profileRun 不存在（极端情况），仍标记中止
  }

  // pending / completed / failed / aborted → 统一标记为 aborted
  db.prepare('UPDATE task_runs SET status = ?, finished_at = ?, error_message = ? WHERE id = ?').run('aborted', Date.now(), '用户中止', runId)
  notifyChange()
  return true
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

  return await enqueueTask({
    profileId: original.profile_id,
    plan: JSON.parse(original.plan_json),
    userId: original.user_id,
    templateId: original.template_id ?? undefined,
    scheduledAt: undefined
  })
}

/** 批量入队：给多个 profile 下发同一个 plan */
export async function batchEnqueue(
  userId: number,
  profileIds: number[],
  plan: TaskPlan,
  scheduledAt?: number
): Promise<TaskRunRow[]> {
  const results: TaskRunRow[] = []
  for (const profileId of profileIds) {
    const run = await enqueueTask({ profileId, plan, userId, scheduledAt })
    results.push(run)
  }
  return results
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

// ==================== 初始化 ====================

export function initScheduler(): void {
  const db = getDatabase()
  db.prepare("UPDATE task_runs SET status = 'failed', finished_at = ?, error_message = '服务重启' WHERE status = 'running'").run(Date.now())
  scheduleAll()
}