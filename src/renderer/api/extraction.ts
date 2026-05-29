/**
 * 迭代 5.0-5.1: 数据采集 API
 */

import request from './request'

export interface EnqueueExtractionParams {
  targetType: string
  target: string
  maxCount: number
  platform?: string
  profileIds?: number[]
  requireLogin?: boolean
  followUp?: {
    operations: string[]
    count: number
    commentText?: string
  }
}

/** 创建采集任务 */
export async function enqueueExtraction(params: EnqueueExtractionParams): Promise<any> {
  const res = await request.post<any>('/extraction/enqueue', params)
  return res.data.data
}

/** 按任务 ID 查询采集结果 */
export async function getExtractionResults(runId: number): Promise<any[]> {
  const res = await request.get<any>(`/extraction/task-run/${runId}/results`)
  return res.data.data
}

/** 导出 CSV（返回下载 URL） */
export function getExtractionCsvUrl(runId: number): string {
  return `http://localhost:3000/api/v1/extraction/export/${runId}/csv`
}