<template>
  <div class="ai-console">
    <a-page-header
      class="page-header"
      title="AI 控制台"
      sub-title="自然语言指令解析 + 评论生成"
    />

    <!-- Ollama 状态条 -->
    <OllamaStatusBar />

    <!-- 解析指令区 -->
    <a-card title="自然语言指令解析" size="small" class="section-card">
      <template #extra>
        <a-tag color="blue">POST /ai/parse-command</a-tag>
      </template>

      <a-textarea
        v-model:value="aiStore.commandInput"
        :rows="3"
        placeholder='例如："去@elonmusk点赞前5条推文后暂停"、"在首页浏览5条并点赞前3条"、"关注页浏览3分钟后暂停"'
        :disabled="aiStore.parsing"
      />

      <div class="action-row">
        <a-space>
          <a-button
            type="primary"
            :loading="aiStore.parsing"
            :disabled="!canParse"
            @click="handleParse"
          >
            <template #icon><ThunderboltOutlined /></template>
            解析指令
          </a-button>

          <a-button
            v-if="aiStore.parseResult || aiStore.parseError"
            @click="handleResetParse"
          >
            清空结果
          </a-button>

          <a-tag v-if="aiStore.parsing" color="processing" class="elapsed-tag">
            正在解析（{{ parseElapsed }}s）...
          </a-tag>
        </a-space>

        <span v-if="aiStore.parsing" class="hint-text">
          32B 思考模型可能耗时 1~5 分钟，请耐心等待
        </span>
      </div>

      <a-alert
        v-if="aiStore.parseError"
        type="error"
        show-icon
        :message="`解析失败：${aiStore.parseError}`"
        class="error-alert"
        closable
        @close="aiStore.parseError = null"
      />

      <TaskPlanCard
        v-if="aiStore.editedPlan"
        :plan="aiStore.editedPlan"
        :warnings="aiStore.parseResult?.warnings"
        :raw-output="aiStore.parseResult?.rawOutput"
        :retries="aiStore.parseResult?.retries"
        @update:plan="(p) => (aiStore.editedPlan = p)"
        @reset="handleResetPlan"
        @start="handleStart"
      />
    </a-card>

    <!-- 评论生成区 -->
    <a-card title="评论生成" size="small" class="section-card">
      <template #extra>
        <a-tag color="blue">POST /ai/generate-comment</a-tag>
      </template>

      <a-textarea
        v-model:value="aiStore.commentInput"
        :rows="3"
        placeholder="粘贴一条推文/帖子原文，AI 将根据语言生成自然评论"
        :disabled="aiStore.generating"
      />

      <div class="action-row">
        <a-space>
          <a-button
            type="primary"
            :loading="aiStore.generating"
            :disabled="!canGenerate"
            @click="handleGenerate"
          >
            <template #icon><MessageOutlined /></template>
            生成评论
          </a-button>

          <a-button
            v-if="aiStore.commentResult || aiStore.commentError"
            @click="handleResetComment"
          >
            清空结果
          </a-button>

          <a-tag v-if="aiStore.generating" color="processing" class="elapsed-tag">
            正在生成（{{ commentElapsed }}s）...
          </a-tag>
        </a-space>

        <span v-if="aiStore.generating" class="hint-text">
          32B 思考模型可能耗时 3~10 分钟，请耐心等待
        </span>
      </div>

      <a-alert
        v-if="aiStore.commentError"
        type="error"
        show-icon
        :message="`生成失败：${aiStore.commentError}`"
        class="error-alert"
        closable
        @close="aiStore.commentError = null"
      />

      <a-card
        v-if="aiStore.commentResult"
        size="small"
        class="comment-result-card"
        :class="{ 'is-fallback': aiStore.commentResult.fallbackToEmoji }"
      >
        <template #title>
          <span>
            <SmileOutlined v-if="aiStore.commentResult.fallbackToEmoji" />
            <CheckCircleOutlined v-else style="color: #52c41a" />
            生成结果
            <a-tag :color="aiStore.commentResult.fallbackToEmoji ? 'warning' : 'success'" class="ml-8">
              {{ aiStore.commentResult.fallbackToEmoji ? 'Emoji 兜底' : '正常生成' }}
            </a-tag>
            <a-tag class="ml-8">语言: {{ aiStore.commentResult.language.name }}</a-tag>
            <a-tag class="ml-8">重试 {{ aiStore.commentResult.retries }} 次</a-tag>
          </span>
        </template>

        <template #extra>
          <a-button size="small" @click="copyComment">
            <template #icon><CopyOutlined /></template>
            复制
          </a-button>
        </template>

        <div class="comment-text">{{ aiStore.commentResult.comment }}</div>

        <a-collapse v-if="aiStore.commentResult.rawOutput" class="extras" ghost>
          <a-collapse-panel key="raw" header="AI 原始输出">
            <pre class="raw-output">{{ aiStore.commentResult.rawOutput }}</pre>
          </a-collapse-panel>
        </a-collapse>
      </a-card>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  ThunderboltOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  SmileOutlined,
  CopyOutlined
} from '@ant-design/icons-vue'

