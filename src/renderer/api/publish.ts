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

export async function checkPublishHealth(profileId: number): Promise<{ status: string; username: string }> {
  const res = await request.get('/publish/health/' + profileId)
  return res.data.data
}

export async function deletePublishRecord(id: number): Promise<void> {
  await request.delete('/publish/records/' + id)
}

export async function batchDeletePublishRecords(ids: number[]): Promise<{ deleted: number }> {
  const res = await request.post('/publish/records/batch-delete', { ids })
  return res.data.data
}

