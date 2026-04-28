/**
 * 认证路由
 * Phase 1.8: 用户注册、登录、忘记密码、重置密码、获取当前用户
 */

import { Router, Request, Response } from 'express'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { getDatabase } from '../db'

// 创建路由实例
const router = Router()

// JWT 密钥（与中间件保持一致）
const JWT_SECRET = 'ghostbrowse-jwt-secret-key'

// ==================== 类型定义 ====================

/** 用户记录 */
interface UserRecord {
  id: number
  username: string
  email: string
  password_hash: string
  display_name: string | null
  status: string
  reset_token: string | null
  reset_token_expires: number | null
  created_at: number
  updated_at: number
}

/** 注册请求体 */
interface RegisterDto {
  username: string
  email: string
  password: string
  confirmPassword: string
}

/** 登录请求体 */
interface LoginDto {
  username: string
  password: string
}

/** 忘记密码请求体 */
interface ForgotPasswordDto {
  username: string
  email: string
}

/** 重置密码请求体 */
interface ResetPasswordDto {
  token: string
  newPassword: string
  confirmPassword: string
}

// ==================== 辅助函数 ====================

/**
 * 生成 JWT Token
 */
function generateToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' })
}

/**
 * 返回公开用户信息（不含敏感字段）
 */
function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name || user.username,
    status: user.status
  }
}

// ==================== API 路由 ====================

/**
 * POST /api/v1/auth/register
 * 用户注册
 */
