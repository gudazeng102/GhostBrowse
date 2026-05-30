<template>
  <div class="publish-records">
    <a-page-header title="发布列表" sub-title="所有通过本平台发布的推文记录" />

    <a-card size="small">
      <template #extra>
        <a-space>
          <a-select v-model:value="statusFilter" style="width:130px" @change="loadRecords">
            <a-select-option value="">全部状态</a-select-option>
            <a-select-option value="success">成功</a-select-option>
            <a-select-option value="failed">失败</a-select-option>
            <a-select-option value="pending">待执行</a-select-option>
            <a-select-option value="cancelled">已取消</a-select-option>
          </a-select>
          <a-button :disabled="selectedRowKeys.length === 0" danger :loading="batchDeleting" @click="handleBatchDelete">批量删除 ({{ selectedRowKeys.length }})</a-button>
          <a-button @click="loadRecords" :loading="loading">刷新</a-button>
        </a-space>
      </template>

      <a-table
        :data-source="records"
        :columns="columns"
        :pagination="{ current: page, pageSize: pageSize, total: total, showTotal: (t) => `共 ${t} 条`, onChange: onPageChange }"
        :loading="loading || batchDeleting"
        size="middle"
        :row-selection="{ selectedRowKeys: selectedRowKeys, onChange: (keys) => { selectedRowKeys = keys } }"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="tagColor(record.status)">{{ tagLabel(record.status) }}</a-tag>
          </template>
          <template v-if="column.key === 'content'">
            <a-tooltip :title="record.content" placement="topLeft">
              <span class="content-cell">{{ (record.content || '').substring(0, 50) }}{{ (record.content || '').length > 50 ? '...' : '' }}</span>
            </a-tooltip>
          </template>
          <template v-if="column.key === 'time'">
            {{ formatTime(record.createdAt) }}
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <!-- <a-button v-if="record.status === 'pending' || record.status === 'scheduled'" size="small" @click="handleExecuteNow(record.id)">立即发布</a-button> -->
               <a-button  size="small" @click="handleExecuteNow(record.id)">立即发布</a-button>
              <a-button v-if="record.status === 'pending' || record.status === 'scheduled'" size="small" danger @click="handleCancel(record.id)">取消</a-button>
              <a-popconfirm title="确定删除此记录？" @confirm="handleDelete(record.id)" ok-text="确定" cancel-text="取消">
                <a-button size="small" danger :loading="deletingId === record.id">删除</a-button>
              </a-popconfirm>
              <a-button v-if="record.tweetUrl" size="small" type="link" @click="handleNavigate(record.profileId, record.tweetUrl)">查看推文</a-button>
            </a-space>
          </template>
        </template>

        <template #expandedRowRender="{ record }">
          <p v-if="record.content" class="detail-content"><strong>完整内容：</strong>{{ record.content }}</p>
          <p v-if="record.errorMsg" class="detail-error"><strong>错误信息：</strong>{{ record.errorMsg }}</p>
          <p v-if="record.tweetUrl" class="detail-url"><strong>推文链接：</strong>{{ record.tweetUrl }}</p>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { fetchPublishRecords, cancelPublishTask, deletePublishRecord, batchDeletePublishRecords, navigateToTweet, executeNowPublishTask } from '../../api/publish'

interface RecordItem {
  id: number
  batchId: string
  profileId: number
  content: string
  status: string
  executeAt: number
  tweetUrl: string | null
  errorMsg: string | null
  createdAt: number
}

const records = ref<RecordItem[]>([])
const loading = ref(false)
const statusFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const selectedRowKeys = ref<number[]>([])
const deletingId = ref<number | null>(null)
const batchDeleting = ref(false)

const columns = [
  { title: '', dataIndex: 'id', key: 'checkbox', width: 40 },
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
  { title: '账号', dataIndex: 'profileId', key: 'profileId', width: 80 },
  { title: '内容', dataIndex: 'content', key: 'content' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '时间', dataIndex: 'createdAt', key: 'time', width: 160 },
  { title: '操作', key: 'action', width: 260 },
]

function tagColor(s: string) {
  if (s === 'success') return 'green'
  if (s === 'failed') return 'red'
  if (s === 'cancelled') return 'default'
  return 'blue'
}

function tagLabel(s: string) {
  if (s === 'success') return '成功'
  if (s === 'failed') return '失败'
  if (s === 'pending' || s === 'scheduled') return '待执行'
  if (s === 'cancelled') return '已取消'
  return s
}

function formatTime(ts: number) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function loadRecords() {
  loading.value = true
  try {
    const data = await fetchPublishRecords({ page: page.value, pageSize: pageSize.value, status: statusFilter.value || undefined })
    records.value = data.records as RecordItem[]
    total.value = data.total
  } catch (e: any) {
    message.error('加载失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

async function handleExecuteNow(id: number) {
  try {
    await executeNowPublishTask(id)
    message.success("任务已加入执行队列")
    await loadRecords()
  } catch (e: any) {
    message.error("操作失败: " + (e.message || ""))
  }
}

async function handleCancel(id: number) {
  try {
    await cancelPublishTask(id)
    message.success('任务已取消')
    await loadRecords()
  } catch (e: any) {
    message.error('取消失败: ' + (e.message || ''))
  }
}

async function handleNavigate(profileId: number, url: string) {
  try {
    await navigateToTweet(profileId, url)
    message.success('已跳转到推文页面')
  } catch (e: any) {
    message.error('跳转失败: ' + (e.message || '窗口未运行'))
  }
}

async function handleDelete(id: number) {
  deletingId.value = id
  try {
    await deletePublishRecord(id)
    message.success('已删除')
    await loadRecords()
  } catch (e: any) {
    message.error('删除失败: ' + (e.message || ''))
  } finally {
    deletingId.value = null
  }
}

async function handleBatchDelete() {
  if (selectedRowKeys.value.length === 0) { message.warning('请先选择记录'); return }
  batchDeleting.value = true
  try {
    const r = await batchDeletePublishRecords(selectedRowKeys.value)
    message.success('已删除 ' + r.deleted + ' 条记录')
    selectedRowKeys.value = []
    await loadRecords()
  } catch (e: any) {
    message.error('批量删除失败: ' + (e.message || ''))
  } finally {
    batchDeleting.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  loadRecords()
}

onMounted(() => loadRecords())
</script>

<style scoped>
.publish-records {
  padding: 16px;
}
.content-cell {
  max-width: 250px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-content {
  white-space: pre-wrap;
  background: #fafafa;
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
}
.detail-error {
  color: #ff4d4f;
  background: #fff2f0;
  padding: 4px 8px;
  border-radius: 4px;
}
.detail-url {
  word-break: break-all;
}
</style>
