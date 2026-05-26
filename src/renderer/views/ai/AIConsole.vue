<template>
  <div class="ai-console">
    <a-page-header title="AI 控制台" sub-title="指令解析 + 评论生成 + 任务执行（迭代 3.5）" />
    <OllamaStatusBar />

    <!-- 解析指令 -->
    <a-card title="自然语言指令解析" size="small" class="section-card">
      <template #extra><a-tag color="blue">POST /ai/parse-command</a-tag></template>
      <a-textarea v-model:value="aiStore.commandInput" :rows="3"
        placeholder='例如："去@elonmusk点赞前5条推文后暂停"、"在首页浏览5条并点赞前3条"'
        :disabled="aiStore.parsing" />
      <div class="action-row">
        <a-space>
          <a-button type="primary" :loading="aiStore.parsing" :disabled="!canParse" @click="handleParse">
            <template #icon><ThunderboltOutlined /></template>解析指令
          </a-button>
          <a-button v-if="aiStore.parseResult || aiStore.parseError" @click="handleResetParse">清空</a-button>
          <a-tag v-if="aiStore.parsing" color="processing">正在解析（{{ parseElapsed }}s）...</a-tag>
        </a-space>
      </div>
      <a-alert v-if="aiStore.parseError" type="error" show-icon closable
        :message="`解析失败：${aiStore.parseError}`" class="error-alert" @close="aiStore.parseError = null" />
      <TaskPlanCard v-if="aiStore.editedPlan" :plan="aiStore.editedPlan"
        :warnings="aiStore.parseResult?.warnings" :raw-output="aiStore.parseResult?.rawOutput"
        :retries="aiStore.parseResult?.retries"
        @update:plan="(p: any) => (aiStore.editedPlan = p)" @reset="handleResetPlan" @start="handleStart" />
    </a-card>

    <!-- 任务执行监控 -->
    <a-card v-if="executionTaskId" title="任务执行监控" size="small" class="section-card">
      <template #extra>
        <a-space>
          <a-tag v-if="executionRunning" color="processing">运行中</a-tag>
          <a-tag v-else-if="executionStage === 'done'" color="success">已完成</a-tag>
          <a-tag v-else-if="executionStage === 'paused'" color="warning">已暂停</a-tag>
          <a-tag v-else-if="executionStage === 'error'" color="error">出错</a-tag>
          <a-button v-if="executionRunning" danger size="small" @click="handleAbort()">
            <template #icon><StopOutlined /></template>中止
          </a-button>
        </a-space>
      </template>
      <a-row :gutter="16">
        <a-col :span="6"><a-statistic title="阶段" :value="stageLabel" /></a-col>
        <a-col :span="6"><a-statistic title="进度" :value="`${executionProgress?.processed || 0}/${executionProgress?.total || 0}`" /></a-col>
        <a-col :span="4"><a-statistic title="点赞" :value="executionProgress?.liked || 0" /></a-col>
        <a-col :span="4"><a-statistic title="转发" :value="executionProgress?.retweeted || 0" /></a-col>
        <a-col :span="4"><a-statistic title="评论" :value="executionProgress?.commented || 0" /></a-col>
      </a-row>
      <a-progress v-if="executionProgress?.total"
        :percent="Math.round((executionProgress!.processed / executionProgress!.total) * 100)"
        :status="executionStage === 'error' ? 'exception' : executionStage === 'done' ? 'success' : 'active'" />
      <a-collapse :default-active-key="['logs']">
        <a-collapse-panel key="logs" :header="`执行日志（${executionLogs.length}）`">
          <div class="logs-box">
            <div v-for="(log, i) in executionLogs" :key="i" class="log-line"
              :class="{ 'log-error': log.includes('ERROR') || log.includes('失败') }">{{ log }}</div>
            <div v-if="!executionLogs.length">暂无日志</div>
          </div>
        </a-collapse-panel>
      </a-collapse>
    </a-card>

    <!-- 评论生成 -->
    <a-card title="评论生成" size="small" class="section-card">
      <template #extra><a-tag color="blue">POST /ai/generate-comment</a-tag></template>
      <a-textarea v-model:value="aiStore.commentInput" :rows="3"
        placeholder="粘贴一条推文/帖子原文，AI 将根据语言生成自然评论" :disabled="aiStore.generating" />
      <div class="action-row">
        <a-space>
          <a-button type="primary" :loading="aiStore.generating" :disabled="!canGenerate" @click="handleGenerate">
            <template #icon><MessageOutlined /></template>生成评论
          </a-button>
          <a-button v-if="aiStore.commentResult || aiStore.commentError" @click="handleResetComment">清空</a-button>
          <a-tag v-if="aiStore.generating" color="processing">正在生成（{{ commentElapsed }}s）...</a-tag>
        </a-space>
      </div>
      <a-alert v-if="aiStore.commentError" type="error" show-icon closable
        :message="`生成失败：${aiStore.commentError}`" class="error-alert" @close="aiStore.commentError = null" />
      <a-card v-if="aiStore.commentResult" size="small" class="comment-result-card"
        :class="{ 'is-fallback': aiStore.commentResult.fallbackToEmoji }">
        <template #title>
          <span>
            <CheckCircleOutlined v-if="!aiStore.commentResult.fallbackToEmoji" style="color:#52c41a" />
            <SmileOutlined v-else />
            生成结果
            <a-tag :color="aiStore.commentResult.fallbackToEmoji ? 'warning' : 'success'">
              {{ aiStore.commentResult.fallbackToEmoji ? 'Emoji 兜底' : '正常' }}</a-tag>
          </span>
        </template>
        <template #extra>
          <a-button size="small" @click="copyComment"><template #icon><CopyOutlined /></template>复制</a-button>
        </template>
        <div class="comment-text">{{ aiStore.commentResult.comment }}</div>
        <a-collapse v-if="aiStore.commentResult.rawOutput" ghost>
          <a-collapse-panel key="raw" header="AI 原始输出">
            <pre class="raw-output">{{ aiStore.commentResult.rawOutput }}</pre>
          </a-collapse-panel>
        </a-collapse>
      </a-card>
    </a-card>

    <!-- 启动任务对话框 -->
    <a-modal v-model:open="startModalVisible" title="启动任务执行"
      :confirm-loading="starting" ok-text="启动" cancel-text="取消" @ok="handleConfirmStart">
      <p>选择要在哪个 Profile（已运行的浏览器）中执行：</p>
      <a-select v-model:value="selectedProfileId" style="width:100%" placeholder="请选择已运行的窗口"
        :loading="loadingProfiles">
        <a-select-option v-for="p in runningProfiles" :key="p.id" :value="p.id">
          [{{ p.id }}] {{ p.title }}
        </a-select-option>
      </a-select>
      <a-alert v-if="!loadingProfiles && runningProfiles.length === 0"
        type="warning" show-icon message="没有正在运行的窗口"
        description="请先启动一个窗口并登录 X，再回来执行任务。" class="modal-alert" />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { message as antMessage } from 'ant-design-vue'
