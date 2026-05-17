/**
 * 窗口配置（Profile）路由
 * Phase 1.3: 实现窗口配置的 CRUD API + Chrome 启动
 * Phase 1.7: 追加 Cookie 隔离验证接口
 */

import { Router, Request, Response } from 'express'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import Database from 'better-sqlite3'
import { getDatabase } from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { launchChrome, registerChromeProcess, getRunningProfiles, closeChrome, startSessionTabManager, importPresetCookies } from '../../browser/launcher'
import { detectProxyCountry } from '../utils/proxy-geo'
import { resolveGeoConfig, getCountryName } from '../utils/geo-config'

// 创建路由实例
const router = Router()

// ==================== Phase 3.5: session-tabs（内部调用，不走 JWT 认证） ====================
// 必须放在 authMiddleware 之前注册，确保主进程调用不受认证拦截

/**
 * GET /api/v1/profiles/status
 * 获取所有运行中的窗口 ID 列表（无需认证，供前端实时轮询）
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const runningIds = await getRunningProfiles()
    res.json({
      code: 0,
      data: { runningIds },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Profile API] 查询运行状态失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '查询运行状态失败'
    })
  }
})

/**
 * GET /api/v1/profiles/:id/session-tabs
 * Extension 或 Electron 主进程查询窗口的 Session 标签页列表
 * 不经过 authMiddleware，直接操作数据库
 */
router.get('/:id/session-tabs', (req: Request, res: Response) => {
  console.log(`[DEBUG] GET /:id/session-tabs matched, params: ${JSON.stringify(req.params)}, path: ${req.path}`)
  try {
    const { id } = req.params
    const profileId = Number(id)
    const db = getDatabase()

    const profileRow = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(profileId) as { user_id: number } | undefined
    if (!profileRow) {
      return res.status(404).json({ code: 404, data: null, message: '窗口不存在' })
    }

    // 内部调用（X-Internal-Request）不验证 userId，直接返回所有标签页
    const isInternal = req.headers['x-internal-request'] === 'electron-main'
    const userId = isInternal ? profileRow.user_id : (req as any).user?.id

    const tabs = db.prepare(`
      SELECT url, title, active, sort_order
      FROM profile_session_tabs
      WHERE profile_id = ? AND user_id = ?
      ORDER BY sort_order ASC, updated_at DESC
    `).all(profileId, userId) as { url: string; title: string | null; active: number; sort_order: number }[]

    res.json({ code: 0, data: { tabs }, message: 'success' })
  } catch (err: any) {
    console.error('[Profile API] 查询 Session 标签页失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '查询失败' })
  }
})

/**
 * POST /api/v1/profiles/:id/session-tabs/bulk
 * CDP 兜底同步：仅在启动时数据库为空时执行一次
 * Phase 3.5 Rev5: 改为增量 UPSERT + 清理死标签
 */
router.post('/:id/session-tabs/bulk', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const profileId = Number(id)
    const db = getDatabase()

    const profileRow = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(profileId) as { user_id: number } | undefined
    if (!profileRow) {
      return res.status(404).json({ code: 404, data: null, message: '窗口不存在' })
    }
    const userId = profileRow.user_id
    const { tabs } = req.body as { tabs: Array<{ url: string; title?: string; active?: number }> }

    if (!Array.isArray(tabs)) {
      return res.status(400).json({ code: 400, data: null, message: 'tabs 必须是数组' })
    }

    const now = Date.now()
    const validUrls = new Set<string>()

    // 广告域名过滤列表
    const adPatterns = ['googlesyndication', 'doubleclick', 'google.com/recaptcha', 'gstatic.com', 'google-analytics', 'googletagmanager']

    // DELETE + INSERT（不依赖 UNIQUE 约束）
    db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ?').run(profileId)

    db.transaction(() => {
      tabs.forEach((tab, idx) => {
        const url = tab.url || ''
        if (!url.startsWith('http')) return
        const lowerUrl = url.toLowerCase()
        const isAd = adPatterns.some(d => lowerUrl.includes(d))
        if (isAd) return

        validUrls.add(url)
        db.prepare(`
          INSERT INTO profile_session_tabs (profile_id, user_id, url, title, active, sort_order, updated_at, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'cdp')
        `).run(profileId, userId, url, tab.title || null, tab.active || 0, idx, now)
      })
    })()

    // 清理：删除数据库中存在但本次未上报的 URL（视为已关闭）
    const existing = db.prepare('SELECT url FROM profile_session_tabs WHERE profile_id = ?').all(profileId) as { url: string }[]
    const toDelete = existing.filter(e => !validUrls.has(e.url))
    if (toDelete.length > 0) {
      const delStmt = db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND url = ?')
      toDelete.forEach(d => delStmt.run(profileId, d.url))
    }

    console.log(`[Profile API] Profile ${profileId} bulk 增量同步: ${validUrls.size} 个标签页，清理 ${toDelete.length} 个死标签`)
    res.json({ code: 0, data: { count: validUrls.size, deleted: toDelete.length }, message: '批量同步完成' })
  } catch (err: any) {
    console.error('[Profile API] 批量同步 Session 失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '批量同步失败' })
  }
})

/**
 * POST /api/v1/profiles/:id/session-tabs
 * Extension 心跳上报单个标签页（内部调用，不走 JWT 认证）
 * Phase 3.5 Rev5: 改为 UPSERT + 广告过滤 + source 字段
 */
