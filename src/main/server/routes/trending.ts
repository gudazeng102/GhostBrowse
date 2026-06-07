/**
 * Trending 热搜路由
 * 挂载在 /api/v1/trending
 *
 * 接口：
 * - POST /api/v1/trending/scrape → 抓取 X 热搜话题
 *   Body: { profileId: number }
 *   返回 TrendingItem[]
 */

import { Router, Request, Response } from 'express'
import { scrapeTrending } from '../../automation/trending-scraper'

const router = Router()

/**
 * POST /api/v1/trending/scrape
 * 通过指定窗口抓取 X 热搜
 */
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { profileId } = req.body

    if (!profileId || typeof profileId !== 'number') {
      res.status(400).json({
        code: 400,
        data: null,
        message: '缺少 profileId 参数'
      })
      return
    }

    const items = await scrapeTrending(profileId)
    res.json({
      code: 0,
      data: items,
      message: `成功获取 ${items.length} 个热搜话题`
    })
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || String(err)
    })
  }
})

export default router