<template>
  <div class="extraction-console">
    <a-page-header title="📊 数据采集" sub-title="迭代 5.1 — 采集推文/用户/话题数据" />

    <a-card size="small" class="section-card">
      <template #title>
        <span>🆕 新建采集任务</span>
      </template>
      <a-space direction="vertical" style="width:100%">
        <!-- 第一行：类型选择 + 热搜 -->
        <a-space wrap>
          <a-select v-model:value="targetType" style="width:300px" placeholder="选择采集类型">
            <a-select-option value="tweet">📖 指定账号的推文</a-select-option>
            <a-select-option value="hashtag_tweets"># 话题推文</a-select-option>
            <a-select-option value="user_profile">👤 用户信息</a-select-option>
            <a-select-option value="following">👥 指定用户关注用户</a-select-option>
          </a-select>
          <!-- 热搜话题获取 -->
          <a-button v-if="targetType === 'hashtag_tweets'" @click="handleFetchTrending" :loading="trendingLoading">
            <template #icon><FireOutlined /></template>获取热搜
          </a-button>
          <a-select
            v-if="targetType === 'hashtag_tweets' && trendingItems.length"
            v-model:value="selectedTrendingTopic"
            style="width:280px"
            placeholder="选择一个热搜话题"
            @change="onTrendingSelect"
          >
            <a-select-option v-for="item in trendingItems" :key="item.name" :value="item.name">
              #{{ item.rank }} {{ item.name }} <span style="color:#999;font-size:11px">{{ item.tweetCount }}</span>
            </a-select-option>
          </a-select>
        </a-space>

        <!-- 第二行：目标输入 + 条数（话题/推文时并排） -->
        <a-space wrap>
          <!-- 迭代 6.2: API 模式开关（仅关注列表可用） -->
          <a-switch v-if="targetType === 'following'" v-model:checked="apiMode" checked-children="API 采集" un-checked-children="浏览器采集" style="margin-bottom:8px" />

          <!-- 迭代 5.4: 用户信息用大输入框，支持逗号分隔 -->
          <a-textarea
            v-if="targetType === 'user_profile'"
            v-model:value="target"
            :rows="4"
            placeholder="多个账号用逗号或换行隔开，例如：@elonmusk\n@jack\n@sundarpichai"
            style="width:500px"
          />
          <a-input
            v-if="targetType !== 'user_profile'"
            v-model:value="target"
            :placeholder="targetType === 'following' ? '输入要采集关注列表的账号，例如：@elonmusk' : '目标（@用户名 / #话题）'"
            style="width:400px"
          />

          <!-- 用户信息 和 关注列表不需要条数，推文/话题才需要 -->
          <template v-if="targetType === 'tweet' || targetType === 'hashtag_tweets'">
            <a-input-number v-model:value="maxCount" :min="1" :max="500" style="width:120px" />
            <span>条</span>
          </template>


        </a-space>

        <a-divider style="font-size:12px;margin:8px 0">采集后自动操作（可选）</a-divider>
        <a-space wrap>
          <a-checkbox v-model:checked="followUpOps.like">点赞</a-checkbox>
          <a-checkbox v-model:checked="followUpOps.retweet">转发</a-checkbox>
          <a-checkbox v-model:checked="followUpOps.comment">评论</a-checkbox>
          <span style="margin-left:4px">前</span>
          <a-input-number v-model:value="followUpCount" :min="0" :max="100" style="width:80px" />
          <span>条</span>
                    <!-- 下发按钮（跟随在条数右侧） -->
          <a-button type="primary" @click="handleEnqueue" :loading="sending">
            <template #icon><SendOutlined /></template>下发到所有运行中的窗口
          </a-button>
        </a-space>
        <a-textarea v-if="followUpOps.comment" v-model:value="followUpComment" :rows="1" placeholder="评论内容（留空则 AI 生成）" style="width:400px" />
      </a-space>
    </a-card>

    <!-- ==================== AI 热点分析（常驻显示） ==================== -->
    <a-card v-if="targetType === 'hashtag_tweets'" size="small" class="section-card">
      <template #title>
        <span>🤖 AI 热点分析</span>
      </template>
      <a-space direction="vertical" style="width:100%">
        <!-- 快捷指令 -->
        <div class="trend-quick-commands">
          <span style="font-size:12px;color:#888;margin-right:4px">快捷指令：</span>
          <a-tag
            v-for="cmd in trendQuickCommands"
            :key="cmd.label"
            color="blue"
            style="cursor:pointer;margin-bottom:4px"
            @click="applyQuickCommand(cmd)"
          >
            {{ cmd.label }}
          </a-tag>
        </div>
        <a-textarea
          v-model:value="trendInstruction"
          :rows="2"
          placeholder="可选：输入自定义分析指令（如：重点分析商业化角度）。留空则 AI 自动根据话题生成分析策略，例：分析 #AI 话题的热门推文，提取子话题、匹配语言、生成借势文案。"
          style="width:100%"
        />
        <a-space wrap>
          <a-button type="primary" @click="handleTrendAnalyze" :loading="trendLoading">
            <template #icon><BulbOutlined /></template>执行分析
          </a-button>
          <a-tag v-if="trendResult" color="blue">已分析 {{ trendResult.tweetCount }} 条推文，耗时 {{ (trendResult.aiDurationMs / 1000).toFixed(1) }}s</a-tag>
        </a-space>

        <!-- 分析结果 -->
        <template v-if="trendResult && trendResult.success">
          <a-divider style="font-size:12px;margin:8px 0">🔥 热点分析结果</a-divider>
          <div class="trend-hotspots">
            <div v-for="(hotspot, idx) in trendResult.hotspots" :key="idx" class="trend-hotspot-card">
              <div class="trend-hotspot-header">
                <span class="trend-hotspot-num">#{{ idx + 1 }}</span>
                <span class="trend-hotspot-title">{{ hotspot.topic }}</span>
                <a-tag :color="hotspot.lifecycle === 'rising' ? 'green' : (hotspot.lifecycle === 'peak' ? 'orange' : 'gray')">
                  {{ hotspot.lifecycle === 'rising' ? '📈 上升' : (hotspot.lifecycle === 'peak' ? '📊 高峰' : '📉 冷却') }}
                </a-tag>
              </div>
              <div class="trend-hotspot-meta">
                <span :class="riskClass(hotspot.risk)">风险: {{ riskLabel(hotspot.risk) }}</span>
                <span>匹配度: <strong>{{ hotspot.matchScore }}%</strong></span>
                <span v-if="trendResult.riskResults[idx]" :class="trendResult.riskResults[idx].overridden ? 'risk-overridden' : ''">
                  {{ trendResult.riskResults[idx].overridden ? '⚡ 规则引擎覆盖' : '' }}
                </span>
              </div>
              <div v-if="trendResult.riskResults[idx] && trendResult.riskResults[idx].matchedRules.length" class="trend-rule-hits">
                <span v-for="ruleId in trendResult.riskResults[idx].matchedRules" :key="ruleId" class="trend-rule-tag">{{ ruleId }}</span>
              </div>
            </div>
          </div>
          <div class="trend-strategy">
            <strong>📋 推荐策略：</strong>
            <span>去 <template v-if="trendResult.selectedStrategy.targetAccountName">{{ trendResult.selectedStrategy.targetAccountName }} </template><code v-if="trendResult.selectedStrategy.targetAccountHandle">@{{ trendResult.selectedStrategy.targetAccountHandle }}</code><code v-else>{{ trendResult.selectedStrategy.targetAccount }}</code> 的推文下执行 <strong>{{ actionLabel(trendResult.selectedStrategy.action) }}</strong></span>
            <br/>
            <a-alert v-if="trendResult.selectedStrategy.targetAccountWarning" :message="trendResult.selectedStrategy.targetAccountWarning" type="warning" show-icon banner style="font-size:12px;margin-top:4px" />
            <br/>
            <span class="trend-reason">{{ trendResult.selectedStrategy.reason }}</span>
          </div>
          <div class="trend-contents">
            <div
              v-for="(content, idx) in trendResult.contents"
              :key="idx"
              class="trend-content-card"
              :class="{ 'trend-content-selected': selectedContentIdx === idx }"
              @click="selectedContentIdx = idx"
            >
              <div class="trend-content-header">
                <a-radio :checked="selectedContentIdx === idx" @click.stop="selectedContentIdx = idx">文案 {{ idx + 1 }}</a-radio>
              </div>
              <div class="trend-content-text">{{ content }}</div>
            </div>
          </div>
          <a-space style="margin-top:12px">
            <a-button
              type="primary"
              size="large"
              :disabled="!canExecuteTrend"
              :danger="trendExecuteState === 'warning'"
              @click="handleTrendExecute"
            >
              <template #icon><SendOutlined /></template>
              {{ trendExecuteButtonText }}
            </a-button>
            <span v-if="trendHint" class="trend-hint">{{ trendHint }}</span>
          </a-space>
        </template>

        <!-- 错误提示 -->
        <a-alert
          v-if="trendResult && !trendResult.success"
          :message="trendResult.error || '分析失败'"
          type="error"
          show-icon
          closable
          style="margin-top:8px"
        />
      </a-space>

      <!-- 快捷指令确认弹窗 -->
      <a-modal
        v-model:visible="trendConfirmVisible"
        title="快捷指令"
        @ok="handleTrendConfirmOk"
        @cancel="handleTrendConfirmCancel"
        ok-text="是，执行分析"
        cancel-text="否，仅输入指令"
      >
        <p>已输入指令「<strong>{{ pendingCommand?.label }}</strong>」，是否立即执行分析？</p>
      </a-modal>

      <!-- 中风险确认弹窗 -->
      <a-modal
        v-model:visible="riskConfirmVisible"
        title="中风险提示"
        @ok="handleRiskConfirmOk"
        @cancel="handleRiskConfirmCancel"
        ok-text="确认执行"
        cancel-text="取消"
        :confirm-loading="trendLoading"
      >
        <p>该策略存在<strong style="color:#faad14">中风险</strong>，确认继续执行？</p>
      </a-modal>
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
              <a-col :span="8"><a-statistic title="进度" :value="`${runProg(rawId)?.processed || 0}`" /></a-col>
              <a-col :span="5"><a-statistic title="采集" :value="runProg(rawId)?.collected || 0" /></a-col>
            </a-row>
            <a-progress v-if="runProg(rawId)?.total && runProg(rawId)!.total < 1000" :percent="Math.round((runProg(rawId)!.processed / runProg(rawId)!.total) * 100)" status="active" size="small" class="progress-bar" />
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

    <!-- API 采集进度 -->
    <a-card v-if="collectProgress" size="small" class="section-card">
      <template #title>
        <span>🔬 API 采集进度</span>
        <a-tag :color="collectProgress.stage === 'done' ? 'green' : (collectProgress.stage === 'error' ? 'red' : 'processing')" style="margin-left:8px">
          {{ collectProgress.stage === 'done' ? '完成' : (collectProgress.stage === 'error' ? '失败' : '执行中') }}
        </a-tag>
      </template>
      <a-space direction="vertical" style="width:100%">
        <a-row :gutter="8" v-if="collectProgress.stage !== 'fetching_following'">
          <a-col :span="6"><a-statistic title="关注总数" :value="collectProgress.totalFound" /></a-col>
          <a-col :span="6"><a-statistic title="已查详情" :value="collectProgress.detailsQueried" /></a-col>
          <a-col :span="6"><a-statistic title="详情总数" :value="collectProgress.detailsTotal" /></a-col>
          <a-col :span="6"><a-statistic title="已入库" :value="collectProgress.inserted" /></a-col>
        </a-row>
        <a-progress v-if="collectProgress.detailsTotal > 0" :percent="Math.round((collectProgress.detailsQueried / collectProgress.detailsTotal) * 100)" size="small" />
        <div class="logs-box-small" style="max-height:150px">
          <div v-for="(log, i) in collectProgress.logs" :key="i" class="log-line" :class="'log-' + log.type">
            [{{ log.time }}] {{ log.msg }}
          </div>
        </div>
        <div class="collect-note">⚠️ X 页面显示的关注数可能高于实际采集数，差额通常为已注销/冻结/私密的账号，属于正常现象</div>
        <a-space v-if="collectProgress.stage === 'done'" style="margin-top:8px">
          <a-button :href="getApiCsvUrl(collectProgress.taskId)" target="_blank" type="primary" ghost>
            📥 API 采集用户数据导出
          </a-button>
        </a-space>
      </a-space>
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
import { SendOutlined, StopOutlined, BulbOutlined, FireOutlined } from '@ant-design/icons-vue'
import { enqueueExtraction, getExtractionResults, getExtractionCsvUrl } from '../../api/extraction'
import { fullCollect, getCollectProgress, getApiCsvUrl } from '../../api/x-graphql'
import { getPoolStatus, getTaskQueue, abortTaskRun, getTaskHistory } from '../../api/task-queue'
import type { PoolEntry, TaskRun } from '../../api/task-queue'
import { analyzeTrend as trendAnalyzeApi } from '../../api/trend-radar'
import type { TrendAnalysisResult } from '../../../shared/ai/trend-radar-types'
import { batchEnqueueTasks } from '../../api/task-queue'
import { scrapeTrending as trendingApi } from '../../api/trending'
import type { TrendingItem } from '../../api/trending'

