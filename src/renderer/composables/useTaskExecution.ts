/**
 * 任务执行 composable（迭代 3.5）
 * 管理执行状态、进度轮询、Profile 选择
 */
import { ref, computed, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import { executeAITask, getTaskStatus, abortTask } from '../api/ai'
import { getProfileList, getProfilesStatus } from '../api/profile'
import type { TaskPlan, TaskProgress } from '../../shared/automation/task-types'

const STAGE_LABELS: Record<string, string> = {
  connecting: '连接中',
  navigating: '导航中',
  executing: '执行中',
  done: '已完成',
  paused: '已暂停',
  error: '出错'
}

export function useTaskExecution() {
  // 执行状态
  const executionTaskId = ref<string | null>(null)
  const executionRunning = ref(false)
  const executionStage = ref('')
  const executionProgress = ref<TaskProgress | null>(null)
  const executionLogs = ref<string[]>([])
  let statusPollTimer: ReturnType<typeof setInterval> | null = null

  // 启动弹窗
  const startModalVisible = ref(false)
  const starting = ref(false)
  const selectedProfileId = ref<number | null>(null)
  const loadingProfiles = ref(false)
  const runningProfiles = ref<any[]>([])

  const stageLabel = computed(() => STAGE_LABELS[executionStage.value] || executionStage.value)

  /** 打开启动弹窗 */
  async function openStartModal() {
    startModalVisible.value = true
    selectedProfileId.value = null
    loadingProfiles.value = true
    try {
      const profiles = await getProfileList()
      const status = await getProfilesStatus()
      const runningIds = new Set(status.runningIds || [])
      runningProfiles.value = profiles.filter((p: any) => runningIds.has(p.id))
    } catch {
      runningProfiles.value = []
    } finally {
      loadingProfiles.value = false
    }
  }

  /** 确认启动 */
  async function confirmStart(plan: TaskPlan) {
    if (!selectedProfileId.value) {
      message.warning('请选择一个正在运行的窗口')
      return
    }
    starting.value = true
    try {
      const res = await executeAITask(selectedProfileId.value, plan)
      executionTaskId.value = res.taskId
      executionRunning.value = true
      executionStage.value = 'connecting'
      executionProgress.value = null
      executionLogs.value = []
      startModalVisible.value = false
      message.success('任务已启动')
      startPolling(res.taskId)
    } catch (err: any) {
      message.error(`启动失败: ${err.message || err}`)
    } finally {
      starting.value = false
    }
  }

  /** 开始轮询状态 */
  function startPolling(taskId: string) {
    if (statusPollTimer) clearInterval(statusPollTimer)
    statusPollTimer = setInterval(async () => {
      try {
        const status = await getTaskStatus(taskId)
        if (status.progress) {
          executionProgress.value = status.progress
          executionStage.value = status.progress.stage || ''
        }
        if (status.logs) {
          executionLogs.value = status.logs
        }
        executionRunning.value = status.running
        if (!status.running) {
          stopPolling()
        }
      } catch {
        // 轮询失败静默
      }
    }, 2000)
  }

  function stopPolling() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer)
      statusPollTimer = null
    }
  }

  /** 中止任务 */
  async function handleAbort() {
    if (!executionTaskId.value) return
    try {
      await abortTask(executionTaskId.value)
      executionRunning.value = false
      message.info('已发送中止信号')
    } catch (err: any) {
      message.error(`中止失败: ${err.message || err}`)
    }
  }

  onUnmounted(() => stopPolling())

  return {
    executionTaskId,
    executionRunning,
    executionStage,
    executionProgress,
    executionLogs,
    stageLabel,
    startModalVisible,
    starting,
    selectedProfileId,
    loadingProfiles,
    runningProfiles,
    openStartModal,
    confirmStart,
    handleAbort
  }
}