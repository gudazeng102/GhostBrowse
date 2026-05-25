import { describe, it, expect } from 'vitest'
import { extractValidJSON } from '../json-extractor'

describe('extractValidJSON', () => {
  it('null/empty 返回 null', () => {
    expect(extractValidJSON(null)).toBeNull()
    expect(extractValidJSON(undefined)).toBeNull()
    expect(extractValidJSON('')).toBeNull()
  })

  it('提取纯 JSON', () => {
    const text = '{"action":"home_warming","duration_minutes":5}'
    const result = extractValidJSON(text)
    expect(result).toEqual({ action: 'home_warming', duration_minutes: 5 })
  })

  it('提取被前缀包裹的 JSON', () => {
    const text = '好的，输出：{"action":"home_warming"}'
    expect(extractValidJSON(text)).toEqual({ action: 'home_warming' })
  })

  it('提取被代码块包裹的 JSON', () => {
    const text = '```json\n{"action":"targeted_interaction","target_accounts":["a"]}\n```'
    const result = extractValidJSON(text)
    expect(result?.action).toBe('targeted_interaction')
    expect(result?.target_accounts).toEqual(['a'])
  })

  it('嵌套对象正确配对花括号', () => {
    const text = '{"action":"x","constraints":{"view_count":5,"nested":{"a":1}}}'
    const result = extractValidJSON(text)
    expect(result?.constraints?.nested?.a).toBe(1)
  })

  it('字符串内的花括号不影响配对', () => {
    const text = '{"action":"x","msg":"hello {world}"}'
    const result = extractValidJSON(text)
    expect(result?.msg).toBe('hello {world}')
  })

  it('字符串内的转义引号正确处理', () => {
    const text = '{"action":"x","msg":"say \\"hi\\""}'
    const result = extractValidJSON(text)
    expect(result?.msg).toBe('say "hi"')
  })

  it('多个 JSON 取第一个含 requireKey 的', () => {
    const text = '{"foo":1} junk {"action":"x"} {"action":"y"}'
    const result = extractValidJSON(text)
    expect(result?.action).toBe('x')
  })

  it('自定义 requireKey', () => {
    const text = '{"comment":"hi"}'
    const result = extractValidJSON(text, { requireKey: 'comment' })
    expect(result?.comment).toBe('hi')
  })

  it('不含 requireKey 的 JSON 返回 null', () => {
    const text = '{"foo":1,"bar":2}'
    expect(extractValidJSON(text, { requireKey: 'action' })).toBeNull()
  })

  it('损坏 JSON 返回 null', () => {
    const text = '{"action":"x", invalid}'
    expect(extractValidJSON(text)).toBeNull()
  })

  it('从 thinking 文本中提取（模拟 Qwen3 输出）', () => {
    const text = `好的，我现在分析一下用户的需求。
用户要执行的是 home_warming 任务。
最终输出：
{"action":"home_warming","target_accounts":[],"operations":["like"],"constraints":{"view_count":10,"like_count":3,"selective":true},"duration_minutes":0,"pause_after":false}
完成。`
    const result = extractValidJSON(text)
    expect(result?.action).toBe('home_warming')
    expect(result?.constraints?.view_count).toBe(10)
  })
})