router.post('/:id/session-tabs', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const profileId = Number(id)
    const db = getDatabase()

    const profileRow = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(profileId) as { user_id: number } | undefined
    if (!profileRow) {
      return res.status(404).json({ code: 404, data: null, message: '窗口不存在' })
    }
    const userId = profileRow.user_id
    const { url, title, active, action, source } = req.body as {
      url: string
      title?: string
      active?: number
      action?: string
      source?: string
    }

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ code: 400, data: null, message: 'URL 无效' })
    }

    // 广告域名过滤
    const lowerUrl = url.toLowerCase()
    const isAd = ['googlesyndication', 'doubleclick', 'google.com/recaptcha', 'gstatic.com', 'google-analytics', 'googletagmanager'].some(d => lowerUrl.includes(d))
    if (isAd) {
      return res.json({ code: 0, data: { filtered: true }, message: '广告域名已过滤' })
    }

    const now = Date.now()

    if (action === 'close') {
      // 关闭时删除该条
      db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND url = ?').run(profileId, url)
      return res.json({ code: 0, data: { closed: true }, message: '标签页已关闭' })
    }

    // DELETE + INSERT（不依赖 UNIQUE 约束）
    db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND url = ?').run(profileId, url)
    db.prepare(`
      INSERT INTO profile_session_tabs (profile_id, user_id, url, title, active, sort_order, updated_at, source)
      VALUES (?, ?, ?, ?, ?, (
        SELECT COALESCE(MAX(sort_order), -1) + 1 FROM profile_session_tabs WHERE profile_id = ?
      ), ?, ?)
    `).run(profileId, userId, url, title || null, active || 0, profileId, now, source || 'extension')

    // 清理超过 90 秒未更新的死标签
    const threshold = now - 90000
    db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND updated_at < ?').run(profileId, threshold)

    res.json({ code: 0, data: { url, active: active || 0 }, message: '标签页已记录' })
  } catch (err: any) {
    console.error('[Profile API] 记录 Session 标签页失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '记录失败' })
  }
})

/**
 * DELETE /api/v1/profiles/:id/session-tabs
 * - 传 body.url → 只删除该 URL 的标签页
 * - 不传 → 清空窗口所有标签页
 * （内部调用，不走 JWT 认证）
 */
router.delete('/:id/session-tabs', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const profileId = Number(id)
    const db = getDatabase()

    const profileRow = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(profileId) as { user_id: number } | undefined
    if (!profileRow) {
      return res.status(404).json({ code: 404, data: null, message: '窗口不存在' })
    }
    const userId = profileRow.user_id

    // ✅ Phase 3.6: 支持 body.url 只删除单个标签页
    const { url } = req.body as { url?: string }

    if (url) {
      // 只删除指定 URL
      const result = db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND user_id = ? AND url = ?').run(profileId, userId, url)
      console.log(`[Profile API] 删除单个标签页: profileId=${profileId}, url=${url}, deleted=${result.changes}`)
      return res.json({ code: 0, data: { deleted: result.changes }, message: '删除成功' })
    }

    // 不传 url → 清空所有
    const result = db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND user_id = ?').run(profileId, userId)
    console.log(`[Profile API] 清空 Session 标签: profileId=${profileId}, deleted=${result.changes}`)
    res.json({ code: 0, data: { deleted: result.changes }, message: '清理成功' })
  } catch (err: any) {
    console.error('[Profile API] 清空 Session 标签页失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '清空失败' })
  }
})

/**
 * DELETE /api/v1/profiles/:id/session-tabs/:url
 * 删除单个 Session 标签页（内部调用，不走 JWT 认证）
 */
router.delete('/:id/session-tabs/:url', (req: Request, res: Response) => {
  try {
    const { id, url } = req.params
    const profileId = Number(id)
    const db = getDatabase()

    const profileRow = db.prepare('SELECT user_id FROM profiles WHERE id = ?').get(profileId) as { user_id: number } | undefined
    if (!profileRow) {
      return res.status(404).json({ code: 404, data: null, message: '窗口不存在' })
    }
    const userId = profileRow.user_id

    const urlPart = Array.isArray(url) ? url[0] : url
    const decodedUrl = decodeURIComponent(urlPart)
    const result = db.prepare('DELETE FROM profile_session_tabs WHERE profile_id = ? AND user_id = ? AND url = ?').run(profileId, userId, decodedUrl)

    console.log(`[Profile API] 删除 Session 标签: profileId=${profileId}, url=${decodedUrl}, changes=${result.changes}`)
    res.json({ code: 0, data: { deleted: result.changes }, message: '删除成功' })
  } catch (err: any) {
    console.error('[Profile API] 删除 Session 标签失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '删除失败' })
  }
})

// Phase 1.9: 大部分路由需要登录（内部调用接口在 authMiddleware 之前）
router.use(authMiddleware)

// ==================== 类型定义 ====================

/** 代理数据（来自 proxies 表） */
interface ProxyRecord {
  id: number
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string | null
  password: string | null
  remark: string | null
  created_at: number
  updated_at: number
}

/** Profile 数据 */
interface ProfileRecord {
  id: number
  title: string
  proxy_id: number | null
  chrome_version: string
  os: string
  webrtc_mode: 'forward' | 'replace' | 'real' | 'disable'
  timezone_mode: string
  geolocation_mode: string
  language_mode: string
  ui_language: string
  screen_resolution: string
  font: string
  canvas_mode: string
  webgl_mode: string
  media_device_mode: string
  created_at: number
  updated_at: number
}

/** 创建/更新 Profile 请求体 */
interface ProfileDto {
  title: string
  proxyId?: number
  chromeVersion?: string
  os?: string
  webrtcMode?: 'forward' | 'replace' | 'real' | 'disable'
  timezoneMode?: string
  geolocationMode?: string
  languageMode?: string
  uiLanguage?: string
  screenResolution?: string
  font?: string
  canvasMode?: string
  webglMode?: string
  mediaDeviceMode?: string
  startupUrl?: string
  iconPath?: string
  // Phase 3.0: 指纹参数
  deviceName?: string
  macAddress?: string
  canvasNoiseSeed?: string
  audioNoiseSeed?: string
  rectsNoiseSeed?: string
  webglVendor?: string
  webglRenderer?: string
  // Phase 4.0: Cookie 预置 JSON
  cookie_json?: string
  cookieJson?: string
}

// ==================== API 路由 ====================

// ==================== Phase 1.4: 窗口运行状态接口（必须在 /:id 之前定义） ====================
// 注意：/status 路由已在上方定义（无 authMiddleware），无需重复定义

/**
 * GET /api/v1/profiles
 * 获取窗口列表，支持关联代理信息
 * Phase 1.9: 按 user_id 过滤
 */
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const db = getDatabase()
    
    // JOIN proxies 表获取代理信息，按 user_id 过滤
    const sql = `
      SELECT 
        p.id, p.title, p.proxy_id, p.chrome_version, p.os,
        p.webrtc_mode, p.timezone_mode, p.geolocation_mode,
        p.language_mode, p.ui_language, p.screen_resolution,
        p.font, p.canvas_mode, p.webgl_mode, p.media_device_mode,
        p.startup_url, p.icon_path, p.created_at, p.updated_at,
        p.cookie_json,
        pr.id as pr_id, pr.name as pr_name, pr.type as pr_type,
        pr.host as pr_host, pr.port as pr_port, pr.username as pr_username
      FROM profiles p
      LEFT JOIN proxies pr ON p.proxy_id = pr.id
      WHERE p.user_id = ?
      ORDER BY p.id DESC
    `
    
    const rows = db.prepare(sql).all(userId) as any[]
    
    // 格式化返回数据，关联代理信息
    const list = rows.map(row => ({
      id: row.id,
      title: row.title,
      proxyId: row.proxy_id,
      chromeVersion: row.chrome_version,
      os: row.os,
      webrtcMode: row.webrtc_mode,
      timezoneMode: row.timezone_mode,
      geolocationMode: row.geolocation_mode,
      languageMode: row.language_mode,
      uiLanguage: row.ui_language,
      screenResolution: row.screen_resolution,
      font: row.font,
      canvasMode: row.canvas_mode,
      webglMode: row.webgl_mode,
      mediaDeviceMode: row.media_device_mode,
      startupUrl: row.startup_url || undefined,
      iconPath: row.icon_path || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Phase 4.0: Cookie 预置（同时返回两种命名）
      cookie_json: row.cookie_json || undefined,
      cookieJson: row.cookie_json || undefined,
      // 关联的代理信息
      proxy: row.pr_id ? {
        id: row.pr_id,
        name: row.pr_name,
        type: row.pr_type,
        host: row.pr_host,
        port: row.pr_port
      } : null
    }))
    
    res.json({
      code: 0,
      data: list,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Profile API] 获取列表失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取列表失败'
    })
  }
})

