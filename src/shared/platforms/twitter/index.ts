/**
 * Twitter / X 平台适配器
 */

import { PlatformAdapter } from '../_adapter'
import { OperationType } from '../../automation/task-types'
import { LanguageInfo } from '../../ai/language-detector'
import { TWITTER_SELECTORS } from './selectors'
import { buildTwitterUserUrl, buildTwitterSearchUrl, buildTwitterHomeUrl } from './urls'
import { cleanTwitterComment } from './comment-cleaner'

const TWITTER_OPS: OperationType[] = ['like', 'retweet', 'comment', 'view', 'follow']

export const TwitterPlatform: PlatformAdapter = {
  id: 'twitter',
  displayName: 'Twitter / X',
  hostnames: ['twitter.com', 'x.com', 'mobile.twitter.com', 'mobile.x.com'],
  selectors: TWITTER_SELECTORS,
  supportedOps: TWITTER_OPS,

  buildUserUrl: buildTwitterUserUrl,
  buildSearchUrl: buildTwitterSearchUrl,
  buildHomeUrl: buildTwitterHomeUrl,

  cleanComment(raw: string, lang: LanguageInfo): string {
    const result = cleanTwitterComment(raw, lang)
    return result.comment
  }
}

// 重导出便于直接使用
export { TWITTER_SELECTORS, RETWEET_CONFIRM_TEXTS } from './selectors'
export {
  buildTwitterUserUrl,
  buildTwitterSearchUrl,
  buildTwitterHomeUrl,
  buildTwitterFollowingUrl,
  buildTwitterExploreUrl
} from './urls'
export { cleanTwitterComment } from './comment-cleaner'
export type { CleanCommentResult } from './comment-cleaner'