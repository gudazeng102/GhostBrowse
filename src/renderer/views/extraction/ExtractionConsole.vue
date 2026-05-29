<template>
  <div class="extraction-console">
    <a-page-header title="📊 数据采集" sub-title="迭代 5.1 — 采集推文/用户/话题数据" />

    <a-card size="small" class="section-card">
      <template #title>
        <span>🆕 新建采集任务</span>
      </template>
      <a-space direction="vertical" style="width:100%">
        <a-select v-model:value="targetType" style="width:300px" placeholder="选择采集类型">
          <a-select-option value="tweet">📖 指定账号的推文</a-select-option>
          <a-select-option value="hashtag_tweets"># 话题推文</a-select-option>
          <a-select-option value="user_profile">👤 用户信息</a-select-option>
        </a-select>

        <!-- 迭代 5.4: 用户信息用大输入框，支持逗号分隔 -->
        <a-textarea
          v-if="targetType === 'user_profile'"
          v-model:value="target"
          :rows="4"
          placeholder="多个账号用逗号或换行隔开，例如：@elonmusk\n@jack\n@sundarpichai"
          style="width:500px"
        />
        <a-input
          v-else
          v-model:value="target"
          placeholder="目标（@用户名 / #话题）"
          style="width:400px"
        />

        <!-- 用户信息不需要条数，推文/话题才需要 -->
        <template v-if="targetType !== 'user_profile'">
          <a-input-number v-model:value="maxCount" :min="1" :max="500" style="width:120px" />
          <span style="margin-left:8px">条</span>
        </template>
        <a-divider style="font-size:12px;margin:8px 0">采集后自动操作（可选）</a-divider>
        <a-space wrap>
          <a-checkbox v-model:checked="followUpOps.like">点赞</a-checkbox>
          <a-checkbox v-model:checked="followUpOps.retweet">转发</a-checkbox>
          <a-checkbox v-model:checked="followUpOps.comment">评论</a-checkbox>
          <span style="margin-left:4px">前</span>
          <a-input-number v-model:value="followUpCount" :min="0" :max="100" style="width:80px" />
          <span>条</span>
        </a-space>
        <a-textarea v-if="followUpOps.comment" v-model:value="followUpComment" :rows="1" placeholder="评论内容（留空则 AI 生成）" style="width:400px" />
        <a-space>
          <a-button type="primary" @click="handleEnqueue" :loading="sending">
            <template #icon><SendOutlined /></template>下发到所有运行中的窗口
          </a-button>
        </a-space>
      </a-space>
    </a-card>

    <!-- 实时状态监控 -->
    <a-card title="📡 任务日志" size="small" class="section-card">
      <template #extra>
        <a-space>
          <a-button size="small" @click="refreshPool">刷新</a-button>
        </a-space>
      </template>
      <div class="profile-grid">
        <a-card v-for="(entry, rawId) in poolStatus" :key="rawId" size="small" class="profile-card" hoverable>
          <template #title>
            <a-space>
              <span :class="statusClass(entry)">{{ statusIcon(entry) }}</span>
              <span>Profile {{ rawId }}</span>
              <a-tag :color="entry.running ? 'processing' : (entry.status === 'pending' ? 'blue' : 'default')">
                {{ entry.running ? '执行中' : (entry.status === 'pending' ? '排队中' : '空闲') }}
              </a-tag>
            </a-space>
          </template>
          <template v-if="allRunDetails[Number(rawId)]" #extra>
            <a-space>
              <a-button size="small" type="link" @click="quickViewResults(rawId)">
                查看结果
              </a-button>
              <a-button size="small" danger @click="abortProfile(Number(rawId))">
                <template #icon><StopOutlined /></template>中止
              </a-button>
            </a-space>
          </template>
          <div v-if="allRunDetails[Number(rawId)]">
            <a-row :gutter="8">
              <a-col :span="8"><a-statistic title="进度" :value="`${runProg(rawId)?.processed || 0}/${runProg(rawId)?.total || 0}`" /></a-col>
              <a-col :span="5"><a-statistic title="采集" :value="runProg(rawId)?.collected || 0" /></a-col>
            </a-row>
            <a-progress v-if="runProg(rawId)?.total" :percent="Math.round((runProg(rawId)!.processed / runProg(rawId)!.total) * 100)" status="active" size="small" class="progress-bar" />
            <div class="logs-box-small">
              <div v-for="(log, i) in runLogs(rawId)" :key="i" class="log-line" :class="{ 'log-error': log.includes('ERROR') || log.includes('失败') }">{{ log }}</div>
              <div v-if="!runLogs(rawId).length" class="hint">暂无日志</div>
            </div>
          </div>
          <div v-else><a-empty :image-style="{ height: '40px' }" description="空闲" /></div>
        </a-card>
      </div>
      <a-empty v-if="!Object.keys(poolStatus).length" description="没有运行中的窗口" />
    </a-card>

    <!-- 结果展示 -->
    <a-card size="small" class="section-card">
      <template #title>
        <span>📋 采集结果 <a-tag v-if="results.length" color="blue">{{ results.length }} 条</a-tag></span>
      </template>
      <a-space style="margin-bottom:8px">
        <a-select v-model:value="searchRunId" placeholder="选择采集任务查看结果" style="width:300px" allow-clear @change="handleQuickSearch">
          <a-select-option v-for="run in completedExtractionRuns" :key="run.id" :value="run.id">
            #{{ run.id }} — {{ getExtractionTarget(run) }} ({{ run.profile_id === 0 ? '' : ('Profile ' + run.profile_id) }}
          </a-select-option>
        </a-select>
        <a-button v-if="results.length" :href="csvUrl" target="_blank">📥 导出 CSV</a-button>
        <a-button size="small" @click="refreshCompletedRuns">刷新</a-button>
      </a-space>
      <a-table :dataSource="results" :columns="resultColumns" :pagination="{ pageSize: 20 }" size="small" rowKey="id">
        <template #bodyCell="{ column, record }">
          <!-- 推文列 -->
          <template v-if="column.key === 'raw_data'">
            <div class="cell-preview" :title="record.raw_data">{{ parseDataField(record.raw_data, 'text')?.substring(0, 80) || '—' }}</div>
          </template>
          <template v-else-if="column.key === 'author'">
            {{ parseDataField(record.raw_data, 'authorName') || parseDataField(record.raw_data, 'authorHandle') || '—' }}
          </template>
          <template v-else-if="column.key === 'time'">
            {{ parseDataField(record.raw_data, 'time')?.substring(0, 10) || '—' }}
          </template>
          <!-- 用户信息列 -->
          <template v-else-if="column.key === 'display_name'">{{ parseDataField(record.raw_data, 'displayName') || '—' }}</template>
          <template v-else-if="column.key === 'handle'">@{{ record.user_name || parseDataField(record.raw_data, 'handle') || '—' }}</template>
          <template v-else-if="column.key === 'bio'">
            <div class="cell-preview" :title="parseDataField(record.raw_data, 'bio')">{{ parseDataField(record.raw_data, 'bio')?.substring(0, 50) || '—' }}</div>
          </template>
          <template v-else-if="column.key === 'following'">{{ parseDataField(record.raw_data, 'following') || '—' }}</template>
          <template v-else-if="column.key === 'followers'">{{ parseDataField(record.raw_data, 'followers') || '—' }}</template>
          <template v-else-if="column.key === 'tweet_count'">{{ parseDataField(record.raw_data, 'tweetCount') || '—' }}</template>
          <template v-else-if="column.key === 'location'">{{ parseDataField(record.raw_data, 'location') || '—' }}</template>
          <template v-else-if="column.key === 'join_date'">{{ parseDataField(record.raw_data, 'joinDate') || '—' }}</template>
          <template v-else-if="column.key === 'verified'">{{ parseDataField(record.raw_data, 'verified') === 'true' ? '✅' : '✗' }}</template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onUnmounted, computed } from 'vue'
