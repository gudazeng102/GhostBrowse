<template>
  <a-card class="task-plan-card" size="small">
    <template #title>
      <div class="card-title">
        <CheckCircleOutlined class="title-icon" />
        <span>解析后的任务计划</span>
        <a-tag v-if="warnings && warnings.length" color="warning" class="warning-tag">
          {{ warnings.length }} 条警告
        </a-tag>
        <a-tag color="default" class="retries-tag">重试 {{ retries }} 次</a-tag>
      </div>
    </template>

    <template #extra>
      <a-space>
        <a-button size="small" @click="emit('reset')">重置</a-button>
        <a-button size="small" type="primary" @click="handleStart">
          <template #icon><PlayCircleOutlined /></template>
          启动
        </a-button>
      </a-space>
    </template>

    <a-descriptions :column="2" size="small" bordered>
      <a-descriptions-item label="任务行为">
        <a-select v-model:value="local.action" size="small" style="width: 200px">
          <a-select-option value="targeted_interaction">定向互动</a-select-option>
          <a-select-option value="home_warming">首页养号</a-select-option>
          <a-select-option value="following_warming">关注页养号</a-select-option>
          <a-select-option value="custom">自定义</a-select-option>
        </a-select>
      </a-descriptions-item>

      <a-descriptions-item label="平台">
        <a-tag color="blue">{{ local.platform || 'twitter' }}</a-tag>
      </a-descriptions-item>

      <a-descriptions-item label="目标账号" :span="2">
        <a-select
          v-model:value="local.target_accounts"
          mode="tags"
          size="small"
          style="width: 100%"
          placeholder="支持多选；输入用户名后回车添加（无需 @）"
        />
      </a-descriptions-item>

      <a-descriptions-item label="操作类型" :span="2">
        <a-checkbox-group v-model:value="local.operations">
          <a-checkbox value="view">浏览</a-checkbox>
          <a-checkbox value="like">点赞</a-checkbox>
          <a-checkbox value="retweet">转发</a-checkbox>
          <a-checkbox value="comment">评论</a-checkbox>
          <a-checkbox value="follow">关注</a-checkbox>
          <a-checkbox value="subscribe">订阅</a-checkbox>
          <a-checkbox value="upvote">点赞(其它平台)</a-checkbox>
        </a-checkbox-group>
      </a-descriptions-item>

      <a-descriptions-item label="浏览数量">
        <a-input-number
          v-model:value="local.constraints.view_count"
          :min="0"
          :max="200"
          size="small"
          style="width: 100%"
        />
      </a-descriptions-item>

      <a-descriptions-item label="点赞数量">
        <a-input-number
          v-model:value="local.constraints.like_count"
          :min="0"
          :max="200"
          size="small"
          style="width: 100%"
        />
      </a-descriptions-item>

      <a-descriptions-item label="是否随机选择">
        <a-switch v-model:checked="local.constraints.selective" size="small" />
        <span class="hint">{{ local.constraints.selective ? '随机' : '顺序' }}</span>
      </a-descriptions-item>

      <a-descriptions-item label="持续时间(分钟)">
        <a-input-number
          v-model:value="local.duration_minutes"
          :min="0"
          :max="1440"
          size="small"
          style="width: 100%"
        />
        <span class="hint">0=按数量执行</span>
      </a-descriptions-item>

      <a-descriptions-item label="位置计划" :span="2">
        <a-input
          v-model:value="local.constraints.position_plan"
          size="small"
          placeholder="例如 1-5:like;6-7:comment（可选，留空则按 view_count/like_count）"
        />
      </a-descriptions-item>

      <a-descriptions-item label="完成后暂停" :span="2">
        <a-switch v-model:checked="local.pause_after" size="small" />
      </a-descriptions-item>

      <a-descriptions-item v-if="local.raw_command" label="原始指令" :span="2">
        <span class="raw-command">{{ local.raw_command }}</span>
      </a-descriptions-item>
    </a-descriptions>

    <a-collapse v-if="warnings?.length || rawOutput" class="extras" ghost>
      <a-collapse-panel v-if="warnings?.length" key="warnings" header="警告详情">
        <ul class="warning-list">
          <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
        </ul>
      </a-collapse-panel>
      <a-collapse-panel v-if="rawOutput" key="raw" header="AI 原始输出">
        <pre class="raw-output">{{ rawOutput }}</pre>
      </a-collapse-panel>
      <a-collapse-panel key="json" header="当前 plan JSON（编辑后）">
        <pre class="raw-output">{{ JSON.stringify(local, null, 2) }}</pre>
      </a-collapse-panel>
    </a-collapse>
  </a-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Modal } from 'ant-design-vue'
import { CheckCircleOutlined, PlayCircleOutlined } from '@ant-design/icons-vue'
import type { TaskPlan } from '../../../shared/automation/task-types'

const props = defineProps<{
  plan: TaskPlan
  warnings?: string[]
  rawOutput?: string
  retries?: number
}>()

const emit = defineEmits<{
  (e: 'update:plan', plan: TaskPlan): void
  (e: 'reset'): void
  (e: 'start', plan: TaskPlan): void
}>()

// 双向绑定 wrapper：直接编辑 props.plan 避免不必要的克隆
const local = computed({
  get: () => props.plan,
  set: (v) => emit('update:plan', v)
})

function handleStart() {
  Modal.info({
    title: '启动任务',
    content: '执行能力将在迭代 3.5（浏览器扩展层）落地。当前已可保存/编辑 plan，点击"确定"以模拟启动。',
    okText: '我知道了',
    onOk: () => emit('start', local.value)
  })
}
</script>

<style scoped>
.task-plan-card {
  margin-top: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  color: #52c41a;
  font-size: 16px;
}

.warning-tag,
.retries-tag {
  margin-left: 4px;
  font-size: 12px;
}

.hint {
  margin-left: 8px;
  color: #8c8c8c;
  font-size: 12px;
}

.raw-command {
  font-family: 'SF Mono', Consolas, monospace;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.extras {
  margin-top: 16px;
}

.warning-list {
  margin: 0;
  padding-left: 20px;
  color: #faad14;
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
</style>