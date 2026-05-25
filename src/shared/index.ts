/**
 * GhostBrowse Shared Layer
 * 纯逻辑层，可在 main / renderer / extension content-script 中复用
 *
 * 用法:
 *   import { detectLanguage, parsePositionPlan, TwitterPlatform } from '@/shared'
 */

export * from './utils'
export * from './ai'
export * from './automation'
export * from './platforms'