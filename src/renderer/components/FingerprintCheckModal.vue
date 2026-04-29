<template>
  <a-modal
    :open="visible"
    :title="modalTitle"
    :width="1000"
    :centered="true"
    :footer="null"
    :maskClosable="true"
    @cancel="handleClose"
    wrapClassName="fingerprint-modal"
  >
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <a-spin size="large" />
      <p class="loading-text">正在检测指纹，请稍候...</p>
    </div>

    <!-- 检测结果 -->
    <div v-else-if="result" class="result-container">
      <!-- 区域一：顶部布局（左侧进度条 + 右侧代理信息） -->
      <div class="top-section">
        <!-- 左：环形进度条 + 纯洁度信息 -->
        <div class="score-section">
          <div class="score-left">
            <a-progress
              type="circle"
              :percent="result.purity.score"
              :strokeColor="progressColor"
              :trailColor="'#1e293b'"
              :size="100"
            />
          </div>
          <div class="score-right">
            <div class="score-label">指纹纯洁度</div>
            <a-tag :color="levelColor" class="level-tag">
              {{ result.purity.levelText }}
            </a-tag>
          </div>
        </div>

        <!-- 右：代理信息（横向排列） -->
        <div class="proxy-section">
          <a-descriptions :column="2" bordered size="small" class="proxy-descriptions">
            <a-descriptions-item label="代理地址">
              {{ result.proxy.address || '未绑定代理' }}
            </a-descriptions-item>
            <a-descriptions-item label="联通状态">
              <a-tag :color="proxyStatusColor" class="status-tag">
                {{ proxyStatusText }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="出口 IP">
              {{ result.proxy.ip || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="地理位置">
              {{ result.proxy.country }} {{ result.proxy.city }}
            </a-descriptions-item>
            <a-descriptions-item label="代理类型">
              {{ result.proxy.type || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="延迟">
              {{ result.proxy.latency ? result.proxy.latency + 'ms' : '-' }}
            </a-descriptions-item>
          </a-descriptions>
        </div>
      </div>

      <!-- 分割线 -->
      <a-divider />

      <!-- 区域二：指纹配置（2列布局） -->
      <div class="fingerprint-section">
        <h4 class="section-title">🔍 指纹配置</h4>
        <a-descriptions :column="2" bordered size="small" class="fingerprint-descriptions">
          <a-descriptions-item label="Chrome 版本">
            {{ result.fingerprint.chromeVersion }}
          </a-descriptions-item>
          <a-descriptions-item label="操作系统">
            {{ result.fingerprint.os }}
          </a-descriptions-item>
          <a-descriptions-item label="WebRTC">
            <a-tag :color="webrtcColor">{{ result.fingerprint.webrtcMode }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="Canvas">
            <a-tag :color="canvasColor">{{ result.fingerprint.canvasMode }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="WebGL">
            <a-tag :color="webglColor">{{ result.fingerprint.webglMode }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="媒体设备">
            <a-tag :color="mediaColor">{{ result.fingerprint.mediaDeviceMode }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="时区">
            {{ result.fingerprint.timezoneMode }}
          </a-descriptions-item>
          <a-descriptions-item label="地理位置">
            {{ result.fingerprint.geolocationMode }}
          </a-descriptions-item>
          <a-descriptions-item label="语言">
            {{ result.fingerprint.uiLanguage }}
          </a-descriptions-item>
          <a-descriptions-item label="分辨率">
            {{ result.fingerprint.screenResolution }}
          </a-descriptions-item>
          <a-descriptions-item label="字体">
            {{ result.fingerprint.font }}
          </a-descriptions-item>
          <a-descriptions-item label="User-Agent">
            <a-tooltip :title="result.fingerprint.userAgent" placement="topLeft">
              <span class="ua-text">{{ result.fingerprint.userAgent }}</span>
            </a-tooltip>
          </a-descriptions-item>
        </a-descriptions>
      </div>

      <!-- 分割线 -->
      <a-divider />

      <!-- 区域三：风险提示 -->
      <div class="warning-section">
        <h4 class="section-title">⚠️ 风险提示</h4>
        <a-alert
          v-if="result.warnings.length === 0"
          message="当前配置无明显风险，指纹防护良好"
          type="success"
          show-icon
        />
        <a-alert
          v-else
          type="warning"
          show-icon
        >
          <template #message>
            <span class="warning-title">发现 {{ result.warnings.length }} 项配置缺陷</span>
          </template>
          <template #description>
            <ul class="warning-list">
              <li v-for="(warning, index) in result.warnings" :key="index" class="warning-item">
                {{ warning }}
              </li>
            </ul>
          </template>
        </a-alert>
      </div>

      <!-- 检测时间 -->
      <div class="check-time">
        检测时间: {{ formatTime(result.checkedAt) }}
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="modal-footer">
      <a-button type="primary" @click="handleCheckAgain" :loading="loading">
        重新检测
      </a-button>
      <a-button @click="handleClose">
        关闭
      </a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FingerprintCheckResult } from '../../types'

interface Props {
  visible: boolean
  result: FingerprintCheckResult | null
  loading: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'checkAgain'): void
}>()

const modalTitle = computed(() => {
  return props.result ? `🛡️ 指纹检测报告 — ${props.result.profile.title}` : '🛡️ 指纹检测报告'
})

const progressColor = computed(() => {
  const score = props.result?.purity.score || 0
  if (score >= 90) return '#52c41a'
  if (score >= 75) return '#1890ff'
  if (score >= 50) return '#faad14'
  return '#f5222d'
})

const levelColor = computed(() => {
  const level = props.result?.purity.level || 'unknown'
  switch (level) {
    case 'excellent': return 'green'
    case 'good': return 'blue'
    case 'fair': return 'orange'
    case 'poor': return 'red'
    default: return 'default'
  }
})

const proxyStatusColor = computed(() => {
  const status = props.result?.proxy.status
  switch (status) {
    case 'success': return 'green'
    case 'fail': return 'red'
    case 'no_proxy': return 'gold'
    default: return 'default'
  }
})

const proxyStatusText = computed(() => {
  const status = props.result?.proxy.status
  switch (status) {
    case 'success': return '已连通'
    case 'fail': return '检测失败'
    case 'no_proxy': return '未绑定代理'
    default: return '未知'
  }
})

const webrtcColor = computed(() => {
  const mode = props.result?.fingerprint.webrtcMode
  if (mode === 'disable') return 'green'
  if (mode === 'replace') return 'blue'
  if (mode === 'forward') return 'orange'
  return 'default'
})

const canvasColor = computed(() => {
  const mode = props.result?.fingerprint.canvasMode
  if (mode === 'noise') return 'green'
  if (mode === 'block') return 'blue'
  return 'default'
})

const webglColor = computed(() => {
  const mode = props.result?.fingerprint.webglMode
  if (mode === 'mock') return 'green'
  return 'default'
})

const mediaColor = computed(() => {
  const mode = props.result?.fingerprint.mediaDeviceMode
  if (mode === 'mock') return 'green'
  return 'default'
})

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function handleClose() {
  emit('update:visible', false)
}

function handleCheckAgain() {
  emit('checkAgain')
}
</script>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

.loading-text {
  margin-top: 16px;
  color: #94a3b8;
}

.result-container {
  max-height: 70vh;
  overflow-y: auto;
}

/* 顶部区域：进度条 + 代理信息 */
.top-section {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.score-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.score-left {
  flex-shrink: 0;
}

.score-right {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-label {
  font-size: 14px;
  color: #94a3b8;
}

.level-tag {
  font-size: 16px;
  padding: 4px 12px;
}

.proxy-section {
  flex: 1;
}

.proxy-descriptions :deep(.ant-descriptions-item-label) {
  background: rgba(30, 41, 59, 0.3) !important;
  color: #94a3b8 !important;
  width: 130px;
  min-width: 130px;
}

.proxy-descriptions :deep(.ant-descriptions-item-content) {
  color: #e2e8f0 !important;
}

.status-tag {
  font-size: 12px;

}

/* 指纹配置区域 */
.fingerprint-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 12px;
}

.fingerprint-descriptions :deep(.ant-descriptions-item-label) {
  background: rgba(30, 41, 59, 0.3) !important;
  color: #94a3b8 !important;
  width: 130px;
  min-width: 130px;
}

.fingerprint-descriptions :deep(.ant-descriptions-item-content) {
  color: #e2e8f0 !important;
}

/* 风险提示区域 */
.warning-section {
  margin-bottom: 16px;
}

.warning-title {
  font-weight: 600;
}

.warning-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.warning-item {
  margin-bottom: 4px;
  color: #fbbf24;
}

/* 检测时间 */
.check-time {
  text-align: center;
  color: #64748b;
  font-size: 12px;
  margin-top: 16px;
}

/* 底部按钮 */
.modal-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  margin-top: 16px;
}
</style>

<style>
/* 全局样式覆盖 */
.fingerprint-modal .ant-modal-content {
  background-color: #0f172a !important;
  border: 1px solid rgba(148, 163, 184, 0.2) !important;
  border-radius: 12px !important;
}

.fingerprint-modal .ant-modal-header {
  background-color: transparent !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1) !important;
  padding: 16px 24px !important;
}

.fingerprint-modal .ant-modal-title {
  color: #f1f5f9 !important;
  font-size: 16px !important;
  font-weight: 600 !important;
}

.fingerprint-modal .ant-modal-body {
  padding: 24px !important;
  background-color: transparent !important;
}

.fingerprint-modal .ant-modal-close {
  color: #94a3b8 !important;
}

.fingerprint-modal .ant-modal-close:hover {
  color: #f1f5f9 !important;
}

.fingerprint-modal .ant-divider {
  border-color: rgba(148, 163, 184, 0.1) !important;
}

.fingerprint-modal .ant-progress-text {
  color: #f1f5f9 !important;
  font-size: 16px !important;
  font-weight: 600 !important;
}

.fingerprint-modal .ant-descriptions-item-label {
  background-color: rgba(30, 41, 59, 0.5) !important;
}

.fingerprint-modal .ant-descriptions-item-content {
  background-color: rgba(15, 23, 42, 0.5) !important;
  word-break: break-word !important;
  white-space: normal !important;
}
</style>
