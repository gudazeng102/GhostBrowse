/**
 * 任务执行器（迭代 3.5）
 * 接收 TaskPlan → 通过 CDP 控制 Chrome 在 X 上执行
 */

import { CDPDriver } from './cdp-driver'
import { TaskPlan, TaskProgress, OperationType } from '../../shared/automation/task-types'
import { parsePositionPlan } from '../../shared/automation/position-plan'
import { sleepFixed, sleep } from '../../shared/utils/sleep'
import { Logger } from '../../shared/utils/logger'
import { TWITTER_SELECTORS } from '../../shared/platforms/twitter/selectors'
import { buildTwitterHomeUrl, buildTwitterFollowingUrl, buildTwitterUserUrl } from '../../shared/platforms/twitter/urls'
import { generateComment } from '../ai/comment-generator'

const logger = new Logger('TaskExecutor')

type SlotMap = Map<number, Set<OperationType>>

export interface TaskCallbacks {
  onProgress: (progress: TaskProgress) => void
  onLog: (message: string) => void
  onError: (error: string) => void
  onComplete: () => void
}

export async function executeTask(
  profileId: number,
  plan: TaskPlan,
  callbacks: TaskCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const debugPort = 9000 + profileId
  const driver = new CDPDriver(debugPort)

  const progress: TaskProgress = {
    processed: 0,
    total: plan.constraints.view_count || 10,
    liked: 0,
    retweeted: 0,
    commented: 0,
    stage: 'connecting'
  }
  callbacks.onProgress(progress)

  try {
    callbacks.onLog(`正在连接 Profile ${profileId} 的浏览器 (port ${debugPort})...`)
    await driver.connect(15000)
    callbacks.onLog('CDP 连接成功')
    progress.stage = 'navigating'
    callbacks.onProgress(progress)

    if (signal?.aborted) throw new Error('用户已暂停')

    await navigateToStart(driver, plan, callbacks)
    if (signal?.aborted) throw new Error('用户已暂停')

    let slotMap: SlotMap | null = null
    if (plan.constraints.position_plan) {
      slotMap = parsePositionPlan(plan.constraints.position_plan) as SlotMap
      callbacks.onLog(`位置计划已解析: ${plan.constraints.position_plan}`)
    }

    progress.stage = 'executing'
    callbacks.onProgress(progress)
    await executeOperations(driver, plan, slotMap, progress, callbacks, signal)

    progress.stage = 'done'
    callbacks.onProgress(progress)
    callbacks.onLog('任务执行完毕')
    callbacks.onComplete()
  } catch (err: any) {
    if (signal?.aborted || err.message === '用户已暂停') {
      progress.stage = 'paused'
      callbacks.onProgress(progress)
      callbacks.onLog('任务已暂停')
    } else {
      progress.stage = 'error'
      progress.error = err.message
      callbacks.onProgress(progress)
      callbacks.onError(err.message)
    }
  } finally {
    driver.disconnect()
  }
}

async function navigateToStart(driver: CDPDriver, plan: TaskPlan, callbacks: TaskCallbacks): Promise<void> {
  let url: string
  switch (plan.action) {
    case 'home_warming':
      url = buildTwitterHomeUrl()
      callbacks.onLog('导航到 X 首页...')
      break
    case 'following_warming':
      url = buildTwitterFollowingUrl()
      callbacks.onLog('导航到 X 关注页...')
      break
    case 'targeted_interaction':
      if (plan.target_accounts.length > 0) {
        url = buildTwitterUserUrl(plan.target_accounts[0])
        callbacks.onLog(`导航到 @${plan.target_accounts[0]} 的主页...`)
      } else {
        url = buildTwitterHomeUrl()
        callbacks.onLog('无目标账号，导航到首页...')
      }
      break
    default:
      url = buildTwitterHomeUrl()
      callbacks.onLog('导航到 X 首页...')
  }

  await driver.navigate(url, 3000)
  const found = await driver.waitForSelector(TWITTER_SELECTORS.item, 10000)
  callbacks.onLog(found ? '推文已加载' : '未检测到推文，可能需要登录')
}

