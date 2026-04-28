/**
 * 系统健康检查路由
 * Phase 1.7: 提供系统健康状态接口
 */

import { Router, Request, Response } from 'express'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getDatabase } from '../db'

// 创建路由实例
const router = Router()

/**
 * GET /api/v1/system/health
 * 获取系统健康状态
 * 
 * 返回系统各组件的健康状态：
 * - 运行模式（开发/生产）
 * - 数据库连接状态
 * - Extension 目录状态
 * - Profiles 目录状态
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const isDev = !app.isPackaged
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'ghostbrowse.db')
    const profilesDir = path.join(userDataPath, 'profiles')
    
    // Extension 路径检查
    const extPath = isDev
      ? path.join(process.cwd(), 'src', 'main', 'browser', 'extension')
      : path.join(process.resourcesPath, 'extension')
    
    // 数据库连接状态
    let dbConnected = false
    try {
      const db = getDatabase()
      db.prepare('SELECT 1').get()
      dbConnected = true
    } catch {
      dbConnected = false
    }
    
    const health = {
      status: 'ok',
      mode: isDev ? 'development' : 'packaged',
      version: app.getVersion(),
      database: {
        path: dbPath,
        connected: dbConnected,
        exists: fs.existsSync(dbPath)
      },
      extension: {
        path: extPath,
        exists: fs.existsSync(extPath),
        manifestExists: fs.existsSync(path.join(extPath, 'manifest.json'))
      },
      profilesDir: {
        path: profilesDir,
        exists: fs.existsSync(profilesDir)
      }
    }
    
    // 计算整体状态
    const allOk = dbConnected && health.extension.exists && health.extension.manifestExists
    health.status = allOk ? 'ok' : 'degraded'
    
    res.json({
      code: 0,
      data: health,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[System API] 健康检查失败:', err)
    res.status(500).json({
      code: 500,
      data: {
        status: 'error',
        message: err.message
      },
      message: '健康检查失败'
    })
  }
})

/**
 * GET /api/v1/system/info
 * 获取系统基本信息
 */
router.get('/info', (req: Request, res: Response) => {
  try {
    const isDev = !app.isPackaged
    
    res.json({
      code: 0,
      data: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        v8Version: process.versions.v8,
        appVersion: app.getVersion(),
        appName: app.getName(),
        appPath: app.getAppPath(),
        userDataPath: app.getPath('userData'),
        isDev,
        mode: isDev ? 'development' : 'production'
      },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[System API] 获取系统信息失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取系统信息失败'
    })
  }
})

export default router
