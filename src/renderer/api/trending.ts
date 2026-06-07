/**
 * Trending 热搜 API 封装
 * 调用主进程 Express 提供的 /api/v1/trending/* 接口
 */

import request from './request'

export interface TrendingItem {
  rank: number
  name: string
  tweetCount: string
  category?: string
}

/**
 * 通过指定窗口抓取 X 热搜
 * POST /api/v1/trending/scrape
 */
export async function scrapeTrending(profileId: number): Promise<TrendingItem[]> {
  const res = await request.post<any>('/trending/scrape', { profileId }, {
    timeout: 30 * 1000
  })
  return res.data.data
}