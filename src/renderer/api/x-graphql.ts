/**
 * 迭代 6.2: X GraphQL API 调用封装
 */

import request from './request'

/** 拉取关注列表 */
export async function fetchFollowingList(target: string, profileId: number): Promise<{ total: number; users: { screenName: string; name: string; userId: string }[] }> {
  const res = await request.post<any>('/x/following-list', { target, profileId })
  return res.data.data
}

/** 批量查询用户详情 */
export async function fetchUserDetails(screenNames: string[], profileId: number): Promise<{ total: number; failed: number; results: { screenName: string; data: any }[] }> {
  const res = await request.post<any>('/x/user-detail', { screenNames, profileId })
  return res.data.data
}

/** 启动完整链路采集（立即返回 taskId，后台异步执行） */
export async function fullCollect(target: string, profileId: number): Promise<{ taskId: string }> {
  const res = await request.post<any>('/x/full-collect', { target, profileId }, { timeout: 600000 })
  return res.data.data
}

/** 轮询采集进度 */
export async function getCollectProgress(taskId: string): Promise<{
  taskId: string
  target: string
  stage: string
  totalFound: number
  detailsQueried: number
  detailsTotal: number
  inserted: number
  logs: { time: string; msg: string; type: string }[]
  error?: string
}> {
  const res = await request.get<any>(`/x/collect-progress/${taskId}`)
  return res.data.data
}