/**
 * 直接测试命令解析：调用 DeepSeek API 解析用户指令
 * 不依赖 Electron/Express，直接看 AI 输出什么
 */

const DEEPSEEK_API_KEY = 'sk-753cdb5b8ce74b9f928aa0db7fcd22f7'
const COMMAND = '去@gudazeng102评论5条推文，这5条完成后就回到首页，返回到首页后继续浏览5条并点赞评论'

const prompt = `你是Twitter指令解析器。只输出JSON，禁止任何其他文字。

【核心区分 - 决定是否启用 position_plan】
- 如果指令包含"前X条"、"第Y条"、"第A和第B条"、"第M到第N条"、"从第X条开始"、"接下来的"等位置描述 → 必须生成 position_plan
- 如果指令只说"点赞X条"（未指定第几条或前几条）→ 不生成 position_plan，用传统 like_count + selective=true
- 如果指令只说"浏览X条"（未指定位置）→ 不生成 position_plan，like_count=0

【强制规则】
1. 见"去@XXX"、"去XXX"或"XXX的账号下" → target_accounts:["XXX"], action:targeted_interaction
2. 见"首页"或"主页"或"home" → action:home_warming
3. 见"关注"或"following"或"关注列表" → action:following_warming
4. 见"X分钟"或"X分" → duration_minutes=X
5. 见"完成后暂停"或"暂停"或"停止"或"结束" → pause_after:true
6. 见"回到首页"或"返回首页"或"回首页" → return_to_home:true

【输出格式】必须且只能输出一行紧凑JSON：
{"action":"targeted_interaction|home_warming|following_warming","target_accounts":["账号名"],"operations":["like","retweet","comment"],"constraints":{"view_count":数字,"like_count":数字,"selective":true/false,"position_plan":"位置:操作;位置:操作"},"duration_minutes":0,"pause_after":true/false,"return_to_home":true/false}

输入：去@gudazeng102浏览30条推文，在第31条推文开始时点赞和评论接下来的5条，这5条完成后就回到首页
输出：{"action":"targeted_interaction","target_accounts":["gudazeng102"],"operations":["like","comment"],"constraints":{"view_count":35,"like_count":0,"selective":false,"position_plan":"1-30:view;31-35:like,comment"},"duration_minutes":0,"pause_after":false,"return_to_home":true}

输入：去@FRIEREN_INFO的账号下，点赞前5条推文，评论第6和第7条推文，转发第8条推文
输出：{"action":"targeted_interaction","target_accounts":["FRIEREN_INFO"],"operations":["like","comment","retweet"],"constraints":{"view_count":8,"like_count":0,"selective":false,"position_plan":"1-5:like;6-7:comment;8:retweet"},"duration_minutes":0,"pause_after":false,"return_to_home":false}

输入：${COMMAND}
输出：`

const body = JSON.stringify({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: prompt }],
  stream: false,
  temperature: 0.0,
  top_p: 0.1,
  max_tokens: 512
})

console.log('正在调用 DeepSeek API...')
const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body
})

if (!res.ok) {
  const err = await res.text().catch(() => '')
  console.error(`HTTP ${res.status}: ${err}`)
  process.exit(1)
}

const data = await res.json()
const output = data.choices?.[0]?.message?.content || ''
console.log('\n=== DeepSeek 原始输出 ===')
console.log(output)
console.log('\n=== 解析JSON ===')
try {
  const parsed = JSON.parse(output)
  console.log(JSON.stringify(parsed, null, 2))
} catch {
  console.log('⚠️ 输出不是有效 JSON')
}