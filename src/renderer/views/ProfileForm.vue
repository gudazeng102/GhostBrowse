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

      <!-- Phase 2.1: 启动页面设置 -->
      <a-card :bordered="false" style="margin-bottom: 16px;">
        <template #title>
          <span>
            🌐 启动页面
            <a-tooltip title="设置窗口启动后自动打开的网页地址。留空则默认打开 Google 搜索。支持任意有效网址，方便快速进入目标平台（如 Facebook、Amazon 后台等），提升工作效率。">
              <QuestionCircleOutlined style="margin-left: 6px; color: #999; cursor: help;" />
            </a-tooltip>
          </span>
        </template>
        <a-form-item name="startupUrl">
          <a-input
            v-model:value="formState.startupUrl"
            placeholder="请输入启动后自动打开的网址，例如 https://www.facebook.com，您也可以点击下方平台logo自动输入"
            allow-clear
          />
        </a-form-item>
        <!-- 快速填充平台 Logo 区域 -->
        <div class="platform-logos">
          <a-tooltip title="Facebook" @click="fillUrl('https://www.facebook.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#1877F2;font-weight:bold;">f</span>
            </div>
          </a-tooltip>
          <a-tooltip title="YouTube" @click="fillUrl('https://www.youtube.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#FF0000;font-weight:bold;">▶</span>
            </div>
          </a-tooltip>
          <a-tooltip title="Instagram" @click="fillUrl('https://www.instagram.com')">
            <div class="platform-logo">
              <span class="platform-text">📷</span>
            </div>
          </a-tooltip>
          <a-tooltip title="X (Twitter)" @click="fillUrl('https://x.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#000;font-weight:bold;">X</span>
            </div>
          </a-tooltip>
          <a-tooltip title="LinkedIn" @click="fillUrl('https://www.linkedin.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#0A66C2;font-weight:bold;font-size:12px;">in</span>
            </div>
          </a-tooltip>
          <a-tooltip title="TikTok" @click="fillUrl('https://www.tiktok.com')">
            <div class="platform-logo">
              <span class="platform-text">♪</span>
            </div>
          </a-tooltip>
          <a-tooltip title="Pinterest" @click="fillUrl('https://www.pinterest.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#E60023;font-weight:bold;font-size:14px;">P</span>
            </div>
          </a-tooltip>
          <a-tooltip title="Reddit" @click="fillUrl('https://www.reddit.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#FF4500;font-weight:bold;font-size:14px;">r</span>
            </div>
          </a-tooltip>
          <a-tooltip title="WhatsApp" @click="fillUrl('https://web.whatsapp.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#25D366;font-weight:bold;">✉</span>
            </div>
          </a-tooltip>
          <a-tooltip title="Telegram" @click="fillUrl('https://web.telegram.org')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#0088CC;font-weight:bold;font-size:14px;">✈</span>
            </div>
          </a-tooltip>
          <a-tooltip title="Amazon" @click="fillUrl('https://www.amazon.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#FF9900;font-weight:bold;font-size:12px;">🛒</span>
            </div>
          </a-tooltip>
          <a-tooltip title="eBay" @click="fillUrl('https://www.ebay.com')">
            <div class="platform-logo">
              <span class="platform-text" style="color:#E53238;font-weight:bold;font-size:14px;">e</span>
            </div>
          </a-tooltip>
        </div>
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
          <!-- 导入方式选择 -->
          <a-radio-group v-model:value="importMode">
            <a-radio value="json">📄 JSON 文件导入</a-radio>
            <a-radio value="paste">📋 粘贴 JSON 文本</a-radio>
          </a-radio-group>

          <!-- JSON 文件导入 -->
          <div v-if="importMode === 'json'">
            <a-upload
              :before-upload="beforeUploadCookieFile"
              :max-count="1"
              accept=".json"
            >
              <a-button>
                <UploadOutlined /> 选择 JSON 文件
              </a-button>
            </a-upload>
            <div v-if="importFileJson" style="margin-top: 8px; color: #52c41a;">
              文件已加载：{{ importFileJson.length }} 字符
            </div>
            <div style="margin-top: 8px; color: #888; font-size: 12px;">
              支持 JSON 数组格式的 Cookie 文件
            </div>
          </div>

          <!-- 粘贴 JSON -->
          <div v-else>
            <a-textarea
              v-model:value="formState.cookieText"
              :placeholder="cookiePlaceholder"
              :rows="4"
              style="font-family: monospace;"
            />
            <div style="margin-top: 8px; color: #888; font-size: 12px;">
              支持 JSON 数组格式，每项需包含 name、value、domain 字段
            </div>
          </div>

          <!-- 导入按钮 -->
          <div>
            <a-space>
              <a-button
                type="primary"
                :loading="importing"
                :disabled="!canImport"
                @click="handleImportCookie"
              >
                🚀 导入 Cookie
              </a-button>
              <a-button size="small" @click="goToCookieManager">
                🍪 管理 Cookie
              </a-button>
            </a-space>
          </div>

          <!-- 导入结果 -->
          <a-alert
            v-if="importResult"
            :type="importResult.success ? 'success' : 'error'"
            :message="importResult.message"
            show-icon
          />

          <!-- 提示 -->
          <div v-if="!isProfileRunning" style="color: #52c41a;">
            ✅ 窗口未运行，点击导入将保存为预置 Cookie，启动后自动导入
          </div>
          <div v-else style="color: #52c41a;">
            ✅ 窗口运行中，点击导入将实时写入浏览器并保存为预置
          </div>
        </a-space>
      </a-card>

      <!-- 按钮区域 -->
      <div class="form-actions">
        <a-space>
          <a-button type="primary" @click="handleSubmit" :loading="submitting">
            {{ isEdit ? '保存修改' : '创建窗口' }}
          </a-button>
          <!-- 优化3：保留取消按钮也返回列表 -->
          <a-button @click="handleBack">取消</a-button>
        </a-space>
      </div>
    </a-form>
      </a-col>

      <!-- 右侧：浏览器设定卡片 (8/24) -->
      <a-col :span="8">
        <!-- Phase 3.0: 浏览器设定卡片 -->
        <a-card 
          title="浏览器设定" 
          :bordered="true"
          style="position: sticky; top: 24px;"
        >
          <template #extra>
            <a-space>
              <a-button type="primary" size="small" @click="handleGenerateFingerprint" :loading="generating">
                <SyncOutlined />
                生成新指纹
              </a-button>
            </a-space>
          </template>
          
          <!-- 浏览器信息 -->
          <div class="browser-info" style="margin-bottom: 16px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <ChromeOutlined style="font-size: 24px; margin-right: 8px; color: #4285f4;" />
              <span style="font-weight: 500;">{{ browserSettings.browser }}</span>
            </div>
          </div>
          
          <!-- 配置摘要 -->
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

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { LeftOutlined, QuestionCircleOutlined, UploadOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import { getProxyList, type ProxyRecord } from '../api/proxy'
import { getProfileDetail, createProfile, updateProfile, type ProfileDto, type ProfileRecord, type WebRtcMode } from '../api/profile'
import { BulbOutlined, SyncOutlined, ChromeOutlined } from '@ant-design/icons-vue'
import { smartConfigProfile, generateFingerprint } from '../api/profile'
import request from '../api/request'

// Phase 3.0: 生成新指纹相关状态和函数
const generating = ref(false)

// 浏览器设定卡片数据（computed，实时联动表单）
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
      // 回填表单
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

// Phase 2.3: 智能配置相关状态和函数
const smartConfigLoading = ref(false)

// 前端本地国家→指纹配置映射（纯前端版本，用于新建模式）
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

// 根据代理名称/Host 推测国家（纯前端简化版）
function guessCountryByProxy(proxy: any): string | null {
  const name = (proxy.name || '').toLowerCase()
  const host = (proxy.host || '').toLowerCase()
  const combined = name + ' ' + host
  
  // 简单关键词匹配
  if (combined.includes('us') || combined.includes('usa') || combined.includes('美国')) return 'US'
  if (combined.includes('uk') || combined.includes('gb') || combined.includes('英国')) return 'GB'
  if (combined.includes('de') || combined.includes('德国')) return 'DE'
  if (combined.includes('fr') || combined.includes('法国')) return 'FR'
  if (combined.includes('jp') || combined.includes('日本')) return 'JP'
  if (combined.includes('kr') || combined.includes('韩国') || combined.includes('南韩')) return 'KR'
  if (combined.includes('cn') || combined.includes('中国')) return 'CN'
  if (combined.includes('tw') || combined.includes('台湾')) return 'TW'
  if (combined.includes('hk') || combined.includes('香港')) return 'HK'
  if (combined.includes('sg') || combined.includes('新加坡')) return 'SG'
  if (combined.includes('au') || combined.includes('澳大利亚')) return 'AU'
  if (combined.includes('ca') || combined.includes('加拿大')) return 'CA'
  if (combined.includes('ru') || combined.includes('俄罗斯') || combined.includes('俄国')) return 'RU'
  if (combined.includes('br') || combined.includes('巴西')) return 'BR'
  if (combined.includes('in') || combined.includes('印度')) return 'IN'
  
  return null
}

async function handleSmartConfig() {
  // 编辑模式：调用后端接口获取智能配置
  if (isEdit.value && editId.value) {
    if (!formState.proxyId) {
      message.warning('请先绑定代理，再使用智能配置')
      return
    }
    
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
  
  // 新建模式：纯前端智能配置（根据代理名称/Host 推测国家）
  if (!formState.proxyId) {
    message.warning('请先选择绑定代理，再使用智能配置')
    return
  }
  
  // 找到选中的代理
  const proxy = proxyList.value.find(p => p.id === formState.proxyId)
  if (!proxy) {
    message.error('未找到选中的代理信息')
    return
  }
  
  // 推测国家
  const countryCode = guessCountryByProxy(proxy)
  const config = countryCode ? (GEO_CONFIG_MAP[countryCode] || DEFAULT_CONFIG) : DEFAULT_CONFIG
  
  // 直接回填表单（使用实际值，不是 auto）
  formState.uiLanguage = config.language
  formState.font = [config.font]
  formState.screenResolution = config.resolution
  formState.timezoneMode = config.timezone
  formState.geolocationMode = config.geolocation
  formState.languageMode = config.languageMode
  formState.webrtcMode = config.webrtc
  
  const countryNames: Record<string, string> = {
    'US': '美国', 'GB': '英国', 'DE': '德国', 'FR': '法国',
    'JP': '日本', 'KR': '韩国', 'CN': '中国', 'TW': '台湾',
    'HK': '香港', 'SG': '新加坡', 'AU': '澳大利亚', 'CA': '加拿大',
    'RU': '俄罗斯', 'BR': '巴西', 'IN': '印度'
  }
  
  message.success(`智能配置完成：已根据代理 "${proxy.name}" 匹配 ${countryNames[countryCode || ''] || '默认'} 地区指纹`)
}

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()

// 判断是新建还是编辑模式
const isEdit = computed(() => !!route.query.id)
const editId = computed(() => route.query.id ? Number(route.query.id) : null)

// 提交状态
const submitting = ref(false)

// 代理列表
const proxyList = ref<ProxyRecord[]>([])

// 表单数据（使用 any 类型避免 font 字段类型冲突）
// 导入 Cookie 相关状态
const importMode = ref('paste')
const importFileJson = ref<string | null>(null)
const importing = ref(false)
const importResult = ref<{ success: boolean; message: string } | null>(null)

// 窗口运行状态
const isProfileRunning = ref(false)

// 计算属性
const cookiePlaceholder = computed(() => {
  return '粘贴 JSON 数组，例如：\n[\n  {\n    "name": "session_id",\n    "value": "abc123",\n    "domain": ".example.com",\n    "path": "/"\n  }\n]'
})

const canImport = computed(() => {
  if (importMode.value === 'paste') {
    return formState.cookieText.trim().length > 0
  } else {
    return importFileJson.value !== null
  }
})

// 表单数据
const formState: any = reactive({
  title: '',
  proxyId: undefined,
  chromeVersion: '121',
  os: 'windows',
  webrtcMode: 'replace',
  timezoneMode: 'ip',
  geolocationMode: 'ip',
  languageMode: 'mask',
  uiLanguage: 'zh-CN',
  screenResolution: '1920x1080',
  font: 'Microsoft YaHei,Arial',
  canvasMode: 'noise',
  webglMode: 'mock',
  mediaDeviceMode: 'mock',
  startupUrl: '',
  // Phase 3.0: 新增指纹参数字段
  userAgent: '',
  canvasNoiseSeed: '',
  audioNoiseSeed: '',
  rectsNoiseSeed: '',
  webglVendor: '',
  webglRenderer: '',
      deviceName: '',
  macAddress: '',
  // Phase 4.0: Cookie 预置
  cookieJson: '',
  cookieText: '',
})

// 表单校验规则
const rules = {
  title: [
    { required: true, message: '请输入窗口标题', trigger: 'blur' }
  ]
}

// 加载代理列表
async function loadProxyList() {
  try {
    const list = await getProxyList()
    proxyList.value = list
  } catch (error) {
    console.error('加载代理列表失败:', error)
  }
}

// 加载窗口详情
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
      // Phase 2.1: 启动页面回显
      formState.startupUrl = data.startupUrl || ''
      // Phase 4.0: Cookie 预置回显
      formState.cookieJson = (data as any).cookie_json || (data as any).cookieJson || ''
      formState.cookieText = (data as any).cookie_json || (data as any).cookieJson || ''
      // Phase 3.0: 指纹参数回显
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

// 提交表单
async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    // 构建提交数据（注意：后端使用 snake_case，前端使用 camelCase，需显式映射）
    const submitData: ProfileDto = {
      title: formState.title,
      proxyId: formState.proxyId,
      chromeVersion: formState.chromeVersion,
      os: formState.os,
      webrtcMode: formState.webrtcMode,
      timezoneMode: formState.timezoneMode,
      geolocationMode: formState.geolocationMode,
      languageMode: formState.languageMode,
      uiLanguage: formState.uiLanguage,
      screenResolution: formState.screenResolution,
      font: Array.isArray(formState.font) ? formState.font.join(',') : formState.font,
      canvasMode: formState.canvasMode,
      webglMode: formState.webglMode,
      mediaDeviceMode: formState.mediaDeviceMode,
      startupUrl: formState.startupUrl,
      // Phase 3.0: 指纹参数（显式映射 camelCase → snake_case）
      deviceName: formState.deviceName || undefined,
      macAddress: formState.macAddress || undefined,
      canvasNoiseSeed: formState.canvasNoiseSeed || undefined,
      audioNoiseSeed: formState.audioNoiseSeed || undefined,
      rectsNoiseSeed: formState.rectsNoiseSeed || undefined,
      webglVendor: formState.webglVendor || undefined,
      webglRenderer: formState.webglRenderer || undefined,
      // Phase 4.0: Cookie 预置（新建和编辑都提交）
      cookieJson: formState.cookieText || formState.cookieJson || undefined,
    }

    const hasCookieText = formState.cookieText?.trim().length > 0

    if (isEdit.value && editId.value) {
      await updateProfile(editId.value, submitData)

      // Phase 4.0 Fix: 保存时自动导入 Cookie（运行中实时导入，未运行则存为预置）
      if (hasCookieText) {
        if (isProfileRunning.value) {
          try {
            const cookies = JSON.parse(formState.cookieText)
            const res = await request.post(`/cookie-manager/${editId.value}/live-cookies/import`, { cookies })
            const json = res.data
            if (json.code === 0) {
              message.success('配置已保存，Cookie 已实时导入浏览器')
            } else {
              message.warning('配置已保存，实时导入失败: ' + json.message)
            }
          } catch (e: any) {
            message.warning('配置已保存，Cookie 实时导入失败')
          }
        } else {
          message.success('配置已保存，预置 Cookie 已更新，启动窗口后自动生效')
        }
      } else {
        message.success('修改成功')
      }
    } else {
      await createProfile(submitData)

      // Phase 4.0 Fix: 新建窗口已包含 cookieJson，明确提示用户
      if (hasCookieText) {
        message.success('窗口创建成功，预置 Cookie 已保存，启动后自动生效')
      } else {
        message.success('创建成功')
      }
    }
    router.push('/profile')
  } catch (error: any) {
    console.error('提交失败:', error)
    message.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 优化3：返回按钮处理函数
function handleBack() {
  router.push('/profile')
}

// 取消（已改为调用 handleBack）
function handleCancel() {
  handleBack()
}

// Phase 4.0: 跳转到 Cookie 管理页面
function goToCookieManager() {
  if (!editId.value) {
    message.warning('请先保存窗口后再管理 Cookie')
    return
  }
  router.push(`/profile/${editId.value}/cookies`)
}

// 导入 Cookie 文件
function beforeUploadCookieFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    importFileJson.value = e.target?.result as string
  }
  reader.readAsText(file)
  return false
}

