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
import systemRouter from './routes/system'
import authRouter from './routes/auth'
import fingerprintRouter from './routes/fingerprint'
import cookieManagerRouter from './routes/cookie-manager'
import platformAccountRouter from './routes/platform-account'
import profileGroupRouter from './routes/profile-group'
import aiRouter from './routes/ai'
import taskQueueRouter from './routes/task-queue'
import { initScheduler } from '../automation/task-scheduler'

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

  // JSON Body 解析（提高 limit 以支持大体积 cookie_json 等字段）
  app.use(express.json({ limit: '50mb' }))

  // URL-encoded Body 解析
  app.use(express.urlencoded({ extended: true, limit: '50mb' }))

  // ==================== 静态文件服务 ====================
  // 开发模式：项目根目录/dist
  // 打包模式：app.getAppPath()/dist
  const isDev = process.env.NODE_ENV !== 'production'
  const distPath = isDev
    ? path.join(process.cwd(), 'dist')
    : path.join(process.cwd(), 'dist')
  
  // 迭代 8.0: 静态托管 resources/icons（供系统通知图标使用）
  // 开发模式指向 d:/GhostBrowse/resources/icons，打包模式指向 process.resourcesPath
  const iconsPath = isDev
    ? path.join(process.cwd(), 'resources', 'icons')
    : path.join(process.resourcesPath, 'icons')
  app.use('/icons', express.static(iconsPath))

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

  // ==================== Phase 1.7: 系统健康检查 API ====================
  app.use('/api/v1/system', systemRouter)

  // ==================== Phase 1.8: 用户认证 API ====================
  app.use('/api/v1/auth', authRouter)

  // ==================== Phase 2.0: 指纹检测 API ====================
  app.use('/api/v1/fingerprint', fingerprintRouter)

  // ==================== Phase 4.0: Cookie 管理 API（CDP 实时 Cookie） ====================
  app.use('/api/v1/cookie-manager', cookieManagerRouter)

  // ==================== Phase 4.0: 平台账号 API（Twitter/X 自动登录） ====================
  app.use('/api/v1/platform-accounts', platformAccountRouter)

  // ==================== Phase 5.0: 窗口分组 API ====================
  app.use('/api/v1/profile-groups', profileGroupRouter)

  // ==================== Phase 6.0: AI 服务 API ====================
  app.use('/api/v1/ai', aiRouter)

  // ==================== 迭代 4.0: 任务队列 API ====================
  app.use('/api/v1/tasks', taskQueueRouter)

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
      // 迭代 4.0: 初始化任务调度器（恢复崩溃前的 running 任务）
      initScheduler()
    } catch (err) {
      console.error('[Express] 数据库初始化失败:', err)
      reject(err)
      return
    }

    // 启动监听
    const server = appInstance.listen(port, host, () => {


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
