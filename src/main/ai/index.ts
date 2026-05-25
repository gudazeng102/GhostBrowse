/**
 * AI 服务主进程入口
 *
 * 用法：
 *   import { aiService } from '@/main/ai'
 *   await aiService.parseCommand('去@user点赞5条')
 */

export { aiService } from './ai-service'
export type { HealthCheckResult } from './ai-service'
export type { ParseCommandResult } from './command-parser'
export type { GenerateCommentResult, GenerateCommentOptions } from './comment-generator'
export { loadAIConfig } from './config'
export type { AIConfig } from './config'