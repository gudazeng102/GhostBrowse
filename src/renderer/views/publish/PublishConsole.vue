<template>
  <div class="publish-console">
    <a-page-header title="联动发布" sub-title="迭代 6.3 — 多账号批量与延迟发布" />

    <!-- 发布创作区 -->
    <a-card size="small" class="section-card" title="发布推文">
      <a-row :gutter="16">
        <a-col :span="24" class="mb-2">
          <label class="field-label">选择账号（最多 5 个）</label>
          <a-select
            v-model:value="selectedProfileIds"
            mode="multiple"
            :max-tag-count="3"
            placeholder="选择已登录推特的窗口"
            style="width:100%"
            :options="accountOptions"
            :disabled="accountLoading"
          />
        </a-col>
        <a-col :span="24" class="mb-2">
          <label class="field-label">推文内容</label>
          <a-textarea
            v-model:value="content"
            :max-length="280"
            :rows="4"
            placeholder="请输入推文内容..."
            show-count
            :class="{ 'text-danger': content.length > 280 }"
          />
        </a-col>
        <a-col :span="12" class="mb-2">
          <label class="field-label">发布时间</label>
          <a-space>
            <a-radio-group v-model:value="isImmediate">
              <a-radio :value="true">立即发布</a-radio>
              <a-radio :value="false">延迟发布</a-radio>
            </a-radio-group>
            <a-select
              v-if="!isImmediate"
              v-model:value="delayMinutes"
              style="width:130px"
              :options="delayOptions"
            />
          </a-space>
        </a-col>
        <a-col :span="24" class="mt-2">
          <a-button
            type="primary"
            size="large"
            :disabled="canPublish"
            :loading="publishing"
            @click="showPreview"
          >
            发布
          </a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- 绑定账号列表 -->
    <a-card size="small" class="section-card" title="绑定账号列表">
      <template #extra>
        <a-button size="small" @click="loadAccounts" :loading="accountLoading">刷新</a-button>
      </template>
      <a-table
        :data-source="accounts"
        :columns="accountColumns"
        :pagination="false"
        size="small"
        :loading="accountLoading"
        row-key="profileId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">
              {{ statusLabel(record.status) }}
            </a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <a-button size="small" @click="checkHealth(record.profileId)" :loading="checkingId === record.profileId">检测</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发布记录 -->
    <a-card size="small" class="section-card" title="发布记录">
      <template #extra>
        <a-select v-model:value="recordFilter" style="width:120px" @change="loadRecords">
          <a-select-option value="">全部</a-select-option>
          <a-select-option value="success">成功</a-select-option>
          <a-select-option value="failed">失败</a-select-option>
          <a-select-option value="pending">待执行</a-select-option>
          <a-select-option value="cancelled">已取消</a-select-option>
        </a-select>
      </template>
      <a-table
        :data-source="records"
        :columns="recordColumns"
        :pagination="{ current: page, pageSize: pageSize, total: total, onChange: onPageChange }"
        size="small"
        :loading="recordLoading"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="recordColor(record.status)">{{ recordLabel(record.status) }}</a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <template v-if="record.status === 'pending' || record.status === 'scheduled'">
              <a-button size="small" danger @click="handleCancel(record.id)">取消</a-button>
            </template>
            <template v-if="record.tweetUrl">
              <a-button size="small" type="link" :href="record.tweetUrl" target="_blank">查看</a-button>
            </template>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 发布预览弹窗 -->
    <a-modal
      v-model:visible="previewVisible"
      title="确认发布"
      @ok="handlePublish"
      :confirm-loading="publishing"
      ok-text="确认发布"
      cancel-text="再想想"
    >
      <p><strong>目标账号及预计执行时间：</strong></p>
      <p v-for="item in previewAccounts" :key="item.profileId" class="preview-account">
        {{ item.displayName }} — ⏰ {{ item.estimatedTime }}
      </p>
      <p><strong>推文内容：</strong></p>
      <p class="preview-content">{{ content }}</p>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { fetchPublishAccounts, fetchPublishRecords, createPublishTask, cancelPublishTask, checkPublishHealth } from '../../api/publish'

interface AccountItem {
  profileId: number
  profileName: string
  username: string
  status: string
  todayCount: number
}

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

interface PreviewAccountInfo {
  profileId: string
  displayName: string
  estimatedTime: string
}

const accounts = ref<AccountItem[]>([])
const accountLoading = ref(false)
const accountsMap = ref<Record<number, AccountItem>>({})

const selectedProfileIds = ref<string[]>([])
const content = ref('')
const isImmediate = ref(true)
const delayMinutes = ref(5)

const publishing = ref(false)
const previewVisible = ref(false)

const records = ref<RecordItem[]>([])
const recordLoading = ref(false)
const recordFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const checkingId = ref<number | null>(null)

const delayOptions = [
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 10, label: '10 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
]

