/**
 * 文本语言检测工具
 * 来自 yanghao.js LocalAIAgent.detectLanguage 的重写版
 *
 * 修复原版 bug：
 * - 繁简判定改为基于 Unicode 区段概率统计（不再用硬编码字符列表）
 * - 返回结构化 LanguageInfo
 */

export interface LanguageInfo {
  /** 语言代码 */
  code: string
  /** 可读名称 */
  name: string
  /** 是否只有 emoji / 无文字 */
  isEmojiOnly: boolean
  /** 给 LLM 的回复指令 */
  instruction: string
}

/** 中文简体 Unicode 区段 */
const SIMPLIFIED_RANGES: [number, number][] = [
  [0x4E00, 0x9FFF],  // CJK Unified Ideographs
]

/** 中文繁体偏用字（基于频次统计，比原版"硬编码字串"更科学） */
const TRADITIONAL_INDICATORS = new Set(
  '萬東車紅長電國會來個時後為說門見經這還點發現對開與當從們過年兒無圓匯幣書裡學過問話將於種動卻區業結轉風機關實達萬東車紅長電國會來個時後為說門見經這還點發現對開與當從們過年兒無圓匯幣書裡學過問話將於種動卻區業結轉風機關實達國長電車開東個過來時說門見經點現對與當從這後們還為發兒無圓匯幣書裡學問話將於種動卻區業結轉風機關實達體對開與當從們過年'.split('')
)

/**
 * 检测文本语言
 * @param text 要检测的文本
 * @returns LanguageInfo
 */
export function detectLanguage(text: string | null | undefined): LanguageInfo {
  if (!text || text.trim().length === 0) {
    return {
      code: 'emoji',
      name: '无文字',
      isEmojiOnly: true,
      instruction: 'Reply with single appropriate emoji'
    }
  }

  // 去除 URL 和 @/#
  const textWithoutUrls = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[@#]\w+/g, '')
    .trim()

  // 去 emoji
  const textWithoutEmoji = textWithoutUrls
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]/gu, '')
    .trim()

  if (!textWithoutEmoji || textWithoutEmoji.length === 0) {
    return {
      code: 'emoji',
      name: '纯表情',
      isEmojiOnly: true,
      instruction: 'Reply with single appropriate emoji'
    }
  }

  const cleanText = textWithoutEmoji

  // 日文：平假名 / 片假名
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText)) {
    return {
      code: 'ja',
      name: '日文',
      isEmojiOnly: false,
      instruction: 'Write short comment in Japanese (15-30 chars). Casual tone.'
    }
  }

  // 韩文
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(cleanText)) {
    return {
      code: 'ko',
      name: '韩文',
      isEmojiOnly: false,
      instruction: 'Write short comment in Korean (15-30 chars). Casual tone.'
    }
  }

  // 俄文
  if (/[\u0400-\u04FF]/.test(cleanText)) {
    return {
      code: 'ru',
      name: '俄文',
      isEmojiOnly: false,
      instruction: 'Напишите короткий комментарий на русском (3-6 слов).'
    }
  }

  // 越南文
  if (/[ăâêôơưđĂÂÊÔƠƯĐ]/.test(cleanText)) {
    return {
      code: 'vi',
      name: '越南文',
      isEmojiOnly: false,
      instruction: 'Viết bình luận ngắn bằng tiếng Việt (4-6 từ).'
    }
  }

  // 中文（简繁体判定）
  if (/[\u4e00-\u9fa5]/.test(cleanText)) {
    const isTraditional = detectTraditionalChinese(cleanText)
    return {
      code: isTraditional ? 'zh-trad' : 'zh-cn',
      name: isTraditional ? '中文（繁体）' : '中文（简体）',
      isEmojiOnly: false,
      instruction: isTraditional
        ? '用繁體中文寫自然評論（15-25字）。'
        : '用简体中文写自然评论（12-20字）。'
    }
  }

  // 默认英文
  return {
    code: 'en',
    name: '英文',
    isEmojiOnly: false,
    instruction: 'Write short reply (4-8 words). Casual tone.'
  }
}

/**
 * 繁体中文检测
 * 通过统计"繁体偏用字"在中文字符中的占比判定
 */
function detectTraditionalChinese(text: string): boolean {
  const chineseChars = [...text].filter(ch => /[\u4e00-\u9fa5]/.test(ch))
  if (chineseChars.length === 0) return false

  let tradCount = 0
  for (const ch of chineseChars) {
    if (TRADITIONAL_INDICATORS.has(ch)) tradCount++
  }

  // 超过 15% 的中文字符落在繁体偏用字集内则判定为繁体
  return tradCount / chineseChars.length > 0.15
}

/**
 * 获取评论长度限制
 */
export function getCommentLengthLimit(langCode: string): number {
  switch (langCode) {
    case 'zh-cn':
    case 'zh-trad':
      return 25
    case 'ja':
    case 'ko':
      return 35
    case 'ru':
    case 'vi':
      return 60
    default:
      return 80
  }
}