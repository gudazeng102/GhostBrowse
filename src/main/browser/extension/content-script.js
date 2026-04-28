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
  
  // ==================== 2. WebGL 指纹 - 固定伪装值 ====================
  if (config.webgl_mode === 'mock') {
    const vendorKey = 37445;  // UNMASKED_VENDOR_WEBGL
    const rendererKey = 37446; // UNMASKED_RENDERER_WEBGL
    
    const mockVendor = 'Intel Inc.';
    const mockRenderer = 'Intel Iris Xe Graphics';
    
    // Hook getParameter
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === vendorKey) return mockVendor;
      if (parameter === rendererKey) return mockRenderer;
      return originalGetParameter.call(this, parameter);
    };
    
    // 也 hook WebGL2
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === vendorKey) return mockVendor;
        if (parameter === rendererKey) return mockRenderer;
        return originalGetParameter2.call(this, parameter);
      };
    }
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
    console.log('[GhostBrowse Extension] WebRTC real 模式: 不处理，使用真实IP');
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
    // 
    // 技术原理：
    // 劫持 RTCPeerConnection 构造函数，强制替换 iceServers 配置
    // 将所有 STUN 请求路由到 Google 公共服务器，防止自托管 STUN 探测真实 IP
    // 
    // Google STUN 服务器列表（全球分布，高可用性）：
    // - stun.l.google.com:19302 (最常用)
    // - stun1.l.google.com:19302
    // - stun2.l.google.com:19302
    // - stun3.l.google.com:19302
    // - stun4.l.google.com:19302
    
    const OriginalRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OriginalRTCPeerConnection) {
      // 保存原始构造函数引用
      const _OrigRTCPeerConnection = OriginalRTCPeerConnection;
      
      // 创建劫持版本的 RTCPeerConnection
      window.RTCPeerConnection = function(config, ...rest) {
        // Google 公共 STUN 服务器列表
        const GOOGLE_STUN_SERVERS = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ];
        
        // 强制替换 iceServers，阻止自托管 STUN
        const forwardConfig = {
          ...config,
          iceServers: GOOGLE_STUN_SERVERS,
          // iceTransportPolicy: 'all'  // 使用所有候选类型
        };
        
        console.log('[GhostBrowse Extension] WebRTC Forward 模式: 强制使用 Google STUN 服务器');
        
        // 使用劫持配置创建实例
        return new _OrigRTCPeerConnection(forwardConfig, ...rest);
      };
      
      // 复制原型方法和静态属性
      window.RTCPeerConnection.prototype = _OrigRTCPeerConnection.prototype;
      window.RTCPeerConnection.prototype.constructor = window.RTCPeerConnection;
      
      // 复制静态方法（如 generateCertificate, getDefaultIceServers 等）
      Object.keys(_OrigRTCPeerConnection).forEach(key => {
        try {
          window.RTCPeerConnection[key] = _OrigRTCPeerConnection[key];
        } catch (e) {
          // 某些静态属性可能无法复制，忽略
        }
      });
      
      // 同时劫持 webkitRTCPeerConnection（兼容性）
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
  
  console.log('[GhostBrowse Extension] Fingerprint injection loaded');
})();
