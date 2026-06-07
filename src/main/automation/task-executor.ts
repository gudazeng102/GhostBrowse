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
import { extractTweetFromElement, CHECK_LOGIN_CODE, EXTRACT_USER_PROFILE_CODE, EXTRACT_FOLLOWING_LIST_CODE, EXTRACT_SELF_HANDLE_CODE } from '../../shared/platforms/twitter/extractor'

const logger = new Logger('TaskExecutor')

type SlotMap = Map<number, Set<OperationType>>

export interface TaskCallbacks {
  onProgress: (progress: TaskProgress) => void
  onLog: (message: string) => void
  onError: (error: string) => void
  onComplete: () => void
  /** 迭代 5.0: 采集数据回调 */
  onData?: (type: string, data: string) => void
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

    // 迭代 5.0: 采集任务走独立路径
    if (plan.action === 'extraction' && plan.extraction) {
      await executeExtraction(driver, plan, progress, callbacks, signal)

      if (plan.return_to_home) {
        callbacks.onLog('操作完成，正在导航回首页...')
        await driver.navigate('https://x.com/home', 3000)
        await sleepFixed(1000)
        callbacks.onLog('已回到首页')
      }

      progress.stage = 'done'
      callbacks.onProgress(progress)
      callbacks.onLog('采集任务执行完毕')
      callbacks.onComplete()
      return
    }

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

