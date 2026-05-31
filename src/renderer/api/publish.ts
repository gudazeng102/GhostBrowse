/**
 * 迭代 6.0: 联动发布模块 - API 封装
 */
import request from './request'

export interface PublishAccount {
  profileId: number
  profileName: string
  username: string
  status: 'healthy' | 'suspected' | 'offline'
  todayCount: number
  lastCheckTime: number | null
}

export interface PublishRecord {
  id: number
  batchId: string
  profileId: number
  profileName: string
  username: string
  content: string
  status: string
  executeAt: number
  tweetUrl: string | null
  errorMsg: string | null
  createdAt: number
}

export interface PublishRecordsResponse {
  total: number
  page: number
  pageSize: number
  records: PublishRecord[]
}

export interface PublishFailureLog {
  id: number
  batchId: string
  profileId: number
  profileName: string
  content: string
  status: string
  executeAt: number
  errorMsg: string | null
  retryCount: number
  createdAt: number
  updatedAt: number
  logMessages: string
}

export interface PublishFailureLogsResponse {
  total: number
  page: number
  pageSize: number
  records: PublishFailureLog[]
}

export async function fetchPublishAccounts(): Promise<PublishAccount[]> {
  const res = await request.get('/publish/accounts')
  return res.data.data
}

export async function createPublishTask(params: {
  profile_ids: string[]
  content: string
  delay_minutes?: number
  is_immediate?: boolean
}): Promise<{ taskId: string }> {
  const res = await request.post('/publish/task', params)
  return res.data.data
}

export async function cancelPublishTask(id: number): Promise<void> {
  await request.post('/publish/cancel/' + id)
}

export async function fetchPublishRecords(params?: {
  page?: number
  pageSize?: number
  status?: string
}): Promise<PublishRecordsResponse> {
  const res = await request.get('/publish/records', { params })
  return res.data.data
}

export async function fetchPublishFailureLogs(params?: {
  page?: number
  pageSize?: number
}): Promise<PublishFailureLogsResponse> {
  const res = await request.get('/publish/failure-logs', { params })
  return res.data.data
}

export async function checkPublishHealth(profileId: number): Promise<{ status: string; username: string }> {
  const res = await request.get('/publish/health/' + profileId)
  return res.data.data
}

export async function executeNowPublishTask(id: number): Promise<void> {
  await request.post('/publish/execute-now/' + id)
}

export async function navigateToTweet(profileId: number, url: string): Promise<void> {
  await request.post('/publish/navigate', { profileId, url })
}

export async function deletePublishRecord(id: number): Promise<void> {
  await request.delete('/publish/records/' + id)
}

export async function batchDeletePublishRecords(ids: number[]): Promise<{ deleted: number }> {
  const res = await request.post('/publish/records/batch-delete', { ids })
  return res.data.data
}

/**
 * 迭代 6.x: 带媒体的发布任务创建（multipart/form-data）
 * 不替代 createPublishTask，纯文字发布仍走 JSON
 */
export async function createPublishTaskWithMedia(
  formData: FormData,
  onUploadProgress?: (progressEvent: any) => void
): Promise<{ batchId: string; taskCount: number; mediaCount: number }> {
  const res = await request.post('/publish/task', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
    onUploadProgress
  })
  return res.data.data
}