import { message as antMessage } from 'ant-design-vue'
import { SendOutlined, StopOutlined } from '@ant-design/icons-vue'
import { enqueueExtraction, getExtractionResults, getExtractionCsvUrl } from '../../api/extraction'
import { getPoolStatus, getTaskQueue, abortTaskRun, getTaskHistory } from '../../api/task-queue'
import type { PoolEntry, TaskRun } from '../../api/task-queue'

const targetType = ref('tweet')
const target = ref('')
const maxCount = ref(50)
const sending = ref(false)

const followUpOps = reactive({ like: false, retweet: false, comment: false })
const followUpCount = ref(5)
const followUpComment = ref('')

const results = ref<any[]>([])
const searchRunId = ref<number | null>(null)
const csvUrl = ref('')

const resultColumns = computed(() => {
  const dataType = results.value[0]?.data_type
  if (dataType === 'user_profile') {
    return [
      { title: 'ID', key: 'id', width: 50 },
      { title: '显示名', key: 'display_name', width: 120 },
      { title: '用户名', key: 'handle', width: 120 },
      { title: '简介', key: 'bio', width: 250 },
      { title: '关注', key: 'following', width: 70 },
      { title: '粉丝', key: 'followers', width: 70 },
      { title: '推文', key: 'tweet_count', width: 60 },
      { title: '位置', key: 'location', width: 100 },
      { title: '加入日期', key: 'join_date', width: 100 },
      { title: '认证', key: 'verified', width: 50 }
    ]
  }
  // 默认推文列
  return [
    { title: 'ID', key: 'id', width: 60 },
    { title: '类型', dataIndex: 'data_type', key: 'data_type', width: 80 },
    { title: '作者', key: 'author', width: 120 },
    { title: '内容预览', key: 'raw_data', width: 400 },
    { title: '时间', key: 'time', width: 100 }
  ]
})

