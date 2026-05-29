/**
 * 迭代 5.0-5.3: 数据采集路由
 * 挂载在 /api/v1/extraction
 *
 * 接口：
 * - POST /api/v1/extraction/enqueue  → 创建采集任务并入队
 * - GET  /api/v1/extraction/:id/results → 查询采集结果
 * - GET  /api/v1/extraction/task-run/:runId/results → 按任务ID查询
 * - GET  /api/v1/extraction/export/:runId/csv → 导出 CSV
 */

import { Router, Request, Response } from 'express'
import { getDatabase } from '../db'
import { enqueueTask } from '../../automation/task-scheduler'
import type { TaskPlan, ExtractionPlan, FollowUpAction } from '../../../shared/automation/task-types'

const router = Router()

/**
 * POST /api/v1/extraction/enqueue
 * 创建采集任务
 * Body: { targetType, target, maxCount, platform, profileIds?, requireLogin, followUp? }
 * followUp: { operations: string[], count: number, commentText?: string }
 */
router.post('/enqueue', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId || 1
    const { targetType, target, maxCount, platform, profileIds, requireLogin, followUp } = req.body

    if (!targetType || !target) {
      res.status(400).json({ code: 400, data: null, message: '缺少 targetType 或 target' })
      return
    }

    const extractionPlan: ExtractionPlan = {
      targetType,
      target,
      maxCount: maxCount || 100,
      platform: platform || 'twitter',
      requireLogin: requireLogin !== false
    }

    const plan: TaskPlan = {
      action: 'extraction',
      target_accounts: target.startsWith('@') ? [target.slice(1)] : [],
      operations: ['collect'],
      constraints: { view_count: maxCount || 100, like_count: 0, selective: false },
      extraction: extractionPlan,
      duration_minutes: 0,
      pause_after: false,
      platform: platform || 'twitter'
    }

    // 如果指定了 profileIds，批量下发
    const ids = profileIds || []
    const runs: any[] = []
    for (const profileId of ids) {
      const run = await enqueueTask({ profileId, plan, userId })
      runs.push(run)
    }

    res.json({ code: 0, data: { runs, plan, followUp: followUp || null }, message: `已向 ${runs.length} 个窗口下发采集任务` })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

/**
 * GET /api/v1/extraction/task-run/:runId/results
 * 按任务 ID 查询采集结果
 */
router.get('/task-run/:runId/results', (req: Request, res: Response) => {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM extraction_results WHERE task_run_id = ? ORDER BY collected_at ASC').all(Number(req.params.runId))
  res.json({ code: 0, data: rows, message: 'success' })
})

/**
 * GET /api/v1/extraction/export/:runId/csv
 * 导出 CSV（根据 data_type 区分推文/用户信息格式）
 */
router.get('/export/:runId/csv', (req: Request, res: Response) => {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM extraction_results WHERE task_run_id = ? ORDER BY collected_at ASC').all(Number(req.params.runId)) as any[]

  const firstRow = rows[0]
  const isUserProfile = firstRow?.data_type === 'user_profile'

  let csv = ''
  if (isUserProfile) {
    csv = 'id,显示名,用户名,简介,关注,粉丝,推文数,位置,加入日期,认证\n'
  } else {
    csv = 'id,平台,数据类型,内容,作者,时间,点赞,转发,评论,收藏,链接,采集时间\n'
  }

  for (const row of rows) {
    let data: any = {}
    try { data = JSON.parse(row.raw_data) } catch {}

    if (isUserProfile) {
      const displayName = (data.displayName || '').replace(/"/g, '""')
      const userName = row.user_name ? '@' + row.user_name : ''
      const bio = (data.bio || '').replace(/"/g, '""').substring(0, 200)
      const following = data.following || ''
      const followers = data.followers || ''
      const tweetCount = data.tweetCount || ''
      const location = (data.location || '').replace(/"/g, '""')
      const joinDate = data.joinDate || ''
      const verified = data.verified === 'true' ? '是' : '否'
      csv += `${row.id},"${displayName}",${userName},"${bio}",${following},${followers},${tweetCount},"${location}",${joinDate},${verified}\n`
    } else {
      const time = data.time || ''
      const author = (data.authorName || '').replace(/"/g, '""')
      const text = (data.text || '').replace(/"/g, '""').substring(0, 200)
      const likes = data.likes || '0'
      const retweets = data.retweets || '0'
      const replies = data.replies || '0'
      const bookmarks = data.bookmarks || '0'
      const url = data.url || ''
      const colTime = new Date(row.collected_at).toISOString()
      csv += `${row.id},${row.platform},${row.data_type},"${text}","${author}",${time},${likes},${retweets},${replies},${bookmarks},${url},${colTime}\n`
    }
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="extraction_${req.params.runId}.csv"`)
  res.send('\ufeff' + csv)
})

export default router