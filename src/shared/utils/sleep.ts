/**
 * 延迟工具函数
 * 支持固定延迟和随机范围延迟
 */

/**
 * 延迟指定时间（毫秒），支持随机范围
 * @param min 最小延迟毫秒数
 * @param max 最大延迟毫秒数（可选，不传则等于 min）
 * @returns Promise<void>
 */
export function sleep(min: number, max?: number): Promise<void> {
  const actualMax = max ?? min
  const ms = Math.floor(Math.random() * (actualMax - min + 1)) + min
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 固定延迟（无随机）
 * @param ms 延迟毫秒数
 */
export function sleepFixed(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}