    if (plan.return_to_home) {
      callbacks.onLog('操作完成，正在导航回首页...')
      await driver.navigate('https://x.com/home', 3000)
      await sleepFixed(1000)
      callbacks.onLog('已回到首页')
    }

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

/**
 * 迭代 5.0: 采集执行器
 * 先检查登录态，再导航到目标页，逐条提取推文数据
 */
async function executeExtraction(
  driver: CDPDriver,
  plan: TaskPlan,
  progress: TaskProgress,
  callbacks: TaskCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const extraction = plan.extraction!
  
  // Step 1: 检查登录态
  if (extraction.requireLogin && extraction.platform === 'twitter') {
    callbacks.onLog('检查 Twitter 登录态...')
    const loginCheck = await driver.evaluate(CHECK_LOGIN_CODE) as { loggedIn: boolean; isLoginPage: boolean }
    if (loginCheck.isLoginPage || !loginCheck.loggedIn) {
      callbacks.onLog('❌ Twitter 未登录，无法执行采集任务')
      throw new Error('Twitter 未登录，请先配置平台账号并启动登录后再试')
    }
    callbacks.onLog('✅ Twitter 已登录')

    // 提取当前登录窗口的 Twitter 用户名（用于后续 AI 分析时过滤自己）
    try {
      const selfHandle = await driver.evaluate(EXTRACT_SELF_HANDLE_CODE) as string
      if (selfHandle && selfHandle.length > 0 && callbacks.onData) {
        callbacks.onData('self_handle', JSON.stringify({ handle: selfHandle.replace(/^@/, '') }))
        callbacks.onLog(`👤 当前窗口登录账号: @${selfHandle.replace(/^@/, '')}`)
      }
    } catch (e: any) {
      callbacks.onLog(`⚠️ 获取当前登录账号失败: ${(e.message || '').substring(0, 50)}`)
    }
  }

  // Step 2: 根据目标类型导航
  const target = extraction.target
  let url = 'https://x.com/home'

  // 迭代 5.4: 采集指定用户的关注列表
  if (extraction.targetType === 'following') {
    const cleanTarget = target.replace(/^@/, '').trim()
    if (!cleanTarget) { callbacks.onLog('⚠️ 目标账号为空'); return }
    callbacks.onLog(`开始采集 @${cleanTarget} 的关注列表...`)

    // 导航到关注页
    await driver.navigate(`https://x.com/${cleanTarget}/following`, 3000)
    await sleepFixed(3000)

    // 关注列表不设上限，有多少采多少
    progress.total = 9999
    progress.collected = 0

    // 先滚动加载关注列表（不设 maxCount 限制）
    let consecutiveEmpty = 0
    let handles: string[] = []
    while (true) {
      if (signal?.aborted) throw new Error('用户已暂停')

      // 提取当前可见的关注用户
      const listJson = await driver.evaluate(EXTRACT_FOLLOWING_LIST_CODE).catch(() => '[]') as string
      let items: any[] = []
      try { items = JSON.parse(listJson) } catch {}

      if (items.length === 0) {
        callbacks.onLog('滚动加载更多关注用户...')
        await driver.evaluate('window.scrollBy(0, window.innerHeight * 1.5)')
        await sleepFixed(3000)
        consecutiveEmpty++
        if (consecutiveEmpty >= 5) { callbacks.onLog('⚠️ 已加载全部关注用户'); break }
        continue
      }

      consecutiveEmpty = 0
      const before = handles.length
      const seen = new Set(handles)
      for (const item of items) {
        if (item.handle && !seen.has(item.handle)) {
          seen.add(item.handle)
          handles.push(item.handle)
        }
      }
      const newCount = handles.length - before
      callbacks.onLog(`已发现 ${handles.length} 个关注用户`)

      // 本轮无新数据 → 滚动继续加载
      if (newCount === 0) {
        await driver.evaluate('window.scrollBy(0, window.innerHeight * 1.5)')
        await sleepFixed(3000)
        consecutiveEmpty++
        if (consecutiveEmpty >= 3) { callbacks.onLog('⚠️ 无更多关注用户'); break }
      }
    }

    callbacks.onLog(`共发现 ${handles.length} 个关注用户，开始逐个采集资料...`)
    progress.total = handles.length
    progress.collected = 0

    for (let i = 0; i < handles.length; i++) {
      if (signal?.aborted) throw new Error('用户已暂停')
      const account = handles[i]
      callbacks.onLog(`正在采集第 ${i + 1} 个（@${account}）...`)

      try {
        await driver.navigate(`https://x.com/${account}`, 3000)
        await driver.waitForSelector('div[data-testid="UserName"]', 8000).catch(() => {})
        await sleepFixed(2000)

        const dataJson = await driver.evaluate(EXTRACT_USER_PROFILE_CODE).catch(() => null) as string | null
        if (dataJson && callbacks.onData) {
          callbacks.onData('user_profile', dataJson)
        }
        progress.collected = i + 1
        progress.processed = i + 1
        callbacks.onLog(`✅ ${i + 1}/${handles.length}：${account}`)
        callbacks.onProgress(progress)
      } catch (err: any) {
        callbacks.onLog(`⚠️ @${account} 采集异常: ${(err.message || '').substring(0, 50)}`)
      }
      await sleepFixed(1000)
    }

    callbacks.onLog(`关注列表采集完成，共 ${progress.collected}/${handles.length} 个账号`)
    return
  }

  // 迭代 5.4: 用户信息采集 — 支持多账号逗号分隔
  if (extraction.targetType === 'user_profile') {
    // 拆分多个账号（支持中文逗号）
    const accounts = target.split(/[,，\n\r]+/).map(a => a.trim().replace(/^@/, '')).filter(Boolean)
    const totalAccounts = accounts.length
    progress.total = totalAccounts
    progress.collected = 0
    callbacks.onLog(`开始采集 ${totalAccounts} 个账号的用户信息...`)

    // 每个账号有单独的 30 秒超时，防止卡死
    for (let i = 0; i < accounts.length; i++) {
      if (signal?.aborted) throw new Error('用户已暂停')
      const account = accounts[i]
      const accountStartTime = Date.now()
      callbacks.onLog(`[${i + 1}/${totalAccounts}] 正在采集 @${account} 的信息...`)

      try {
        await driver.navigate(`https://x.com/${account}`, 3000)

        // 等 UserName 出现（8s 超时，不抛错）
        await driver.waitForSelector('div[data-testid="UserName"]', 8000).catch(() => {
          callbacks.onLog(`⚠️ @${account} 页面加载未完成，尝试提取...`)
        })

        // 固定等 2s 让页面渲染稳定（不依赖 accountStartTime）
        await sleepFixed(2000)

        // evaluate 本身自带 CDP 超时，不加额外 Promise.race
        const dataJson = await driver.evaluate(EXTRACT_USER_PROFILE_CODE)
          .catch(() => null) as string | null

        if (dataJson && callbacks.onData) {
          callbacks.onData('user_profile', dataJson)
          callbacks.onLog(`✅ 已采集 ${i + 1}/${totalAccounts}：${account}`)
        } else {
          callbacks.onLog(`⚠️ @${account} 提取数据为空，跳过`)
        }
      } catch (err: any) {
        callbacks.onLog(`⚠️ @${account} 采集异常: ${(err.message || String(err)).substring(0, 60)}`)
      }

      progress.collected = i + 1
      progress.processed = i + 1
      callbacks.onProgress(progress)
      await sleepFixed(1000)
    }
    callbacks.onLog(`用户信息采集完成，共 ${progress.collected}/${totalAccounts} 个账号`)
    return
  }

  // 原有逻辑：推文采集
  switch (extraction.targetType) {
    case 'tweet':
    case 'followers':
      const cleanTarget = target.replace(/^@/, '')
      url = `https://x.com/${cleanTarget}`
      break
    case 'hashtag_tweets':
      const tag = target.replace(/^#/, '')
      url = `https://x.com/hashtag/${tag}`
      break
    default:
      url = 'https://x.com/home'
  }
  callbacks.onLog(`导航到采集目标: ${url}`)
  await driver.navigate(url, 3000)
  await driver.waitForSelector(TWITTER_SELECTORS.item, 10000)
  callbacks.onLog('目标页面已加载')
  await sleepFixed(2000)

  // Step 3: 逐条采集推文
  const maxCount = extraction.maxCount || 100
  progress.total = maxCount
  progress.collected = 0
  callbacks.onLog(`开始采集，目标 ${maxCount} 条...`)

  let consecutiveEmpty = 0
  let noNewDataTime = Date.now()

  while (progress.collected! < maxCount) {
    if (signal?.aborted) throw new Error('用户已暂停')

    // 超时保护：超过 90 秒没有获取到新数据自动结束
    if (Date.now() - noNewDataTime > 90 * 1000) {
      callbacks.onLog('⏰ 超时未获取到新数据，采集结束')
      break
    }

    const found = await driver.evaluate(`
      (function() {
        var sel = ${JSON.stringify(TWITTER_SELECTORS.item)};
        var items = document.querySelectorAll(sel);
        if (!items.length) return false;
        document.querySelectorAll('[data-gb-current="1"]').forEach(function(e) { e.removeAttribute('data-gb-current'); });
        for (var i = 0; i < items.length; i++) {
          var el = items[i];
          var text = (el.querySelector('div[data-testid="tweetText"]') || {}).innerText || '';
          var key = text.substring(0, 80);
          if (window.__gbMarkers && window.__gbMarkers.processedTexts && window.__gbMarkers.processedTexts.has(key)) continue;
          if (!window.__gbMarkers) window.__gbMarkers = { processedTexts: new Set() };
          window.__gbMarkers.processedTexts.add(key);
          el.setAttribute('data-gb-current', '1');
          var rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) {
            el.scrollIntoView({ behavior: 'instant', block: 'start' });
          }
          return true;
        }
        return false;
      })()
    `) as boolean

    if (!found) {
      callbacks.onLog('当前无新推文，滚动加载更多...')
      await driver.evaluate('window.scrollBy(0, window.innerHeight * 1.5)')
      await sleepFixed(3000)
      consecutiveEmpty++
      // 也计入无数据超时（滚动后依然无新推文）
      if (consecutiveEmpty >= 3) { callbacks.onLog('⚠️ 连续多次滚动后无新推文，采集结束'); break }
      continue
    }

    consecutiveEmpty = 0
    callbacks.onLog(`正在采集第 ${progress.collected! + 1} 条...`)
    await sleepFixed(800)

    const tweetSelector = `${TWITTER_SELECTORS.item}[data-gb-current="1"]`
    const dataJson = await driver.evaluate(extractTweetFromElement(tweetSelector)) as string | null

    if (dataJson) {
      if (callbacks.onData) callbacks.onData('tweet', dataJson)
      progress.collected = (progress.collected || 0) + 1
      progress.processed = progress.collected
      callbacks.onLog(`📊 已采集 ${progress.collected}/${maxCount} 条`)
      callbacks.onProgress(progress)
      noNewDataTime = Date.now() // reset 超时计时器
    } else {
      // DOM 节点已消失或提取失败 -> 标记为已处理并跳过，防止死循环
      callbacks.onLog(`⚠️ 第 ${progress.collected! + 1} 条提取失败，标记已处理并跳过`)
      // 仍递增 collected，避免卡在最后一条上
      progress.collected = (progress.collected || 0) + 1
      progress.processed = progress.collected
      callbacks.onProgress(progress)
    }

    // 移除当前标记（防止后续同一元素残留 data-gb-current 干扰）
    await driver.evaluate(`document.querySelectorAll('[data-gb-current="1"]').forEach(function(e){ e.removeAttribute('data-gb-current') })`)
    await driver.pressKey('Escape')
    await sleepFixed(300)
    await driver.evaluate('window.scrollBy(0, window.innerHeight * 0.8)')
    await sleep(1000, 2000)
  }

  callbacks.onLog(`采集完成，共获取 ${progress.collected}/${maxCount} 条数据`)
}

/**
 * 迭代 8.0 rev3: 按 segments 执行，用文本哈希去重推进（不回滚）
 *
 * 核心：X 的虚拟滚动会复用 DOM 节点，DOM 索引（nextIdx）完全不可靠。
 * 改用文本哈希标记已处理推文，每轮扫描所有 items，跳过已处理的，
 * 只处理第一条未处理的。全部处理完就向下滚动加载新推文。
 */
async function executeSegments(
  driver: CDPDriver,
  plan: TaskPlan,
  progress: TaskProgress,
  callbacks: TaskCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const segments = plan.segments!

  for (let si = 0; si < segments.length; si++) {
    if (signal?.aborted) throw new Error('用户已暂停')
    const seg = segments[si] as any

    // 导航到首页（如果段标记了 navigate_home）
    if (seg.navigate_home) {
      callbacks.onLog('导航到首页...')
      await driver.navigate(buildTwitterHomeUrl(), 3000)
      await driver.waitForSelector(TWITTER_SELECTORS.item, 8000)
      callbacks.onLog('推文已加载')
      await sleepFixed(2000)
    }

    // 导航到指定账号（如果段标记了 target_account）
    if (seg.target_account) {
      const account = seg.target_account
      callbacks.onLog(`导航到 @${account} 的主页...`)
      await driver.navigate(buildTwitterUserUrl(account), 3000)
      await driver.waitForSelector(TWITTER_SELECTORS.item, 8000)
      callbacks.onLog('推文已加载')
      await sleepFixed(2000)
    }

    const start = seg.start || 1
    const end = seg.end || start
    const ops = seg.operations || ['view']
    let consecutiveEmpty = 0

    // 安装跨段去重标记（滚动后 DOM 改变仍可识别）
    await driver.evaluate(`
      if (!window.__gbMarkers) window.__gbMarkers = { processedTexts: new Set() };
    `)

    for (let pos = start; pos <= end; pos++) {
      if (signal?.aborted) throw new Error('用户已暂停')

      // 找到第一条未处理的推文（按文本哈希跳过已处理的）
      const found = await driver.evaluate(`
        (function() {
          var sel = ${JSON.stringify(TWITTER_SELECTORS.item)};
          var items = document.querySelectorAll(sel);
          if (!items.length) return false;
          document.querySelectorAll('[data-gb-current="1"]').forEach(function(e) { e.removeAttribute('data-gb-current'); });
          for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var text = (el.querySelector('div[data-testid="tweetText"]') || {}).innerText || '';
            var key = text.substring(0, 80);
            if (window.__gbMarkers.processedTexts.has(key)) continue;
            window.__gbMarkers.processedTexts.add(key);
            el.setAttribute('data-gb-current', '1');
            var rect = el.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
              el.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
            return true;
          }
          return false;
        })()
      `) as boolean

      if (!found) {
        callbacks.onLog('当前推文已全部处理，向下滚动加载更多...')
        await driver.evaluate('window.scrollBy(0, window.innerHeight * 1.5)')
        await sleepFixed(3000)
        consecutiveEmpty++
        if (consecutiveEmpty >= 5) { callbacks.onLog('连续多次无新推文，结束此段'); break }
        pos--
        continue
      }

      consecutiveEmpty = 0
      callbacks.onLog(`[第 ${pos} 条/${end}] 操作: ${ops.join(', ')}`)
      await sleepFixed(800)

      const tweetSelector = `${TWITTER_SELECTORS.item}[data-gb-current="1"]`

      for (const op of ops) {
        if (signal?.aborted) throw new Error('用户已暂停')
        try {
          switch (op) {
            case 'like':
              await doLike(driver, tweetSelector, callbacks); progress.liked++
              break
            case 'retweet':
              await doRetweet(driver, tweetSelector, callbacks); progress.retweeted++
              break
            case 'comment':
              await doComment(driver, plan, tweetSelector, callbacks); progress.commented++
              break
            case 'follow':
              await doFollow(driver, tweetSelector, callbacks)
              break
          }
        } catch (err: any) {
          callbacks.onError(`段${si + 1}[第${pos}条] ${op} 失败: ${err.message}`)
        }
        // 按操作类型区分间隔：点赞/转发/关注 +3s，评论 +5s
        if (op === 'comment') {
          await sleep(6000, 8000)
        } else {
          await sleep(4000, 6000)
        }
      }

      progress.processed++
      callbacks.onProgress(progress)

      // 关闭可能残留的弹窗（转推确认框 / 回复弹窗等），确保下一轮能正常获取推文
      await driver.pressKey('Escape')
      await sleepFixed(500)
      // 向下滚动，让下一条推文进视口（浏览 +2s）
      await driver.evaluate('window.scrollBy(0, window.innerHeight * 0.6)')
      await sleep(3000, 4000)
    }
  }

  callbacks.onLog('所有分段执行完毕')
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
    const hasOtherInteractions = plan.operations.some(op => op === 'like' || op === 'retweet' || op === 'follow')
    commentBudget = hasOtherInteractions ? Math.min(3, Math.ceil(maxView / 2)) : maxView
  }

  callbacks.onLog(`开始执行: 目标浏览 ${maxView}, 点赞 ${maxLike}, 评论 ${commentBudget}`)

  if (plan.segments && plan.segments.length > 0) {
    await executeSegments(driver, plan, progress, callbacks, signal)
    return
  }

  await driver.evaluate(`
    window.__gbMarkers = { processedIds: new Set(), processedTexts: new Set() };
  `)

  let logicalIndex = 0
  let consecutiveEmpty = 0

  while (true) {
    if (signal?.aborted) throw new Error('用户已暂停')
    if (durationMs === 0 && progress.processed >= maxView) break
    if (durationMs > 0 && Date.now() - startTime >= durationMs) break

    const found = await driver.evaluate(`
      (function() {
        const sel = ${JSON.stringify(TWITTER_SELECTORS.item)};
        const items = document.querySelectorAll(sel);
        if (!items.length) return { count: 0, found: false };
        document.querySelectorAll('[data-gb-current="1"]').forEach(el => el.removeAttribute('data-gb-current'));
        for (let i = 0; i < items.length; i++) {
          const el = items[i];
          const text = el.querySelector('div[data-testid="tweetText"]')?.innerText || '';
          const id = text.substring(0, 80);
          if (window.__gbMarkers.processedTexts.has(id)) continue;
          window.__gbMarkers.processedTexts.add(id);
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
      await driver.evaluate('window.scrollBy(0, window.innerHeight * 1.2)')
      await sleepFixed(2500)
      consecutiveEmpty++
      if (consecutiveEmpty >= 5) { callbacks.onLog('连续多次未找到新推文，结束'); break }
      continue
    }

    consecutiveEmpty = 0

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
      } catch (err: any) { callbacks.onError(`[第 ${logicalIndex} 条] ${op} 失败: ${err.message}`) }
      // 按操作类型区分间隔：点赞/转发/关注 +3s，评论 +5s
      if (op === 'comment') {
        await sleep(6000, 8000)
      } else {
        await sleep(4000, 6000)
      }
    }

    progress.processed++
    callbacks.onProgress(progress)

    await driver.evaluate('window.scrollBy(0, window.innerHeight * 0.5)')
    await sleep(4000, 6000)
  }

  if (plan.pause_after) {
    callbacks.onLog('任务执行完毕，按计划暂停（浏览器保持打开）')
  }
}

function getOperationsForPosition(
  position: number, slotMap: SlotMap | null, plan: TaskPlan, likeBudget: number, commentBudget: number
): OperationType[] {
  const ops: OperationType[] = ['view']

  if (plan.segments && plan.segments.length > 0) {
    for (const seg of plan.segments) {
      if (position >= seg.start && position <= seg.end) {
        for (const op of seg.operations) {
          if (op !== 'view' && !ops.includes(op)) ops.push(op)
        }
      }
    }
    return ops
  }

  if (slotMap) {
    const slot = slotMap.get(position)
    if (slot) for (const op of slot) { if (op !== 'view') ops.push(op) }
    return ops
  }
  const maxView = plan.constraints.view_count || 10
  if (plan.operations.includes('like') && likeBudget > 0) {
    const likeTarget = plan.constraints.like_count || 1
    const stride = Math.max(1, Math.floor(maxView / likeTarget))
    if (stride <= 1 || position % stride === 1) ops.push('like')
  }
  if (plan.operations.includes('retweet')) ops.push('retweet')
  if (plan.operations.includes('follow')) ops.push('follow')
  if (plan.operations.includes('comment') && commentBudget > 0) {
    const hasOtherInteractions = plan.operations.some(op => op === 'like' || op === 'retweet' || op === 'follow')
    if (!hasOtherInteractions) {
      ops.push('comment')
    } else {
      const stride = Math.max(1, Math.floor(maxView / commentBudget))
      if (position % stride === (stride > 1 ? 1 : 0) && position > 0) ops.push('comment')
    }
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
        const allBtns = tweet.querySelectorAll('button[data-testid]');
        const testids = Array.from(allBtns).map(function(b) { return b.getAttribute('data-testid'); });
        return { ok: false, reason: 'button_not_found', debug: testids };
      }
      btn.click();
      return { ok: true };
    })()
  `) as { ok: boolean; already?: boolean; reason?: string; debug?: string[] }
  if (result.ok) { callbacks.onLog(result.already ? '已点赞过' : '❤️ 已点赞') }
  else if (result.debug) { callbacks.onLog('点赞按钮未找到，当前推文中按钮 testid: ' + JSON.stringify(result.debug)) }
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
  // 关闭确认弹窗，确保后续找推文不受遮挡
  if (confirmed.ok) {
    await sleepFixed(300)
    await driver.pressKey('Escape')
  }
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

  // 如果有预置评论内容，直接使用；否则让 AI 实时生成
  let commentBody: string
  if (plan.presetCommentText) {
    commentBody = plan.presetCommentText
    callbacks.onLog('使用预置文案: ' + commentBody.substring(0, 60) + '...')
  } else {
    callbacks.onLog('正在为推文生成评论...')
    try {
      const result = await generateComment(tweetText, { platformId: plan.platform || 'twitter' })
      commentBody = result.comment
      callbacks.onLog('AI 评论: ' + commentBody)
    } catch (err: any) {
      callbacks.onLog(`AI 评论生成失败: ${err.message}，跳过评论`)
      return
    }
  }

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
      document.execCommand('insertText', false, ${JSON.stringify(commentBody)});
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
  if (!submitted.ok) {
    callbacks.onLog('评论发送按钮不可用，关闭弹窗后继续')
    await driver.pressKey('Escape')
    await sleepFixed(500)
    return
  }
  callbacks.onLog('💬 评论已发送')

  await sleepFixed(500)
  await driver.pressKey('Escape')
  await sleepFixed(1000)

  await driver.evaluate(`
    document.querySelectorAll(${JSON.stringify(TWITTER_SELECTORS.item)}).forEach(el => {
      const text = el.querySelector('div[data-testid="tweetText"]')?.innerText || '';
      window.__gbMarkers.processedTexts.add(text.substring(0, 80));
      window.__gbMarkers.processedIds.add(text.substring(0, 80));
    })
  `)
  await sleepFixed(500)
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