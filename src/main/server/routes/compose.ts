/**
 * Compose 发推路由
 * 挂载在 /api/v1/compose
 *
 * 接口：
 * - POST /api/v1/compose/open → 打开指定窗口的发推页面并填入文案
 *   Body: { profileId: number, text: string }
 */

import { Router, Request, Response } from 'express'
import { CDPDriver } from '../../automation/cdp-driver'

const router = Router()

/**
 * POST /api/v1/compose/open
 * 用指定窗口打开发推页面，填入文案，让用户手动发布
 */
router.post('/open', async (req: Request, res: Response) => {
  try {
    const { profileId, text } = req.body

    if (!profileId || typeof profileId !== 'number') {
      res.status(400).json({ code: 400, data: null, message: '缺少 profileId 参数' })
      return
    }
    if (!text || typeof text !== 'string') {
      res.status(400).json({ code: 400, data: null, message: '缺少 text 参数' })
      return
    }

    const debugPort = 9000 + profileId
    const driver = new CDPDriver(debugPort)

    try {
      await driver.connect(15000)

      // 导航到发推页面
      await driver.navigate('https://x.com/compose/post', 5000)
      await driver.sleep(2000)

      // 等待编辑器出现并填入文案
      const editorFocused = await driver.evaluate(`
        (function() {
          const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
          if (!editor) {
            // 尝试其他可能的编辑器
            const alt = document.querySelector('div[contenteditable="true"][role="textbox"]');
            if (!alt) return false;
            alt.focus();
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            return true;
          }
          editor.focus();
          document.execCommand('insertText', false, ${JSON.stringify(text)});
          return true;
        })()
      `)

      driver.disconnect()

      res.json({
        code: 0,
        data: { filled: !!editorFocused },
        message: editorFocused ? '已打开发推页面并填入文案' : '已打开发推页面，但未能自动填入文案'
      })
    } catch (err: any) {
      driver.disconnect()
      throw err
    }
  } catch (err: any) {
    res.status(500).json({
      code: 500,
      data: null,
      message: err.message || String(err)
    })
  }
})

export default router