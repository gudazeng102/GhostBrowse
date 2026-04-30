/**
 * Cookie 管理路由
 * Phase 2.2: 窗口 Cookie / 缓存核心管理
 * 
 * 职责：
 * - Cookie 状态查看（数量、域名、平台识别）
 * - 手动导出 Cookie 到备份目录
 * - 从备份恢复 Cookie
 * - 清理缓存（Cookies / LocalStorage / IndexedDB / Cache）
 * - 备份列表查询和删除
 */

import { Router, Request, Response } from 'express'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import Database from 'better-sqlite3'
import { getDatabase } from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { isProfileRunning } from '../../browser/launcher'

// 创建路由实例（启用 mergeParams 以获取父路由的 :id 参数）
const router = Router({ mergeParams: true })

// Phase 1.9: 所有 Cookie 路由都需要登录
router.use(authMiddleware)

// ==================== 辅助函数 ====================

/**
 * 获取窗口的 user-data-dir 路径（必须与 launcher.ts 完全一致）
 */
function getProfileDataDir(profileId: number): string {
  return path.join(
    app.isPackaged ? app.getPath('userData') : process.cwd(),
    'profiles',
    profileId.toString()
  )
}

/**
 * 获取备份目录路径
 */
function getBackupDir(profileId: number): string {
  return path.join(
    app.isPackaged ? app.getPath('userData') : process.cwd(),
    'backups',
    profileId.toString()
  )
}

/**
 * 统计 Cookies 数据库中的 cookie 数量
 */
function countCookies(cookiesFile: string): number {
  try {
    if (!fs.existsSync(cookiesFile)) return 0
    const cookieDb = new Database(cookiesFile, { readonly: true })
    const result = cookieDb.prepare('SELECT COUNT(*) as count FROM cookies').get() as { count: number }
    cookieDb.close()
    return result.count
  } catch {
    return 0
  }
}

/**
 * 读取 Cookies 域名分布（元数据，不读取加密 value）
 */
function getCookieDomains(cookiesFile: string): string[] {
  try {
    if (!fs.existsSync(cookiesFile)) return []
    const cookieDb = new Database(cookiesFile, { readonly: true })
    const rows = cookieDb.prepare('SELECT DISTINCT host_key FROM cookies').all() as { host_key: string }[]
    cookieDb.close()
    return rows.map(r => r.host_key).sort()
  } catch {
    return []
  }
}

/**
 * 检测关键平台
 */
function detectPlatforms(domains: string[]): string[] {
  const platforms: string[] = []
  const map: Record<string, string> = {
    'facebook.com': 'Facebook',
    'amazon.com': 'Amazon',
    'tiktok.com': 'TikTok',
    'google.com': 'Google',
    'twitter.com': 'Twitter/X',
    'x.com': 'Twitter/X',
    'instagram.com': 'Instagram',
    'youtube.com': 'YouTube',
    'ebay.com': 'eBay',
    'shopify.com': 'Shopify',
    'linkedin.com': 'LinkedIn',
    'reddit.com': 'Reddit',
    'pinterest.com': 'Pinterest',
    'whatsapp.com': 'WhatsApp',
    'telegram.org': 'Telegram'
  }
  for (const domain of domains) {
    for (const [key, name] of Object.entries(map)) {
      if (domain.includes(key) && !platforms.includes(name)) {
        platforms.push(name)
      }
    }
  }
  return platforms
}

/**
 * 计算目录大小（字节）
 */
function getDirSize(dirPath: string): number {
  let size = 0
  try {
    if (!fs.existsSync(dirPath)) return 0
    
    const files = fs.readdirSync(dirPath)
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        size += getDirSize(filePath)
      } else {
        size += stat.size
      }
    }
  } catch {
    // 忽略错误
  }
  return size
}

/**
 * 检查存储类型是否存在
 */
function checkStorageExists(dataDir: string): Record<string, boolean> {
  return {
    cookiesFileExists: fs.existsSync(path.join(dataDir, 'Default', 'Cookies')),
    localStorageExists: fs.existsSync(path.join(dataDir, 'Default', 'Local Storage')),
    sessionStorageExists: fs.existsSync(path.join(dataDir, 'Default', 'Session Storage')),
    indexedDBExists: fs.existsSync(path.join(dataDir, 'Default', 'IndexedDB')),
    cacheExists: fs.existsSync(path.join(dataDir, 'Default', 'Cache')) || 
                 fs.existsSync(path.join(dataDir, 'Default', 'Code Cache')) ||
                 fs.existsSync(path.join(dataDir, 'Default', 'GPUCache'))
  }
}

