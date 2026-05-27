/**
 * GhostBrowse 指纹注入脚本
 * Phase 1.3: Chrome Extension Content Script
 * 
 * 职责：
 * - Canvas 指纹添加噪声
 * - WebGL 指纹伪装
 * - WebRTC 模式处理（禁用/替换/转发）
 * - 时区设置
 * - 地理位置伪装
 * - 媒体设备列表固定
 * - 屏幕分辨率覆盖
 * - 语言设置
 * 
 * 注意：此文件为模板，实际运行时 launcher.ts 会将 {{CONFIG}} 替换为真实配置
 */

// ==================== 反检测工具函数（所有 IIFE 共享）====================
(function() {
  'use strict';

  // 缓存原生 getter 的 toString 结果，用于伪造 native code
  const _nativeCodeCache = {};

  function cacheNativeToString(name, obj, prop) {
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (desc && desc.get && typeof desc.get === 'function') {
        _nativeCodeCache[name] = Function.prototype.toString.call(desc.get);
      } else if (desc && typeof desc.value === 'function') {
        _nativeCodeCache[name] = Function.prototype.toString.call(desc.value);
      }
    } catch(e) {}
  }

  // 在覆盖前缓存原生 toString
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    cacheNativeToString('languages', Navigator.prototype, 'languages');
    cacheNativeToString('userAgentData', Navigator.prototype, 'userAgentData');
    cacheNativeToString('hardwareConcurrency', Navigator.prototype, 'hardwareConcurrency');
    cacheNativeToString('deviceMemory', Navigator.prototype, 'deviceMemory');
    cacheNativeToString('bluetooth', Navigator.prototype, 'bluetooth');
    cacheNativeToString('connection', Navigator.prototype, 'connection');
    cacheNativeToString('permissions', Navigator.prototype, 'permissions');
    cacheNativeToString('clipboard', Navigator.prototype, 'clipboard');
    cacheNativeToString('credentials', Navigator.prototype, 'credentials');
    cacheNativeToString('keyboard', Navigator.prototype, 'keyboard');
    cacheNativeToString('mediaCapabilities', Navigator.prototype, 'mediaCapabilities');
    cacheNativeToString('wakeLock', Navigator.prototype, 'wakeLock');
    cacheNativeToString('scheduling', Navigator.prototype, 'scheduling');
    cacheNativeToString('presentation', Navigator.prototype, 'presentation');
  }

  // 创建看起来像原生 getter 的函数
  window.__GB_nativeGetter = function(name, fn) {
    const getter = function() { return fn.call(this); };
    const cached = _nativeCodeCache[name];
    getter.toString = function() { 
      return cached || 'function get ' + name + '() { [native code] }'; 
    };
    // 同时修复 Function.prototype.toString.call 的返回
    return getter;
  };

  // 创建看起来像原生函数的函数
  window.__GB_nativeFn = function(name, fn) {
    fn.toString = function() { 
      return 'function ' + name + '() { [native code] }'; 
    };
    return fn;
  };
})();

// ==================== Phase 4.0 Fix: RTCPeerConnection 立即劫持（document_start 时机）====================
// 必须在页面任何脚本执行前完成，防止检测脚本缓存原始引用
(function() {
  'use strict';

  const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (OriginalRTCPeerConnection) {
    function FakeRTCPeerConnection(config, constraints) {
      if (config && config.iceServers) {
        config.iceServers = [];
      }
      const pc = new OriginalRTCPeerConnection(config, constraints);

      const originalCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = function(options) {
        return originalCreateOffer(options).then(offer => {
          if (offer && offer.sdp) {
            offer.sdp = offer.sdp.replace(/(a=candidate:[^\r\n]*?(\d{1,3}\.){3}\d{1,3}[^\r\n]*?\r\n)/g, '');
            offer.sdp = offer.sdp.replace(/(a=rtcp:[^\r\n]*?(\d{1,3}\.){3}\d{1,3}[^\r\n]*?\r\n)/g, '');
          }
          return offer;
        });
      };

      const originalCreateAnswer = pc.createAnswer.bind(pc);
      pc.createAnswer = function(options) {
        return originalCreateAnswer(options).then(answer => {
          if (answer && answer.sdp) {
            answer.sdp = answer.sdp.replace(/(a=candidate:[^\r\n]*?(\d{1,3}\.){3}\d{1,3}[^\r\n]*?\r\n)/g, '');
            answer.sdp = answer.sdp.replace(/(a=rtcp:[^\r\n]*?(\d{1,3}\.){3}\d{1,3}[^\r\n]*?\r\n)/g, '');
          }
          return answer;
        });
      };

      return pc;
    }

    FakeRTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    window.RTCPeerConnection = FakeRTCPeerConnection;
    window.webkitRTCPeerConnection = FakeRTCPeerConnection;
  }
})();

// ==================== Phase 4.0: Twitter/X 自动登录 ====================
// 仅在平台账号配置存在且启用时执行
// 从 CONFIG.platform_accounts 读取账号信息（后端 GET /api/profiles/:id 已追加此字段）
// 不依赖外部库，使用纯 JavaScript 实现 TOTP 算法

(function() {
  'use strict';

  // 获取配置（与其他 IIFE 共享相同的 {{CONFIG}} 模板替换）
  var CONFIG = {{CONFIG}};

  // 读取平台账号配置（来自 launcher.ts generateExtension 注入的 CONFIG）
  const platformAccounts = (CONFIG && CONFIG.platform_accounts) || [];
  const activeAccount = platformAccounts.find(function(a) { return a.is_active; }) || null;

  // 仅在 Twitter/X 域名上执行自动登录；非 Twitter 域名一律不做任何处理
  // 跳转 x.com 的逻辑由主进程 launcher.ts 在启动时基于 Cookie 状态决定
  var twitterHosts = ['twitter.com', 'x.com', 'www.twitter.com', 'www.x.com'];
  var hostname = window.location.hostname || '';
  var isTwitter = twitterHosts.indexOf(hostname) !== -1 || hostname.endsWith('.twitter.com') || hostname.endsWith('.x.com');

  if (!isTwitter) {
    return;
  }

  if (!activeAccount) {
    console.log('[GhostBrowse] 无启用的平台账号，跳过自动登录');
    return;
  }

  var account = activeAccount;

  // ==================== TOTP 算法（纯 JavaScript 内联实现）====================
  // RFC 6238 标准：基于 HMAC-SHA1 生成 6 位时间一次性密码

  function base32ToBytes(base32) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    var bits = '';
    for (var i = 0; i < base32.length; i++) {
      var val = alphabet.indexOf(base32.charAt(i).toUpperCase());
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    var bytes = [];
    for (var j = 0; j + 8 <= bits.length; j += 8) {
      bytes.push(parseInt(bits.substring(j, j + 8), 2));
    }
    return new Uint8Array(bytes);
  }

  function generateTOTP(secret) {
    return new Promise(function(resolve, reject) {
      try {
        var key = base32ToBytes(secret);
        var timeCounter = Math.floor(Date.now() / 30000); // 30 秒窗口
        var counterBytes = new Uint8Array(8);
        for (var i = 7; i >= 0; i--) {
          counterBytes[i] = timeCounter & 0xFF;
          timeCounter = timeCounter >> 8;
        }

        var cryptoSubtle = (window.crypto && window.crypto.subtle) || (window.msCrypto && window.msCrypto.subtle);
        if (!cryptoSubtle) {
          reject(new Error('SubtleCrypto 不可用'));
          return;
        }

        cryptoSubtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
          .then(function(cryptoKey) {
            return cryptoSubtle.sign('HMAC', cryptoKey, counterBytes);
          })
          .then(function(signature) {
            var hash = new Uint8Array(signature);
            var offset = hash[hash.length - 1] & 0x0F;
            var code = (
              ((hash[offset] & 0x7F) << 24) |
              ((hash[offset + 1] & 0xFF) << 16) |
              ((hash[offset + 2] & 0xFF) << 8) |
              (hash[offset + 3] & 0xFF)
            ) % 1000000;
            resolve(code.toString().padStart(6, '0'));
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ==================== 辅助函数 ====================

  /** 等待元素出现 */
  function waitForElement(selector, timeout) {
    timeout = timeout || 15000;
    return new Promise(function(resolve, reject) {
      var start = Date.now();
      var timer = setInterval(function() {
        var el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        }
        if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error('Element not found: ' + selector));
        }
      }, 500);
    });
  }

  /** React 兼容的设值方法：绕过 _valueTracker，确保 React state 更新 */
  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  /** 模拟人类逐字符输入（React 兼容版） */
  async function humanType(el, text) {
    text = text == null ? '' : String(text);
    console.log('[GhostBrowse][humanType] 准备输入，目标文本长度=' + text.length + '，元素 type=' + el.type + '，元素 name=' + (el.name || ''));
    if (!text.length) {
      console.warn('[GhostBrowse][humanType] ⚠️ 输入文本为空，跳过实际输入');
      return;
    }
    el.focus();
    el.click();
    // 先清空（React 兼容方式）
    setNativeValue(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(function(r) { setTimeout(r, 100); });

    var current = '';
    for (var i = 0; i < text.length; i++) {
      current += text[i];
      setNativeValue(el, current);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text[i], inputType: 'insertText' }));
      await new Promise(function(r) { setTimeout(r, 50 + Math.random() * 100); });
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[GhostBrowse][humanType] 输入完成，元素当前 value 长度=' + (el.value || '').length);
  }

  /** 模拟人类点击（带随机延迟） */
  async function humanClick(el) {
    await new Promise(function(r) { setTimeout(r, 200 + Math.random() * 300); });
    // 用 mouse 事件序列模拟，更真实
    var rect = el.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    ['mousedown', 'mouseup', 'click'].forEach(function(type) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
    });
  }

  /** 查找包含文本的按钮（增强版：优先 testid，再按文本） */
  function findButtonByText(texts, testIds) {
    // 1. 优先按 testid 精确匹配
    if (testIds && testIds.length) {
      for (var k = 0; k < testIds.length; k++) {
        var elById = document.querySelector('[data-testid="' + testIds[k] + '"]');
        if (elById) return elById;
      }
    }
    // 2. 再按文本模糊匹配（覆盖所有可能的可点击元素）
    var candidates = document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var t = (el.textContent || '').trim().toLowerCase();
      for (var j = 0; j < texts.length; j++) {
        if (t.indexOf(texts[j].toLowerCase()) !== -1) return el;
      }
    }
    return null;
  }

  /** 检测是否已登录：严格校验 auth_token cookie 值 + 用户菜单元素 */
  function checkLoginStatus() {
    // 1. 如果当前在登录流程页，直接判定为未登录（避免误判）
    var path = window.location.pathname || '';
    if (path.indexOf('/i/flow/login') !== -1 || path.indexOf('/login') !== -1 || path.indexOf('/i/flow/signup') !== -1) {
      return false;
    }

    // 2. 严格校验 auth_token cookie：必须存在且值长度 > 10（真实 token 至少 30+ 字符）
    var match = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    var hasAuthToken = !!(match && match[1] && match[1].length > 10);

    // 3. twid 必须存在且非空
    var twid = '';
    try { twid = localStorage.getItem('twid') || ''; } catch (e) {}
    var hasTwid = !!(twid && twid.length > 5);

    // 4. 用户菜单元素（侧边栏头像/Profile 入口）
    var hasUserMenu = !!(
      document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
      document.querySelector('[data-testid="AppTabBar_Profile_Link"]') ||
      document.querySelector('a[aria-label="Profile"]')
    );

    // 三者满足任一即视为已登录
    return hasAuthToken || hasTwid || hasUserMenu;
  }

  // ==================== 自动登录主流程 ====================

  async function executeLogin() {
    try {
      // Step 0: 检测是否已登录
      if (checkLoginStatus()) {
        console.log('[GhostBrowse] Twitter 已登录，跳过自动登录');
        return;
      }

      // Step 1: 如果不在登录页，跳转到登录页
      var path = window.location.pathname || '';
      if (path.indexOf('/login') === -1 && path.indexOf('/flow/') === -1) {
   
        window.location.href = 'https://x.com/i/flow/login';
        return;
      }

      // Step 2: 填写账号（用户名/邮箱/手机号）
      try {
        var accountInput = await waitForElement('input[autocomplete="username"], input[name="text"], input[type="text"]', 20000);
   
        await humanType(accountInput, account.account || '');
        await new Promise(function(r) { setTimeout(r, 500); });

        // Twitter "下一步" 按钮通常是 div[role="button"]，testid 不固定，靠文本匹配
        var nextBtn = findButtonByText(
          ['下一步', 'Next', 'Continue', 'Siguiente', 'Weiter', '次へ', '다음'],
          ['LoginForm_Login_Button']
        );
        if (nextBtn) {
   
          await humanClick(nextBtn);
        } else {
   
          accountInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          accountInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          accountInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
      } catch (e) {
        console.warn('[GhostBrowse] 填写账号失败:', e.message);
        return;
      }

      // Step 2.5: 检测是否要求"输入电话号码或用户名"二次验证（非常常见！）
      // 当账号是邮箱时，Twitter 会要求再输入用户名/手机号
      await new Promise(function(r) { setTimeout(r, 2500); });
      var unusualLoginInput = document.querySelector('input[data-testid="ocfEnterTextTextInput"]');
      if (unusualLoginInput) {
      
        // Phase 4.0: 优先使用用户配置的"账号名确认"（@username）
        // 备选顺序：username_confirm > alt_identifier > username > account
        var altIdentifier = account.username_confirm || account.alt_identifier || account.username || account.account || '';
        if (account.username_confirm) {
       
        } else {
     
        }
        await humanType(unusualLoginInput, altIdentifier);
        await new Promise(function(r) { setTimeout(r, 800); });
        // 多语言按钮文本（含德语 Weiter）+ testId
        var nextBtn2 = findButtonByText(
          ['下一步', 'Next', 'Continue', 'Siguiente', 'Weiter', '次へ', '다음', 'Suivant', 'Avanti', 'Volgende', 'Dalej', 'Próximo', 'Далее'],
          ['ocfEnterTextNextButton', 'LoginForm_Login_Button']
        );
        if (nextBtn2) {
      
          await humanClick(nextBtn2);
        } else {
      
          unusualLoginInput.focus();
          unusualLoginInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          unusualLoginInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          unusualLoginInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
        // 等待页面跳转到密码页
        await new Promise(function(r) { setTimeout(r, 2000); });
      }

      // Step 3: 等待密码页出现后填写密码
      await new Promise(function(r) { setTimeout(r, 2000); });
      console.log('[GhostBrowse] 等待密码输入框...');
      try {
        var passwordInput = await waitForElement('input[name="password"], input[type="password"], input[autocomplete="current-password"]', 15000);
        var pwd = account.password || '';
        console.log('[GhostBrowse] 密码输入框已找到。账号对象关键字段: ' + JSON.stringify({
          account: account.account,
          has_password: !!account.password,
          password_type: typeof account.password,
          password_length: pwd.length,
          password_first: pwd ? pwd.charAt(0) : '<空>',
          password_last: pwd ? pwd.charAt(pwd.length - 1) : '<空>',
          two_fa_type: account.two_fa_type
        }));
        console.log('[GhostBrowse] 密码框元素信息: name=' + passwordInput.name + ' type=' + passwordInput.type + ' disabled=' + passwordInput.disabled + ' readOnly=' + passwordInput.readOnly + ' visible=' + (passwordInput.offsetParent !== null));
        if (!pwd) {
          console.error('[GhostBrowse] ❌ 密码为空字符串！请检查 platform_accounts 表中 password 字段是否正确加密保存，以及 launcher.ts 中 decrypt 是否成功。');
        }
        await humanType(passwordInput, pwd);
        console.log('[GhostBrowse] humanType 调用完成。密码框最终 value 长度=' + (passwordInput.value || '').length);
        await new Promise(function(r) { setTimeout(r, 500); });

        var loginBtn = findButtonByText(
          ['登录', 'Log in', 'Sign in', 'Iniciar sesión', 'Anmelden', 'ログイン', '로그인'],
          ['LoginForm_Login_Button', 'ocfEnterPasswordNextButton']
        );
        if (loginBtn) {
          console.log('[GhostBrowse] 点击登录按钮');
          await humanClick(loginBtn);
        } else {
          console.log('[GhostBrowse] 未找到登录按钮，按 Enter');
          passwordInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          passwordInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          passwordInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }
      } catch (e) {
        console.warn('[GhostBrowse] 填写密码失败:', e.message);
        return;
      }

      // Step 4: 处理 2FA（TOTP 或 SMS）
      if (account.two_fa_type === 'totp' && account.two_fa_secret) {
        console.log('[GhostBrowse] 等待 2FA 输入框...');
        await new Promise(function(r) { setTimeout(r, 3000); });
        try {
          var codeInput = await waitForElement('input[inputmode="numeric"], input[name="code"], input[type="tel"]', 15000);
          var code = await generateTOTP(account.two_fa_secret);
          await humanType(codeInput, code);

          var confirmBtn = findButtonByText(['确认', 'Verify', 'Confirm', 'Next', 'Siguiente']);
          if (confirmBtn) await humanClick(confirmBtn);
          else {
            var enterEvent3 = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
            codeInput.dispatchEvent(enterEvent3);
          }
        } catch (e) {
          console.warn('[GhostBrowse] 填写 TOTP 验证码失败:', e.message);
        }
      } else if (account.two_fa_type === 'sms') {
        console.log('[GhostBrowse] SMS 2FA 需要手动确认');
      }

      // Step 5: 检测登录成功
      await new Promise(function(r) { setTimeout(r, 4000); });
      if (checkLoginStatus()) {
        console.log('[GhostBrowse] Twitter 自动登录成功');
      } else {
        console.log('[GhostBrowse] 登录可能失败，请检查账号密码');
      }

    } catch (err) {
      console.error('[GhostBrowse] 自动登录异常:', err);
    }
  }

  // 页面加载完成后延迟 2 秒执行，等待 DOM 完全渲染
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(executeLogin, 2000);
  } else {
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(executeLogin, 2000);
    });
  }

})();

