/**
 * 认证 API 封装
 * Phase 1.8+: 邮箱注册+验证码、邮箱登录
 */

import request from './request'

/**
 * 发送验证码
 */
export function sendCode(data: { email: string; purpose: 'register' | 'reset_password' }) {
  return request.post('/auth/send-code', data)
}

/**
 * 用户注册（邮箱 + 验证码）
 */
export function register(data: {
  email: string
  password: string
  confirmPassword: string
  code: string
}) {
  return request.post('/auth/register', data)
}

/**
 * 用户登录（邮箱）
 */
export function login(data: { email: string; password: string }) {
  return request.post('/auth/login', data)
}

/**
 * 忘记密码 - 发送验证码
 */
export function forgotPassword(data: { email: string }) {
  return request.post('/auth/forgot-password', data)
}

/**
 * 重置密码
 */
export function resetPassword(data: {
  token: string
  newPassword: string
  confirmPassword: string
  code: string
}) {
  return request.post('/auth/reset-password', data)
}

/**
 * 获取当前登录用户
 */
export function getMe() {
  return request.get('/auth/me')
}
