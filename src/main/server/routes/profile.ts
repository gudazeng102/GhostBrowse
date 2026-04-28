/**
 * 窗口配置（Profile）路由
 * Phase 1.3: 实现窗口配置的 CRUD API + Chrome 启动
 */

import { Router, Request, Response } from 'express'
import { getDatabase } from '../db'
import { launchChrome, registerChromeProcess, getRunningProfiles, closeChrome } from '../../browser/launcher'

// 创建路由实例
const router = Router()

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
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase()
    
    // JOIN proxies 表获取代理信息
    const sql = `
      SELECT 
        p.id, p.title, p.proxy_id, p.chrome_version, p.os,
        p.webrtc_mode, p.timezone_mode, p.geolocation_mode,
        p.language_mode, p.ui_language, p.screen_resolution,
        p.font, p.canvas_mode, p.webgl_mode, p.media_device_mode,
        p.created_at, p.updated_at,
        pr.id as pr_id, pr.name as pr_name, pr.type as pr_type,
        pr.host as pr_host, pr.port as pr_port, pr.username as pr_username
      FROM profiles p
      LEFT JOIN proxies pr ON p.proxy_id = pr.id
      ORDER BY p.id DESC
    `
    
    const rows = db.prepare(sql).all() as any[]
    
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
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    const sql = `
      SELECT 
        p.id, p.title, p.proxy_id, p.chrome_version, p.os,
        p.webrtc_mode, p.timezone_mode, p.geolocation_mode,
        p.language_mode, p.ui_language, p.screen_resolution,
        p.font, p.canvas_mode, p.webgl_mode, p.media_device_mode,
        p.created_at, p.updated_at,
        pr.id as pr_id, pr.name as pr_name, pr.type as pr_type,
        pr.host as pr_host, pr.port as pr_port, pr.username as pr_username,
        pr.password as pr_password
      FROM profiles p
      LEFT JOIN proxies pr ON p.proxy_id = pr.id
      WHERE p.id = ?
    `
    
    const row = db.prepare(sql).get(Number(id)) as any
    
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
 */
router.post('/', (req: Request, res: Response) => {
  try {
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
    
    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO profiles (
        title, proxy_id, chrome_version, os,
        webrtc_mode, timezone_mode, geolocation_mode,
        language_mode, ui_language, screen_resolution,
        font, canvas_mode, webgl_mode, media_device_mode,
        created_at, updated_at
      ) VALUES (
        @title, @proxy_id, @chrome_version, @os,
        @webrtc_mode, @timezone_mode, @geolocation_mode,
        @language_mode, @ui_language, @screen_resolution,
        @font, @canvas_mode, @webgl_mode, @media_device_mode,
        @created_at, @updated_at
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
      mediaDeviceMode: profileRow.media_device_mode
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
router.post('/:id/close', async (req: Request, res: Response) => {
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

export default router
