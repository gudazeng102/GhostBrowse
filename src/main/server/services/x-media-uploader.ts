/**
 * 迭代 6.x: X 媒体上传服务
 *
 * 职责：使用某个 profile 的 Web 登录态 (auth_token + ct0)
 * 把本地图片上传到 upload.twitter.com 拿到 media_id_string，
 * 供后续 CreateTweet 使用。
 *
 * 设计原则：
 * - 不持有业务概念（不知道“发布任务”、“账号联动”等）
 * - 上传失败抛错，由调用方决定重试与日志
 * - 仅支持图片（jpg/jpeg/png/webp/gif）
 * - 视频走分片 INIT/APPEND/FINALIZE/STATUS，本服务不实现
 */

import * as fs from 'fs'
import * as path from 'path'
import { XGraphQLClient, XCookieSet } from './x-graphql-client'
import { Logger } from '../../../shared/utils/logger'

const logger = new Logger('XMediaUploader')

const UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
])

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB，X 实际允许更大，先保守

export interface UploadedMedia {
  mediaId: string
  mediaKey?: string
  size: number
  type: string
}

function inferMimeByExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

/**
 * 上传单张图片
 * @param profileId 浏览器窗口 ID（决定使用哪份登录态）
 * @param localPath 本地图片绝对路径
 * @param mimeHint  可选 MIME 提示，缺省按扩展名推断
 */
export async function uploadImageForProfile(
  profileId: number,
  localPath: string,
  mimeHint?: string
): Promise<UploadedMedia> {
  if (!fs.existsSync(localPath)) {
    throw new Error('媒体文件不存在: ' + localPath)
  }
  const stat = fs.statSync(localPath)
  if (stat.size <= 0) throw new Error('媒体文件为空: ' + localPath)
  if (stat.size > MAX_IMAGE_SIZE) {
    throw new Error('媒体文件超过 ' + MAX_IMAGE_SIZE + ' 字节: ' + localPath)
  }

  const mime = (mimeHint && ALLOWED_MIME.has(mimeHint)) ? mimeHint : inferMimeByExt(localPath)
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error('不支持的媒体类型: ' + mime)
  }

  const client = new XGraphQLClient()
  const cookies: XCookieSet = await client.loadCookiesFromProfile(profileId)
  if (!cookies.auth_token || !cookies.ct0) {
    throw new Error('Profile ' + profileId + ' 未登录 X (缺少 auth_token/ct0)')
  }

  const buf = fs.readFileSync(localPath)
  // Node 18 自带 Blob / FormData / fetch
  const blob = new Blob([buf], { type: mime })

  const form = new FormData()
  form.append('media', blob, path.basename(localPath))
  // media_category 让 X 知道这是推文用图片，提升与 CreateTweet 的兼容性
  form.append('media_category', 'tweet_image')

  const headers: Record<string, string> = {
    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'x-csrf-token': cookies.ct0,
    'cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en',
    'origin': 'https://x.com',
    'referer': 'https://x.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty'
  }

  logger.info('[Upload] profile=' + profileId + ' file=' + path.basename(localPath) + ' size=' + stat.size + ' mime=' + mime)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)

  let res: Response
  try {
    res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal
    })
  } catch (err: any) {
    clearTimeout(timer)
    throw new Error('上传请求失败: ' + (err.message || String(err)))
  }
  clearTimeout(timer)

  if (!res.ok) {
    let text = ''
    try { text = await res.text() } catch {}
    throw new Error('上传失败 HTTP ' + res.status + ': ' + text.substring(0, 200))
  }

  let json: any = null
  try {
    json = await res.json()
  } catch (e: any) {
    throw new Error('上传返回不是 JSON: ' + (e.message || String(e)))
  }

  const mediaId: string | undefined =
    json?.media_id_string ||
    (typeof json?.media_id === 'number' ? String(json.media_id) : undefined)

  if (!mediaId) {
    throw new Error('上传响应缺少 media_id: ' + JSON.stringify(json).substring(0, 200))
  }

  logger.info('[Upload] OK profile=' + profileId + ' mediaId=' + mediaId)

  return {
    mediaId,
    mediaKey: json?.media_key,
    size: stat.size,
    type: mime
  }
}

/**
 * 批量上传图片（串行，避免并发触发风控）
 * 任一张失败即整体抛错，由调用方决定如何记录
 */
export async function uploadImagesForProfile(
  profileId: number,
  files: { localPath: string; mime?: string }[]
): Promise<UploadedMedia[]> {
  const out: UploadedMedia[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    try {
      const r = await uploadImageForProfile(profileId, f.localPath, f.mime)
      out.push(r)
    } catch (err: any) {
      throw new Error('第 ' + (i + 1) + ' 张图片上传失败: ' + (err.message || String(err)))
    }
  }
  return out
}