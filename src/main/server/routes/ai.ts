/**
 * AI 服务路由
 * 挂载在 /api/v1/ai
 *
 * 接口：
 * - GET  /health         → Ollama 连通性 + 模型可用性
 * - POST /parse-command  → 自然语言 → TaskPlan
 * - POST /generate-comment → 推文文本 → 评论
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
 * POST /api/v1/ai/generate-comment
 * 根据推文内容生成评论
 *
 * Body: { text: string, platformId?: string, taskId?: string, forceEmoji?: boolean }
 */
router.post('/generate-comment', async (req: Request, res: Response) => {
  try {
    const { text, platformId, taskId, forceEmoji } = req.body
    if (!text || typeof text !== 'string') {
      res.status(400).json({
        code: 400,
        data: null,
        message: '缺少 text 参数'
      })
      return
    }

    const result = await aiService.generateComment(text, {
      platformId: platformId || 'twitter',
      taskId,
      forceEmoji: forceEmoji === true
    })

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

export default router