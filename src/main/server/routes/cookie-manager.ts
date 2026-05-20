/**
 * Cookie 管理后端路由（Phase 4.0）
 * 
 * 职责：通过 CDP WebSocket 实时操作浏览器 Cookie
 * - GET  /profiles/:id/cookies         - 获取 Cookie 列表
 * - POST /profiles/:id/cookies/import  - 导入 Cookie JSON
 * - DELETE /profiles/:id/cookies       - 清空所有 Cookie
 */

import { Router, Request, Response } from 'express'
import WebSocket from 'ws'
import http from 'http'
import { getProfileDebugPort, isProfileRunning } from '../../browser/launcher'
import { saveProfileCookieJson } from '../services/cookie-snapshot'

const router = Router()

// ==================== CDP WebSocket 连接 ====================

interface CDPCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None' | 'unspecified'
  partitionKey?: { origin: string }
}

interface CDPTarget {
  id: string
  title: string
  type: string
  webSocketDebuggerUrl: string
}

/**
 * 获取 Chrome 第一个 page target 的 WebSocket URL
 */
function getPageWsUrl(debugPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${debugPort}/json`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const targets: CDPTarget[] = JSON.parse(data)
          const page = targets.find(t => t.type === 'page')
          if (page?.webSocketDebuggerUrl) {
            resolve(page.webSocketDebuggerUrl)
          } else {
            reject(new Error('未找到可用的 page target'))
          }
        } catch (e: any) {
          reject(new Error('解析 CDP /json 失败: ' + e.message))
        }
      })
    }).on('error', reject)
  })
}

/**
 * 建立与 Chrome CDP 的 WebSocket 连接
 */
async function createCDPConnection(profileId: number): Promise<WebSocket> {
  const debugPort = getProfileDebugPort(profileId)
  const wsUrl = await getPageWsUrl(debugPort)
  console.log(`[CookieManager] CDP page wsUrl=${wsUrl}`)
  return new WebSocket(wsUrl)
}

/**
 * 发送 CDP 命令并等待响应
 */
function sendCDPCommand(ws: WebSocket, id: number, method: string, params: object = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`CDP 命令 ${method} 超时`))
    }, 10000)

    const messageHandler = (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const response = JSON.parse(data.toString())
        if (response.id === id) {
          clearTimeout(timeout)
          ws.off('message', messageHandler)
          if (response.error) {
            reject(new Error(response.error.message))
          } else {
            resolve(response.result)
          }
        }
      } catch {
        // 忽略非 JSON 消息
      }
    }

    ws.on('message', messageHandler)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

// ==================== 路由实现 ====================

/**
 * GET /api/v1/cookie-manager/:id/live-cookies
 * 查看当前浏览器的所有 Cookie（前端别名，避免与 profile/:id/cookies 冲突）
 * 实现：WebSocket CDP → Network.getAllCookies
 */
router.get('/:id/live-cookies', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))
    console.log(`[CookieManager] GET live-cookies, profileId=${profileId}`)
    
    const running = isProfileRunning(profileId)
    console.log(`[CookieManager] isProfileRunning(${profileId})=${running}`)
    
    if (!running) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行，请先启动窗口'
      })
    }

    const debugPort = getProfileDebugPort(profileId)
    const wsUrl = `ws://localhost:${debugPort}/devtools/browser`
    console.log(`[CookieManager] CDP wsUrl=${wsUrl}`)
    
    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })
    console.log(`[CookieManager] WebSocket connected`)

    const result = await sendCDPCommand(ws, 1, 'Network.getAllCookies')
    console.log(`[CookieManager] CDP result=`, JSON.stringify(result)?.slice(0, 500))
    const cookies = result?.cookies || []
    
    ws.close()
    console.log(`[CookieManager] Returning ${cookies.length} cookies`)

    res.json({
      code: 0,
      data: cookies,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[CookieManager] 获取 Cookie 列表失败:', err)
    console.error('[CookieManager] 错误堆栈:', err.stack)
    
    let message = '获取 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * DELETE /api/v1/cookie-manager/:id/live-cookies
 * 清空当前浏览器的所有 Cookie
 */
router.delete('/:id/live-cookies', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))

    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行'
      })
    }

    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })

    await sendCDPCommand(ws, 1, 'Network.clearBrowserCookies')
    
    ws.close()

    res.json({
      code: 0,
      data: { deleted: true },
      message: '所有 Cookie 已清空'
    })
  } catch (err: any) {
    console.error('[CookieManager] 清空 Cookie 失败:', err)
    
    let message = '清空 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * POST /api/v1/cookie-manager/:id/live-cookies/import
 * 导入 Cookie JSON 到浏览器
 */
router.post('/:id/live-cookies/import', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))
    const { cookies } = req.body

    if (!Array.isArray(cookies)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: 'cookies 必须是数组'
      })
    }

    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行'
      })
    }

    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })

    let successCount = 0
    let failCount = 0

    // 逐个写入 Cookie
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i]
      try {
        await sendCDPCommand(ws, i + 1, 'Network.setCookie', {
          name: c.name || '',
          value: c.value || '',
          domain: c.domain || '',
          path: c.path || '/',
          secure: !!c.secure,
          httpOnly: !!c.httpOnly,
          sameSite: c.sameSite || 'unspecified',
          expires: c.expires || -1,
          ...(c.partitionKey && { partitionKey: c.partitionKey })
        })
        successCount++
      } catch (e: any) {
        failCount++
        console.warn(`[CookieManager] Cookie 导入失败: ${c.name}`, e.message)
      }
    }

    ws.close()

    res.json({
      code: 0,
      data: { successCount, failCount },
      message: `导入完成：成功 ${successCount}，失败 ${failCount}`
    })
  } catch (err: any) {
    console.error('[CookieManager] 导入 Cookie 失败:', err)
    
    let message = '导入 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * POST /api/v1/cookie-manager/:id/live-cookies/delete
 * 删除单个 Cookie
 */
router.post('/:id/live-cookies/delete', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))
    const { name, domain } = req.body

    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行'
      })
    }

    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })

    // 先获取所有 Cookie，找到要删除的，然后逐个删除匹配的
    const result = await sendCDPCommand(ws, 1, 'Network.getAllCookies')
    const allCookies = result?.cookies || []
    const toDelete = allCookies.filter((c: CDPCookie) => c.name === name && (!domain || c.domain === domain))
    
    for (let i = 0; i < toDelete.length; i++) {
      await sendCDPCommand(ws, i + 2, 'Network.deleteCookies', {
        name: toDelete[i].name,
        domain: toDelete[i].domain
      })
    }
    
    ws.close()

    res.json({
      code: 0,
      data: { deleted: toDelete.length },
      message: `删除 ${toDelete.length} 个 Cookie`
    })
  } catch (err: any) {
    console.error('[CookieManager] 删除 Cookie 失败:', err)
    
    let message = '删除 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * GET /api/v1/profiles/:id/cookies
 * 查看当前浏览器的所有 Cookie
 * 
 * 实现：WebSocket CDP → Network.getAllCookies
 */
router.get('/:id/cookies', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))
    
    // 检查窗口是否运行
    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行，请先启动窗口'
      })
    }

    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })

    // 发送 CDP 命令
    const result = await sendCDPCommand(ws, 1, 'Network.getAllCookies')
    const cookies = result?.cookies || []
    
    ws.close()

    res.json({
      code: 0,
      data: { cookies },
      message: 'success'
    })
  } catch (err: any) {
    console.error('[CookieManager] 获取 Cookie 列表失败:', err)
    
    // 友好错误提示
    let message = '获取 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * POST /api/v1/profiles/:id/cookies/import
 * 导入 Cookie JSON 到浏览器
 * 
 * 实现：解析 JSON → WebSocket CDP → Network.setCookie 逐个写入
 */
router.post('/:id/cookies/import', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))
    const { cookies } = req.body

    if (!Array.isArray(cookies)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: 'cookies 必须是数组'
      })
    }

    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行'
      })
    }

    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })

    let successCount = 0
    let failCount = 0

    // 逐个写入 Cookie
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i]
      try {
        await sendCDPCommand(ws, i + 1, 'Network.setCookie', {
          name: c.name || '',
          value: c.value || '',
          domain: c.domain || '',
          path: c.path || '/',
          secure: !!c.secure,
          httpOnly: !!c.httpOnly,
          sameSite: c.sameSite || 'unspecified',
          expires: c.expires || -1,
          ...(c.partitionKey && { partitionKey: c.partitionKey })
        })
        successCount++
      } catch (e: any) {
        failCount++
        console.warn(`[CookieManager] Cookie 导入失败: ${c.name}`, e.message)
      }
    }

    ws.close()

    res.json({
      code: 0,
      data: { successCount, failCount },
      message: `导入完成：成功 ${successCount}，失败 ${failCount}`
    })
  } catch (err: any) {
    console.error('[CookieManager] 导入 Cookie 失败:', err)
    
    let message = '导入 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * DELETE /api/v1/profiles/:id/cookies
 * 清空当前浏览器的所有 Cookie
 * 
 * 实现：WebSocket CDP → Network.clearBrowserCookies
 */
router.delete('/:id/cookies', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))

    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行'
      })
    }

    const ws = await createCDPConnection(profileId)
    
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { ws.off('open', onOpen); ws.off('error', onError); resolve() }
      const onError = (e: Error) => { ws.off('open', onOpen); ws.off('error', onError); reject(e) }
      ws.on('open', onOpen)
      ws.on('error', onError)
      setTimeout(() => { ws.off('open', onOpen); ws.off('error', onError); reject(new Error('CDP 连接超时（5秒）')) }, 5000)
    })

    await sendCDPCommand(ws, 1, 'Network.clearBrowserCookies')
    
    ws.close()

    res.json({
      code: 0,
      data: { deleted: true },
      message: '所有 Cookie 已清空'
    })
  } catch (err: any) {
    console.error('[CookieManager] 清空 Cookie 失败:', err)
    
    let message = '清空 Cookie 失败'
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

/**
 * POST /api/v1/cookie-manager/:id/save-to-profile
 * 把当前浏览器实时 Cookie 抓取并保存到 profiles.cookie_json
 * 用于前端"💾 保存到本窗口配置"按钮
 */
router.post('/:id/save-to-profile', async (req: Request, res: Response) => {
  try {
    const profileId = parseInt(String(req.params.id))

    if (!isProfileRunning(profileId)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '窗口未运行，请先启动窗口'
      })
    }

    // silent=false → 失败抛出，让前端拿到准确错误信息
    const count = await saveProfileCookieJson(profileId, { silent: false })

    res.json({
      code: 0,
      data: { count },
      message: `已保存 ${count} 条 Cookie 到本窗口配置`
    })
  } catch (err: any) {
    console.error('[CookieManager] 保存 Cookie 到 profile 失败:', err)
    let message = '保存失败：' + (err.message || '未知错误')
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('连接超时')) {
      message = '浏览器未运行或 CDP 未就绪，请稍后重试'
    }
    res.status(500).json({
      code: 500,
      data: null,
      message
    })
  }
})

export default router