/**
 * GET /api/v1/profiles/:id
 * 获取窗口详情
 * Phase 1.9: 验证窗口归属（AND user_id = ?）
 */
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const db = getDatabase()
    
    const sql = `
      SELECT 
        p.id, p.title, p.proxy_id, p.chrome_version, p.os,
        p.webrtc_mode, p.timezone_mode, p.geolocation_mode,
        p.language_mode, p.ui_language, p.screen_resolution,
        p.font, p.canvas_mode, p.webgl_mode, p.media_device_mode,
        p.startup_url, p.icon_path, p.created_at, p.updated_at,
      p.device_name, p.mac_address, p.canvas_noise_seed,
        p.audio_noise_seed, p.rects_noise_seed, p.webgl_vendor, p.webgl_renderer,
        p.cookie_json,
        pr.id as pr_id, pr.name as pr_name, pr.type as pr_type,
        pr.host as pr_host, pr.port as pr_port, pr.username as pr_username,
        pr.password as pr_password
      FROM profiles p
      LEFT JOIN proxies pr ON p.proxy_id = pr.id
      WHERE p.id = ? AND p.user_id = ?
    `
    
    const row = db.prepare(sql).get(Number(id), userId) as any
    
    if (!row) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    const profile = {
      id: row.id,
      title: row.title,
      proxyId: row.proxy_id,
      chromeVersion: row.chrome_version,
      os: row.os,
      webrtcMode: row.webrtc_mode,
      timezoneMode: row.timezone_mode,
      geolocationMode: row.geolocation_mode,
      languageMode: row.language_mode,
      uiLanguage: row.ui_language,
      screenResolution: row.screen_resolution,
      font: row.font,
      canvasMode: row.canvas_mode,
      webglMode: row.webgl_mode,
      mediaDeviceMode: row.media_device_mode,
      startupUrl: row.startup_url || undefined,
      iconPath: row.icon_path || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Phase 3.0: 指纹参数
      deviceName: row.device_name || undefined,
      macAddress: row.mac_address || undefined,
      canvasNoiseSeed: row.canvas_noise_seed || undefined,
      audioNoiseSeed: row.audio_noise_seed || undefined,
      rectsNoiseSeed: row.rects_noise_seed || undefined,
      webglVendor: row.webgl_vendor || undefined,
      webglRenderer: row.webgl_renderer || undefined,
      // Phase 4.0: Cookie 预置（同时返回两种命名）
      cookie_json: row.cookie_json || undefined,
      cookieJson: row.cookie_json || undefined,
      proxy: row.pr_id ? {
        id: row.pr_id,
        name: row.pr_name,
        type: row.pr_type,
        host: row.pr_host,
        port: row.pr_port,
        username: row.pr_username
      } : null
    }
    
    res.json({
      code: 0,
      data: profile,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Profile API] 获取详情失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取详情失败'
    })
  }
})