const targetType = ref('tweet')
const target = ref('')
const maxCount = ref(50)
const sending = ref(false)
const apiMode = ref(false)

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
    if (targetType.value === 'following' && apiMode.value) {
      const cleanTarget = target.value.replace(/^@/, '').trim()
      const firstProfileId = runningIds[0]
      if (!firstProfileId) { antMessage.warning('没有活跃的窗口'); return }

      const { taskId } = await fullCollect(cleanTarget, firstProfileId)
      antMessage.success(`✅ API 采集已启动，任务 ID: ${taskId}，可在进度面板中查看实时状态`)

      // 启动进度轮询
      startProgressPolling(taskId)
    } else {
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
    }
  } catch (e: any) {
    antMessage.error(e.message || '下发失败')
  } finally {
    sending.value = false
  }
}

// ==================== Trend Radar 状态 ====================

interface QuickCommand {
  label: string
  instruction: string
}

/** 快捷指令列表 */
const trendQuickCommands: QuickCommand[] = [
  { label: '🌐 英文借势评论', instruction: '分析当前热点，生成 3 条英文借势评论，语气偏技术讨论，不生硬广告，适配 Twitter 280 字符限制' },
  { label: '🇯🇵 日语圈热点', instruction: '重点分析日本地区的热点趋势，用日语生成 3 条借势文案，语气自然贴合日本用户习惯' },
  { label: '🛒 商业化角度', instruction: '从商业化/变现角度分析热点，评估哪些话题适合带货推广，生成带有行动号召的文案' },
  { label: '🛡️ 规避风险', instruction: '优先识别政治/种族/品牌负面风险，高风险话题直接标注禁止，只推荐安全的中低风险策略' },
  { label: '📊 行业趋势洞察', instruction: '不关注具体的借势文案，而是分析这些热点反映的行业长期趋势，输出 200 字以内的趋势总结' },
  { label: '🎯 账号定位匹配', instruction: '根据技术博主定位筛选最相关热点，生成专业深度的技术讨论型评论' },
]

