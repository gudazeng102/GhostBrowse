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
                <a-select-option value="124">Chrome 124</a-select-option>
                <a-select-option value="128">Chrome 128</a-select-option>
                <a-select-option value="130">Chrome 130</a-select-option>
                <a-select-option value="132">Chrome 132</a-select-option>
                <a-select-option value="134">Chrome 134</a-select-option>
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

      <!-- Phase 2.2: 浏览数据卡片（仅编辑模式下显示） -->
      <a-card v-if="isEdit" title="🍪 浏览数据" style="margin-bottom: 16px;">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="Cookie 数量">
            <a-tag color="blue">{{ cookieStatus?.cookieCount || 0 }}</a-tag> 条
          </a-descriptions-item>
          <a-descriptions-item label="识别平台">
            <a-tag v-for="p in (cookieStatus?.platforms || [])" :key="p" color="processing">{{ p }}</a-tag>
            <span v-if="!(cookieStatus?.platforms?.length)" style="color: #999;">—</span>
          </a-descriptions-item>
          <a-descriptions-item label="备份数量">
            <a-tag color="orange">{{ backupCount }}</a-tag> 个
          </a-descriptions-item>
          <a-descriptions-item label="数据大小">
            {{ formatBytes(cookieStatus?.totalSizeBytes || 0) }}
          </a-descriptions-item>
        </a-descriptions>
        <a-space style="margin-top: 12px;">
          <a-button type="primary" @click="handleExportCookie" :disabled="isRunning" :loading="exportLoading">
            <ExportOutlined /> 导出 Cookie
          </a-button>
          <a-button @click="handleOpenCookieManager" :disabled="isRunning">
            <DatabaseOutlined /> 管理浏览数据
          </a-button>
          <a-button danger @click="handleClearCookie" :disabled="isRunning" :loading="clearLoading">
            <DeleteOutlined /> 清理缓存
          </a-button>
        </a-space>
        <a-alert v-if="isRunning" type="warning" show-icon style="margin-top: 8px;" message="窗口正在运行中，浏览数据操作需先关闭窗口" />
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

    <!-- Phase 2.2: Cookie 管理弹窗 -->
    <CookieManagerModal
      v-if="editId"
      v-model:visible="cookieModalVisible"
      :profileId="editId"
      :profileTitle="cookieModalProfileTitle"
      :isRunning="isRunning"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { LeftOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import { getProxyList, type ProxyRecord } from '../api/proxy'
import { getProfileDetail, createProfile, updateProfile, type ProfileDto, type ProfileRecord, type WebRtcMode } from '../api/profile'
import { getCookieStatus, getCookieBackups, exportCookies, clearCookies, type CookieStatus } from '../api/cookie'
import CookieManagerModal from '../components/CookieManagerModal.vue'
import { ExportOutlined, DatabaseOutlined, DeleteOutlined, BulbOutlined } from '@ant-design/icons-vue'
import { smartConfigProfile } from '../api/profile'

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
const formState: any = reactive({
  title: '',
  proxyId: undefined,
  chromeVersion: '128',
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
  startupUrl: ''
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
    // 构建提交数据
    const submitData: ProfileDto = {
      ...formState,
      font: Array.isArray(formState.font) ? formState.font.join(',') : formState.font
    }

    if (isEdit.value && editId.value) {
      await updateProfile(editId.value, submitData)
      message.success('修改成功')
    } else {
      await createProfile(submitData)
      message.success('创建成功')
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

// Phase 2.1: 快速填充启动页面 URL
function fillUrl(url: string) {
  formState.startupUrl = url
}

// Phase 2.1: 获取网站 Favicon URL（使用 Clearbit Logo API）
function getFaviconUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`
}

// ==================== Phase 2.2: Cookie 管理相关状态和函数 ====================

// Cookie 状态
const cookieStatus = ref<CookieStatus | null>(null)
const backupCount = ref(0)
const isRunning = ref(false) // 从父组件或外部传入
const exportLoading = ref(false)
const clearLoading = ref(false)

// Cookie 管理弹窗
const cookieModalVisible = ref(false)
const cookieModalProfileTitle = ref('')

// 格式化字节
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 加载 Cookie 数据
async function loadCookieData() {
  if (!isEdit.value || !editId.value) return
  try {
    const res: any = await getCookieStatus(editId.value)
    if (res.data?.code === 200) {
      cookieStatus.value = res.data.data
    }
    const backupRes: any = await getCookieBackups(editId.value)
    if (backupRes.data?.code === 200) {
      backupCount.value = backupRes.data.data?.length || 0
    }
  } catch (e) {
    console.error('加载 Cookie 数据失败:', e)
  }
}

// 导出 Cookie
async function handleExportCookie() {
  if (!editId.value) return
  exportLoading.value = true
  try {
    const res: any = await exportCookies(editId.value)
    if (res.data?.code === 200) {
      message.success(`导出成功：${res.data.data.cookieCount} 条 Cookie`)
      loadCookieData()
    } else {
      message.error(res.data?.message || '导出失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '导出失败')
  } finally {
    exportLoading.value = false
  }
}

// 打开 Cookie 管理弹窗
function handleOpenCookieManager() {
  if (!editId.value) return
  cookieModalProfileTitle.value = formState.title
  cookieModalVisible.value = true
}

// 清理缓存
async function handleClearCookie() {
  if (!editId.value) return
  clearLoading.value = true
  try {
    const res: any = await clearCookies(editId.value, 'all')
    if (res.data?.code === 200) {
      message.success('清理完成')
      loadCookieData()
    } else {
      message.error(res.data?.message || '清理失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '清理失败')
  } finally {
    clearLoading.value = false
  }
}

onMounted(async () => {
  await loadProxyList()
  if (isEdit.value) {
    loadProfileDetail()
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
</style>