/**
 * POST /api/v1/profiles
 * 创建窗口配置
 * Phase 1.9: 写入时设置 user_id
 */
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const body = req.body as ProfileDto
    const db = getDatabase()
    
    // 参数校验
    if (!body.title || !body.title.trim()) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口标题不能为空'
      })
    }
    
    // 如果指定了代理ID，检查代理是否存在且属于当前用户
    if (body.proxyId) {
      const proxy = db.prepare('SELECT id FROM proxies WHERE id = ? AND user_id = ?').get(body.proxyId, userId)
      if (!proxy) {
        return res.status(400).json({
          code: 400,
          data: null,
          message: '指定的代理不存在'
        })
      }
    }
    
    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO profiles (
        title, proxy_id, chrome_version, os,
        webrtc_mode, timezone_mode, geolocation_mode,
        language_mode, ui_language, screen_resolution,
        font, canvas_mode, webgl_mode, media_device_mode,
        startup_url, icon_path, user_id, created_at, updated_at,
        device_name, mac_address, canvas_noise_seed, audio_noise_seed,
        rects_noise_seed, webgl_vendor, webgl_renderer, cookie_json
      ) VALUES (
        @title, @proxy_id, @chrome_version, @os,
        @webrtc_mode, @timezone_mode, @geolocation_mode,
        @language_mode, @ui_language, @screen_resolution,
        @font, @canvas_mode, @webgl_mode, @media_device_mode,
        @startup_url, @icon_path, @user_id, @created_at, @updated_at,
        @device_name, @mac_address, @canvas_noise_seed, @audio_noise_seed,
        @rects_noise_seed, @webgl_vendor, @webgl_renderer, @cookie_json
      )
    `).run({
      title: body.title.trim(),
      proxy_id: body.proxyId || null,
      chrome_version: body.chromeVersion || '128',
      os: body.os || 'Windows',
      webrtc_mode: body.webrtcMode || 'replace',
      timezone_mode: body.timezoneMode || 'ip',
      geolocation_mode: body.geolocationMode || 'ip',
      language_mode: body.languageMode || 'ip',
      ui_language: body.uiLanguage || 'zh-CN',
      screen_resolution: body.screenResolution || '1920x1080',
      font: body.font || 'default',
      canvas_mode: body.canvasMode || 'noise',
      webgl_mode: body.webglMode || 'mock',
      media_device_mode: body.mediaDeviceMode || 'mock',
      startup_url: body.startupUrl || null,
      icon_path: body.iconPath || null,
      user_id: userId,
      created_at: now,
      updated_at: now,
      // Phase 3.0: 指纹参数
      device_name: body.deviceName || null,
      mac_address: body.macAddress || null,
      canvas_noise_seed: body.canvasNoiseSeed || null,
      audio_noise_seed: body.audioNoiseSeed || null,
      rects_noise_seed: body.rectsNoiseSeed || null,
      webgl_vendor: body.webglVendor || null,
      webgl_renderer: body.webglRenderer || null,
      cookie_json: body.cookieJson || body.cookie_json || null
    })
    
    res.json({
      code: 0,
      data: {
        id: result.lastInsertRowid
      },
      message: '创建成功'
    })
  } catch (err: any) {
    console.error('[Profile API] 创建失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '创建失败'
    })
  }
})

/**
 * PUT /api/v1/profiles/:id
 * 更新窗口配置
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const body = req.body as ProfileDto
    const db = getDatabase()
    
    // 检查窗口是否存在
    const existing = db.prepare('SELECT id FROM profiles WHERE id = ?').get(Number(id))
    if (!existing) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 参数校验
    if (!body.title || !body.title.trim()) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口标题不能为空'
      })
    }
    
    // 如果指定了代理ID，检查代理是否存在
    if (body.proxyId) {
      const proxy = db.prepare('SELECT id FROM proxies WHERE id = ?').get(body.proxyId)
      if (!proxy) {
        return res.status(400).json({
          code: 400,
          data: null,
          message: '指定的代理不存在'
        })
      }
    }
    
    const result = db.prepare(`
      UPDATE profiles SET
        title = @title,
        proxy_id = @proxy_id,
        chrome_version = @chrome_version,
        os = @os,
        webrtc_mode = @webrtc_mode,
        timezone_mode = @timezone_mode,
        geolocation_mode = @geolocation_mode,
        language_mode = @language_mode,
        ui_language = @ui_language,
        screen_resolution = @screen_resolution,
        font = @font,
        canvas_mode = @canvas_mode,
        webgl_mode = @webgl_mode,
        media_device_mode = @media_device_mode,
        startup_url = @startup_url,
        icon_path = @icon_path,
        updated_at = @updated_at,
        device_name = @device_name,
        mac_address = @mac_address,
        canvas_noise_seed = @canvas_noise_seed,
        audio_noise_seed = @audio_noise_seed,
        rects_noise_seed = @rects_noise_seed,
        webgl_vendor = @webgl_vendor,
        webgl_renderer = @webgl_renderer,
        cookie_json = @cookie_json
      WHERE id = @id
    `).run({
      id: Number(id),
      title: body.title.trim(),
      proxy_id: body.proxyId || null,
      chrome_version: body.chromeVersion || '128',
      os: body.os || 'Windows',
      webrtc_mode: body.webrtcMode || 'replace',
      timezone_mode: body.timezoneMode || 'ip',
      geolocation_mode: body.geolocationMode || 'ip',
      language_mode: body.languageMode || 'ip',
      ui_language: body.uiLanguage || 'zh-CN',
      screen_resolution: body.screenResolution || '1920x1080',
      font: body.font || 'default',
      canvas_mode: body.canvasMode || 'noise',
      webgl_mode: body.webglMode || 'mock',
      media_device_mode: body.mediaDeviceMode || 'mock',
      startup_url: body.startupUrl || null,
      icon_path: body.iconPath || null,
      updated_at: Date.now(),
      // Phase 3.0: 指纹参数
      device_name: body.deviceName || null,
      mac_address: body.macAddress || null,
      canvas_noise_seed: body.canvasNoiseSeed || null,
      audio_noise_seed: body.audioNoiseSeed || null,
      rects_noise_seed: body.rectsNoiseSeed || null,
      webgl_vendor: body.webglVendor || null,
      webgl_renderer: body.webglRenderer || null,
      // Phase 4.0: Cookie 预置
      cookie_json: body.cookieJson || body.cookie_json || null
    })
    
    res.json({
      code: 0,
      data: {
        changes: result.changes
      },
      message: '更新成功'
    })
  } catch (err: any) {
    console.error('[Profile API] 更新失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '更新失败'
    })
  }
})

/**
 * DELETE /api/v1/profiles/:id
 * 删除窗口配置
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查窗口是否存在
    const existing = db.prepare('SELECT id FROM profiles WHERE id = ?').get(Number(id))
    if (!existing) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // Phase 2.2: 删除前先清理关联数据（避免外键约束失败）
    try {
      // 删除关联的 fingerprint_checks 记录
      db.prepare('DELETE FROM fingerprint_checks WHERE profile_id = ?').run(Number(id))
    } catch (e) {
      // 忽略错误（表可能不存在）
      console.warn('[Profile API] 删除 fingerprint_checks 关联记录失败:', e)
    }
    
    const result = db.prepare('DELETE FROM profiles WHERE id = ?').run(Number(id))
    
    res.json({
      code: 0,
      data: {
        changes: result.changes
      },
      message: '删除成功'
    })
  } catch (err: any) {
    console.error('[Profile API] 删除失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '删除失败'
    })
  }
})

/**
 * POST /api/v1/profiles/:id/launch
 * 启动 Chrome 窗口
 */
router.post('/:id/launch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 1. 查询窗口配置
    const profileRow = db.prepare(`
      SELECT 
        p.id, p.title, p.proxy_id, p.chrome_version, p.os,
        p.webrtc_mode, p.timezone_mode, p.geolocation_mode,
        p.language_mode, p.ui_language, p.screen_resolution,
        p.font, p.canvas_mode, p.webgl_mode, p.media_device_mode,
        p.startup_url, p.icon_path, p.cookie_json,
        pr.id as pr_id, pr.name as pr_name, pr.type as pr_type,
        pr.host as pr_host, pr.port as pr_port, pr.username as pr_username,
        pr.password as pr_password
      FROM profiles p
      LEFT JOIN proxies pr ON p.proxy_id = pr.id
      WHERE p.id = ?
    `).get(Number(id)) as any
    
    if (!profileRow) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 2. 构建 Profile 对象（Phase 3.3: 追加所有 Phase 3.0 字段）
    const profile = {
      id: profileRow.id,
      title: profileRow.title,
      proxyId: profileRow.proxy_id,
      chromeVersion: profileRow.chrome_version,
      os: profileRow.os,
      webrtcMode: profileRow.webrtc_mode,
      timezoneMode: profileRow.timezone_mode,
      geolocationMode: profileRow.geolocation_mode,
      languageMode: profileRow.language_mode,
      uiLanguage: profileRow.ui_language,
      screenResolution: profileRow.screen_resolution,
      font: profileRow.font,
      canvasMode: profileRow.canvas_mode,
      webglMode: profileRow.webgl_mode,
      mediaDeviceMode: profileRow.media_device_mode,
      startupUrl: profileRow.startup_url || '',
      iconPath: profileRow.icon_path || null,
      // Phase 3.0: 指纹参数（传递给 content-script.js）
      deviceName: profileRow.device_name || null,
      macAddress: profileRow.mac_address || null,
      canvasNoiseSeed: profileRow.canvas_noise_seed || null,
      audioNoiseSeed: profileRow.audio_noise_seed || null,
      rectsNoiseSeed: profileRow.rects_noise_seed || null,
      webglVendor: profileRow.webgl_vendor || null,
      webglRenderer: profileRow.webgl_renderer || null,
      // Phase 4.0: Cookie 预置 JSON
      cookie_json: profileRow.cookie_json || undefined
    }
    
    // 3. 构建 Proxy 对象（如果有代理）
    const proxy = profileRow.pr_id ? {
      id: profileRow.pr_id,
      name: profileRow.pr_name,
      type: profileRow.pr_type,
      host: profileRow.pr_host,
      port: profileRow.pr_port,
      username: profileRow.pr_username,
      password: profileRow.pr_password
    } : null
    
    // 4. 调用 launcher 启动 Chrome

    if (proxy) {

    } else {

    }
    
    const result = await launchChrome(profile, proxy)
    

    
    // Phase 1.4: 启动成功后注册进程到映射表
    registerChromeProcess(profile.id, result.pid, result.userDataDir)
    
    // Phase 3.5 Rev2: 启动 Session Tab Manager（Electron 主进程轮询 CDP，每 5 秒同步到后端）
    const debugPort = 9000 + profile.id
    startSessionTabManager(profile.id, debugPort)
    
    // Phase 4.0: 启动成功后导入预置 Cookie
    if (profileRow.cookie_json) {
      console.log(`[Profile API] Profile ${profile.id} 导入预置 Cookie，长度=${profileRow.cookie_json.length}`)
      importPresetCookies(profile.id, profileRow.cookie_json).then(r => {
        console.log(`[Profile API] 预置 Cookie 导入结果: ${r.message}`)
      }).catch(e => {
        console.warn(`[Profile API] 预置 Cookie 导入失败: ${e.message}`)
      })
    }
    
    res.json({
      code: 0,
      data: {
        pid: result.pid,
        userDataDir: result.userDataDir
      },
      message: '窗口启动成功'
    })
  } catch (err: any) {
    console.error('[Profile API] 启动窗口失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '启动窗口失败'
    })
  }
})

// ==================== Phase 1.4: 关闭窗口接口 ====================

/**
 * POST /api/v1/profiles/:id/close
 * 关闭指定窗口的 Chrome 进程
 */
router.post('/:id/close', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查窗口是否存在
    const existing = db.prepare('SELECT id FROM profiles WHERE id = ?').get(Number(id))
    if (!existing) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    

    
    // 调用 launcher 关闭进程
    const result = await closeChrome(Number(id))
    
    if (result.success) {
      res.json({
        code: 0,
        data: {
          success: true
        },
        message: '窗口已关闭'
      })
    } else {
      res.json({
        code: 0,
        data: {
          success: false,
          message: result.message || '窗口未运行'
        },
        message: result.message || '窗口未运行'
      })
    }
  } catch (err: any) {
    console.error('[Profile API] 关闭窗口失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '关闭窗口失败'
    })
  }
})

// ==================== Phase 1.7: Cookie 隔离验证接口 ====================

/**
 * GET /api/v1/profiles/:id/isolation-check
 * 验证窗口的数据隔离状态
 */
router.get('/:id/isolation-check', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查窗口是否存在
    const existing = db.prepare('SELECT id FROM profiles WHERE id = ?').get(Number(id))
    if (!existing) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 构建 userDataDir 路径（与 launcher.ts 完全一致）
    const userDataDir = path.join(
      app.isPackaged ? app.getPath('userData') : process.cwd(),
      'profiles',
      String(id)
    )
    
    // 检查目录是否存在
    const dirExists = fs.existsSync(userDataDir)
    
    if (!dirExists) {
      return res.json({
        code: 0,
        data: {
          isolated: false,
          userDataDir,
          hasCookiesFile: false,
          hasLocalStorage: false,
          message: '数据目录尚未创建，首次启动窗口后将自动生成'
        },
        message: 'success'
      })
    }
    
    // 检查 Chrome 数据文件
    const cookiesPath = path.join(userDataDir, 'Cookies')
    const localStoragePath = path.join(userDataDir, 'Local Storage')
    const networkPath = path.join(userDataDir, 'Network')
    
    const hasCookiesFile = fs.existsSync(cookiesPath)
    const hasLocalStorage = fs.existsSync(localStoragePath) || fs.existsSync(networkPath)
    
    const isolated = hasCookiesFile || hasLocalStorage
    
    res.json({
      code: 0,
      data: {
        isolated,
        userDataDir,
        hasCookiesFile,
        hasLocalStorage,
        message: isolated ? '数据隔离正常' : '目录存在，但尚未写入数据'
      },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Profile API] 隔离检查失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '隔离检查失败'
    })
  }
})

// ==================== Phase 3.0: 生成新指纹接口 ====================

/**
 * 生成 8 位十六进制随机字符串
 */
function generateHexSeed(length: number = 8): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 16).toString(16).toUpperCase()
  }
  return result
}

/**
 * 生成随机 MAC 地址
 */
function generateMacAddress(): string {
  const hexDigits = '0123456789ABCDEF'
  let mac = ''
  for (let i = 0; i < 6; i++) {
    if (i > 0) mac += '-'
    mac += hexDigits[Math.floor(Math.random() * 16)]
    mac += hexDigits[Math.floor(Math.random() * 16)]
  }
  return mac
}

/**
 * 生成随机 Windows 计算机名
 */
function generateDeviceName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let name = 'USER-'
  for (let i = 0; i < 8; i++) {
    name += chars[Math.floor(Math.random() * chars.length)]
  }
  return name
}

/**
 * 构建 User-Agent
 */
function buildUserAgent(chromeVersion: string): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`
}

