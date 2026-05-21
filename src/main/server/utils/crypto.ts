/**
 * 加密工具模块 - Phase 4.0
 * 使用 AES-256-CBC 对平台账号敏感字段（password、two_fa_secret、two_fa_backup_codes）进行加密存储
 */

import crypto from 'crypto'

// 算法：AES-256-CBC，密钥 32 字节，IV 16 字节
const ALGORITHM = 'aes-256-cbc'

// 密钥：优先从环境变量读取，生产环境务必设置 GB_ENCRYPTION_KEY
// 开发环境使用固定 fallback（长度 32 字节，不足补 '!'）
const KEY_ENV = process.env.GB_ENCRYPTION_KEY
const KEY_FALLBACK = 'GhostBrowseDefaultKey32BytesLong!!'
function deriveKey(raw: string): Buffer {
  const src = Buffer.from(raw, 'utf8')
  if (src.length >= 32) return src.slice(0, 32)
  // 补足 32 字节
  const buf = Buffer.alloc(32)
  src.copy(buf)
  return buf
}
const KEY = KEY_ENV ? deriveKey(KEY_ENV) : deriveKey(KEY_FALLBACK)

const IV_LENGTH = 16

/**
 * 加密字符串
 * @param text 明文
 * @returns 密文，格式：hexIV:hexCiphertext
 */
export function encrypt(text: string): string {
  if (!text) return ''
  try {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    // 返回格式：iv(hex) : ciphertext(hex)
    return iv.toString('hex') + ':' + encrypted
  } catch (e: any) {
    console.error('[Crypto] encrypt 失败:', e.message)
    throw new Error('加密失败')
  }
}

/**
 * 解密字符串
 * @param encryptedText 密文，格式：hexIV:hexCiphertext
 * @returns 明文
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      throw new Error('密文格式错误')
    }
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e: any) {
    console.error('[Crypto] decrypt 失败:', e.message)
    throw new Error('解密失败')
  }
}