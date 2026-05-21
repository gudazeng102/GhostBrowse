/**
 * 平台账号路由 - Phase 4.0
 * 职责：Twitter/X 等平台账号的 CRUD（查询/创建/更新/删除）
 * 所有接口受 authMiddleware 保护，按 user_id 数据隔离
 */

import { Router, Request, Response } from 'express'
import { getDatabase } from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { encrypt, decrypt } from '../utils/crypto'

const router = Router()

// 所有路由需要认证
router.use(authMiddleware)

// ==================== 辅助函数 ====================

interface PlatformAccount {
  id: number
  profile_id: number
  user_id: number
  platform: string
  account: string
  password: string      // 加密存储
  username_confirm: string | null  // 账号名确认（@开头的 Twitter 用户名，明文存储）
  two_fa_type: string | null
  two_fa_secret: string | null  // 加密存储
  two_fa_backup_codes: string | null  // JSON 数组，加密存储
  is_active: number
  created_at: number
  updated_at: number
}

/** 加密敏感字段（仅存储加密后的密文） */
function encryptAccountFields(data: any) {
  const d = { ...data }
  if (d.password) d.password = encrypt(d.password)
  if (d.two_fa_secret) d.two_fa_secret = encrypt(d.two_fa_secret)
  if (d.two_fa_backup_codes) {
    // two_fa_backup_codes 为 string 类型（textarea 输入），转换为 JSON 数组后加密
    const codes = d.two_fa_backup_codes.split('\n').map((s: string) => s.trim()).filter((s: string) => s)
    d.two_fa_backup_codes = encrypt(JSON.stringify(codes))
  } else {
    d.two_fa_backup_codes = null
  }
  return d
}

/**
 * 解密敏感字段并返回明文
 * 注意：GhostBrowse 是本地单机工具，加密目的是防数据库被盗读，
 * 已登录的当前用户在本地编辑界面回显明文是合理且必要的（否则无法编辑）。
 * API 仅暴露在 127.0.0.1，且受 authMiddleware 保护，可接受。
 */
function sanitizeAccount(row: any) {
  // 安全解密：失败则返回空字符串，不抛错
  const safeDecrypt = (cipher: string | null | undefined): string => {
    if (!cipher) return ''
    try { return decrypt(cipher) } catch { return '' }
  }

  return {
    id: row.id,
    profile_id: row.profile_id,
    platform: row.platform,
    account: row.account,
    // 返回明文密码（供前端编辑回显）
    password: safeDecrypt(row.password),
    username_confirm: row.username_confirm || null,
    two_fa_type: row.two_fa_type || null,
    // 返回明文 TOTP 密钥（供前端编辑回显）
    two_fa_secret: safeDecrypt(row.two_fa_secret),
    // 备用码解密后返回（允许用户查看）
    two_fa_backup_codes: row.two_fa_backup_codes
      ? (() => {
          try { return JSON.parse(decrypt(row.two_fa_backup_codes)) } catch { return null }
        })()
      : null,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

/** 获取 account 的解密版本（仅供内部使用，如 content-script.js 通过独立接口） */
export function getDecryptedAccount(accountId: number, userId: number): any | null {
  try {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT * FROM platform_accounts WHERE id = ? AND user_id = ?'
    ).get(accountId, userId) as PlatformAccount | undefined

    if (!row) return null
    return {
      ...row,
      password: decrypt(row.password || ''),
      two_fa_secret: decrypt(row.two_fa_secret || ''),
      two_fa_backup_codes: row.two_fa_backup_codes ? JSON.parse(decrypt(row.two_fa_backup_codes)) : null
    }
  } catch {
    return null
  }
}

// ==================== 路由 ====================

/**
 * GET /api/platform-accounts?profile_id=123
 * 查询指定 Profile 的平台账号列表（仅返回基本信息，不含明文密码）
 */
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { profile_id } = req.query

    const db = getDatabase()
    let rows: PlatformAccount[]

    if (profile_id) {
      // 按 profile_id + user_id 双重过滤
      rows = db.prepare(`
        SELECT * FROM platform_accounts
        WHERE profile_id = ? AND user_id = ?
        ORDER BY id DESC
      `).all(Number(profile_id), userId) as PlatformAccount[]
    } else {
      // 返回当前用户所有账号
      rows = db.prepare(`
        SELECT * FROM platform_accounts WHERE user_id = ? ORDER BY id DESC
      `).all(userId) as PlatformAccount[]
    }

    const data = rows.map(sanitizeAccount)

    res.json({ code: 0, data, message: 'success' })
  } catch (err: any) {
    console.error('[PlatformAccount] 查询失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '查询失败' })
  }
})

