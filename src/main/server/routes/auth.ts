/**
 * 认证路由
 * Phase 1.8+: 用户注册（邮箱+验证码）、登录（邮箱）、忘记密码、重置密码、获取当前用户
 */

import { Router, Request, Response } from 'express'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { getDatabase } from '../db'
import { sendVerificationCode, verifyCode } from '../email'

// 创建路由实例
const router = Router()

// JWT 密钥（与中间件保持一致）
const JWT_SECRET = 'ghostbrowse-jwt-secret-key'

// ==================== 类型定义 ====================

/** 用户记录 */
interface UserRecord {
  id: number
  username: string | null
  email: string
  password_hash: string
  display_name: string | null
  status: string
  reset_token: string | null
  reset_token_expires: number | null
  created_at: number
  updated_at: number
}

/** 登录请求体 */
interface LoginDto {
  email: string
  password: string
}

/** 发送验证码请求体 */
interface SendCodeDto {
  email: string
  purpose: 'register' | 'reset_password'
}

/** 注册请求体 */
interface RegisterDto {
  email: string
  password: string
  confirmPassword: string
  code: string
}

/** 忘记密码请求体 */
interface ForgotPasswordDto {
  email: string
}

/** 重置密码请求体 */
interface ResetPasswordDto {
  token: string
  newPassword: string
  confirmPassword: string
  code: string
}

// ==================== 辅助函数 ====================

/**
 * 生成 JWT Token
 */
function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })
}

/**
 * 返回公开用户信息（不含敏感字段）
 */
function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name || user.email.split('@')[0],
    status: user.status
  }
}

// ==================== API 路由 ====================

/**
 * POST /api/v1/auth/send-code
 * 发送验证码（注册/重置密码）
 */
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const body = req.body as SendCodeDto

    // 1. 参数校验
    if (!body.email?.trim()) {
      return res.status(400).json({ code: 400, message: '邮箱不能为空' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确' })
    }
    if (!body.purpose || !['register', 'reset_password'].includes(body.purpose)) {
      return res.status(400).json({ code: 400, message: '无效的用途' })
    }

    const db = getDatabase()
    const email = body.email.trim().toLowerCase()

    // 2. 注册验证码：检查邮箱是否已注册
    if (body.purpose === 'register') {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (existing) {
        return res.status(409).json({ code: 409, message: '该邮箱已被注册' })
      }
    }

    // 3. 重置密码验证码：检查邮箱是否存在
    if (body.purpose === 'reset_password') {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (!user) {
        return res.status(404).json({ code: 404, message: '该邮箱未注册' })
      }
    }

    // 4. 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // 5. 发送邮件
    try {
      await sendVerificationCode(email, code, body.purpose)
    } catch (err) {
      console.error('[Auth] 发送验证码失败:', err)
      return res.status(500).json({ code: 500, message: '发送验证码失败，请稍后重试' })
    }

    res.json({
      code: 200,
      message: '验证码已发送到邮箱',
      data: { email }
    })
  } catch (err: any) {
    console.error('[Auth] 发送验证码失败:', err)
    res.status(500).json({ code: 500, message: err.message || '发送验证码失败' })
  }
})

/**
 * POST /api/v1/auth/register
 * 用户注册（邮箱 + 验证码）
 */
