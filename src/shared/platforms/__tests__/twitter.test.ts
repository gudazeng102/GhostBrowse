import { describe, it, expect } from 'vitest'
import { cleanTwitterComment } from '../twitter/comment-cleaner'
import { detectLanguage } from '../../ai/language-detector'
import { TwitterPlatform } from '../twitter/index'
import { getPlatformById, getPlatformByHostname, listPlatformIds } from '../index'
import { buildTwitterUserUrl, buildTwitterSearchUrl, buildTwitterHomeUrl } from '../twitter/urls'

describe('cleanTwitterComment', () => {
  const enLang = detectLanguage('hello')
  const zhLang = detectLanguage('你好')
  const jaLang = detectLanguage('こんにちは')

  it('正常文本原样返回', () => {
    const result = cleanTwitterComment('Great post!', enLang)
    expect(result.comment).toBe('Great post!')
    expect(result.rejected).toBe(false)
  })

  it('去除 Reply: 前缀', () => {
    const result = cleanTwitterComment('Reply: Nice one!', enLang)
    expect(result.comment).toBe('Nice one!')
  })

  it('去除中文回复前缀', () => {
    const result = cleanTwitterComment('回复：真好啊', zhLang)
    expect(result.comment).toBe('真好啊')
  })

  it('去除首尾引号', () => {
    const result = cleanTwitterComment('"hello world"', enLang)
    expect(result.comment).toBe('hello world')
  })

  it('换行变空格', () => {
    const result = cleanTwitterComment('line1\nline2', enLang)
    expect(result.comment).toBe('line1 line2')
  })

  it('JSON 包裹的评论被提取', () => {
    const result = cleanTwitterComment('{"comment":"nice"}', enLang)
    expect(result.comment).toBe('nice')
  })

  it('思考内容被拒绝', () => {
    const result = cleanTwitterComment('好的，我现在需要分析这条推文', zhLang)
    expect(result.rejected).toBe(true)
  })

  it('英文思考内容被拒绝', () => {
    const result = cleanTwitterComment('Okay, I need to think about this', enLang)
    expect(result.rejected).toBe(true)
  })

  it('think 标签被移除', () => {
    const result = cleanTwitterComment('ślaęmy analysis</thinkhello', enLang)
    expect(result.comment).toContain('hello')
  })

  it('中文超长裁剪到 25 字', () => {
    const long = '这是一条非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的评论'
    const result = cleanTwitterComment(long, zhLang)
    expect(result.comment.length).toBeLessThanOrEqual(25)
  })

  it('英文超长裁剪到 80 字', () => {
    const long = 'a'.repeat(200)
    const result = cleanTwitterComment(long, enLang)
    expect(result.comment.length).toBeLessThanOrEqual(80)
  })

  it('空输入返回 emoji', () => {
    const result = cleanTwitterComment('', enLang)
    expect(result.comment).toBeTruthy()
    expect(result.rejected).toBe(false)
  })
})

describe('TwitterPlatform', () => {
  it('id 为 twitter', () => {
    expect(TwitterPlatform.id).toBe('twitter')
  })

  it('支持 like/retweet/comment/view/follow', () => {
    expect(TwitterPlatform.supportedOps).toContain('like')
    expect(TwitterPlatform.supportedOps).toContain('retweet')
    expect(TwitterPlatform.supportedOps).toContain('comment')
    expect(TwitterPlatform.supportedOps).toContain('view')
  })

  it('buildUserUrl', () => {
    expect(TwitterPlatform.buildUserUrl('test')).toBe('https://x.com/test')
    expect(TwitterPlatform.buildUserUrl('@test')).toBe('https://x.com/test')
  })

  it('buildHomeUrl', () => {
    expect(TwitterPlatform.buildHomeUrl()).toBe('https://x.com/home')
  })

  it('cleanComment 委托到 cleanTwitterComment', () => {
    const lang = detectLanguage('hello')
    const result = TwitterPlatform.cleanComment('Nice!', lang)
    expect(result).toBe('Nice!')
  })

  it('hostnames 包含 x.com 和 twitter.com', () => {
    expect(TwitterPlatform.hostnames).toContain('x.com')
    expect(TwitterPlatform.hostnames).toContain('twitter.com')
  })
})

describe('platform registry', () => {
  it('getPlatformById', () => {
    expect(getPlatformById('twitter')).toBe(TwitterPlatform)
    expect(getPlatformById('nonexist')).toBeNull()
  })

  it('getPlatformByHostname', () => {
    expect(getPlatformByHostname('x.com')).toBe(TwitterPlatform)
    expect(getPlatformByHostname('twitter.com')).toBe(TwitterPlatform)
    expect(getPlatformByHostname('unknown.com')).toBeNull()
  })

  it('listPlatformIds', () => {
    expect(listPlatformIds()).toContain('twitter')
  })
})

describe('Twitter URLs', () => {
  it('buildTwitterUserUrl 去除 @', () => {
    expect(buildTwitterUserUrl('@user')).toBe('https://x.com/user')
    expect(buildTwitterUserUrl('user')).toBe('https://x.com/user')
  })

  it('buildTwitterSearchUrl', () => {
    const url = buildTwitterSearchUrl('test query')
    expect(url).toContain('search?q=')
    expect(url).toContain('f=user')
  })

  it('buildTwitterHomeUrl', () => {
    expect(buildTwitterHomeUrl()).toBe('https://x.com/home')
  })
})