/**
 * POST /api/platform-accounts
 * 创建平台账号（密码/TOTP 密钥加密存储）
 */
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const body = req.body as any
    const db = getDatabase()

    // 参数校验
    if (!body.profile_id || !body.account || !body.password) {
      return res.status(400).json({ code: 400, data: null, message: 'profile_id、account、password 必填' })
    }

    // 验证 profile 归属
    const profile = db.prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?').get(body.profile_id, userId)
    if (!profile) {
      return res.status(404).json({ code: 404, data: null, message: '窗口不存在或无权访问' })
    }

    const now = Date.now()
    const data = encryptAccountFields({
      profile_id: body.profile_id,
      user_id: userId,
      platform: body.platform || 'twitter',
      account: body.account,
      password: body.password,
      username_confirm: body.username_confirm ? String(body.username_confirm).trim() : null,
      two_fa_type: body.two_fa_type || null,
      two_fa_secret: body.two_fa_type === 'totp' ? body.two_fa_secret : null,
      two_fa_backup_codes: body.two_fa_type === 'sms' ? body.two_fa_backup_codes : null,
      is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1,
      created_at: now,
      updated_at: now
    })

    const result = db.prepare(`
      INSERT INTO platform_accounts
        (profile_id, user_id, platform, account, password, username_confirm, two_fa_type, two_fa_secret, two_fa_backup_codes, is_active, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.profile_id, data.user_id, data.platform, data.account, data.password,
      data.username_confirm,
      data.two_fa_type, data.two_fa_secret, data.two_fa_backup_codes,
      data.is_active, data.created_at, data.updated_at
    )

    const newRow = db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(result.lastInsertRowid) as PlatformAccount

    res.json({
      code: 0,
      data: sanitizeAccount(newRow),
      message: '创建成功'
    })
  } catch (err: any) {
    console.error('[PlatformAccount] 创建失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '创建失败' })
  }
})

/**
 * PUT /api/platform-accounts/:id
 * 更新平台账号（仅更新传入的字段）
 */
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const body = req.body as any
    const db = getDatabase()

    // 验证归属
    const existing = db.prepare('SELECT * FROM platform_accounts WHERE id = ? AND user_id = ?').get(Number(id), userId) as PlatformAccount | undefined
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: '账号不存在或无权访问' })
    }

    // 仅更新传入的字段
    const fields: string[] = []
    const values: any[] = []

    if (body.account !== undefined) { fields.push('account = ?'); values.push(body.account) }
    if (body.password !== undefined) { fields.push('password = ?'); values.push(encrypt(body.password)) }
    if (body.username_confirm !== undefined) {
      fields.push('username_confirm = ?')
      values.push(body.username_confirm ? String(body.username_confirm).trim() : null)
    }
    if (body.two_fa_type !== undefined) { fields.push('two_fa_type = ?'); values.push(body.two_fa_type || null) }
    if (body.two_fa_secret !== undefined) {
      fields.push('two_fa_secret = ?')
      values.push(body.two_fa_type === 'totp' && body.two_fa_secret ? encrypt(body.two_fa_secret) : null)
    }
    if (body.two_fa_backup_codes !== undefined) {
      fields.push('two_fa_backup_codes = ?')
      if (body.two_fa_type === 'sms' && body.two_fa_backup_codes) {
        const codes = body.two_fa_backup_codes.split('\n').map((s: string) => s.trim()).filter((s: string) => s)
        values.push(encrypt(JSON.stringify(codes)))
      } else {
        values.push(null)
      }
    }
    if (body.is_active !== undefined) { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0) }

    if (fields.length === 0) {
      return res.status(400).json({ code: 400, data: null, message: '无更新字段' })
    }

    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(Number(id), userId)

    db.prepare(`UPDATE platform_accounts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)

    const updated = db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(Number(id)) as PlatformAccount

    res.json({ code: 0, data: sanitizeAccount(updated), message: '更新成功' })
  } catch (err: any) {
    console.error('[PlatformAccount] 更新失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '更新失败' })
  }
})

/**
 * DELETE /api/platform-accounts/:id
 * 删除平台账号
 */
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const { id } = req.params
    const db = getDatabase()

    const existing = db.prepare('SELECT id FROM platform_accounts WHERE id = ? AND user_id = ?').get(Number(id), userId)
    if (!existing) {
      return res.status(404).json({ code: 404, data: null, message: '账号不存在或无权访问' })
    }

    db.prepare('DELETE FROM platform_accounts WHERE id = ? AND user_id = ?').run(Number(id), userId)

    res.json({ code: 0, data: { deleted: true }, message: '删除成功' })
  } catch (err: any) {
    console.error('[PlatformAccount] 删除失败:', err)
    res.status(500).json({ code: 500, data: null, message: err.message || '删除失败' })
  }
})

export default router