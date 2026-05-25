/**
 * AI 接口测试脚本（Node.js，无外部依赖）
 * 用法：node scripts/test-ai.mjs
 *
 * 注：用 http 模块手写请求，避免 Node 18 fetch 默认 5 分钟 headers timeout
 */

import http from 'node:http'

const HOST = '127.0.0.1'
const PORT = 3000
const PREFIX = '/api/v1/ai'
const TIMEOUT_MS = 15 * 60 * 1000  // 15 分钟，足够 32B 模型思考

function divider(title) {
  console.log('\n' + '='.repeat(15) + ` ${title} ` + '='.repeat(15))
}

function call(path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: HOST,
      port: PORT,
      path: PREFIX + path,
      method: body ? 'POST' : 'GET',
      headers: data
        ? {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(data)
          }
        : {},
      timeout: TIMEOUT_MS
    }
    const start = Date.now()
    const req = http.request(opts, (res) => {
      let chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const elapsed = Date.now() - start
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch {}
        console.log(`[${res.statusCode}] ${path}  (${elapsed}ms)`)
        resolve(json ?? text)
      })
    })
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`request timeout after ${TIMEOUT_MS}ms`))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function main() {
  // 1. health
  divider('1. Health Check')
  const health = await call('/health')
  console.log(JSON.stringify(health, null, 2))

  if (!health?.data?.online) {
    console.log('\n⚠️ Ollama 未在线，跳过后续测试。')
    return
  }
  if (!health?.data?.defaultModelInstalled) {
    console.log(`\n⚠️ 默认模型 ${health.data.defaultModel} 未安装，先 pull 一下：\n   ollama pull ${health.data.defaultModel}`)
    return
  }

  // 注：以下接口纯 AI 文本处理，不联系任何外部网站、不需要任何账号登录。
  //     parse-command 只输出结构化 JSON，generate-comment 只输出文字。
  //     真正去 X 上操作是浏览器扩展层的事（迭代 3.5）。

  // 2. parse-command
  divider('2. Parse Command（纯 AI 解析，不操作 X）')
  console.log('（这一步会调 Ollama，32B 模型可能需要 1~5 分钟）')
  const cases = [
    '在首页浏览 5 条内容并点赞前 3 条',
    '关注页浏览 3 分钟后暂停'
  ]
  for (const cmd of cases) {
    console.log('\n→ 输入：' + cmd)
    const parsed = await call('/parse-command', { command: cmd })
    console.log(JSON.stringify(parsed?.data?.plan ?? parsed, null, 2))
  }

  // 3. generate-comment
  divider('3. Generate Comment（纯 AI 生成文本）')
  console.log('（这一步会调 Ollama，32B 模型可能需要 3~10 分钟）')
  const comment = await call('/generate-comment', {
    text: '刚发布了新功能，超开心！'
  })
  console.log(JSON.stringify(comment, null, 2))

  divider('Done')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})