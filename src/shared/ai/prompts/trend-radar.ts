/**
 * Trend Radar Prompt 模板
 *
 * 构建给 DeepSeek 的热点分析 Prompt，要求严格 JSON 输出。
 * 与 twitter-command.ts 同级，互不干扰。
 */

export interface TrendRadarInput {
  /** 话题标签（不含 #） */
  topic: string
  /** 采集条数 */
  count: number
  /** 作者列表（强制 AI 只能从中选择） */
  authorList: string
  /** 原始推文数据（JSON 字符串数组） */
  rawDataJson: string
  /** 用户补充指令 */
  userInstruction: string
  /** 账号定位描述 */
  accountPersona: string
}

/**
 * 构建热点分析 Prompt
 * 遵循需求文档 5.2 节模板设计
 */
export function buildTrendRadarPrompt(input: TrendRadarInput): string {
  return `你是一位 Twitter/X 热点运营专家，擅长跨境社媒内容策略与风险识别。

## 任务
基于以下采集数据，分析当前热点并制定借势策略。

## 输入数据
1. 话题标签：${input.topic}
2. 采集条数：${input.count} 条
3. 采集数据中出现的作者列表（仅限以下账号，你必须从中选择）：
${input.authorList}
4. 原始推文数据（摘要）：
${input.rawDataJson}
5. 用户补充指令：${input.userInstruction}
6. 当前账号定位：${input.accountPersona}

## 分析要求
1. 提取当前最值得关注的 3 个子话题（Hotspots）
2. 对每个子话题评估：
   - 风险等级（risk）：low / medium / high
   - 风险类型（risk_type）：political / racial / brand_negative / none
   - 匹配度（match_score）：0-100（与账号定位的相关性）
   - 热度生命周期（lifecycle）：rising / peak / cooling
3. 选择 match_score 最高的 1 个话题，制定策略：
   - 目标账号（target_account）：**必须从上方的作者列表中严格选择一个，禁止编造。作者列表之外的账号一律禁止。如果作者列表中无合适的互动目标，请填空字符串 ""**
   - 执行方式（action）：comment / retweet / original
   - 语言（language）：根据热点所在语言圈自动判断（ja/en/zh/vi/ko/ru...）
   - 推荐理由（reason）：50 字以内
4. 生成 3 条借势文案（contents），要求：
   - 自然融入热点，不生硬打广告
   - 符合目标语言圈的表达习惯
   - 适配 Twitter 280 字符限制（日语/中文等双字节语言适当放宽）

## 输出格式（严格 JSON，不要 Markdown 代码块，不要 \`\`\` 包裹）
{
  "hotspots": [
    {
      "topic": "子话题描述",
      "risk": "low",
      "risk_type": "none",
      "match_score": 95,
      "lifecycle": "rising"
    }
  ],
  "selected_strategy": {
    "target_account": "@username",
    "action": "comment",
    "language": "en",
    "reason": "该话题处于上升期，且与账号定位高度匹配"
  },
  "contents": [
    "文案 1",
    "文案 2",
    "文案 3"
  ]
}`
}

/**
 * 压缩原始推文数据为摘要格式，减少 token 消耗
 * 每条保留：作者、前 200 字、@提及、互动量
 */
export function summarizeRawTweets(rawData: any[]): string {
  const summarized = rawData.slice(0, 50).map((item, idx) => {
    let data: any = {}
    try {
      data = typeof item.raw_data === 'string' ? JSON.parse(item.raw_data) : (item.raw_data || item)
    } catch {
      data = item
    }

    const text = (data.text || data.fullText || '').substring(0, 200)
    const authorName = data.authorName || 'unknown'
    const authorHandle = data.authorHandle || data.userName || ''
    const likes = data.likes || data.favoriteCount || 0
    const retweets = data.retweets || data.retweetCount || 0
    const replies = data.replies || data.replyCount || 0
    const time = (data.time || data.createdAt || '').substring(0, 10)

    const handlePart = authorHandle ? ` @${authorHandle}` : ''
    return `[${idx + 1}] ${authorName}${handlePart}: "${text}" | 👍${likes} 🔁${retweets} 💬${replies} 📅${time}`
  })

  return summarized.join('\n')
}

export interface UserInfo {
  displayName: string
  handle: string
}

/**
 * 从采集数据中提取所有出现的用户信息（显示名 + handle）
 * 用于后端校验和查找目标账号的完整信息
 */
export function extractUserInfoMap(rawData: any[]): Map<string, UserInfo> {
  const map = new Map<string, UserInfo>()

  for (const item of rawData) {
    let data: any = {}
    try {
      data = typeof item.raw_data === 'string' ? JSON.parse(item.raw_data) : (item.raw_data || item)
    } catch {
      data = item
    }

    // 优先从 url 提取真实 handle（稳定可靠），fallback 到 authorHandle
    // url 格式: https://x.com/SoujiOniwa/status/xxx
    let handle = ''
    if (data.url) {
      const parts = data.url.replace('https://x.com/', '').replace('https://twitter.com/', '').split('/')
      handle = (parts[0] || '').toLowerCase()
    }
    if (!handle) {
      handle = (data.authorHandle || data.userName || '').toLowerCase().replace(/^@/, '')
    }
    const displayName = data.authorName || ''

    if (handle && !map.has(handle)) {
      map.set(handle, { displayName, handle })
    }
  }

  return map
}

/**
 * 从采集数据中提取所有出现的用户 handle（作者 + @提及）
 * 用于后端校验 AI 返回的 target_account 是否合法
 */
export function extractMentionedHandles(rawData: any[]): Set<string> {
  const handles = new Set<string>()

  for (const item of rawData) {
    let data: any = {}
    try {
      data = typeof item.raw_data === 'string' ? JSON.parse(item.raw_data) : (item.raw_data || item)
    } catch {
      data = item
    }

    // 作者
    const author = data.authorHandle || data.authorName || data.userName || ''
    if (author) handles.add(author.toLowerCase().replace(/^@/, ''))

    // 文本中的 @ 提及
    const text = data.text || data.fullText || ''
    const mentions = text.match(/@\w+/g) || []
    for (const m of mentions) {
      handles.add(m.toLowerCase().replace(/^@/, ''))
    }
  }

  return handles
}
