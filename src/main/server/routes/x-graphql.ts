/**
 * 迭代 6.0: X GraphQL API 路由
 * 挂载在 /api/v1/x
 *
 * 接口：
 * - GET  /api/v1/x/capture-queryid → 从浏览器实时抓取 queryId
 * - POST /api/v1/x/following-list  → 拉取关注列表
 * - POST /api/v1/x/user-detail     → 查询用户详情
 * - POST /api/v1/x/full-collect    → 完整链路采集
 */

import { Router, Request, Response } from 'express'
import http from 'http'
import WebSocket from 'ws'
import { XGraphQLClient } from '../services/x-graphql-client'
import { getDatabase } from '../db'
import { createProgress, getProgress, updateProgress, addLog, deleteProgress } from '../services/collect-progress'

const router = Router()

/**
 * GET /api/v1/x/capture-queryid?profileId=169
 * 从浏览器实时抓取 X GraphQL queryId
 * 导航到 x.com → 监听 Network.requestWillBeSent → 提取 graphql URL 中的 queryId
 */
router.get('/capture-queryid', async (req: Request, res: Response) => {
  const profileId = Number(req.query.profileId)
  if (!profileId) {
    res.status(400).json({ code: 400, data: null, message: '缺少 profileId' })
    return
  }

  try {
    const debugPort = 9000 + profileId
    // 获取 CDP WebSocket URL
    const targets = await new Promise<any[]>((resolve, reject) => {
      http.get(`http://localhost:${debugPort}/json`, (r) => {
        let d = ''
        r.on('data', c => d += c)
        r.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error('解析失败')) } })
      }).on('error', reject)
    })
    const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
    if (!page?.webSocketDebuggerUrl) {
      res.status(500).json({ code: 500, data: null, message: '未找到 page target' })
      return
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl)
    const queryIds: Record<string, string> = {}
    let hasError: string | null = null

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { ws.close() } catch {}
        if (!hasError && Object.keys(queryIds).length === 0) hasError = '超时'
        resolve()
      }, 30000)
      let step = 0
      let navId = 0
      let evalId1 = 0
      let evalId2 = 0

      ws.on('open', () => {
        navId = ++step
        // 先导航到 X 首页，让页面加载最新的 JS bundle
        ws.send(JSON.stringify({ id: navId, method: 'Page.navigate', params: { url: 'https://x.com/home' } }))
      })

      ws.on('message', (dataRaw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(dataRaw.toString())

          // 导航完成后，延迟等待页面 JS 加载，然后 evaluate 提取
          if (msg.id === navId && msg?.result) {
            setTimeout(() => {
              // 第一步：从首页 HTML 中提取 main JS bundle URL
              evalId1 = ++step
              ws.send(JSON.stringify({
                id: evalId1, method: 'Runtime.evaluate',
                params: {
                  expression: `
                    (function() {
                      var scripts = document.querySelectorAll('script[src*="main"]');
                      for (var i = 0; i < scripts.length; i++) {
                        var src = scripts[i].getAttribute('src') || '';
                        if (src.indexOf('main') !== -1 && src.indexOf('.js') !== -1) return src;
                      }
                      return '';
                    })()
                  `,
                  returnByValue: true, timeout: 5000
                }
              }))
            }, 4000)
            return
          }

          // 第一步结果：拿到 bundle URL
          if (msg.id === evalId1 && msg?.result) {
            const bundleUrl: string = msg.result?.result?.value || ''
            if (bundleUrl) {
              // 第二步：fetch JS bundle 并正则匹配 queryId
              evalId2 = ++step
              ws.send(JSON.stringify({
                id: evalId2, method: 'Runtime.evaluate',
                params: {
                  expression: `
                    (function() {
                      return fetch(${JSON.stringify(bundleUrl)})
                        .then(r => r.text())
                        .then(code => {
                          var names = ['Following', 'UserByScreenName', 'UserByRestId', 'CreateTweet'];
                          var result = {};
                          for (var n = 0; n < names.length; n++) {
                            var re1 = new RegExp(names[n] + '"[\\\\s\\\\S]{0,20}?"([a-zA-Z0-9_-]+)"');
                            // 也试 queryId 模式
                            if (!result[names[n]]) {
                              var m = code.match(new RegExp('queryId\\\\s*:\\\\s*"([a-zA-Z0-9_-]+)"[\\\\s\\\\S]{0,200}?' + names[n]));
                              if (m) result[names[n]] = m[1];
                            }
                            if (!result[names[n]]) {
                              var m2 = code.match(new RegExp(names[n] + '"[\\\\s\\\\S]{0,200}?queryId\\\\s*:\\\\s*"([a-zA-Z0-9_-]+)"'));
                              if (m2) result[names[n]] = m2[1];
                            }
                          }
                          return JSON.stringify(result);
                        })
                        .catch(function() { return '{}'; });
                    })()
                  `,
                  returnByValue: true, timeout: 15000
                }
              }))
            } else {
              clearTimeout(timer); try { ws.close() } catch {}; resolve()
            }
            return
          }

          // 第二步结果：解析 queryId
          if (msg.id === evalId2 && msg?.result) {
            clearTimeout(timer); try { ws.close() } catch {}
            try {
              const parsed = JSON.parse(msg.result?.result?.value || '{}')
              for (const [k, v] of Object.entries(parsed)) {
                if (v) queryIds[k] = v as string
              }
            } catch {}
            resolve()
          }
        } catch {}
      })
      ws.on('error', () => { clearTimeout(timer); resolve() })
    })

    res.json({
      code: 0,
      data: queryIds,
      message: `捕获到 ${Object.keys(queryIds).length} 个 queryId`
    })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

