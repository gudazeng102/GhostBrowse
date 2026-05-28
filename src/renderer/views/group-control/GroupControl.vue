<template>
  <div class="group-control">
    <a-page-header title="💻 
    多窗口群控" sub-title="迭代 6.0 — 批量下发 + 实时监控" />

    <!-- 批量下发任务（自然语言） -->
    <a-card size="small" class="section-card">
      <template #title>
        <span>📝 自然语言模式</span>
      </template>
      <a-space direction="vertical" style="width:100%">
        <a-textarea v-model:value="batchCommand" :rows="2" placeholder='输入自然语言指令，如："点赞前 3 条内容"' />
        <a-space wrap>
          <a-button type="primary" :loading="batchLoading" @click="handleBatchParse">
            <template #icon><ThunderboltOutlined /></template>解析指令
          </a-button>
          <a-button type="primary" @click="handleBatchSend" :loading="batchSending">
            <template #icon><SendOutlined /></template>下发
          </a-button>
          <a-tag v-if="batchPlan" color="green">已解析</a-tag>
          <a-button type="dashed" @click="showWorkflow = !showWorkflow">
            ⚡ 精准模式
          </a-button>
          <a-switch v-model:checked="notificationEnabled" checked-children="通知开" un-checked-children="通知关" />
          <a-tooltip title="开启后我们将在您的养号完成后通过系统的弹窗通知您，你可以选择关闭，关闭后我们不会通过此通知您">
            <QuestionCircleOutlined />
          </a-tooltip>
        </a-space>
      </a-space>
    </a-card>

    <!-- 精准模式（迭代 8.0） -->
    <transition name="fade">
    <div v-if="showWorkflow">
      <a-card size="small" class="section-card">
        <template #title>
          <span>⚡ 精准模式 — 添加步骤</span>
        </template>
        <a-space wrap>
          <a-button @click="addStep('browse')" type="dashed">📖 浏览 +</a-button>
          <a-button @click="addStep('like')" type="dashed">❤️ 点赞 +</a-button>
          <a-button @click="addStep('retweet')" type="dashed">🔁 转发 +</a-button>
          <a-button @click="addStep('comment')" type="dashed">💬 评论 +</a-button>
          <a-button @click="addStep('goHome')" type="dashed">🏠 去首页 +</a-button>
          <a-button @click="addStep('goToProfile')" type="dashed">👤 去指定账号页 +</a-button>
        </a-space>
      </a-card>

      <a-card v-if="workflowSteps.length" size="small" class="section-card">
        <template #title>
          <span>📋 步骤列表 <a-tag color="blue">{{ workflowSteps.length }} 步</a-tag></span>
        </template>
        <a-table :dataSource="workflowSteps" :columns="stepColumns" :pagination="false" size="small" rowKey="id">
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'seq'">{{ index + 1 }}</template>
            <template v-else-if="column.key === 'action'">{{ stepLabel(record.type) }}</template>
            <template v-else-if="column.key === 'detail'">
              <span v-if="record.type === 'goHome'">跳转首页</span>
              <span v-else-if="record.type === 'goToProfile'">前往 @{{ record.targetAccount }}</span>
              <span v-else>{{ record.count }} 条</span>
            </template>
            <template v-else-if="column.key === 'range'">{{ getStepRange(index) }}</template>
            <template v-else-if="column.key === 'actions'">
              <a-button size="small" danger @click="removeStep(index)">删除</a-button>
            </template>
          </template>
        </a-table>
        <a-space style="margin-top:12px">
          <a-button type="primary" @click="handleWorkflowBuild">
            <template #icon><SendOutlined /></template>下发到所有窗口
          </a-button>
          <a-button @click="showWorkflow = false">关闭精准模式</a-button>
        </a-space>
      </a-card>
    </div>
    </transition>

    <!-- 模板库 -->
    <a-card size="small" class="section-card">
      <template #title>
        <span>📋 模板库</span>
      </template>
      <a-space direction="vertical" style="width:100%">
        <a-select
          v-model:value="selectedTemplateId"
          placeholder="选择模板..."
          style="width:100%"
          :loading="templateLoading"
        >
          <a-select-option v-for="tpl in templates" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</a-select-option>
        </a-select>
        <a-space>
          <a-button type="primary" :disabled="!selectedTemplateId" @click="handleUseTemplate">
            <template #icon><SendOutlined /></template>使用模板下发
          </a-button>
          <a-button danger :disabled="!selectedTemplateId" @click="handleDeleteTemplate">
            <template #icon><StopOutlined /></template>删除
          </a-button>
        </a-space>
      </a-space>
    </a-card>

    <!-- 精准模式调试卡片 -->
    <a-card v-if="debugPlan" size="small" class="section-card">
      <template #title>
        <span>🔍 精准模式 - 下发计划 JSON</span>
        <a-button size="small" style="margin-left:8px" @click="debugPlan = null">清除</a-button>
      </template>
      <pre style="max-height:300px; overflow:auto; background:#f6f8fa; padding:12px; border-radius:4px; font-size:12px; line-height:1.5; white-space:pre-wrap; word-break:break-all;">{{ JSON.stringify(debugPlan, null, 2) }}</pre>
    </a-card>

    <!-- 窗口状态监控 -->
    <a-card title="窗口状态监控" size="small" class="section-card">
      <template #extra>
        <a-space>
          <a-tag color="purple">迭代 6.0</a-tag>
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
            <a-button size="small" danger @click="abortProfile(Number(rawId))">
              <template #icon><StopOutlined /></template>中止
            </a-button>
          </template>
          <div v-if="allRunDetails[Number(rawId)]">
            <a-row :gutter="8">
              <a-col :span="8"><a-statistic title="进度" :value="`${runProg(rawId)?.processed || 0}/${runProg(rawId)?.total || 0}`" /></a-col>
              <a-col :span="5"><a-statistic title="点赞" :value="runProg(rawId)?.liked || 0" /></a-col>
              <a-col :span="5"><a-statistic title="转发" :value="runProg(rawId)?.retweeted || 0" /></a-col>
              <a-col :span="6"><a-statistic title="评论" :value="runProg(rawId)?.commented || 0" /></a-col>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, computed, h, watch } from 'vue'
