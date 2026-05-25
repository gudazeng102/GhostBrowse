/**
 * 从 LLM 输出中暴力提取有效 JSON 对象
 * 来自 yanghao.js LocalAIAgent._extractValidJSON 的重写版
 *
 * 三级提取策略：
 * 1. 找到 "action" 关键字 → 向前找 { → 配对花括号
 * 2. 不指定 keyword 时找第一个完整 JSON 对象
 * 3. 暴力枚举所有 {...} 块尝试解析
 */

export interface ExtractOptions {
  /** 要求 JSON 对象包含的关键字段（默认 'action'） */
  requireKey?: string
  /** 暴力提取的最小 JSON 长度，默认 10 */
  minLength?: number
  /** 暴力提取的最大 JSON 长度，默认 5000 */
  maxLength?: number
}

/**
 * 提取第一个包含指定 key 的 JSON 对象
 * @returns 解析后的对象，失败返回 null
 */
export function extractValidJSON(
  text: string | null | undefined,
  options: ExtractOptions = {}
): any | null {
  if (!text || typeof text !== 'string') return null

  const { requireKey = 'action', minLength = 10, maxLength = 5000 } = options

  // === Strategy 1: 找 requireKey 反向定位 { ===
  const result1 = extractByKey(text, requireKey)
  if (result1) return result1

  // === Strategy 2: 找第一个 { 开始的完整 JSON ===
  const result2 = extractFirstObject(text, requireKey)
  if (result2) return result2

  // === Strategy 3: 暴力正则枚举 ===
  const result3 = extractBruteForce(text, requireKey, minLength, maxLength)
  if (result3) return result3

  return null
}

/** Strategy 1: 通过 key 反向定位 */
function extractByKey(text: string, key: string): any | null {
  const patterns = [`"${key}"`, `'${key}'`]
  let startIdx = -1
  for (const p of patterns) {
    const idx = text.indexOf(p)
    if (idx !== -1 && (startIdx === -1 || idx < startIdx)) {
      startIdx = idx
    }
  }
  if (startIdx === -1) return null

  let braceStart = startIdx
  while (braceStart > 0 && text[braceStart] !== '{') braceStart--
  if (text[braceStart] !== '{') return null

  const jsonStr = matchBraces(text, braceStart)
  if (!jsonStr) return null

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed && typeof parsed === 'object' && key in parsed) return parsed
  } catch {
    // 继续下一策略
  }
  return null
}

/** Strategy 2: 从头扫描第一个 { 开始的完整对象 */
function extractFirstObject(text: string, requireKey: string): any | null {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    const jsonStr = matchBraces(text, i)
    if (!jsonStr) continue
    try {
      const parsed = JSON.parse(jsonStr)
      if (parsed && typeof parsed === 'object' && requireKey in parsed) return parsed
    } catch {
      // 继续
    }
  }
  return null
}

/** Strategy 3: 暴力正则枚举 */
function extractBruteForce(
  text: string,
  requireKey: string,
  minLength: number,
  maxLength: number
): any | null {
  const regex = new RegExp(`\\{[\\s\\S]{${minLength},${maxLength}}?\\}`, 'g')
  const matches = text.match(regex)
  if (!matches) return null

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match)
      if (parsed && typeof parsed === 'object' && requireKey in parsed) return parsed
    } catch {
      // 继续
    }
  }
  return null
}

/**
 * 从指定位置开始配对花括号，返回完整的 JSON 字符串
 * 处理字符串内的转义和括号
 */
function matchBraces(text: string, startIdx: number): string | null {
  if (text[startIdx] !== '{') return null

  let braceCount = 0
  let inString = false
  let escape = false

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{') braceCount++
    else if (ch === '}') {
      braceCount--
      if (braceCount === 0) return text.substring(startIdx, i + 1)
    }
  }
  return null
}