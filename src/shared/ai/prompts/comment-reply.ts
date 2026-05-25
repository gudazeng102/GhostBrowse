/**
 * 评论生成 Prompt 构造
 */

import { LanguageInfo } from '../language-detector'

/**
 * 构造评论生成 Prompt
 * @param tweetText 原推文文本
 * @param lang 语言信息
 * @param maxTextLength 截断的原文长度，默认 400
 */
export function buildCommentPrompt(
  tweetText: string,
  lang: LanguageInfo,
  maxTextLength: number = 400
): string {
  const text = tweetText.substring(0, maxTextLength)
  return `Reply to this ${lang.name} tweet:
"${text}"
${lang.instruction}
CRITICAL: Reply ONLY in ${lang.name}, NO JSON, NO quotes, NO explanations. Just the comment text:`
}

/** 当推文为纯媒体/纯 emoji 时的随机回复 emoji 池 */
export const FALLBACK_EMOJIS = [
  '👍', '❤️', '🔥', '😂', '😍', '👏', '🙏', '💯',
  '✨', '🎉', '🤔', '👀', '💪', '🤩', '🥰'
]

/**
 * 从 emoji 池中随机选一个
 */
export function pickRandomEmoji(rng?: () => number): string {
  const random = rng ? rng() : Math.random()
  return FALLBACK_EMOJIS[Math.floor(random * FALLBACK_EMOJIS.length)]
}