import { message as antMessage, Modal } from 'ant-design-vue'
import { ThunderboltOutlined, SendOutlined, StopOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import { parseCommand } from '../../api/ai'
import { getPoolStatus, getTaskQueue, batchEnqueueTasks, abortTaskRun, getTaskTemplates, saveTaskTemplate, deleteTaskTemplate } from '../../api/task-queue'
import type { PoolEntry, TaskRun, TaskTemplate } from '../../api/task-queue'

// ==================== 状态 ====================

const batchCommand = ref('')
const batchLoading = ref(false)
const batchPlan = ref<any>(null)
const batchSending = ref(false)

// 通知开关（本地持久化：localStorage key = "notification_${userId}"）
const userId = 1 // 当前用户 ID，可从认证信息获取
const notificationEnabled = ref(false)
let lastNotifyState = 'idle'

// 从 localStorage 初始化
function initNotificationSetting() {
  try {
    const key = `notification_${userId}`
    const saved = localStorage.getItem(key)
    if (saved === 'true') {
      notificationEnabled.value = true
    }
  } catch (e) { /* localStorage 不可用时静默 */ }
}
initNotificationSetting()

// 同步到 localStorage（切换时自动持久化）
watch(notificationEnabled, (val) => {
  try {
    localStorage.setItem(`notification_${userId}`, String(val))
  } catch (e) { /* 静默 */ }
})

function requestNotificationPermission() {
  if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'default') {
    window.Notification.requestPermission()
  }
}

// 精准模式（迭代 8.0）
const showWorkflow = ref(false)
const debugPlan = ref<any>(null)

interface WorkflowStep {
  id: number
  type: 'browse' | 'like' | 'retweet' | 'comment' | 'goHome' | 'goToProfile'
  count?: number
  targetAccount?: string
  _tmpCount?: string   // 未确认前暂存字符串
  _tmpAccount?: string
  _editing?: boolean
}

const workflowSteps = ref<WorkflowStep[]>([])
let stepIdCounter = 0

const stepColumns = [
  { title: '#', key: 'seq', width: 40 },
  { title: '操作', key: 'action', width: 100 },
  { title: '详情', key: 'detail', width: 160 },
  { title: '位置', key: 'range', width: 140 },
  { title: '操作', key: 'actions', width: 60 }
]

function stepLabel(type: string): string {
  const map: Record<string, string> = { browse: '📖浏览', like: '❤️点赞', retweet: '🔁转发', comment: '💬评论', goHome: '🏠去首页', goToProfile: '👤去账号' }
  return map[type] || type
}