/**
 * 验证窗口归属（检查 profile 是否属于当前用户）
 * 注意：user_id 可能为 NULL（旧数据），需要兼容处理
 */
function validateProfileOwnership(profileId: number, userId: number): boolean {
  const db = getDatabase()
  try {
    // 先检查 user_id 列是否存在
    const columns = db.prepare('PRAGMA table_info(profiles)').all() as any[]
    const hasUserId = columns.some(col => col.name === 'user_id')
    
    if (hasUserId) {
      // user_id 列存在，使用 AND user_id = ?
      const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?').get(profileId, userId)
      return !!profile
    } else {
      // user_id 列不存在（旧数据库），只检查 id
      const profile = db.prepare('SELECT id FROM profiles WHERE id = ?').get(profileId)
      return !!profile
    }
  } catch (err) {
    console.error('[Cookie API] validateProfileOwnership 失败:', err)
    return false
  }
}

/**
 * 确保 cookie_backups 表存在（兼容旧数据库）
 */
function ensureCookieBackupsTable(): void {
  const db = getDatabase()
  try {
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cookie_backups'"
    ).get()
    if (!tableExists) {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS cookie_backups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          backup_type TEXT NOT NULL DEFAULT 'auto' CHECK(backup_type IN ('auto','manual')),
          backup_path TEXT NOT NULL,
          cookie_count INTEGER DEFAULT 0,
          size_bytes INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        )
      `).run()
      console.log('[Cookie API] cookie_backups 表创建成功')
    }
  } catch (err) {
    console.error('[Cookie API] cookie_backups 表创建失败:', err)
  }
}

// ==================== API 路由 ====================

/**
 * GET /api/v1/profiles/:id/cookies
 * Cookie 状态查看
 */
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    // 确保 cookie_backups 表存在（兼容旧数据库）
    ensureCookieBackupsTable()
    
    const profileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)
    const userId = req.user!.userId
    const db = getDatabase()
    
    // 验证窗口归属
    if (!validateProfileOwnership(profileId, userId)) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    const dataDir = getProfileDataDir(profileId)
    const cookiesFile = path.join(dataDir, 'Default', 'Cookies')
    
    // 统计 Cookie 信息
    const cookieCount = countCookies(cookiesFile)
    const domains = getCookieDomains(cookiesFile)
    const platforms = detectPlatforms(domains)
    const storageStatus = checkStorageExists(dataDir)
    
    // 计算总大小
    let totalSizeBytes = 0
    if (fs.existsSync(dataDir)) {
      // 统计 Default 目录下的主要存储大小
      const defaultDir = path.join(dataDir, 'Default')
      if (fs.existsSync(defaultDir)) {
        totalSizeBytes += getDirSize(defaultDir)
      }
    }
    
    res.json({
      code: 200,
      data: {
        cookieCount,
        domains: domains.slice(0, 20), // 限制最多 20 个域名
        domainCount: domains.length,
        platforms,
        ...storageStatus,
        totalSizeBytes
      },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Cookie API] 获取状态失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取状态失败'
    })
  }
})

/**
 * POST /api/v1/profiles/:id/cookies/export
 * 手动导出 Cookie
 */
router.post('/export', (req: AuthRequest, res: Response) => {
  try {
    // 确保 cookie_backups 表存在（兼容旧数据库）
    ensureCookieBackupsTable()
    
    const profileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)
    const userId = req.user!.userId
    const db = getDatabase()
    
    // 验证窗口归属
    if (!validateProfileOwnership(profileId, userId)) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 检查窗口是否运行中
    if (isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口正在运行中，请先关闭后再导出 Cookie'
      })
    }
    
    const dataDir = getProfileDataDir(profileId)
    const cookiesFile = path.join(dataDir, 'Default', 'Cookies')
    
    // 检查 Cookies 文件是否存在
    if (!fs.existsSync(cookiesFile)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: 'Cookies 文件不存在，该窗口尚未产生浏览数据'
      })
    }
    
    // 创建备份目录
    const backupDir = getBackupDir(profileId)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    
    // 复制 Cookies 文件到备份目录
    const timestamp = Date.now()
    const backupPath = path.join(backupDir, `${timestamp}_cookies.sqlite`)
    fs.copyFileSync(cookiesFile, backupPath)
    
    // 统计 Cookie 数量
    const cookieCount = countCookies(cookiesFile)
    
    // 获取文件大小
    const stats = fs.statSync(cookiesFile)
    
    // 写入备份记录
    const result = db.prepare(`
      INSERT INTO cookie_backups (profile_id, user_id, backup_type, backup_path, cookie_count, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(profileId, userId, 'manual', backupPath, cookieCount, stats.size, timestamp)
    
    console.log(`[Cookie API] 手动导出成功: Profile ${profileId}, ${cookieCount} 条 Cookie`)
    
    res.json({
      code: 200,
      message: '导出成功',
      data: {
        backupId: result.lastInsertRowid,
        backupPath,
        cookieCount,
        sizeBytes: stats.size,
        createdAt: timestamp
      }
    })
  } catch (err: any) {
    console.error('[Cookie API] 导出失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '导出失败'
    })
  }
})