function parseDataField(raw: string, field: string): string {
  try { return JSON.parse(raw)[field] || '' } catch { return '' }
}

async function handleEnqueue() {
  if (!target.value.trim()) { antMessage.warning('请输入采集目标'); return }

  const pool = await getPoolStatus()
  const runningIds = Object.entries(pool)
    .filter(([_, entry]) => entry.status === 'running' || entry.status === 'pending' || entry.status === 'idle')
    .map(([id]) => Number(id))
  if (runningIds.length === 0) { antMessage.warning('没有活跃的窗口'); return }

  const ops: string[] = []
  if (followUpOps.like) ops.push('like')
  if (followUpOps.retweet) ops.push('retweet')
  if (followUpOps.comment) ops.push('comment')

  // 统一分隔符：将换行转逗号，避免 JSON 序列化丢失换行
  const normalizedTarget = target.value.replace(/[,，、\n\r\s]+/g, ',').replace(/^,|,$/g, '').trim()

  sending.value = true
  try {
    const result = await enqueueExtraction({
      targetType: targetType.value,
      target: normalizedTarget,
      maxCount: maxCount.value,
      profileIds: runningIds,
      followUp: ops.length > 0 ? {
        operations: ops,
        count: followUpCount.value,
        commentText: followUpComment.value || undefined
      } : undefined
    })
    const msg = ops.length > 0 ? `并向每个窗口自动下发 ${followUpCount.value} 条联动操作` : ''
    antMessage.success(`已向 ${result.runs?.length || 0} 个窗口下发采集任务${msg}`)
  } catch (e: any) {
    antMessage.error(e.message || '下发失败')
  } finally {
    sending.value = false
  }
}

/** 采集历史任务列表（已完成的 extraction 任务） */
const completedExtractionRuns = ref<any[]>([])

async function refreshCompletedRuns() {
  try {
    const allRuns = await getTaskQueue()
    // 过滤出已完成/失败的 extraction 任务 + 当前 pending/running 的 extraction 任务
    const extractionRuns = allRuns.filter(r => {
      try {
        const plan = JSON.parse(r.plan_json)
        return plan?.action === 'extraction'
      } catch { return false }
    })
    completedExtractionRuns.value = extractionRuns
  } catch {}
}

function getExtractionTarget(run: any): string {
  try {
    const plan = JSON.parse(run.plan_json)
    return plan?.extraction?.target || plan?.raw_command || '—'
  } catch { return '—' }
}

async function handleSearch() {
  if (!searchRunId.value) { antMessage.warning('请选择任务'); return }
  try {
    results.value = await getExtractionResults(searchRunId.value)
    csvUrl.value = getExtractionCsvUrl(searchRunId.value)
    antMessage.success(`找到 ${results.value.length} 条结果`)
  } catch (e: any) {
    antMessage.error(e.message || '查询失败')
  }
}

function handleQuickSearch() {
  handleSearch()
}

// ==================== 实时监控（同群控管理逻辑） ====================

const poolStatus = ref<Record<number, PoolEntry>>({})
const queueItems = ref<TaskRun[]>([])
const completedRuns = ref<Record<number, TaskRun>>({})