const accountColumns = [
  { title: '窗口', dataIndex: 'profileName', key: 'profileName' },
  { title: '用户名', dataIndex: 'username', key: 'username' },
  { title: '状态', dataIndex: 'status', key: 'status' },
  { title: '今日发布', dataIndex: 'todayCount', key: 'todayCount' },
  { title: '操作', key: 'action' },
]

const recordColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
  { title: '内容', dataIndex: 'content', key: 'content', ellipsis: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '时间', dataIndex: 'executeAt', key: 'executeAt', width: 160 },
  { title: '操作', key: 'action', width: 120 },
]

const accountOptions = computed(() => {
  return accounts.value
    .filter(a => a.status !== 'offline')
    .map(a => ({ value: String(a.profileId), label: `${a.profileName} (@${a.username || '?'})` }))
})

const canPublish = computed(() => {
  return selectedProfileIds.value.length === 0 || !content.value.trim() || content.value.length > 280
})

const previewAccounts = computed((): PreviewAccountInfo[] => {
  const shuffled = [...selectedProfileIds.value]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const now = Date.now()
  const base = isImmediate.value ? 0 : delayMinutes.value * 60 * 1000
  const list: PreviewAccountInfo[] = []

  for (let i = 0; i < shuffled.length; i++) {
    const estTime = isImmediate.value
      ? '5秒内'
      : new Date(now + base + 5000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    list.push({
      profileId: shuffled[i],
      displayName: getProfileName(shuffled[i]),
      estimatedTime: estTime,
    })
  }
  return list
})

function statusColor(s: string) {
  if (s === 'healthy') return 'green'
  if (s === 'suspected') return 'orange'
  return 'red'
}

function statusLabel(s: string) {
  if (s === 'healthy') return '正常'
  if (s === 'suspected') return '疑似失效'
  return '已掉线'
}

function recordColor(s: string) {
  if (s === 'success') return 'green'
  if (s === 'failed') return 'red'
  if (s === 'cancelled') return 'default'
  return 'blue'
}

function recordLabel(s: string) {
  if (s === 'success') return '成功'
  if (s === 'failed') return '失败'
  if (s === 'pending' || s === 'scheduled') return '待执行'
  if (s === 'cancelled') return '已取消'
  return s
}

function getProfileName(pid: string) {
  const id = parseInt(pid)
  const a = accountsMap.value[id]
  return a ? `${a.profileName} (@${a.username || '?'})` : `Profile ${pid}`
}

async function loadAccounts() {
  accountLoading.value = true
  try {
    const data = await fetchPublishAccounts()
    accounts.value = data as AccountItem[]
    const m: Record<number, AccountItem> = {}
    for (const a of data) { m[a.profileId] = a }
    accountsMap.value = m
  } catch (e: any) {
    message.error('加载账号列表失败: ' + (e.message || ''))
  } finally {
    accountLoading.value = false
  }
}

async function loadRecords() {
  recordLoading.value = true
  try {
    const data = await fetchPublishRecords({ page: page.value, pageSize: pageSize.value, status: recordFilter.value || undefined })
    records.value = data.records as RecordItem[]
    total.value = data.total
  } catch (e: any) {
    message.error('加载记录失败: ' + (e.message || ''))
  } finally {
    recordLoading.value = false
  }
}

async function checkHealth(profileId: number) {
  checkingId.value = profileId
  try {
    const data = await checkPublishHealth(profileId)
    message.info('状态: ' + (data.status === 'healthy' ? '正常' : '已掉线'))
    await loadAccounts()
  } catch (e: any) {
    message.error('检测失败: ' + (e.message || ''))
  } finally {
    checkingId.value = null
  }
}

function showPreview() {
  previewVisible.value = true
}

async function handlePublish() {
  publishing.value = true
  try {
    const data = await createPublishTask({
      profile_ids: selectedProfileIds.value,
      content: content.value.trim(),
      is_immediate: isImmediate.value,
      delay_minutes: isImmediate.value ? 0 : delayMinutes.value,
    })
    message.success('已创建 ' + (selectedProfileIds.value.length) + ' 个发布任务')
    previewVisible.value = false
    content.value = ''
    selectedProfileIds.value = []
    page.value = 1
    await loadRecords()
  } catch (e: any) {
    message.error('创建任务失败: ' + (e.message || ''))
  } finally {
    publishing.value = false
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

function onPageChange(p: number) {
  page.value = p
  loadRecords()
}

onMounted(() => {
  loadAccounts()
  loadRecords()
})
</script>

<style scoped>
.publish-console {
  padding: 16px;
}
.section-card {
  margin-bottom: 16px;
}
.field-label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #333;
}
.mb-2 {
  margin-bottom: 12px;
}
.mt-2 {
  margin-top: 8px;
}
.text-danger :deep(textarea) {
  border-color: #ff4d4f;
}
.preview-account {
  margin: 2px 0;
  padding: 2px 8px;
  background: #f5f5f5;
  border-radius: 4px;
}
.preview-content {
  white-space: pre-wrap;
  background: #fafafa;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
}
</style>