/**
 * POST /api/v1/profiles/:id/cookies/restore
 * 从备份恢复 Cookie
 */
router.post('/restore', (req: AuthRequest, res: Response) => {
  try {
    // 确保 cookie_backups 表存在（兼容旧数据库）
    ensureCookieBackupsTable()
    
    const profileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)
    const userId = req.user!.userId
    const { backupId } = req.body as { backupId: number }
    const db = getDatabase()
    
    // 验证窗口归属
    if (!validateProfileOwnership(profileId, userId)) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 检查窗口是否运行中
    if (isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口正在运行中，请先关闭后再恢复 Cookie'
      })
    }
    
    // 查询备份记录
    const backup = db.prepare(
      'SELECT * FROM cookie_backups WHERE id = ? AND profile_id = ? AND user_id = ?'
    ).get(backupId, profileId, userId) as any
    
    if (!backup) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '备份记录不存在'
      })
    }
    
    // 检查备份文件是否存在
    if (!fs.existsSync(backup.backup_path)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '备份文件已丢失，请删除该备份记录'
      })
    }
    
    // 备份当前 Cookies（恢复前先备份当前状态）
    const dataDir = getProfileDataDir(profileId)
    const currentCookies = path.join(dataDir, 'Default', 'Cookies')
    if (fs.existsSync(currentCookies)) {
      const backupDir = getBackupDir(profileId)
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
      }
      const preBackupPath = path.join(backupDir, `${Date.now()}_pre_restore.sqlite`)
      fs.copyFileSync(currentCookies, preBackupPath)
      
      // 记录恢复前的备份
      const preCookieCount = countCookies(currentCookies)
      const preStats = fs.statSync(currentCookies)
      db.prepare(`
        INSERT INTO cookie_backups (profile_id, user_id, backup_type, backup_path, cookie_count, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(profileId, userId, 'auto', preBackupPath, preCookieCount, preStats.size, Date.now())
    }
    
    // 恢复备份文件
    fs.copyFileSync(backup.backup_path, currentCookies)
    
    console.log(`[Cookie API] 恢复成功: Profile ${profileId}, Backup ${backupId}`)
    
    res.json({
      code: 200,
      message: '恢复成功',
      data: {
        restoredBackupId: backupId,
        cookieCount: backup.cookie_count
      }
    })
  } catch (err: any) {
    console.error('[Cookie API] 恢复失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '恢复失败'
    })
  }
})

/**
 * POST /api/v1/profiles/:id/cookies/clear
 * 清理缓存
 */
router.post('/clear', (req: AuthRequest, res: Response) => {
  try {
    const profileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)
    const userId = req.user!.userId
    const { mode } = req.body as { mode: 'all' | 'cookies_only' | 'cache_only' }
    const db = getDatabase()
    
    // 验证窗口归属
    if (!validateProfileOwnership(profileId, userId)) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 检查窗口是否运行中
    if (isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口正在运行中，请先关闭后再清理缓存'
      })
    }
    
    const dataDir = getProfileDataDir(profileId)
    const defaultDir = path.join(dataDir, 'Default')
    const clearedItems: string[] = []
    
    // 清理目标映射
    const clearTargets: Record<string, string[]> = {
      'all': ['Cookies', 'Local Storage', 'Session Storage', 'IndexedDB', 'Cache', 'Code Cache', 'GPUCache'],
      'cookies_only': ['Cookies'],
      'cache_only': ['Cache', 'Code Cache', 'GPUCache']
    }
    
    const targets = clearTargets[mode] || clearTargets['all']
    
    // 执行清理
    for (const target of targets) {
      try {
        let targetPath: string
        switch (target) {
          case 'Cookies':
            targetPath = path.join(defaultDir, 'Cookies')
            break
          case 'Local Storage':
            targetPath = path.join(defaultDir, 'Local Storage')
            break
          case 'Session Storage':
            targetPath = path.join(defaultDir, 'Session Storage')
            break
          case 'IndexedDB':
            targetPath = path.join(defaultDir, 'IndexedDB')
            break
          case 'Cache':
            targetPath = path.join(defaultDir, 'Cache')
            break
          case 'Code Cache':
            targetPath = path.join(defaultDir, 'Code Cache')
            break
          case 'GPUCache':
            targetPath = path.join(defaultDir, 'GPUCache')
            break
          default:
            continue
        }
        
        if (fs.existsSync(targetPath)) {
          if (fs.statSync(targetPath).isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true })
          } else {
            fs.unlinkSync(targetPath)
          }
          clearedItems.push(target)
        }
      } catch (e) {
        console.warn(`[Cookie API] 清理 ${target} 失败:`, e)
      }
    }
    
    console.log(`[Cookie API] 清理完成: Profile ${profileId}, 模式 ${mode}, 已清理: ${clearedItems.join(', ')}`)
    
    res.json({
      code: 200,
      message: '清理完成',
      data: {
        mode,
        clearedItems
      }
    })
  } catch (err: any) {
    console.error('[Cookie API] 清理失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '清理失败'
    })
  }
})

/**
 * GET /api/v1/profiles/:id/cookies/backups
 * 获取备份列表
 */
router.get('/backups', (req: AuthRequest, res: Response) => {
  try {
    // 确保 cookie_backups 表存在（兼容旧数据库）
    ensureCookieBackupsTable()
    
    const profileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)
    const userId = req.user!.userId
    const db = getDatabase()
    
    // 验证窗口归属
    if (!validateProfileOwnership(profileId, userId)) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 查询备份列表
    const backups = db.prepare(`
      SELECT id, profile_id, backup_type, backup_path, cookie_count, size_bytes, created_at
      FROM cookie_backups
      WHERE profile_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `).all(profileId, userId) as any[]
    
    res.json({
      code: 200,
      data: backups.map(b => ({
        id: b.id,
        profileId: b.profile_id,
        backupType: b.backup_type,
        backupPath: b.backup_path,
        cookieCount: b.cookie_count,
        sizeBytes: b.size_bytes,
        createdAt: b.created_at
      })),
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Cookie API] 获取备份列表失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取备份列表失败'
    })
  }
})

/**
 * DELETE /api/v1/profiles/:id/cookies/backups/:backupId
 * 删除备份
 */
router.delete('/backups/:backupId', (req: AuthRequest, res: Response) => {
  try {
    const profileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)
    const backupId = parseInt(Array.isArray(req.params.backupId) ? req.params.backupId[0] : req.params.backupId)
    const userId = req.user!.userId
    const db = getDatabase()
    
    // 验证窗口归属
    if (!validateProfileOwnership(profileId, userId)) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '窗口不存在'
      })
    }
    
    // 查询备份记录
    const backup = db.prepare(
      'SELECT * FROM cookie_backups WHERE id = ? AND profile_id = ? AND user_id = ?'
    ).get(backupId, profileId, userId) as any
    
    if (!backup) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '备份记录不存在'
      })
    }
    
    // 删除物理文件
    if (fs.existsSync(backup.backup_path)) {
      fs.unlinkSync(backup.backup_path)
    }
    
    // 删除数据库记录
    db.prepare('DELETE FROM cookie_backups WHERE id = ?').run(backupId)
    
    console.log(`[Cookie API] 删除备份: Profile ${profileId}, Backup ${backupId}`)
    
    res.json({
      code: 200,
      message: '删除成功'
    })
  } catch (err: any) {
    console.error('[Cookie API] 删除备份失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '删除备份失败'
    })
  }
})

export default router

// 导出 ensureCookieBackupsTable 供其他模块使用（如 profile.ts 的自动备份）
export { ensureCookieBackupsTable }