// ==================== Phase 4.2: Outlook 自动登录（独立模块，与 Twitter 互不干扰）====================
// 仅在 login.live.com / login.microsoftonline.com / outlook.live.com 等 Microsoft 域名上执行
// Twitter 模块上方已有，本模块完全独立，不复用其变量与函数
(function() {
  'use strict';

  var __outlookConfig;
  try { __outlookConfig = {{CONFIG}}; } catch (e) { return; }
  if (!__outlookConfig || !Array.isArray(__outlookConfig.platform_accounts)) return;

  var hostname = (location.hostname || '').toLowerCase();
  var outlookHosts = [
    'www.microsoft.com',
    'microsoft.com',
    'login.live.com',
    'login.microsoftonline.com',
    'login.microsoft.com',
    'outlook.live.com',
    'outlook.office.com',
    'outlook.office365.com'
  ];
  var isOutlookHost = outlookHosts.indexOf(hostname) !== -1
    || hostname.endsWith('.live.com')
    || hostname.endsWith('.microsoftonline.com')
    || hostname.endsWith('.microsoft.com')
    || hostname.endsWith('.office.com')
    || hostname.endsWith('.office365.com');
  if (!isOutlookHost) return;

  // signup.live.com（注册页）：不执行任何自动登录，避免干扰用户注册流程
  if (hostname === 'signup.live.com') return;

  var outlookAccount = __outlookConfig.platform_accounts.find(function(a) {
    return a && a.platform === 'outlook' && a.is_active && a.account && a.password;
  });
  if (!outlookAccount) return;

  // Microsoft 官网入口页：直接跳转到登录页（更接近真实用户路径）
  // 注意：此跳转仅在 outlookAccount 存在的情况下才执行
  if (hostname === 'www.microsoft.com' || hostname === 'microsoft.com') {
    if (window.__ghostbrowse_outlook_redirect_done__) return;
    window.__ghostbrowse_outlook_redirect_done__ = true;
    setTimeout(function() {
      try { location.href = 'https://login.live.com/'; } catch (e) {}
    }, 1500 + Math.floor(Math.random() * 1500));
    return;
  }

  // 防止多次执行
  if (window.__ghostbrowse_outlook_login_started__) return;
  window.__ghostbrowse_outlook_login_started__ = true;

  function olog(msg) { try { console.log('[GhostBrowse-Outlook]', msg); } catch (e) {} }

  // ==================== 检测是否已登录 Outlook ====================
  // 在自动登录前先判断当前页面是否已经是已登录状态（如 inbox 页），
  // 避免在已登录状态下执行不必要的登录流程/干扰正常使用。
  function checkOutlookLoginStatus() {
    // 1. 已登录的 cookie 检测：RPSSecAuth 是 Outlook Web 的核心认证 cookie
    var match = document.cookie.match(/(?:^|;\s*)RPSSecAuth=([^;]+)/);
    var hasRpssAuth = !!(match && match[1] && match[1].length > 10);

    // 2. 已登录的 cookie 检测：DefaultAnchorMailbox（邮箱锚定）
    var anchorMatch = document.cookie.match(/(?:^|;\s*)DefaultAnchorMailbox=([^;]+)/);
    var hasAnchor = !!(anchorMatch && anchorMatch[1]);

    // 3. 当前 URL 路径：如果已经在 mail/ 路径下（inbox、drafts、sent 等），视为已登录
    var path = (window.location.pathname || '').toLowerCase();
    var isOnMailPath = path.indexOf('/mail/') !== -1 || path.indexOf('/owa/') !== -1;

    // 4. Outlook 已登录 UI 元素检测（侧边栏、收件箱列表等）
    var hasOutlookUI = !!(
      document.querySelector('[data-testid="composer"]') ||
      document.querySelector('[aria-label="新建邮件" i]') ||
      document.querySelector('[aria-label="New mail" i]') ||
      document.querySelector('div[role="navigation"][aria-label*="文件夹" i]') ||
      document.querySelector('div[aria-label*="folder pane" i]')
    );

    return hasRpssAuth || hasAnchor || isOnMailPath || hasOutlookUI;
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function waitForElement(selector, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    return new Promise(function(resolve) {
      var start = Date.now();
      var timer = setInterval(function() {
        var el = document.querySelector(selector);
        if (el) { clearInterval(timer); resolve(el); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(null); }
      }, 200);
    });
  }

  // React 兼容的 native value 设置（绕过 _valueTracker，强制触发 React state 更新）
  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  // keyCode/charCode 映射（针对 Microsoft 登录页 React onKeyDown/onKeyUp 监听）
  function keyCodeOf(ch) {
    if (!ch) return 0;
    var code = ch.charCodeAt(0);
    // 字母统一转大写返回 keyCode（DOM keyCode 规范要求字母用大写 ASCII）
    if (code >= 97 && code <= 122) return code - 32;
    return code;
  }
  function codeOf(ch) {
    if (!ch) return '';
    if (/[a-zA-Z]/.test(ch)) return 'Key' + ch.toUpperCase();
    if (/[0-9]/.test(ch)) return 'Digit' + ch;
    var map = {
      '@': 'Digit2', '.': 'Period', '-': 'Minus', '_': 'Minus',
      '+': 'Equal', '=': 'Equal', '!': 'Digit1', '#': 'Digit3',
      '$': 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7',
      '*': 'Digit8', '(': 'Digit9', ')': 'Digit0',
      ' ': 'Space', '/': 'Slash', '\\': 'Backslash',
      ',': 'Comma', ';': 'Semicolon', "'": 'Quote', '"': 'Quote',
      ':': 'Semicolon', '<': 'Comma', '>': 'Period', '?': 'Slash',
      '[': 'BracketLeft', ']': 'BracketRight', '{': 'BracketLeft', '}': 'BracketRight',
      '|': 'Backslash', '~': 'Backquote', '`': 'Backquote'
    };
    return map[ch] || 'Unidentified';
  }

  // React 兼容输入：仅用 setNativeValue + InputEvent（不派发 keydown/keypress/keyup）
  // 派发 keydown/keypress 会被 Microsoft 登录页的全局键盘监听器误判为快捷键/Enter，
  // 导致密码框输入到一半就被切换/提交。逐字符 setNativeValue 是经过验证最稳妥的方式。
  async function humanType(el, text) {
    if (!el) return;
    text = text == null ? '' : String(text);
    el.focus();
    el.click();

    // 先清空
    setNativeValue(el, '');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' }));
    await sleep(120);

    var current = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      current += ch;

      // 主路径：setNativeValue + InputEvent（绕过 React _valueTracker）
      // 注意：故意不派发 keydown/keypress/keyup，避免 Microsoft 登录页全局键盘
      // 监听器把字符误判为快捷键/Enter 提前提交（之前导致密码输入卡住的根因）
      var setOk = false;
      try {
        setNativeValue(el, current);
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: false,
          data: ch, inputType: 'insertText'
        }));
        setOk = (el.value === current);
      } catch (e) { setOk = false; }

      // 兜底：setNativeValue 被框架拒绝时，用 execCommand 注入（对 React 受控组件最可靠）
      if (!setOk) {
        try {
          el.focus();
          if (document.execCommand) {
            try { el.setSelectionRange(el.value.length, el.value.length); } catch (e2) {}
            document.execCommand('insertText', false, ch);
          }
        } catch (e3) {}
      }

      await sleep(60 + Math.floor(Math.random() * 80));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Microsoft 登录流程：
  // 1) 邮箱页：input[type="email"] 或 #i0116 → 下一步按钮 #idSIButton9 / input[type="submit"]
  // 2) 密码页：input[type="password"] 或 #i0118 → 登录按钮 #idSIButton9
  // 3) "保持登录"页：是 / 否 → 默认点"是"保持登录
  async function executeOutlookLogin() {
    olog('开始 Outlook 自动登录流程，账号: ' + outlookAccount.account);

    // ========== Step 0: 检测是否已登录（核心守卫）==========
    // 如果当前浏览器已有 Outlook 登录态（如 inbox 页 / RPSSecAuth cookie），
    // 直接跳过所有登录流程，避免干扰正常使用
    if (checkOutlookLoginStatus()) {
      olog('Outlook 已登录（检测到 RPSSecAuth / DefaultAnchorMailbox / mail路径 / Outlook UI），跳过自动登录');
      return;
    }

    // ========== 入口前置检测：页面是否已经是 KMSI / 隐私通知页 ==========
    // 密码提交后页面会刷新/跳转到 KMSI 页，content-script 重新注入，
    // 如果不做前置检测，会重新走邮箱/密码步骤然后在找不到输入框时中止
    //
    // 重要：不能仅凭 go.microsoft.com/fwlink/ 链接判断 KMSI！
    // Microsoft 登录页（邮箱/密码页）的页脚也有指向 go.microsoft.com 的隐私/法律链接。
    // 必须同时验证页面主体文本包含 KMSI 特征词（如 "Stay signed in" / "Angemeldet bleiben"），
    // 才能确认是真的 KMSI 页，而非登录页。
    var kmsiTextKeywords = [
      'stay signed in', 'angemeldet bleiben', '保持登录',
      'rester connecté', 'mantener la sesión iniciada', 'mantieni l\'accesso',
      'sesión abierta', 'ingelogd blijven', 'zostań zalogowany'
    ];
    var bodyTextLC = (document.body && document.body.innerText || '').toLowerCase();
    var hasKmsiText = kmsiTextKeywords.some(function(k) { return bodyTextLC.indexOf(k) !== -1; });
    var isKmsiPageNow = hasKmsiText;

    var privacyKeywords = [
      'quick note about your microsoft account',
      'kurze notiz', 'kurze info',
      '关于你的 microsoft 帐户', '关于您的 microsoft 帐户',
      'note rapide', 'una breve nota', 'breve nota',
      'kort opmerking'
    ];
    var isPrivacyPageNow = privacyKeywords.some(function(k) { return bodyTextLC.indexOf(k) !== -1; });

    if (isKmsiPageNow || isPrivacyPageNow) {
      olog('检测到页面已是登录后弹窗（KMSI=' + isKmsiPageNow + ', 隐私=' + isPrivacyPageNow + '），跳过邮箱/密码步骤，直接处理弹窗');
      await handlePostLoginPopups();
      return;
    }

    // ========== 正常登录流程：邮箱 → 密码 → 弹窗 ==========

    // ---------- Step 1: 邮箱 ----------
    var emailInput = await waitForElement('input[type="email"], #i0116, input[name="loginfmt"]', 30000);
    if (!emailInput) { olog('未找到邮箱输入框，流程中止'); return; }

    // 已经填了同样值则跳过
    if (!emailInput.value || emailInput.value !== outlookAccount.account) {
      await humanType(emailInput, outlookAccount.account);
    }
    await sleep(400 + Math.floor(Math.random() * 400));

    var nextBtn = document.querySelector('#idSIButton9, input[type="submit"][value*="Next" i], input[type="submit"][value*="下一步"], button[type="submit"]');
    if (nextBtn) {
      olog('点击"下一步"');
      nextBtn.click();
    } else {
      // 兜底：回车提交
      emailInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
    }

    // ---------- Step 2: 密码 ----------
    // Microsoft 切换页面是 SPA，密码框可能延迟出现
    var pwdInput = await waitForElement('input[type="password"], #i0118, input[name="passwd"]', 30000);
    if (!pwdInput) { olog('未找到密码输入框，流程中止（可能是账号不存在或被风控拦截）'); return; }

    await sleep(500 + Math.floor(Math.random() * 500));
    await humanType(pwdInput, outlookAccount.password);
    await sleep(400 + Math.floor(Math.random() * 400));

    var signInBtn = document.querySelector('#idSIButton9, input[type="submit"][value*="Sign in" i], input[type="submit"][value*="登录"], button[type="submit"]');
    if (signInBtn) {
      olog('点击"登录"');
      signInBtn.click();
    } else {
      pwdInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
    }

    // ---------- Step 3: 处理登录后的两个弹窗（隐私通知 / KMSI 保持登录）----------
    await handlePostLoginPopups();

    // TODO（后续平台扩展示例）：如需处理 Outlook 的 2FA / SMS 验证码，可在此追加 Step 4 逻辑
    // 不要修改上方 Twitter 模块；新平台请新建独立 IIFE。
  }

  // 处理登录后的两个弹窗：
  //   A) 隐私通知 "A quick note about your Microsoft account"   → OK / 确定 / Akzeptieren
  //   B) KMSI "Stay signed in / 保持登录 / Angemeldet bleiben"  → Yes / Ja / 是
  // 两个弹窗顺序不固定，且密码提交后页面会跳转/刷新到 KMSI 页（content-script 重新注入），
  // 所以 executeOutlookLogin 入口检测到 KMSI / 隐私页时也会走到这里，跳过邮箱/密码步骤。
  // 单独抽成函数后，两条入口路径共用同一份弹窗处理逻辑。
  function handlePostLoginPopups() {
    return new Promise(function(resolveDone) {
      var postLoginPolls = 0;
      var maxPostLoginPolls = 90; // 90 * 200ms = 18 秒（页面刷新后弹窗渲染稍慢）
      var privacyHandled = false;
      var kmsiHandled = false;

      var postLoginTimer = setInterval(function() {
        postLoginPolls++;
        if (postLoginPolls > maxPostLoginPolls || (privacyHandled && kmsiHandled)) {
          clearInterval(postLoginTimer);
          olog('登录后弹窗处理结束 (privacyHandled=' + privacyHandled + ', kmsiHandled=' + kmsiHandled + ')');
          resolveDone();
          return;
        }

        // ---- 1) 隐私通知页（"A quick note about your Microsoft account"）----
        if (!privacyHandled) {
          var privacyKeywords = [
            'quick note about your microsoft account',
            'kurze notiz', 'kurze info',
            '关于你的 microsoft 帐户', '关于您的 microsoft 帐户',
            'note rapide', 'una breve nota', 'breve nota',
            'kort opmerking'
          ];
          var bodyText = (document.body && document.body.innerText || '').toLowerCase();
          var isPrivacyPage = privacyKeywords.some(function(k) { return bodyText.indexOf(k) !== -1; });

          if (isPrivacyPage) {
            var okBtn = findOutlookButtonByText([
              'ok', 'okay',
              'accept', 'akzeptieren', 'aceptar', 'accepter',
              '确定', '同意', '接受', '我同意',
              'continue', 'weiter', '继续'
            ]);
            if (!okBtn) {
              okBtn = document.querySelector('#iNext, #idSIButton9, button[type="submit"], input[type="submit"]');
            }
            if (okBtn) {
              olog('隐私通知页：点击 "OK"');
              try { okBtn.click(); } catch (e) {}
              privacyHandled = true;
              return;
            }
          }
        }

        // ---- 2) KMSI "保持登录" 页（语言无关：检测 go.microsoft.com/fwlink/ 链接）----
        if (!kmsiHandled) {
          var kmsiAnchors = document.querySelectorAll('a[href^="https://go.microsoft.com/fwlink/"], a[href*="go.microsoft.com/fwlink/"]');
          var isKmsiPage = kmsiAnchors && kmsiAnchors.length > 0;

          if (isKmsiPage) {
            var yesBtn = document.querySelector('#idSIButton9, input[type="submit"][value*="Yes" i], input[type="submit"][value*="Ja" i], input[type="submit"][value*="是"]');
            if (!yesBtn) {
              yesBtn = findOutlookButtonByText([
                'yes', 'ja', '是',
                'sí', 'si', 'oui',
                'tak', 'sim'
              ]);
            }
            if (!yesBtn) {
              yesBtn = document.querySelector('input[type="submit"], button[type="submit"], button.btn-primary, .ext-button.primary');
            }
            if (yesBtn) {
              olog('KMSI 页：选择 "Yes / Ja"（保持登录）');
              try { yesBtn.click(); } catch (e) {}
              kmsiHandled = true;
              return;
            }
          }
        }
      }, 200);
    });
  }

  // 辅助：按可见文本查找可点击元素（button / div[role=button] / span[role=button] / a[role=button]）
  // Outlook 模块独立实现，不复用 Twitter 模块的 findButtonByText
  function findOutlookButtonByText(texts) {
    var lowered = texts.map(function(t) { return String(t).toLowerCase(); });
    var candidates = document.querySelectorAll('button, input[type="submit"], input[type="button"], div[role="button"], span[role="button"], a[role="button"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      // 过滤不可见
      if (!el.offsetParent && el.tagName !== 'INPUT') continue;
      var t = ((el.value || '') + ' ' + (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).trim().toLowerCase();
      if (!t) continue;
      for (var j = 0; j < lowered.length; j++) {
        // 精确边界匹配，避免 "okay" 误匹配 "yes ok"
        var kw = lowered[j];
        if (t === kw || t.indexOf(kw) !== -1) {
          return el;
        }
      }
    }
    return null;
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(executeOutlookLogin, 2000);
  } else {
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(executeOutlookLogin, 2000);
    });
  }
})();