import {
  ThunderboltOutlined, MessageOutlined, CheckCircleOutlined,
  SmileOutlined, CopyOutlined, StopOutlined
} from '@ant-design/icons-vue'
import OllamaStatusBar from '../../components/ai/OllamaStatusBar.vue'
import TaskPlanCard from '../../components/ai/TaskPlanCard.vue'
import { aiStore } from '../../stores/ai'
import { parseCommand, generateComment } from '../../api/ai'
import { useTaskExecution } from '../../composables/useTaskExecution'

const {
  executionTaskId, executionRunning, executionStage, executionProgress,
  executionLogs, stageLabel, startModalVisible, starting, selectedProfileId,
  loadingProfiles, runningProfiles, openStartModal, confirmStart, handleAbort
} = useTaskExecution()

// ===== 计时 =====
const tick = ref(0)
const timer = setInterval(() => tick.value++, 1000)
onUnmounted(() => clearInterval(timer))

const parseElapsed = computed(() => {
  if (!aiStore.parsing || !aiStore.parseStartedAt) return 0
  void tick.value; return Math.floor((Date.now() - aiStore.parseStartedAt) / 1000)
})
const commentElapsed = computed(() => {
  if (!aiStore.generating || !aiStore.commentStartedAt) return 0
  void tick.value; return Math.floor((Date.now() - aiStore.commentStartedAt) / 1000)
})

// ===== 按钮可用 =====
const canParse = computed(() => aiStore.commandInput.trim().length > 0 && aiStore.health?.online)
const canGenerate = computed(() => aiStore.commentInput.trim().length > 0 && aiStore.health?.online)

// ===== 解析指令 =====
async function handleParse() {
  aiStore.parsing = true; aiStore.parseStartedAt = Date.now()
  aiStore.parseError = null; aiStore.parseResult = null; aiStore.editedPlan = null
  try {
    const result = await parseCommand(aiStore.commandInput)
    aiStore.parseResult = result
    aiStore.editedPlan = JSON.parse(JSON.stringify(result.plan))
  } catch (err: any) { aiStore.parseError = err.message || String(err) }
  finally { aiStore.parsing = false }
}
function handleResetParse() {
  aiStore.parseResult = null; aiStore.parseError = null; aiStore.editedPlan = null
}
function handleResetPlan() { aiStore.editedPlan = null }

// ===== 启动任务 =====
function handleStart() {
  if (!aiStore.editedPlan) { antMessage.warning('没有可执行的计划'); return }
  openStartModal()
}
async function handleConfirmStart() {
  if (!aiStore.editedPlan) return
  await confirmStart(aiStore.editedPlan)
}

// ===== 评论生成 =====
async function handleGenerate() {
  aiStore.generating = true; aiStore.commentStartedAt = Date.now()
  aiStore.commentError = null; aiStore.commentResult = null
  try {
    aiStore.commentResult = await generateComment(aiStore.commentInput)
  } catch (err: any) { aiStore.commentError = err.message || String(err) }
  finally { aiStore.generating = false }
}
function handleResetComment() { aiStore.commentResult = null; aiStore.commentError = null }
function copyComment() {
  if (!aiStore.commentResult) return
  navigator.clipboard.writeText(aiStore.commentResult.comment)
  antMessage.success('已复制')
}
</script>

<style scoped>
.ai-console { padding: 0 24px 24px; max-width: 900px; }
.section-card { margin-bottom: 16px; }
.action-row { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; }
.error-alert { margin-top: 12px; }
.comment-result-card { margin-top: 12px; }
.comment-result-card.is-fallback { border-color: #faad14; }
.comment-text { font-size: 16px; padding: 8px 0; }
.raw-output { white-space: pre-wrap; word-break: break-all; font-size: 12px; max-height: 300px; overflow-y: auto; }
.logs-box { max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; }
.log-line { padding: 2px 0; border-bottom: 1px solid #f0f0f0; }
.log-error { color: #ff4d4f; }
.modal-alert { margin-top: 12px; }
</style>