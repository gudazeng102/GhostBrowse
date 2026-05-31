/**
 * MediaPicker 通用图片/媒体选择组件 - 类型定义
 */

export type MediaListType = 'picture-card' | 'list'

export type MediaRejectReason =
  | 'invalid_mime'
  | 'invalid_ext'
  | 'too_large'
  | 'exceed_count'
  | 'business_rejected'
  | 'duplicate'

export interface MediaRejectInfo {
  file: File
  reason: MediaRejectReason
  message: string
}

export interface MediaValidateResult {
  ok: boolean
  errors: MediaRejectInfo[]
}