// ==================== Phase 4.3: TikTok 自动登录（独立模块，与 Twitter / Outlook 互不干扰）====================
// 仅在 tiktok.com / www.tiktok.com 等 TikTok 域名上执行
// Twitter / Outlook 模块上方已有，本模块完全独立，不复用其变量与函数
(function() {
  'use strict';

  var __tiktokConfig;
  try { __tiktokConfig = {{CONFIG}}; } catch (e) { return; }
  if (!__tiktokConfig || !Array.isArray(__tiktokConfig.platform_accounts)) return;

  var hostname = (location.hostname || '').toLowerCase();
  var tiktokHosts = [
    'www.tiktok.com',
    'tiktok.com',
    'm.tiktok.com'
  ];
  var isTiktokHost = tiktokHosts.indexOf(hostname) !== -1
    || hostname.endsWith('.tiktok.com');
  if (!isTiktokHost) return;

  var tiktokAccount = __tiktokConfig.platform_accounts.find(function(a) {
    return a && a.platform === 'tiktok' && a.is_active && a.account && a.password;
  });
  if (!tiktokAccount) return;

  function tlog(msg) { try { console.log('[GhostBrowse-TikTok]', msg); } catch (e) {} }

  // ✅ 改为"从官网首页点 Log in"流程（与 Outlook 路径保持一致），
  // 不再限制只在登录页执行——首页/其他任意 TikTok 页都允许执行：
  //   - 在首页时：找到 "Log in" 按钮点击 → 弹出登录弹窗 → 填表
  //   - 在登录页时：直接填表
  //   - 已登录后页面跳回首页时：localStorage 30 分钟防重入标记拦截，避免误触 Log in 按钮
  // 防止多次执行（window 标记 + localStorage 持久标记，跨页面刷新存活）
  if (window.__ghostbrowse_tiktok_login_started__) return;
  // localStorage 标记：登录开始/完成时写入，30 分钟内不再触发自动登录
  // （延长到 30 分钟可覆盖：填表 → 提交 → 跳首页 → 风控弹回登录页 这种短时间循环）
  // 真实登录态由后端 cookie_json 在下次启动时重新判定，所以这里时效拉长无副作用
  try {
    var loginDoneTs = localStorage.getItem('__ghostbrowse_tiktok_login_done__');
    if (loginDoneTs) {
      var elapsed = Date.now() - parseInt(loginDoneTs, 10);
      if (elapsed < 30 * 60 * 1000) {
        tlog('TikTok 登录已完成标记生效（' + Math.round(elapsed / 1000) + '秒前），跳过自动登录');
        return;
      }
      // 超过 30 分钟，清除标记，允许重新登录
      localStorage.removeItem('__ghostbrowse_tiktok_login_done__');
    }
  } catch (e) {}
  window.__ghostbrowse_tiktok_login_started__ = true;

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function waitForElement(selector, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    return new Promise(function(resolve) {
      var start = Date.now();
      var timer = setInterval(function() {
        var el = document.querySelector(selector);
        if (el) { clearInterval(timer); resolve(el); return; }
        if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(null); }
      }, 300);
    });
  }

  // React 兼容的 native value 设置
  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  // 模拟人类逐字符输入（React 兼容）
  async function humanType(el, text) {
    if (!el) return;
    text = text == null ? '' : String(text);
    el.focus();
    el.click();

    // 先清空
    setNativeValue(el, '');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' }));
    await sleep(120);

    var current = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      current += ch;

      var setOk = false;
      try {
        setNativeValue(el, current);
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: false,
          data: ch, inputType: 'insertText'
        }));
        setOk = (el.value === current);
      } catch (e) { setOk = false; }

      // 兜底：execCommand
      if (!setOk) {
        try {
          el.focus();
          if (document.execCommand) {
            try { el.setSelectionRange(el.value.length, el.value.length); } catch (e2) {}
            document.execCommand('insertText', false, ch);
          }
        } catch (e3) {}
      }

      await sleep(60 + Math.floor(Math.random() * 80));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 查找包含文本的可点击元素
  function findTiktokButtonByText(texts) {
    var lowered = texts.map(function(t) { return String(t).toLowerCase(); });
    var candidates = document.querySelectorAll('button, a[role="button"], div[role="button"], span[role="button"], [data-e2e]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el.offsetParent && el.tagName !== 'INPUT') continue;
      var t = ((el.value || '') + ' ' + (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-e2e') || '')).trim().toLowerCase();
      if (!t) continue;
      for (var j = 0; j < lowered.length; j++) {
        var kw = lowered[j];
        if (t === kw || t.indexOf(kw) !== -1) {
          return el;
        }
      }
    }
    return null;
  }

  // 检测是否已登录
  function checkTiktokLoginStatus() {
    // 已登录时会有用户头像或特定元素
    var hasAvatar = !!(
      document.querySelector('[data-e2e="profile-icon"]') ||
      document.querySelector('[data-e2e="menu-avatar-container"]') ||
      document.querySelector('[data-e2e="account-icon"]')
    );
    // 检查 cookie 中的 sessionid
    var match = document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/);
    var hasSession = !!(match && match[1] && match[1].length > 5);
    return hasAvatar || hasSession;
  }

  // TikTok 登录流程：
  // 1) 首页点 "Log in" / "登录"
  // 2) 弹窗中选择 "Use phone / email / username" / "使用手机/邮箱/用户名"
  // 3) 切换到 "Email / Username" / "邮箱/用户名" tab
  // 4) 输入邮箱/用户名
  // 5) 输入密码
  // 6) 点 "Log in" / "登录"
  async function executeTiktokLogin() {
    tlog('开始 TikTok 自动登录流程，账号: ' + tiktokAccount.account);

    // Step 0: 检测是否已登录
    if (checkTiktokLoginStatus()) {
      tlog('TikTok 已登录，跳过自动登录');
      return;
    }

    // Step 1: 点击首页 "Log in" 按钮
    var loginBtn = findTiktokButtonByText([
      'log in', '登录', 'sign in', 'anmelden', 'se connecter',
      'accedi', 'iniciar sesión', '로그인', 'ログイン'
    ]);
    // 也尝试 data-e2e 属性
    if (!loginBtn) {
      loginBtn = document.querySelector('[data-e2e="top-login-button"], [data-e2e="login-button"]');
    }
    if (loginBtn) {
      tlog('点击 "Log in" 按钮');
      try { loginBtn.click(); } catch (e) {}
    } else {
      // 如果 URL 不在登录页，尝试直接跳转
      var path = window.location.pathname || '';
      if (path.indexOf('/login') === -1 && path.indexOf('/signup') === -1) {
        tlog('未找到登录按钮，跳转到登录页');
        window.location.href = 'https://www.tiktok.com/login/phone-or-email/email';
        return;
      }
    }

    // 等待登录弹窗/页面加载
    await sleep(2000 + Math.floor(Math.random() * 1000));

    // Step 2: 选择 "Use phone / email / username" 登录方式
    var phoneEmailBtn = findTiktokButtonByText([
      'use phone / email / username', '使用手机/邮箱/用户名',
      'use phone number or email', '使用手机号或邮箱',
      'log in with phone or email', '用手机号或邮箱登录',
      'phone or email', '手机或邮箱'
    ]);
    if (phoneEmailBtn) {
      tlog('点击 "Use phone / email / username"');
      try { phoneEmailBtn.click(); } catch (e) {}
      await sleep(1500 + Math.floor(Math.random() * 500));
    }

    // Step 3: 切换到 "Email / Username" tab（TikTok 默认可能是手机号 tab）
    var emailTab = findTiktokButtonByText([
      'email / username', '邮箱/用户名', 'email', '邮箱',
      'log in with email or username', '用邮箱或用户名登录'
    ]);
    if (emailTab) {
      tlog('切换到 "Email / Username" tab');
      try { emailTab.click(); } catch (e) {}
      await sleep(1000 + Math.floor(Math.random() * 500));
    }

    // Step 4: 输入邮箱/用户名
    var accountInput = await waitForElement(
      'input[type="text"][name="username"], input[type="text"][placeholder*="email" i], input[type="text"][placeholder*="用户名" i], input[type="text"][autocomplete="email"], input[name="email"], input[type="text"]',
      15000
    );
    if (!accountInput) {
      tlog('未找到账号输入框，尝试更宽泛的选择器');
      accountInput = await waitForElement('input[type="text"]', 5000);
    }
    if (accountInput) {
      if (!accountInput.value || accountInput.value !== tiktokAccount.account) {
        await humanType(accountInput, tiktokAccount.account);
      }
      await sleep(500 + Math.floor(Math.random() * 500));
    } else {
      tlog('未找到账号输入框，流程中止');
      return;
    }

    // Step 5: 输入密码
    var passwordInput = await waitForElement(
      'input[type="password"], input[name="password"], input[autocomplete="current-password"]',
      10000
    );
    if (passwordInput) {
      await humanType(passwordInput, tiktokAccount.password);
      await sleep(500 + Math.floor(Math.random() * 500));
    } else {
      tlog('未找到密码输入框，流程中止');
      return;
    }

    // Step 6: 点击登录按钮
    var submitBtn = findTiktokButtonByText([
      'log in', '登录', 'sign in', 'anmelden', 'se connecter',
      'accedi', 'iniciar sesión', '로그인', 'ログイン'
    ]);
    if (!submitBtn) {
      submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
    }
    // ✅ 关键修复：在点击提交按钮"之前"就写入 localStorage 标记
    // 原因：点击后页面会跳转到首页 → content-script 在首页重新注入 → 此时本 IIFE 又被执行
    //      如果等到登录"成功检测"通过才写标记，但页面跳转可能在写入前发生 → 重入循环
    // 提前写入 + 路径白名单（已在入口处加），双重保险防止重入
    try { localStorage.setItem('__ghostbrowse_tiktok_login_done__', String(Date.now())); } catch (e) {}

    if (submitBtn) {
      tlog('点击 "Log in" 提交按钮');
      try { submitBtn.click(); } catch (e) {}
    } else {
      // 兜底：回车提交
      passwordInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
    }

    // Step 7: 等待并检测登录结果
    await sleep(4000 + Math.floor(Math.random() * 2000));

    // 处理可能的验证码弹窗（TikTok 可能弹出滑块验证或短信验证码）
    // 这里仅做日志提示，不自动处理滑块验证（需要人工介入）
    var captchaEl = document.querySelector('[data-e2e="captcha-verify-container"], .captcha-verify-container, [id*="captcha"]');
    if (captchaEl) {
      tlog('⚠️ 检测到验证码弹窗，需要手动完成验证，已设置 30 分钟内不再自动登录');
      return;
    }

    if (checkTiktokLoginStatus()) {
      tlog('TikTok 自动登录成功');
      // 成功后再次刷新标记时间戳（延长 30 分钟有效期）
      try { localStorage.setItem('__ghostbrowse_tiktok_login_done__', String(Date.now())); } catch (e) {}
    } else {
      tlog('登录结果未知（可能在跳转中），已写入 30 分钟防重入标记');
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(executeTiktokLogin, 2500);
  } else {
    window.addEventListener('DOMContentLoaded', function() {
      setTimeout(executeTiktokLogin, 2500);
    });
  }
})();

// ==================== 后续平台自动登录扩展点（content-script 端）====================
// 添加新平台（如 Gmail / Facebook / LinkedIn ...）时，请在此处复制一份独立的 IIFE 块：
//   1. 拿到 config.platform_accounts，过滤出对应平台 + is_active 的账号
//   2. 用 location.hostname 白名单守卫（非目标域名直接 return）
//   3. 用独立的 window.__ghostbrowse_xxx_login_started__ 标记防重复
//   4. 实现该平台特定的 selector + 登录步骤
// 切勿合并/修改上方 Twitter / Outlook / TikTok 已有 IIFE，每个平台保持独立模块。
// ==================== 扩展点结束 ====================