function applyQuickCommand(cmd: QuickCommand) {
  trendInstruction.value = cmd.instruction
  // 打开 Ant Design Modal 询问是否执行分析
  pendingCommand.value = cmd
  trendConfirmVisible.value = true
}

/** 快捷指令确认弹窗状态 */
const trendConfirmVisible = ref(false)
const pendingCommand = ref<QuickCommand | null>(null)

function handleTrendConfirmOk() {
  trendConfirmVisible.value = false
  pendingCommand.value = null
  // 延迟一下让 UI 更新
  setTimeout(() => handleTrendAnalyze(), 100)
}

function handleTrendConfirmCancel() {
  trendConfirmVisible.value = false
  pendingCommand.value = null
}

/** 中风险确认弹窗状态 */
const riskConfirmVisible = ref(false)
let riskResolve: ((value: boolean) => void) | null = null

function handleRiskConfirmOk() {
  riskConfirmVisible.value = false
  if (riskResolve) {
    riskResolve(true)
    riskResolve = null
  }
}

function handleRiskConfirmCancel() {
  riskConfirmVisible.value = false
  if (riskResolve) {
    riskResolve(false)
    riskResolve = null
  }
}

const trendActiveKey = ref<string[]>([])
const trendEnabled = ref(false)
const trendInstruction = ref('')
const trendLoading = ref(false)
const trendResult = ref<TrendAnalysisResult | null>(null)
const selectedContentIdx = ref(0)
let trendLastClickTime = 0  // 防抖：3s 内不可重复点击

