/**
 * AI 服务路由
 * 挂载在 /api/v1/ai
 *
 * 接口：
 * - GET  /health         → Ollama 连通性 + 模型可用性
 * - POST /parse-command  → 自然语言 → TaskPlan
 * - POST /cancel/:taskId → 取消正在进行的 AI 任务
 * - POST /raw-generate   → 原始 Ollama 调用（调试用）
 */

import { Router, Request, Response } from 'express'
import { aiService } from '../../ai'

const router = Router()

/**
 * GET /api/v1/ai/health
 * 检查 Ollama 连通性
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const result = await aiService.healthCheck()
    res.json({
      code: 0,
      data: result,
      message: 'success'
    })
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || String(err)
    })
  }
})

/**
 * POST /api/v1/ai/parse-command
 * 解析用户自然语言指令为 TaskPlan
 *
 * Body: { command: string, platformId?: string, taskId?: string }
 */
router.post('/parse-command', async (req: Request, res: Response) => {
  try {
    const { command, platformId, taskId } = req.body
    if (!command || typeof command !== 'string') {
      res.status(400).json({
        code: 400,
        data: null,
        message: '缺少 command 参数'
      })
      return
    }

    const result = await aiService.parseCommand(command, {
      platformId: platformId || 'twitter',
      taskId
    })

    res.json({
      code: 0,
      data: result,
      message: 'success'
    })
  } catch (err: any) {
    const status = err.name === 'RetryExhaustedError' ? 504 : 500
    res.status(status).json({
      code: status,
      data: null,
      message: err.message || String(err)
    })
  }
})

/**
 * POST /api/v1/ai/cancel/:taskId
 * 取消正在进行的 AI 任务
 */
router.post('/cancel/:taskId', (req: Request, res: Response) => {
  const taskId = String(req.params.taskId)
  const cancelled = aiService.cancelTask(taskId)
  res.json({
    code: 0,
    data: { cancelled },
    message: cancelled ? '任务已取消' : '任务不存在或已完成'
  })
})

/**
 * POST /api/v1/ai/raw-generate
 * 原始 Ollama 调用（调试用）
 *
 * Body: { prompt: string, model?: string }
 */
router.post('/raw-generate', async (req: Request, res: Response) => {
  try {
    const { prompt, model } = req.body
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({
        code: 400,
        data: null,
        message: '缺少 prompt 参数'
      })
      return
    }

    const result = await aiService.rawGenerate(prompt, model)
    res.json({
      code: 0,
      data: {
        content: result.content,
        thinking: result.thinking,
        duration: result.duration
      },
      message: 'success'
    })
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || String(err)
    })
  }
})

// ==================== 迭代 3.5: 任务执行 ====================

import { executeTask, TaskCallbacks } from '../../automation/task-executor'
import { TaskPlan, TaskProgress } from '../../../shared/automation/task-types'

/** 运行中的任务 */
const runningTasks = new Map<string, { abortController: AbortController; logs: string[] }>()

/**
 * POST /api/v1/ai/execute
 * 在指定 Profile 的浏览器中执行 TaskPlan
 *
 * Body: { profileId: number, plan: TaskPlan }
 * 返回: { taskId: string }
 *
 * 进度通过 SSE（Server-Sent Events）推送到 /api/v1/ai/execute/:taskId/events
 */
router.post('/execute', async (req: Request, res: Response) => {
  const { profileId, plan } = req.body as { profileId?: number; plan?: TaskPlan }

  if (!profileId || !plan) {
    res.status(400).json({ code: 400, data: null, message: '缺少 profileId 或 plan' })
    return
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const abortController = new AbortController()

  runningTasks.set(taskId, { abortController, logs: [] })

  // 异步执行（不阻塞 HTTP 响应）
  const callbacks: TaskCallbacks = {
    onProgress: (progress: TaskProgress) => {
      // 存储最新进度供 SSE 轮询
      const task = runningTasks.get(taskId)
      if (task) {
        ;(task as any).progress = progress
      }
    },
    onLog: (message: string) => {
      const task = runningTasks.get(taskId)
      if (task) {
        task.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`)
        // 最多保留 200 条日志
        if (task.logs.length > 200) task.logs.shift()
      }
      console.log(`[TaskExecutor:${taskId}] ${message}`)
    },
    onError: (error: string) => {
      console.error(`[TaskExecutor:${taskId}] ERROR: ${error}`)
    },
    onComplete: () => {
      console.log(`[TaskExecutor:${taskId}] 任务完成`)
      // 5 分钟后清理
      setTimeout(() => runningTasks.delete(taskId), 5 * 60 * 1000)
    }
  }

  // 启动执行（fire-and-forget）
  executeTask(profileId, plan, callbacks, abortController.signal).catch(err => {
    console.error(`[TaskExecutor:${taskId}] 未捕获错误:`, err)
  })

  res.json({
    code: 0,
    data: { taskId },
    message: '任务已启动'
  })
})

/**
 * GET /api/v1/ai/execute/:taskId/status
 * 获取任务进度和日志
 */
router.get('/execute/:taskId/status', (req: Request<{ taskId: string }>, res: Response) => {
  const taskId = req.params.taskId
  const task = runningTasks.get(taskId)

  if (!task) {
    res.status(404).json({ code: 404, data: null, message: '任务不存在或已过期' })
    return
  }

  res.json({
    code: 0,
    data: {
      taskId,
      progress: (task as any).progress || null,
      logs: task.logs,
      running: !task.abortController.signal.aborted
    },
    message: 'success'
  })
})

/**
 * POST /api/v1/ai/execute/:taskId/abort
 * 中止任务
 */
router.post('/execute/:taskId/abort', (req: Request<{ taskId: string }>, res: Response) => {
  const taskId = req.params.taskId
  const task = runningTasks.get(taskId)

  if (!task) {
    res.status(404).json({ code: 404, data: null, message: '任务不存在' })
    return
  }

  task.abortController.abort()
  task.logs.push(`[${new Date().toLocaleTimeString()}] 用户手动中止`)

  res.json({
    code: 0,
    data: { canceled: true },
    message: '已发送中止信号'
  })
})

export default router
