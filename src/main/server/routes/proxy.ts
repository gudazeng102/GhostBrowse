/**
 * 代理管理路由
 * Phase 1.1: 实现代理的 CRUD API
 * Phase 1.2: 追加代理检测功能
 */

import { Router, Request, Response } from 'express'
import { getDatabase } from '../db'
import axios from 'axios'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HttpProxyAgent } = require('http-proxy-agent')

// 创建路由实例
const router = Router()

// ==================== 检测渠道配置 ====================

/** 检测渠道定义 */
interface CheckChannel {
  id: string      // 渠道标识：ip.sb, ipinfo.io, ip-api.com
  name: string    // 渠道名称
  url: string     // 检测 API URL
}

/** 支持的检测渠道列表 */
const CHECK_CHANNELS: CheckChannel[] = [
  { id: 'ip.sb', name: 'IP.SB', url: 'https://api.ip.sb/geoip' },
  { id: 'ipinfo.io', name: 'IPInfo', url: 'https://ipinfo.io/json' },
  { id: 'ip-api.com', name: 'IP-API', url: 'http://ip-api.com/json/' }
]

// ==================== 类型定义 ====================

/** 代理类型枚举 */
type ProxyType = 'http' | 'https' | 'socks5'

/** 代理数据 */
interface ProxyRecord {
  id: number
  name: string
  type: ProxyType
  host: string
  port: number
  username: string | null
  password: string | null
  remark: string | null
  created_at: number
  updated_at: number
}

/** 创建/更新代理请求体 */
interface ProxyDto {
  name: string
  type: ProxyType
  host: string
  port: number
  username?: string
  password?: string
  remark?: string
}

// ==================== API 路由 ====================

/**
 * GET /api/v1/proxies
 * 获取代理列表，支持模糊搜索
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { keyword } = req.query as { keyword?: string }
    const db = getDatabase()
    
    let sql = 'SELECT id, name, type, host, port, username, password, remark, created_at, updated_at FROM proxies'
    let params: string[] = []
    
    if (keyword && keyword.trim()) {
      sql += ' WHERE name LIKE ? OR host LIKE ? OR remark LIKE ?'
      const kw = `%${keyword.trim()}%`
      params = [kw, kw, kw]
    }
    
    sql += ' ORDER BY id DESC'
    
    const list = db.prepare(sql).all(...params) as ProxyRecord[]
    
    res.json({
      code: 0,
      data: list,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Proxy API] 获取列表失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取列表失败'
    })
  }
})

/**
 * GET /api/v1/proxies/:id
 * 获取代理详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const proxy = db.prepare(`
      SELECT id, name, type, host, port, username, password, remark, created_at, updated_at
      FROM proxies WHERE id = ?
    `).get(Number(id)) as ProxyRecord | undefined
    
    if (!proxy) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '代理不存在'
      })
    }
    
    res.json({
      code: 0,
      data: proxy,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Proxy API] 获取详情失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取详情失败'
    })
  }
})

/**
 * POST /api/v1/proxies
 * 创建代理
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body as ProxyDto
    
    // 参数校验
    if (!body.name || !body.name.trim()) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '名称不能为空'
      })
    }
    
    if (!body.type || !['http', 'https', 'socks5'].includes(body.type)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '类型必须是 http、https 或 socks5'
      })
    }
    
    if (!body.host || !body.host.trim()) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '主机地址不能为空'
      })
    }
    
    if (!body.port || body.port < 1 || body.port > 65535) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '端口必须为 1-65535 之间的数字'
      })
    }
    
    const db = getDatabase()
    const now = Date.now()
    const result = db.prepare(`
      INSERT INTO proxies (name, type, host, port, username, password, remark, created_at, updated_at)
      VALUES (@name, @type, @host, @port, @username, @password, @remark, @created_at, @updated_at)
    `).run({
      name: body.name.trim(),
      type: body.type,
      host: body.host.trim(),
      port: body.port,
      username: body.username?.trim() || null,
      password: body.password || null,
      remark: body.remark?.trim() || null,
      created_at: now,
      updated_at: now
    })
    
    res.json({
      code: 0,
      data: {
        id: result.lastInsertRowid
      },
      message: '创建成功'
    })
  } catch (err: any) {
    console.error('[Proxy API] 创建失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '创建失败'
    })
  }
})

/**
 * PUT /api/v1/proxies/:id
 * 更新代理
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const body = req.body as ProxyDto
    const db = getDatabase()
    
    // 检查代理是否存在
    const existing = db.prepare(`
      SELECT id, name, type, host, port, username, password, remark, created_at, updated_at
      FROM proxies WHERE id = ?
    `).get(Number(id)) as ProxyRecord | undefined
    
    if (!existing) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '代理不存在'
      })
    }
    
    // 参数校验
    if (!body.name || !body.name.trim()) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '名称不能为空'
      })
    }
    
    if (!body.type || !['http', 'https', 'socks5'].includes(body.type)) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '类型必须是 http、https 或 socks5'
      })
    }
    
    if (!body.host || !body.host.trim()) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '主机地址不能为空'
      })
    }
    
    if (!body.port || body.port < 1 || body.port > 65535) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '端口必须为 1-65535 之间的数字'
      })
    }
    
    const result = db.prepare(`
      UPDATE proxies
      SET name = @name, type = @type, host = @host, port = @port,
          username = @username, password = @password, remark = @remark, updated_at = @updated_at
      WHERE id = @id
    `).run({
      id: Number(id),
      name: body.name.trim(),
      type: body.type,
      host: body.host.trim(),
      port: body.port,
      username: body.username?.trim() || null,
      password: body.password || null,
      remark: body.remark?.trim() || null,
      updated_at: Date.now()
    })
    
    res.json({
      code: 0,
      data: {
        changes: result.changes
      },
      message: '更新成功'
    })
  } catch (err: any) {
    console.error('[Proxy API] 更新失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '更新失败'
    })
  }
})

/**
 * DELETE /api/v1/proxies/:id
 * 删除代理
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查代理是否存在
    const existing = db.prepare(`
      SELECT id, name, type, host, port, username, password, remark, created_at, updated_at
      FROM proxies WHERE id = ?
    `).get(Number(id)) as ProxyRecord | undefined
    
    if (!existing) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '代理不存在'
      })
    }
    
    // 【Bug 修复】删除代理前，需要处理所有关联数据
    // 1. proxy_checks 表的 proxy_id 是 NOT NULL，必须先删除记录
    db.prepare(`DELETE FROM proxy_checks WHERE proxy_id = ?`).run(Number(id))
    // 2. profiles 表的 proxy_id 设为 NULL（允许为空）
    db.prepare(`UPDATE profiles SET proxy_id = NULL WHERE proxy_id = ?`).run(Number(id))
    
    const result = db.prepare(`DELETE FROM proxies WHERE id = ?`).run(Number(id))
    
    res.json({
      code: 0,
      data: {
        changes: result.changes
      },
      message: '删除成功'
    })
  } catch (err: any) {
    console.error('[Proxy API] 删除失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '删除失败'
    })
  }
})

// ==================== Phase 1.2: 代理检测接口 ====================

/**
 * POST /api/v1/proxies/:id/check
 * 检测代理连通性
 * 
 * 请求体: { "channel": "ip.sb" }
 * 渠道支持: ip.sb, ipinfo.io, ip-api.com
 */