// 热搜话题
const trendingLoading = ref(false)
const trendingItems = ref<TrendingItem[]>([])
const selectedTrendingTopic = ref<string | undefined>(undefined)

async function handleFetchTrending() {
  antMessage.info('正在获取热搜中，请稍后')
  const pool = await getPoolStatus()
  const runningEntry = Object.entries(pool).find(([_, entry]) => entry.status === 'running' || entry.status === 'pending' || entry.status === 'idle')
  if (!runningEntry) {
    antMessage.warning('没有活跃的窗口，请先启动一个浏览器窗口')
    return
  }
  const profileId = Number(runningEntry[0])
  trendingLoading.value = true
  trendingItems.value = []
  try {
    const items = await trendingApi(profileId)
    trendingItems.value = items
    if (items.length === 0) {
      antMessage.warning('未获取到热搜话题，请确认窗口已登录 X')
    } else {
      antMessage.success(`获取到 ${items.length} 个热搜话题`)
    }
  } catch (e: any) {
    antMessage.error('获取热搜失败: ' + (e.message || ''))
  } finally {
    trendingLoading.value = false
  }
}

function onTrendingSelect(topic: string) {
  // 将选中的热搜话题填入 target 输入框
  target.value = `#${topic}`
  antMessage.info(`已选择 #${topic}，请先采集数据再分析`)
}

