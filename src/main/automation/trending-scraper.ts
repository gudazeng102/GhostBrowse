/**
 * Trending Scraper — X 热搜话题抓取器
 *
 * 通过 CDP 控制已登录的浏览器窗口打开 X Trending 页面，
 * 从 DOM 中提取当前热搜话题列表。
 *
 * 完全复用现有的 CDPDriver 基础设施。
 */

import { CDPDriver } from './cdp-driver'

export interface TrendingItem {
  /** 排名 */
  rank: number
  /** 话题名称（可能带 #） */
  name: string
  /** 推文数量描述（如 "12.3K posts"） */
  tweetCount: string
  /** 话题分类（如 "Technology"） */
  category?: string
}

/**
 * 提取 X Trending 页面中的热搜话题
 *
 * @param profileId 浏览器窗口 ID（用于获取 CDP debug port）
 * @returns 热搜话题列表
 */
export async function scrapeTrending(profileId: number): Promise<TrendingItem[]> {
  const debugPort = 9000 + profileId
  const driver = new CDPDriver(debugPort)

  try {
    await driver.connect(15000)

    // 导航到 X Explore / Trending 页面
    await driver.navigate('https://x.com/explore/tabs/trending', 5000)

    // 等页面加载完成
    await driver.sleep(3000)

    // 尝试等待 trending 条目出现
    await driver.waitForSelector('div[data-testid="trend"]', 8000)

    // 提取热搜话题
    const items = await driver.evaluate(`
      (function() {
        const trends = document.querySelectorAll('div[data-testid="trend"]');
        const results = [];
        for (let i = 0; i < trends.length; i++) {
          const el = trends[i];

          // 话题名通常在包含链接的 span 中
          const nameEl = el.querySelector('span[dir="ltr"]') || el.querySelector('a[role="link"] span');
          const name = nameEl ? nameEl.innerText.trim() : '';

          if (!name) continue;

          // 推文数量
          const spans = el.querySelectorAll('span');
          let tweetCount = '';
          for (let j = 0; j < spans.length; j++) {
            const t = spans[j].innerText.trim();
            if (/\\d+[KMBkmb]?\\s*(posts|post|推文)/.test(t) || /\\d+[KMBkmb]?/.test(t)) {
              tweetCount = t;
              break;
            }
          }

          // 分类（如 "Technology · Trending"）
          let category = '';
          for (let j = 0; j < spans.length; j++) {
            const t = spans[j].innerText.trim();
            if (t.includes('Trending') || t.includes('热门')) {
              category = t;
              break;
            }
          }

          results.push({
            rank: i + 1,
            name: name.replace(/^#/, '').trim(),
            tweetCount,
            category
          });
        }
        return results;
      })()
    `)

    return (items || []) as TrendingItem[]
  } finally {
    driver.disconnect()
  }
}