/**
 * Trend Radar API 封装
 * 调用主进程 Express 提供的 /api/v1/trend-radar/* 接口
 *
 * 用法：
 *   import { analyzeTrend } from '../../api/trend-radar'
 *   const result = await analyzeTrend({ topic: '#AI', userInstruction: '...' })
 */

import request from './request'
import type { TrendAnalysisResult } from '../../shared/ai/trend-radar-types'

export interface AnalyzeTrendParams {
  topic: string
  userInstruction?: string
  accountPersona?: string
  extractionRunId?: number
  maxCount?: number
}

/**
 * 执行热点分析
 * POST /api/v1/trend-radar/analyze
 */
export async function analyzeTrend(params: AnalyzeTrendParams): Promise<TrendAnalysisResult> {
  const res = await request.post<any>('/trend-radar/analyze', params, {
    timeout: 120 * 1000
  })
  return res.data.data
}

/**
 * 打开浏览器发推页面并填入文案
 * POST /api/v1/compose/open
 */
export async function navigateCompose(profileId: number, text: string): Promise<void> {
  await request.post<any>('/compose/open', { profileId, text }, {
    timeout: 30 * 1000
  })
}