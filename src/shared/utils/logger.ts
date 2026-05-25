/**
 * 通用日志工具
 * 支持多种日志级别 + 可注入回调（用于将日志推送到 UI）
 */

export type LogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error'

export interface LogEntry {
  time: number
  level: LogLevel
  message: string
  meta?: Record<string, any>
}

export type LogHandler = (entry: LogEntry) => void

export class Logger {
  private handlers: LogHandler[] = []
  private prefix: string

  constructor(prefix: string = '') {
    this.prefix = prefix
  }

  /** 添加一个日志处理器 */
  addHandler(handler: LogHandler): void {
    this.handlers.push(handler)
  }

  /** 移除一个日志处理器 */
  removeHandler(handler: LogHandler): void {
    const idx = this.handlers.indexOf(handler)
    if (idx !== -1) this.handlers.splice(idx, 1)
  }

  /** 清空所有处理器 */
  clearHandlers(): void {
    this.handlers = []
  }

  private emit(level: LogLevel, message: string, meta?: Record<string, any>): void {
    const finalMessage = this.prefix ? `[${this.prefix}] ${message}` : message
    const entry: LogEntry = {
      time: Date.now(),
      level,
      message: finalMessage,
      meta
    }
    for (const handler of this.handlers) {
      try {
        handler(entry)
      } catch (e) {
        // 处理器异常不影响主流程
      }
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.emit('debug', message, meta)
  }

  info(message: string, meta?: Record<string, any>): void {
    this.emit('info', message, meta)
  }

  success(message: string, meta?: Record<string, any>): void {
    this.emit('success', message, meta)
  }

  warning(message: string, meta?: Record<string, any>): void {
    this.emit('warning', message, meta)
  }

  error(message: string, meta?: Record<string, any>): void {
    this.emit('error', message, meta)
  }

  /** 创建带 prefix 的子 Logger，共享 handlers */
  child(subPrefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix
    const child = new Logger(childPrefix)
    // 共享 handlers 引用
    child.handlers = this.handlers
    return child
  }
}

/** 创建一个简单的 console 处理器 */
export function consoleLogHandler(): LogHandler {
  const colors: Record<LogLevel, string> = {
    debug: '\x1b[90m',
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m'
  }
  const reset = '\x1b[0m'
  return (entry: LogEntry) => {
    const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })
    const color = colors[entry.level] || ''
    // eslint-disable-next-line no-console
    console.log(`${color}[${time}] [${entry.level.toUpperCase()}] ${entry.message}${reset}`)
  }
}