/**
 * POST /api/v1/x/following-list
 */
router.post('/following-list', async (req: Request, res: Response) => {
  const { target, profileId } = req.body as { target?: string; profileId?: number }
  if (!target || !profileId) {
    res.status(400).json({ code: 400, data: null, message: '缺少 target 或 profileId' })
    return
  }
  const cleanTarget = target.replace(/^@/, '').trim()
  if (!cleanTarget) { res.status(400).json({ code: 400, data: null, message: '目标账号为空' }); return }

  try {
    const client = new XGraphQLClient()
    const users = await client.fetchFollowingList(cleanTarget, profileId)
    res.json({ code: 0, data: { total: users.length, users }, message: `成功获取 ${users.length} 个关注用户` })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

/**
 * POST /api/v1/x/user-detail
 */
router.post('/user-detail', async (req: Request, res: Response) => {
  const { screenNames, profileId } = req.body as { screenNames?: string[]; profileId?: number }
  if (!screenNames || !Array.isArray(screenNames) || screenNames.length === 0) {
    res.status(400).json({ code: 400, data: null, message: '缺少 screenNames' }); return
  }
  if (!profileId) { res.status(400).json({ code: 400, data: null, message: '缺少 profileId' }); return }

  try {
    const client = new XGraphQLClient()
    const results = await client.batchFetchUserDetails(screenNames, profileId)
    res.json({ code: 0, data: { total: results.length, failed: screenNames.length - results.length, results }, message: `成功查询 ${results.length}/${screenNames.length} 个用户` })
  } catch (err: any) {
    res.status(500).json({ code: 500, data: null, message: err.message })
  }
})

/**
 * GET /api/v1/x/collect-progress/:taskId
 * 轮询采集进度
 */
router.get('/collect-progress/:taskId', (req: Request, res: Response) => {
  const taskId = String(req.params.taskId)
  const progress = getProgress(taskId)
  if (!progress) {
    res.status(404).json({ code: 404, data: null, message: '任务不存在或已过期' })
    return
  }
  res.json({ code: 0, data: progress, message: 'success' })
})

/**
 * GET /api/v1/x/export-api-csv/:taskId
 * 导出 API 采集的用户数据（仅 api_source='api' 的 user_profile 数据）
 */
router.get('/export-api-csv/:taskId', (req: Request, res: Response) => {
  const taskId = String(req.params.taskId)
  const progress = getProgress(taskId)
  if (!progress) {
    res.status(404).json({ code: 404, data: null, message: '任务不存在或已完成' })
    return
  }

  const db = getDatabase()
  // 通过进度对象中的 target 找到对应的 extraction_results
  const rows = db.prepare(
    "SELECT * FROM extraction_results WHERE target = ? AND data_type = 'user_profile' AND api_source = 'api' ORDER BY id ASC"
  ).all(`@${progress.target}`) as any[]

  if (rows.length === 0) {
    res.status(404).json({ code: 404, data: null, message: '没有可导出的数据' })
    return
  }

  let csv = 'id,显示名,用户名,简介,关注,粉丝,推文数,位置,加入日期,认证,头像URL,个人主页\n'
  for (const row of rows) {
    let data: any = {}
    try { data = JSON.parse(row.raw_data) } catch {}
    const displayName = (data.displayName || '').replace(/"/g, '""')
    const userName = row.user_name ? '@' + row.user_name : ''
    const bio = (data.bio || '').replace(/"/g, '""')
    const following = data.following || ''
    const followers = data.followers || ''
    const tweetCount = data.tweetCount || ''
    const location = (data.location || '').replace(/"/g, '""')
    const joinDate = data.joinDate || ''
    const verified = data.verified === 'true' ? '是' : '否'
    const avatarUrl = data.avatarUrl || ''
    const profileUrl = data.profileUrl || ''
    csv += `${row.id},"${displayName}",${userName},"${bio}",${following},${followers},${tweetCount},"${location}",${joinDate},${verified},"${avatarUrl}",${profileUrl}\n`
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="api_collect_${progress.target}.csv"`)
  res.send('\ufeff' + csv)
})

/**
 * POST /api/v1/x/full-collect
 * 带实时进度回传
 */
router.post('/full-collect', async (req: Request, res: Response) => {
  const { target, profileId } = req.body as { target?: string; profileId?: number }
  const userId = (req as any).userId || 1
  if (!target || !profileId) { res.status(400).json({ code: 400, data: null, message: '缺少 target 或 profileId' }); return }
  const cleanTarget = target.replace(/^@/, '').trim()
  if (!cleanTarget) { res.status(400).json({ code: 400, data: null, message: '目标账号为空' }); return }

  // 创建进度任务
  const taskId = createProgress(cleanTarget)
  // 立即返回 taskId，后续异步执行
  res.json({ code: 0, data: { taskId }, message: '采集任务已启动' })

  // 异步执行，不阻塞 HTTP 响应
  ;(async () => {
    const db = getDatabase()
    const client = new XGraphQLClient()

    try {
      updateProgress(taskId, { stage: 'fetching_following' })
      addLog(taskId, '正在连接浏览器获取 Cookie...')

      const users = await client.fetchFollowingList(cleanTarget, profileId, (current) => {
        addLog(taskId, `翻页中... 已发现 ${current} 个关注用户`)
      })

      updateProgress(taskId, { totalFound: users.length, currentPage: 1 })
      addLog(taskId, `共发现 ${users.length} 个关注用户，资料已随翻页获取`, 'success')

      if (users.length === 0) {
        addLog(taskId, '没有发现关注用户，结束', 'warn')
        updateProgress(taskId, { stage: 'done' })
        return
      }

      updateProgress(taskId, { stage: 'writing_db', detailsTotal: users.length, detailsQueried: users.length })

      const now = Date.now()
      let inserted = 0
      const stmt = db.prepare('INSERT INTO extraction_results (user_id, profile_id, platform, target_type, target, user_name, data_type, raw_data, collected_at, api_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const u of users) {
        if (!u.data) continue
        try {
          stmt.run(userId, profileId, 'twitter', 'following_list', `@${cleanTarget}`, u.screenName, 'user_profile', JSON.stringify(u.data), now, 'api')
          inserted++
        } catch {}
      }

      updateProgress(taskId, { stage: 'done', inserted })
      addLog(taskId, `写入完成：共写入 ${inserted} 条数据`, 'success')
      addLog(taskId, '采集完成！', 'success')
    } catch (err: any) {
      updateProgress(taskId, { stage: 'error', error: err.message })
      addLog(taskId, `采集失败: ${err.message}`, 'error')
    }
  })()
})
export default router