function addStep(type: WorkflowStep['type']) {
  if (workflowSteps.value.length >= 10) {
    antMessage.warning('当前步骤只支持到第10步')
    return
  }
  if (type === 'goHome') {
    workflowSteps.value.push({ id: ++stepIdCounter, type, _editing: false })
    return
  }
  if (type === 'goToProfile') {
    let account = ''
    Modal.confirm({
      title: '👤 输入目标账号',
      content: h('input', {
        style: 'width:100%; padding:4px 8px; border:1px solid #d9d9d9; border-radius:4px; outline:none',
        placeholder: '例如 @elonmusk',
        onInput: (e: any) => { account = e.target.value.replace(/^@/, '') }
      }),
      onOk: () => {
        if (!account.trim()) { antMessage.warning('请输入账号名称'); throw new Error('cancel') }
        workflowSteps.value.push({ id: ++stepIdCounter, type, targetAccount: account.trim(), _editing: false })
      }
    })
    return
  }
  // browse / like / retweet / comment
  let countVal = ''
  Modal.confirm({
    title: stepLabel(type),
    content: h('input', {
      style: 'width:100%; padding:4px 8px; border:1px solid #d9d9d9; border-radius:4px; outline:none',
      placeholder: '请输入条数',
      type: 'number',
      min: 1,
      onInput: (e: any) => { countVal = e.target.value }
    }),
    onOk: () => {
      const count = parseInt(countVal, 10)
      if (isNaN(count) || count < 1) { antMessage.warning('请输入有效的正整数'); throw new Error('invalid') }
      workflowSteps.value.push({ id: ++stepIdCounter, type, count, _editing: false })
    }
  })
}

function removeStep(index: number) {
  workflowSteps.value.splice(index, 1)
}

/** 根据步骤顺序计算位置范围（存在导航步骤时重置计数器） */
function getStepRange(index: number): string {
  const steps = workflowSteps.value
  let pos = 1
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (s.type === 'goHome' || s.type === 'goToProfile') {
      if (i === index) return '—'
      pos = 1 // 导航后重置计数器
      continue
    }
    const c = s.count || 0
    if (i === index) {
      if (c === 0) return '—'
      return c === 1 ? `第 ${pos} 条` : `第 ${pos}-${pos + c - 1} 条`
    }
    pos += c
  }
  return '—'
}

/** 从 workflow steps 生成 TaskPlan.segments */
function buildWorkflowPlan(): any {
  const steps = workflowSteps.value
  const segments: any[] = []
  const allOps: string[] = []
  let pos = 1
  let likeBudget = 0
  let totalCount = 0
  let currentPage: { type: 'home' | 'profile'; account?: string } = { type: 'home' }

  for (const step of steps) {
    if (step.type === 'goHome') {
      segments.push({ _navigate_home: true })
      currentPage = { type: 'home' }
      pos = 1
      continue
    }
    if (step.type === 'goToProfile') {
      segments.push({ _navigate_profile: step.targetAccount })
      currentPage = { type: 'profile', account: step.targetAccount }
      pos = 1
      continue
    }
    const count = step.count || 0
    if (count === 0) continue

    const op = step.type
    const seg: any = { start: pos, end: pos + count - 1, operations: [op] }
    // 标记页面上下文
    if (currentPage.type === 'home' && segments.length > 0 && !segments[segments.length - 1]._navigate_home) {
      // 不重复标记
    }
    // 首次或导航后首个执行段，标记页面
    if (segments.length === 0 || segments[segments.length - 1]._navigate_home || segments[segments.length - 1]._navigate_profile) {
      if (currentPage.type === 'home') seg.navigate_home = true
      else seg.target_account = currentPage.account
    }

    if (!allOps.includes(op)) allOps.push(op)
    if (op === 'like') likeBudget += count
    totalCount += count
    segments.push(seg)
    pos += count
  }

  // 清理标记段（纯导航指令）
  const cleanSegments = segments.filter((s: any) => !s._navigate_home && !s._navigate_profile)

  // 迭代 8.0 fix: 如果最后一步是"去首页"或"去指定账号页"，且被过滤掉了，
  // 追加一个存活段，让 executeSegments 能执行最终的页面导航
  const lastStep = steps[steps.length - 1]
  if (lastStep && (lastStep.type === 'goHome' || lastStep.type === 'goToProfile')) {
    const navSeg: any = { start: 1, end: 0, operations: ['view'] }
    if (lastStep.type === 'goHome') navSeg.navigate_home = true
    else navSeg.target_account = lastStep.targetAccount
    cleanSegments.push(navSeg)
  }

  return {
    action: 'targeted_interaction',
    target_accounts: [],
    operations: allOps,
    constraints: { view_count: totalCount, like_count: likeBudget, selective: false },
    segments: cleanSegments.length > 0 ? cleanSegments : undefined,
    duration_minutes: 0,
    pause_after: false,
    raw_command: `[精准模式] ${steps.map(s => stepLabel(s.type) + (s.count || '')).join(' → ')}`
  }
}

