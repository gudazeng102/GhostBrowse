/**
 * 测试 X GraphQL API
 * 
 * 用法：node scripts/test-x-api.mjs <profileId>
 * 示例：node scripts/test-x-api.mjs 165
 * 
 * 前置条件：profileId 对应的浏览器窗口已启动并登录了 X
 */

import WebSocket from 'ws'
import http from 'http'

const PROFILE_ID = parseInt(process.argv[2] || '165')
const DEBUG_PORT = 9000 + PROFILE_ID

const USER_BY_SCREEN_NAME_QID = 'IGgvgiOx4QZndDHuD3x9TQ'
const FOLLOWING_QID = 'XRzHZz4sLnhSgz55WGMCbg'

async function getPageWsUrl() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const targets = JSON.parse(d)
          const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
          if (page?.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl)
          else reject(new Error('未找到 page'))
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function getCookies() {
  const wsUrl = await getPageWsUrl()
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let cmdId = 0
    ws.on('open', () => {
      cmdId++
      ws.send(JSON.stringify({ id: cmdId, method: 'Network.getAllCookies', params: {} }))
    })
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id === cmdId && msg.result) {
          ws.close()
          const cookies = msg.result.cookies || []
          const authToken = cookies.find(c => c.name === 'auth_token')?.value
          const ct0 = cookies.find(c => c.name === 'ct0')?.value
          resolve({ authToken, ct0, all: cookies })
        }
      } catch {}
    })
    ws.on('error', reject)
    setTimeout(() => reject(new Error('超时')), 10000)
  })
}

async function main() {
  console.log(`Profile ${PROFILE_ID} (debug port ${DEBUG_PORT})`)

  // Step 1: 拿 Cookie
  console.log('\n[Step 1] 获取 Cookie...')
  const { authToken, ct0 } = await getCookies()
  if (!authToken || !ct0) {
    console.error('❌ 未找到 auth_token 或 ct0')
    process.exit(1)
  }
  console.log(`✅ auth_token: ${authToken.substring(0, 10)}...`)
  console.log(`✅ ct0: ${ct0.substring(0, 10)}...`)

  const cookieStr = `auth_token=${authToken}; ct0=${ct0}`

  // Step 2: UserByScreenName（用 IGgvgiOx4QZndDHuD3x9TQ）
  console.log(`\n[Step 2] 测试 UserByScreenName...`)
  console.log(`POST https://x.com/i/api/graphql/${USER_BY_SCREEN_NAME_QID}/UserByScreenName`)

  const res1 = await fetch(`https://x.com/i/api/graphql/${USER_BY_SCREEN_NAME_QID}/UserByScreenName`, {
    method: 'POST',
    headers: {
      'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'content-type': 'application/json',
      'x-csrf-token': ct0,
      'cookie': cookieStr,
      'x-twitter-active-user': 'yes',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
      'origin': 'https://x.com',
      'referer': 'https://x.com/'
    },
    body: JSON.stringify({ variables: { screen_name: 'Anime_Frieren', withSafetyModeUserFields: false }, features: { responsive_web_graphql_timeline_navigation_enabled: true } })
  })

  const text1 = await res1.text()
  console.log(`状态: ${res1.status}  Rate Limit: ${res1.headers.get('x-rate-limit-remaining')}/${res1.headers.get('x-rate-limit-limit')}`)
  if (!res1.ok) { console.log(`❌ 错误: ${text1.substring(0, 300)}`); process.exit(1) }

  const data1 = JSON.parse(text1)
  const userResult = data1?.data?.user?.result
  const restId = userResult?.rest_id || ''
  const screenName = userResult?.legacy?.screen_name || ''
  const displayName = userResult?.legacy?.name || ''
  console.log(`✅ 用户: @${screenName} (${displayName})  rest_id: ${restId}`)
  if (!restId) { console.log('❌ 未获取到 rest_id'); process.exit(1) }

  // Step 3: Following（用 XRzHZz4sLnhSgz55WGMCbg）
  const targetUserId = '1887719973126348801'
  console.log(`\n[Step 3] 测试 Following（目标 userId: ${targetUserId}）...`)
  console.log(`POST https://x.com/i/api/graphql/${FOLLOWING_QID}/Following`)

  const res2 = await fetch(`https://x.com/i/api/graphql/${FOLLOWING_QID}/Following`, {
    method: 'POST',
    headers: {
      'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
      'content-type': 'application/json',
      'x-csrf-token': ct0,
      'cookie': cookieStr,
      'x-twitter-active-user': 'yes',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
      'origin': 'https://x.com',
      'referer': 'https://x.com/'
    },
    body: JSON.stringify({
      variables: { userId: targetUserId, count: 20, includePromotedContent: false, __fs_dont_use_me_cursor: false, withSuperFollowsUserFields: false },
      features: { responsive_web_graphql_timeline_navigation_enabled: true, rweb_tipjar_consumption_enabled: true, responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false }
    })
  })

  const text2 = await res2.text()
  console.log(`状态: ${res2.status}  Rate Limit: ${res2.headers.get('x-rate-limit-remaining')}/${res2.headers.get('x-rate-limit-limit')}`)
  if (!res2.ok) { console.log(`❌ 错误: ${text2.substring(0, 300)}`); process.exit(1) }

  const data2 = JSON.parse(text2)
  const instructions = data2?.data?.user?.result?.timeline?.timeline?.instructions || []
  let entries = []
  for (const inst of instructions) { if (inst.type === 'TimelineAddEntries') { entries = inst.entries || []; break } }

  console.log(`\n📋 instructions: ${instructions.map(i => i.type).join(', ')}  entries: ${entries.length}`)
  if (entries.length === 0) { console.log(text2.substring(0, 1000)); process.exit(0) }

  let bc = null
  let users = 0
  for (const e of entries) {
    if (e.content?.entryType === 'TimelineTimelineCursor') { if (e.content?.cursorType === 'Bottom') bc = e.content.value; continue }
    const u = e?.content?.itemContent?.user_results?.result
    if (u && (u.legacy?.screen_name || u.screen_name)) users++
  }

  console.log(`✅ 用户数: ${users}`)
  console.log(`✅ 下一页游标: ${bc ? bc.substring(0, 20) + '...' : '无'}`)
  console.log(`\n🎉 完成！`)
}

main().catch(err => { console.error(`\n💥 错误: ${err.message}`); process.exit(1) })