(function() {
  'use strict';

  // 获取配置（运行时由 launcher.ts 替换）
  const config = {{CONFIG}};

  // ==================== Phase 4.0 Fix: navigator.userAgentData 覆盖（document_start 时机）====================
  // Chrome 120+ 检测站大量改用 Client Hints，必须在页面脚本执行前完成覆盖
  const chromeVersionForHints = config.chrome_version || '128';
  const platformForHints = config.os === 'mac' ? 'macOS' : config.os === 'linux' ? 'Linux' : config.os === 'android' ? 'Android' : 'Windows';
  const platformVersionMap = {
    'windows': '15.0.0', 'mac': '14.0.0', 'linux': '6.0.0', 'android': '14.0.0', 'ios': '17.0.0'
  };
  const platformVersion = platformVersionMap[config.os] || '15.0.0';
  const architecture = config.os === 'android' || config.os === 'ios' ? 'arm' : 'x86';
  const bitness = '64';
  const mobile = config.os === 'android' || config.os === 'ios';
  const brandVersion = String(chromeVersionForHints).replace(/^Chrome\s*/i, '').trim();
  const uaFullVersion = brandVersion + '.0.6099.130';

  // 使用 NavigatorUAData 原型创建对象，确保 instanceof 和 constructor.name 正确，这里他妈的别再给我改动到
  let fakeUserAgentData;
  if (typeof NavigatorUAData !== 'undefined') {
    fakeUserAgentData = Object.create(NavigatorUAData.prototype);
  } else {
    fakeUserAgentData = {};
  }

   Object.assign(fakeUserAgentData, {
    brands: [
      { brand: 'Chromium', version: brandVersion },
      { brand: 'Not.A/Brand', version: '24' },
      { brand: 'Google Chrome', version: brandVersion }
    ],
    mobile: mobile,
    platform: platformForHints,
    formFactors: [],
    getHighEntropyValues: function(hints) {
      const result = {};
      if (hints.includes('architecture')) result.architecture = architecture;
      if (hints.includes('bitness')) result.bitness = bitness;
      if (hints.includes('brands')) result.brands = this.brands;
      if (hints.includes('formFactors')) result.formFactors = this.formFactors;
      if (hints.includes('fullVersionList')) {
        result.fullVersionList = [
          { brand: 'Chromium', version: uaFullVersion },
          { brand: 'Not.A/Brand', version: '24.0.0.0' },
          { brand: 'Google Chrome', version: uaFullVersion }
        ];
      }
      if (hints.includes('mobile')) result.mobile = mobile;
      if (hints.includes('model')) result.model = '';
      if (hints.includes('platform')) result.platform = platformForHints;
      if (hints.includes('platformVersion')) result.platformVersion = platformVersion;
      if (hints.includes('uaFullVersion')) result.uaFullVersion = uaFullVersion;
      if (hints.includes('wow64')) result.wow64 = false;
      return Promise.resolve(result);
    },
    toJSON: function() {
      return {
        brands: this.brands,
        mobile: this.mobile,
        platform: this.platform,
        formFactors: this.formFactors
      };
    }
  });

  // 覆盖 Navigator.prototype.userAgentData getter（更自然，所有 navigator 实例继承）
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgentData');
    if (origDesc && origDesc.get) {
      const getter = window.__GB_nativeGetter('userAgentData', function() { return fakeUserAgentData; });
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    } else {
      Object.defineProperty(navigator, 'userAgentData', {
        value: fakeUserAgentData,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  }

  // Phase 4.0 Fix: 直接覆盖 navigator.platform（数据属性，和真实 Chrome 一致）
  const platformValue = config.os === 'mac' ? 'MacIntel' : config.os === 'linux' ? 'Linux x86_64' : config.os === 'android' ? 'Linux armv8l' : config.os === 'ios' ? 'iPhone' : 'Win32';
  Object.defineProperty(navigator, 'platform', {
    value: platformValue,
    writable: true,
    configurable: true,
    enumerable: true
  });

  // ==================== 0. WebDriver 反检测（替代 --disable-blink-features） ====================
  // 策略：优先删除自有属性（真实 Chrome 没有 webdriver 自有属性）
  // 若删除失败，设为数据属性 value: undefined（比访问器属性更自然）
  if ('webdriver' in navigator) {
    try {
      delete navigator.webdriver;
    } catch(e) {}
  }
  if ('webdriver' in navigator) {
    Object.defineProperty(navigator, 'webdriver', {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  // 清理 Navigator.prototype 上的 webdriver（某些 ChromeDriver 版本会污染原型）
  try {
    delete Navigator.prototype.webdriver;
  } catch(e) {}

  // 覆盖 Permissions API 中的 query 行为（保持实例方法替换，toString 在 Phase 4.1 修复）
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' 
      ? Promise.resolve({ state: Notification.permission }) 
      : originalQuery(parameters)
  );

  // ==================== 1. Canvas 指纹 - 添加噪声 ====================
  if (config.canvas_mode === 'noise') {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      try {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          // 添加固定偏移噪声（固定种子，确保同一配置结果一致）
          const seed = config.profile_id || 12345;
          for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = ((seed * (i + 1)) % 10) - 5;
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
          }
          ctx.putImageData(imageData, 0, 0);
        }
      } catch (e) {
        // 某些情况下可能无法获取 context，忽略
      }
      return originalToDataURL.apply(this, args);
    };

    // 同时 hook getContext
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
      const ctx = originalGetContext.call(this, contextType, ...args);
      if (contextType === '2d' && ctx) {
        const originalGetImageData = ctx.getImageData.bind(ctx);
        ctx.getImageData = function(sx, sy, sw, sh) {
          const imageData = originalGetImageData(sx, sy, sw, sh);
          const seed = config.profile_id || 12345;
          for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = ((seed * (i + 1)) % 10) - 5;
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
          }
          return imageData;
        };
      }
      return ctx;
    };
  }

  // ==================== 3. WebRTC - 四种模式（与 AdsPower 保持一致） ====================
  // 
  // WebRTC 模式说明：
  // - forward: 转发（Google STUN），隐蔽真实IP，适用于高安全性网站(Ebay、Discord)
  // - replace: 替换为与代理相匹配的 WebRTC IP
  // - real: 使用当前电脑的真实 WebRTC IP（不做任何处理）
  // - disable: 网站将无法读取 WebRTC 参数
  //
  // Forward 模式原理：
  // WebRTC 的 ICE 机制会使用 STUN/TURN 服务器收集网络候选地址。
  // 恶意网站可以通过自托管 STUN 服务器获取用户的真实本地 IP。
  // Forward 模式通过劫持 RTCPeerConnection，强制将所有 iceServers 替换为
  // Google 公共 STUN 服务器，从而阻止自托管 STUN 探测真实 IP。

  // real 模式：不做任何处理，让网站看到真实的本地 IP
  if (config.webrtc_mode === 'real') {
    // 不劫持 RTCPeerConnection，保持原样

  } else if (config.webrtc_mode === 'disable') {
    // 完全禁用 WebRTC
    delete window.RTCPeerConnection;
    delete window.webkitRTCPeerConnection;

    // 禁用 MediaDevices
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function() {
        return Promise.reject(new Error('WebRTC is disabled'));
      };
      navigator.mediaDevices.getDisplayMedia = function() {
        return Promise.reject(new Error('WebRTC is disabled'));
      };
    }
  } else if (config.webrtc_mode === 'replace') {
    // 替换模式：修改 ICE candidate 中的 IP 地址
    const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OriginalRTCPeerConnection) {
      window.RTCPeerConnection = function(...args) {
        const pc = new OriginalRTCPeerConnection(...args);

        const originalAddEventListener = pc.addEventListener.bind(pc);
        pc.addEventListener = function(type, listener, options) {
          if (type === 'icecandidate') {
            const wrappedListener = (event) => {
              if (event.candidate) {
                const parts = event.candidate.candidate.split(' ');
                // 替换 IP 地址为代理 IP 或固定值
                if (parts.length > 4) {
                  parts[4] = config.proxy_ip || '1.1.1.1';
                  event.candidate.candidate = parts.join(' ');
                }
              }
              listener(event);
            };
            return originalAddEventListener(type, wrappedListener, options);
          }
          return originalAddEventListener(type, listener, options);
        };

        // Hook createOffer/createAnswer
        const originalCreateOffer = pc.createOffer.bind(pc);
        pc.createOffer = function(...args) {
          return originalCreateOffer(...args);
        };

        return pc;
      };

      // 复制原型方法
      window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;

      // 如果有 onicecandidate，也需要包装
      const originalSet = Object.getOwnPropertyDescriptor(window.RTCPeerConnection.prototype, 'onicecandidate');
    }
  } else if (config.webrtc_mode === 'forward') {
    // Phase 1.6: Forward 模式 - 强制通过 Google 公共 STUN 服务器
    // Phase 1.7: 完善 Forward 模式 - 增加私有 IP 过滤

    const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    const OriginalRTCIceCandidate = window.RTCIceCandidate;

    if (OriginalRTCPeerConnection) {
      const _OrigRTCPeerConnection = OriginalRTCPeerConnection;
      const _OrigRTCIceCandidate = OriginalRTCIceCandidate;

      // ==================== 辅助函数：判断是否为私有 IP ====================
      function isPrivateIP(ipString) {
        if (!ipString) return false;
        // 匹配私有 IP 段：192.168.x.x, 10.x.x.x, 172.16-31.x.x, 127.0.0.1
        const privateIPRegex = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/;
        return privateIPRegex.test(ipString);
      }

      // ==================== 辅助函数：从 candidate 字符串中提取 IP ====================
      function extractIPFromCandidate(candidate) {
        if (!candidate) return null;
        const parts = candidate.split(' ');
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === 'candidate') {
            // candidate 格式：candidate:1 1 UDP 123 192.168.1.1 12345 typ host
            // 找到 IP 通常在 candidate 后面几位
            for (let j = i + 1; j < parts.length; j++) {
              const part = parts[j];
              // 跳过协议相关的值
              if (['UDP', 'TCP', 'host', 'srflx', 'prflx', 'relay'].includes(part)) continue;
              // 检查是否是有效 IP
              if (/^(\d{1,3}\.){3}\d{1,3}$/.test(part) || /^([0-9a-f:]+)$/i.test(part)) {
                return part;
              }
            }
          }
        }
        return null;
      }

      // ==================== 劫持 RTCIceCandidate 构造函数 ====================
      // 如果网站直接构造 ICE candidate，阻止私有 IP
      if (OriginalRTCIceCandidate) {
        window.RTCIceCandidate = function(candidateInit) {
          if (candidateInit && candidateInit.candidate) {
            const ip = extractIPFromCandidate(candidateInit.candidate);
            if (ip && isPrivateIP(ip)) {
              // 构造一个空 candidate，不包含私有 IP

              const safeCandidate = { ...candidateInit, candidate: '' };
              return new _OrigRTCIceCandidate(safeCandidate);
            }
          }
          return new _OrigRTCIceCandidate(candidateInit);
        };
        window.RTCIceCandidate.prototype = OriginalRTCIceCandidate.prototype;
        window.RTCIceCandidate.prototype.constructor = window.RTCIceCandidate;
      }

      // ==================== 劫持 RTCPeerConnection 构造函数 ====================
      window.RTCPeerConnection = function(config, ...rest) {
        const GOOGLE_STUN_SERVERS = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ];

        const forwardConfig = {
          ...config,
          iceServers: GOOGLE_STUN_SERVERS,
          iceTransportPolicy: 'all'
        };

        const pc = new _OrigRTCPeerConnection(forwardConfig, ...rest);

        // ==================== 劫持 addEventListener，过滤 icecandidate 事件 ====================
        const originalAddEventListener = pc.addEventListener.bind(pc);
        pc.addEventListener = function(type, listener, options) {
          if (type === 'icecandidate') {
            const wrappedListener = function(event) {
              if (event.candidate) {
                const ip = extractIPFromCandidate(event.candidate.candidate);
                if (ip && isPrivateIP(ip)) {
                  // 阻止包含私有 IP 的 candidate 向上传递

                  Object.defineProperty(event, 'candidate', {
                    value: { candidate: '', sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex },
                    writable: true,
                    configurable: true
                  });
                }
              }
              // 继续调用原监听器，但已修改的 event 不会泄露私有 IP
              return listener(event);
            };
            return originalAddEventListener(type, wrappedListener, options);
          }
          return originalAddEventListener(type, listener, options);
        };

        // ==================== 劫持 onicecandidate 属性 ====================
        const originalDescriptor = Object.getOwnPropertyDescriptor(_OrigRTCPeerConnection.prototype, 'onicecandidate');
        if (originalDescriptor && originalDescriptor.set) {
          Object.defineProperty(pc, 'onicecandidate', {
            set: function(handler) {
              if (handler) {
                const wrappedHandler = function(event) {
                  if (event.candidate) {
                    const ip = extractIPFromCandidate(event.candidate.candidate);
                    if (ip && isPrivateIP(ip)) {

                      Object.defineProperty(event, 'candidate', {
                        value: { candidate: '', sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex },
                        writable: true,
                        configurable: true
                      });
                    }
                  }
                  return handler(event);
                };
                return originalDescriptor.set.call(this, wrappedHandler);
              }
              return originalDescriptor.set.call(this, handler);
            },
            get: function() {
              return originalDescriptor.get.call(this);
            },
            configurable: true
          });
        }

        // ==================== 劫持 createOffer/createAnswer，替换 SDP 中的私有 IP ====================
        const originalCreateOffer = pc.createOffer.bind(pc);
        pc.createOffer = function(...args) {
          return originalCreateOffer(...args).then(sdp => {
            // 替换 SDP 中的私有 IP
            const filteredSdp = sdp.sdp.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g, (match, ip) => {
              if (isPrivateIP(ip)) {

                return '0.0.0.0';
              }
              return ip;
            });
            return { ...sdp, sdp: filteredSdp };
          });
        };

        const originalCreateAnswer = pc.createAnswer.bind(pc);
        pc.createAnswer = function(...args) {
          return originalCreateAnswer(...args).then(sdp => {
            const filteredSdp = sdp.sdp.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g, (match, ip) => {
              if (isPrivateIP(ip)) {

                return '0.0.0.0';
              }
              return ip;
            });
            return { ...sdp, sdp: filteredSdp };
          });
        };


        return pc;
      };

      window.RTCPeerConnection.prototype = _OrigRTCPeerConnection.prototype;
      window.RTCPeerConnection.prototype.constructor = window.RTCPeerConnection;

      Object.keys(_OrigRTCPeerConnection).forEach(key => {
        try {
          window.RTCPeerConnection[key] = _OrigRTCPeerConnection[key];
        } catch (e) {}
      });

      if (window.webkitRTCPeerConnection) {
        window.webkitRTCPeerConnection = window.RTCPeerConnection;
      }
    }
  }

  // ==================== 4. 时区 - 基于配置（Phase 4.1 增强）====================
  // 始终执行时区劫持（无论 timezone_mode 是什么），只要配置了 timezone
  if (config.timezone) {
    const timezone = config.timezone;
    // 优先使用 launcher 传入的精确偏移量
    const timezoneOffset = config.timezone_offset !== undefined
      ? config.timezone_offset
      : -480; // 默认上海时区

    const originalDateTimeFormat = Intl.DateTimeFormat;
    const FakeDateTimeFormat = function(locales, options) {
      return new originalDateTimeFormat(locales, { ...options, timeZone: timezone });
    };
    FakeDateTimeFormat.prototype = originalDateTimeFormat.prototype;
    FakeDateTimeFormat.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;
    // 修复 toString
    FakeDateTimeFormat.toString = function() {
      try { return originalDateTimeFormat.toString(); } catch(e) { return 'function DateTimeFormat() { [native code] }'; }
    };
    Intl.DateTimeFormat = FakeDateTimeFormat;

    // 覆盖 Date 的一些方法
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function() {
      if (timezoneOffset !== undefined) {
        return timezoneOffset;
      }
      return originalGetTimezoneOffset.call(this);
    };

    // 辅助：用目标时区解析 Date 的各个字段
    function getDatePartsInTimezone(date, tz) {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = dtf.formatToParts(date);
      const get = function(type) {
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].type === type) return parts[i].value;
        }
        return '';
      };
      return {
        weekday: get('weekday'),
        month: get('month'),
        day: String(get('day')),
        year: get('year'),
        hour: get('hour'),
        minute: get('minute'),
        second: get('second')
      };
    }

    // 辅助：格式化 GMT 偏移字符串
    function formatGMTOffset(offsetMinutes) {
      var sign = offsetMinutes <= 0 ? '+' : '-';
      var abs = Math.abs(offsetMinutes);
      var h = String(Math.floor(abs / 60)).padStart(2, '0');
      var m = String(abs % 60).padStart(2, '0');
      return 'GMT' + sign + h + m;
    }

    // 辅助：获取时区长名称
    function getTimezoneName(date, tz) {
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'long'
      });
      var parts = dtf.formatToParts(date);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
      return '';
    }

    // toLocaleString 族仍然通过 Intl 劫持
    var localeMethodsToWrap = [
      'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'
    ];
    localeMethodsToWrap.forEach(function(methodName) {
      var original = Date.prototype[methodName];
      if (typeof original === 'function') {
        Date.prototype[methodName] = function() {
          var args = Array.prototype.slice.call(arguments);
          if (args[1] && typeof args[1] === 'object') {
            args[1].timeZone = timezone;
          } else {
            args[1] = Object.assign({}, args[1] || {}, { timeZone: timezone });
          }
          return original.apply(this, args);
        };
      }
    });

    // 完全自定义 toString / toDateString / toTimeString（避免调用原生 OS 时区）
    Date.prototype.toString = function() {
      var p = getDatePartsInTimezone(this, timezone);
      var offsetStr = formatGMTOffset(timezoneOffset);
      var tzName = getTimezoneName(this, timezone);
      var dayPad = String(p.day).padStart(2, ' ');
      return p.weekday + ' ' + p.month + ' ' + dayPad + ' ' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second + ' ' + offsetStr + ' (' + tzName + ')';
    };

    Date.prototype.toDateString = function() {
      var p = getDatePartsInTimezone(this, timezone);
      var dayPad = String(p.day).padStart(2, ' ');
      return p.weekday + ' ' + p.month + ' ' + dayPad + ' ' + p.year;
    };

    Date.prototype.toTimeString = function() {
      var p = getDatePartsInTimezone(this, timezone);
      var offsetStr = formatGMTOffset(timezoneOffset);
      var tzName = getTimezoneName(this, timezone);
      return p.hour + ':' + p.minute + ':' + p.second + ' ' + offsetStr + ' (' + tzName + ')';
    };
  }

  // ==================== 5. 地理位置 - 基于配置 ====================
  if (config.geolocation_mode === 'ip') {
    const mockLatitude = config.latitude || 39.9042;  // 默认北京
    const mockLongitude = config.longitude || 116.4074;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function(success, error, options) {
        success({
          coords: {
            latitude: mockLatitude,
            longitude: mockLongitude,
            accuracy: 100,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
          },
          timestamp: Date.now()
        });
      };

      navigator.geolocation.watchPosition = navigator.geolocation.getCurrentPosition;
    }
  }

  // ==================== 6. 媒体设备 - 固定列表 ====================
  if (config.media_device_mode === 'mock') {
    const mockDevices = [
      { deviceId: 'default-audio-input', kind: 'audioinput', label: '默认麦克风', groupId: 'default-audio' },
      { deviceId: 'default-video-input', kind: 'videoinput', label: '内置摄像头', groupId: 'default-video' },
      { deviceId: 'default-audio-output', kind: 'audiooutput', label: '默认扬声器', groupId: 'default-audio' }
    ];

    if (navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices = function() {
        return Promise.resolve(mockDevices.map(d => ({ ...d })));
      };
    }
  }

  // ==================== 7. 屏幕分辨率 - 覆盖 screen 对象 ====================
  if (config.screen_resolution) {
    const [width, height] = config.screen_resolution.split('x').map(Number);

    Object.defineProperty(window.screen, 'width', { 
      value: width, 
      writable: true,
      configurable: true
    });

    Object.defineProperty(window.screen, 'height', { 
      value: height, 
      writable: true,
      configurable: true
    });

    Object.defineProperty(window.screen, 'availWidth', { 
      value: width, 
      writable: true,
      configurable: true
    });

    Object.defineProperty(window.screen, 'availHeight', { 
      value: height - 40, // 减去任务栏高度
      writable: true,
      configurable: true
    });

    Object.defineProperty(window.screen, 'availTop', { 
      value: 0, 
      writable: true,
      configurable: true
    });

    Object.defineProperty(window.screen, 'availLeft', { 
      value: 0, 
      writable: true,
      configurable: true
    });
  }

  // ==================== 8. 语言设置 ====================
  if (config.ui_language) {
    // language 作为数据属性覆盖（真实 Chrome 中 language 是数据属性）
    Object.defineProperty(navigator, 'language', { 
      value: config.ui_language,
      writable: true,
      configurable: true,
      enumerable: true
    });

    // languages 覆盖 Navigator.prototype getter
    const languages = [config.ui_language, config.ui_language.split('-')[0], 'en-US', 'en'];
    if (typeof Navigator !== 'undefined' && Navigator.prototype) {
      const origDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages');
      if (origDesc && origDesc.get) {
        const getter = window.__GB_nativeGetter('languages', function() { return languages; });
        Object.defineProperty(Navigator.prototype, 'languages', {
          get: getter,
          configurable: true,
          enumerable: true
        });
      } else {
        Object.defineProperty(navigator, 'languages', { 
          value: languages,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    }

    // 覆盖 chrome.language
    if (typeof chrome !== 'undefined' && chrome.i18n) {
      // chrome.i18n.getUILanguage() 只读，无法直接覆盖
    }
  }

  // ==================== 9. User Agent（可选，后续扩展） ====================
  if (config.user_agent) {
    Object.defineProperty(navigator, 'userAgent', { 
      value: config.user_agent,
      writable: true,
      configurable: true,
      enumerable: true
    });
  }


})();

// ==================== Phase 3.1: 核心反检测指纹补全（追加在文件末尾） ====================

(function() {
  'use strict';

  // 获取配置（从外层 IIFE 传递的 config）
  const config = typeof window.__GB_CONFIG__ !== 'undefined' 
    ? window.__GB_CONFIG__ 
    : {{CONFIG}};

  // ============ Phase 3.1 维度 1: 清理 ChromeDriver 遗留变量 ============
  // ChromeDriver 会注入 $cdc_ 和 $chrome_ 变量，这是最强的 Bot 信号
  // 使用 getOwnPropertyNames + getOwnPropertySymbols 覆盖不可枚举的情况
  try {
    const allKeys = [
      ...Object.getOwnPropertyNames(window),
      ...Object.getOwnPropertySymbols(window).map(s => typeof s === 'symbol' ? s.toString() : s)
    ];
    const cdcVars = allKeys.filter(k => 
      (typeof k === 'string' && (k.startsWith('cdc_') || k.startsWith('$chrome_')))
    );
    cdcVars.forEach(v => {
      try { delete window[v]; } catch(e) {}
    });
  } catch(e) {}

  // ============ Phase 3.1 维度 2: 完整 window.chrome 对象 ============
  // 真实 Chrome 有 chrome.runtime / chrome.app / chrome.csi / chrome.loadTimes
  if (!window.chrome) {
    window.chrome = {};
  }

  // chrome.runtime（扩展程序 API）
  if (!window.chrome.runtime) {
    Object.defineProperty(window.chrome, 'runtime', {
      value: {
        id: '',
        manifest: { name: 'GhostBrowse', version: '1.0', manifest_version: 3 },
        getManifest: function() { return this.manifest; },
        getURL: function(path) { return 'chrome-extension://fake-id/' + path; },
        connect: function() { return { onMessage: { addListener: function() {} }, postMessage: function() {} }; },
        sendMessage: function(msg, cb) { if (cb) setTimeout(cb, 0); },
        onInstalled: { addListener: function() {} },
        onUpdateAvailable: { addListener: function() {} }
      },
      writable: true,
      configurable: true
    });
  }

  // chrome.app（已废弃但仍有检测）
  if (!window.chrome.app) {
    window.chrome.app = {
      isInstalled: false,
      getDetails: function() { return null; },
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
    };
  }

  // chrome.csi（页面加载时间）
  if (!window.chrome.csi) {
    const now = Date.now();
    window.chrome.csi = function() {
      return {
        onloadT: now,
        startE: now - 100,
        pageT: 100.0,
        domContentLoadedT: now - 50
      };
    };
  }

  // chrome.loadTimes（页面加载时间）
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = function() {
      const now = Date.now() / 1000;
      return {
        requestTime: now - 0.050,
        startLoadTime: now - 0.050,
        commitLoadTime: now - 0.030,
        finishDocumentLoadTime: now - 0.010,
        finishLoadTime: now,
        firstPaintTime: now - 0.020,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2'
      };
    };
  }

  // ============ Phase 3.1 维度 3: navigator.plugins ============
  // 真实 Chrome 有 3-5 个插件：PDF Viewer、Widevine、Native Client
  // 使用 PluginArray 原型，确保 instanceof 和 constructor.name 正确
  const mockPlugins = [
    {
      name: 'Chrome PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format',
      version: '',
      length: 2,
      item: function(i) { return this[i]; },
      namedItem: function(name) { 
        for (let i = 0; i < this.length; i++) {
          if (this[i].name === name) return this[i];
        }
        return null;
      }
    },
    {
      name: 'Widevine Content Decryption Module',
      filename: 'widevinecdmadapter.dll',
      description: 'Widevine Content Decryption Module',
      version: '4.10.2209.0',
      length: 0,
      item: function(i) { return this[i]; },
      namedItem: function() { return null; }
    },
    {
      name: 'Native Client',
      filename: 'internal-nacl-plugin',
      description: 'Native Client module',
      version: '',
      length: 2,
      item: function(i) { return this[i]; },
      namedItem: function(name) {
        for (let i = 0; i < this.length; i++) {
          if (this[i].name === name) return this[i];
        }
        return null;
      }
    }
  ];

  // 添加 PluginArray 原型方法
  mockPlugins.refresh = function() {};
  mockPlugins.item = function(index) { return this[index >= 0 && index < this.length ? index : undefined]; };
  mockPlugins.namedItem = function(name) {
    for (let i = 0; i < this.length; i++) {
      if (this[i].name === name) return this[i];
    }
    return null;
  };
  Object.defineProperty(mockPlugins, 'length', { value: 3, writable: false, configurable: true });

  // 使用 PluginArray 原型
  if (typeof PluginArray !== 'undefined') {
    Object.setPrototypeOf(mockPlugins, PluginArray.prototype);
  }

  // 覆盖 Navigator.prototype.plugins getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'plugins');
    if (origDesc && origDesc.get) {
      const getter = window.__GB_nativeGetter('plugins', function() { return mockPlugins; });
      Object.defineProperty(Navigator.prototype, 'plugins', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    } else {
      Object.defineProperty(navigator, 'plugins', {
        value: mockPlugins,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  }

  // ============ Phase 3.1 维度 4: navigator.mimeTypes ============
  const mockMimeTypes = [
    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] },
    { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] },
    { type: 'application/x-nacl', suffixes: '', description: 'Native Client executable', enabledPlugin: mockPlugins[2] }
  ];
  mockMimeTypes.length = 3;
  mockMimeTypes.item = function(index) { return this[index >= 0 && index < this.length ? index : undefined]; };
  mockMimeTypes.namedItem = function(name) {
    for (let i = 0; i < this.length; i++) {
      if (this[i].type === name) return this[i];
    }
    return null;
  };

  // 使用 MimeTypeArray 原型
  if (typeof MimeTypeArray !== 'undefined') {
    Object.setPrototypeOf(mockMimeTypes, MimeTypeArray.prototype);
  }

  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mimeTypes');
    if (origDesc && origDesc.get) {
      const getter = window.__GB_nativeGetter('mimeTypes', function() { return mockMimeTypes; });
      Object.defineProperty(Navigator.prototype, 'mimeTypes', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    } else {
      Object.defineProperty(navigator, 'mimeTypes', {
        value: mockMimeTypes,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  }

  // ============ Phase 3.1 维度 5: navigator.languages ============
  // 真实浏览器有 2-4 个语言，空数组是 Bot 信号
  // 始终覆盖，确保和 language 一致
  const uiLang = config.ui_language || 'zh-CN';
  const baseLang = uiLang.split('-')[0];
  const languages = [uiLang, baseLang, 'en-US', 'en'];

  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages');
    if (origDesc && origDesc.get) {
      const getter = window.__GB_nativeGetter('languages', function() { return languages; });
      Object.defineProperty(Navigator.prototype, 'languages', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    } else {
      Object.defineProperty(navigator, 'languages', {
        value: languages,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  }

  // 同步更新 language（数据属性）
  Object.defineProperty(navigator, 'language', {
    value: uiLang,
    writable: true,
    configurable: true,
    enumerable: true
  });

  // ============ Phase 3.1 维度 6: navigator.hardwareConcurrency / deviceMemory ============
  // 根据分辨率推断合理的核心数
  const resolution = config.screen_resolution || '1920x1080';
  let cores = 4;
  if (resolution.includes('3840') || resolution.includes('2560')) cores = 8;
  if (resolution.includes('1366') || resolution.includes('1280')) cores = 2;

  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origHc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency');
    if (origHc && origHc.get) {
      const getter = window.__GB_nativeGetter('hardwareConcurrency', function() { return cores; });
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }

    const origDm = Object.getOwnPropertyDescriptor(Navigator.prototype, 'deviceMemory');
    if (origDm && origDm.get) {
      const getter = window.__GB_nativeGetter('deviceMemory', function() { return 8; });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // ============ Phase 3.1 维度 7: navigator.vendor / maxTouchPoints ============
  // vendor 是数据属性
  Object.defineProperty(navigator, 'vendor', {
    value: 'Google Inc.',
    writable: true,
    configurable: true,
    enumerable: true
  });

  // maxTouchPoints 是数据属性
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: 0,
    writable: true,
    configurable: true,
    enumerable: true
  });

  // ============ Phase 3.1 维度 8: window.devicePixelRatio ============
  if (typeof window.devicePixelRatio === 'undefined' || window.devicePixelRatio < 1) {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 1,
      writable: true,
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 9: window.outerWidth / outerHeight ============
  const [screenW, screenH] = (config.screen_resolution || '1920x1080').split('x').map(Number);
  if (!window.outerWidth || window.outerWidth < screenW) {
    Object.defineProperty(window, 'outerWidth', {
      value: screenW,
      writable: true,
      configurable: true
    });
  }
  if (!window.outerHeight || window.outerHeight < screenH) {
    Object.defineProperty(window, 'outerHeight', {
      value: screenH + 40,
      writable: true,
      configurable: true
    });
  }
  if (!window.innerWidth) {
    Object.defineProperty(window, 'innerWidth', {
      value: screenW,
      writable: true,
      configurable: true
    });
  }
  if (!window.innerHeight) {
    Object.defineProperty(window, 'innerHeight', {
      value: screenH,
      writable: true,
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 10: navigator.connection ============
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origConn = Object.getOwnPropertyDescriptor(Navigator.prototype, 'connection');
    if (origConn && origConn.get) {
      const getter = window.__GB_nativeGetter('connection', function() {
        return {
          effectiveType: '4g',
          downlink: 10,
          downlinkMax: Infinity,
          rtt: 50,
          type: 'wifi',
          saveData: false,
          onchange: null,
          addEventListener: function() {},
          removeEventListener: function() {}
        };
      });
      Object.defineProperty(Navigator.prototype, 'connection', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // ============ Phase 3.1 维度 11: window.performance.memory ============
  if (window.performance && !window.performance.memory) {
    Object.defineProperty(window.performance, 'memory', {
      value: {
        usedJSHeapSize: 12000000,
        totalJSHeapSize: 22000000,
        jsHeapSizeLimit: 2190000000
      },
      writable: true,
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 12: screen.colorDepth / pixelDepth ============
  if (window.screen && !window.screen.colorDepth) {
    Object.defineProperty(window.screen, 'colorDepth', {
      value: 24,
      writable: true,
      configurable: true
    });
    Object.defineProperty(window.screen, 'pixelDepth', {
      value: 24,
      writable: true,
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 13: screen.availLeft / availTop ============
  if (window.screen) {
    if (!window.screen.availLeft) {
      Object.defineProperty(window.screen, 'availLeft', {
        value: 0,
        writable: true,
        configurable: true
      });
    }
    if (!window.screen.availTop) {
      Object.defineProperty(window.screen, 'availTop', {
        value: 0,
        writable: true,
        configurable: true
      });
    }
  }

  // ============ Phase 3.1 维度 14: Intl.DateTimeFormat 时区增强 ============
  // 确保格式化输出与配置时区一致
  const timezone = config.timezone || 'Asia/Shanghai';
  if (window.Intl && window.Intl.DateTimeFormat) {
    const OrigDateTimeFormat = window.Intl.DateTimeFormat;
    const FakeDateTimeFormat = function(locales, options) {
      const opts = Object.assign({}, options);
      if (opts.timeZone === undefined) {
        opts.timeZone = timezone;
      }
      return new OrigDateTimeFormat(locales, opts);
    };
    FakeDateTimeFormat.prototype = OrigDateTimeFormat.prototype;
    FakeDateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;
    FakeDateTimeFormat.toString = function() {
      try { return OrigDateTimeFormat.toString(); } catch(e) { return 'function DateTimeFormat() { [native code] }'; }
    };
    window.Intl.DateTimeFormat = FakeDateTimeFormat;
  }

  // ============ Phase 3.1 维度 15: CSS.supports 伪装 ============
  if (typeof CSS !== 'undefined' && CSS.supports) {
    const origSupports = CSS.supports.bind(CSS);
    CSS.supports = function(property, value) {
      // 常见检测项返回真实结果
      if (property === '(--custom:property)') return true;
      if (property === 'display' && value === 'grid') return true;
      if (property === 'display' && value === 'flex') return true;
      return origSupports(property, value);
    };
  }

  // ============ Phase 3.1 维度 16: Notification.permission ============
  if (window.Notification) {
    Object.defineProperty(Notification, 'permission', {
      value: 'default',
      writable: true,
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 17: Permissions.query 增强 ============
  if (navigator.permissions && navigator.permissions.query) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(parameters) {
      const name = parameters.name;
      // 返回合理的默认权限状态
      const defaults = {
        'notifications': 'default',
        'push': 'prompt',
        'midi': 'prompt',
        'clipboard-read': 'prompt',
        'clipboard-write': 'granted',
        'geolocation': 'prompt',
        'camera': 'prompt',
        'microphone': 'prompt'
      };
      if (defaults.hasOwnProperty(name)) {
        return Promise.resolve({ state: defaults[name], onchange: null });
      }
      return origQuery(parameters);
    };
  }

  // ============ Phase 3.1 维度 4b: 无条件确保 navigator.plugins / mimeTypes 方法存在 ============
  // Chrome 某些版本/配置下 PluginArray 原生方法可能缺失，检测站会据此判定异常
  try {
    const protoPlugins = navigator.plugins;
    if (protoPlugins && typeof protoPlugins.item !== 'function') {
      Object.defineProperty(protoPlugins, 'item', {
        value: function(index) { return this[index >= 0 && index < this.length ? index : undefined]; },
        writable: true, configurable: true
      });
    }
    if (protoPlugins && typeof protoPlugins.namedItem !== 'function') {
      Object.defineProperty(protoPlugins, 'namedItem', {
        value: function(name) { for (let i = 0; i < this.length; i++) { if (this[i].name === name) return this[i]; } return null; },
        writable: true, configurable: true
      });
    }
    if (protoPlugins && typeof protoPlugins.refresh !== 'function') {
      Object.defineProperty(protoPlugins, 'refresh', {
        value: function() {},
        writable: true, configurable: true
      });
    }
  } catch(e) {}

  try {
    const protoMime = navigator.mimeTypes;
    if (protoMime && typeof protoMime.item !== 'function') {
      Object.defineProperty(protoMime, 'item', {
        value: function(index) { return this[index >= 0 && index < this.length ? index : undefined]; },
        writable: true, configurable: true
      });
    }
    if (protoMime && typeof protoMime.namedItem !== 'function') {
      Object.defineProperty(protoMime, 'namedItem', {
        value: function(name) { for (let i = 0; i < this.length; i++) { if (this[i].type === name) return this[i]; } return null; },
        writable: true, configurable: true
      });
    }
  } catch(e) {}

  // ============ Phase 3.1 维度 18: navigator.webdriver 最终确认 ============
  // 确保即使之前被覆盖，这里也是 undefined
  // 策略：优先删除自有属性，不创建访问器属性
  if ('webdriver' in navigator) {
    try {
      delete navigator.webdriver;
    } catch(e) {}
  }
  if ('webdriver' in navigator) {
    Object.defineProperty(navigator, 'webdriver', {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  // 清理 Navigator.prototype 上的 webdriver
  try {
    delete Navigator.prototype.webdriver;
  } catch(e) {}


})();

// ==================== Phase 3.2: Canvas/WebGL/Audio/ClientRects 深度伪装（追加在文件末尾） ====================

(function() {
  'use strict';

  // 获取配置（从外层 IIFE 传递的 config）
  const CONFIG = typeof window.__GB_CONFIG__ !== 'undefined' 
    ? window.__GB_CONFIG__ 
    : {{CONFIG}};

  // ============ Phase 3.2 辅助函数：确定性伪随机数生成器 ============
  // 使用种子生成确定性的伪随机数，同一窗口相同，不同窗口不同

  function createSeededRandom(seedHex) {
    let seed = parseInt(seedHex, 16) || 0x19AC8B24;
    return function() {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  // ============ Phase 3.2 维度 1: Canvas 2D 深度噪声 ============
  // 覆盖所有 Canvas 2D 指纹采集点：fillText/strokeText/measureText/isPointInPath/getImageData/toDataURL

  const canvasSeed = CONFIG.canvas_noise_seed || '19AC8B24';
  const canvasRandom = createSeededRandom(canvasSeed);

  // 噪声函数：给数值添加微小偏移
  function canvasNoise(value, magnitude) {
    return value + (canvasRandom() - 0.5) * magnitude;
  }

  // 劫持 fillText
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
    return originalFillText.call(this, text, canvasNoise(x, 0.1), canvasNoise(y, 0.1), maxWidth);
  };

  // 劫持 strokeText
  const originalStrokeText = CanvasRenderingContext2D.prototype.strokeText;
  CanvasRenderingContext2D.prototype.strokeText = function(text, x, y, maxWidth) {
    return originalStrokeText.call(this, text, canvasNoise(x, 0.1), canvasNoise(y, 0.1), maxWidth);
  };

  // 劫持 measureText（字体测量指纹）
  const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function(text) {
    const metrics = originalMeasureText.call(this, text);
    Object.defineProperty(metrics, 'width', {
      get: () => metrics.width + (canvasRandom() - 0.5) * 0.02,
      configurable: true
    });
    return metrics;
  };

  // 劫持 isPointInPath
  const originalIsPointInPath = CanvasRenderingContext2D.prototype.isPointInPath;
  CanvasRenderingContext2D.prototype.isPointInPath = function(path, x, y, fillRule) {
    const nx = canvasNoise(x, 0.5);
    const ny = canvasNoise(y, 0.5);
    if (arguments.length === 4) {
      return originalIsPointInPath.call(this, path, nx, ny, fillRule);
    }
    return originalIsPointInPath.call(this, path, nx, ny);
  };

  // 劫持 getImageData（关键：阻止像素级分析）
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
    const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.floor((canvasRandom() - 0.5) * 4);
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    return imageData;
  };

  // 劫持 toDataURL（关键：阻止导出图片分析）
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const w = this.width, h = this.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.floor((canvasRandom() - 0.5) * 4);
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return originalToDataURL.call(this, type, quality);
  };

  // ============ Phase 3.2 维度 2: WebGL 元数据完整伪装 ============
  // 策略：以 getContext 实例劫持为主（100% 安全，无 Illegal invocation）
  //      以原型劫持为辅（防止网站提前缓存原型引用）

  const webglVendor = CONFIG.webgl_vendor || 'Intel Inc.';
  const webglRenderer = CONFIG.webgl_renderer || 'Intel Iris Xe Graphics';
  const resolution = CONFIG.screen_resolution || '1920x1080';
  const [screenW, screenH] = resolution.split('x').map(Number);

  // 常量
  const VENDOR = 0x1F00;
  const RENDERER = 0x1F01;
  const VERSION = 0x1F02;
  const SHADING_LANGUAGE_VERSION = 0x8B8C;
  const UNMASKED_VENDOR_WEBGL = 0x9245;
  const UNMASKED_RENDERER_WEBGL = 0x9246;

  // 根据显卡类型确定参数集
  const isNvidia = webglVendor.includes('NVIDIA');
  const isAMD = webglVendor.includes('AMD');
  const isIntel = webglVendor.includes('Intel');

  // 基础参数映射（WebGL 1.0）
  const paramMap = {
    [VENDOR]: 'WebKit',
    [RENDERER]: 'WebKit WebGL',
    [VERSION]: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
    [SHADING_LANGUAGE_VERSION]: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
    [UNMASKED_VENDOR_WEBGL]: webglVendor,
    [UNMASKED_RENDERER_WEBGL]: webglRenderer,
    0x0D33: isNvidia ? 32768 : (isAMD ? 16384 : 8192),           // MAX_TEXTURE_SIZE
    0x851C: isNvidia ? 32768 : (isAMD ? 16384 : 8192),           // MAX_CUBE_MAP_TEXTURE_SIZE
    0x84E8: isNvidia ? 32768 : (isAMD ? 16384 : 8192),           // MAX_RENDERBUFFER_SIZE
    0x0D3A: isNvidia ? [32768, 32768] : [8192, 8192],            // MAX_VIEWPORT_DIMS
    0x8869: 16,                                                   // MAX_VERTEX_ATTRIBS
    0x8DFB: isNvidia ? 4096 : 1024,                               // MAX_VERTEX_UNIFORM_VECTORS
    0x8DFD: isNvidia ? 4096 : 1024,                               // MAX_FRAGMENT_UNIFORM_VECTORS
    0x8DFC: isNvidia ? 32 : 16,                                   // MAX_VARYING_VECTORS
    0x8872: isNvidia ? 32 : 16,                                   // MAX_TEXTURE_IMAGE_UNITS
    0x8B4C: isNvidia ? 32 : 16,                                   // MAX_VERTEX_TEXTURE_IMAGE_UNITS
    0x8B4D: isNvidia ? 48 : 32,                                   // MAX_COMBINED_TEXTURE_IMAGE_UNITS
    0x8829: isNvidia ? 8 : 4,                                     // MAX_DRAW_BUFFERS_WEBGL
    0x8CDF: isNvidia ? 8 : 4,                                     // MAX_COLOR_ATTACHMENTS_WEBGL
    0x80E9: 4294967295,                                           // MAX_ELEMENTS_INDICES
    0x80E8: 4294967295,                                           // MAX_ELEMENTS_VERTICES
    0x846D: [1, isNvidia ? 2047 : 255],                          // ALIASED_POINT_SIZE_RANGE
    0x846E: [1, isNvidia ? 2047 : 1],                             // ALIASED_LINE_WIDTH_RANGE
    0x0D52: 8, 0x0D53: 8, 0x0D54: 8, 0x0D55: 8,                 // RGBA_BITS
    0x0D56: 24, 0x0D57: 8, 0x0D50: 4,                            // DEPTH/STENCIL/SUBPIXEL_BITS
    0x80A8: 1, 0x80A9: 4,                                         // SAMPLE_BUFFERS / SAMPLES
  };

  const supportedExtensions = [
    'WEBGL_debug_renderer_info', 'WEBGL_lose_context', 'EXT_texture_filter_anisotropic',
    'EXT_disjoint_timer_query', 'OES_texture_float_linear', 'OES_element_index_uint',
    'OES_standard_derivatives', 'OES_texture_half_float', 'OES_texture_half_float_linear',
    'OES_vertex_array_object', 'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc',
    'WEBGL_depth_texture', 'ANGLE_instanced_arrays', 'KHR_parallel_shader_compile'
  ];

  // ---------- 核心：实例级劫持（getContext 返回的每个 ctx 上覆盖方法） ----------
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    const ctx = originalGetContext.call(this, type, attrs);
    if (!ctx) return ctx;

    const isWebGL2 = type === 'webgl2';
    if (type === 'webgl' || type === 'experimental-webgl' || isWebGL2) {
      // bind 固定 this，避免任何 Illegal invocation
      const origGetParameter = ctx.getParameter.bind(ctx);
      const origGetExtension = ctx.getExtension.bind(ctx);
      const origGetSupportedExtensions = ctx.getSupportedExtensions.bind(ctx);

      ctx.getParameter = function(pname) {
        // 优先返回伪装值
        if (pname === UNMASKED_VENDOR_WEBGL) return webglVendor;
        if (pname === UNMASKED_RENDERER_WEBGL) return webglRenderer;
        if (pname === VENDOR) return 'WebKit';
        if (pname === RENDERER) return 'WebKit WebGL';
        if (pname === VERSION) return isWebGL2 
          ? 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' 
          : paramMap[VERSION];
        if (pname === SHADING_LANGUAGE_VERSION) return isWebGL2
          ? 'WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)'
          : paramMap[SHADING_LANGUAGE_VERSION];
        if (paramMap[pname] !== undefined) return paramMap[pname];
        return origGetParameter(pname);
      };

      ctx.getExtension = function(name) {
        if (name === 'WEBGL_debug_renderer_info') {
          return {
            UNMASKED_VENDOR_WEBGL: 0x9245,
            UNMASKED_RENDERER_WEBGL: 0x9246
          };
        }
        if (name === 'WEBGL_lose_context') {
          return { loseContext: function() {}, restoreContext: function() {} };
        }
        return origGetExtension(name);
      };

      ctx.getSupportedExtensions = function() {
        const exts = origGetSupportedExtensions() || [];
        const result = Array.from(exts);
        if (!result.includes('WEBGL_debug_renderer_info')) {
          result.push('WEBGL_debug_renderer_info');
        }
        return result;
      };
    }
    return ctx;
  };

  // ---------- 兜底：原型级劫持（防止网站提前缓存原型方法） ----------
  // WebGL 1.0
  const origProtoGetParam1 = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(pname) {
    if (pname === UNMASKED_VENDOR_WEBGL) return webglVendor;
    if (pname === UNMASKED_RENDERER_WEBGL) return webglRenderer;
    if (pname === VENDOR) return 'WebKit';
    if (pname === RENDERER) return 'WebKit WebGL';
    if (pname === VERSION) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
    if (pname === SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
    return origProtoGetParam1.call(this, pname);
  };

  const origProtoGetExt1 = WebGLRenderingContext.prototype.getExtension;
  WebGLRenderingContext.prototype.getExtension = function(name) {
    if (name === 'WEBGL_debug_renderer_info') {
      return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
    }
    return origProtoGetExt1.call(this, name);
  };

  // WebGL 2.0（Main World 中不存在跨上下文问题，call(this) 可正常工作）
  if (window.WebGL2RenderingContext) {
    const origProtoGetParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(pname) {
      if (pname === UNMASKED_VENDOR_WEBGL) return webglVendor;
      if (pname === UNMASKED_RENDERER_WEBGL) return webglRenderer;
      if (pname === VENDOR) return 'WebKit';
      if (pname === RENDERER) return 'WebKit WebGL';
      if (pname === VERSION) return 'WebGL 2.0 (OpenGL ES 3.0 Chromium)';
      if (pname === SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)';
      return origProtoGetParam2.call(this, pname);
    };

    const origProtoGetExt2 = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function(name) {
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
      }
      return origProtoGetExt2.call(this, name);
    };
  }

  // OffscreenCanvas 兜底
  if (typeof OffscreenCanvas !== 'undefined') {
    const origOffscreenGetContext = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function(type, attrs) {
      const ctx = origOffscreenGetContext.call(this, type, attrs);
      if (!ctx) return ctx;
      if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
        const origParam = ctx.getParameter.bind(ctx);
        ctx.getParameter = function(pname) {
          if (pname === UNMASKED_VENDOR_WEBGL) return webglVendor;
          if (pname === UNMASKED_RENDERER_WEBGL) return webglRenderer;
          return origParam(pname);
        };
      }
      return ctx;
    };
  }

  // ============ Phase 3.2 维度 3: WebGL 图像噪声 ============
  // 劫持 readPixels，在像素数据中添加与 Canvas 一致的噪声

  const originalReadPixels = WebGLRenderingContext.prototype.readPixels;
  WebGLRenderingContext.prototype.readPixels = function(x, y, width, height, format, type, pixels) {
    originalReadPixels.call(this, x, y, width, height, format, type, pixels);
    if (pixels && pixels.length) {
      for (let i = 0; i < pixels.length; i += 4) {
        const noise = Math.floor((canvasRandom() - 0.5) * 4);
        pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise));
        pixels[i+1] = Math.max(0, Math.min(255, pixels[i+1] + noise));
        pixels[i+2] = Math.max(0, Math.min(255, pixels[i+2] + noise));
      }
    }
  };

  // ============ Phase 3.2 维度 4: AudioContext 噪声 ============
  // 使用 audio_noise_seed 生成确定性噪声

  const audioSeed = CONFIG.audio_noise_seed || '8F3E2A1B';
  const audioRandom = createSeededRandom(audioSeed);

  // 劫持 AudioBuffer.copyFromChannel
  const originalCopyFromChannel = AudioBuffer.prototype.copyFromChannel;
  AudioBuffer.prototype.copyFromChannel = function(destination, channelNumber, startInChannel) {
    const result = originalCopyFromChannel.call(this, destination, channelNumber, startInChannel);
    for (let i = 0; i < destination.length; i++) {
      destination[i] += (audioRandom() - 0.5) * 0.0001;
    }
    return result;
  };

  // 劫持 AnalyserNode.getFloatFrequencyData
  const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
  AnalyserNode.prototype.getFloatFrequencyData = function(array) {
    originalGetFloatFrequencyData.call(this, array);
    for (let i = 0; i < array.length; i++) {
      array[i] += (audioRandom() - 0.5) * 0.1;
    }
  };

  // 劫持 AnalyserNode.getByteFrequencyData
  const originalGetByteFrequencyData = AnalyserNode.prototype.getByteFrequencyData;
  AnalyserNode.prototype.getByteFrequencyData = function(array) {
    originalGetByteFrequencyData.call(this, array);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.max(0, Math.min(255, array[i] + Math.floor((audioRandom() - 0.5) * 2)));
    }
  };

  // 劫持 AnalyserNode.getByteTimeDomainData
  const originalGetByteTimeDomainData = AnalyserNode.prototype.getByteTimeDomainData;
  AnalyserNode.prototype.getByteTimeDomainData = function(array) {
    originalGetByteTimeDomainData.call(this, array);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.max(0, Math.min(255, array[i] + Math.floor((audioRandom() - 0.5) * 2)));
    }
  };

  // ============ Phase 3.2 维度 5: ClientRects 坐标偏移 ============
  // 使用 rects_noise_seed 生成确定性偏移

  const rectsSeed = CONFIG.rects_noise_seed || '13104F15';
  const rectsRandom = createSeededRandom(rectsSeed);

  function rectsOffset() {
    return (rectsRandom() - 0.5) * 1.0;
  }

  // 劫持 Element.getBoundingClientRect
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function() {
    const rect = originalGetBoundingClientRect.call(this);
    const ox = rectsOffset(), oy = rectsOffset();
    return {
      x: rect.x + ox, y: rect.y + oy,
      width: rect.width, height: rect.height,
      top: rect.top + oy, right: rect.right + ox,
      bottom: rect.bottom + oy, left: rect.left + ox,
      toJSON: () => ({
        x: rect.x + ox, y: rect.y + oy, width: rect.width, height: rect.height,
        top: rect.top + oy, right: rect.right + ox, bottom: rect.bottom + oy, left: rect.left + ox
      })
    };
  };

  // 劫持 Element.getClientRects
  const originalGetClientRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function() {
    const rects = originalGetClientRects.call(this);
    const result = [];
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const ox = rectsOffset(), oy = rectsOffset();
      result.push({
        x: rect.x + ox, y: rect.y + oy, width: rect.width, height: rect.height,
        top: rect.top + oy, right: rect.right + ox, bottom: rect.bottom + oy, left: rect.left + ox
      });
    }
    result.item = function(index) { return this[index < 0 || index >= this.length ? undefined : this[index]]; };
    Object.defineProperty(result, 'length', { value: result.length, writable: false, configurable: true });
    return result;
  };

  // 劫持 Range.getBoundingClientRect 和 getClientRects
  const originalRangeGetBoundingClientRect = Range.prototype.getBoundingClientRect;
  Range.prototype.getBoundingClientRect = function() {
    const rect = originalRangeGetBoundingClientRect.call(this);
    const ox = rectsOffset(), oy = rectsOffset();
    return {
      x: rect.x + ox, y: rect.y + oy, width: rect.width, height: rect.height,
      top: rect.top + oy, right: rect.right + ox, bottom: rect.bottom + oy, left: rect.left + ox,
      toJSON: () => ({ x: rect.x + ox, y: rect.y + oy, width: rect.width, height: rect.height })
    };
  };

  const originalRangeGetClientRects = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function() {
    const rects = originalRangeGetClientRects.call(this);
    const result = [];
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const ox = rectsOffset(), oy = rectsOffset();
      result.push({
        x: rect.x + ox, y: rect.y + oy, width: rect.width, height: rect.height,
        top: rect.top + oy, right: rect.right + ox, bottom: rect.bottom + oy, left: rect.left + ox
      });
    }
    result.item = function(index) { return this[index < 0 || index >= this.length ? undefined : this[index]]; };
    Object.defineProperty(result, 'length', { value: result.length, writable: false, configurable: true });
    return result;
  };

  // ============ Phase 3.2 维度 6: 完整字体列表注入 ============
  // 注入 Windows 系统常见字体列表（约 300 个）

  const windowsFonts = [
    'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'Bahnschrift',
    'Calibri', 'Calibri Light', 'Cambria', 'Cambria Math', 'Candara',
    'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
    'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia',
    'HoloLens MDL2 Assets', 'Impact', 'Ink Free', 'Javanese Text',
    'Leelawadee UI', 'Leelawadee UI Semilight', 'Lucida Console', 'Lucida Sans Unicode',
    'Malgun Gothic', 'Malgun Gothic Semilight', 'Microsoft Himalaya', 'Microsoft JhengHei',
    'Microsoft JhengHei UI', 'Microsoft New Tai Lue', 'Microsoft PhagsPa',
    'Microsoft Sans Serif', 'Microsoft Tai Le', 'Microsoft YaHei', 'Microsoft YaHei UI',
    'Microsoft Yi Baiti', 'MingLiU-ExtB', 'Mongolian Baiti', 'MV Boli', 'Myanmar Text',
    'Nirmala UI', 'Nirmala UI Semilight', 'Palatino Linotype', 'Segoe MDL2 Assets',
    'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Black', 'Segoe UI Emoji',
    'Segoe UI Historic', 'Segoe UI Light', 'Segoe UI Semibold', 'Segoe UI Semilight',
    'Segoe UI Symbol', 'SimSun', 'SimSun-ExtB', 'Sitka Banner', 'Sitka Display',
    'Sitka Heading', 'Sitka Small', 'Sitka Subheading', 'Sitka Text', 'Sylfaen',
    'Symbol', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    'Webdings', 'Wingdings', 'Yu Gothic', 'Yu Gothic UI',
    'SimHei', 'FangSong', 'KaiTi', 'NSimSun', 'LiSu', 'YouYuan',
    'Agency FB', 'Algerian', 'Arial Unicode MS', 'Baskerville Old Face',
    'Bauhaus 93', 'Bell MT', 'Berlin Sans FB', 'Bernard MT Condensed',
    'Bodoni MT', 'Bodoni MT Black', 'Bodoni MT Condensed', 'Bodoni MT Poster Compressed',
    'Book Antiqua', 'Bookman Old Style', 'Bradley Hand ITC', 'Britannic Bold',
    'Broadway', 'Brush Script MT', 'Californian FB', 'Calisto MT',
    'Centaury Gothic', 'Century Schoolbook', 'Chiller', 'Colonna MT', 'Cooper Black',
    'Copperplate Gothic Bold', 'Copperplate Gothic Light', 'Curlz MT',
    'Edwardian Script ITC', 'Elephant', 'Engravers MT', 'Eras Bold ITC',
    'Eras Demi ITC', 'Eras Light ITC', 'Eras Medium ITC', 'Felix Titling',
    'Footlight MT Light', 'Forte', 'Franklin Gothic Book', 'Franklin Gothic Demi',
    'Franklin Gothic Demi Cond', 'Franklin Gothic Heavy', 'Franklin Gothic Medium Cond',
    'Freestyle Script', 'French Script MT', 'Garamond', 'Gigi',
    'Gill Sans MT', 'Gill Sans MT Condensed', 'Gill Sans MT Ext Condensed Bold',
    'Gill Sans Ultra Bold', 'Gloucester MT Extra Condensed', 'Goudy Old Style', 'Goudy Stout',
    'Haettenschweiler', 'Harlow Solid Italic', 'Harrington', 'High Tower Text',
    'Imprint MT Shadow', 'Informal Roman', 'Jokerman', 'Juice ITC', 'Kristen ITC',
    'Kunstler Script', 'Latha', 'Lucida Bright', 'Lucida Calligraphy', 'Lucida Fax',
    'Lucida Handwriting', 'Lucida Sans', 'Lucida Sans Typewriter', 'Magneto',
    'Maiandra GD', 'Matura MT Script Capitals', 'Mistral', 'Modern No. 20',
    'Monotype Corsiva', 'Niagara Engraved', 'Niagara Solid', 'OCR A Extended',
    'Old English Text MT', 'Onyx', 'Palace Script MT', 'Papyrus',
    'Parchment', 'Perpetua', 'Perpetua Titling MT', 'Playbill',
    'Poor Richard', 'Pristina', 'Rage Italic', 'Ravie',
    'Rockwell', 'Rockwell Condensed', 'Rockwell Extra Bold', 'Script MT Bold',
    'Showcard Gothic', 'Snap ITC', 'Stencil', 'Tw Cen MT',
    'Tw Cen MT Condensed', 'Tw Cen MT Condensed Extra Bold', 'Tempus Sans ITC',
    'Viner Hand ITC', 'Vivaldi', 'Vladimir Script', 'Wide Latin'
  ];

  // 劫持 document.fonts
  Object.defineProperty(document, 'fonts', {
    get: () => {
      const fontSet = {
        check: function(family, text) {
          const fontName = String(family).replace(/['"]/g, '').split(',')[0].trim();
          return windowsFonts.includes(fontName);
        },
        load: function(family, text) { return Promise.resolve([]); },
        size: windowsFonts.length,
        add: function() {}, delete: function() { return false; }, clear: function() {},
        forEach: function(cb) { windowsFonts.forEach(f => cb({ family: f })); },
        entries: function* () { for (const f of windowsFonts) yield [{ family: f }, { family: f }]; },
        keys: function* () { for (const f of windowsFonts) yield { family: f }; },
        values: function* () { for (const f of windowsFonts) yield { family: f }; },
        has: function(family) { return windowsFonts.includes(family); },
        [Symbol.iterator]: function* () { for (const f of windowsFonts) yield [{ family: f }, { family: f }]; }
      };
      // 对象创建完成后再绑定 ready，避免 TDZ 循环引用
      Object.defineProperty(fontSet, 'ready', {
        value: Promise.resolve(fontSet),
        writable: false,
        configurable: true
      });
      return fontSet;
    },
    configurable: true
  });

  // ============ Phase 3.2 维度 7: SpeechVoices 注入 ============
  // 根据 ui_language 返回匹配的语音包

  const uiLang = CONFIG.ui_language || 'zh-CN';
  const baseLang = uiLang.split('-')[0];

  const voiceMap = {
    'zh': [
      { name: 'Microsoft Huihui - Chinese (Simplified, PRC)', lang: 'zh-CN', default: true },
      { name: 'Microsoft Kangkang - Chinese (Simplified, PRC)', lang: 'zh-CN' },
      { name: 'Microsoft Yaoyao - Chinese (Simplified, PRC)', lang: 'zh-CN' },
      { name: 'Microsoft Tracy - Chinese (Traditional, Hong Kong SAR)', lang: 'zh-HK' },
      { name: 'Microsoft Yating - Chinese (Traditional, Taiwan)', lang: 'zh-TW' }
    ],
    'en': [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true },
      { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
      { name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB' }
    ],
    'de': [
      { name: 'Microsoft Hedda - German', lang: 'de-DE', default: true },
      { name: 'Microsoft Stefan - German', lang: 'de-DE' }
    ],
    'ja': [
      { name: 'Microsoft Ayumi - Japanese', lang: 'ja-JP', default: true },
      { name: 'Microsoft Ichiro - Japanese', lang: 'ja-JP' }
    ],
    'fr': [
      { name: 'Microsoft Hortense - French', lang: 'fr-FR', default: true },
      { name: 'Microsoft Paul - French', lang: 'fr-FR' }
    ],
    'ko': [
      { name: 'Microsoft Heami - Korean', lang: 'ko-KR', default: true }
    ],
    'ru': [
      { name: 'Microsoft Irina - Russian', lang: 'ru-RU', default: true }
    ],
    'es': [
      { name: 'Microsoft Helena - Spanish', lang: 'es-ES', default: true },
      { name: 'Microsoft Pablo - Spanish', lang: 'es-ES' }
    ]
  };

  function getVoicesForLanguage(lang) {
    const voices = (voiceMap[baseLang] || voiceMap['en']).map((v, idx) => ({
      voiceURI: `urn:ms-tts:voice:${v.name}`,
      name: v.name, lang: v.lang, localService: true, default: !!v.default || idx === 0
    }));
    return voices;
  }

  // 劫持 speechSynthesis.getVoices
  const originalGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
  window.speechSynthesis.getVoices = function() {
    return getVoicesForLanguage(uiLang);
  };

  // 阻止 voiceschanged 事件覆盖
  Object.defineProperty(window.speechSynthesis, 'onvoiceschanged', {
    value: null,
    writable: true,
    configurable: true
  });


})();

// ==================== Phase 3.3: 设备指纹完整化 + 一致性校验引擎（追加在文件末尾） ====================

(function() {
  'use strict';

  // 获取配置（从外层 IIFE 传递的 config）
  const CONFIG = typeof window.__GB_CONFIG__ !== 'undefined' 
    ? window.__GB_CONFIG__ 
    : {{CONFIG}};

  // ============ Phase 3.3 维度 1: 设备名称注入 ============
  // 注入 navigator.userAgentData/platform 等设备信息

  const deviceName = CONFIG.device_name || 'USER-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  const chromeVersion = CONFIG.chrome_version || '128';

  // Phase 4.0 Fix: 使用 CONFIG.os 映射 platform，避免硬编码
  const platformMap3 = {
    'windows': 'Windows', 'mac': 'macOS', 'linux': 'Linux',
    'android': 'Android', 'ios': 'iOS'
  };
  const platformVersionMap3 = {
    'windows': '15.0.0', 'mac': '14.0.0', 'linux': '6.0.0',
    'android': '14.0.0', 'ios': '17.0.0'
  };
  const platformStr3 = platformMap3[CONFIG.os] || 'Windows';
  const platformVer3 = platformVersionMap3[CONFIG.os] || '15.0.0';
  const arch3 = CONFIG.os === 'android' || CONFIG.os === 'ios' ? 'arm' : 'x86';
  const isMobile3 = CONFIG.os === 'android' || CONFIG.os === 'ios';

  // Phase 4.0 已经覆盖了 Navigator.prototype.userAgentData，这里不再重复覆盖
  // 只做补充：确保 userAgentData 的 brands 版本和 chromeVersion 一致

  // navigator.platform（数据属性）
  const platformValue3 = CONFIG.os === 'mac' ? 'MacIntel' : CONFIG.os === 'linux' ? 'Linux x86_64' : CONFIG.os === 'android' ? 'Linux armv8l' : CONFIG.os === 'ios' ? 'iPhone' : 'Win32';
  Object.defineProperty(navigator, 'platform', {
    value: platformValue3,
    writable: true,
    configurable: true,
    enumerable: true
  });

  // navigator.oscpu（Firefox 专有，Chrome 应为 undefined）
  // 不覆盖，让原生 undefined 暴露（真实 Chrome 中不存在）

  // navigator.cpuClass（IE 遗留，Chrome 应为 undefined）
  // 不覆盖，让原生 undefined 暴露

  // ============ Phase 3.3 维度 2: WebRTC 深度清理 ============
  // 在 disable 模式下，彻底删除所有 WebRTC 相关对象

  const webrtcMode = CONFIG.webrtc_mode || 'disable';

  if (webrtcMode === 'disable') {
    // 彻底删除所有 WebRTC 构造函数
    const webrtcConstructors = [
      'RTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate',
      'RTCIceTransport', 'RTCDtlsTransport', 'RTCIceGatherer',
      'RTCRtpSender', 'RTCRtpReceiver', 'RTCRtpTransceiver',
      'RTCDataChannel', 'RTCSctpTransport', 'RTCDTMFSender',
      'RTCDTMFToneChangeEvent', 'RTCStatsReport', 'RTCError', 'RTCErrorEvent'
    ];

    webrtcConstructors.forEach(ctor => {
      if (window[ctor] !== undefined) {
        try {
          delete window[ctor];
        } catch(e) {
          Object.defineProperty(window, ctor, {
            value: undefined,
            writable: true,
            configurable: true
          });
        }
      }
    });

    // 清理 navigator.mediaDevices
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function() {
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      };
      navigator.mediaDevices.enumerateDevices = function() {
        return Promise.resolve([]);
      };
    }
  }

  // replace 或 forward 模式下，劫持 RTCPeerConnection 清理 iceServers
  if (webrtcMode === 'replace' || webrtcMode === 'forward') {
    if (window.RTCPeerConnection) {
      const OriginalRTCPeerConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = function(config) {
        const cleanedConfig = config || {};
        if (webrtcMode === 'replace') {
          cleanedConfig.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
        }
        return new OriginalRTCPeerConnection(cleanedConfig);
      };
      window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    }
  }

  // ============ Phase 3.3 维度 3: 时区格式化完整化 ============
  // 确保 Intl.DateTimeFormat 的 formatToParts/resolvedOptions 与 timezone 配置一致

  const timezone = CONFIG.timezone || 'Asia/Shanghai';
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  const FakeDateTimeFormat3 = function(locales, options) {
    const opts = Object.assign({}, options, { timeZone: timezone });
    const instance = new OriginalDateTimeFormat(locales, opts);

    const originalFormat = instance.format.bind(instance);
    Object.defineProperty(instance, 'format', {
      value: function(date) { return originalFormat(date || new Date()); },
      writable: true,
      configurable: true
    });

    const originalFormatToParts = instance.formatToParts.bind(instance);
    instance.formatToParts = function(date) {
      const parts = originalFormatToParts(date || new Date());
      return parts.map(part => {
        if (part.type === 'timeZoneName') {
          return { ...part, value: timezone.split('/')[1] || timezone };
        }
        return part;
      });
    };

    const originalResolvedOptions = instance.resolvedOptions.bind(instance);
    instance.resolvedOptions = function() {
      const opts = originalResolvedOptions();
      opts.timeZone = timezone;
      return opts;
    };

    return instance;
  };
  FakeDateTimeFormat3.prototype = OriginalDateTimeFormat.prototype;
  FakeDateTimeFormat3.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf.bind(OriginalDateTimeFormat);
  FakeDateTimeFormat3.toString = function() {
    try { return OriginalDateTimeFormat.toString(); } catch(e) { return 'function DateTimeFormat() { [native code] }'; }
  };
  Intl.DateTimeFormat = FakeDateTimeFormat3;

  // 全局 resolvedOptions 劫持
  const originalProtoResolvedOptions = OriginalDateTimeFormat.prototype.resolvedOptions;
  OriginalDateTimeFormat.prototype.resolvedOptions = function() {
    const opts = originalProtoResolvedOptions.call(this);
    opts.timeZone = timezone;
    return opts;
  };

  // ============ Phase 3.3 维度 4: CSS 特性查询完整化 ============
  // 确保 CSS.supports 返回与 Chrome 版本一致的结果

  const ver = parseInt(chromeVersion) || 128;

  const chromeFeatures = {
    'container-type': ver >= 105,
    'container-queries': ver >= 105,
    'layer': ver >= 99,
    'nesting': ver >= 112,
    'has': ver >= 105,
    'anchor-positioning': ver >= 125,
    'view-transition': ver >= 126,
    'grid': true, 'flexbox': true, 'custom-properties': true,
    'transforms': true, 'animations': true, 'transitions': true,
    'filters': true, 'clip-path': true, 'aspect-ratio': ver >= 88,
    'accent-color': ver >= 93, 'color-mix': ver >= 111,
    'font-palette': ver >= 101, 'math': ver >= 109
  };

  const originalSupports = CSS.supports.bind(CSS);
  CSS.supports = function(property, value) {
    if (arguments.length === 1) {
      const cond = property;
      if (cond.includes('container-type')) return !!chromeFeatures['container-type'];
      if (cond.includes('container-queries')) return !!chromeFeatures['container-queries'];
      if (cond.includes('has(')) return !!chromeFeatures['has'];
      if (cond.includes('anchor')) return !!chromeFeatures['anchor-positioning'];
      if (cond.includes('view-transition')) return !!chromeFeatures['view-transition'];
      if (cond.includes('layer')) return !!chromeFeatures['layer'];
      if (cond.includes('nesting')) return !!chromeFeatures['nesting'];
      if (cond.includes('grid')) return true;
      if (cond.includes('flex')) return true;
      if (cond.startsWith('--')) return true;
      return originalSupports(cond);
    }
    const prop = String(property).toLowerCase();
    if (prop === 'display' && value && value.includes('grid')) return true;
    if (prop === 'display' && value && value.includes('flex')) return true;
    if (prop.startsWith('--')) return true;
    return originalSupports(property, value);
  };

  // ============ Phase 3.3 维度 5: navigator 对象补充 ============
  // 补全可能被检测的缺失属性（覆盖 Navigator.prototype getter）

  // pdfViewerEnabled - 数据属性
  Object.defineProperty(navigator, 'pdfViewerEnabled', { 
    value: true, 
    writable: true, 
    configurable: true, 
    enumerable: true 
  });

  // bluetooth - 不覆盖，让原生值暴露（真实 Chrome 中可能是 Bluetooth 对象或 undefined）
  // 如果必须覆盖，需要模拟 Bluetooth 对象，这里选择不覆盖更安全

  // clipboard - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origClip = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
    if (origClip && origClip.get) {
      const getter = window.__GB_nativeGetter('clipboard', function() {
        return {
          read: () => Promise.reject(new DOMException('Permission denied')),
          readText: () => Promise.reject(new DOMException('Permission denied')),
          write: () => Promise.reject(new DOMException('Permission denied')),
          writeText: () => Promise.reject(new DOMException('Permission denied'))
        };
      });
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // credentials - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origCred = Object.getOwnPropertyDescriptor(Navigator.prototype, 'credentials');
    if (origCred && origCred.get) {
      const getter = window.__GB_nativeGetter('credentials', function() {
        return {
          get: () => Promise.resolve(null),
          create: () => Promise.reject(new DOMException('Not allowed')),
          preventSilentAccess: () => Promise.resolve()
        };
      });
      Object.defineProperty(Navigator.prototype, 'credentials', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // keyboard - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origKb = Object.getOwnPropertyDescriptor(Navigator.prototype, 'keyboard');
    if (origKb && origKb.get) {
      const getter = window.__GB_nativeGetter('keyboard', function() {
        return {
          getLayoutMap: () => Promise.resolve({
            has: () => true, get: () => 'KeyA',
            entries: function* () {}, keys: function* () {},
            values: function* () {}, forEach: () => {}, size: 0
          }),
          lock: () => Promise.resolve(), unlock: () => Promise.resolve()
        };
      });
      Object.defineProperty(Navigator.prototype, 'keyboard', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // mediaCapabilities - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origMc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaCapabilities');
    if (origMc && origMc.get) {
      const getter = window.__GB_nativeGetter('mediaCapabilities', function() {
        return {
          decodingInfo: (config) => Promise.resolve({ supported: true, smooth: true, powerEfficient: true }),
          encodingInfo: (config) => Promise.resolve({ supported: true, smooth: true, powerEfficient: true })
        };
      });
      Object.defineProperty(Navigator.prototype, 'mediaCapabilities', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // wakeLock - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origWl = Object.getOwnPropertyDescriptor(Navigator.prototype, 'wakeLock');
    if (origWl && origWl.get) {
      const getter = window.__GB_nativeGetter('wakeLock', function() {
        return {
          request: (type) => Promise.resolve({
            type: type || 'screen', released: false,
            release: () => Promise.resolve(),
            addEventListener: () => {}, removeEventListener: () => {}
          })
        };
      });
      Object.defineProperty(Navigator.prototype, 'wakeLock', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // scheduling - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origSch = Object.getOwnPropertyDescriptor(Navigator.prototype, 'scheduling');
    if (origSch && origSch.get) {
      const getter = window.__GB_nativeGetter('scheduling', function() {
        return { isInputPending: () => false };
      });
      Object.defineProperty(Navigator.prototype, 'scheduling', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // presentation - Navigator.prototype getter
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const origPres = Object.getOwnPropertyDescriptor(Navigator.prototype, 'presentation');
    if (origPres && origPres.get) {
      const getter = window.__GB_nativeGetter('presentation', function() {
        return { defaultRequest: null, receiver: null };
      });
      Object.defineProperty(Navigator.prototype, 'presentation', {
        get: getter,
        configurable: true,
        enumerable: true
      });
    }
  }

  // ============ Phase 3.3 维度 6: window 对象补充 ============

  if (!window.visualViewport) {
    Object.defineProperty(window, 'visualViewport', {
      value: {
        width: window.innerWidth, height: window.innerHeight, scale: 1,
        offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0,
        onresize: null, onscroll: null, addEventListener: () => {}, removeEventListener: () => {}
      },
      writable: true,
      configurable: true
    });
  }

  Object.defineProperty(window, 'originAgentCluster', { 
    value: false, 
    writable: true, 
    configurable: true 
  });


})();

// ==================== Phase 3.4: 行为模拟引擎（鼠标/滚动/点击）- 追加在文件末尾 ====================

(function() {
  'use strict';

  // 等待页面加载完成后再注入行为模拟（与 document_start 的指纹注入区分开）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBehaviorEngine);
  } else {
    initBehaviorEngine();
  }

  function initBehaviorEngine() {
    // 行为模拟配置（从 config 读取，默认启用）
    const behaviorEnabled = typeof config !== 'undefined' ? (config.behavior_enabled !== false) : true;

    if (!behaviorEnabled) {

      return;
    }



    // ===== 维度 1: 鼠标轨迹模拟 —— 贝塞尔曲线插值 =====
    // Fitts 定律：距离越短速度越慢，距离越长先加速后减速

    const mouseConfig = {
      enabled: true,
      speed: 'normal' // 'slow' / 'normal' / 'fast'
    };

    let lastMouseX = 0;
    let lastMouseY = 0;
    let isAnimating = false;
    let targetX = 0;
    let targetY = 0;
    let animationId = null;

    // 三次贝塞尔曲线插值
    function cubicBezier(t, p0, p1, p2, p3) {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    // 计算两点距离
    function getDistance(x1, y1, x2, y2) {
      return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    }

    // 根据速度配置调整时间倍率
    function getSpeedMultiplier() {
      return mouseConfig.speed === 'slow' ? 1.5 : mouseConfig.speed === 'fast' ? 0.7 : 1.0;
    }

    // 平滑移动到目标点（贝塞尔曲线）
    function smoothMoveTo(toX, toY) {
      const fromX = lastMouseX;
      const fromY = lastMouseY;
      const distance = getDistance(fromX, fromY, toX, toY);

      // 距离太小跳过（避免过度模拟）
      if (distance < 5) {
        lastMouseX = toX;
        lastMouseY = toY;
        return;
      }

      const duration = Math.max(100, Math.min(distance * 2, 1000)) * getSpeedMultiplier();
      const startTime = performance.now();

      // 生成随机控制点使曲线不规则
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      const offset = distance * 0.2;
      const cp1x = midX + (Math.random() - 0.5) * offset;
      const cp1y = midY + (Math.random() - 0.5) * offset;
      const cp2x = midX + (Math.random() - 0.5) * offset;
      const cp2y = midY + (Math.random() - 0.5) * offset;

      function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // ease-in-out 缓动
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentX = cubicBezier(eased, fromX, cp1x, cp2x, toX);
        const currentY = cubicBezier(eased, fromY, cp1y, cp2y, toY);

        lastMouseX = currentX;
        lastMouseY = currentY;

        if (progress < 1) {
          animationId = requestAnimationFrame(animate);
        }
      }

      if (animationId) cancelAnimationFrame(animationId);
      animationId = requestAnimationFrame(animate);
    }

    // ===== 维度 2: 神经肌肉抖动 —— 目标附近随机晃动 =====

    function addJitterToClick(element) {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // 在中心附近 ±3px 范围内随机偏移
      const jitterX = (Math.random() - 0.5) * 6;
      const jitterY = (Math.random() - 0.5) * 6;
      return { x: centerX + jitterX, y: centerY + jitterY };
    }

    // 劫持 HTMLElement.prototype.click
    const originalClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function() {
      const jittered = addJitterToClick(this);
      smoothMoveTo(jittered.x, jittered.y);
      // 延迟后点击（模拟人类反应时间）
      setTimeout(() => {
        originalClick.call(this);
      }, 50 + Math.random() * 100);
    };

    // 劫持 MouseEvent，为鼠标事件添加微小抖动
    const OriginalMouseEvent = window.MouseEvent;
    window.MouseEvent = function(type, init) {
      const opts = init || {};
      if (['mousedown', 'mouseup', 'click'].includes(type) && opts.clientX !== undefined) {
        opts.clientX += (Math.random() - 0.5) * 2;
        opts.clientY += (Math.random() - 0.5) * 2;
      }
      return new OriginalMouseEvent(type, opts);
    };
    window.MouseEvent.prototype = OriginalMouseEvent.prototype;

    // ===== 维度 3: 滚动行为模拟 —— 惯性滚动 + 随机停顿 + 偶尔回滚 =====

    function inertiaScrollTo(targetY) {
      const startY = window.scrollY || window.pageYOffset;
      const distance = targetY - startY;
      const duration = Math.abs(distance) * 0.5 + 200;
      const startTime = performance.now();
      const shouldOvershoot = Math.random() < 0.15; // 15% 概率回滚
      const overshootAmount = shouldOvershoot ? distance * 0.1 : 0;

      function scrollAnim(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out-cubic（先快后慢）
        const eased = 1 - Math.pow(1 - progress, 3);
        let currentY = startY + distance * eased;

        // 回滚效果
        if (shouldOvershoot && progress > 0.8) {
          currentY -= overshootAmount * Math.sin((progress - 0.8) / 0.2 * Math.PI);
        }

        window.scrollTo(0, currentY);

        if (progress < 1) {
          requestAnimationFrame(scrollAnim);
        } else {
          // 随机停顿（模拟阅读时间）
          setTimeout(() => {
            if (Math.abs(window.scrollY - targetY) > 10) {
              inertiaScrollTo(targetY);
            }
          }, 200 + Math.random() * 800);
        }
      }
      requestAnimationFrame(scrollAnim);
    }

    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function(x, y) {
      if (typeof x === 'object') {
        return originalScrollTo(x);
      }
      inertiaScrollTo(y);
    };

    const originalScrollBy = window.scrollBy.bind(window);
    window.scrollBy = function(x, y) {
      if (typeof x === 'object') {
        return originalScrollBy(x);
      }
      inertiaScrollTo((window.scrollY || 0) + y);
    };

    // ===== 维度 4: 点击时机模拟 —— Gaussian 分布随机延迟 =====

    // Box-Muller 变换生成 Gaussian 随机数
    function gaussianRandom(mean, stdDev) {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdDev + mean;
    }

    // 劫持 EventTarget.prototype.dispatchEvent，为鼠标事件添加延迟
    const originalDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
      if (!(event instanceof MouseEvent)) {
        return originalDispatch.call(this, event);
      }

      const delay = Math.max(50, gaussianRandom(150, 50)); // μ=150ms, σ=50ms, 最小 50ms
      setTimeout(() => {
        originalDispatch.call(this, event);
      }, delay);
      return true;
    };

    // ===== 维度 5: 按键节奏模拟 —— 人类打字间隔 =====

    // 获取打字间隔（非匀速，有快有慢）
    function getTypingInterval() {
      const base = 50 + Math.random() * 150; // 基础 50-200ms
      if (Math.random() < 0.05) return base + 300 + Math.random() * 700; // 5% 长停顿
      if (Math.random() < 0.1) return 30 + Math.random() * 40; // 10% 快速连击
      return base;
    }

    // 暴露打字模拟函数（供自动化脚本调用）
    window.__ghostbrowse_simulateTyping = function(element, text) {
      return new Promise((resolve) => {
        let index = 0;
        element.focus();
        element.value = '';

        function typeNext() {
          if (index >= text.length) { resolve(); return; }
          const char = text[index++];
          element.value += char;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(typeNext, getTypingInterval());
        }
        typeNext();
      });
    };


  }
})();

// ==================== Phase 3.5: 增量式 Session 标签页持久化引擎 ====================
//
// 核心变更（解决重复 URL 与 Session Restore 叠加问题）：
//   1. 事件驱动：URL/标题/可见性变化时立即上报（本地 diff，无变化不发请求）
//   2. 心跳兜底：每 30 秒 ping 一次，让后端知道标签页仍存活（用于死标签清理）
//   3. 关闭标记：beforeunload 时 sendBeacon 发送 action='close'，后端可立即删除
//   4. SPA 兼容：劫持 history.pushState/replaceState，监听 hashchange/popstate
//   5. 与 Electron CDP 配合：如 launcher.ts 同时运行 CDP 轮询，建议将 CDP 轮询
//      改为 60 秒一次的校验轮询，或完全废弃，避免双重上报导致重复 URL
//
// 后端配合要求：
//   - POST /api/v1/profiles/:id/session-tabs 需支持 action 字段：
//     * action='upsert'：插入或更新（以 profile_id + url + source='extension' 为联合键）
//     * action='close'：删除该条记录（或标记 is_active=0）
//   - 后端定时任务：删除超过 90 秒未收到心跳/更新的标签页（视为进程已死）
//   - 如保留 CDP 的 /session-tabs/bulk 接口，建议改为增量 diff 逻辑，或确保
//     同一 profile 不会同时接收 Extension 增量与 CDP 全量两种上报
//
// launcher.ts 必须配合的 3 处修改（详见下方说明）：
//   A. 启动参数加 '--no-startup-window'（禁用 Chromium 自带 Session Restore）
//   B. 废弃 CDP 5 秒轮询，或改为 60 秒低频校验
//   C. 启动恢复逻辑：先检查 browser.pages()，如已有真实标签页则不再从数据库恢复

(function() {
  'use strict';

  // ===== 关键修复：只在主页面（top frame）执行，忽略所有 iframe / 广告 / reCAPTCHA =====
  if (window.self !== window.top) {
    return;
  }

  // 获取配置
  let CONFIG;
  try {
    CONFIG = typeof window.__GB_CONFIG__ !== 'undefined'
      ? window.__GB_CONFIG__
      : {{CONFIG}};
  } catch(e) {
    console.error('[GB Session] ❌ CONFIG 解析失败:', e.message);
    return;
  }

  const profileId = CONFIG.profile_id;
  if (!profileId) {
    console.warn('[GhostBrowse Phase 3.5] profile_id 未配置，跳过 Session 持久化');
    return;
  }

  // ===== 配置常量 =====
  const HEARTBEAT_INTERVAL = 30000; // 30 秒心跳（保活 / 后端清理死标签依据）
  const DEBOUNCE_MS = 800;          // 标题变化防抖（ms）
  const COOLDOWN_MS = 500;          // 同一状态最短上报间隔（防事件风暴）

  // ===== 运行时状态 =====
  let lastState = { url: '', title: '', active: 1 };
  let lastReportAt = 0;
  let reportTimer = null;
  let heartbeatTimer = null;
  let isReporting = false;
  let isUnloaded = false;

  // ===== 工具函数 =====
  function getCurrentState() {
    return {
      url: window.location.href,
      title: document.title || '',
      active: document.visibilityState === 'visible' ? 1 : 0
    };
  }

  function stateKey(s) {
    return `${s.url}::${s.title}::${s.active}`;
  }

  // ===== 核心上报函数（带并发锁） =====
  async function doReport(action) {
    if (isReporting || isUnloaded) return;

    const now = Date.now();
    const state = getCurrentState();

    // 增量过滤：非心跳且状态未变，跳过
    if (action === 'upsert' && stateKey(state) === stateKey(lastState)) {
      return;
    }

    // 冷却过滤：防止高频事件连续触发（如 title 频繁更新）
    if (action === 'upsert' && (now - lastReportAt) < COOLDOWN_MS) {
      if (reportTimer) clearTimeout(reportTimer);
      reportTimer = setTimeout(() => doReport('upsert'), COOLDOWN_MS);
      return;
    }

    isReporting = true;
    lastReportAt = now;

    try {
      const payload = {
        url: state.url,
        title: state.title,
        active: state.active,
        action: action,        // 'upsert' | 'close'
        source: 'extension', // 标识来源，便于后端区分 Extension 与 CDP
        reportedAt: now
      };

      const res = await fetch(
        `http://localhost:3000/api/v1/profiles/${profileId}/session-tabs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      if (res.ok) {
        lastState = { ...state };
        if (action === 'close') {
          isUnloaded = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      } else {
        console.warn(`[GB Session] 上报失败 HTTP ${res.status}`);
      }
    } catch (err) {
      // 静默失败，不影响页面功能
      console.warn(`[GB Session] 上报异常: ${err.message}`);
    } finally {
      isReporting = false;
    }
  }

  // ===== 防抖上报（用于高频事件） =====
  function debouncedReport() {
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(() => doReport('upsert'), DEBOUNCE_MS);
  }

  // ===== 心跳上报（强制刷新后端存活时间） =====
  function heartbeatReport() {
    doReport('upsert');
  }

  // ===== 事件监听：精准捕获标签页生命周期 =====

  // 1. 页面初始加载
  function onInitialLoad() {
    setTimeout(() => doReport('upsert'), 100);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    onInitialLoad();
  } else {
    window.addEventListener('DOMContentLoaded', onInitialLoad);
  }

  // 2. Hash 路由变化（传统 SPA / 锚点跳转）
  window.addEventListener('hashchange', () => doReport('upsert'));

  // 3. History API 路由变化（React Router / Vue Router 等现代 SPA）
  const origPushState = history.pushState;
  history.pushState = function(...args) {
    origPushState.apply(this, args);
    setTimeout(() => doReport('upsert'), 50);
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    origReplaceState.apply(this, args);
    setTimeout(() => doReport('upsert'), 50);
  };

  // 4. 浏览器前进/后退（popstate）
  window.addEventListener('popstate', () => doReport('upsert'));

  // 5. 标题变化（MutationObserver 监听 <title>）
  const titleEl = document.querySelector('head > title');
  if (titleEl) {
    const titleObserver = new MutationObserver(() => debouncedReport());
    titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });
  }

  // 6. 可见性变化（切换标签页 / 最小化）
  document.addEventListener('visibilitychange', () => doReport('upsert'));

  // 7. 窗口获得焦点（用户切回此标签页）
  window.addEventListener('focus', () => doReport('upsert'));

  // 8. 页面关闭前：标记关闭（sendBeacon 可靠发送，不阻塞卸载）
  window.addEventListener('beforeunload', () => {
    const state = getCurrentState();
    navigator.sendBeacon(
      `http://localhost:3000/api/v1/profiles/${profileId}/session-tabs`,
      JSON.stringify({
        url: state.url,
        title: state.title,
        active: 0,
        action: 'close',
        source: 'extension'
      })
    );
    isUnloaded = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  });

  // 9. 页面冻结/恢复（移动端/后台标签页）
  document.addEventListener('freeze', () => doReport('upsert'));
  document.addEventListener('resume', () => doReport('upsert'));

  // ===== 启动心跳 =====
  heartbeatTimer = setInterval(heartbeatReport, HEARTBEAT_INTERVAL);

})();

// ==================== Phase 4.0 Fix: Worker / SharedWorker 拦截 ====================
// Worker 运行在独立全局上下文，Content Script 无法直接注入。
// 方案：拦截 Worker 构造函数，通过 Blob URL 包装原始脚本，前置注入代码。
(function() {
  'use strict';

  const OriginalWorker = window.Worker;
  const OriginalSharedWorker = window.SharedWorker;
  const OriginalURLCreateObjectURL = window.URL.createObjectURL;
  const OriginalURLRevokeObjectURL = window.URL.revokeObjectURL;

  // 生成注入前缀代码（与主页面一致的反检测环境）
  function buildWorkerInjectPrefix() {
    return `
      // GhostBrowse Worker 环境注入
      (function() {
        'use strict';
        // 覆盖 navigator.userAgentData
        if (typeof navigator !== 'undefined') {
          Object.defineProperty(navigator, 'userAgentData', {
            get: function() {
              return {
                brands: [{ brand: 'Chromium', version: '128' }, { brand: 'Not.A/Brand', version: '24' }, { brand: 'Google Chrome', version: '128' }],
                mobile: false,
                platform: 'Windows',
                getHighEntropyValues: function(hints) {
                  return Promise.resolve({
                    architecture: 'x86', bitness: '64', brands: this.brands,
                    fullVersionList: [{ brand: 'Chromium', version: '128.0.6099.130' }, { brand: 'Not.A/Brand', version: '24.0.0.0' }, { brand: 'Google Chrome', version: '128.0.6099.130' }],
                    mobile: false, model: '', platform: 'Windows', platformVersion: '15.0.0',
                    uaFullVersion: '128.0.6099.130', wow64: false
                  });
                },
                toJSON: function() { return { brands: this.brands, mobile: this.mobile, platform: this.platform }; }
              };
            },
            configurable: true
          });
          Object.defineProperty(navigator, 'platform', { value: 'Win32', writable: true, configurable: true });
          Object.defineProperty(navigator, 'webdriver', { value: undefined, writable: true, configurable: true });
          Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, writable: true, configurable: true });
          Object.defineProperty(navigator, 'deviceMemory', { value: 8, writable: true, configurable: true });
          Object.defineProperty(navigator, 'language', { value: 'zh-CN', writable: true, configurable: true });
          Object.defineProperty(navigator, 'languages', { value: ['zh-CN', 'zh', 'en-US', 'en'], writable: true, configurable: true });
        }
        // 禁用 WebRTC in Worker
        if (typeof self !== 'undefined') {
          self.RTCPeerConnection = undefined;
          self.webkitRTCPeerConnection = undefined;
        }
      })();
    `;
  }

  if (OriginalWorker) {
    window.Worker = function(scriptURL, options) {
      try {
        // 如果是 Blob URL 或 data URL，直接创建
        if (String(scriptURL).startsWith('blob:') || String(scriptURL).startsWith('data:')) {
          return new OriginalWorker(scriptURL, options);
        }
        // 同源 Worker：尝试 fetch 并包装
        const prefix = buildWorkerInjectPrefix();
        // 使用 importScripts 方式注入（跨域 Worker 可用）
        const wrappedScript = prefix + '\nimportScripts("' + String(scriptURL).replace(/"/g, '\\"') + '");';
        const blob = new Blob([wrappedScript], { type: 'application/javascript' });
        const blobURL = OriginalURLCreateObjectURL(blob);
        const worker = new OriginalWorker(blobURL, options);
        // 延迟释放 Blob URL（避免 Worker 尚未加载完成 URL 被回收）
        setTimeout(() => { try { OriginalURLRevokeObjectURL(blobURL); } catch(e) {} }, 5000);
        return worker;
      } catch (e) {
        // 包装失败时回退到原始 Worker
        return new OriginalWorker(scriptURL, options);
      }
    };
    window.Worker.prototype = OriginalWorker.prototype;
  }

  if (OriginalSharedWorker) {
    window.SharedWorker = function(scriptURL, nameOrOptions) {
      try {
        if (String(scriptURL).startsWith('blob:') || String(scriptURL).startsWith('data:')) {
          return new OriginalSharedWorker(scriptURL, nameOrOptions);
        }
        const prefix = buildWorkerInjectPrefix();
        const wrappedScript = prefix + '\nimportScripts("' + String(scriptURL).replace(/"/g, '\\"') + '");';
        const blob = new Blob([wrappedScript], { type: 'application/javascript' });
        const blobURL = OriginalURLCreateObjectURL(blob);
        const worker = new OriginalSharedWorker(blobURL, nameOrOptions);
        setTimeout(() => { try { OriginalURLRevokeObjectURL(blobURL); } catch(e) {} }, 5000);
        return worker;
      } catch (e) {
        return new OriginalSharedWorker(scriptURL, nameOrOptions);
      }
    };
    window.SharedWorker.prototype = OriginalSharedWorker.prototype;
  }
})();

// ==================== Phase 4.1: toString 伪装修复 ====================
// 检测站通过检查函数 toString 是否包含 [native code] 来识别注入
// 此代码在文件末尾执行，修复所有 Content Script 注入函数的 toString
(function() {
  'use strict';

  function fixToString(fn, name) {
    if (typeof fn !== 'function') return;
    // 使用 Function.prototype.toString.call 获取原始 toString 输出
    const orig = Function.prototype.toString.call.bind(Function.prototype.toString);
    fn.toString = function() {
      try {
        const str = orig(this);
        if (typeof str === 'string' && !str.includes('[native code]')) {
          return 'function ' + (name || fn.name || '') + '() { [native code] }';
        }
        return str;
      } catch(e) {
        return 'function ' + (name || fn.name || '') + '() { [native code] }';
      }
    };
  }

  const targets = [
    ['HTMLCanvasElement.prototype.getContext', HTMLCanvasElement.prototype.getContext],
    ['CanvasRenderingContext2D.prototype.fillText', CanvasRenderingContext2D.prototype.fillText],
    ['CanvasRenderingContext2D.prototype.strokeText', CanvasRenderingContext2D.prototype.strokeText],
    ['CanvasRenderingContext2D.prototype.measureText', CanvasRenderingContext2D.prototype.measureText],
    ['CanvasRenderingContext2D.prototype.isPointInPath', CanvasRenderingContext2D.prototype.isPointInPath],
    ['CanvasRenderingContext2D.prototype.getImageData', CanvasRenderingContext2D.prototype.getImageData],
    ['WebGLRenderingContext.prototype.getParameter', WebGLRenderingContext.prototype.getParameter],
    ['WebGLRenderingContext.prototype.getExtension', WebGLRenderingContext.prototype.getExtension],
    ['WebGLRenderingContext.prototype.getSupportedExtensions', WebGLRenderingContext.prototype.getSupportedExtensions],
    ['WebGLRenderingContext.prototype.readPixels', WebGLRenderingContext.prototype.readPixels],
    ['WebGL2RenderingContext.prototype.getParameter', window.WebGL2RenderingContext?.prototype.getParameter],
    ['WebGL2RenderingContext.prototype.getExtension', window.WebGL2RenderingContext?.prototype.getExtension],
    ['AudioBuffer.prototype.copyFromChannel', AudioBuffer.prototype.copyFromChannel],
    ['AnalyserNode.prototype.getFloatFrequencyData', AnalyserNode.prototype.getFloatFrequencyData],
    ['AnalyserNode.prototype.getByteFrequencyData', AnalyserNode.prototype.getByteFrequencyData],
    ['AnalyserNode.prototype.getByteTimeDomainData', AnalyserNode.prototype.getByteTimeDomainData],
    ['Element.prototype.getBoundingClientRect', Element.prototype.getBoundingClientRect],
    ['Element.prototype.getClientRects', Element.prototype.getClientRects],
    ['Range.prototype.getBoundingClientRect', Range.prototype.getBoundingClientRect],
    ['Range.prototype.getClientRects', Range.prototype.getClientRects],
    ['Date.prototype.getTimezoneOffset', Date.prototype.getTimezoneOffset],
    ['Intl.DateTimeFormat', Intl.DateTimeFormat],
    ['window.scrollTo', window.scrollTo],
    ['window.scrollBy', window.scrollBy],
    ['history.pushState', history.pushState],
    ['history.replaceState', history.replaceState],
    ['EventTarget.prototype.dispatchEvent', EventTarget.prototype.dispatchEvent],
    ['HTMLElement.prototype.click', HTMLElement.prototype.click],
    ['Notification.requestPermission', Notification.requestPermission],
    ['navigator.geolocation.getCurrentPosition', navigator.geolocation.getCurrentPosition],
    ['navigator.geolocation.watchPosition', navigator.geolocation.watchPosition],
    ['navigator.mediaDevices.enumerateDevices', navigator.mediaDevices?.enumerateDevices],
    ['navigator.mediaDevices.getUserMedia', navigator.mediaDevices?.getUserMedia],
    ['navigator.permissions.query', navigator.permissions.query],
    ['CSS.supports', CSS.supports],
    ['speechSynthesis.getVoices', speechSynthesis.getVoices],
    ['navigator.plugins.item', navigator.plugins?.item],
    ['navigator.plugins.namedItem', navigator.plugins?.namedItem],
    ['navigator.plugins.refresh', navigator.plugins?.refresh],
    ['navigator.mimeTypes.item', navigator.mimeTypes?.item],
    ['navigator.mimeTypes.namedItem', navigator.mimeTypes?.namedItem],
  ];

  targets.forEach(([name, fn]) => {
    if (typeof fn === 'function') fixToString(fn, name.split('.').pop());
  });

  // 修复 Navigator.prototype getter 的 toString
  if (typeof Navigator !== 'undefined' && Navigator.prototype) {
    const navigatorProtoTargets = [
      ['Navigator.prototype.languages', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages')?.get],
      ['Navigator.prototype.userAgentData', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgentData')?.get],
      ['Navigator.prototype.hardwareConcurrency', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency')?.get],
      ['Navigator.prototype.deviceMemory', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'deviceMemory')?.get],
      ['Navigator.prototype.bluetooth', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'bluetooth')?.get],
      ['Navigator.prototype.connection', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'connection')?.get],
      ['Navigator.prototype.permissions', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'permissions')?.get],
      ['Navigator.prototype.clipboard', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')?.get],
      ['Navigator.prototype.credentials', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'credentials')?.get],
      ['Navigator.prototype.keyboard', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'keyboard')?.get],
      ['Navigator.prototype.mediaCapabilities', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaCapabilities')?.get],
      ['Navigator.prototype.wakeLock', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'wakeLock')?.get],
      ['Navigator.prototype.scheduling', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'scheduling')?.get],
      ['Navigator.prototype.presentation', () => Object.getOwnPropertyDescriptor(Navigator.prototype, 'presentation')?.get],
    ];
    navigatorProtoTargets.forEach(([name, getterFn]) => {
      const getter = getterFn();
      if (typeof getter === 'function') fixToString(getter, name.split('.').pop());
    });
  }
})();