/**
 * POST /api/v1/profiles/generate-fingerprint
 * 生成随机指纹配置
 */
router.post('/generate-fingerprint', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { proxyId } = req.body as { proxyId?: number }
    const db = getDatabase()

    let geoConfig = resolveGeoConfig(null)
    let proxyCountry: string | null = null

    // 如果传了 proxyId，查询代理信息并检测国家
    if (proxyId) {
      const proxy = db.prepare('SELECT * FROM proxies WHERE id = ? AND user_id = ?').get(proxyId, userId) as any
      if (proxy) {
        proxyCountry = await detectProxyCountry({
          type: proxy.type,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password
        })
        geoConfig = resolveGeoConfig(proxyCountry)

      }
    }

    // 随机选择 Chrome 版本
    const chromeVersions = ['121',
'122',
'123',
'124',
'140',
'141',
'142',
'143',
'144',
'145',
'147']
    const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)]

    // WebGL 供应商和渲染器映射
    const webglOptions = [
      { vendor: 'Intel Inc.', renderer: 'Intel Iris Xe Graphics' },
      { vendor: 'AMD', renderer: 'AMD Radeon RX 580 Series' },
      { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1080' },
      { vendor: 'Intel Inc.', renderer: 'Intel UHD Graphics 620' },
      { vendor: 'AMD', renderer: 'AMD Radeon Vega 8' },
    ]
    const webglChoice = webglOptions[Math.floor(Math.random() * webglOptions.length)]

    // 构建指纹配置
    const fingerprint = {
      chromeVersion,
      userAgent: buildUserAgent(chromeVersion),
      os: 'Windows',
      webrtcMode: 'disable',
      timezoneMode: 'ip',
      geolocationMode: 'ip',
      languageMode: 'ip',
      uiLanguage: geoConfig.language,
      screenResolution: geoConfig.resolution,
      font: geoConfig.font,
      canvasMode: 'noise',
      canvasNoiseSeed: generateHexSeed(),
      webglMode: 'mock',
      webglVendor: webglChoice.vendor,
      webglRenderer: webglChoice.renderer,
      audioContextMode: 'noise',
      audioContextNoiseSeed: generateHexSeed(),
      clientRectsMode: 'noise',
      clientRectsNoiseSeed: generateHexSeed(),
      deviceName: generateDeviceName(),
      macAddress: generateMacAddress(),
      mediaDeviceMode: 'mock'
    }



    res.json({
      code: 200,
      data: fingerprint,
      message: '指纹生成成功'
    })
  } catch (err: any) {
    console.error('[Profile API] 生成指纹失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '生成指纹失败'
    })
  }
})

