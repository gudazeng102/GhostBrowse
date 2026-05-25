/**
 * Twitter 评论清洗器
 * 来自 yanghao.js LocalAIAgent.generateComment 中的清洗逻辑
 *
 * 修复原版 bug：
 * - 多语言前缀去除（不止 Reply/Comment/回复/评论）
 * - 思考内容检测分离到 thinking-filter
 * - 长度按语言裁剪
 */

import { LanguageInfo, getCommentLengthLimit } from '../../ai/language-detector'
import { isThinkingContent, stripThinkingBlocks } from '../../ai/thinking-filter'
import { pickRandomEmoji } from '../../ai/prompts/comment-reply'

/** 多语言"评论"前缀模式 */
const COMMENT_PREFIX_PATTERNS = [
  /^(Reply|Comment|Response|Answer)[：:]\s*/i,
  /^(回复|评论|回應|回應)[：:]\s*/,
  /^(返事|コメント)[：:]\s*/,
  /^(답글|댓글)[：:]\s*/
]

export interface CleanCommentResult {
  /** 清洗后的最终评论 */
  comment: string
  /** 是否被检测为含思考内容（脏数据） */
  rejected: boolean
  /** 拒绝原因 */
  rejectReason?: string
}

/**
 * 清洗 AI 生成的评论
 * @param raw AI 原始输出
 * @param lang 语言信息
 */
export function cleanTwitterComment(raw: string, lang: LanguageInfo): CleanCommentResult {
  if (!raw) {
    return { comment: pickRandomEmoji(), rejected: false }
  }

  let comment = raw.trim()

  // 1. 去除 <think> 块（Qwen3 等）
  comment = stripThinkingBlocks(comment)

  // 2. 如果整体被 JSON 包裹（{"comment":"xxx"}），尝试解析
  if (comment.startsWith('{') && comment.includes('comment')) {
    try {
      const parsed = JSON.parse(comment)
      if (parsed && typeof parsed.comment === 'string') {
        comment = parsed.comment.trim()
      }
    } catch {
      // 不是合法 JSON，继续按文本处理
    }
  }

  // 3. 去前缀（Reply: / 回复： 等）
  for (const re of COMMENT_PREFIX_PATTERNS) {
    comment = comment.replace(re, '')
  }

  // 4. 去首尾引号
  comment = comment.replace(/^["'「『《]+|["'」』》]+$/g, '')

  // 5. 换行变空格
  comment = comment.replace(/\s*\n+\s*/g, ' ').trim()

  // 6. 思考内容检测（拒绝）
  if (isThinkingContent(comment)) {
    return {
      comment: '',
      rejected: true,
      rejectReason: '检测到思考内容，已拒绝'
    }
  }

  // 7. 按语言长度裁剪
  const limit = getCommentLengthLimit(lang.code)
  if (comment.length > limit) {
    comment = comment.substring(0, limit)
  }

  // 8. 兜底：空内容用 emoji
  if (!comment || comment.length < 1) {
    comment = pickRandomEmoji()
  }

  return { comment, rejected: false }
}