const trendExecuteState = computed(() => {
  if (!trendResult.value?.success || !trendResult.value.riskResults.length) return 'disabled'
  const first = trendResult.value.riskResults[0]
  return first.buttonState
})

const canExecuteTrend = computed(() => {
  if (!trendResult.value?.success) return false
  return trendResult.value.riskResults.some(r => r.allowed)
})

const trendExecuteButtonText = computed(() => {
  if (trendExecuteState.value === 'disabled') return '高风险，禁止执行'
  if (trendExecuteState.value === 'warning') return '⚠ 确认并下发到所有窗口'
  return '确认并下发到所有运行中的窗口'
})

const trendHint = computed(() => {
  if (!trendResult.value?.success || !trendResult.value.riskResults.length) return ''
  return trendResult.value.riskResults[0].hint
})

function riskClass(risk: string): string {
  if (risk === 'high') return 'risk-high'
  if (risk === 'medium') return 'risk-medium'
  return 'risk-low'
}

function riskLabel(risk: string): string {
  if (risk === 'high') return '高 ⚠️'
  if (risk === 'medium') return '中'
  return '低 ✅'
}

function actionLabel(action: string): string {
  if (action === 'comment') return '评论'
  if (action === 'retweet') return '转发'
  return '原创'
}

async function handleTrendAnalyze() {
  // 防抖：3s 内不可重复点击
  const now = Date.now()
  if (now - trendLastClickTime < 3000) {
    antMessage.warning('请等待 3 秒后再试')
    return
  }
  trendLastClickTime = now

  const topic = target.value.replace(/^#/, '').trim()
  if (!topic) { antMessage.warning('请先输入 #话题'); return }

  // 提示用户先采集数据（即使没有采集过也能分析，但结果可能空）
  const pool = await getPoolStatus()
  const hasWindow = Object.values(pool).some((e: any) => e.status === 'running' || e.status === 'pending' || e.status === 'idle')
  if (!hasWindow) {
    antMessage.warning('没有运行中的浏览器窗口，数据采集需要先启动窗口')
  }

  trendLoading.value = true
  trendResult.value = null
  selectedContentIdx.value = 0
  try {
    const result = await trendAnalyzeApi({
      topic,
      userInstruction: trendInstruction.value,
      accountPersona: '通用账号',
      maxCount: maxCount.value
    })
    trendResult.value = result
    if (!result.success) {
      antMessage.error(result.error || '分析失败')
    } else {
      if (result.tweetCount === 0) {
        antMessage.warning(`未找到 "#${topic}" 的采集数据，请先采集话题推文再分析`)
      } else {
        antMessage.success(`热点分析完成，基于 ${result.tweetCount} 条推文，发现 ${result.hotspots.length} 个热点`)
      }
    }
  } catch (e: any) {
    antMessage.error(e.message || '分析请求失败')
  } finally {
    trendLoading.value = false
  }
}

async function handleTrendExecute() {
  if (!trendResult.value?.success) return
  if (!canExecuteTrend.value) { antMessage.warning('当前策略存在高风险，禁止自动执行'); return }

  // 如果中风险，弹窗二次确认
  if (trendExecuteState.value === 'warning') {
    const confirmed = await new Promise<boolean>(resolve => {
      antMessage.warning('中风险策略，请人工确认是否继续执行', 5)
      // 用简单的 confirm 弹窗
      setTimeout(() => resolve(window.confirm('⚠️ 该策略存在中风险，确认继续执行？')), 500)
    })
    if (!confirmed) return
  }

  // 获取活跃窗口
  const pool = await getPoolStatus()
  const runningIds = Object.entries(pool)
    .filter(([_, entry]) => entry.status === 'running' || entry.status === 'pending' || entry.status === 'idle')
    .map(([id]) => Number(id))
  if (runningIds.length === 0) { antMessage.warning('没有活跃的窗口'); return }

  // 根据策略构建任务
  const selectedContent = trendResult.value.contents[selectedContentIdx.value] || trendResult.value.contents[0]
  const strategy = trendResult.value.selectedStrategy

  // 原创策略：导航到发推页面，填入文案，让用户手动发布
  if (strategy.action === 'original') {
    const firstEntry = Object.entries(pool).find(([_, entry]) => entry.status === 'running' || entry.status === 'pending' || entry.status === 'idle')
    if (!firstEntry) { antMessage.warning('没有活跃的窗口'); return }
    const profileId = Number(firstEntry[0])
    try {
      // 用第一个窗口打开发推页并填入文案
      const { navigateCompose } = await import('../../api/trend-radar')
      await navigateCompose(profileId, selectedContent)
      antMessage.success('已打开发推页面，请检查文案后手动发布')
    } catch (e: any) {
      antMessage.error('跳转失败: ' + (e.message || ''))
    }
    return
  }

  // 评论/转发策略：导航到目标账号推文下执行互动
  if (strategy.action === 'comment' || strategy.action === 'retweet') {
    // 优先使用清洗后的 handle，只取第一个有效单词（过滤掉 AI 输出的 // 显示名 等杂质）
    const rawAccount = (strategy.targetAccountHandle || strategy.targetAccount).replace(/^@/, '').trim()
    const targetAccount = rawAccount.split(/[\s\/]+/)[0].trim()
    try {
      // 使用 batchEnqueueTasks 下发 targeted_interaction 任务到所有窗口
      // 任务会导航到目标账号的主页，对其推文执行评论/转发操作
      // 注意：评论内容当前由 AI 在执行时自动生成，暂不支持注入固定文案
      const plan = {
        action: 'targeted_interaction' as const,
        target_accounts: [targetAccount],
        operations: [strategy.action as 'comment' | 'retweet'],
        constraints: { view_count: 1, like_count: 0, selective: false },
        duration_minutes: 0,
        pause_after: false,
        platform: 'twitter',
        presetCommentText: selectedContent
      }
      const tasks = await batchEnqueueTasks({ profileIds: runningIds, plan })
      antMessage.success(`已向 ${tasks.length} 个窗口下发 ${actionLabel(strategy.action)} 任务`)
    } catch (e: any) {
      antMessage.error('下发失败: ' + (e.message || ''))
    }
  } else {
    // 原创模式：跳转到发布页面
    antMessage.info('原创模式请使用"联动发布"功能创建推文')
  }
}

// ==================== 原有状态 ====================

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

// ==================== API 采集进度轮询 ====================

/** 当前 API 采集进度 */
const collectProgress = ref<{
  taskId: string
  stage: string
  totalFound: number
  detailsQueried: number
  detailsTotal: number
  inserted: number
  logs: { time: string; msg: string; type: string }[]
  error?: string
} | null>(null)

/** 启动进度轮询（每秒查一次） */
let collectTimer: ReturnType<typeof setInterval> | null = null

async function startProgressPolling(taskId: string) {
  collectTimer = setInterval(async () => {
    try {
      const p = await getCollectProgress(taskId)
      collectProgress.value = p
      if (p.stage === 'done' || p.stage === 'error') {
        if (collectTimer) { clearInterval(collectTimer); collectTimer = null }
        // 完成后刷新下拉结果列表
        await refreshCompletedRuns()
      }
    } catch {}
  }, 2000)
}

onUnmounted(() => {
  if (collectTimer) clearInterval(collectTimer)
})

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
.collect-note { color: #ff4d4f; font-size: 12px; margin-top: 8px; padding: 4px 8px; background: #fff2f0; border-radius: 4px; }

/* ==================== Trend Radar 样式 ==================== */
.trend-hotspots { display: flex; flex-direction: column; gap: 8px; }
.trend-hotspot-card { border: 1px solid #e8e8e8; border-radius: 6px; padding: 8px 12px; background: #fafafa; }
.trend-hotspot-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.trend-hotspot-num { font-weight: 700; color: #1890ff; font-size: 14px; }
.trend-hotspot-title { flex: 1; font-weight: 600; font-size: 14px; }
.trend-hotspot-meta { display: flex; gap: 16px; font-size: 12px; color: #666; align-items: center; }
.risk-high { color: #ff4d4f; font-weight: 600; }
.risk-medium { color: #faad14; font-weight: 600; }
.risk-low { color: #52c41a; }
.risk-overridden { color: #ff4d4f; font-weight: 600; font-size: 11px; border: 1px solid #ff4d4f; border-radius: 3px; padding: 0 4px; }
.trend-rule-hits { margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.trend-rule-tag { font-size: 10px; background: #fff1f0; color: #ff4d4f; border: 1px solid #ffccc7; border-radius: 3px; padding: 0 4px; }
.trend-strategy { margin: 8px 0; padding: 8px 12px; background: #e6f7ff; border-radius: 6px; font-size: 13px; line-height: 1.6; }
.trend-strategy code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.trend-reason { color: #666; font-size: 12px; font-style: italic; }
.trend-contents { display: flex; flex-direction: column; gap: 8px; }
.trend-content-card { border: 1px solid #e8e8e8; border-radius: 6px; padding: 8px 12px; cursor: pointer; transition: all 0.2s; }
.trend-content-card:hover { border-color: #91d5ff; background: #f0faff; }
.trend-content-selected { border-color: #1890ff; background: #e6f7ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.15); }
.trend-content-header { margin-bottom: 4px; }
.trend-content-text { font-size: 13px; line-height: 1.5; color: #333; white-space: pre-wrap; word-break: break-word; }
.trend-hint { font-size: 12px; color: #999; }
</style>
