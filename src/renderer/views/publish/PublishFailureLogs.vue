<template>
  <div class="publish-failure-logs">
    <a-page-header title="发布失败日志" sub-title="专门查看发布失败、重试等待和异常任务，用于定位问题" />

    <a-card size="small">
      <template #extra>
        <a-space>
          <a-button @click="loadLogs" :loading="loading">刷新</a-button>
        </a-space>
      </template>

      <a-alert
        class="mb-12"
        type="info"
        show-icon
        message="说明"
        description="这里展示 error_msg 不为空或状态为 failed 的发布任务。pending 但带 error_msg 的任务通常表示：已失败过一次，当前正在等待重试。"
      />

      <a-table
        :data-source="records"
        :columns="columns"
        :pagination="{ current: page, pageSize: pageSize, total: total, showTotal: (t) => `共 ${t} 条`, onChange: onPageChange }"
        :loading="loading"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'profile'">
            <div>#{{ record.profileId }}</div>
            <div class="muted">{{ record.profileName || '-' }}</div>
          </template>

          <template v-if="column.key === 'status'">
            <a-tag :color="tagColor(record.status)">{{ tagLabel(record.status) }}</a-tag>
            <div class="muted">重试 {{ record.retryCount || 0 }} 次</div>
          </template>

          <template v-if="column.key === 'content'">
            <a-tooltip :title="record.content" placement="topLeft">
              <span class="content-cell">{{ record.content }}</span>
            </a-tooltip>
          </template>

          <template v-if="column.key === 'error'">
            <div class="error-cell">{{ record.errorMsg || '-' }}</div>
          </template>

          <template v-if="column.key === 'time'">
            <div>创建：{{ formatTime(record.createdAt) }}</div>
            <div>更新：{{ formatTime(record.updatedAt) }}</div>
            <div>执行：{{ formatTime(record.executeAt) }}</div>
          </template>
        </template>

        <template #expandedRowRender="{ record }">
          <div class="detail-block">
            <p><strong>任务 ID：</strong>{{ record.id }}</p>
            <p><strong>批次 ID：</strong>{{ record.batchId }}</p>
            <p><strong>完整内容：</strong>{{ record.content }}</p>
            <p><strong>错误信息：</strong></p>
            <pre>{{ record.errorMsg || '-' }}</pre>
            <p><strong>调度日志：</strong></p>
            <pre>{{ record.logMessages || '暂无调度日志' }}</pre>
          </div>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { fetchPublishFailureLogs, type PublishFailureLog } from '../../api/publish'

const records = ref<PublishFailureLog[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
  { title: '账号', key: 'profile', width: 150 },
  { title: '内容', dataIndex: 'content', key: 'content' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 110 },
  { title: '错误信息', dataIndex: 'errorMsg', key: 'error' },
  { title: '时间', key: 'time', width: 230 },
]

function tagColor(s: string) {
  if (s === 'failed') return 'red'
  if (s === 'pending') return 'orange'
  if (s === 'processing') return 'blue'
  return 'default'
}

function tagLabel(s: string) {
  if (s === 'failed') return '失败'
  if (s === 'pending') return '等待重试'
  if (s === 'processing') return '执行中'
  if (s === 'cancelled') return '已取消'
  if (s === 'success') return '成功'
  return s
}

function formatTime(ts: number) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

async function loadLogs() {
  loading.value = true
  try {
    const data = await fetchPublishFailureLogs({ page: page.value, pageSize: pageSize.value })
    records.value = data.records
    total.value = data.total
  } catch (e: any) {
    message.error('加载失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  loadLogs()
}

onMounted(() => loadLogs())
</script>

<style scoped>
.publish-failure-logs {
  padding: 16px;
}
.mb-12 {
  margin-bottom: 12px;
}
.muted {
  color: #999;
  font-size: 12px;
}
.content-cell {
  max-width: 260px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.error-cell {
  max-width: 360px;
  color: #cf1322;
  white-space: pre-wrap;
  word-break: break-all;
}
.detail-block {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 12px;
}
.detail-block pre {
  white-space: pre-wrap;
  word-break: break-all;
  background: #fff;
  border: 1px solid #eee;
  padding: 8px;
  border-radius: 4px;
}
</style>