router.post('/register', (req: Request, res: Response) => {
  try {
    const body = req.body as RegisterDto
    const db = getDatabase()

    // 1. 参数校验
    if (!body.email?.trim()) {
      return res.status(400).json({ code: 400, message: '邮箱不能为空' })
    }
    if (!body.password) {
      return res.status(400).json({ code: 400, message: '密码不能为空' })
    }
    if (!body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '请确认密码' })
    }
    if (!body.code) {
      return res.status(400).json({ code: 400, message: '验证码不能为空' })
    }

    // 2. 邮箱格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确' })
    }

    // 3. 密码一致性校验
    if (body.password !== body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '两次密码不一致' })
    }

    // 4. 密码格式校验
    if (body.password.length < 6 || body.password.length > 32) {
      return res.status(400).json({ code: 400, message: '密码长度 6-32 字符' })
    }

    const email = body.email.trim().toLowerCase()

    // 5. 验证码校验
    if (!verifyCode(email, body.code.trim(), 'register')) {
      return res.status(400).json({ code: 400, message: '验证码无效或已过期' })
    }

    // 6. 去重校验（邮箱）
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      return res.status(409).json({ code: 409, message: '该邮箱已被注册' })
    }

    // 7. 密码哈希
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(body.password, salt)

    // 8. 插入数据库（username 允许为空，使用 email 作为默认值）
    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO users (email, username, password_hash, display_name, status, created_at, updated_at)
      VALUES (@email, @username, @password_hash, @display_name, 'active', @created_at, @updated_at)
    `).run({
      email,
      username: email.split('@')[0],  // 使用 email 前缀作为 username
      password_hash: passwordHash,
      display_name: email.split('@')[0],
      created_at: now,
      updated_at: now
    })

    const userId = Number(result.lastInsertRowid)

    // 9. 生成 Token
    const token = generateToken(userId, email)

    console.log(`[Auth] 用户注册成功: ${email} (ID: ${userId})`)

    res.json({
      code: 200,
      message: '注册成功',
      data: {
        token,
        user: {
          id: userId,
          email,
          display_name: email.split('@')[0]
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
 * 用户登录（邮箱）
 */
router.post('/login', (req: Request, res: Response) => {
  try {
    const body = req.body as LoginDto

    // 1. 参数校验
    if (!body.email?.trim()) {
      return res.status(400).json({ code: 400, message: '邮箱不能为空' })
    }
    if (!body.password) {
      return res.status(400).json({ code: 400, message: '密码不能为空' })
    }

    const db = getDatabase()
    const email = body.email.trim().toLowerCase()

    // 2. 查询用户（按邮箱）
    const user = db.prepare(
      'SELECT * FROM users WHERE email = ? AND status = ?'
    ).get(email, 'active') as UserRecord | undefined

    if (!user) {
      return res.status(401).json({ code: 401, message: '邮箱或密码错误' })
    }

    // 3. 密码验证
    const passwordOk = bcrypt.compareSync(body.password, user.password_hash)
    if (!passwordOk) {
      return res.status(401).json({ code: 401, message: '邮箱或密码错误' })
    }

    // 4. 生成 Token
    const token = generateToken(user.id, user.email)

    console.log(`[Auth] 用户登录成功: ${user.email} (ID: ${user.id})`)

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
 * 忘记密码 - 发送验证码
 * Phase 1.8+: 简化流程，直接发送验证码
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const body = req.body as ForgotPasswordDto

    // 1. 参数校验
    if (!body.email?.trim()) {
      return res.status(400).json({ code: 400, message: '邮箱不能为空' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确' })
    }

    const db = getDatabase()
    const email = body.email.trim().toLowerCase()

    // 2. 查询用户
    const user = db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(email) as UserRecord | undefined

    if (!user) {
      // 为防止邮箱枚举攻击，统一返回成功
      return res.json({
        code: 200,
        message: '如果该邮箱已注册，验证码已发送到邮箱'
      })
    }

    // 3. 生成6位验证码并发送
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    try {
      await sendVerificationCode(email, code, 'reset_password')
    } catch (err) {
      console.error('[Auth] 发送验证码失败:', err)
      return res.status(500).json({ code: 500, message: '发送验证码失败，请稍后重试' })
    }

    // 4. 生成重置令牌并存储（有效期 15 分钟）
    const resetToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    const resetTokenExpires = Date.now() + 15 * 60 * 1000
    db.prepare(`
      UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ?
      WHERE email = ?
    `).run(resetToken, resetTokenExpires, Date.now(), email)

    console.log(`[Auth] 忘记密码验证码已发送: ${email}`)

    res.json({
      code: 200,
      message: '如果该邮箱已注册，验证码已发送到邮箱',
      data: { resetToken }
    })
  } catch (err: any) {
    console.error('[Auth] 忘记密码失败:', err)
    res.status(500).json({ code: 500, message: err.message || '操作失败' })
  }
})

/**
 * POST /api/v1/auth/reset-password
 * 重置密码（邮箱 + 验证码）
 */
router.post('/reset-password', (req: Request, res: Response) => {
  try {
    const body = req.body as ResetPasswordDto
    const db = getDatabase()

    // 1. 参数校验
    if (!body.newPassword) {
      return res.status(400).json({ code: 400, message: '新密码不能为空' })
    }
    if (!body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '请确认密码' })
    }
    if (!body.code) {
      return res.status(400).json({ code: 400, message: '验证码不能为空' })
    }

    // 2. 密码一致性校验
    if (body.newPassword !== body.confirmPassword) {
      return res.status(400).json({ code: 400, message: '两次密码不一致' })
    }

    // 3. 密码格式校验
    if (body.newPassword.length < 6 || body.newPassword.length > 32) {
      return res.status(400).json({ code: 400, message: '密码长度 6-32 字符' })
    }

    // 4. 验证码校验（通过邮箱查找用户）
    // 注意：reset_password 验证码校验需要知道邮箱，这里通过 token 中的信息获取
    console.log(`[ResetPassword] 收到 token: "${body.token.trim()}"`)
    console.log(`[ResetPassword] 当前时间戳: ${Date.now()}`)
    
    // 先检查 token 是否存在于数据库
    const tokenCheck = db.prepare('SELECT id, email, reset_token, reset_token_expires FROM users WHERE reset_token = ?').get(body.token.trim()) as any
    console.log(`[ResetPassword] Token 查询结果:`, tokenCheck)
    
    const user = db.prepare(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?'
    ).get(body.token.trim(), Date.now()) as UserRecord | undefined

    if (!user) {
      // 如果 token 无效，需要通过邮箱+验证码方式重置
      // 这里简化处理：先通过 token 查找用户
      return res.status(400).json({ code: 400, message: '重置令牌无效或已过期' })
    }

    // 5. 验证码校验
    if (!verifyCode(user.email, body.code.trim(), 'reset_password')) {
      return res.status(400).json({ code: 400, message: '验证码无效或已过期' })
    }

    // 6. 密码哈希
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(body.newPassword, salt)

    // 7. 更新用户（清除重置令牌）
    db.prepare(`
      UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, Date.now(), user.id)

    console.log(`[Auth] 密码重置成功: ${user.email}`)

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
    let decoded: { userId: number; email: string }
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string }
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