async function executeOperations(
  driver: CDPDriver,
  plan: TaskPlan,
  slotMap: SlotMap | null,
  progress: TaskProgress,
  callbacks: TaskCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const maxView = plan.constraints.view_count || 10
  const maxLike = plan.constraints.like_count || 0
  const startTime = Date.now()
  const durationMs = plan.duration_minutes * 60 * 1000

  let likeBudget = maxLike
  let commentBudget = slotMap
    ? [...slotMap.values()].reduce((sum, ops) => ops.has('comment') ? sum + 1 : sum, 0)
    : 0

  if (plan.operations.includes('comment') && !slotMap) {
    commentBudget = Math.min(3, Math.floor(maxView / 3))
  }

  callbacks.onLog(`开始执行: 目标浏览 ${maxView}, 点赞 ${maxLike}, 评论 ${commentBudget}`)

  // 在浏览器内安装"已处理"标记系统：用 WeakSet 给每条 article 打标
  // 不依赖 :nth-of-type，避免 X 的 virtualize（动态增删 DOM）干扰
  await driver.evaluate(`
    if (!window.__gbMarkers) {
      window.__gbMarkers = { processed: new WeakSet() };
    }
  `)

  let logicalIndex = 0
  let consecutiveEmpty = 0

  while (true) {
    if (signal?.aborted) throw new Error('用户已暂停')
    if (durationMs === 0 && progress.processed >= maxView) break
    if (durationMs > 0 && Date.now() - startTime >= durationMs) break

    // 找到第一条未处理的推文，标记并滚到视口中央
    const found = await driver.evaluate(`
      (function() {
        const sel = ${JSON.stringify(TWITTER_SELECTORS.item)};
        const items = document.querySelectorAll(sel);
        if (!items.length) return { count: 0, found: false };
        // 清掉上一条的 data-gb-current
        document.querySelectorAll('[data-gb-current="1"]').forEach(el => el.removeAttribute('data-gb-current'));
        for (let i = 0; i < items.length; i++) {
          const el = items[i];
          if (window.__gbMarkers.processed.has(el)) continue;
          window.__gbMarkers.processed.add(el);
          el.setAttribute('data-gb-current', '1');
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          return { count: items.length, found: true };
        }
        return { count: items.length, found: false };
      })()
    `) as { count: number; found: boolean }

    if (!found || found.count === 0) {
      callbacks.onLog('当前无可见推文，等待加载...')
      await sleepFixed(2000)
      consecutiveEmpty++
      if (consecutiveEmpty >= 5) { callbacks.onLog('连续多次无可见推文，结束'); break }
      continue
    }

    if (!found.found) {
      callbacks.onLog('视口推文已全部处理，向下滚动加载更多...')
      // 多滚一些避免 X 没加载新内容
      await driver.evaluate('window.scrollBy(0, window.innerHeight * 1.2)')
      await sleepFixed(2500)
      consecutiveEmpty++
      if (consecutiveEmpty >= 5) { callbacks.onLog('连续多次未找到新推文，结束'); break }
      continue
    }

    consecutiveEmpty = 0

    // 滚动稳定 + 渲染按钮
    await sleepFixed(800)

    logicalIndex++
    const ops = getOperationsForPosition(logicalIndex, slotMap, plan, likeBudget, commentBudget)
    callbacks.onLog(`[第 ${logicalIndex} 条] 操作: ${ops.join(', ') || '仅浏览'}`)

    const tweetSelector = `${TWITTER_SELECTORS.item}[data-gb-current="1"]`

    for (const op of ops) {
      if (signal?.aborted) throw new Error('用户已暂停')
      try {
        switch (op) {
          case 'like':
            if (likeBudget > 0) { await doLike(driver, tweetSelector, callbacks); likeBudget--; progress.liked++ }
            break
          case 'retweet':
            await doRetweet(driver, tweetSelector, callbacks); progress.retweeted++
            break
          case 'comment':
            if (commentBudget > 0) { await doComment(driver, plan, tweetSelector, callbacks); commentBudget--; progress.commented++ }
            break
          case 'follow':
            await doFollow(driver, tweetSelector, callbacks)
            break
        }
      } catch (err) { callbacks.onError(`[第 ${logicalIndex} 条] ${op} 失败: ${err.message}`) }
      await sleep(1000, 3000)
    }

    progress.processed++
    callbacks.onProgress(progress)

    // 处理完后再小幅滚动，让下一条进入视口
    await driver.evaluate('window.scrollBy(0, window.innerHeight * 0.5)')
    await sleep(2000, 4000)
  }

  if (plan.pause_after) {
    callbacks.onLog('任务执行完毕，按计划暂停（浏览器保持打开）')
  }
}

