/**
 * 迭代 6.x: 采集进度追踪
 * 存储 full-collect 各阶段的实时日志，供前端轮询
 */

/** 单条日志 */
export interface CollectLogEntry {
  time: string
  msg: string
  type: 'info' | 'success' | 'warn' | 'error'
}

/** 进度状态 */
export interface CollectProgress {
  taskId: string
  target: string
  stage: string           // 'fetching_following' | 'fetching_details' | 'writing_db' | 'done' | 'error'
  totalFound: number      // 关注列表总数
  detailsQueried: number  // 已查详情数
  detailsTotal: number    // 需查详情总数
  inserted: number        // 已写入库
  currentPage: number     // 当前翻页页码
  logs: CollectLogEntry[]
  error?: string
}

const progressMap = new Map<string, CollectProgress>()

let taskCounter = 0

export function createProgress(target: string): string {
  taskCounter++
  const taskId = `collect_${Date.now()}_${taskCounter}`
  progressMap.set(taskId, {
    taskId,
    target,
    stage: 'initializing',
    totalFound: 0,
    detailsQueried: 0,
    detailsTotal: 0,
    inserted: 0,
    currentPage: 0,
    logs: [{ time: new Date().toLocaleTimeString(), msg: `开始采集 @${target}`, type: 'info' }]
  })
  return taskId
}

export function getProgress(taskId: string): CollectProgress | undefined {
  return progressMap.get(taskId)
}

export function updateProgress(taskId: string, updates: Partial<CollectProgress>): void {
  const p = progressMap.get(taskId)
  if (p) Object.assign(p, updates)
}

export function addLog(taskId: string, msg: string, type: CollectLogEntry['type'] = 'info'): void {
  const p = progressMap.get(taskId)
  if (p) p.logs.push({ time: new Date().toLocaleTimeString(), msg, type })
}

export function deleteProgress(taskId: string): void {
  // 保留 5 分钟后自动清理
  setTimeout(() => progressMap.delete(taskId), 5 * 60 * 1000)
}