/**
 * CDP 驱动器（迭代 3.5）
 * 通过 Chrome DevTools Protocol 控制浏览器
 * 
 * 职责：导航、执行 JS、等待元素、截图等
 * 基于 ws 库直连 CDP（与 cookie-manager.ts 同模式）
 */

import WebSocket from 'ws'
import http from 'http'
import { Logger } from '../../shared/utils/logger'

const logger = new Logger('CDPDriver')

interface CDPTarget {
  id: string
  type: string
  title: string | null
  url: string
  webSocketDebuggerUrl?: string
}

export class CDPDriver {
  private ws: WebSocket | null = null
  private cmdId = 0
  private pendingCmds = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  private debugPort: number

  constructor(debugPort: number) {
    this.debugPort = debugPort
  }

  /** 获取 debugPort */
  getDebugPort(): number {
    return this.debugPort
  }

  /**
   * 连接到 Chrome 的第一个 page target
   */
  async connect(timeoutMs = 10000): Promise<void> {
    const wsUrl = await this.getPageWsUrl(timeoutMs)
    await this.connectWs(wsUrl, timeoutMs)
    logger.info(`CDP 已连接: port=${this.debugPort}`)
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      // 清理所有 pending
      for (const [id, { reject, timer }] of this.pendingCmds) {
        clearTimeout(timer)
        reject(new Error('CDP disconnected'))
      }
      this.pendingCmds.clear()
      this.ws.close()
      this.ws = null
    }
  }

  /** 是否已连接 */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // ==================== CDP 命令 ====================

  /**
   * 导航到 URL
   */
  async navigate(url: string, waitMs = 2000): Promise<void> {
    // 只发送 navigation 命令，不重复 Page.enable
    // 加超时保护，防止 CDP 卡死导致整个循环停止
    try {
      await this.sendWithTimeout('Page.navigate', { url }, 10000)
    } catch (err: any) {
      // navigate 超时不影响后续命令
    }
    // 等待页面基本加载
    await this.sleep(waitMs)
  }

  /**
   * 带超时的 send，避免 CDP 卡死整个流程
   */
  private async sendWithTimeout(method: string, params?: any, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP ${method} 超时 (${timeoutMs}ms)`))
      }, timeoutMs)
      this.send(method, params).then(v => { clearTimeout(timer); resolve(v) }).catch(e => { clearTimeout(timer); reject(e) })
    })
  }

  /**
   * 执行 JS 表达式并返回结果
   */
  async evaluate(expression: string, timeoutMs = 10000): Promise<any> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: timeoutMs
    }, timeoutMs + 2000)

    if (result?.exceptionDetails) {
      const desc = result.exceptionDetails?.exception?.description || JSON.stringify(result.exceptionDetails)
      throw new Error(`JS 执行错误: ${desc}`)
    }

    return result?.result?.value
  }

  /**
   * 执行 JS 并返回字符串
   */
  async evaluateString(expression: string, timeoutMs = 10000): Promise<string> {
    const val = await this.evaluate(expression, timeoutMs)
    return val !== undefined && val !== null ? String(val) : ''
  }

  /**
   * 等待页面上的选择器出现
   * @returns 是否在超时前找到
   */
  async waitForSelector(selector: string, timeoutMs = 15000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const found = await this.evaluate(`
        !!document.querySelector(${JSON.stringify(selector)})
      `)
      if (found) return true
      await this.sleep(500)
    }
    return false
  }

  /**
   * 点击元素（通过选择器）
   */
  async click(selector: string): Promise<boolean> {
    return await this.evaluate(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
      })()
    `)
  }

  /**
   * 滚动页面
   */
  async scroll(x: number, y: number): Promise<void> {
    await this.evaluate(`window.scrollTo(${x}, ${y})`)
  }

  /**
   * 获取当前 URL
   */
  async getCurrentUrl(): Promise<string> {
    return await this.evaluateString('window.location.href')
  }

  /**
   * 发送真实的按键（通过 CDP Input.dispatchKeyEvent）
   */
  async pressKey(key: string): Promise<void> {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 })
    await this.sleep(100)
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 })
  }

  /**
   * 等待一段时间
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.evaluateString('document.title')
  }

  // ==================== 底层 CDP 通信 ====================

  /**
   * 发送 CDP 命令
   */
  private send(method: string, params: object = {}, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('CDP 未连接'))
        return
      }

      const id = ++this.cmdId
      const msg = JSON.stringify({ id, method, params })

      const timer = setTimeout(() => {
        this.pendingCmds.delete(id)
        reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`))
      }, timeoutMs)

      this.pendingCmds.set(id, { resolve, reject, timer })
      this.ws.send(msg)
    })
  }

  /**
   * 获取 page target 的 WebSocket URL
   */
  private async getPageWsUrl(timeoutMs = 10000): Promise<string> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const targets = await this.fetchTargets()
        const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
        if (page?.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl
        }
      } catch {
        // 还没就绪，等一下
      }
      await this.sleep(1000)
    }
    throw new Error(`CDP page target 未就绪（等待 ${timeoutMs}ms）`)
  }

  /**
   * 获取 CDP targets
   */
  private fetchTargets(): Promise<CDPTarget[]> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${this.debugPort}/json`, (res) => {
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error('解析 CDP targets 失败'))
          }
        })
      })
      req.setTimeout(5000, () => {
        req.destroy()
        reject(new Error('CDP /json 请求超时'))
      })
      req.on('error', reject)
    })
  }

  /**
   * 建立 WebSocket 连接
   */
  private connectWs(wsUrl: string, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl)

      const onOpen = () => {
        this.ws!.off('error', onError)
        clearTimeout(timer)
        this.setupMessageHandler()
        resolve()
      }

      const onError = (err: Error) => {
        this.ws!.off('open', onOpen)
        clearTimeout(timer)
        this.ws = null
        reject(new Error(`CDP 连接失败: ${err.message}`))
      }

      const timer = setTimeout(() => {
        this.ws!.off('open', onOpen)
        this.ws!.off('error', onError)
        this.ws!.close()
        this.ws = null
        reject(new Error(`CDP 连接超时（${timeoutMs}ms）`))
      }, timeoutMs)

      this.ws.on('open', onOpen)
      this.ws.on('error', onError)
    })
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandler(): void {
    if (!this.ws) return

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id !== undefined && this.pendingCmds.has(msg.id)) {
          const { resolve, reject, timer } = this.pendingCmds.get(msg.id)!
          clearTimeout(timer)
          this.pendingCmds.delete(msg.id)

          if (msg.error) {
            reject(new Error(`CDP 错误: ${msg.error.message || JSON.stringify(msg.error)}`))
          } else {
            resolve(msg.result)
          }
        }
      } catch {
        // 忽略非 JSON 或事件消息
      }
    })

    this.ws.on('close', () => {
      logger.info('CDP WebSocket 已关闭')
      for (const [id, { reject, timer }] of this.pendingCmds) {
        clearTimeout(timer)
        reject(new Error('CDP 连接已断开'))
      }
      this.pendingCmds.clear()
    })

    this.ws.on('error', (err: Error) => {
      logger.error(`CDP WebSocket 错误: ${err.message}`)
    })
  }
}