/**
 * 检测 LLM 输出是否包含"思考过程"内容
 * 用于过滤评论生成时模型混入的元话语，避免发出"好的我现在分析一下"这种内容
 *
 * 来自 yanghao.js LocalAIAgent._isThinkingContent 的多语言增强版
 */

/** 中文思考语片段 */
const CN_PATTERNS = [
  '好的，我现在', '好的，让我', '好的，我需要',
  '用户希望', '用户想要', '用户要求', '用户的指令',
  '我需要处理', '我需要分析', '我需要理解', '我需要解析', '我需要先',
  '让我分析', '让我先', '让我来',
  '首先，我要', '首先，用户', '首先，我',
  '作为Twitter', '作为AI', '作为助手', '作为一个',
  '接下来我要', '接下来我',
  '现在我要处理', '现在我',
  '根据用户', '根据指令'
]

/** 英文思考语片段 */
const EN_PATTERNS = [
  'Okay, I need to', 'Okay, let me',
  'Alright, I',
  'Let me analyze', 'Let me think', 'Let me first',
  'First, I need to', 'First, the user',
  'The user wants', 'The user is asking', 'The user has',
  "I'll need to", "I'm going to",
  'As an AI', 'As a Twitter',
  'Based on the',
  'To summarize',
  'Step 1:', 'Step 1.',
  '<think>', '</think>'
]

/** 日文思考语片段 */
const JA_PATTERNS = [
  'ユーザーは', 'まず、', 'はい、わかりました', '分析すると'
]

/** 韩文思考语片段 */
const KO_PATTERNS = [
  '사용자가', '먼저,', '분석해보면', '알겠습니다'
]

const ALL_PATTERNS = [...CN_PATTERNS, ...EN_PATTERNS, ...JA_PATTERNS, ...KO_PATTERNS]

export interface ThinkingDetectOptions {
  /** 自定义额外模式（追加到内置之上） */
  extraPatterns?: string[]
  /** 是否区分大小写，默认 false（英文模式不区分） */
  caseSensitive?: boolean
}

/**
 * 检测文本是否包含思考过程
 */
export function isThinkingContent(
  text: string | null | undefined,
  options: ThinkingDetectOptions = {}
): boolean {
  if (!text || typeof text !== 'string') return false

  const { extraPatterns = [], caseSensitive = false } = options
  const haystack = caseSensitive ? text : text.toLowerCase()
  const patterns = [...ALL_PATTERNS, ...extraPatterns]

  for (const p of patterns) {
    const needle = caseSensitive ? p : p.toLowerCase()
    if (haystack.includes(needle)) return true
  }
  return false
}

/**
 * 移除文本中的 <think>...</think> 块
 * 一些模型（如 Qwen3）会用这种标签包裹思考过程
 */
export function stripThinkingBlocks(text: string): string {
  if (!text) return ''
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}