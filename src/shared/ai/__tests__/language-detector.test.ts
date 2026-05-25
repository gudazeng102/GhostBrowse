import { describe, it, expect } from 'vitest'
import { detectLanguage, getCommentLengthLimit } from '../language-detector'

describe('detectLanguage', () => {
  it('null/empty → emoji', () => {
    expect(detectLanguage(null).code).toBe('emoji')
    expect(detectLanguage('').code).toBe('emoji')
    expect(detectLanguage(undefined).code).toBe('emoji')
  })

  it('纯 emoji → emoji', () => {
    expect(detectLanguage('🔥❤️😂').code).toBe('emoji')
  })

  it('日文', () => {
    expect(detectLanguage('これは面白いですね').code).toBe('ja')
  })

  it('韩文', () => {
    expect(detectLanguage('안녕하세요 반갑습니다').code).toBe('ko')
  })

  it('俄文', () => {
    expect(detectLanguage('Привет, как дела').code).toBe('ru')
  })

  it('越南文', () => {
    expect(detectLanguage('Xin chào, tôi là người Việt').code).toBe('vi')
  })

  it('中文简体', () => {
    expect(detectLanguage('今天天气真好啊').code).toBe('zh-cn')
  })

  it('中文繁体', () => {
    expect(detectLanguage('這門學問經過多年的發展').code).toBe('zh-trad')
  })

  it('英文', () => {
    expect(detectLanguage('Hello world, this is a test').code).toBe('en')
  })

  it('含 URL / @ / # 不干扰', () => {
    expect(detectLanguage('https://t.co/abc @user #tag 你好啊').code).toBe('zh-cn')
  })

  it('emoji + 文本混合', () => {
    expect(detectLanguage('🔥 this is fire').code).toBe('en')
  })

  it('返回结构完整', () => {
    const info = detectLanguage('hello')
    expect(info).toHaveProperty('code')
    expect(info).toHaveProperty('name')
    expect(info).toHaveProperty('isEmojiOnly')
    expect(info).toHaveProperty('instruction')
    expect(info.isEmojiOnly).toBe(false)
  })
})

describe('getCommentLengthLimit', () => {
  it('中文 25', () => {
    expect(getCommentLengthLimit('zh-cn')).toBe(25)
    expect(getCommentLengthLimit('zh-trad')).toBe(25)
  })

  it('日韩 35', () => {
    expect(getCommentLengthLimit('ja')).toBe(35)
    expect(getCommentLengthLimit('ko')).toBe(35)
  })

  it('俄越 60', () => {
    expect(getCommentLengthLimit('ru')).toBe(60)
    expect(getCommentLengthLimit('vi')).toBe(60)
  })

  it('英文 80', () => {
    expect(getCommentLengthLimit('en')).toBe(80)
  })

  it('未知 80', () => {
    expect(getCommentLengthLimit('xx')).toBe(80)
  })
})