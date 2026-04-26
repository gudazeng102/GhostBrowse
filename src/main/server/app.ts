/**
 * Express 服务器模块
 * Phase 1.0: 提供基础 REST API 和静态文件服务
 */

import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import * as path from 'path'

// 导入数据库模块（用于 Phase 1.0 验证连接）
import { initDatabase } from './db'

// 导入路由模块
import proxyRouter from './routes/proxy'
import profileRouter from './routes/profile'

// Express 应用实例
let app: Express | null = null

/**
 * 创建并配置 Express 应用
 */
export function createApp(): Express {
  if (app) {
    return app
  }

  app = express()

  // ==================== 中间件配置 ====================
  
  // CORS：允许所有来源，支持局域网访问
  app.use(cors({
    origin: true,
    credentials: true
  }))

  // JSON Body 解析
  app.use(express.json())

  // URL-encoded Body 解析
  app.use(express.urlencoded({ extended: true }))

  // ==================== 静态文件服务 ====================
  // 开发模式：项目根目录/dist
  // 打包模式：app.getAppPath()/dist
  const isDev = process.env.NODE_ENV !== 'production'
  const distPath = isDev
    ? path.join(process.cwd(), 'dist')
    : path.join(process.cwd(), 'dist')
  
  console.log(`[Express] 静态文件目录: ${distPath}`)
  app.use(express.static(distPath))

  // ==================== API 路由 ====================
  
  // 系统状态接口
  app.get('/api/v1/system/status', (req: Request, res: Response) => {
    res.json({
      code: 0,
      data: {
        status: 'running',
        port: 3000,
        version: '1.0.0',
        environment: isDev ? 'development' : 'production'
      },
      message: 'success'
    })
  })

  // 健康检查接口
  app.get('/api/v1/health', (req: Request, res: Response) => {
    res.json({
      code: 0,
      data: {
        healthy: true,
        timestamp: Date.now()
      },
      message: 'success'
    })
  })

  // ==================== 代理管理 API（Phase 1.1） ====================
  app.use('/api/v1/proxies', proxyRouter)

  // ==================== 窗口配置 API（Phase 1.3） ====================
  app.use('/api/v1/profiles', profileRouter)

  // ==================== 捕获所有路由，返回 index.html (SPA 支持) ====================
  app.get('*', (req: Request, res: Response) => {
    const indexPath = path.join(distPath, 'index.html')
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath)
    } else {
      res.status(404).json({
        code: 404,
        data: null,
        message: 'Frontend not built yet. Run "npm run build:renderer" first.'
      })
    }
  })

  return app
}

/**
 * 启动 Express 服务器
 */
export function startServer(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
  return new Promise((resolve, reject) => {
    const appInstance = createApp()

    // 初始化数据库
    try {
      initDatabase()
    } catch (err) {
      console.error('[Express] 数据库初始化失败:', err)
      reject(err)
      return
    }

    // 启动监听
    const server = appInstance.listen(port, host, () => {
      console.log(`[Express] 服务器已启动: http://${host}:${port}`)
      console.log(`[Express] 静态文件目录: ${path.join(process.cwd(), 'dist')}`)
      resolve()
    })

    server.on('error', (err: Error) => {
      console.error('[Express] 服务器启动失败:', err)
      reject(err)
    })
  })
}

/**
 * 获取 Express 应用实例
 */
export function getApp(): Express {
  if (!app) {
    throw new Error('Express 应用未创建，请先调用 createApp()')
  }
  return app
}