// 执行导入 Cookie
async function handleImportCookie() {
  // 1. 解析 Cookie 数据
  let cookies: any[] = []
  try {
    if (importMode.value === 'paste') {
      cookies = JSON.parse(formState.cookieText)
    } else if (importFileJson.value) {
      cookies = JSON.parse(importFileJson.value)
    }
  } catch (e) {
    message.error('JSON 格式错误: ' + (e as Error).message)
    return
  }

  if (!Array.isArray(cookies) || cookies.length === 0) {
    message.warning('Cookie 数据为空')
    return
  }

  // 2. 新建模式：缓存到表单，创建时自动提交
  if (!editId.value) {
    importResult.value = {
      success: true,
      message: `已缓存 ${cookies.length} 条 Cookie，创建窗口后将自动保存`
    }
    return
  }

  importing.value = true
  importResult.value = null

  try {
    // 先保存为预置
    await updateProfile(editId.value, { title: formState.title, cookieJson: formState.cookieText } as any)

    // 如果窗口运行中，额外实时导入
    if (isProfileRunning.value) {
      try {
        const res = await request.post(`/cookie-manager/${editId.value}/live-cookies/import`, { cookies })
        const json = res.data
        importResult.value = {
          success: json.code === 0,
          message: json.code === 0
            ? `已保存预置并实时导入 ${cookies.length} 条 Cookie 到浏览器`
            : `预置已保存，实时导入失败: ${json.message}`
        }
      } catch (liveErr: any) {
        importResult.value = {
          success: true,
          message: `预置已保存，实时导入失败: ${liveErr.response?.data?.message || liveErr.message}`
        }
      }
    } else {
      importResult.value = {
        success: true,
        message: `已保存 ${cookies.length} 条预置 Cookie，启动窗口后自动导入`
      }
    }
  } catch (e: any) {
    importResult.value = { success: false, message: '保存失败: ' + (e.response?.data?.message || e.message) }
  } finally {
    importing.value = false
  }
}

