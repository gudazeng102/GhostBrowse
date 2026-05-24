/**
 * 窗口分组 API 封装
 * Phase 5.0
 */

import request from './request'

export interface ProfileGroup {
  id: number
  name: string
  color: string
  remark?: string
  sortOrder: number
  profileCount?: number
  createdAt?: number
  updatedAt?: number
}

export interface ProfileGroupListResult {
  groups: ProfileGroup[]
  ungroupedCount: number
}

export interface ProfileGroupDto {
  name: string
  color?: string
  remark?: string
  sortOrder?: number
}

/**
 * 获取分组列表（含每组的窗口数量 + 未分组数量）
 */
export async function getGroupList(): Promise<ProfileGroupListResult> {
  const res = await request.get('/profile-groups')
  return res.data.data as ProfileGroupListResult
}

/**
 * 获取分组详情
 */
export async function getGroupDetail(id: number): Promise<ProfileGroup> {
  const res = await request.get(`/profile-groups/${id}`)
  return res.data.data as ProfileGroup
}

/**
 * 创建分组
 */
export async function createGroup(data: ProfileGroupDto): Promise<{ id: number }> {
  const res = await request.post('/profile-groups', data)
  return res.data.data
}

/**
 * 更新分组
 */
export async function updateGroup(id: number, data: ProfileGroupDto): Promise<void> {
  await request.put(`/profile-groups/${id}`, data)
}

/**
 * 删除分组（组内窗口自动变为"未分组"）
 */
export async function deleteGroup(id: number): Promise<void> {
  await request.delete(`/profile-groups/${id}`)
}

/**
 * 批量移动窗口到指定分组
 * - groupId 为 null / 0 时，移动到"未分组"
 */
export async function moveProfilesToGroup(
  groupId: number | null,
  profileIds: number[]
): Promise<{ changes: number; targetGroupId: number | null }> {
  const target = groupId === null ? 'ungrouped' : String(groupId)
  const res = await request.post(`/profile-groups/${target}/move`, { profileIds })
  return res.data.data
}