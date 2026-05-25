// ==UserScript==
// @name         Twitter/X 智能养号助手 v4.0.2
// @namespace    http://tampermonkey.net/
// @version      4.0.2
// @description  32B模型适配 + 精确位置计划(position_plan) + 超时扩容 + 移除降温 + 首页计划支持
// @author       You
// @match        https://twitter.com/*
// @match        https://*.twitter.com/*
// @match        https://x.com/*
// @match        https://*.x.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    if (!document.body) {
        setTimeout(arguments.callee, 500);
        return;
    }

    const VERSION = '4.0.2';
    if (window.twitterWarmerVersion === VERSION) return;
    window.twitterWarmerVersion = VERSION;

    const STORAGE_STATS = 'twitter_warmer_stats_v402';
    const STORAGE_TASK_STATE = 'twitter_warmer_task_state_v402';

    const styles = `
        #warmer-panel{position:fixed;top:80px;right:20px;width:360px;background:rgba(255,255,255,0.98);border:1px solid #e1e8ed;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.15);z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:#0f1419;backdrop-filter:blur(10px);max-height:calc(100vh - 100px);min-height:550px;height:calc(100vh - 100px);overflow-y:auto;display:flex;flex-direction:column}
        #warmer-panel.dark-mode{background:rgba(21,32,43,0.98);border-color:#38444d;color:#fff}
        .warmer-header{padding:15px;border-bottom:1px solid #e1e8ed;font-weight:bold;display:flex;justify-content:space-between;align-items:center;cursor:move;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border-radius:16px 16px 0 0;flex-shrink:0}
        .warmer-body{padding:15px;flex:1;overflow-y:auto;display:flex;flex-direction:column}
        .section-title{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#8899a6;margin-bottom:8px;font-weight:700}
        .warmer-checkbox{display:flex;align-items:center;margin-bottom:8px;cursor:pointer;font-size:13px;padding:6px;border-radius:6px;transition:background 0.2s}
        .warmer-checkbox:hover{background:rgba(29,155,240,0.1)}
        .warmer-checkbox input{margin-right:8px;width:16px;height:16px}
        .warmer-btn{width:100%;padding:10px;border:none;border-radius:20px;font-weight:bold;cursor:pointer;transition:all 0.2s;margin-bottom:8px}
        .btn-primary{background:#1d9bf0;color:white}
        .btn-secondary{background:#10b981;color:white}
        .btn-warning{background:#f59e0b;color:white}
        .btn-danger{background:#f4212e;color:white}
        .hidden{display:none !important}
        .stats-box{display:flex;justify-content:space-around;margin:10px 0;padding:8px;background:rgba(29,155,240,0.1);border-radius:8px;font-size:12px}
        .stat-item{text-align:center}
        .stat-value{font-weight:bold;color:#1d9bf0;font-size:16px}
        .stat-label{color:#657786;font-size:10px}
        .warmer-status{padding:10px;background:#f7f9fa;border-radius:8px;font-size:12px;margin-top:10px;flex:1;min-height:200px;overflow-y:auto;line-height:1.5;border:1px solid #e1e8ed}
        .dark-mode .warmer-status{background:#192734;border-color:#38444d}
        .log-entry{margin-bottom:6px;word-break:break-all}
        .log-time{color:#8899a6;font-size:11px;margin-right:4px}
        .log-info{color:#1d9bf0}
        .log-success{color:#00ba7c;font-weight:bold}
        .log-warning{color:#ffad1f}
        .log-error{color:#f4212e}
        .ai-command-input{width:100%;height:200px;padding:12px;border:2px solid #e1e8ed;border-radius:12px;font-size:14px;font-family:'Courier New',monospace;resize:vertical;box-sizing:border-box;line-height:1.6}
        .dark-mode .ai-command-input{background:#192734;border-color:#38444d;color:#fff}
        .mode-selector{background:rgba(29,155,240,0.05);border:1px solid rgba(29,155,240,0.2);border-radius:10px;padding:12px;margin-bottom:15px}
        .mode-option{display:flex;align-items:center;margin-bottom:8px;cursor:pointer;padding:8px;border-radius:6px}
        .mode-option input[type="radio"]{margin-right:10px;width:16px;height:16px}
        .mode-label{font-weight:600;font-size:13px}
        .button-group{display:flex;gap:8px}
        .button-group .warmer-btn{flex:1;margin-bottom:0}
    `;

    class LocalAIAgent {
        constructor() {
            this.apiUrl = 'http://127.0.0.1:11434/api/generate';
            this.model = 'qwen3-twitter';
            this.isAvailable = false;
            this.isExecuting = false;
            this.currentRequest = null;
            this.heartbeatInterval = null;
        }

        _extractValidJSON(text) {
            if (!text) return null;
            let startIdx = text.indexOf('"action"');
            if (startIdx === -1) startIdx = text.indexOf("'action'");
            if (startIdx === -1) return null;
            let braceStart = startIdx;
            while (braceStart > 0 && text[braceStart] !== '{') {
                braceStart--;
            }
            if (text[braceStart] !== '{') return null;
            let braceCount = 0;
            let braceEnd = braceStart;
            for (let i = braceStart; i < text.length; i++) {
                if (text[i] === '{') braceCount++;
                else if (text[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        braceEnd = i;
                        break;
                    }
                }
            }
            if (braceEnd <= braceStart) return null;
            const jsonStr = text.substring(braceStart, braceEnd + 1);
            console.log('[提取尝试] 提取字符串:', jsonStr.substring(0, 200));
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.action) return parsed;
            } catch(e) {
                console.log('[提取失败] JSON解析错误:', e.message);
            }
            return null;
        }

        _isThinkingContent(text) {
            if (!text) return false;
            const patterns = ['好的，我现在需要','用户希望我','我需要处理','让我分析','首先，我要','作为Twitter养号助手','我需要理解','接下来我要','我需要解析','首先，用户','现在我要处理'];
            return patterns.some(p => text.includes(p));
        }

        async checkConnection() {
            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: 'http://127.0.0.1:11434/api/tags',
                        timeout: 15000,
                        onload: (res) => resolve(res),
                        onerror: () => reject(new Error('连接失败'))
                    });
                });
                this.isAvailable = response.status === 200;
                return this.isAvailable;
            } catch(e) {
                this.isAvailable = false;
                return false;
            }
        }

        async callOllamaWithProgress(prompt, logCallback, abortChecker) {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                let lastProgress = 0;
                const checkAbort = abortChecker || (() => false);

                this.heartbeatInterval = setInterval(() => {
                    if (checkAbort() || this._forceAborted) {
                        clearInterval(this.heartbeatInterval);
                        this.isExecuting = false;
                        reject(new Error('用户已暂停'));
                        return;
                    }
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    if (elapsed > lastProgress + 5) {
                        lastProgress = elapsed;
                        logCallback('AI思考中...(' + elapsed + '秒)', 'thinking');
                    }
                }, 5000);

                this.isExecuting = true;
                this._forceAborted = false;

                this.currentRequest = GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.apiUrl,
                    headers: {'Content-Type': 'application/json'},
                    data: JSON.stringify({
                        model: this.model,
                        prompt: prompt,
                        stream: false,
                        options: { temperature: 0.0, top_p: 0.1, num_ctx: 8192, num_predict: 800 }
                    }),
                    timeout: 600000,

                    onload: (res) => {
                        clearInterval(this.heartbeatInterval);
                        this.isExecuting = false;
                        if (res.status === 200) {
                            try {
                                const data = JSON.parse(res.responseText);
                                let content = data.response || '';
                                let thinking = data.thinking || '';
                                console.log('[Ollama完整返回] content长度:', content.length, '内容:', content);
                                console.log('[Ollama完整返回] thinking长度:', thinking.length, '内容:', thinking);
                                resolve({ content: content, thinking: thinking });
                            } catch(e) { reject(new Error('Parse error: ' + e.message)); }
                        } else { reject(new Error('HTTP ' + res.status)); }
                    },

                    onerror: () => {
                        clearInterval(this.heartbeatInterval);
                        this.isExecuting = false;
                        reject(new Error('Network error'));
                    },

                    ontimeout: () => {
                        clearInterval(this.heartbeatInterval);
                        this.isExecuting = false;
                        reject(new Error('Timeout'));
                    }
                });
            });
        }

        abortExecution() {
            this._forceAborted = true;
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            if (this.currentRequest && this.isExecuting) {
                try { this.currentRequest.abort(); } catch(e) {}
            }
            this.isExecuting = false;
            return true;
        }

        async executeSmartCommand(command, logCallback, abortChecker) {
            if (!this.isAvailable) {
                logCallback('Ollama离线', 'error');
                throw new Error('Ollama未连接');
            }

            console.log('[AI解析] 指令:', command);
            logCallback('解析中...', 'info');

            const systemPrompt = `你是Twitter指令解析器。只输出JSON，禁止任何其他文字。

【核心区分 - 决定是否启用 position_plan】
- 如果指令包含"前X条"、"第Y条"、"第A和第B条"、"第M到第N条"等位置描述 → 必须生成 position_plan
- 如果指令只说"点赞X条"（未指定第几条或前几条）→ 不生成 position_plan，用传统 like_count + selective=true
- 如果指令只说"浏览X条"（未指定位置）→ 不生成 position_plan，like_count=0

【强制规则】
1. 见"去@XXX"、"去XXX"或"XXX的账号下" → target_accounts:["XXX"], action:targeted_interaction
2. 见"首页"或"主页"或"home" → action:home_warming
3. 见"关注"或"following"或"关注列表" → action:following_warming
4. 见"X分钟"或"X分" → duration_minutes=X, constraints.view_count=0, like_count=0, position_plan 清空
5. 见"完成后暂停"或"暂停"或"停止"或"结束" → pause_after:true

【position_plan 格式规范 - 仅精确位置指令启用】
格式：位置范围:操作列表;位置范围:操作列表...
- 位置写法：
  - 连续：1-5（第1到第5条）
  - 离散：6,7,9（第6、7、9条）
  - 单条：8（第8条）
  - 混合：1,3,5-8（第1、3条 + 第5到8条）
- 操作写法（小写英文）：
  - like = 点赞
  - retweet = 转发
  - comment = 评论
  - view = 只浏览不操作（用于填充剩余浏览量）
  - 多操作用逗号分隔：like,retweet（同时点赞+转发）
- 启用 position_plan 时，constraints.like_count 必须设为 0，selective 设为 false
- view_count 必须覆盖 position_plan 中提到的最大位置编号

【传统模式 - 无精确位置时】
- 见"点赞X条"（未指定位置）→ constraints.like_count=X, selective=true（随机选）
- 见"浏览X条" → constraints.view_count=X, like_count=0

【输出格式】必须且只能输出一行紧凑JSON：
{"action":"targeted_interaction|home_warming|following_warming","target_accounts":["账号名"],"operations":["like","retweet","comment"],"constraints":{"view_count":数字,"like_count":数字,"selective":true/false,"position_plan":"位置:操作;位置:操作"},"duration_minutes":0,"pause_after":true/false}

【绝对禁止】
- 禁止思考过程、解释、分析、说明
- 禁止markdown、代码块、JSON标签
- 禁止"好的"、"我需要"、"让我"、"首先"等任何前缀
- 直接输出纯JSON字符串，nothing else

【示例 - 精确位置模式】
输入：去@FRIEREN_INFO的账号下，点赞前5条推文，评论第6和第7条推文，转发第8条推文
输出：{"action":"targeted_interaction","target_accounts":["FRIEREN_INFO"],"operations":["like","comment","retweet"],"constraints":{"view_count":8,"like_count":0,"selective":false,"position_plan":"1-5:like;6-7:comment;8:retweet"},"duration_minutes":0,"pause_after":false}

输入：去@FRIEREN_INFO前3条点赞并转发，第4条评论，浏览第5到第10条
输出：{"action":"targeted_interaction","target_accounts":["FRIEREN_INFO"],"operations":["like","retweet","comment"],"constraints":{"view_count":10,"like_count":0,"selective":false,"position_plan":"1-3:like,retweet;4:comment;5-10:view"},"duration_minutes":0,"pause_after":false}

输入：去@FRIEREN_INFO第1、3、5条点赞，第2条评论，第4条转发
输出：{"action":"targeted_interaction","target_accounts":["FRIEREN_INFO"],"operations":["like","comment","retweet"],"constraints":{"view_count":5,"like_count":0,"selective":false,"position_plan":"1,3,5:like;2:comment;4:retweet"},"duration_minutes":0,"pause_after":false}

输入：去首页评论前10条推文
输出：{"action":"home_warming","target_accounts":[],"operations":["comment"],"constraints":{"view_count":10,"like_count":0,"selective":false,"position_plan":"1-10:comment"},"duration_minutes":0,"pause_after":false}

输入：去首页前5条点赞，第6条转发
输出：{"action":"home_warming","target_accounts":[],"operations":["like","retweet"],"constraints":{"view_count":6,"like_count":0,"selective":false,"position_plan":"1-5:like;6:retweet"},"duration_minutes":0,"pause_after":false}

输入：去首页点赞前3条并评论第4条，持续5分钟后暂停
输出：{"action":"home_warming","target_accounts":[],"operations":["like","comment"],"constraints":{"view_count":4,"like_count":0,"selective":false,"position_plan":"1-3:like;4:comment"},"duration_minutes":5,"pause_after":true}

【示例 - 传统模式（无精确位置）】
输入：去FRIEREN_PR点赞5条评论3条
输出：{"action":"targeted_interaction","target_accounts":["FRIEREN_PR"],"operations":["like","comment"],"constraints":{"view_count":8,"like_count":5,"selective":true},"duration_minutes":0,"pause_after":false}

输入：去FRIEREN_PR浏览10条随机点赞3条
输出：{"action":"targeted_interaction","target_accounts":["FRIEREN_PR"],"operations":["like"],"constraints":{"view_count":10,"like_count":3,"selective":true},"duration_minutes":0,"pause_after":false}

输入：去首页评论5分钟后暂停
输出：{"action":"home_warming","target_accounts":[],"operations":["comment"],"constraints":{"view_count":0,"like_count":0,"selective":false},"duration_minutes":5,"pause_after":true}

输入：${command}
输出：`;

            try {
                const result = await this.callOllamaWithProgress(systemPrompt, logCallback, abortChecker);
                console.log('打印result', result);

                let plan = null;
                let extractSource = '';

                if (result.thinking && result.thinking.includes('"action"')) {
                    console.log('[提取] 尝试从thinking提取...');
                    plan = this._extractValidJSON(result.thinking);
                    if (plan) {
                        extractSource = 'thinking';
                        console.log('[提取] thinking提取成功');
                    }
                }

                if (!plan && result.content && result.content.includes('"action"')) {
                    console.log('[提取] 尝试从content提取...');
                    plan = this._extractValidJSON(result.content);
                    if (plan) {
                        extractSource = 'content';
                        console.log('[提取] content提取成功');
                    }
                }

                if (!plan) {
                    console.log('[提取] 尝试暴力提取任意JSON...');
                    if (result.thinking) {
                        const matches = result.thinking.match(/\{[\s\S]{50,500}\}/g);
                        if (matches) {
                            for (const match of matches) {
                                try {
                                    const p = JSON.parse(match);
                                    if (p.action) {
                                        plan = p;
                                        extractSource = 'thinking_brutal';
                                        break;
                                    }
                                } catch(e) {}
                            }
                        }
                    }
                }

                if (!plan) {
                    console.error('[AI解析] 所有提取方式失败');
                    console.error('content:', result.content);
                    console.error('thinking:', result.thinking);
                    throw new Error('无法从AI返回中提取有效JSON');
                }

                console.log('[AI解析] 从', extractSource, '提取成功:', JSON.stringify(plan));
                console.log('打印plan', plan);

                if (!plan.action) {
                    throw new Error('提取的JSON缺少action字段');
                }

                // 强制修正：启用 position_plan 时，like_count 必须为 0，selective 必须为 false
                if (plan.constraints && plan.constraints.position_plan) {
                    plan.constraints.like_count = 0;
                    plan.constraints.selective = false;
                }

                if (plan.action === 'targeted_interaction' && (!plan.target_accounts || plan.target_accounts.length === 0)) {
                    const accountMatch = command.match(/去@?([a-zA-Z0-9_]+)/);
                    if (accountMatch) {
                        plan.target_accounts = [accountMatch[1]];
                    } else {
                        throw new Error('定向模式但未找到目标账号');
                    }
                }

                if (!plan.constraints) {
                    plan.constraints = { view_count: 0, like_count: 0, selective: false };
                }

                const timeMatch = command.match(/(\d+)\s*分钟?/);
                if (timeMatch && plan.constraints.view_count > 0 && (!plan.duration_minutes || plan.duration_minutes === 0)) {
                    console.log('[AI解析] 强制修正为时间模式');
                    plan.duration_minutes = parseInt(timeMatch[1]);
                    plan.constraints.view_count = 0;
                    plan.constraints.like_count = 0;
                    plan.constraints.position_plan = undefined;
                }

                if (command.includes('暂停') || command.includes('停止') || command.includes('完成后')) {
                    plan.pause_after = true;
                }

                logCallback('✅ 解析成功 [' + extractSource + ']: ' + plan.action +
                    (plan.duration_minutes > 0 ? ' | 时间:' + plan.duration_minutes + '分' : ' | 数量:' + (plan.constraints?.view_count || 0)),
                    'success');

                return { plan };
            } catch (err) {
                console.error('[AI解析] 失败:', err.message);
                logCallback('❌ 解析失败: ' + err.message, 'error');
                throw err;
            }
        }

        detectLanguage(text) {
            if (!text || text.trim().length === 0) {
                return { code: 'emoji', name: '无文字', isEmojiOnly: true, instruction: 'Emoji only' };
            }

            const textWithoutUrls = text.replace(/https?:\/\/\S+/g, '').replace(/[@#]\w+/g, '').trim();
            const textWithoutEmoji = textWithoutUrls.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();

            if (!textWithoutEmoji || textWithoutEmoji.length === 0) {
                return { code: 'emoji', name: '纯表情', isEmojiOnly: true, instruction: 'Reply with single appropriate emoji' };
            }

            const cleanText = textWithoutEmoji;

            if (/[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText)) {
                return { code: 'ja', name: '日文', isEmojiOnly: false, instruction: 'Write short comment in Japanese (15-30 chars). Casual tone.' };
            }
            if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(cleanText)) {
                return { code: 'ko', name: '韩文', isEmojiOnly: false, instruction: 'Write short comment in Korean (15-30 chars). Casual tone.' };
            }
            if (/[\u0400-\u04FF]/.test(cleanText)) {
                return { code: 'ru', name: '俄文', isEmojiOnly: false, instruction: 'Напишите короткий комментарий на русском (3-6 слов).' };
            }
            if (/[ăâêôơưđĂÂÊÔƠƯĐ]/.test(cleanText)) {
                return { code: 'vi', name: '越南文', isEmojiOnly: false, instruction: 'Viết bình luận ngắn bằng tiếng Việt (4-6 từ).' };
            }
            if (/[\u4e00-\u9fa5]/.test(cleanText)) {
                const tradChars = '萬東車紅長電國會來個時後為說門見經這還點發現對開與當從這說時來後個們過年萬兒無圓匯幣發來現經國長電';
                const isTrad = [...cleanText].some(char => tradChars.includes(char));
                return {
                    code: isTrad ? 'zh-trad' : 'zh-cn',
                    name: isTrad ? '中文（繁体）' : '中文（简体）',
                    isEmojiOnly: false,
                    instruction: isTrad ? '用繁體中文寫自然評論（15-25字）。' : '用简体中文写自然评论（12-20字）。'
                };
            }

            return { code: 'en', name: '英文', isEmojiOnly: false, instruction: 'Write short reply (4-8 words). Casual tone.' };
        }

        async generateComment(tweetText, logCallback) {
            if (!this.isAvailable) return null;

            const lang = this.detectLanguage(tweetText);

            if (lang.isEmojiOnly) {
                const emojis = ['👍', '❤️', '🔥', '😂', '😍', '👏', '🙏', '💯', '✨', '🎉', '🤔', '👀', '💪', '🤩', '🥰'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                logCallback('纯媒体，回复:' + randomEmoji, 'success');
                return { comment: randomEmoji, lang: lang.name };
            }

            logCallback('语言:' + lang.name, 'lang');

            const prompt = `Reply to this ${lang.name} tweet:
"${tweetText.substring(0, 400)}"
${lang.instruction}
CRITICAL: Reply ONLY in ${lang.name}, NO JSON, NO quotes, NO explanations. Just the comment text:`;

            try {
                const result = await this.callOllamaWithProgress(prompt, logCallback);

                let comment = result.content.trim();

                if (comment.startsWith('{') && comment.includes('comment')) {
                    try {
                        const parsed = JSON.parse(comment);
                        if (parsed.comment) comment = parsed.comment.trim();
                    } catch(e) {}
                }

                comment = comment.replace(/^(Reply|Comment|Response|回复|评论)[：:]\s*/i, '')
                                .replace(/^["']|["']$/g, '')
                                .replace(/\n/g, ' ')
                                .trim();

                if (this._isThinkingContent(comment)) {
                    logCallback('失败:含思考内容', 'error');
                    return null;
                }

                if (lang.code.startsWith('zh')) {
                    if (comment.length > 25) comment = comment.substring(0, 25);
                } else if (lang.code === 'ja' || lang.code === 'ko') {
                    if (comment.length > 35) comment = comment.substring(0, 35);
                } else if (comment.length > 80) {
                    comment = comment.substring(0, 80);
                }

                if (!comment || comment.length < 1) {
                    const fallbackEmojis = ['👍', '❤️', '🔥'];
                    comment = fallbackEmojis[Math.floor(Math.random() * fallbackEmojis.length)];
                }

                logCallback('生成:' + comment.substring(0, 20), 'success');
                return { comment, lang: lang.name };

            } catch (err) {
                logCallback('生成失败', 'error');
                return null;
            }
        }
    }

    const aiAgent = new LocalAIAgent();

    class TwitterWarmer {
        constructor() {
            this.isRunning = false;
            this.isExecutingCommand = false;
            this.stats = this.loadStats();
            this.config = { enableComment: true, maxComments: 5 };
            this.commentedCount = 0;
            this.abortFlag = false;
            this.currentTask = null;
            this.checkAndResumeTask();
        }

        loadStats() {
            const data = localStorage.getItem(STORAGE_STATS);
            return data ? JSON.parse(data) : { viewed: 0, liked: 0, retweeted: 0, bookmarked: 0, commented: 0 };
        }

        saveStats() {
            localStorage.setItem(STORAGE_STATS, JSON.stringify(this.stats));
        }

        updateStats() {
            const ids = { viewed: 'stat-viewed', liked: 'stat-liked', retweeted: 'stat-retweeted', bookmarked: 'stat-bookmarked', commented: 'stat-commented' };
            for (let [key, id] of Object.entries(ids)) {
                const el = document.getElementById(id);
                if (el) el.textContent = this.stats[key] || 0;
            }
            this.saveStats();
        }

        log(message, type) {
            const box = document.getElementById('warmer-logs');
            if (!box) return;
            const time = new Date().toLocaleTimeString('zh-CN', {hour12: false});
            const colors = { info: 'log-info', success: 'log-success', warning: 'log-warning', error: 'log-error', lang: 'log-lang', thinking: 'log-info' };
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + (colors[type] || 'log-info');
            entry.innerHTML = '<span class="log-time">[' + time + ']</span>' + message;
            box.insertBefore(entry, box.firstChild);
            while (box.children.length > 50) box.removeChild(box.lastChild);
        }

        sleep(min, max) {
            return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
        }

        stop() {
            this.isRunning = false;
            this.abortFlag = true;
            this.log('⏹️ 已停止', 'warning');
            this.updateUIState(false);
            this.saveTaskState();
        }

        abortCommand() {
            if (this.isExecutingCommand) {
                this.abortFlag = true;
                aiAgent.abortExecution();
                this.isExecutingCommand = false;
                this.log('✅ 已暂停', 'success');
                this.resetCommandState();
                this.saveTaskState();
            }
        }

        resetCommandState() {
            this.isExecutingCommand = false;
            const sendBtn = document.getElementById('btn-send-ai-command');
            const abortBtn = document.getElementById('btn-abort-ai-command');
            const input = document.getElementById('ai-command-input');
            if (sendBtn) sendBtn.disabled = false;
            if (abortBtn) abortBtn.disabled = true;
            if (input) input.disabled = false;
        }

        switchMode(targetMode) {
            if (targetMode === 'normal' && this.isExecutingCommand) {
                this.log('请先暂停指令', 'error');
                document.getElementById('mode-ai-command').checked = true;
                return;
            }
            this.config.currentMode = targetMode;
            const normalControls = document.getElementById('normal-mode-controls');
            const aiCommandSection = document.getElementById('ai-command-section');
            if (targetMode === 'ai_command') {
                if (normalControls) normalControls.classList.add('hidden');
                if (aiCommandSection) aiCommandSection.classList.remove('hidden');
            } else {
                if (normalControls) normalControls.classList.remove('hidden');
                if (aiCommandSection) aiCommandSection.classList.add('hidden');
            }
        }

        saveTaskState() {
            if (this.currentTask) localStorage.setItem(STORAGE_TASK_STATE, JSON.stringify({ ...this.currentTask, isRunning: this.isRunning, timestamp: Date.now() }));
        }

        checkAndResumeTask() {
            const saved = localStorage.getItem(STORAGE_TASK_STATE);
            if (!saved) return;
            try {
                const state = JSON.parse(saved);
                if (state && !state.completed && (Date.now() - state.timestamp < 3600000)) {
                    setTimeout(() => { this.log('检测到未完成任务: ' + state.action, 'warning'); }, 2000);
                }
            } catch(e) {}
        }

        selectRandomIndices(total, count) {
            const indices = [];
            const pool = [];
            for (let i = 0; i < total; i++) pool.push(i);
            for (let i = 0; i < count && pool.length > 0; i++) {
                const randIndex = Math.floor(Math.random() * pool.length);
                indices.push(pool[randIndex]);
                pool.splice(randIndex, 1);
            }
            return indices.sort((a, b) => a - b);
        }

        _parsePositionPlan(planStr, totalTweets) {
            if (!planStr || typeof planStr !== 'string') return null;
            const slotMap = new Map();
            const segments = planStr.split(';').filter(Boolean);

            for (const seg of segments) {
                const colonIdx = seg.indexOf(':');
                if (colonIdx === -1) continue;
                const posPart = seg.slice(0, colonIdx).trim();
                const opsPart = seg.slice(colonIdx + 1).trim();
                const ops = opsPart.split(',').map(s => s.trim()).filter(s => ['like','retweet','comment','view'].includes(s));
                if (ops.length === 0) continue;

                const positions = new Set();
                const ranges = posPart.split(',');
                for (const r of ranges) {
                    const trimmed = r.trim();
                    if (trimmed.includes('-')) {
                        const [start, end] = trimmed.split('-').map(Number);
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let idx = Math.max(1, start); idx <= end && idx <= totalTweets; idx++) {
                                positions.add(idx);
                            }
                        }
                    } else {
                        const n = Number(trimmed);
                        if (!isNaN(n) && n >= 1 && n <= totalTweets) positions.add(n);
                    }
                }

                for (const pos of positions) {
                    if (!slotMap.has(pos)) slotMap.set(pos, new Set());
                    for (const op of ops) slotMap.get(pos).add(op);
                }
            }
            return slotMap.size > 0 ? slotMap : null;
        }

        async navigateToUserViaSearch(username) {
            const cleanUsername = username.replace('@', '').trim();
            this.log('🔍 搜索 @' + cleanUsername + '...', 'info');

            let searchInput = document.querySelector('input[data-testid="SearchBox_Search_Input"]') ||
                             document.querySelector('input[placeholder*="搜索"]') ||
                             document.querySelector('input[placeholder*="Search"]');

            if (!searchInput) {
                this.log('未找到搜索框，强制路由...', 'warning');
                window.history.pushState({ query: cleanUsername }, '', '/search?q=' + encodeURIComponent(cleanUsername) + '&f=user');
                window.dispatchEvent(new PopStateEvent('popstate', { state: { query: cleanUsername } }));
                await this.sleep(4000, 5000);
                return this.clickFirstUserFromSearch(cleanUsername);
            }

            searchInput.focus(); searchInput.click(); await this.sleep(300, 500);
            searchInput.select(); searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            await this.sleep(200, 300);

            for (const char of cleanUsername) {
                searchInput.value += char;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(80, 120);
            }
            await this.sleep(800, 1200);

            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

            await this.sleep(1500, 2000);

            let waitCount = 0;
            while (!window.location.href.includes('/search?q=' + cleanUsername) && waitCount < 10) {
                await this.sleep(500, 800);
                waitCount++;
            }
            await this.sleep(2000, 3000);

            const userTab = document.querySelector('a[href*="f=user"]') ||
                           Array.from(document.querySelectorAll('a[role="tab"]')).find(a => a.textContent.includes('用户'));
            if (userTab && !window.location.href.includes('f=user')) {
                userTab.click();
                await this.sleep(2000, 3000);
            }

            if (!window.location.href.includes('/search?q=' + cleanUsername)) {
                window.history.pushState({ query: cleanUsername }, '', '/search?q=' + encodeURIComponent(cleanUsername) + '&f=user');
                window.dispatchEvent(new PopStateEvent('popstate', { state: { query: cleanUsername } }));
                await this.sleep(4000, 5000);
            } else {
                await this.sleep(2000, 3000);
            }

            return this.clickFirstUserFromSearch(cleanUsername);
        }

        async clickFirstUserFromSearch(username) {
            this.log('🎯 查找: @' + username + '...', 'info');
            await this.sleep(2000, 3000);

            const currentUrl = window.location.href;
            if (currentUrl.includes('/search') && !currentUrl.includes('q=')) {
                this.log('⚠️ 当前在"最近"页面，重新搜索...', 'warning');
                let searchInput = document.querySelector('input[data-testid="SearchBox_Search_Input"]') ||
                                 document.querySelector('input[placeholder*="搜索"]');
                if (searchInput) {
                    searchInput.focus(); searchInput.click(); await this.sleep(300, 500);
                    searchInput.select(); searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    await this.sleep(200, 300);
                    for (const char of username) {
                        searchInput.value += char;
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        await this.sleep(80, 120);
                    }
                    await this.sleep(800, 1200);
                    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    await this.sleep(3000, 4000);
                }
            }

            let userLink = document.querySelector('a[href="/' + username + '"]');
            if (!userLink) {
                const allLinks = Array.from(document.querySelectorAll('a[href^="/"]'));
                userLink = allLinks.find(l => {
                    const href = l.getAttribute('href');
                    return href === '/' + username || href.startsWith('/' + username + '/');
                });
            }
            if (!userLink) {
                const userCells = document.querySelectorAll('div[data-testid="UserCell"]');
                for (const cell of userCells) {
                    const link = cell.querySelector('a[href^="/"]');
                    if (link && link.getAttribute('href').includes(username)) {
                        userLink = link;
                        break;
                    }
                }
            }

            if (userLink) {
                this.log('✅ 找到用户，进入...', 'success');
                userLink.click();
                await this.sleep(4000, 5000);
                return true;
            } else {
                this.log('❌ 未找到 @' + username, 'error');
                return false;
            }
        }

        async executeAICommand() {
            const input = document.getElementById('ai-command-input');
            if (!input) return;
            const command = input.value.trim();
            if (!command) return;

            const isConnected = await aiAgent.checkConnection();
            if (!isConnected) { this.log('🔴 Ollama未连接', 'error'); return; }

            this.isExecutingCommand = true;
            this.abortFlag = false;
            input.disabled = true;
            document.getElementById('btn-send-ai-command').disabled = true;
            document.getElementById('btn-abort-ai-command').disabled = false;

            this.log('📤 指令: ' + command.substring(0, 40) + '...', 'info');

            try {
                const abortChecker = () => this.abortFlag;
                const result = await aiAgent.executeSmartCommand(command, (msg, type) => this.log(msg, type), abortChecker);

                if (this.abortFlag) {
                    this.log('⏹️ 已暂停', 'warning');
                    return;
                }

                if (result && result.plan) {
                    console.log('[执行计划]', JSON.stringify(result.plan, null, 2));
                    this.currentTask = result.plan;
                    await this.dispatchAction(result.plan);
                }
            } catch (err) {
                if (err.message === '用户已暂停') {
                    this.log('⏹️ 已暂停', 'warning');
                } else {
                    console.error('[执行错误]', err);
                    this.log('❌ 失败: ' + err.message, 'error');
                    this.log('⚠️ 未执行任何操作', 'warning');
                }
            }

            this.resetCommandState();
        }

        async dispatchAction(plan) {
            if (this.abortFlag) return;

            const isTimeMode = plan.duration_minutes > 0 && (!plan.constraints?.view_count || plan.constraints.view_count === 0);

            if (isTimeMode) {
                await this.executeTimeBasedTask(plan);
            } else {
                switch (plan.action) {
                    case 'targeted_interaction':
                        if (plan.target_accounts && plan.target_accounts.length > 0) {
                            for (const account of plan.target_accounts) {
                                if (this.abortFlag) break;
                                await this.startTargetedInteraction(account, plan);
                            }
                        } else {
                            this.log('⚠️ 无目标账号，转首页', 'warning');
                            await this.startHomeWarming(plan);
                        }
                        break;
                    case 'home_warming': await this.startHomeWarming(plan); break;
                    case 'following_warming': await this.startFollowingWarming(plan); break;
                    default: await this.startHomeWarming(plan);
                }
            }

            if (plan.pause_after && !this.abortFlag) {
                this.log('⏸️ 完成，已暂停', 'success');
                this.abortFlag = true;
            }
            if (this.currentTask) {
                this.currentTask.completed = true;
                this.saveTaskState();
            }
        }

        async executeTimeBasedTask(plan) {
            const durationMinutes = plan.duration_minutes || 5;
            const operations = plan.operations || ['comment'];
            const endTime = Date.now() + durationMinutes * 60000;

            this.log('⏱️ 时间模式: ' + durationMinutes + '分钟 | ' + operations.join(','), 'info');
            this.isRunning = true;
            this.updateUIState(true);

            if (plan.action === 'home_warming' && !window.location.href.match(/^https:\/\/(twitter\.com|x\.com)\/?$/) && !window.location.href.match(/^https:\/\/(twitter\.com|x\.com)\/home$/)) {
                this.log('🔄 返回首页...', 'info');
                window.history.pushState({}, '', '/home');
                window.dispatchEvent(new PopStateEvent('popstate'));
                await this.sleep(3000, 4000);
            }

            let processed = 0;
            while (Date.now() < endTime && this.isRunning && !this.abortFlag) {
                if (this.abortFlag) break;

                const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).filter(t => !t.dataset.aiProcessed);

                if (tweets.length === 0) {
                    window.scrollBy({ top: 800, behavior: 'smooth' });
                    await this.sleep(3000, 5000);
                    continue;
                }

                for (let tweet of tweets) {
                    if (Date.now() >= endTime || this.abortFlag || !this.isRunning) break;

                    tweet.dataset.aiProcessed = 'true';
                    tweet.style.boxShadow = '0 0 0 2px #1d9bf0';
                    tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    const text = tweet.innerText ? tweet.innerText.substring(0, 40) : '';
                    const remaining = Math.ceil((endTime - Date.now()) / 60000);
                    this.log('[' + (processed + 1) + '] 剩' + remaining + '分 | ' + text + '...', 'info');

                    await this.sleep(2000, 4000);
                    this.stats.viewed++;
                    this.updateStats();

                    // 时间模式下按 operations 顺序执行所有操作
                    if (operations.includes('like') && Math.random() > 0.3) {
                        const likeBtn = tweet.querySelector('[data-testid="like"]');
                        if (likeBtn) {
                            likeBtn.click();
                            this.stats.liked++;
                            this.updateStats();
                            this.log('❤️ 点赞', 'success');
                            await this.sleep(1500, 2500);
                        }
                    }

                    if (operations.includes('retweet') && Math.random() > 0.5) {
                        const retweetBtn = tweet.querySelector('[data-testid="retweet"]');
                        if (retweetBtn) {
                            retweetBtn.click();
                            await this.sleep(2000, 3000);
                            let confirmBtn = document.querySelector('[data-testid="retweetConfirm"]') ||
                                              document.querySelector('[data-testid="unretweet"]');
                            if (!confirmBtn) {
                                const buttons = Array.from(document.querySelectorAll('div[role="button"], button[role="button"]'));
                                confirmBtn = buttons.find(el => {
                                    const text = el.innerText || el.textContent || '';
                                    return text.includes('Retweet') || text.includes('转发') || text.includes('Repost');
                                });
                            }
                            if (confirmBtn) {
                                confirmBtn.click();
                                this.stats.retweeted++;
                                this.updateStats();
                                this.log('🔄 转发', 'success');
                                await this.sleep(2000, 3000);
                            }
                        }
                    }

                    if (operations.includes('comment') && this.config.enableComment && this.commentedCount < this.config.maxComments) {
                        await this.commentOnTweet(tweet);
                    }

                    processed++;
                    await this.sleep(4000, 6000);
                }
            }

            this.log('🎉 完成! 历时' + durationMinutes + '分,处理' + processed + '条', 'success');
            this.isRunning = false;
            this.updateUIState(false);
        }

        async startTargetedInteraction(account, plan) {
            this.isRunning = true;
            this.abortFlag = false;
            this.updateUIState(true);
            this.currentTask = { ...plan, currentAccount: account, stage: 'navigating', startTime: Date.now() };
            this.saveTaskState();

            const constraints = plan.constraints || { view_count: 5, like_count: 0 };
            const viewCount = parseInt(constraints.view_count) || 5;
            const operations = plan.operations || ['like'];
            const hasPositionPlan = !!constraints.position_plan;
            const slotMap = hasPositionPlan ? this._parsePositionPlan(constraints.position_plan, viewCount) : null;

            this.log('🎯 @' + account + ' | 浏览' + viewCount + '条, 操作:' + operations.join(',') + (hasPositionPlan ? ' [位置计划]' : ''), 'info');

            const navigated = await this.navigateToUserViaSearch(account);
            if (!navigated) {
                this.log('❌ 用户不存在', 'error');
                this.isRunning = false;
                this.updateUIState(false);
                return;
            }

            this.log('✅ 用户存在，执行中', 'success');
            this.currentTask.stage = 'executing';
            this.saveTaskState();

            let retries = 0;
            let tweets = [];
            while (retries < 8 && tweets.length === 0 && !this.abortFlag) {
                await this.sleep(2000, 3000);
                tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
                retries++;
                if (tweets.length === 0) { window.scrollBy({ top: 500, behavior: 'smooth' }); }
            }

            if (tweets.length === 0) {
                this.log('❌ 未找到推文', 'error');
                this.isRunning = false;
                this.updateUIState(false);
                return;
            }

            const actualTarget = Math.min(viewCount, tweets.length);

            this.log('✅ 找到 ' + tweets.length + ' 条，处理' + actualTarget + '条' + (hasPositionPlan ? ' [位置计划]' : ''), 'success');

            let processed = 0, liked = 0, retweeted = 0;

            // 传统模式下预计算随机点赞索引，避免循环内重复随机
            const likeCount = hasPositionPlan ? 0 : (constraints.like_count !== undefined ? parseInt(constraints.like_count) : 0);
            const likeIndices = (!hasPositionPlan && operations.includes('like') && likeCount > 0)
                ? this.selectRandomIndices(actualTarget, Math.min(likeCount, actualTarget))
                : [];

            for (let i = 0; i < tweets.length && processed < actualTarget && !this.abortFlag; i++) {
                const tweet = tweets[i];
                if (tweet.dataset.aiProcessed === 'true') continue;

                tweet.dataset.aiProcessed = 'true';
                tweet.style.boxShadow = '0 0 0 2px #1d9bf0';
                tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const text = tweet.innerText ? tweet.innerText.substring(0, 50).replace(/\n/g, ' ') : '';
                this.log('[' + (processed + 1) + '/' + actualTarget + '] ' + text + '...', 'info');

                await this.sleep(2500, 4500);
                this.stats.viewed++;
                this.updateStats();

                let tweetOps = [];

                if (hasPositionPlan && slotMap) {
                    const slotIndex = processed + 1;
                    if (slotMap.has(slotIndex)) {
                        tweetOps = Array.from(slotMap.get(slotIndex));
                        this.log('📋 第' + slotIndex + '条计划: ' + tweetOps.join(','), 'info');
                    } else {
                        tweetOps = ['view'];
                    }
                } else {
                    if (likeIndices.includes(processed)) tweetOps.push('like');
                    if (operations.includes('retweet')) tweetOps.push('retweet');
                    if (operations.includes('comment')) tweetOps.push('comment');
                }

                if (tweetOps.includes('like')) {
                    const likeBtn = tweet.querySelector('[data-testid="like"]');
                    if (likeBtn) {
                        likeBtn.click();
                        this.stats.liked++;
                        liked++;
                        this.updateStats();
                        this.log('❤️ 点赞 (' + liked + ')', 'success');
                        await this.sleep(1500, 2500);
                    }
                }

                if (tweetOps.includes('retweet')) {
                    const retweetBtn = tweet.querySelector('[data-testid="retweet"]');
                    if (retweetBtn) {
                        retweetBtn.click();
                        await this.sleep(2000, 3000);

                        let confirmBtn = document.querySelector('[data-testid="retweetConfirm"]') ||
                                          document.querySelector('[data-testid="unretweet"]');

                        if (!confirmBtn) {
                            const buttons = Array.from(document.querySelectorAll('div[role="button"], button[role="button"]'));
                            confirmBtn = buttons.find(el => {
                                const text = el.innerText || el.textContent || '';
                                return text.includes('Retweet') || text.includes('转发') || text.includes('Repost');
                            });
                        }

                        if (confirmBtn) {
                            confirmBtn.click();
                            this.stats.retweeted++;
                            retweeted++;
                            this.updateStats();
                            this.log('🔄 转发 (' + retweeted + ')', 'success');
                            await this.sleep(2000, 3000);
                        } else {
                            await this.sleep(1000, 1500);
                            const unretweetBtn = tweet.querySelector('[data-testid="unretweet"]');
                            if (unretweetBtn) {
                                this.stats.retweeted++;
                                retweeted++;
                                this.updateStats();
                                this.log('🔄 转发成功 (' + retweeted + ')', 'success');
                            } else {
                                this.log('⚠️ 转发确认按钮未找到', 'warning');
                            }
                        }
                    }
                }

                if (tweetOps.includes('comment') && this.config.enableComment && this.commentedCount < this.config.maxComments) {
                    await this.commentOnTweet(tweet);
                }

                processed++;
                this.currentTask.progress = { processed, liked, retweeted, total: actualTarget };
                this.saveTaskState();

                await this.sleep(3000, 5000);
            }

            if (plan.duration_minutes > 0 && !this.abortFlag) {
                const endTime = Date.now() + plan.duration_minutes * 60000;
                this.log('⏱️ 精确计划完成，继续浏览 ' + plan.duration_minutes + ' 分钟...', 'info');

                let timeProcessed = 0;
                while (Date.now() < endTime && !this.abortFlag) {
                    const moreTweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).filter(t => !t.dataset.aiProcessed);

                    if (moreTweets.length === 0) {
                        window.scrollBy({ top: 800, behavior: 'smooth' });
                        await this.sleep(3000, 5000);
                        continue;
                    }

                    for (let tweet of moreTweets) {
                        if (Date.now() >= endTime || this.abortFlag) break;
                        if (tweet.dataset.aiProcessed === 'true') continue;

                        tweet.dataset.aiProcessed = 'true';
                        tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        const text = tweet.innerText ? tweet.innerText.substring(0, 40) : '';
                        this.log('[浏览] ' + text + '...', 'info');

                        await this.sleep(2000, 4000);
                        this.stats.viewed++;
                        this.updateStats();
                        timeProcessed++;

                        await this.sleep(3000, 5000);
                    }
                }

                this.log('⏱️ 时间浏览结束', 'success');
            }

            this.log('🎉 完成 @' + account + ': 浏览' + processed + (plan.duration_minutes > 0 ? '+时间' : '') + ',点赞' + liked + ',转发' + retweeted, 'success');
            this.isRunning = false;
            this.currentTask = null;
            this.updateUIState(false);
        }

        async startHomeWarming(plan) {
            this.isRunning = true;
            this.abortFlag = false;
            this.updateUIState(true);
            this.currentTask = { ...plan, startTime: Date.now() };

            const constraints = plan.constraints || { view_count: 10, like_count: 0 };
            const viewCount = parseInt(constraints.view_count) || 10;
            const operations = plan.operations || ['like'];
            const hasPositionPlan = !!constraints.position_plan;
            const slotMap = hasPositionPlan ? this._parsePositionPlan(constraints.position_plan, viewCount) : null;

            this.log('🏠 首页: 浏览' + viewCount + '条' + (hasPositionPlan ? ' [位置计划]' : '') + ', 操作:' + operations.join(','), 'info');

            if (!window.location.href.match(/^https:\/\/(twitter\.com|x\.com)\/?$/) && !window.location.href.match(/^https:\/\/(twitter\.com|x\.com)\/home$/)) {
                this.log('🔄 返回首页...', 'info');
                window.history.pushState({}, '', '/home');
                window.dispatchEvent(new PopStateEvent('popstate'));
                await this.sleep(3000, 4000);
            }

            // 传统模式下预计算随机点赞索引
            const likeCount = hasPositionPlan ? 0 : (constraints.like_count !== undefined ? parseInt(constraints.like_count) : 0);
            const likeIndices = (!hasPositionPlan && operations.includes('like') && likeCount > 0)
                ? this.selectRandomIndices(viewCount, Math.min(likeCount, viewCount))
                : [];

            let processed = 0;
            let liked = 0, retweeted = 0;

            while (processed < viewCount && this.isRunning && !this.abortFlag) {
                const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).filter(t => !t.dataset.aiProcessed);
                if (tweets.length === 0) {
                    window.scrollBy({ top: 800, behavior: 'smooth' });
                    await this.sleep(3000, 5000);
                    continue;
                }

                for (let tweet of tweets) {
                    if (processed >= viewCount || this.abortFlag) break;
                    tweet.dataset.aiProcessed = 'true';
                    tweet.style.boxShadow = '0 0 0 2px #1d9bf0';
                    tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    const text = tweet.innerText ? tweet.innerText.substring(0, 40) : '';
                    this.log('[' + (processed + 1) + '/' + viewCount + '] ' + text + '...', 'info');

                    await this.sleep(2000, 4000);
                    this.stats.viewed++;
                    this.updateStats();

                    let tweetOps = [];
                    if (hasPositionPlan && slotMap) {
                        const slotIndex = processed + 1;
                        if (slotMap.has(slotIndex)) {
                            tweetOps = Array.from(slotMap.get(slotIndex));
                            this.log('📋 第' + slotIndex + '条计划: ' + tweetOps.join(','), 'info');
                        } else {
                            tweetOps = ['view'];
                        }
                    } else {
                        if (likeIndices.includes(processed)) tweetOps.push('like');
                        if (operations.includes('retweet')) tweetOps.push('retweet');
                        if (operations.includes('comment')) tweetOps.push('comment');
                    }

                    if (tweetOps.includes('like')) {
                        const likeBtn = tweet.querySelector('[data-testid="like"]');
                        if (likeBtn) {
                            likeBtn.click();
                            this.stats.liked++;
                            liked++;
                            this.updateStats();
                            this.log('❤️ 点赞 (' + liked + ')', 'success');
                            await this.sleep(1500, 2500);
                        }
                    }

                    if (tweetOps.includes('retweet')) {
                        const retweetBtn = tweet.querySelector('[data-testid="retweet"]');
                        if (retweetBtn) {
                            retweetBtn.click();
                            await this.sleep(2000, 3000);
                            let confirmBtn = document.querySelector('[data-testid="retweetConfirm"]') ||
                                              document.querySelector('[data-testid="unretweet"]');
                            if (!confirmBtn) {
                                const buttons = Array.from(document.querySelectorAll('div[role="button"], button[role="button"]'));
                                confirmBtn = buttons.find(el => {
                                    const text = el.innerText || el.textContent || '';
                                    return text.includes('Retweet') || text.includes('转发') || text.includes('Repost');
                                });
                            }
                            if (confirmBtn) {
                                confirmBtn.click();
                                this.stats.retweeted++;
                                retweeted++;
                                this.updateStats();
                                this.log('🔄 转发 (' + retweeted + ')', 'success');
                                await this.sleep(2000, 3000);
                            } else {
                                await this.sleep(1000, 1500);
                                const unretweetBtn = tweet.querySelector('[data-testid="unretweet"]');
                                if (unretweetBtn) {
                                    this.stats.retweeted++;
                                    retweeted++;
                                    this.updateStats();
                                    this.log('🔄 转发成功 (' + retweeted + ')', 'success');
                                } else {
                                    this.log('⚠️ 转发确认按钮未找到', 'warning');
                                }
                            }
                        }
                    }

                    if (tweetOps.includes('comment') && this.config.enableComment && this.commentedCount < this.config.maxComments) {
                        await this.commentOnTweet(tweet);
                    }

                    processed++;
                    await this.sleep(3000, 5000);
                }
            }

            this.log('🎉 首页完成! 浏览' + processed + '条,点赞' + liked + ',转发' + retweeted, 'success');
            this.isRunning = false;
            this.currentTask = null;
            this.updateUIState(false);
        }

        async startFollowingWarming(plan) {
            this.isRunning = true;
            this.currentTask = { ...plan, stage: 'executing' };
            if (!window.location.href.includes('/following')) {
                window.history.pushState({}, '', '/following');
                window.dispatchEvent(new PopStateEvent('popstate'));
                await this.sleep(3000, 4000);
            }
            const durationMinutes = plan.duration_minutes || 10;
            const endTime = Date.now() + durationMinutes * 60000;

            while (Date.now() < endTime && this.isRunning && !this.abortFlag) {
                const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).filter(t => !t.dataset.aiProcessed);
                if (tweets.length === 0) {
                    window.scrollBy({ top: 800, behavior: 'smooth' });
                    await this.sleep(5000, 8000);
                    continue;
                }

                for (let tweet of tweets) {
                    if (Date.now() >= endTime || this.abortFlag) break;
                    tweet.dataset.aiProcessed = 'true';
                    tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.sleep(2000, 4000);
                    this.stats.viewed++;
                    this.updateStats();
                    if (Math.random() > 0.6) {
                        const likeBtn = tweet.querySelector('[data-testid="like"]');
                        if (likeBtn) {
                            likeBtn.click();
                            this.stats.liked++;
                            this.updateStats();
                        }
                    }
                    await this.sleep(4000, 6000);
                }
            }
            this.isRunning = false;
        }

        async commentOnTweet(tweet) {
            const tweetText = tweet.innerText || '';
            const result = await aiAgent.generateComment(tweetText, (msg, type) => this.log(msg, type));
            if (!result || !result.comment) return false;

            try {
                const replyBtn = tweet.querySelector('[data-testid="reply"]');
                if (!replyBtn) return false;
                replyBtn.click();
                await this.sleep(2500, 3500);
                let textarea = null;
                for (let i = 0; i < 15; i++) {
                    textarea = document.querySelector('div[data-testid="tweetTextarea_0"]') ||
                              document.querySelector('div[contenteditable="true"][role="textbox"]');
                    if (textarea) break;
                    await this.sleep(1000, 1500);
                }
                if (!textarea) return false;
                textarea.focus(); textarea.click(); await this.sleep(500, 800);
                document.execCommand('insertText', false, result.comment);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(2000, 3000);
                const sendBtn = document.querySelector('button[data-testid="tweetButton"]');
                if (sendBtn && !sendBtn.disabled) {
                    sendBtn.click();
                    this.stats.commented++;
                    this.commentedCount++;
                    this.updateStats();
                    this.log('🚀 [' + result.lang + ']已发送', 'success');
                    await this.sleep(8000, 12000);
                    return true;
                }
                return false;
            } catch (err) { return false; }
        }

        updateUIState(running) {
            const startBtn = document.getElementById('btn-start');
            const stopBtn = document.getElementById('btn-stop');
            if (startBtn && stopBtn) {
                if (running) {
                    startBtn.classList.add('hidden');
                    stopBtn.classList.remove('hidden');
                } else {
                    startBtn.classList.remove('hidden');
                    stopBtn.classList.add('hidden');
                }
            }
        }
    }

    function createUI() {
        if (document.getElementById('warmer-panel')) return;
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);

        const isDark = document.body.style.backgroundColor === 'rgb(21, 32, 43)';
        const panel = document.createElement('div');
        panel.id = 'warmer-panel';
        if (isDark) panel.classList.add('dark-mode');

        const warmer = new TwitterWarmer();

        panel.innerHTML = '<div class="warmer-header"><span>🌐 X-Warmer v4.0.2</span><span style="font-size:11px">32B+位置计划</span></div>' +
            '<div class="warmer-body">' +
            '<div class="section-title">🎯 操作模式</div>' +
            '<div class="mode-selector">' +
            '<label class="mode-option"><input type="radio" name="operation-mode" value="ai_command" id="mode-ai-command">' +
            '<div><div class="mode-label">🤖 AI智能指令</div><div style="font-size:11px;color:#657786;margin-left:26px">自然语言控制</div></div></label>' +
            '<label class="mode-option"><input type="radio" name="operation-mode" value="normal" id="mode-normal" checked>' +
            '<div><div class="mode-label">🔄 常规养号</div><div style="font-size:11px;color:#657786;margin-left:26px">传统浏览点赞</div></div></label>' +
            '</div>' +
            '<div id="normal-mode-controls">' +
            '<div class="section-title">⚡ 运行设置</div>' +
            '<label class="warmer-checkbox"><input type="checkbox" id="enable-comment" checked><span><strong>启用AI评论</strong></span></label>' +
            '<div class="section-title" style="margin-top:12px">📊 数据统计</div>' +
            '<div class="stats-box">' +
            '<div class="stat-item"><div class="stat-value" id="stat-viewed">' + warmer.stats.viewed + '</div><div class="stat-label">已浏览</div></div>' +
            '<div class="stat-item"><div class="stat-value" id="stat-liked">' + warmer.stats.liked + '</div><div class="stat-label">已点赞</div></div>' +
            '<div class="stat-item"><div class="stat-value" id="stat-commented">' + warmer.stats.commented + '</div><div class="stat-label">AI评论</div></div>' +
            '</div>' +
            '<button id="btn-start" class="warmer-btn btn-primary">▶️ 开始AI养号</button>' +
            '<button id="btn-stop" class="warmer-btn btn-danger hidden">⏹️ 停止运行</button>' +
            '</div>' +
            '<div id="ai-command-section" class="hidden">' +
            '<div class="section-title">📝 AI智能指令输入</div>' +
            '<div style="font-size:11px;color:#657786;margin-bottom:8px">支持："去@账号点赞前5条评论第6条转发第8条"</div>' +
            '<textarea id="ai-command-input" class="ai-command-input" placeholder="请输入指令..."></textarea>' +
            '<div class="button-group" style="margin-top:10px">' +
            '<button id="btn-send-ai-command" class="warmer-btn btn-secondary" style="flex:2">📤 发送指令</button>' +
            '<button id="btn-abort-ai-command" class="warmer-btn btn-warning" style="flex:1" disabled>⏹️ 暂停</button>' +
            '</div>' +
            '</div>' +
            '<div id="warmer-logs" class="warmer-status"><div class="log-entry"><span class="log-time">[系统]</span>v4.0.2 32B模型+position_plan | 首页计划支持 | 移除降温</div></div>' +
            '</div>';

        document.body.appendChild(panel);

        document.getElementById('mode-normal').addEventListener('change', function() { if (this.checked) warmer.switchMode('normal'); });
        document.getElementById('mode-ai-command').addEventListener('change', function() { if (this.checked) warmer.switchMode('ai_command'); });
        document.getElementById('btn-start').addEventListener('click', function() {
            warmer.config.enableComment = document.getElementById('enable-comment').checked;
            warmer.startHomeWarming({ constraints: { view_count: 10, like_count: 3 } });
        });
        document.getElementById('btn-stop').addEventListener('click', function() { warmer.stop(); });
        document.getElementById('btn-send-ai-command').addEventListener('click', function() { warmer.executeAICommand(); });
        document.getElementById('btn-abort-ai-command').addEventListener('click', function() { warmer.abortCommand(); });
        document.getElementById('ai-command-input').addEventListener('keydown', function(e) { if (e.ctrlKey && e.key === 'Enter') warmer.executeAICommand(); });

        let isDragging = false;
        const header = panel.querySelector('.warmer-header');
        header.addEventListener('mousedown', function(e) {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            panel.dataset.offsetX = e.clientX - rect.left;
            panel.dataset.offsetY = e.clientY - rect.top;
            panel.style.right = 'auto';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            panel.style.left = (e.clientX - parseFloat(panel.dataset.offsetX)) + 'px';
            panel.style.top = (e.clientY - parseFloat(panel.dataset.offsetY)) + 'px';
        });
        document.addEventListener('mouseup', function() { isDragging = false; });

        console.log('✅ v4.0.2 32B+position_plan+首页计划支持+无降温 加载成功');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();
