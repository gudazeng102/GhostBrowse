/**
 * 认证中间件
 * Phase 1.8: JWT Token 验证中间件
 * 用途：保护需要登录的 API（如后续扩展的用户设置接口）
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// JWT 密钥（与 auth.ts 保持一致）
const JWT_SECRET = 'ghostbrowse-jwt-secret-key'

/**
 * 扩展 Request 接口，附加 user 信息
 */
export interface AuthRequest extends Request {
  user?: { userId: number; username: string }
}

/**
 * 认证中间件
 * - 验证请求头中的 Bearer Token
 * - 验证通过则在 req.user 中附加用户信息
 * - 验证失败返回 401
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未授权，请先登录' })
  }
  
  try {
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string }
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' })
  }
}