router.post('/:id/check', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { channel } = req.body as { channel: string }
    
    console.log(`[Proxy Check] 检测请求: proxyId=${id}, channel=${channel}`)
    console.log(`[Proxy Check] 请求体:`, JSON.stringify(req.body))
    
    // 1. 验证渠道
    const channelConfig = CHECK_CHANNELS.find(c => c.id === channel)
    if (!channelConfig) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '不支持的检测渠道'
      })
    }
    
    // 2. 查询代理配置
    const db = getDatabase()
    const proxy = db.prepare(`
      SELECT id, name, type, host, port, username, password
      FROM proxies WHERE id = ?
    `).get(Number(id)) as ProxyRecord | undefined
    
    console.log(`[Proxy Check] 从数据库加载代理:`, {
      id: proxy?.id,
      name: proxy?.name,
      type: proxy?.type,
      host: proxy?.host,
      port: proxy?.port,
      hasAuth: !!proxy?.username
    })
    
    if (!proxy) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '代理不存在'
      })
    }
    
    // 3. 记录检测开始时间
    const startTime = Date.now()
    let status: 'success' | 'fail' = 'fail'
    let ip: string | null = null
    let country: string | null = null
    let city: string | null = null
    let latency: number | null = null
    let errorMsg: string | null = null
    
    try {
      // 4. 根据代理类型构建 axios 配置
      const axiosConfig: any = {
        method: 'GET',
        url: channelConfig.url,
        timeout: 10000 // 10秒超时
      }
      
      // HTTP/HTTPS 代理使用原生 proxy 配置
      if (proxy.type === 'http' || proxy.type === 'https') {
        axiosConfig.proxy = {
          host: proxy.host,
          port: proxy.port,
          auth: proxy.username ? {
            username: proxy.username,
            password: proxy.password || ''
          } : undefined
        }
      }
      // SOCKS5 代理：使用 http-proxy-agent（HTTP CONNECT 隧道）
      // 很多商业代理（如 arxlabs）虽标记为 socks5，但底层是 HTTP CONNECT 隧道
      // http-proxy-agent 能正确处理这类代理
      else if (proxy.type === 'socks5') {
        const proxyUrl = proxy.username
          ? `http://${proxy.username}:${proxy.password || ''}@${proxy.host}:${proxy.port}`
          : `http://${proxy.host}:${proxy.port}`
        
        console.log(`[Proxy Check] SOCKS5 代理使用 HTTP CONNECT: ${proxy.host}:${proxy.port}`)
        const agent = new (HttpProxyAgent as any)(proxyUrl)
        axiosConfig.httpAgent = agent
        axiosConfig.httpsAgent = agent
      }
      
      // 5. 发起检测请求
      const response = await axios(axiosConfig)
      latency = Date.now() - startTime
      status = 'success'
      
      // 6. 解析响应体，提取 IP 和区域信息
      const data = response.data
      
      if (channel === 'ip.sb') {
        ip = data.ip
        country = data.country
        city = data.city
      } else if (channel === 'ipinfo.io') {
        ip = data.ip
        country = data.country
        city = data.city
      } else if (channel === 'ip-api.com') {
        ip = data.query  // ip-api.com 使用 query 字段
        country = data.country
        city = data.city
      }
    } catch (err: any) {
      // 检测失败
      status = 'fail'
      latency = Date.now() - startTime
      errorMsg = err.message || '连接失败'
      console.error('[Proxy Check] 检测失败:', err.message)
    }
    
    // 7. 将检测结果写入 proxy_checks 表
    const insertResult = db.prepare(`
      INSERT INTO proxy_checks (proxy_id, channel, status, ip, country, city, latency, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(id),
      channel,
      status,
      ip,
      country,
      city,
      latency,
      Date.now()
    )
    
    // 8. 返回检测结果
    res.json({
      code: 0,
      data: {
        id: insertResult.lastInsertRowid,
        channel,
        status,
        ip,
        country,
        city,
        region: country && city ? `${country}-${city}` : (country || '-'),
        latency,
        error: errorMsg,
        checkedAt: Date.now()
      },
      message: status === 'success' ? '检测成功' : '检测失败'
    })
  } catch (err: any) {
    console.error('[Proxy API] 检测失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '检测失败'
    })
  }
})

/**
 * POST /api/v1/proxies/batch-delete
 * 批量删除代理（在事务中执行）
 */
router.post('/batch-delete', (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: number[] }
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        code: 400,
        data: null,
        message: '请提供要删除的代理 ID 列表'
      })
    }
    
    const db = getDatabase()
    
    // 在事务中执行批量删除
    const deleteTransaction = db.transaction((idList: number[]) => {
      for (const id of idList) {
        // 1. 删除关联的 proxy_checks 记录
        db.prepare(`DELETE FROM proxy_checks WHERE proxy_id = ?`).run(id)
        // 2. 将关联的 profiles 的 proxy_id 设为 NULL
        db.prepare(`UPDATE profiles SET proxy_id = NULL WHERE proxy_id = ?`).run(id)
        // 3. 删除代理
        db.prepare(`DELETE FROM proxies WHERE id = ?`).run(id)
      }
    })
    
    deleteTransaction(ids)
    
    res.json({
      code: 0,
      data: { deletedCount: ids.length },
      message: `成功删除 ${ids.length} 条代理`
    })
  } catch (err: any) {
    console.error('[Proxy API] 批量删除失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '批量删除失败'
    })
  }
})

/**
 * GET /api/v1/proxies/:id/checks
 * 获取代理检测历史记录（最近 10 条）
 */
router.get('/:id/checks', (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    
    // 检查代理是否存在
    const proxy = db.prepare(`SELECT id FROM proxies WHERE id = ?`).get(Number(id))
    if (!proxy) {
      return res.status(404).json({
        code: 404,
        data: null,
        message: '代理不存在'
      })
    }
    
    // 查询最近 10 条检测记录
    const checks = db.prepare(`
      SELECT id, proxy_id, channel, status, ip, country, city, latency, checked_at
      FROM proxy_checks
      WHERE proxy_id = ?
      ORDER BY checked_at DESC
      LIMIT 10
    `).all(Number(id)) as any[]
    
    // 格式化返回数据
    const formattedChecks = checks.map(check => ({
      id: check.id,
      proxyId: check.proxy_id,
      channel: check.channel,
      status: check.status,
      ip: check.ip,
      country: check.country,
      city: check.city,
      region: check.country && check.city ? `${check.country}-${check.city}` : (check.country || '-'),
      latency: check.latency,
      checkedAt: check.checked_at,
      checkedAtStr: new Date(check.checked_at).toLocaleString('zh-CN')
    }))
    
    res.json({
      code: 0,
      data: formattedChecks,
      message: 'success'
    })
  } catch (err: any) {
    console.error('[Proxy API] 获取检测历史失败:', err)
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || '获取检测历史失败'
    })
  }
})

export default router
