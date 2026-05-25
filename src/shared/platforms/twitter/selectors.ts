/**
 * Twitter / X 的 DOM 选择器集合
 * 集中管理便于 X 改版时统一维护
 */

import { PlatformSelectors } from '../_adapter'

export const TWITTER_SELECTORS: PlatformSelectors = {
  item: 'article[data-testid="tweet"]',
  like: '[data-testid="like"]',
  retweet: '[data-testid="retweet"]',
  retweetConfirm: '[data-testid="retweetConfirm"]',
  retweetUndo: '[data-testid="unretweet"]',
  reply: '[data-testid="reply"]',
  commentInput: 'div[data-testid="tweetTextarea_0"], div[contenteditable="true"][role="textbox"]',
  commentSubmit: 'button[data-testid="tweetButton"]',
  follow: '[data-testid$="-follow"]',
  searchInput: 'input[data-testid="SearchBox_Search_Input"]'
}

/** 转发确认按钮的多语言文本兜底（仅在 [role="dialog"] 内匹配） */
export const RETWEET_CONFIRM_TEXTS = ['Retweet', 'Repost', '转发', '轉發', '转推']