async function handleWorkflowBuild() {
  if (workflowSteps.value.length === 0) { antMessage.warning('请至少添加一个步骤'); return }
  const plan = buildWorkflowPlan()
  debugPlan.value = plan
  batchPlan.value = plan
  antMessage.success(`计划已构建，共 ${workflowSteps.value.length} 步`)
  await handleBatchSend()
}

// ==================== 模板库 ====================

const selectedTemplateId = ref<number | null>(null)
const templates = ref<TaskTemplate[]>([])
const templateLoading = ref(false)

async function loadTemplates() {
  templateLoading.value = true
  try { templates.value = await getTaskTemplates() } catch { /* 静默 */ }
  finally { templateLoading.value = false }
}

async function handleSaveTemplate() {
  if (!batchPlan.value) { antMessage.warning('没有已解析的计划可保存'); return }
  const name = prompt('请输入模板名称：')
  if (!name) return
  try {
    const plan = batchPlan.value
    const platform = (plan.platform_accounts?.[0]?.platform) || 'twitter'
    await saveTaskTemplate({ name, platform, plan })
    antMessage.success('模板已保存')
    loadTemplates()
  } catch (e: any) { antMessage.error(e.message || '保存失败') }
}

async function handleUseTemplate() {
  if (!selectedTemplateId.value) return
  const tpl = templates.value.find(t => t.id === selectedTemplateId.value)
  if (!tpl) return
  try {
    batchPlan.value = JSON.parse(tpl.plan_json)
    antMessage.success(`已加载模板: ${tpl.name}`)
    await handleBatchSend()
  } catch (e: any) { antMessage.error(e.message || '加载失败') }
}

async function handleDeleteTemplate() {
  if (!selectedTemplateId.value) return
  try {
    await deleteTaskTemplate(selectedTemplateId.value)
    antMessage.info('模板已删除')
    selectedTemplateId.value = null
    loadTemplates()
  } catch (e: any) { antMessage.error(e.message || '删除失败') }
}

// ==================== 池状态 ====================

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

async function refreshPool() {
  try {
    const [pool, queue] = await Promise.all([getPoolStatus(), getTaskQueue()])
    poolStatus.value = pool
    const newIds = new Set(queue.map(r => r.id))
    for (const oldRun of queueItems.value) {
      if (!newIds.has(oldRun.id) && oldRun.logs_json) completedRuns.value[oldRun.profile_id] = oldRun
    }
    queueItems.value = queue

    // 通知逻辑：开启 + 之前有任务在跑 + 现在所有任务已完成
    if (notificationEnabled.value) {
      const hasRunning = queue.some(r => r.status === 'running')
      const hasPending = queue.some(r => r.status === 'pending')
      const nowIdle = !hasRunning && !hasPending
      const wasActive = lastNotifyState === 'active'
      if (wasActive && nowIdle && Object.keys(completedRuns.value).length > 0) {
        requestNotificationPermission()
        try {
          const notif = new window.Notification('GhostBrowse — 养号完成', {
            body: '所有窗口的养号任务已全部执行完毕，请查看结果。',
            icon: 'http://localhost:3000/icons/logo1.png'
          })
          setTimeout(() => notif.close(), 8000)
        } catch (e) { /* Notification 不支持时静默 */ }
      }
      lastNotifyState = nowIdle ? 'idle' : 'active'
    } else {
      lastNotifyState = 'idle'
    }
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
  const runningIds = Object.entries(poolStatus.value)
    .filter(([_, entry]) => entry.status === 'running' || entry.status === 'pending')
    .map(([id]) => Number(id))
  if (runningIds.length === 0) {
    const allIds = Object.keys(poolStatus.value).map(Number)
    if (allIds.length === 0) { antMessage.warning('没有活跃的窗口'); return }
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
  const run = allRunDetails.value[profileId]
  if (!run) return
  try {
    await abortTaskRun(run.id)
    antMessage.info('已发送中止信号')
    refreshPool()
  } catch (e: any) { antMessage.error(e.message) }
}

// ==================== 初始化 ====================

loadTemplates()
let timer: ReturnType<typeof setInterval> | null = null
timer = setInterval(refreshPool, 3000)
refreshPool()
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.group-control { padding: 0 24px 24px; }
.section-card { margin-bottom: 16px; }
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