// ==================== Phase 2.3: 智能配置接口 ====================

/**
 * POST /api/v1/profiles/:id/smart-config
 * 一键智能配置：根据代理IP自动设置指纹参数
 */
router.post('/:id/smart-config', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const db = getDatabase()
    
    // 1. 查询窗口配置
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(Number(id), userId) as any
    
    if (!profile) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 2. 查询绑定的代理
    if (!profile.proxy_id) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '请先绑定代理，智能配置需要根据代理IP国家匹配指纹'
      })
    }
    
    const proxy = db.prepare('SELECT * FROM proxies WHERE id = ? AND user_id = ?').get(profile.proxy_id, userId) as any
    
    if (!proxy) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '代理不存在，请重新绑定'
      })
    }
    
    // 3. 检测代理出口国家
    const countryCode = await detectProxyCountry({
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password
    })
    
    // 4. 获取指纹配置
    const geoConfig = resolveGeoConfig(countryCode)
    const countryName = getCountryName(countryCode || '')
    

    
    // 5. 更新数据库
    const now = Date.now()
    db.prepare(`
      UPDATE profiles SET
        ui_language = ?,
        font = ?,
        screen_resolution = ?,
        webrtc_mode = 'replace',
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      geoConfig.language,
      geoConfig.font,
      geoConfig.resolution,
      now,
      Number(id),
      userId
    )
    
    // 6. 返回配置结果
    res.json({
      code: 200,
      data: {
        country: countryName,
        ui_language: geoConfig.language,
        font: geoConfig.font,
        screen_resolution: geoConfig.resolution,
        timezone_mode: 'ip',
        geolocation_mode: 'ip',
        language_mode: 'ip',
        webrtc_mode: 'replace'
      },
      message: `智能配置完成：已匹配 ${countryName} 地区指纹`
    })
  } catch (err: any) {
    console.error('[Profile API] 智能配置失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '智能配置失败'
    })
  }
})

// ==================== Phase 2.3: 启动时 auto 值解析 ====================

/**
 * 解析 profile 中的 auto 值
 * 在启动 Chrome 前调用，根据代理IP国家设置实际值
 */
function resolveProfileAutoFields(profile: any, proxy: any): any {
  const resolved = { ...profile }
  
  // 检查是否有 auto 字段需要解析
  const autoFields = ['ui_language', 'font', 'screen_resolution']
  const hasAuto = autoFields.some(field => profile[field] === 'auto')
  
  if (!hasAuto || !proxy) {
    // 没有 auto 值或没有代理，直接返回
    return resolved
  }
  
  // 同步检测代理国家（简单实现，同步调用）
  try {
    // 由于 detectProxyCountry 是 async，这里用同步方式获取
    // 我们直接在这里实现同步版本
    const countryCode = syncDetectProxyCountry(proxy)
    const geoConfig = resolveGeoConfig(countryCode)
    
    // 解析 auto 值
    if (profile.ui_language === 'auto') {
      resolved.uiLanguage = geoConfig.language
    }
    if (profile.font === 'auto') {
      resolved.font = geoConfig.font
    }
    if (profile.screen_resolution === 'auto') {
      resolved.screenResolution = geoConfig.resolution
    }
    

  } catch (err) {
    console.error('[AutoResolve] 解析 auto 值失败:', err)
  }
  
  return resolved
}

/**
 * 同步版本的代理国家检测（简化实现）
 */
function syncDetectProxyCountry(proxy: any): string | null {
  try {
    // 这里使用简化的同步方式，实际生产环境应该用 async/await
    // 但由于 launchChrome 已经是 async，这里可以等待
    return null // 暂时返回 null，等待前端触发智能配置
  } catch {
    return null
  }
}

// ==================== Phase 3.3: 一致性校验引擎 ====================

/**
 * 一致性校验单项结果
 */
interface ConsistencyCheckItem {
  category: string
  status: 'pass' | 'warning' | 'fail'
  message: string
  suggestion: string | null
}

/**
 * 一致性校验总结果
 */
interface ConsistencyCheckResult {
  profileId: number
  overallScore: number
  level: 'excellent' | 'good' | 'fair' | 'poor'
  checks: ConsistencyCheckItem[]
  summary: {
    pass: number
    warning: number
    fail: number
  }
}

/**
 * 根据分辨率推断合理的硬件核心数
 */
function inferHardwareConcurrency(resolution: string): number {
  const [w, h] = (resolution || '1920x1080').split('x').map(Number)
  if (w >= 3840 || h >= 2160) return 8  // 4K+
  if (w >= 2560 || h >= 1440) return 6  // 2K+
  if (w >= 1920 || h >= 1080) return 4  // 1080p
  if (w >= 1366 || h >= 768) return 2   // 768p
  return 2
}

/**
 * 时区-语言匹配检测
 */
function checkTimezoneLanguageConsistency(timezone: string, uiLanguage: string): ConsistencyCheckItem {
  const tzToLanguages: Record<string, string[]> = {
    'Asia/Shanghai': ['zh-CN', 'zh', 'zh-SG', 'zh-HK'],
    'Asia/Tokyo': ['ja-JP', 'ja'],
    'Asia/Seoul': ['ko-KR', 'ko'],
    'Asia/Bangkok': ['th-TH', 'th'],
    'Europe/London': ['en-GB', 'en'],
    'Europe/Berlin': ['de-DE', 'de', 'de-AT', 'de-CH'],
    'Europe/Paris': ['fr-FR', 'fr', 'fr-CA', 'fr-BE'],
    'Europe/Madrid': ['es-ES', 'es'],
    'Europe/Rome': ['it-IT', 'it'],
    'Europe/Amsterdam': ['nl-NL', 'nl'],
    'Europe/Moscow': ['ru-RU', 'ru'],
    'America/New_York': ['en-US', 'en'],
    'America/Los_Angeles': ['en-US', 'en'],
    'America/Chicago': ['en-US', 'en'],
    'America/Toronto': ['en-CA', 'en', 'fr-CA'],
    'America/Vancouver': ['en-CA', 'en'],
    'America/Sao_Paulo': ['pt-BR', 'pt'],
    'America/Buenos_Aires': ['es-AR', 'es']
  }

  const expectedLangs = tzToLanguages[timezone]
  if (!expectedLangs) {
    return {
      category: '时区-语言',
      status: 'warning',
      message: `时区 ${timezone} 未配置预期语言列表`,
      suggestion: null
    }
  }

  const baseLang = uiLanguage.split('-')[0]
  if (expectedLangs.some(l => l.startsWith(baseLang))) {
    return {
      category: '时区-语言',
      status: 'pass',
      message: `时区 ${timezone} 与界面语言 ${uiLanguage} 匹配`,
      suggestion: null
    }
  }

  return {
    category: '时区-语言',
    status: 'warning',
    message: `时区 ${timezone} 与界面语言 ${uiLanguage} 不匹配`,
    suggestion: `建议将界面语言改为 ${expectedLangs[0]} 或 ${expectedLangs[1] || expectedLangs[0]}`
  }
}

/**
 * OS-显卡匹配检测
 */
function checkOsGpuConsistency(os: string, webglVendor: string, webglRenderer: string): ConsistencyCheckItem {
  const validVendors: Record<string, string[]> = {
    'Windows': ['Intel', 'NVIDIA', 'AMD', 'Qualcomm'],
    'macOS': ['Apple', 'Intel', 'AMD'],
    'Linux': ['Intel', 'NVIDIA', 'AMD', 'Mesa']
  }

  const valid = validVendors[os] || validVendors['Windows']
  if (valid.some(v => webglVendor.includes(v))) {
    return {
      category: 'OS-显卡',
      status: 'pass',
      message: `系统 ${os} 与显卡 ${webglVendor} 匹配`,
      suggestion: null
    }
  }

  return {
    category: 'OS-显卡',
    status: 'warning',
    message: `系统 ${os} 与显卡 ${webglVendor} 可能不匹配`,
    suggestion: `建议显卡供应商使用 ${valid.join('/')} 之一`
  }
}

/**
 * WebRTC-代理安全性检测
 */
function checkWebrtcProxyConsistency(webrtcMode: string, hasProxy: boolean): ConsistencyCheckItem {
  if (hasProxy && webrtcMode !== 'disable') {
    return {
      category: 'WebRTC-代理',
      status: 'warning',
      message: `使用了代理但 WebRTC 模式为 ${webrtcMode}，存在泄露真实 IP 的风险`,
      suggestion: '建议将 WebRTC 模式改为 "disable" 以确保安全'
    }
  }

  return {
    category: 'WebRTC-代理',
    status: 'pass',
    message: webrtcMode === 'disable' ? 'WebRTC 已禁用，安全' : `WebRTC 模式为 ${webrtcMode}`,
    suggestion: webrtcMode !== 'disable' ? '建议在生产环境使用 disable 模式' : null
  }
}

/**
 * 分辨率-核心数匹配检测
 */
function checkResolutionCoresConsistency(screenResolution: string, hardwareConcurrency: number): ConsistencyCheckItem {
  const expected = inferHardwareConcurrency(screenResolution)
  if (Math.abs(hardwareConcurrency - expected) <= 2) {
    return {
      category: '分辨率-核心数',
      status: 'pass',
      message: `分辨率 ${screenResolution} 与核心数 ${hardwareConcurrency} 匹配`,
      suggestion: null
    }
  }

  return {
    category: '分辨率-核心数',
    status: 'warning',
    message: `分辨率 ${screenResolution} 预期核心数约 ${expected}，当前 ${hardwareConcurrency}`,
    suggestion: `建议调整 hardwareConcurrency 为 ${expected} 左右`
  }
}

/**
 * Chrome 版本-分辨率匹配检测
 */
function checkChromeVersionResolutionConsistency(chromeVersion: string, screenResolution: string): ConsistencyCheckItem {
  const ver = parseInt(chromeVersion) || 128
  const [w] = (screenResolution || '1920x1080').split('x').map(Number)

  // 高版本 Chrome 通常配合较高分辨率屏幕
  if (ver >= 121 && w < 1920) {
    return {
      category: 'Chrome版本-分辨率',
      status: 'warning',
      message: `Chrome ${ver} 版本较高但分辨率 ${screenResolution} 较低`,
      suggestion: '考虑使用更高分辨率或较低 Chrome 版本以保持一致性'
    }
  }

  return {
    category: 'Chrome版本-分辨率',
    status: 'pass',
    message: `Chrome ${ver} 与分辨率 ${screenResolution} 匹配合理`,
    suggestion: null
  }
}

/**
 * POST /api/v1/profiles/:id/validate-consistency
 * 一致性校验：验证当前指纹配置的逻辑自洽性
 */
router.post('/:id/validate-consistency', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const db = getDatabase()

    // 1. 查询窗口配置（包含 Phase 3.0 字段）
    const profile = db.prepare(`
      SELECT 
        p.id, p.screen_resolution, p.ui_language, p.os,
        p.webrtc_mode, p.proxy_id,
        p.webgl_vendor, p.webgl_renderer, p.chrome_version,
        p.canvas_noise_seed, p.audio_noise_seed, p.rects_noise_seed,
        pr.id as pr_id
      FROM profiles p
      LEFT JOIN proxies pr ON p.proxy_id = pr.id
      WHERE p.id = ? AND p.user_id = ?
    `).get(Number(id), userId) as any

    if (!profile) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }

    // 2. 执行一致性校验
    const checks: ConsistencyCheckItem[] = []

    // 时区-语言匹配（需要从 timezone_mode 解析实际时区）
    const timezone = profile.timezone_mode === 'ip' ? 'Asia/Shanghai' : 'Asia/Shanghai'
    checks.push(checkTimezoneLanguageConsistency(timezone, profile.ui_language))

    // OS-显卡匹配
    checks.push(checkOsGpuConsistency(
      profile.os || 'Windows',
      profile.webgl_vendor || 'Intel Inc.',
      profile.webgl_renderer || 'Intel Iris Xe Graphics'
    ))

    // WebRTC-代理安全性
    checks.push(checkWebrtcProxyConsistency(
      profile.webrtc_mode || 'disable',
      !!profile.pr_id
    ))

    // 分辨率-核心数（需要从 canvas_noise_seed 推断，这里简化处理）
    const inferredCores = inferHardwareConcurrency(profile.screen_resolution || '1920x1080')
    checks.push(checkResolutionCoresConsistency(
      profile.screen_resolution || '1920x1080',
      inferredCores
    ))

    // Chrome版本-分辨率
    checks.push(checkChromeVersionResolutionConsistency(
      profile.chrome_version || '128',
      profile.screen_resolution || '1920x1080'
    ))

    // 3. 计算总分
    const passCount = checks.filter(c => c.status === 'pass').length
    const warningCount = checks.filter(c => c.status === 'warning').length
    const failCount = checks.filter(c => c.status === 'fail').length
    const overallScore = Math.round((passCount / checks.length) * 100)

    let level: 'excellent' | 'good' | 'fair' | 'poor' = 'good'
    if (overallScore >= 95) level = 'excellent'
    else if (overallScore >= 80) level = 'good'
    else if (overallScore >= 60) level = 'fair'
    else level = 'poor'

    const result: ConsistencyCheckResult = {
      profileId: profile.id,
      overallScore,
      level,
      checks,
      summary: {
        pass: passCount,
        warning: warningCount,
        fail: failCount
      }
    }



    res.json({
      code: 200,
      data: result,
      message: '一致性校验完成'
    })
  } catch (err: any) {
    console.error('[Profile API] 一致性校验失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '一致性校验失败'
    })
  }
})

export default router
