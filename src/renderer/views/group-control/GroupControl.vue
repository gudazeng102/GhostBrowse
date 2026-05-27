<template>
  <div class="group-control">
    <a-page-header title="多窗口群控" sub-title="迭代 6.0 — 批量下发 + 实时监控" />

    <a-card size="small" class="section-card">
      <template #title>
        <span>批量下发任务</span>
      </template>
      <a-space direction="vertical" style="width:100%">
        <a-textarea v-model:value="batchCommand" :rows="2" placeholder='输入自然语言指令，如："点赞前 3 条内容"' />
        <a-space>
          <a-button type="primary" :loading="batchLoading" @click="handleBatchParse">
            <template #icon><ThunderboltOutlined /></template>解析指令
          </a-button>
          <a-button v-if="batchPlan" type="primary" @click="handleBatchSend" :loading="batchSending">
            <template #icon><SendOutlined /></template>下发到所有运行中的窗口
          </a-button>
          <a-tag v-if="batchPlan" color="green">已解析</a-tag>
        </a-space>
      </a-space>
    </a-card>

    <a-card title="窗口状态监控" size="small" class="section-card">
      <template #extra>
        <a-space>
          <a-tag color="purple">迭代 6.0</a-tag>
          <a-button size="small" @click="refreshPool">刷新</a-button>
        </a-space>
      </template>

      <div class="profile-grid">
        <a-card
          v-for="(entry, rawId) in poolStatus"
          :key="rawId"
          size="small"
          class="profile-card"
          hoverable
        >
          <template #title>
            <a-space>
              <span :class="statusClass(entry)">{{ statusIcon(entry) }}</span>
              <span>Profile {{ rawId }}</span>
              <a-tag :color="entry.running ? 'processing' : (entry.status === 'pending' ? 'blue' : 'default')">
                {{ entry.running ? '执行中' : (entry.status === 'pending' ? '排队中' : '空闲') }}
              </a-tag>
            </a-space>
          </template>

          <template v-if="currentRunDetails[Number(rawId)]" #extra>
            <a-button size="small" danger @click="abortProfile(Number(rawId))">
              <template #icon><StopOutlined /></template>中止
            </a-button>
          </template>

          <div v-if="currentRunDetails[Number(rawId)]">
            <a-row :gutter="8">
              <a-col :span="8"><a-statistic title="进度" :value="`${runProg(rawId)?.processed || 0}/${runProg(rawId)?.total || 0}`" /></a-col>
              <a-col :span="5"><a-statistic title="点赞" :value="runProg(rawId)?.liked || 0" /></a-col>
              <a-col :span="5"><a-statistic title="转发" :value="runProg(rawId)?.retweeted || 0" /></a-col>
              <a-col :span="6"><a-statistic title="评论" :value="runProg(rawId)?.commented || 0" /></a-col>
            </a-row>
            <a-progress
              v-if="runProg(rawId)?.total"
              :percent="Math.round((runProg(rawId)!.processed / runProg(rawId)!.total) * 100)"
              status="active"
              size="small"
              class="progress-bar"
            />
            <div class="logs-box-small">
              <div v-for="(log, i) in runLogs(rawId)" :key="i" class="log-line"
                :class="{ 'log-error': log.includes('ERROR') || log.includes('失败') }">{{ log }}</div>
              <div v-if="!runLogs(rawId).length" class="hint">暂无日志</div>
            </div>
          </div>
          <div v-else>
            <a-empty :image-style="{ height: '40px' }" description="空闲" />
          </div>
        </a-card>
      </div>
      <a-empty v-if="!Object.keys(poolStatus).length" description="没有运行中的窗口" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import { message as antMessage } from 'ant-design-vue'
import { ThunderboltOutlined, SendOutlined, StopOutlined } from '@ant-design/icons-vue'
import { parseCommand } from '../../api/ai'
import { getPoolStatus, getTaskQueue, batchEnqueueTasks, abortTaskRun } from '../../api/task-queue'
import type { PoolEntry, TaskRun } from '../../api/task-queue'