router.post('/register', (req: Request, res: Response) => {
  try {
    const body = req.body as RegisterDto
    const db = getDatabase()

    // 1. 参数校验
    if (!body.username?.trim()) {
      return res.status(400).json({ code: 400, message: '用户名不能为空' })
    }
    if (!body.email?.trim()) {
      return res.status(400).json({ code: 400, message: '邮箱不能为空' })
    }
    if (!body.password) {
      return res.status(400).json({ code: 400, message: '密码不能为空' })
    }
    if (!body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '请确认密码' })
    }

    // 2. 密码一致性校验
    if (body.password !== body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '两次密码不一致' })
    }

    // 3. 格式校验
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(body.username)) {
      return res.status(400).json({
        code: 400,
        message: '用户名长度 3-20 字符，只允许字母、数字、下划线'
      })
    }
    if (body.password.length < 6 || body.password.length > 32) {
      return res.status(400).json({ code: 400, message: '密码长度 6-32 字符' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确' })
    }

    // 4. 去重校验
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ? OR email = ?'
    ).get(body.username.trim(), body.email.trim().toLowerCase())
    if (existing) {
      return res.status(409).json({ code: 409, message: '用户名或邮箱已被注册' })
    }

    // 5. 密码哈希
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(body.password, salt)

    // 6. 插入数据库
    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, status, created_at, updated_at)
      VALUES (@username, @email, @password_hash, @display_name, 'active', @created_at, @updated_at)
    `).run({
      username: body.username.trim(),
      email: body.email.trim().toLowerCase(),
      password_hash: passwordHash,
      display_name: body.username.trim(),
      created_at: now,
      updated_at: now
    })

    const userId = Number(result.lastInsertRowid)

    // 7. 生成 Token
    const token = generateToken(userId, body.username.trim())

    console.log(`[Auth] 用户注册成功: ${body.username} (ID: ${userId})`)

    res.json({
      code: 200,
      message: '注册成功',
      data: {
        token,
        user: {
          id: userId,
          username: body.username.trim(),
          email: body.email.trim().toLowerCase(),
          display_name: body.username.trim()
        }
      }
    })
  } catch (err: any) {
    console.error('[Auth] 注册失败:', err)
    res.status(500).json({ code: 500, message: err.message || '注册失败' })
  }
})

/**
 * POST /api/v1/auth/login
 * 用户登录
 */
router.post('/login', (req: Request, res: Response) => {
  try {
    const body = req.body as LoginDto
    const db = getDatabase()

    // 1. 参数校验
    if (!body.username?.trim()) {
      return res.status(400).json({ code: 400, message: '用户名不能为空' })
    }
    if (!body.password) {
      return res.status(400).json({ code: 400, message: '密码不能为空' })
    }

    // 2. 查询用户
    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? AND status = ?'
    ).get(body.username.trim(), 'active') as UserRecord | undefined

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }

    // 3. 密码验证
    const passwordOk = bcrypt.compareSync(body.password, user.password_hash)
    if (!passwordOk) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }

    // 4. 生成 Token
    const token = generateToken(user.id, user.username)

    console.log(`[Auth] 用户登录成功: ${user.username} (ID: ${user.id})`)

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: publicUser(user)
      }
    })
  } catch (err: any) {
    console.error('[Auth] 登录失败:', err)
    res.status(500).json({ code: 500, message: err.message || '登录失败' })
  }
})

/**
 * POST /api/v1/auth/forgot-password
 * 忘记密码 - 生成重置令牌
 */
router.post('/forgot-password', (req: Request, res: Response) => {
  try {
    const body = req.body as ForgotPasswordDto
    const db = getDatabase()

    // 1. 参数校验
    if (!body.username?.trim()) {
      return res.status(400).json({ code: 400, message: '用户名不能为空' })
    }
    if (!body.email?.trim()) {
      return res.status(400).json({ code: 400, message: '邮箱不能为空' })
    }

    // 2. 查询用户
    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? AND email = ?'
    ).get(body.username.trim(), body.email.trim().toLowerCase()) as UserRecord | undefined

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在或信息不匹配' })
    }

    // 3. 生成重置令牌（16位随机字符串）
    const resetToken =
      Math.random().toString(36).substring(2) +
      Math.random().toString(36).substring(2)
    const expiresAt = Date.now() + 3600000 // 1小时

    // 4. 更新用户记录
    db.prepare(`
      UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ?
      WHERE id = ?
    `).run(resetToken, expiresAt, Date.now(), user.id)

    console.log(`[Auth] 生成重置令牌: ${user.username}`)

    res.json({
      code: 200,
      message: '重置令牌已生成，有效期1小时，请妥善保存',
      data: {
        resetToken,
        expiresAt
      }
    })
  } catch (err: any) {
    console.error('[Auth] 忘记密码失败:', err)
    res.status(500).json({ code: 500, message: err.message || '操作失败' })
  }
})

/**
 * POST /api/v1/auth/reset-password
 * 重置密码
 */
router.post('/reset-password', (req: Request, res: Response) => {
  try {
    const body = req.body as ResetPasswordDto
    const db = getDatabase()

    // 1. 参数校验
    if (!body.token?.trim()) {
      return res.status(400).json({ code: 400, message: '重置令牌不能为空' })
    }
    if (!body.newPassword) {
      return res.status(400).json({ code: 400, message: '新密码不能为空' })
    }
    if (!body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '请确认密码' })
    }

    // 2. 密码一致性校验
    if (body.newPassword !== body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '两次密码不一致' })
    }

    // 3. 格式校验
    if (body.newPassword.length < 6 || body.newPassword.length > 32) {
      return res.status(400).json({ code: 400, message: '密码长度 6-32 字符' })
    }

    // 4. 令牌校验
    const user = db.prepare(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?'
    ).get(body.token.trim(), Date.now()) as UserRecord | undefined

    if (!user) {
      return res.status(400).json({ code: 400, message: '重置令牌无效或已过期' })
    }

    // 5. 密码哈希
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(body.newPassword, salt)

    // 6. 更新用户（清除重置令牌）
    db.prepare(`
      UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, Date.now(), user.id)

    console.log(`[Auth] 密码重置成功: ${user.username}`)

    res.json({
      code: 200,
      message: '密码重置成功，请使用新密码登录'
    })
  } catch (err: any) {
    console.error('[Auth] 重置密码失败:', err)
    res.status(500).json({ code: 500, message: err.message || '重置密码失败' })
  }
})

/**
 * GET /api/v1/auth/me
 * 获取当前登录用户（需携带 Token）
 */
router.get('/me', (req: Request, res: Response) => {
  try {
    // 1. 从请求头提取 Token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未授权，请先登录' })
    }
    const token = authHeader.substring(7)

    // 2. 验证 Token
    let decoded: { userId: number; username: string }
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string }
    } catch {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
    }

    // 3. 查询用户
    const db = getDatabase()
    const user = db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).get(decoded.userId) as UserRecord | undefined

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' })
    }

    res.json({
      code: 200,
      data: publicUser(user)
    })
  } catch (err: any) {
    console.error('[Auth] 获取用户信息失败:', err)
    res.status(500).json({ code: 500, message: err.message || '获取用户信息失败' })
  }
})

export default router