// 加载窗口运行状态
async function loadProfileStatus() {
  if (!editId.value) {
    isProfileRunning.value = false
    return
  }

  try {
    const api = await import('../api/profile')
    const statusRes = await api.getProfilesStatus()
    isProfileRunning.value = statusRes.runningIds?.includes(editId.value) || false
  } catch (e: any) {
    console.error('加载窗口状态失败:', e)
    isProfileRunning.value = false
  }
}

// Phase 2.1: 快速填充启动页面 URL
function fillUrl(url: string) {
  formState.startupUrl = url
}

// Phase 2.1: 获取网站 Favicon URL（使用 Clearbit Logo API）
function getFaviconUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`
}

onMounted(async () => {
  await loadProxyList()
  if (isEdit.value) {
    loadProfileDetail()
    loadProfileStatus()
  }
})
</script>

<style scoped>
.profile-form-container {
  padding: 0;
}

/* 优化3：页面标题区布局 */
.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  margin: 0 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.profile-form {
  margin-top: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: 8px;
}

/* Phase 2.1: 快速填充平台 Logo 样式 */
.platform-logos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.platform-logo {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #e8e8e8;
}

.platform-logo:hover {
  background: #1890ff;
  border-color: #1890ff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
}

.platform-logo:hover .platform-icon {
  color: #fff;
}

.platform-icon {
  font-size: 16px;
  font-weight: bold;
  color: #666;
}

.platform-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

/* Phase 3.0: 文本换行样式（长文本自动换行） */
.text-wrap {
  word-break: break-all;
  word-wrap: break-word;
}
</style>
                                                                                                