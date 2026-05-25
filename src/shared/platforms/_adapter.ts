/**
 * 平台适配器接口
 *
 * 每个支持的社交平台（Twitter、YouTube、Reddit 等）需实现此接口
 * 主流程通过此接口与具体平台解耦
 */

import { OperationType } from '../automation/task-types'
import { LanguageInfo } from '../ai/language-detector'

/** 平台 DOM 选择器 */
export interface PlatformSelectors {
  /** 帖子/视频/推文容器 */
  item: string
  /** 点赞按钮 */
  like: string
  /** 转发/分享按钮 */
  retweet?: string
  /** 转发确认按钮（弹窗内） */
  retweetConfirm?: string
  /** 取消转发的指示元素（用于检测是否成功） */
  retweetUndo?: string
  /** 评论/回复按钮 */
  reply: string
  /** 评论输入框 */
  commentInput: string
  /** 评论提交按钮 */
  commentSubmit: string
  /** 关注/订阅按钮 */
  follow?: string
  /** 搜索框 */
  searchInput?: string
}

/** 平台适配器 */
export interface PlatformAdapter {
  /** 平台标识 */
  id: string
  /** 平台显示名 */
  displayName: string
  /** 匹配的 hostname 列表（用于 content-script 识别） */
  hostnames: string[]
  /** DOM 选择器 */
  selectors: PlatformSelectors
  /** 该平台支持的操作类型 */
  supportedOps: OperationType[]
  /** 构造用户主页 URL */
  buildUserUrl(username: string): string
  /** 构造搜索 URL */
  buildSearchUrl(query: string): string
  /** 构造首页 URL */
  buildHomeUrl(): string
  /** 根据语言生成回复指令（可覆盖默认） */
  getReplyInstruction?(lang: LanguageInfo): string
  /** 清洗 AI 生成的评论 */
  cleanComment(raw: string, lang: LanguageInfo): string
}