/**
 * 迭代 5.0: Twitter/X 数据采集器
 *
 * 职责：通过 CDP evaluate 在浏览器中提取推文/用户/粉丝等数据
 * 所有函数返回 JSON 字符串，由 task-executor.ts 的 doCollect 调用写入数据库
 */

/**
 * 从推文元素中提取单条推文数据
 */
export function extractTweetFromElement(tweetSelector: string): string {
  return `
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return null;
      const text = (tweet.querySelector('div[data-testid="tweetText"]') || {}).innerText || '';
      const time = (tweet.querySelector('time') || {}).getAttribute('datetime') || '';
      const authorEl = tweet.querySelector('div[data-testid="User-Name"]');
      const authorName = authorEl ? (authorEl.innerText || '').split('\\n')[0] || '' : '';
      const authorHandle = (tweet.querySelector('a[role="link"]') || {}).innerText || '';
      const likes = (tweet.querySelector('button[data-testid="like"]') || {}).innerText || '0';
      const retweets = (tweet.querySelector('button[data-testid="retweet"]') || {}).innerText || '0';
      const replies = (tweet.querySelector('button[data-testid="reply"]') || {}).innerText || '0';
      const bookmark = (tweet.querySelector('button[data-testid="bookmark"]') || {}).innerText || '0';
      const permalink = (tweet.querySelector('a[href*="/status/"]') || {}).getAttribute('href') || '';
      return JSON.stringify({
        text: text.substring(0, 5000),
        time: time,
        authorName: authorName,
        authorHandle: authorHandle,
        likes: likes.replace(/[^0-9]/g, '') || '0',
        retweets: retweets.replace(/[^0-9]/g, '') || '0',
        replies: replies.replace(/[^0-9]/g, '') || '0',
        bookmarks: bookmark.replace(/[^0-9]/g, '') || '0',
        url: permalink ? 'https://x.com' + permalink : ''
      });
    })()
  `
}

/**
 * 从推文元素中提取评论数据
 */
export function extractCommentsFromTweet(tweetSelector: string): string {
  return `
    (function() {
      const tweet = document.querySelector(${JSON.stringify(tweetSelector)});
      if (!tweet) return null;
      const replyBtn = tweet.querySelector('button[data-testid="reply"]');
      if (replyBtn) replyBtn.click();
      return 'opened';
    })()
  `
}

/**
 * 检查 X 是否已登录（用于采集前验证）
 * 返回布尔值
 */
export const CHECK_LOGIN_CODE = `
  (function() {
    // 检查 auth_token cookie
    var match = document.cookie.match(/(?:^|;\\s*)auth_token=([^;]+)/);
    var hasAuth = !!(match && match[1] && match[1].length > 10);
    // 检查用户菜单
    var hasMenu = !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    // 检查是否在登录页
    var isLoginPage = window.location.pathname.indexOf('/login') !== -1;
    return { loggedIn: hasAuth || hasMenu, isLoginPage: isLoginPage };
  })()
`

/**
 * 迭代 5.4: 提取用户资料
 * 从用户主页提取头像/简介/关注数/粉丝数/位置/加入日期
 * 一次性提取，不滚动
 */
export const EXTRACT_USER_PROFILE_CODE = `
  (function() {
    var result = {};
    // 头像
    var avatarEl = document.querySelector('img[alt*="avatar" i], img[src*="profile_images"]');
    if (avatarEl) result.avatarUrl = avatarEl.getAttribute('src') || '';
    // 显示名称
    var nameEl = document.querySelector('div[data-testid="UserName"]');
    if (nameEl) {
      var spans = nameEl.querySelectorAll('span');
      result.displayName = spans[0] ? spans[0].innerText : '';
    }
    // 从页面 URL 路径取 handle（最准确）
    result.handle = (window.location.pathname || '').split('/').filter(Boolean)[0] || '';
    // 简介
    var bioEl = document.querySelector('div[data-testid="UserDescription"]');
    if (bioEl) result.bio = bioEl.innerText;
    // 位置
    var locationEl = document.querySelector('span[data-testid="UserLocation"]');
    if (locationEl) result.location = locationEl.innerText;
    // 加入日期
    var joinEl = document.querySelector('span[data-testid="UserJoinDate"]');
    if (joinEl) result.joinDate = joinEl.innerText;
    // 关注数 + 粉丝数
    var links = document.querySelectorAll('a[href*="/following"], a[href*="/followers"], a[href*="/verified_followers"]');
    for (var i = 0; i < links.length; i++) {
      var text = links[i].innerText || '';
      var href = links[i].getAttribute('href') || '';
      if (href.indexOf('/followers') !== -1) result.followers = text;
      else if (href.indexOf('/following') !== -1) result.following = text;
    }
    // 推文数
    var tweetCountEl = document.querySelector('div[data-testid="UserProfileHeader_Items"] a[href*="/tweets"] span');
    if (tweetCountEl) result.tweetCount = tweetCountEl.innerText;
    // 认证
    var verifiedEl = document.querySelector('[data-testid="icon-verified"], [data-testid="icon-verified-account"]');
    if (verifiedEl) result.verified = true;
    return JSON.stringify(result);
  })()
`