const allRunDetails = computed(() => {
  const map: Record<number, TaskRun> = { ...completedRuns.value }
  for (const item of queueItems.value) {
    if (item.status === 'running' || item.status === 'pending') map[item.profile_id] = item
  }
  return map
})

function runProg(profileId: number | string) {
  const id = Number(profileId)
  const run = allRunDetails.value[id] || completedRuns.value[id]
  if (!run?.progress_json) return null
  try { return JSON.parse(run.progress_json) } catch { return null }
}

function runLogs(profileId: number | string): string[] {
  const id = Number(profileId)
  const run = allRunDetails.value[id] || completedRuns.value[id]
  if (!run?.logs_json) return []
  try { return JSON.parse(run.logs_json) as string[] } catch { return [] }
}

function statusClass(entry: PoolEntry) { return entry.running ? 'status-running' : (entry.status === 'pending' ? 'status-pending' : 'status-idle') }
function statusIcon(entry: PoolEntry) { return entry.running ? '🟢' : (entry.status === 'pending' ? '🔵' : '⚪') }

let lastNotifyState = 'idle'

async function refreshPool() {
  try {
    const [pool, queue, history] = await Promise.all([getPoolStatus(), getTaskQueue(), getTaskHistory(1, 50)])
    poolStatus.value = pool
    const newIds = new Set(queue.map(r => r.id))
    for (const oldRun of queueItems.value) {
      if (!newIds.has(oldRun.id) && oldRun.logs_json) completedRuns.value[oldRun.profile_id] = oldRun
    }
    // 从历史中补充已完成的任务（最近50条）
    for (const h of history) {
      if (!completedRuns.value[h.profile_id] && h.logs_json) {
        completedRuns.value[h.profile_id] = h
      }
    }
    queueItems.value = queue

    // 通知：采集任务全部完成
    const extractionRuns = queue.filter(r => {
      try { return JSON.parse(r.plan_json)?.action === 'extraction' } catch { return false }
    })
    const hasRunning = extractionRuns.some(r => r.status === 'running')
    const hasPending = extractionRuns.some(r => r.status === 'pending')
    const nowIdle = !hasRunning && !hasPending
    const wasActive = lastNotifyState === 'active'
    if (wasActive && nowIdle) {
      const totalCollected = Object.values(completedRuns.value).reduce((sum, r) => {
        try {
          const prog = JSON.parse(r.progress_json || '{}')
          return sum + (prog.collected || 0)
        } catch { return sum }
      }, 0)
      try {
        const notif = new window.Notification('GhostBrowse — 数据采集完成', {
          body: totalCollected > 0 ? `共采集 ${totalCollected} 条数据，请查看采集结果` : '采集任务已全部完成，请查看结果',
          icon: 'http://localhost:3000/icons/logo1.png'
        })
        setTimeout(() => notif.close(), 8000)
      } catch {}
    }
    lastNotifyState = nowIdle ? 'idle' : 'active'
  } catch {}
}

async function abortProfile(profileId: number) {
  const run = allRunDetails.value[profileId]
  if (!run) return
  try {
    await abortTaskRun(run.id)
    antMessage.info('已发送中止信号')
    refreshPool()
  } catch (e: any) { antMessage.error(e.message) }
}

/** 点击"查看结果" → 自动用该窗口的 task_run_id 查询采集结果 */
async function quickViewResults(profileId: number | string) {
  const id = Number(profileId)
  const run = allRunDetails.value[id] || completedRuns.value[id]
  if (!run) return
  searchRunId.value = run.id
  await handleSearch()
}

// 3 秒轮询
let timer: ReturnType<typeof setInterval> | null = null
timer = setInterval(refreshPool, 3000)
refreshPool()
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.extraction-console { padding: 0 24px 24px; }
.section-card { margin-bottom: 16px; }
.cell-preview { max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.profile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.logs-box-small { max-height: 100px; overflow-y: auto; font-family: monospace; font-size: 11px; margin-top: 8px; }
.log-line { padding: 1px 0; border-bottom: 1px solid #f5f5f5; }
.log-error { color: #ff4d4f; }
.hint { color: #999; font-size: 12px; }
.progress-bar { margin: 8px 0; }
.status-running { font-size: 14px; }
.status-pending { font-size: 14px; }
.status-idle { font-size: 14px; }
</style>