/**
 * 任务队列路由（迭代 4.0）
 * 挂载在 /api/v1/tasks
 */

import { Router, Request, Response } from 'express'
import {
  enqueueTask,
  getQueue,
  getHistory,
  getRunById,
  abortRun,
  deleteRun,
  retryRun,
  saveTemplate,
  getTemplates,
  deleteTemplate,
  initScheduler,
  getCurrentRun
} from '../../automation/task-scheduler'

const router = Router()

// ==================== 入队 ====================

/**
 * POST /api/v1/tasks/enqueue
 * Body: { profileId, plan, scheduledAt?, templateId? }
 */
router.post('/enqueue', async (req: Request, res: Response) => {
  try {
    const { profileId, plan, scheduledAt, templateId } = req.body
    const userId = (req as any).userId || 1

    if (!profileId || !plan) {
      res.status(400).json({ code: 400, data: null, message: '缺少 profileId 或 plan' })
      return
    }

    const run = await enqueueTask({ profileId, plan, userId, templateId, scheduledAt })
    res.json({ code: 0, data: run, message: '已加入队列' })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

// ==================== 模板（必须在 :runId 之前注册） ====================

/** POST /api/v1/tasks/templates */
router.post('/templates', (req: Request, res: Response) => {
  try {
    const { name, platform, plan } = req.body
    const userId = (req as any).userId || 1
    if (!name || !plan) { res.status(400).json({ code: 400, data: null, message: '缺少 name 或 plan' }); return }
    const tmpl = saveTemplate(userId, name, platform || 'twitter', plan)
    res.json({ code: 0, data: tmpl, message: '模板已保存' })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

/** GET /api/v1/tasks/templates */
router.get('/templates', (req: Request, res: Response) => {
  const userId = (req as any).userId || 1
  res.json({ code: 0, data: getTemplates(userId), message: 'success' })
})

/** DELETE /api/v1/tasks/templates/:templateId */
router.delete('/templates/:templateId', (req: Request, res: Response) => {
  deleteTemplate(Number(req.params.templateId))
  res.json({ code: 0, data: { deleted: true }, message: '已删除' })
})

// ==================== 查询 ====================

/** GET /api/v1/tasks/current */
router.get('/current', (_req: Request, res: Response) => {
  const run = getCurrentRun()
  res.json({ code: 0, data: run, message: 'success' })
})

/** GET /api/v1/tasks/queue */
router.get('/queue', (req: Request, res: Response) => {
  const userId = (req as any).userId || 1
  const rows = getQueue(userId)
  res.json({ code: 0, data: rows, message: 'success' })
})

/** GET /api/v1/tasks/history?limit=20&offset=0 */
router.get('/history', (req: Request, res: Response) => {
  const userId = (req as any).userId || 1
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const offset = Number(req.query.offset) || 0
  const rows = getHistory(userId, limit, offset)
  res.json({ code: 0, data: rows, message: 'success' })
})

/** GET /api/v1/tasks/:runId */
router.get('/:runId', (req: Request, res: Response) => {
  const run = getRunById(Number(req.params.runId))
  if (!run) res.status(404).json({ code: 404, data: null, message: '任务不存在' })
  else res.json({ code: 0, data: run, message: 'success' })
})

// ==================== 操作 ====================

/** POST /api/v1/tasks/:runId/abort */
router.post('/:runId/abort', (req: Request, res: Response) => {
  const success = abortRun(Number(req.params.runId))
  if (!success) res.status(404).json({ code: 404, data: null, message: '任务不存在或无法中止' })
  else res.json({ code: 0, data: { aborted: true }, message: '已中止' })
})

/** DELETE /api/v1/tasks/:runId */
router.delete('/:runId', (req: Request, res: Response) => {
  deleteRun(Number(req.params.runId))
  res.json({ code: 0, data: { deleted: true }, message: '已删除' })
})

/** POST /api/v1/tasks/:runId/retry */
router.post('/:runId/retry', async (req: Request, res: Response) => {
  try {
    const run = await retryRun(Number(req.params.runId))
    if (!run) res.status(404).json({ code: 404, data: null, message: '原任务不存在' })
    else res.json({ code: 0, data: run, message: '已重新入队' })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

export default router