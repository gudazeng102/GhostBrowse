<template>
  <a-card class="ollama-status-bar" size="small">
    <div class="status-row">
      <div class="status-info">
        <span class="status-dot" :class="dotClass" />
        <span class="status-label">{{ statusLabel }}</span>
        <a-divider type="vertical" />
        <span class="status-meta">
          <span class="meta-key">Host：</span>
          <span class="meta-value">{{ aiStore.health?.host || '-' }}</span>
        </span>
        <a-divider type="vertical" />
        <span class="status-meta">
          <span class="meta-key">默认模型：</span>
          <span class="meta-value">{{ aiStore.health?.defaultModel || '-' }}</span>
          <a-tag v-if="aiStore.health?.defaultModelInstalled" color="success" class="model-tag">
            已安装
          </a-tag>
          <a-tag v-else-if="aiStore.health" color="warning" class="model-tag">
            未安装
          </a-tag>
        </span>
        <a-divider type="vertical" />
        <span class="status-meta">
          <span class="meta-key">已装模型：</span>
          <a-tag
            v-for="m in aiStore.health?.models || []"
            :key="m"
            class="installed-tag"
          >
            {{ m }}
          </a-tag>
          <span v-if="!aiStore.health?.models?.length" class="meta-value muted">-</span>
        </span>
      </div>

      <div class="status-actions">
        <span v-if="aiStore.health?.durationMs !== undefined" class="duration">
          {{ aiStore.health.durationMs }}ms
        </span>
        <a-button
          size="small"
          type="primary"
          :loading="aiStore.healthLoading"
          @click="refresh"
        >
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>
      </div>
    </div>

    <div v-if="aiStore.health?.error" class="error-row">
      <a-alert
        type="error"
        show-icon
        :message="`Ollama 通信错误：${aiStore.health.error}`"
        banner
      />
    </div>
  </a-card>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { aiStore } from '../../stores/ai'
import { getAIHealth } from '../../api/ai'

const dotClass = computed(() => {
  if (!aiStore.health) return 'unknown'
  return aiStore.health.online ? 'online' : 'offline'
})

const statusLabel = computed(() => {
  if (aiStore.healthLoading) return '检测中...'
  if (!aiStore.health) return '未检测'
  if (aiStore.health.online) {
    return aiStore.health.defaultModelInstalled ? 'Ollama 在线，模型就绪' : 'Ollama 在线，但默认模型未安装'
  }
  return 'Ollama 离线'
})

async function refresh() {
  aiStore.healthLoading = true
  try {
    aiStore.health = await getAIHealth()
    aiStore.healthCheckedAt = Date.now()
    if (!aiStore.health.online) {
      message.warning('Ollama 服务未在线，请检查 OLLAMA_HOST 配置或服务是否启动')
    } else if (!aiStore.health.defaultModelInstalled) {
      message.warning(`默认模型 ${aiStore.health.defaultModel} 未安装，请先 ollama pull`)
    }
  } catch (err: any) {
    message.error(`健康检查失败：${err.message || err}`)
    aiStore.health = null
  } finally {
    aiStore.healthLoading = false
  }
}

onMounted(() => {
  // 首次挂载自动检测一次
  if (!aiStore.health) refresh()
})

defineExpose({ refresh })
</script>

<style scoped>
.ollama-status-bar {
  margin-bottom: 16px;
}

.status-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.status-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #d9d9d9;
  margin-right: 8px;
  flex-shrink: 0;
}

.status-dot.online {
  background: #52c41a;
  box-shadow: 0 0 6px rgba(82, 196, 26, 0.6);
}

.status-dot.offline {
  background: #ff4d4f;
}

.status-dot.unknown {
  background: #d9d9d9;
}

.status-label {
  font-weight: 500;
  margin-right: 4px;
}

.status-meta {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
}

.meta-key {
  color: #8c8c8c;
}

.meta-value {
  color: #262626;
}

.meta-value.muted {
  color: #bfbfbf;
}

.model-tag {
  margin-left: 6px;
}

.installed-tag {
  margin-left: 4px;
  margin-right: 0;
  font-size: 12px;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.duration {
  color: #8c8c8c;
  font-size: 12px;
}

.error-row {
  margin-top: 12px;
}
</style>