/**
 * 邮件服务
 * Phase 1.8+: 使用 nodemailer 发送验证码邮件
 * Phase 1.8++: 支持开发模式（直接输出验证码到控制台）
 */

import * as nodemailer from 'nodemailer'
import { getDatabase } from './db'

// 是否为开发模式（无 SMTP 配置时）
const isDevMode = !process.env.SMTP_HOST || !process.env.SMTP_PASS

// 邮件发送器（单例）
let transporter: nodemailer.Transporter | null = null

/**
 * 获取邮件发送器
 */
/**
 * 检测系统代理 URL（支持环境变量和 Windows 系统代理）
 */
function getProxyUrl(): string | undefined {
  // 1. 先检查环境变量
  const envProxyVars = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy
  ]
  
  for (const proxy of envProxyVars) {
    if (proxy) {
      console.log('[Email] 检测到环境变量代理:', proxy)
      return proxy
    }
  }
  
  // 2. 检查 Windows 系统代理注册表
  try {
    const { execSync } = require('child_process')
    const result = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf8' }
    )
    const match = result.match(/ProxyServer\s+REG_SZ\s+(.+)/)
    if (match && match[1]) {
      const proxyServer = match[1].trim()
      console.log('[Email] 检测到 Windows 系统代理:', proxyServer)
      return `http://${proxyServer}`
    }
  } catch (e) {
    // 注册表查询失败，忽略
  }
  
  console.log('[Email] 未检测到系统代理')
  return undefined
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT || '465')
    const secure = process.env.SMTP_SECURE === 'true'
    
    const config: any = {
      host: process.env.SMTP_HOST,
      port: port,
      secure: secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    }
    
    // 调试信息
    console.log('[Email] SMTP 配置:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.auth.user,
      hasPass: !!config.auth.pass
    })
    
    transporter = nodemailer.createTransport(config)
  }
  return transporter
}

/**
 * 发送验证码邮件
 * @param email 目标邮箱
 * @param code 验证码
 * @param purpose 用途（register/reset_password）
 */
export async function sendVerificationCode(
  email: string,
  code: string,
  purpose: 'register' | 'reset_password'
): Promise<void> {
  const db = getDatabase()
  const now = Date.now()
  const expiresAt = now + 5 * 60 * 1000 // 5分钟有效期

  // 1. 生成6位验证码
  const verificationCode = code

  // 2. 保存验证码到数据库
  db.prepare(`
    INSERT INTO verification_codes (email, code, purpose, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(email.toLowerCase(), verificationCode, purpose, expiresAt, now)

  // 3. 构建邮件内容
  const subject =
    purpose === 'register'
      ? 'GhostBrowse 注册验证码'
      : 'GhostBrowse 密码重置验证码'

  const htmlContent =
    purpose === 'register'
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #333;">👻 GhostBrowse 注册验证码</h2>
          <p style="color: #666;">您正在注册 GhostBrowse 账号，请在 5 分钟内输入以下验证码：</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #1890ff;">${verificationCode}</span>
          </div>
          <p style="color: #999; font-size: 12px;">此验证码有效期 5 分钟，请勿泄露给他人。</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #333;">👻 GhostBrowse 密码重置验证码</h2>
          <p style="color: #666;">您正在重置 GhostBrowse 账号的密码，请在 5 分钟内输入以下验证码：</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #ff4d4f;">${verificationCode}</span>
          </div>
          <p style="color: #999; font-size: 12px;">此验证码有效期 5 分钟，请勿泄露给他人。如非本人操作，请忽略此邮件。</p>
        </div>
      `

  // 4. 开发模式下直接输出验证码到控制台
  if (isDevMode) {
    console.log('===========================================')
    console.log(`[Email Dev Mode] 验证码已生成（未配置 SMTP）`)
    console.log(`  收件人: ${email}`)
    console.log(`  用途: ${purpose}`)
    console.log(`  验证码: ${verificationCode}`)
    console.log(`  有效期: 5 分钟`)
    console.log('===========================================')
    return
  }

  // 5. 发送邮件（生产模式）
  try {
    await getTransporter().sendMail({
      from: `"GhostBrowse" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject,
      html: htmlContent
    })
    console.log(`[Email] 验证码已发送到: ${email}`)
  } catch (err) {
    console.error(`[Email] 发送验证码失败: ${email}`, err)
    throw err
  }
}

/**
 * 验证验证码
 * @param email 邮箱
 * @param code 验证码
 * @param purpose 用途
 * @returns 验证码有效返回 true，否则返回 false
 */
export function verifyCode(
  email: string,
  code: string,
  purpose: 'register' | 'reset_password'
): boolean {
  const db = getDatabase()
  const now = Date.now()

  // 查询未过期的验证码
  const record = db.prepare(`
    SELECT * FROM verification_codes
    WHERE email = ? AND code = ? AND purpose = ? AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(email.toLowerCase(), code, purpose, now) as any

  if (!record) {
    return false
  }

  // 验证成功后删除验证码
  db.prepare('DELETE FROM verification_codes WHERE id = ?').run(record.id)

  return true
}

/**
 * 清理过期验证码（定时任务）
 */
export function cleanupExpiredCodes(): void {
  const db = getDatabase()
  const now = Date.now()
  db.prepare('DELETE FROM verification_codes WHERE expires_at <= ?').run(now)
}
