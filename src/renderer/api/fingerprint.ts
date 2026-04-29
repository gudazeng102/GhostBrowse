/**
 * 指纹检测 API
 * Phase 2.0: 实现窗口指纹检测和纯洁度评估前端接口
 */

import request from './request'

/**
 * 执行指纹检测
 * @param profileId 窗口 ID
 */
export function checkFingerprint(profileId: number) {
  return request.post('/fingerprint/check', { profileId })
}

/**
 * 获取检测历史
 * @param profileId 可选，指定窗口 ID
 */
export function getFingerprintHistory(profileId?: number) {
  return request.get('/fingerprint/history', {
    params: profileId ? { profileId } : undefined
  })
}

/**
 * 清除检测历史
 * @param profileId 可选，指定窗口 ID
 */
export function clearFingerprintHistory(profileId?: number) {
  return request.delete('/fingerprint/history', { data: profileId ? { profileId } : {} })
}