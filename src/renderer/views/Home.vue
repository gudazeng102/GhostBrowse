<template>
  <div class="home-container">
    <h1 class="page-title">🏠 系统状态</h1>

    <a-row :gutter="[16, 16]">
      <!-- 服务状态卡片 -->
      <a-col :xs="24" :sm="24" :md="8">
        <a-card title="服务状态" :bordered="false" hoverable>
          <template #extra>
            <a-tag :color="systemStatus === 'running' ? 'success' : 'error'">
              {{ systemStatus === 'running' ? '运行中' : '异常' }}
            </a-tag>
          </template>
          
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="服务状态">
              <a-tag :color="systemStatus === 'running' ? 'green' : 'red'">
                {{ systemStatus === 'running' ? '✅ 运行正常' : '❌ 运行异常' }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="服务端口">
              <span>{{ serverPort }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="版本号">
              <span>{{ version }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="运行环境">
              <a-tag :color="environment === 'development' ? 'blue' : 'purple'">
                {{ environment === 'development' ? '开发模式' : '生产模式' }}
              </a-tag>
            </a-descriptions-item>
          </a-descriptions>

          <div class="card-footer">
            <a-button type="primary" @click="refreshStatus" :loading="loading">
              🔄 刷新状态
            </a-button>
          </div>
        </a-card>
      </a-col>

      <!-- 数据库状态卡片 -->
      <a-col :xs="24" :sm="24" :md="8">
        <a-card title="数据库状态" :bordered="false" hoverable>
          <template #extra>
            <a-tag color="cyan">SQLite</a-tag>
          </template>
          
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="数据库引擎">
              <span>better-sqlite3</span>
            </a-descriptions-item>
            <a-descriptions-item label="数据库路径">
              <a-tooltip :title="dbPath">
                <span class="text-ellipsis">{{ dbPath }}</span>
              </a-tooltip>
            </a-descriptions-item>
            <a-descriptions-item label="数据表">
              <span>proxies, profiles, proxy_checks</span>
            </a-descriptions-item>
            <a-descriptions-item label="连接状态">
              <a-tag color="green">✅ 已连接</a-tag>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>

      <!-- 访问信息卡片 -->
      <a-col :xs="24" :sm="24" :md="8">
        <a-card title="访问信息" :bordered="false" hoverable>
          <template #extra>
            <span>🌐</span>
          </template>
          
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="本机访问">
              <a-tag>http://localhost:3000</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="局域网访问">
              <a-tag>http://{{ localIP }}:3000</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="提示">
              <span class="text-muted">局域网访问需放开防火墙 3000 端口</span>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>
    </a-row>

    <!-- API 响应展示 -->
    <a-card title="📡 最新 API 响应" :bordered="false" style="margin-top: 16px;">
      <a-code-block :code="apiResponseJson" language="json" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import request from '../api/request'

// 系统状态数据
const systemStatus = ref<string>('unknown')
const serverPort = ref<number>(3000)
const version = ref<string>('1.0.0')
const environment = ref<string>('development')
const dbPath = ref<string>('%APPDATA%/GhostBrowse/ghostbrowse.db')
const localIP = ref<string>('192.168.x.x')
const apiResponseJson = ref<string>('加载中...')
const loading = ref(false)

// 刷新系统状态
async function refreshStatus() {
  loading.value = true
  try {
    const response = await request.get('/system/status')
    const { code, data, message: msg } = response.data
    
    if (code === 0) {
      systemStatus.value = data.status
      serverPort.value = data.port
      version.value = data.version
      environment.value = data.environment
      apiResponseJson.value = JSON.stringify(response.data, null, 2)
      message.success('状态刷新成功')
    } else {
      message.error(msg || '获取状态失败')
    }
  } catch (error) {
    console.error('获取系统状态失败:', error)
    systemStatus.value = 'error'
    apiResponseJson.value = JSON.stringify({ error: String(error) }, null, 2)
    message.error('网络请求失败，请检查服务是否启动')
  } finally {
    loading.value = false
  }
}

// 获取本机局域网 IP
function getLocalIP() {
  // 简单的本地 IP 获取（在 Electron 环境中更准确）
  // 这里使用占位符，实际可在后端获取
  localIP.value = '192.168.1.xxx'
}

onMounted(() => {
  getLocalIP()
  refreshStatus()
})
</script>

<style scoped>
.home-container {
  padding: 0;
}

.page-title {
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.card-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.text-ellipsis {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.text-muted {
  color: #999;
  font-size: 12px;
}
</style>
