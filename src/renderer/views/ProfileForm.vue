<template>
  <div class="profile-form-container">
    <!-- 优化3：页面标题区增加返回按钮 -->
    <div class="page-header">
      <a-button type="link" @click="handleBack">
        <LeftOutlined /> 返回
      </a-button>
      <h1 class="page-title">{{ isEdit ? '✏️ 编辑窗口' : '➕ 新建窗口' }}</h1>
    </div>

    <!-- Phase 2.3: 智能配置提示卡片 -->
    <a-card size="small" style="margin-bottom: 16px; background: #f6ffed; border-color: #b7eb8f;">
      <a-space align="center">
        <BulbOutlined style="color: #52c41a; font-size: 18px;" />
        <span style="color: #389e0d;">根据当前绑定的代理IP，一键匹配最佳指纹配置</span>
        <a-button 
          type="primary" 
          :loading="smartConfigLoading" 
          @click="handleSmartConfig"
        >
          🎯 智能配置
        </a-button>
      </a-space>
    </a-card>

    <!-- Phase 3.0: 左右分栏布局 -->
    <a-row :gutter="24">
      <!-- 左侧：表单区域 (16/24) -->
      <a-col :span="16">
        <a-form
          ref="formRef"
          :model="formState"
          :rules="rules"
          layout="vertical"
          class="profile-form"
        >
          <!-- 基本信息卡片 -->
          <a-card :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span>
                📋 基本信息
                <a-tooltip title="设置窗口名称和绑定的代理。窗口标题用于标识不同窗口，方便管理；代理可帮助隐藏真实 IP 位置。">
                  <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
                </a-tooltip>
              </span>
            </template>
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="窗口标题" name="title">
                  <a-input
                    v-model:value="formState.title"
                    placeholder="如：账号1-美国代理"
                    :maxlength="50"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="绑定代理" name="proxyId">
                  <a-select
                    v-model:value="formState.proxyId"
                    placeholder="选择代理（可选）"
                    allowClear
                  >
                    <a-select-option v-for="proxy in proxyList" :key="proxy.id" :value="proxy.id">
                      {{ proxy.name }} ({{ proxy.host }}:{{ proxy.port }})
                    </a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
          </a-card>

          <!-- 浏览器指纹卡片 -->
          <a-card :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span>
                🖥️ 浏览器指纹
                <a-tooltip title="模拟不同浏览器的指纹特征，包括版本、操作系统、语言等，使每个窗口看起来像真实用户，降低被检测风险。">
                  <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
                </a-tooltip>
              </span>
            </template>
            <a-row :gutter="16">
              <a-col :span="8">
                <a-form-item label="Chrome 版本" name="chromeVersion">
                  <a-select v-model:value="formState.chromeVersion">
                    <a-select-option value="121">Chrome 121</a-select-option>
                    <a-select-option value="122">Chrome 122</a-select-option>
                    <a-select-option value="123">Chrome 123</a-select-option>
                    <a-select-option value="124">Chrome 124</a-select-option>
                    <a-select-option value="140">Chrome 140</a-select-option>
                    <a-select-option value="141">Chrome 141</a-select-option>
                    <a-select-option value="142">Chrome 142</a-select-option>
                    <a-select-option value="143">Chrome 143</a-select-option>
                    <a-select-option value="144">Chrome 144</a-select-option>
                    <a-select-option value="145">Chrome 145</a-select-option>
                    <a-select-option value="147">Chrome 147</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="操作系统" name="os">
                  <a-select v-model:value="formState.os">
                    <a-select-option value="windows">Windows</a-select-option>
                    <a-select-option value="mac">macOS</a-select-option>
                    <a-select-option value="linux">Linux</a-select-option>
                    <a-select-option value="android">Android</a-select-option>
                    <a-select-option value="ios">iOS</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="界面语言" name="uiLanguage">
                  <a-select v-model:value="formState.uiLanguage">
                    <a-select-option value="auto">🌐 跟随代理IP</a-select-option>
                    <a-select-option value="zh-CN">简体中文</a-select-option>
                    <a-select-option value="zh-TW">繁体中文</a-select-option>
                    <a-select-option value="en-US">English (US)</a-select-option>
                    <a-select-option value="en-GB">English (UK)</a-select-option>
                    <a-select-option value="de-DE">Deutsch</a-select-option>
                    <a-select-option value="ja-JP">日本語</a-select-option>
                    <a-select-option value="ko-KR">한국어</a-select-option>
                    <a-select-option value="fr-FR">Français</a-select-option>
                    <a-select-option value="es-ES">Español</a-select-option>
                    <a-select-option value="ru-RU">Русский</a-select-option>
                    <a-select-option value="pt-BR">Português (BR)</a-select-option>
                    <a-select-option value="it-IT">Italiano</a-select-option>
                    <a-select-option value="nl-NL">Nederlands</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>

            <a-row :gutter="16">
              <a-col :span="8">
                <a-form-item label="屏幕分辨率" name="screenResolution">
                  <a-select v-model:value="formState.screenResolution">
                    <a-select-option value="auto">🌐 跟随代理IP</a-select-option>
                    <a-select-option value="1920x1080">1920 × 1080</a-select-option>
                    <a-select-option value="1366x768">1366 × 768</a-select-option>
                    <a-select-option value="1536x864">1536 × 864</a-select-option>
                    <a-select-option value="1280x720">1280 × 720</a-select-option>
                    <a-select-option value="2560x1440">2560 × 1440</a-select-option>
                    <a-select-option value="3840x2160">3840 × 2160</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="字体" name="font">
                  <a-select v-model:value="formState.font">
                    <a-select-option value="auto">🌐 跟随代理IP</a-select-option>
                    <a-select-option value="default">系统默认</a-select-option>
                    <a-select-option value="Arial">Arial</a-select-option>
                    <a-select-option value="Microsoft YaHei">微软雅黑</a-select-option>
                    <a-select-option value="Microsoft JhengHei">微软正黑体</a-select-option>
                    <a-select-option value="Meiryo">Meiryo (メイリオ)</a-select-option>
                    <a-select-option value="Malgun Gothic">Malgun Gothic (맑은 고딕)</a-select-option>
                    <a-select-option value="Times New Roman">Times New Roman</a-select-option>
                    <a-select-option value="Helvetica">Helvetica</a-select-option>
                    <a-select-option value="Segoe UI">Segoe UI</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="语言模式" name="languageMode">
                  <a-select v-model:value="formState.languageMode">
                    <a-select-option value="ip">跟随代理IP</a-select-option>
                    <a-select-option value="mask">模拟浏览器</a-select-option>
                    <a-select-option value="custom">自定义</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
          </a-card>

          <!-- 高级指纹卡片 -->
          <a-card :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span>
                🔒 高级指纹保护
                <a-tooltip title="增强防护：Canvas、WebGL、媒体设备等高级指纹可隐藏真实硬件信息，防止被网站追踪识别。">
                  <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
                </a-tooltip>
              </span>
            </template>
            <a-row :gutter="16">
              <a-col :span="6">
                <a-form-item label="WebRTC 防护" name="webrtcMode">
                  <a-select v-model:value="formState.webrtcMode">
                    <a-select-option value="forward">转发（Google STUN）</a-select-option>
                    <a-select-option value="replace">替换为代理IP</a-select-option>
                    <a-select-option value="real">使用真实IP</a-select-option>
                    <a-select-option value="disable">完全禁用</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="Canvas 指纹" name="canvasMode">
                  <a-select v-model:value="formState.canvasMode">
                    <a-select-option value="noise">添加噪声</a-select-option>
                    <a-select-option value="block">屏蔽</a-select-option>
                    <a-select-option value="fake">模拟</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="WebGL 指纹" name="webglMode">
                  <a-select v-model:value="formState.webglMode">
                    <a-select-option value="mock">模拟</a-select-option>
                    <a-select-option value="disable">禁用</a-select-option>
                    <a-select-option value="real">真实</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="6">
                <a-form-item label="媒体设备" name="mediaDeviceMode">
                  <a-select v-model:value="formState.mediaDeviceMode">
                    <a-select-option value="mock">模拟设备</a-select-option>
                    <a-select-option value="disable">禁用设备</a-select-option>
                    <a-select-option value="real">使用真实</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>

            <a-row :gutter="16">
              <a-col :span="8">
                <a-form-item label="时区模式" name="timezoneMode">
                  <a-select v-model:value="formState.timezoneMode">
                    <a-select-option value="ip">跟随代理IP</a-select-option>
                    <a-select-option value="custom">自定义时区</a-select-option>
                    <a-select-option value="real">使用真实时区</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="地理位置" name="geolocationMode">
                  <a-select v-model:value="formState.geolocationMode">
                    <a-select-option value="ip">跟随代理IP</a-select-option>
                    <a-select-option value="custom">自定义位置</a-select-option>
                    <a-select-option value="real">使用真实位置</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
          </a-card>

            <!-- 启动页面设置 -->
          <a-card :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span>
                🌐 启动页面
                <a-tooltip title="设置窗口启动后自动打开的网页地址。留空则默认打开 Google 搜索。">
                  <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
                </a-tooltip>
              </span>
            </template>
            <a-form-item name="startupUrl">
              <a-input
                v-model:value="formState.startupUrl"
                placeholder="请输入启动后自动打开的网址，例如 https://www.facebook.com"
                allow-clear
              />
            </a-form-item>
            <div class="platform-logos">
              <a-tooltip title="Facebook" @click="fillUrl('https://www.facebook.com')">
                <div class="platform-logo"><span style="color:#1877F2;font-weight:bold;">f</span></div>
              </a-tooltip>
              <a-tooltip title="YouTube" @click="fillUrl('https://www.youtube.com')">
                <div class="platform-logo"><span style="color:#FF0000;">▶</span></div>
              </a-tooltip>
              <a-tooltip title="Instagram" @click="fillUrl('https://www.instagram.com')">
                <div class="platform-logo"><span>📷</span></div>
              </a-tooltip>
              <a-tooltip title="X (Twitter)" @click="fillUrl('https://x.com')">
                <div class="platform-logo"><span style="color:#000;font-weight:bold;">X</span></div>
              </a-tooltip>
              <a-tooltip title="LinkedIn" @click="fillUrl('https://www.linkedin.com')">
                <div class="platform-logo"><span style="color:#0A66C2;font-size:12px;">in</span></div>
              </a-tooltip>
              <a-tooltip title="TikTok" @click="fillUrl('https://www.tiktok.com')">
                <div class="platform-logo"><span>♪</span></div>
              </a-tooltip>
              <a-tooltip title="Reddit" @click="fillUrl('https://www.reddit.com')">
                <div class="platform-logo"><span style="color:#FF4500;font-size:14px;">r</span></div>
              </a-tooltip>
              <a-tooltip title="Amazon" @click="fillUrl('https://www.amazon.com')">
                <div class="platform-logo"><span>🛒</span></div>
              </a-tooltip>
            </div>
          </a-card>

          <!-- ========== Phase 4.0: 平台账号卡片 ========== -->
          <a-card :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span>
                🔑 平台账号（Twitter/X 自动登录）
                <a-tooltip title="配置 Twitter/X 账号信息，窗口启动后自动登录。支持密码和两步验证（APP验证码/SMS）。">
                  <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
                </a-tooltip>
              </span>
            </template>
            <template #extra>
              <a-button type="primary" size="small" @click="openAddPlatformAccount">
                <PlusOutlined /> 添加账号
              </a-button>
            </template>
            
            <!-- 账号列表 -->
            <a-empty v-if="platformAccounts.length === 0" description="暂无账号，点击上方添加">
              <template #image>
                <TwitterOutlined style="font-size: 40px; color: #1890ff;" />
              </template>
            </a-empty>
            
            <a-table
              v-else
              :dataSource="platformAccounts"
              :columns="platformAccountColumns"
              :pagination="false"
              rowKey="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <!-- 账号列：宽度缩小 + tooltip -->
                <template v-if="column.key === 'account'">
                  <a-tooltip :title="record.account">
                    <span class="account-ellipsis">{{ record.account }}</span>
                  </a-tooltip>
                </template>
                <!-- 平台列（Phase 4.2 新增）：显示平台名称 + logo -->
                <template v-if="column.key === 'platform'">
                  <span class="platform-tag">
                    <svg v-if="record.platform === 'twitter'" class="platform-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="currentColor"/></svg>
                    <span v-else-if="record.platform === 'outlook'" class="platform-icon-text">📧</span>
                    {{ record.platform === 'twitter' ? 'Twitter/X' : record.platform === 'outlook' ? 'Outlook' : record.platform }}
                  </span>
                </template>
                <template v-if="column.key === 'two_fa_type'">
                  <a-tag v-if="record.two_fa_type === 'totp'" color="blue">TOTP</a-tag>
                  <a-tag v-else-if="record.two_fa_type === 'sms'" color="orange">SMS</a-tag>
                  <span v-else style="color: #999;">无</span>
                </template>
                <template v-if="column.key === 'is_active'">
                  <a-badge :status="record.is_active ? 'success' : 'default'" :text="record.is_active ? '启用' : '禁用'" />
                </template>
                <template v-if="column.key === 'action'">
                  <a-space>
                    <a-button type="link" size="small" @click="openEditPlatformAccount(record)">编辑</a-button>
                    <a-popconfirm
                      title="是否确认删除该账号信息？"
                      :disabled="record.is_active"
                      @confirm="handleDeletePlatformAccount(record.id)"
                    >
                      <a-button type="link" size="small" danger :disabled="record.is_active">删除</a-button>
                    </a-popconfirm>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>

          <!-- 导入 Cookie 卡片 -->
          <a-card :bordered="false" style="margin-bottom: 16px;">
            <template #title>
              <span>
                📥 导入 Cookie
                <a-tooltip title="窗口运行时可导入 Cookie，支持 JSON 数组格式。">
                  <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
                </a-tooltip>
              </span>
            </template>
            <a-space direction="vertical" :size="12" style="width: 100%;">
              <a-radio-group v-model:value="importMode">
                <a-radio value="json">📄 JSON 文件导入</a-radio>
                <a-radio value="paste">📋 粘贴 JSON 文本</a-radio>
              </a-radio-group>

              <div v-if="importMode === 'json'">
                <a-upload :before-upload="beforeUploadCookieFile" :max-count="1" accept=".json">
                  <a-button><UploadOutlined /> 选择 JSON 文件</a-button>
                </a-upload>
                <div v-if="importFileJson" style="margin-top: 8px; color: #52c41a;">文件已加载：{{ importFileJson.length }} 字符</div>
              </div>
              <div v-else>
                <a-textarea v-model:value="formState.cookieText" :placeholder="cookiePlaceholder" :rows="4" style="font-family: monospace;" />
              </div>

              <div>
                <a-space>
                  <a-button type="primary" :loading="importing" :disabled="!canImport" @click="handleImportCookie">
                    🚀 导入 Cookie
                  </a-button>
                  <a-button size="small" @click="goToCookieManager">🍪 管理 Cookie</a-button>
                </a-space>
              </div>

              <a-alert v-if="importResult" :type="importResult.success ? 'success' : 'error'" :message="importResult.message" show-icon />
              
              <div v-if="!isProfileRunning" style="color: #52c41a;">✅ 窗口未运行，点击导入将保存为预置 Cookie</div>
              <div v-else style="color: #52c41a;">✅ 窗口运行中，点击导入将实时写入浏览器</div>
            </a-space>
          </a-card>

          <!-- 按钮区域 -->
          <div class="form-actions">
            <a-space>
              <a-button type="primary" @click="handleSubmit" :loading="submitting">
                {{ isEdit ? '保存修改' : '创建窗口' }}
              </a-button>
              <a-button @click="handleBack">取消</a-button>
            </a-space>
          </div>
        </a-form>
      </a-col>

      <!-- 右侧：浏览器设定卡片 (8/24) -->
      <a-col :span="8">
        <a-card title="浏览器设定" :bordered="true" style="position: sticky; top: 24px;">
          <template #extra>
            <a-button type="primary" size="small" @click="handleGenerateFingerprint" :loading="generating">
              <SyncOutlined /> 生成新指纹
            </a-button>
          </template>
          
          <div class="browser-info" style="margin-bottom: 16px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <ChromeOutlined style="font-size: 24px; margin-right: 8px; color: #4285f4;" />
              <span style="font-weight: 500;">{{ browserSettings.browser }}</span>
            </div>
          </div>
          
          <a-descriptions :column="1" size="small" bordered>
            <a-descriptions-item label="User-Agent">
              <span class="text-wrap">{{ browserSettings.userAgent }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="WebRTC">
              <a-tag :color="getWebrtcColor(browserSettings.webrtc)">{{ browserSettings.webrtc }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="时区">{{ browserSettings.timezone }}</a-descriptions-item>
            <a-descriptions-item label="地理位置">{{ browserSettings.geolocation }}</a-descriptions-item>
            <a-descriptions-item label="语言">{{ browserSettings.language }}</a-descriptions-item>
            <a-descriptions-item label="界面语言">{{ browserSettings.uiLanguage }}</a-descriptions-item>
            <a-descriptions-item label="分辨率">{{ browserSettings.resolution }}</a-descriptions-item>
            <a-descriptions-item label="字体">{{ browserSettings.font }}</a-descriptions-item>
            <a-descriptions-item label="Canvas">
              <span>{{ browserSettings.canvas }}</span>
              <a-tag v-if="formState.canvasNoiseSeed" color="blue" style="margin-left: 4px;">{{ formState.canvasNoiseSeed }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="WebGL 图像">{{ browserSettings.webglImage }}</a-descriptions-item>
            <a-descriptions-item label="WebGL 元数据">{{ browserSettings.webglMetadata }}</a-descriptions-item>
            <a-descriptions-item label="AudioContext">
              <span>{{ browserSettings.audioContext }}</span>
              <a-tag v-if="formState.audioNoiseSeed" color="blue" style="margin-left: 4px;">{{ formState.audioNoiseSeed }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="ClientRects">
              <span>{{ browserSettings.clientRects }}</span>
              <a-tag v-if="formState.rectsNoiseSeed" color="blue" style="margin-left: 4px;">{{ formState.rectsNoiseSeed }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="设备名称">{{ browserSettings.deviceName }}</a-descriptions-item>
            <a-descriptions-item label="MAC 地址">{{ browserSettings.macAddress }}</a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>
    </a-row>

    <!-- Phase 4.0/4.2: 平台账号添加/编辑弹窗 -->
    <a-modal v-model:open="platformAccountVisible" :title="platformAccountEditing ? '编辑账号' : '添加账号'" @ok="handleSavePlatformAccount" :width="500" :mask-closable="false">
      <a-form ref="platformAccountFormRef" :model="platformAccountForm" layout="vertical">
        <!-- Phase 4.2 新增：平台选择（默认值为 twitter，可不验证） -->
        <a-form-item label="平台">
          <a-select v-model:value="platformAccountForm.platform" placeholder="选择平台">
            <a-select-option value="twitter">
              <span class="select-option-with-icon">
                <svg class="option-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="currentColor"/></svg>
                Twitter / X
              </span>
            </a-select-option>
            <a-select-option value="outlook">
              <span class="select-option-with-icon">
                <span class="option-icon-text">📧</span>
                Outlook
              </span>
            </a-select-option>
          </a-select>
        </a-form-item>
        <!-- 账号 -->
        <a-form-item label="账号（用户名/邮箱/手机）" name="account" :rules="[{ required: true, message: '请输入账号' }]">
          <a-input v-model:value="platformAccountForm.account" :placeholder="platformAccountForm.platform === 'twitter' ? 'Twitter 用户名或邮箱' : 'Outlook 邮箱'" />
        </a-form-item>
        <!-- 密码 -->
        <a-form-item label="密码" name="password" :rules="[{ required: !platformAccountEditing, message: '请输入密码' }]">
          <a-input-password v-model:value="platformAccountForm.password" :placeholder="platformAccountEditing ? '留空则不修改原密码' : (platformAccountForm.platform === 'twitter' ? 'Twitter 密码' : 'Outlook 密码')" />
        </a-form-item>
        <!-- 账号名确认（仅 Twitter/X 显示，Phase 4.2） -->
        <a-form-item v-if="platformAccountForm.platform === 'twitter'" name="username_confirm">
          <template #label>
            <span>
              账号名确认
              <a-tooltip title="X在账号异常时会要求填上用户您的推特名称，您可输入当前要登陆账号的名称，@开头。具体可登录推特后的个人信息页查看">
                <question-circle-outlined style="margin-left: 4px; color: #999; cursor: help;" />
              </a-tooltip>
            </span>
          </template>
          <a-input v-model:value="platformAccountForm.username_confirm" placeholder="@username（可选，账号异常时自动填入）" />
        </a-form-item>
        <a-form-item label="两步验证方式" name="two_fa_type">
          <a-select v-model:value="platformAccountForm.two_fa_type" placeholder="选择 2FA 类型（可选）" allow-clear>
            <a-select-option value="totp">TOTP（手机验证码 APP，如 Google Authenticator）</a-select-option>
            <a-select-option value="sms">SMS（短信验证码）</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="platformAccountForm.two_fa_type === 'totp'" label="TOTP 密钥（Base32）" name="two_fa_secret">
          <a-input v-model:value="platformAccountForm.two_fa_secret" placeholder="JBSWY3DPEHPK3PXP" />
        </a-form-item>
        <a-form-item v-if="platformAccountForm.two_fa_type === 'sms'" label="备用恢复码（每行一个）" name="two_fa_backup_codes">
          <a-textarea v-model:value="platformAccountForm.two_fa_backup_codes" :rows="4" placeholder="每行一个恢复码" />
        </a-form-item>
        <a-form-item name="is_active">
          <a-checkbox v-model:checked="platformAccountForm.is_active">启用此账号（自动登录时使用）</a-checkbox>
        </a-form-item>
      </a-form>
    </a-modal>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { LeftOutlined, QuestionCircleOutlined, UploadOutlined, SyncOutlined, ChromeOutlined, BulbOutlined, PlusOutlined, TwitterOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import { getProxyList, type ProxyRecord } from '../api/proxy'
import { getProfileDetail, createProfile, updateProfile, type ProfileDto, type ProfileRecord } from '../api/profile'
import { smartConfigProfile, generateFingerprint } from '../api/profile'
import request from '../api/request'

// ========== Phase 4.0: 平台账号管理 ==========
import { getPlatformAccounts, createPlatformAccount, updatePlatformAccount, deletePlatformAccount } from '../api/platform-account'
import type { PlatformAccount } from '@/types'

const generating = ref(false)
const smartConfigLoading = ref(false)

// 浏览器设定卡片数据
const browserSettings = computed(() => {
  const version = formState.chromeVersion || '128'
  const defaultUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`
  return {
    browser: `SunBrowser [Chrome ${version}]`,
    userAgent: formState.userAgent || defaultUA,
    webrtc: formState.webrtcMode === 'disable' ? '禁用' : formState.webrtcMode === 'replace' ? '替换' : formState.webrtcMode === 'forward' ? '转发' : '真实',
    timezone: formState.timezoneMode === 'ip' ? '基于 IP' : formState.timezoneMode === 'custom' ? '自定义' : '真实',
    geolocation: formState.geolocationMode === 'ip' ? '基于 IP' : formState.geolocationMode === 'custom' ? '自定义' : '真实',
    language: formState.languageMode === 'ip' ? '基于 IP' : formState.languageMode === 'mask' ? '模拟浏览器' : '自定义',
    uiLanguage: formState.uiLanguage || '基于语言',
    resolution: formState.screenResolution || '基于 User-Agent',
    font: formState.font || '默认',
    canvas: formState.canvasMode === 'noise' ? `噪声 [${formState.canvasNoiseSeed || '未设置'}]` : '真实',
    webglImage: formState.webglMode === 'mock' ? '伪装' : formState.webglMode === 'disable' ? '禁用' : '真实',
    webglMetadata: formState.webglVendor ? `${formState.webglVendor} (${formState.webglRenderer || ''})` : '未设置',
    audioContext: formState.audioNoiseSeed ? `噪声 [${formState.audioNoiseSeed}]` : '未设置',
    clientRects: formState.rectsNoiseSeed ? `噪声 [${formState.rectsNoiseSeed}]` : '未设置',
    deviceName: formState.deviceName || '未设置',
    macAddress: formState.macAddress || '未设置',
  }
})

function getWebrtcColor(mode: string) {
  if (mode === '禁用') return 'green'
  if (mode === '替换') return 'blue'
  if (mode === '转发') return 'orange'
  return 'default'
}

async function handleGenerateFingerprint() {
  generating.value = true
  try {
    const res: any = await generateFingerprint(formState.proxyId || undefined)
    if (res.code === 200 && res.data) {
      const fp = res.data
      formState.chromeVersion = fp.chromeVersion
      formState.userAgent = fp.userAgent
      formState.os = fp.os
      formState.webrtcMode = fp.webrtcMode
      formState.timezoneMode = fp.timezoneMode
      formState.geolocationMode = fp.geolocationMode
      formState.languageMode = fp.languageMode
      formState.uiLanguage = fp.uiLanguage
      formState.screenResolution = fp.screenResolution
      formState.font = fp.font
      formState.canvasMode = fp.canvasMode
      formState.canvasNoiseSeed = fp.canvasNoiseSeed || ''
      formState.webglMode = fp.webglMode
      formState.webglVendor = fp.webglVendor || ''
      formState.webglRenderer = fp.webglRenderer || ''
      formState.audioNoiseSeed = fp.audioContextNoiseSeed || ''
      formState.rectsNoiseSeed = fp.clientRectsNoiseSeed || ''
      formState.deviceName = fp.deviceName || ''
      formState.macAddress = fp.macAddress || ''
      formState.mediaDeviceMode = fp.mediaDeviceMode
      message.success('新指纹已生成，所有配置已自动更新')
    } else {
      message.error(res.message || '生成指纹失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '生成指纹请求失败')
  } finally {
    generating.value = false
  }
}

// 智能配置
const GEO_CONFIG_MAP: Record<string, any> = {
  'US': { language: 'en-US', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'GB': { language: 'en-GB', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'DE': { language: 'de-DE', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'FR': { language: 'fr-FR', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'JP': { language: 'ja-JP', font: 'Meiryo', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1366x768', webrtc: 'replace' },
  'KR': { language: 'ko-KR', font: 'Malgun Gothic', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'CN': { language: 'zh-CN', font: 'Microsoft YaHei', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'TW': { language: 'zh-TW', font: 'Microsoft JhengHei', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'HK': { language: 'zh-TW', font: 'Microsoft JhengHei', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'SG': { language: 'en-SG', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'AU': { language: 'en-AU', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'CA': { language: 'en-CA', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'RU': { language: 'ru-RU', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'BR': { language: 'pt-BR', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' },
  'IN': { language: 'en-IN', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1366x768', webrtc: 'replace' },
}
const DEFAULT_CONFIG = { language: 'en-US', font: 'Arial', timezone: 'ip', geolocation: 'ip', languageMode: 'ip', resolution: '1920x1080', webrtc: 'replace' }

function guessCountryByProxy(proxy: any): string | null {
  const name = (proxy.name || '').toLowerCase()
  const host = (proxy.host || '').toLowerCase()
  const combined = name + ' ' + host
  if (combined.includes('us') || combined.includes('usa') || combined.includes('美国')) return 'US'
  if (combined.includes('uk') || combined.includes('gb') || combined.includes('英国')) return 'GB'
  if (combined.includes('de') || combined.includes('德国')) return 'DE'
  if (combined.includes('fr') || combined.includes('法国')) return 'FR'
  if (combined.includes('jp') || combined.includes('日本')) return 'JP'
  if (combined.includes('kr') || combined.includes('韩国')) return 'KR'
  if (combined.includes('cn') || combined.includes('中国')) return 'CN'
  if (combined.includes('tw') || combined.includes('台湾')) return 'TW'
  if (combined.includes('hk') || combined.includes('香港')) return 'HK'
  if (combined.includes('sg') || combined.includes('新加坡')) return 'SG'
  if (combined.includes('au') || combined.includes('澳大利亚')) return 'AU'
  if (combined.includes('ca') || combined.includes('加拿大')) return 'CA'
  if (combined.includes('ru') || combined.includes('俄罗斯')) return 'RU'
  if (combined.includes('br') || combined.includes('巴西')) return 'BR'
  if (combined.includes('in') || combined.includes('印度')) return 'IN'
  return null
}

async function handleSmartConfig() {
  if (isEdit.value && editId.value) {
    if (!formState.proxyId) { message.warning('请先绑定代理，再使用智能配置'); return }
    smartConfigLoading.value = true
    try {
      const res: any = await smartConfigProfile(editId.value)
      if (res.code === 200 && res.data) {
        const config = res.data
        formState.uiLanguage = config.ui_language || 'auto'
        formState.font = config.font ? config.font.split(',') : ['auto']
        formState.screenResolution = config.screen_resolution || 'auto'
        formState.timezoneMode = config.timezone_mode || 'ip'
        formState.geolocationMode = config.geolocation_mode || 'ip'
        formState.languageMode = config.language_mode || 'ip'
        formState.webrtcMode = config.webrtc_mode || 'replace'
        message.success(`智能配置完成：已匹配 ${config.country} 地区指纹`)
      } else {
        message.error(res.message || '智能配置失败')
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || '智能配置请求失败')
    } finally {
      smartConfigLoading.value = false
    }
    return
  }
  if (!formState.proxyId) { message.warning('请先选择绑定代理，再使用智能配置'); return }
  const proxy = proxyList.value.find(p => p.id === formState.proxyId)
  if (!proxy) { message.error('未找到选中的代理信息'); return }
  const countryCode = guessCountryByProxy(proxy)
  const config = countryCode ? (GEO_CONFIG_MAP[countryCode] || DEFAULT_CONFIG) : DEFAULT_CONFIG
  formState.uiLanguage = config.language
  formState.font = [config.font]
  formState.screenResolution = config.resolution
  formState.timezoneMode = config.timezone
  formState.geolocationMode = config.geolocation
  formState.languageMode = config.languageMode
  formState.webrtcMode = config.webrtc
  const countryNames: Record<string, string> = { 'US': '美国', 'GB': '英国', 'DE': '德国', 'FR': '法国', 'JP': '日本', 'KR': '韩国', 'CN': '中国', 'TW': '台湾', 'HK': '香港', 'SG': '新加坡', 'AU': '澳大利亚', 'CA': '加拿大', 'RU': '俄罗斯', 'BR': '巴西', 'IN': '印度' }
  message.success(`智能配置完成：已根据代理 "${proxy.name}" 匹配 ${countryNames[countryCode || ''] || '默认'} 地区指纹`)
}

// ========== Phase 4.0: 平台账号管理 ==========
const platformAccounts = ref<PlatformAccount[]>([])
const platformAccountVisible = ref(false)
const platformAccountEditing = ref(false)
const platformAccountFormRef = ref()
const platformAccountForm = reactive({
  platform: 'twitter' as 'twitter' | 'outlook',
  account: '',
  password: '',
  username_confirm: '',
  two_fa_type: null as 'totp' | 'sms' | null,
  two_fa_secret: '',
  two_fa_backup_codes: '',
  is_active: true
})
const platformAccountColumns = [
  { title: '账号', key: 'account', dataIndex: 'account', width: 180 },
  { title: '平台', key: 'platform', width: 120 },
  { title: '2FA', key: 'two_fa_type', dataIndex: 'two_fa_type', width: 80 },
  { title: '状态', key: 'is_active', dataIndex: 'is_active', width: 80 },
  { title: '操作', key: 'action', width: 160 }
]

async function loadPlatformAccounts() {
  if (!editId.value) return
  try {
    platformAccounts.value = await getPlatformAccounts(Number(editId.value))
  } catch (e) {
    console.error('加载平台账号失败:', e)
  }
}

// 编辑时记录当前账号 ID，避免使用错误的 find(a => a.id) 取到第一个
const platformAccountEditingId = ref<number | null>(null)

function openAddPlatformAccount() {
  platformAccountEditing.value = false
  platformAccountEditingId.value = null
  Object.assign(platformAccountForm, { platform: 'twitter' as 'twitter' | 'outlook', account: '', password: '', username_confirm: '', two_fa_type: null, two_fa_secret: '', two_fa_backup_codes: '', is_active: true })
  platformAccountVisible.value = true
}

function openEditPlatformAccount(item: PlatformAccount) {
  platformAccountEditing.value = true
  platformAccountEditingId.value = item.id
  Object.assign(platformAccountForm, {
    platform: (item.platform as 'twitter' | 'outlook') || 'twitter',
    account: item.account || '',
    password: (item as any).password || '',
    username_confirm: item.username_confirm || '',
    two_fa_type: item.two_fa_type || null,
    two_fa_secret: (item as any).two_fa_secret || '',
    two_fa_backup_codes: Array.isArray(item.two_fa_backup_codes) ? item.two_fa_backup_codes.join('\n') : ''
  })
  platformAccountForm.is_active = item.is_active !== false
  platformAccountVisible.value = true
}

async function handleSavePlatformAccount() {
  // 验证必填字段
  if (!platformAccountForm.account || !platformAccountForm.account.trim()) {
    message.warning('请输入账号')
    return
  }
  if (!platformAccountForm.password) {
    message.warning('请输入密码')
    return
  }

  // 新建模式：将账号信息暂存到本地数组，等用户点"创建窗口"时一起提交
  if (!editId.value) {
    const newAccount: any = {
      id: -(Date.now()),  // 临时负数 ID 标识本地未保存账号
      profile_id: 0,
      platform: platformAccountForm.platform,
      account: platformAccountForm.account,
      password: platformAccountForm.password,
      two_fa_type: platformAccountForm.two_fa_type,
      is_active: platformAccountForm.is_active,
      _pending: true  // 标记为本地暂存，待保存
    }
    if (platformAccountForm.platform === 'twitter' && platformAccountForm.username_confirm) {
      newAccount.username_confirm = platformAccountForm.username_confirm.trim()
    }
    if (platformAccountForm.two_fa_type === 'totp' && platformAccountForm.two_fa_secret) {
      newAccount.two_fa_secret = platformAccountForm.two_fa_secret
    }
    if (platformAccountForm.two_fa_type === 'sms') {
      newAccount.two_fa_backup_codes = platformAccountForm.two_fa_backup_codes
    }

    if (platformAccountEditing.value && platformAccountEditingId.value !== null) {
      // 本地编辑：替换对应记录
      const idx = platformAccounts.value.findIndex(a => a.id === platformAccountEditingId.value)
      if (idx >= 0) {
        newAccount.id = platformAccountEditingId.value
        platformAccounts.value.splice(idx, 1, newAccount)
      }
    } else {
      platformAccounts.value.push(newAccount)
    }

    message.success('账号已添加，点击"创建窗口"完成保存')
    platformAccountVisible.value = false
    return
  }

  // 编辑模式：直接添加/更新账号
  const data: any = {
    profile_id: Number(editId.value),
    platform: platformAccountForm.platform,
    account: platformAccountForm.account,
    two_fa_type: platformAccountForm.two_fa_type,
    is_active: platformAccountForm.is_active
  }

  if (platformAccountForm.platform === 'twitter' && platformAccountForm.username_confirm) {
    data.username_confirm = platformAccountForm.username_confirm.trim()
  }

  if (!platformAccountEditing.value) {
    data.password = platformAccountForm.password
  } else if (platformAccountForm.password && platformAccountForm.password.trim()) {
    data.password = platformAccountForm.password
  }

  if (platformAccountForm.two_fa_type === 'totp') {
    if (!platformAccountEditing.value || platformAccountForm.two_fa_secret?.trim()) {
      data.two_fa_secret = platformAccountForm.two_fa_secret
    }
  }
  if (platformAccountForm.two_fa_type === 'sms') {
    data.two_fa_backup_codes = platformAccountForm.two_fa_backup_codes
  }

  try {
    if (platformAccountEditing.value) {
      const id = platformAccountEditingId.value
      if (id) {
        await updatePlatformAccount(id, data)
        message.success('更新成功')
      } else {
        message.error('未找到要编辑的账号 ID')
        return
      }
    } else {
      await createPlatformAccount(data)
      message.success('添加成功')
    }
    platformAccountVisible.value = false
    loadPlatformAccounts()
  } catch (e: any) {
    message.error(e.response?.data?.message || '保存失败')
  }
}

async function handleDeletePlatformAccount(id: number) {
  // 如果是本地暂存账号（负数 ID），直接从数组中移除
  if (id < 0) {
    platformAccounts.value = platformAccounts.value.filter(a => a.id !== id)
    message.success('已删除')
    return
  }
  try {
    await deletePlatformAccount(id)
    message.success('已删除')
    loadPlatformAccounts()
  } catch {
    message.error('删除失败')
  }
}

// ========== 基础表单 ==========
const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()
const isEdit = computed(() => !!route.query.id)
const editId = computed(() => route.query.id ? Number(route.query.id) : null)
const submitting = ref(false)
const proxyList = ref<ProxyRecord[]>([])
const importMode = ref('paste')
const importFileJson = ref<string | null>(null)
const importing = ref(false)
const importResult = ref<{ success: boolean; message: string } | null>(null)
const isProfileRunning = ref(false)

const cookiePlaceholder = computed(() => '粘贴 JSON 数组，例如：\n[\n  {\n    "name": "session_id",\n    "value": "abc123",\n    "domain": ".example.com",\n    "path": "/"\n  }\n]')
const canImport = computed(() => importMode.value === 'paste' ? formState.cookieText.trim().length > 0 : importFileJson.value !== null)

const formState: any = reactive({
  title: '', proxyId: undefined, chromeVersion: '121', os: 'windows',
  webrtcMode: 'replace', timezoneMode: 'ip', geolocationMode: 'ip', languageMode: 'mask',
  uiLanguage: 'zh-CN', screenResolution: '1920x1080', font: 'Microsoft YaHei,Arial',
  canvasMode: 'noise', webglMode: 'mock', mediaDeviceMode: 'mock', startupUrl: '',
  userAgent: '', canvasNoiseSeed: '', audioNoiseSeed: '', rectsNoiseSeed: '',
  webglVendor: '', webglRenderer: '', deviceName: '', macAddress: '',
  cookieJson: '', cookieText: ''
})

const rules = { title: [{ required: true, message: '请输入窗口标题', trigger: 'blur' }] }

async function loadProxyList() {
  try { proxyList.value = await getProxyList() } catch (error) { console.error('加载代理列表失败:', error) }
}

async function loadProfileDetail() {
  if (!editId.value) return
  try {
    const data = await getProfileDetail(editId.value) as ProfileRecord
    formState.title = data.title
    formState.proxyId = data.proxyId ?? undefined
    formState.chromeVersion = data.chromeVersion
    formState.os = data.os
    formState.webrtcMode = data.webrtcMode
    formState.timezoneMode = data.timezoneMode
    formState.geolocationMode = data.geolocationMode
    formState.languageMode = data.languageMode
    formState.uiLanguage = data.uiLanguage
    formState.screenResolution = data.screenResolution
    formState.font = data.font ? data.font.split(',') : []
    formState.canvasMode = data.canvasMode
    formState.webglMode = data.webglMode
    formState.mediaDeviceMode = data.mediaDeviceMode
    formState.startupUrl = data.startupUrl || ''
    formState.cookieJson = (data as any).cookie_json || (data as any).cookieJson || ''
    formState.cookieText = (data as any).cookie_json || (data as any).cookieJson || ''
    formState.canvasNoiseSeed = data.canvasNoiseSeed || ''
    formState.webglVendor = data.webglVendor || ''
    formState.webglRenderer = data.webglRenderer || ''
    formState.audioNoiseSeed = data.audioNoiseSeed || ''
    formState.rectsNoiseSeed = data.rectsNoiseSeed || ''
    formState.deviceName = data.deviceName || ''
    formState.macAddress = data.macAddress || ''
  } catch (error) {
    console.error('加载窗口详情失败:', error)
    message.error('加载窗口详情失败')
  }
}

async function handleSubmit() {
  try { await formRef.value?.validate() } catch { return }
  submitting.value = true
  try {
    const submitData: ProfileDto = {
      title: formState.title, proxyId: formState.proxyId, chromeVersion: formState.chromeVersion, os: formState.os,
      webrtcMode: formState.webrtcMode, timezoneMode: formState.timezoneMode, geolocationMode: formState.geolocationMode,
      languageMode: formState.languageMode, uiLanguage: formState.uiLanguage, screenResolution: formState.screenResolution,
      font: Array.isArray(formState.font) ? formState.font.join(',') : formState.font,
      canvasMode: formState.canvasMode, webglMode: formState.webglMode, mediaDeviceMode: formState.mediaDeviceMode,
      startupUrl: formState.startupUrl,
      deviceName: formState.deviceName || undefined, macAddress: formState.macAddress || undefined,
      canvasNoiseSeed: formState.canvasNoiseSeed || undefined, audioNoiseSeed: formState.audioNoiseSeed || undefined,
      rectsNoiseSeed: formState.rectsNoiseSeed || undefined, webglVendor: formState.webglVendor || undefined,
      webglRenderer: formState.webglRenderer || undefined,
      cookieJson: formState.cookieText || formState.cookieJson || undefined,
    }
    const hasCookieText = formState.cookieText?.trim().length > 0

    if (isEdit.value && editId.value) {
      await updateProfile(editId.value, submitData)
      if (hasCookieText) {
        if (isProfileRunning.value) {
          try {
            const cookies = JSON.parse(formState.cookieText)
            await request.post(`/cookie-manager/${editId.value}/live-cookies/import`, { cookies })
            message.success('配置已保存，Cookie 已实时导入浏览器')
          } catch { message.success('配置已保存，预置 Cookie 已更新') }
        } else {
          message.success('配置已保存，预置 Cookie 已更新')
        }
      } else {
        message.success('修改成功')
      }
      router.push('/profile')
      return
    } else {
      const result: any = await createProfile(submitData)
      const newProfileId = result?.id || result?.data?.id

      // 提交暂存的平台账号
      const pendingAccounts = platformAccounts.value.filter((a: any) => (a as any)._pending)
      if (newProfileId && pendingAccounts.length > 0) {
        for (const account of pendingAccounts) {
          try {
            const accountData: any = {
              profile_id: newProfileId,
              platform: account.platform,
              account: account.account,
              password: account.password,
              two_fa_type: account.two_fa_type,
              is_active: account.is_active,
            }
            if (account.platform === 'twitter' && account.username_confirm) {
              accountData.username_confirm = account.username_confirm
            }
            if (account.two_fa_type === 'totp' && account.two_fa_secret) {
              accountData.two_fa_secret = account.two_fa_secret
            }
            if (account.two_fa_type === 'sms') {
              accountData.two_fa_backup_codes = account.two_fa_backup_codes
            }
            await createPlatformAccount(accountData)
          } catch (e: any) {
            console.error('创建平台账号失败:', e)
          }
        }
      }

      message.success(hasCookieText ? '窗口创建成功，预置 Cookie 已保存' : '创建成功')
      router.push('/profile')
      return
    }
  } catch (error: any) {
    console.error('提交失败:', error)
    message.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

function handleBack() { router.push('/profile') }
function goToCookieManager() {
  if (!editId.value) { message.warning('请先保存窗口后再管理 Cookie'); return }
  router.push(`/profile/${editId.value}/cookies`)
}
function beforeUploadCookieFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => { importFileJson.value = e.target?.result as string }
  reader.readAsText(file)
  return false
}
function fillUrl(url: string) { formState.startupUrl = url }

async function handleImportCookie() {
  let cookies: any[] = []
  try {
    cookies = importMode.value === 'paste' ? JSON.parse(formState.cookieText) : JSON.parse(importFileJson.value || '')
  } catch (e) { message.error('JSON 格式错误: ' + (e as Error).message); return }
  if (!Array.isArray(cookies) || cookies.length === 0) { message.warning('Cookie 数据为空'); return }
  if (!editId.value) { importResult.value = { success: true, message: `已缓存 ${cookies.length} 条 Cookie，创建窗口后将自动保存` }; return }

  importing.value = true
  importResult.value = null
  try {
    await updateProfile(editId.value, { title: formState.title, cookieJson: formState.cookieText } as any)
    if (isProfileRunning.value) {
      try {
        const res = await request.post(`/cookie-manager/${editId.value}/live-cookies/import`, { cookies })
        importResult.value = res.data.code === 0 ? { success: true, message: `已保存预置并实时导入 ${cookies.length} 条 Cookie` } : { success: false, message: `预置已保存，实时导入失败: ${res.data.message}` }
      } catch (liveErr: any) { importResult.value = { success: true, message: `预置已保存，实时导入失败: ${liveErr.response?.data?.message || liveErr.message}` } }
    } else {
      importResult.value = { success: true, message: `已保存 ${cookies.length} 条预置 Cookie，启动窗口后自动导入` }
    }
  } catch (e: any) { importResult.value = { success: false, message: '保存失败: ' + (e.response?.data?.message || e.message) } } finally { importing.value = false }
}

async function loadProfileStatus() {
  if (!editId.value) { isProfileRunning.value = false; return }
  try {
    const api = await import('../api/profile')
    const statusRes = await api.getProfilesStatus()
    isProfileRunning.value = statusRes.runningIds?.includes(editId.value) || false
  } catch (e: any) { console.error('加载窗口状态失败:', e); isProfileRunning.value = false }
}

onMounted(async () => {
  await loadProxyList()
  if (isEdit.value) {
    loadProfileDetail()
    loadProfileStatus()
    loadPlatformAccounts()
  }
})
</script>

<style scoped>
.profile-form-container { padding: 0; }
.page-header { display: flex; align-items: center; margin-bottom: 24px; }
.page-title { margin: 0 0 0 8px; font-size: 24px; font-weight: 600; color: #262626; }
.profile-form { margin-top: 16px; }
.form-actions { display: flex; justify-content: flex-start; padding-top: 8px; }
.platform-logos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.platform-logo { width: 40px; height: 40px; border-radius: 8px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid #e8e8e8; }
.platform-logo:hover { background: #1890ff; border-color: #1890ff; transform: translateY(-2px); box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3); }
.text-wrap { word-break: break-all; word-wrap: break-word; }
/* Phase 4.2: 平台账号表格样式 */
.account-ellipsis { display: inline-block; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.platform-tag { display: flex; align-items: center; gap: 6px; }
.platform-icon { width: 16px; height: 16px; vertical-align: middle; color: #1DA1F2; }
/* Phase 4.2: 下拉选项带 logo 样式 */
.select-option-with-icon { display: flex; align-items: center; gap: 8px; }
.option-icon { width: 16px; height: 16px; }
.option-icon-text { font-size: 16px; }
.platform-icon-text { font-size: 16px; }
</style>