import OllamaStatusBar from '../../components/ai/OllamaStatusBar.vue'
import TaskPlanCard from '../../components/ai/TaskPlanCard.vue'
import {
  aiStore,
  resetParseState,
  resetCommentState,
  clonePlanForEdit
} from '../../stores/ai'
import { parseCommand, generateComment } from '../../api/ai'
import type { TaskPlan } from '../../../shared/automation/task-types'

// ==================== 计时器（显示已耗时） ====================
const tick = ref(0)
const timer = setInterval(() => tick.value++, 1000)
onUnmounted(() => clearInterval(timer))

const parseElapsed = computed(() => {
  if (!aiStore.parsing || !aiStore.parseStartedAt) return 0
  void tick.value
  return Math.floor((Date.now() - aiStore.parseStartedAt) / 1000)
})

const commentElapsed = computed(() => {
  if (!aiStore.generating || !aiStore.commentStartedAt) return 0
  void tick.value
  return Math.floor((Date.now() - aiStore.commentStartedAt) / 1000)
})

// ==================== 按钮可用性 ====================
const canParse = computed(() => {
  return (
    aiStore.commandInput.trim().length > 0 &&
    aiStore.health?.online === true &&
    aiStore.health?.defaultModelInstalled === true
  )
})

const canGenerate = computed(() => {
  return (
    aiStore.commentInput.trim().length > 0 &&
    aiStore.health?.online === true &&
    aiStore.health?.defaultModelInstalled === true
  )
})

// ==================== 解析指令 ====================
async function handleParse() {
  const cmd = aiStore.commandInput.trim()
  if (!cmd) return

  resetParseState()
  aiStore.parsing = true
  aiStore.parseStartedAt = Date.now()

  try {
    const result = await parseCommand(cmd)
    aiStore.parseResult = result
    aiStore.editedPlan = clonePlanForEdit(result.plan)
    message.success(`解析成功（${Math.floor((Date.now() - aiStore.parseStartedAt) / 1000)}s, 重试 ${result.retries} 次）`)
  } catch (err: any) {
    aiStore.parseError = err?.response?.data?.message || err?.message || String(err)
    message.error('解析失败，请查看错误信息')
  } finally {
    aiStore.parsing = false
  }
}

function handleResetParse() {
  resetParseState()
}

function handleResetPlan() {
  if (aiStore.parseResult) {
    aiStore.editedPlan = clonePlanForEdit(aiStore.parseResult.plan)
    message.info('已恢复原始 plan')
  }
}

function handleStart(plan: TaskPlan) {
  // 占位：迭代 3.5 接入实际执行
  console.log('[AIConsole] 启动任务（占位）:', plan)
  message.success('任务计划已确认（实际执行待迭代 3.5 落地）')
}

// ==================== 生成评论 ====================
async function handleGenerate() {
  const text = aiStore.commentInput.trim()
  if (!text) return

  resetCommentState()
  aiStore.generating = true
  aiStore.commentStartedAt = Date.now()

  try {
    const result = await generateComment(text)
    aiStore.commentResult = result
    if (result.fallbackToEmoji) {
      message.warning('AI 未能生成评论，已回退到 emoji')
    } else {
      message.success(`生成成功（${Math.floor((Date.now() - aiStore.commentStartedAt) / 1000)}s）`)
    }
  } catch (err: any) {
    aiStore.commentError = err?.response?.data?.message || err?.message || String(err)
    message.error('生成失败，请查看错误信息')
  } finally {
    aiStore.generating = false
  }
}

function handleResetComment() {
  resetCommentState()
}

async function copyComment() {
  if (!aiStore.commentResult?.comment) return
  try {
    await navigator.clipboard.writeText(aiStore.commentResult.comment)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}
</script>

<style scoped>
.ai-console {
  max-width: 1100px;
  margin: 0 auto;
}

.page-header {
  padding: 0 0 16px 0;
}

.section-card {
  margin-top: 16px;
}

.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.elapsed-tag {
  font-variant-numeric: tabular-nums;
}

.hint-text {
  color: #8c8c8c;
  font-size: 12px;
}

.error-alert {
  margin-top: 12px;
}

.comment-result-card {
  margin-top: 16px;
}

.comment-result-card.is-fallback {
  border-color: #faad14;
}

.comment-text {
  font-size: 16px;
  line-height: 1.6;
  padding: 12px;
  background: #fafafa;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.raw-output {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.ml-8 {
  margin-left: 8px;
}

.extras {
  margin-top: 12px;
}
</style>