const batchCommand = ref('')
const batchLoading = ref(false)
const batchPlan = ref<any>(null)
const batchSending = ref(false)

const poolStatus = ref<Record<number, PoolEntry>>({})
const queueItems = ref<TaskRun[]>([])

// 从 queueItems 中提取当前运行中的详细记录
const currentRunDetails = computed(() => {
  const map: Record<number, TaskRun> = {}
  for (const item of queueItems.value) {
    if (item.status === 'running') {
      map[item.profile_id] = item
    }
  }
  return map
})

function runProg(profileId: number | string) {
  const id = Number(profileId)
  const run = currentRunDetails.value[id]
  if (!run?.progress_json) return null
  try { return JSON.parse(run.progress_json) } catch { return null }
}

function runLogs(profileId: number | string): string[] {
  const id = Number(profileId)
  const run = currentRunDetails.value[id]
  if (!run?.logs_json) return []
  try { return JSON.parse(run.logs_json) as string[] } catch { return [] }
}

function statusClass(entry: PoolEntry) { return entry.running ? 'status-running' : (entry.status === 'pending' ? 'status-pending' : 'status-idle') }
function statusIcon(entry: PoolEntry) { return entry.running ? '🟢' : (entry.status === 'pending' ? '🔵' : '⚪') }

async function refreshPool() {
  try {
    const [pool, queue] = await Promise.all([getPoolStatus(), getTaskQueue()])
    poolStatus.value = pool
    queueItems.value = queue
  } catch {}
}

async function handleBatchParse() {
  if (!batchCommand.value.trim()) { antMessage.warning('请输入指令'); return }
  batchLoading.value = true
  try {
    const result = await parseCommand(batchCommand.value)
    batchPlan.value = result.plan
    antMessage.success('指令解析成功')
  } catch (e: any) { antMessage.error(e.message || '解析失败') }
  finally { batchLoading.value = false }
}

async function handleBatchSend() {
  if (!batchPlan.value) { antMessage.warning('请先解析指令'); return }
  // 筛选运行中的 profile
  const runningIds = Object.entries(poolStatus.value)
    .filter(([_, entry]) => entry.status === 'running' || entry.status === 'pending')
    .map(([id]) => Number(id))

  if (runningIds.length === 0) {
    const allIds = Object.keys(poolStatus.value).map(Number)
    if (allIds.length === 0) { antMessage.warning('没有活跃的窗口'); return }
    // 即使只有 pending 状态也认为是活跃窗口
    runningIds.push(...allIds)
  }

  batchSending.value = true
  try {
    const runs = await batchEnqueueTasks({ profileIds: runningIds, plan: batchPlan.value })
    antMessage.success(`已向 ${runs.length} 个窗口下发任务`)
    batchPlan.value = null
    refreshPool()
  } catch (e: any) { antMessage.error(e.message || '下发失败') }
  finally { batchSending.value = false }
}

async function abortProfile(profileId: number) {
  const run = currentRunDetails.value[profileId]
  if (!run) return
  try {
    await abortTaskRun(run.id)
    antMessage.info('已发送中止信号')
    refreshPool()
  } catch (e: any) { antMessage.error(e.message) }
}

let timer: ReturnType<typeof setInterval> | null = null
timer = setInterval(refreshPool, 3000)
refreshPool()
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.group-control { padding: 0 24px 24px; }
.section-card { margin-bottom: 16px; }
.profile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.profile-card { }
.logs-box-small { max-height: 100px; overflow-y: auto; font-family: monospace; font-size: 11px; margin-top: 8px; }
.log-line { padding: 1px 0; border-bottom: 1px solid #f5f5f5; }
.log-error { color: #ff4d4f; }
.hint { color: #999; font-size: 12px; }
.progress-bar { margin: 8px 0; }
.status-running { font-size: 14px; }
.status-pending { font-size: 14px; }
.status-idle { font-size: 14px; }
</style>