function getOperationsForPosition(
  position: number, slotMap: SlotMap | null, plan: TaskPlan, likeBudget: number, commentBudget: number
): OperationType[] {
  const ops: OperationType[] = ['view']
  if (slotMap) {
    const slot = slotMap.get(position)
    if (slot) for (const op of slot) { if (op !== 'view') ops.push(op) }
    return ops
  }
  const maxView = plan.constraints.view_count || 10
  if (plan.operations.includes('like') && likeBudget > 0) {
    const stride = Math.max(1, Math.floor(maxView / (plan.constraints.like_count || 1)))
    if (position % stride === 1) ops.push('like')
  }
  if (plan.operations.includes('comment') && commentBudget > 0) {
    const stride = Math.max(1, Math.floor(maxView / 3))
    if (position % stride === 0 && position > 0) ops.push('comment')
  }
  return ops
}

async function doLike(driver: CDPDriver, tweetSelector: string, callbacks: TaskCallbacks): Promise<void> {
  const result = await driver.evaluate(`
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return { ok: false, reason: 'tweet_not_found' };
      const btn = tweet.querySelector('button[data-testid="like"]');
      if (!btn) {
        const unlike = tweet.querySelector('button[data-testid="unlike"]');
        if (unlike) return { ok: true, already: true };
        return { ok: false, reason: 'button_not_found' };
      }
      btn.click();
      return { ok: true };
    })()
  `) as { ok: boolean; already?: boolean; reason?: string }
  if (result.ok) { callbacks.onLog(result.already ? '已点赞过' : '❤️ 已点赞') }
  else { callbacks.onLog('未找到点赞按钮，跳过') }
}

async function doRetweet(driver: CDPDriver, tweetSelector: string, callbacks: TaskCallbacks): Promise<void> {
  const opened = await driver.evaluate(`
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return { ok: false };
      const btn = tweet.querySelector('button[data-testid="retweet"]');
      if (!btn) {
        const unret = tweet.querySelector('button[data-testid="unretweet"]');
        if (unret) return { ok: true, already: true };
        return { ok: false };
      }
      btn.click();
      return { ok: true };
    })()
  `) as { ok: boolean; already?: boolean }
  if (!opened.ok) { callbacks.onLog('未找到转推按钮，跳过'); return }
  if (opened.already) { callbacks.onLog('已转推过'); return }
  await sleepFixed(800)
  const confirmed = await driver.evaluate(`
    (function() {
      const c = document.querySelector('div[data-testid="retweetConfirm"]');
      if (!c) return { ok: false };
      c.click();
      return { ok: true };
    })()
  `) as { ok: boolean }
  callbacks.onLog(confirmed.ok ? '🔁 已转推' : '未找到转推确认按钮')
}

async function doComment(driver: CDPDriver, plan: TaskPlan, tweetSelector: string, callbacks: TaskCallbacks): Promise<void> {
  const tweetText = await driver.evaluate(`
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return '';
      const t = tweet.querySelector('div[data-testid="tweetText"]');
      return t ? t.innerText : '';
    })()
  `) as string
  if (!tweetText) { callbacks.onLog('推文文本为空，跳过评论'); return }

  callbacks.onLog('正在为推文生成评论...')
  const result = await generateComment(tweetText, { platformId: plan.platform || 'twitter' })
  callbacks.onLog('AI 评论: ' + result.comment)

  const opened = await driver.evaluate(`
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return { ok: false };
      const btn = tweet.querySelector('button[data-testid="reply"]');
      if (!btn) return { ok: false };
      btn.click();
      return { ok: true };
    })()
  `) as { ok: boolean }
  if (!opened.ok) { callbacks.onLog('未找到回复按钮'); return }
  await sleepFixed(1500)

  const inputOk = await driver.evaluate(`
    (function() {
      const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
      if (!editor) return { ok: false };
      editor.focus();
      document.execCommand('insertText', false, ${JSON.stringify(result.comment)});
      return { ok: true };
    })()
  `) as { ok: boolean }
  if (!inputOk.ok) { callbacks.onLog('评论输入失败'); return }
  await sleepFixed(1000)

  const submitted = await driver.evaluate(`
    (function() {
      const btn = document.querySelector('button[data-testid="tweetButton"]');
      if (!btn || btn.disabled) return { ok: false };
      btn.click();
      return { ok: true };
    })()
  `) as { ok: boolean }
  callbacks.onLog(submitted.ok ? '💬 评论已发送' : '评论发送按钮不可用')
  await sleepFixed(2000)
}

async function doFollow(driver: CDPDriver, tweetSelector: string, callbacks: TaskCallbacks): Promise<void> {
  const result = await driver.evaluate(`
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return { ok: false };
      const btn = tweet.querySelector('button[data-testid$="-follow"]');
      if (!btn) return { ok: false };
      btn.click();
      return { ok: true };
    })()
  `) as { ok: boolean }
  callbacks.onLog(result.ok ? '➕ 已关注' : '未找到关注按钮')
}
