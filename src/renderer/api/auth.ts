/**
 * 认证 API 封装
 * Phase 1.8: 用户注册、登录、忘记密码、重置密码、获取当前用户
 */

import request from './request'

/**
 * 用户注册
 */
export function register(data: {
  username: string
  email: string
  password: string
  confirmPassword: string
}) {
  return request.post('/auth/register', data)
}

/**
 * 用户登录
 */
export function login(data: { username: string; password: string }) {
  return request.post('/auth/login', data)
}

/**
 * 忘记密码 - 获取重置令牌
 */
export function forgotPassword(data: { username: string; email: string }) {
  return request.post('/auth/forgot-password', data)
}

/**
 * 重置密码
 */
export function resetPassword(data: {
  token: string
  newPassword: string
  confirmPassword: string
}) {
  return request.post('/auth/reset-password', data)
}

/**
 * 获取当前登录用户
 */
export function getMe() {
  return request.get('/auth/me')
}
