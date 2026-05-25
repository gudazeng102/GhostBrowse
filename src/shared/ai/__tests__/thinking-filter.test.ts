import { describe, it, expect } from 'vitest'
import { isThinkingContent, stripThinkingBlocks } from '../thinking-filter'

describe('isThinkingContent', () => {
  it('null/empty 返回 false', () => {
    expect(isThinkingContent(null)).toBe(false)
    expect(isThinkingContent('')).toBe(false)
    expect(isThinkingContent(undefined)).toBe(false)
  })

  it('正常评论不被误判', () => {
    expect(isThinkingContent('真好啊！')).toBe(false)
    expect(isThinkingContent('Cool!')).toBe(false)
    expect(isThinkingContent('🔥🔥🔥')).toBe(false)
    expect(isThinkingContent('面白いですね')).toBe(false)
  })

  it('中文思考内容被识别', () => {
    expect(isThinkingContent('好的，我现在需要分析用户的需求')).toBe(true)
    expect(isThinkingContent('用户希望我生成一条评论')).toBe(true)
    expect(isThinkingContent('让我分析一下这条推文')).toBe(true)
    expect(isThinkingContent('作为Twitter养号助手，我需要')).toBe(true)
  })

  it('英文思考内容被识别', () => {
    expect(isThinkingContent('Okay, I need to analyze the tweet')).toBe(true)
    expect(isThinkingContent('Let me think about this carefully')).toBe(true)
    expect(isThinkingContent('The user wants a reply')).toBe(true)
    expect(isThinkingContent('As an AI, I should')).toBe(true)
  })

  it('think 标签被识别', () => {
    expect(isThinkingContent('<think>some thinking</think>actual')).toBe(true)
  })

  it('日韩文思考内容', () => {
    expect(isThinkingContent('ユーザーは...と言っています')).toBe(true)
    expect(isThinkingContent('사용자가 원하는 것은')).toBe(true)
  })

  it('extraPatterns 自定义检测', () => {
    expect(isThinkingContent('特殊标记XYZ', { extraPatterns: ['特殊标记'] })).toBe(true)
  })

  it('caseSensitive=false 默认大小写不敏感', () => {
    expect(isThinkingContent('OKAY, I NEED TO')).toBe(true)
    expect(isThinkingContent('let me analyze this')).toBe(true)
  })
})

describe('stripThinkingBlocks', () => {
  it('移除单个 think 块', () => {
    const text = '<think>thinking...</think>hello'
    expect(stripThinkingBlocks(text)).toBe('hello')
  })

  it('移除多个 think 块', () => {
    const text = '<think>a</think>x<think>b</think>y'
    expect(stripThinkingBlocks(text)).toBe('xy')
  })

  it('多行 think 块', () => {
    const text = '<think>\nline1\nline2\n</think>\nresult'
    expect(stripThinkingBlocks(text)).toBe('result')
  })

  it('无 think 块原样返回', () => {
    expect(stripThinkingBlocks('plain text')).toBe('plain text')
  })

  it('空输入', () => {
    expect(stripThinkingBlocks('')).toBe('')
  })
})