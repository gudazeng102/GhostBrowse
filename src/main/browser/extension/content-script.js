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

(function() {
  'use strict';
  
  // 获取配置（运行时由 launcher.ts 替换）
  const config = {{CONFIG}};
  
  // ==================== 0. WebDriver 反检测（替代 --disable-blink-features） ====================
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true
  });
  
  // 清理 chrome 对象上的自动化痕迹
  if (window.chrome) {
    Object.defineProperty(window.chrome, 'runtime', {
      get: () => undefined,
      configurable: true
    });
  }
  
  // 覆盖 Permissions API 中的 query 行为
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
  
  // ==================== 4. 时区 - 基于配置 ====================
  if (config.timezone_mode === 'ip' && config.timezone) {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(locales, options) {
      return new originalDateTimeFormat(locales, { ...options, timeZone: config.timezone });
    };
    
    // 覆盖 Date 的一些方法
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function() {
      // 计算配置时区的偏移量
      const tzOffset = {
        'Asia/Shanghai': -480,
        'America/New_York': 300,
        'Europe/London': 0,
        'Asia/Tokyo': -540
      };
      return tzOffset[config.timezone] !== undefined ? tzOffset[config.timezone] : originalGetTimezoneOffset.call(this);
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
      writable: false,
      configurable: true
    });
    
    Object.defineProperty(window.screen, 'height', { 
      value: height, 
      writable: false,
      configurable: true
    });
    
    Object.defineProperty(window.screen, 'availWidth', { 
      value: width, 
      writable: false,
      configurable: true
    });
    
    Object.defineProperty(window.screen, 'availHeight', { 
      value: height - 40, // 减去任务栏高度
      writable: false,
      configurable: true
    });
    
    Object.defineProperty(window.screen, 'availTop', { 
      value: 0, 
      writable: false,
      configurable: true
    });
    
    Object.defineProperty(window.screen, 'availLeft', { 
      value: 0, 
      writable: false,
      configurable: true
    });
  }
  
  // ==================== 8. 语言设置 ====================
  if (config.ui_language) {
    Object.defineProperty(navigator, 'language', { 
      value: config.ui_language,
      writable: false,
      configurable: true
    });
    
    Object.defineProperty(navigator, 'languages', { 
      value: [config.ui_language, 'en-US', 'en'],
      writable: false,
      configurable: true
    });
    
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
      configurable: true
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
  try {
    const cdcVars = Object.keys(window).filter(k => k.startsWith('cdc_') || k.startsWith('$chrome_'));
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
      get: function() {
        return {
          id: '',
          manifest: { name: 'GhostBrowse', version: '1.0', manifest_version: 3 },
          getManifest: function() { return this.manifest; },
          getURL: function(path) { return 'chrome-extension://fake-id/' + path; },
          connect: function() { return { onMessage: { addListener: function() {} }, postMessage: function() {} }; },
          sendMessage: function(msg, cb) { if (cb) setTimeout(cb, 0); },
          onInstalled: { addListener: function() {} },
          onUpdateAvailable: { addListener: function() {} }
        };
      },
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
  if (!navigator.plugins || navigator.plugins.length === 0) {
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
    mockPlugins.item = function(index) { return this[index < 0 || index >= this.length ? undefined : this[index]]; };
    mockPlugins.namedItem = function(name) {
      for (let i = 0; i < this.length; i++) {
        if (this[i].name === name) return this[i];
      }
      return null;
    };
    Object.defineProperty(mockPlugins, 'length', { value: 3, writable: false, configurable: true });

    Object.defineProperty(navigator, 'plugins', {
      get: function() { return mockPlugins; },
      configurable: true,
      enumerable: true
    });

    // ============ Phase 3.1 维度 4: navigator.mimeTypes ============
    const mockMimeTypes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: mockPlugins[0] },
      { type: 'application/x-nacl', suffixes: '', description: 'Native Client executable', enabledPlugin: mockPlugins[2] }
    ];
    mockMimeTypes.length = 3;
    mockMimeTypes.item = function(index) { return this[index < 0 || index >= this.length ? undefined : this[index]]; };
    mockMimeTypes.namedItem = function(name) {
      for (let i = 0; i < this.length; i++) {
        if (this[i].type === name) return this[i];
      }
      return null;
    };

    Object.defineProperty(navigator, 'mimeTypes', {
      get: function() { return mockMimeTypes; },
      configurable: true,
      enumerable: true
    });
  }

  // ============ Phase 3.1 维度 5: navigator.languages ============
  // 真实浏览器有 2-4 个语言，空数组是 Bot 信号
  const uiLang = config.ui_language || 'zh-CN';
  const baseLang = uiLang.split('-')[0];
  const languages = [uiLang, baseLang, 'en-US', 'en'];
  if (!navigator.languages || navigator.languages.length <= 1) {
    Object.defineProperty(navigator, 'languages', {
      get: function() { return languages; },
      configurable: true,
      enumerable: true
    });
  }
  // 同步更新 language
  Object.defineProperty(navigator, 'language', {
    get: function() { return uiLang; },
    configurable: true,
    enumerable: true
  });

  // ============ Phase 3.1 维度 6: navigator.hardwareConcurrency / deviceMemory ============
  // 根据分辨率推断合理的核心数
  const resolution = config.screen_resolution || '1920x1080';
  let cores = 4;
  if (resolution.includes('3840') || resolution.includes('2560')) cores = 8;
  if (resolution.includes('1366') || resolution.includes('1280')) cores = 2;

  if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency < 2) {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: function() { return cores; },
      configurable: true,
      enumerable: true
    });
  }

  if (!navigator.deviceMemory || navigator.deviceMemory < 1) {
    Object.defineProperty(navigator, 'deviceMemory', {
      get: function() { return 8; },
      configurable: true,
      enumerable: true
    });
  }

  // ============ Phase 3.1 维度 7: navigator.vendor / maxTouchPoints ============
  Object.defineProperty(navigator, 'vendor', {
    get: function() { return 'Google Inc.'; },
    configurable: true,
    enumerable: true
  });

  if (!navigator.maxTouchPoints || navigator.maxTouchPoints < 0) {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: function() { return 0; }, // 桌面端
      configurable: true,
      enumerable: true
    });
  }

  // ============ Phase 3.1 维度 8: window.devicePixelRatio ============
  if (typeof window.devicePixelRatio === 'undefined' || window.devicePixelRatio < 1) {
    Object.defineProperty(window, 'devicePixelRatio', {
      get: function() { return 1; }, // 普通屏
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 9: window.outerWidth / outerHeight ============
  const [screenW, screenH] = (config.screen_resolution || '1920x1080').split('x').map(Number);
  if (!window.outerWidth || window.outerWidth < screenW) {
    Object.defineProperty(window, 'outerWidth', {
      get: function() { return screenW; },
      configurable: true
    });
  }
  if (!window.outerHeight || window.outerHeight < screenH) {
    Object.defineProperty(window, 'outerHeight', {
      get: function() { return screenH + 40; }, // 标题栏+工具栏约 40px
      configurable: true
    });
  }
  if (!window.innerWidth) {
    Object.defineProperty(window, 'innerWidth', {
      get: function() { return screenW; },
      configurable: true
    });
  }
  if (!window.innerHeight) {
    Object.defineProperty(window, 'innerHeight', {
      get: function() { return screenH; },
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 10: navigator.connection ============
  if (!navigator.connection) {
    Object.defineProperty(navigator, 'connection', {
      get: function() {
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
      },
      configurable: true,
      enumerable: true
    });
  }

  // ============ Phase 3.1 维度 11: window.performance.memory ============
  if (window.performance && !window.performance.memory) {
    Object.defineProperty(window.performance, 'memory', {
      get: function() {
        return {
          usedJSHeapSize: 12000000,
          totalJSHeapSize: 22000000,
          jsHeapSizeLimit: 2190000000
        };
      },
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 12: screen.colorDepth / pixelDepth ============
  if (window.screen && !window.screen.colorDepth) {
    Object.defineProperty(window.screen, 'colorDepth', {
      get: function() { return 24; },
      configurable: true
    });
    Object.defineProperty(window.screen, 'pixelDepth', {
      get: function() { return 24; },
      configurable: true
    });
  }

  // ============ Phase 3.1 维度 13: screen.availLeft / availTop ============
  if (window.screen) {
    if (!window.screen.availLeft) {
      Object.defineProperty(window.screen, 'availLeft', {
        get: function() { return 0; },
        configurable: true
      });
    }
    if (!window.screen.availTop) {
      Object.defineProperty(window.screen, 'availTop', {
        get: function() { return 0; },
        configurable: true
      });
    }
  }

  // ============ Phase 3.1 维度 14: Intl.DateTimeFormat 时区增强 ============
  // 确保格式化输出与配置时区一致
  const timezone = config.timezone || 'Asia/Shanghai';
  if (window.Intl && window.Intl.DateTimeFormat) {
    const OrigDateTimeFormat = window.Intl.DateTimeFormat;
    window.Intl.DateTimeFormat = function(locales, options) {
      const opts = Object.assign({}, options);
      if (opts.timeZone === undefined) {
        opts.timeZone = timezone;
      }
      return new OrigDateTimeFormat(locales, opts);
    };
    window.Intl.DateTimeFormat.prototype = OrigDateTimeFormat.prototype;
    window.Intl.DateTimeFormat.supportedLocalesOf = function(locales, options) {
      return OrigDateTimeFormat.supportedLocalesOf(locales, options);
    };
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
      get: function() { return 'default'; },
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

  // ============ Phase 3.1 维度 18: navigator.webdriver 最终确认 ============
  // 确保即使之前被覆盖，这里也是 undefined
  Object.defineProperty(navigator, 'webdriver', {
    get: function() { return undefined; },
    configurable: true,
    enumerable: true
  });

  // 清理 __proto__ 上的 webdriver
  try {
    delete navigator.__proto__.webdriver;
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
    0x846E: [1, isNvidia ? 2047 : 1],                            // ALIASED_LINE_WIDTH_RANGE
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
        ready: Promise.resolve(fontSet),
        size: windowsFonts.length,
        add: function() {}, delete: function() { return false; }, clear: function() {},
        forEach: function(cb) { windowsFonts.forEach(f => cb({ family: f })); },
        entries: function* () { for (const f of windowsFonts) yield [{ family: f }, { family: f }]; },
        keys: function* () { for (const f of windowsFonts) yield { family: f }; },
        values: function* () { for (const f of windowsFonts) yield { family: f }; },
        has: function(family) { return windowsFonts.includes(family); },
        [Symbol.iterator]: function* () { for (const f of windowsFonts) yield [{ family: f }, { family: f }]; }
      };
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
    get: () => null,
    set: () => {},
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

  // 劫持 navigator.userAgentData（Chrome 90+ User-Agent Client Hints API）
  if (!navigator.userAgentData) {
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({
        brands: [
          { brand: 'Chromium', version: chromeVersion },
          { brand: 'Google Chrome', version: chromeVersion },
          { brand: 'Not;A=Brand', version: '99' }
        ],
        mobile: false,
        platform: 'Windows',
        platformVersion: '10.0',
        architecture: 'x86',
        bitness: '64',
        model: '',
        uaFullVersion: `${chromeVersion}.0.0.0`,
        fullVersionList: [
          { brand: 'Chromium', version: `${chromeVersion}.0.0.0` },
          { brand: 'Google Chrome', version: `${chromeVersion}.0.0.0` },
          { brand: 'Not;A=Brand', version: '99.0.0.0' }
        ],
        getHighEntropyValues: function(hints) {
          return Promise.resolve({
            platform: 'Windows',
            platformVersion: '10.0',
            architecture: 'x86',
            bitness: '64',
            model: '',
            uaFullVersion: `${chromeVersion}.0.0.0`,
            fullVersionList: this.fullVersionList
          });
        }
      }),
      configurable: true,
      enumerable: true
    });
  }

  // navigator.platform
  Object.defineProperty(navigator, 'platform', {
    get: () => 'Win32',
    configurable: true,
    enumerable: true
  });

  // navigator.oscpu（Firefox 专有，Chrome 应为 undefined）
  Object.defineProperty(navigator, 'oscpu', {
    get: () => undefined,
    configurable: true
  });

  // navigator.cpuClass（IE 遗留，Chrome 应为 undefined）
  Object.defineProperty(navigator, 'cpuClass', {
    get: () => undefined,
    configurable: true
  });

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
            get: () => undefined,
            set: () => {},
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

  Intl.DateTimeFormat = function(locales, options) {
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
  Intl.DateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
  Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf.bind(Intl.DateTimeFormat);

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
  // 补全可能被检测的缺失属性

  Object.defineProperty(navigator, 'pdfViewerEnabled', { get: () => true, configurable: true, enumerable: true });
  Object.defineProperty(navigator, 'bluetooth', { get: () => undefined, configurable: true });

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      get: () => ({
        read: () => Promise.reject(new DOMException('Permission denied')),
        readText: () => Promise.reject(new DOMException('Permission denied')),
        write: () => Promise.reject(new DOMException('Permission denied')),
        writeText: () => Promise.reject(new DOMException('Permission denied'))
      }),
      configurable: true
    });
  }

  if (!navigator.credentials) {
    Object.defineProperty(navigator, 'credentials', {
      get: () => ({
        get: () => Promise.resolve(null),
        create: () => Promise.reject(new DOMException('Not allowed')),
        preventSilentAccess: () => Promise.resolve()
      }),
      configurable: true
    });
  }

  if (!navigator.keyboard) {
    Object.defineProperty(navigator, 'keyboard', {
      get: () => ({
        getLayoutMap: () => Promise.resolve({
          has: () => true, get: () => 'KeyA',
          entries: function* () {}, keys: function* () {},
          values: function* () {}, forEach: () => {}, size: 0
        }),
        lock: () => Promise.resolve(), unlock: () => Promise.resolve()
      }),
      configurable: true
    });
  }

  if (!navigator.mediaCapabilities) {
    Object.defineProperty(navigator, 'mediaCapabilities', {
      get: () => ({
        decodingInfo: (config) => Promise.resolve({ supported: true, smooth: true, powerEfficient: true }),
        encodingInfo: (config) => Promise.resolve({ supported: true, smooth: true, powerEfficient: true })
      }),
      configurable: true
    });
  }

  if (!navigator.wakeLock) {
    Object.defineProperty(navigator, 'wakeLock', {
      get: () => ({
        request: (type) => Promise.resolve({
          type: type || 'screen', released: false,
          release: () => Promise.resolve(),
          addEventListener: () => {}, removeEventListener: () => {}
        })
      }),
      configurable: true
    });
  }

  if (!navigator.scheduling) {
    Object.defineProperty(navigator, 'scheduling', { get: () => ({ isInputPending: () => false }), configurable: true });
  }

  if (!navigator.presentation) {
    Object.defineProperty(navigator, 'presentation', { get: () => ({ defaultRequest: null, receiver: null }), configurable: true });
  }

  // ============ Phase 3.3 维度 6: window 对象补充 ============

  if (!window.visualViewport) {
    Object.defineProperty(window, 'visualViewport', {
      get: () => ({
        width: window.innerWidth, height: window.innerHeight, scale: 1,
        offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0,
        onresize: null, onscroll: null, addEventListener: () => {}, removeEventListener: () => {}
      }),
      configurable: true
    });
  }

  Object.defineProperty(window, 'originAgentCluster', { get: () => false, configurable: true });


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

