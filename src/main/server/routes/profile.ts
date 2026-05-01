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
import { launchChrome, registerChromeProcess, getRunningProfiles, closeChrome } from '../../browser/launcher'
import { detectProxyCountry } from '../utils/proxy-geo'
import { resolveGeoConfig, getCountryName } from '../utils/geo-config'

// 创建路由实例
const router = Router()

// Phase 1.9: 所有窗口路由都需要登录
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
}

// ==================== API 路由 ====================

// ==================== Phase 1.4: 窗口运行状态接口（必须在 /:id 之前定义） ====================

/**
 * GET /api/v1/profiles/status
 * 获取所有运行中的窗口 ID 列表
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    // 获取运行中的 Profile ID 列表（自动清理已死亡进程）
    const runningIds = getRunningProfiles()
    
    console.log(`[Profile API] 查询运行状态，运行中: ${runningIds.join(', ') || '无'}`)
    
    res.json({
      code: 0,
      data: {
        runningIds
      },
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
        p.startup_url, p.created_at, p.updated_at,
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
        p.startup_url, p.created_at, p.updated_at,
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
        startup_url, user_id, created_at, updated_at
      ) VALUES (
        @title, @proxy_id, @chrome_version, @os,
        @webrtc_mode, @timezone_mode, @geolocation_mode,
        @language_mode, @ui_language, @screen_resolution,
        @font, @canvas_mode, @webgl_mode, @media_device_mode,
        @startup_url, @user_id, @created_at, @updated_at
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
      user_id: userId,
      created_at: now,
      updated_at: now
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
        updated_at = @updated_at
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
      updated_at: Date.now()
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
    
    try {
      // 删除关联的 cookie_backups 记录
      db.prepare('DELETE FROM cookie_backups WHERE profile_id = ?').run(Number(id))
    } catch (e) {
      // 忽略错误（表可能不存在）
      console.warn('[Profile API] 删除 cookie_backups 关联记录失败:', e)
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
        p.startup_url,
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
    
    // 2. 构建 Profile 对象
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
      startupUrl: profileRow.startup_url || ''
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
    console.log(`[Profile API] 启动窗口: ${profile.title} (ID: ${profile.id})`)
    if (proxy) {
      console.log(`[Profile API] 使用代理: ${proxy.name} (${proxy.host}:${proxy.port})`)
    } else {
      console.log(`[Profile API] 无代理配置`)
    }
    
    const result = await launchChrome(profile, proxy)
    
    console.log(`[Profile API] 窗口启动成功，PID: ${result.pid}`)
    
    // Phase 1.4: 启动成功后注册进程到映射表
    registerChromeProcess(profile.id, result.pid, result.userDataDir)
    
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
    
    console.log(`[Profile API] 关闭窗口: ID ${id}`)
    
    // 调用 launcher 关闭进程
    const result = await closeChrome(Number(id))
    
    // === Phase 2.2: 窗口关闭成功后自动备份 Cookie（开始）===
    if (result.success) {
      try {
        // 确保 cookie_backups 表存在（兼容旧数据库）
        const { ensureCookieBackupsTable } = require('./cookie')
        ensureCookieBackupsTable()
        
        const profileDataDir = path.join(
          app.isPackaged ? app.getPath('userData') : process.cwd(),
          'profiles',
          String(id)
        )
        const cookiesFile = path.join(profileDataDir, 'Default', 'Cookies')
        
        if (fs.existsSync(cookiesFile)) {
          const backupDir = path.join(app.getPath('userData'), 'backups', String(id))
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true })
          }
          
          const backupPath = path.join(backupDir, `${Date.now()}_cookies.sqlite`)
          fs.copyFileSync(cookiesFile, backupPath)
          
          // 统计 Cookie 数量
          let cookieCount = 0
          try {
            const cookieDb = new Database(cookiesFile, { readonly: true })
            const count = cookieDb.prepare('SELECT COUNT(*) as count FROM cookies').get() as { count: number }
            cookieCount = count.count
            cookieDb.close()
          } catch (e) {
            console.error('[AutoBackup] 统计 Cookie 数量失败:', e)
          }
          
          const stats = fs.statSync(cookiesFile)
          db.prepare(
            'INSERT INTO cookie_backups (profile_id, user_id, backup_type, backup_path, cookie_count, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(Number(id), req.user?.userId || 0, 'auto', backupPath, cookieCount, stats.size, Date.now())
          
          console.log(`[AutoBackup] 窗口 ${id} 自动备份完成: ${cookieCount} 条 Cookie`)
        }
      } catch (e) {
        console.error('[AutoBackup] 窗口', id, '自动备份失败:', e)
      }
    }
    // === Phase 2.2: 窗口关闭成功后自动备份 Cookie（结束）===
    
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

// ==================== Phase 2.2: 挂载 Cookie 管理子路由 ====================
import cookieRouter from './cookie'
router.use('/:id/cookies', cookieRouter)

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
    
    console.log(`[SmartConfig] Profile ${id} 智能配置: 代理=${proxy.host}:${proxy.port}, 国家=${countryCode || '未知'}`)
    
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
    
    console.log(`[AutoResolve] Profile ${profile.id} 解析 auto 值: 国家=${countryCode || '未知'}, 语言=${resolved.uiLanguage}, 字体=${resolved.font}, 分辨率=${resolved.screenResolution}`)
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

export default router
