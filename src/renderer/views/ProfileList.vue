<template>
  <div class="profile-list-container">
    <div class="page-header">
      <h1 class="page-title">🖥️ 窗口配置</h1>
      <a-button type="primary" size="large" @click="handleCreateProfile">
        ➕ 新建窗口
      </a-button>
    </div>

    <a-card :bordered="false">
      <template #title>
        <span>窗口列表</span>
      </template>
      <template #extra>
        <a-space>
          <!-- 状态刷新按钮 -->
          <a-button @click="loadProfileStatus" :loading="statusLoading">
            🔄 刷新状态
          </a-button>
          
          <!-- Phase 1.4: 批量打开按钮 - 选中已停止的窗口时启用 -->
          <a-button 
            type="primary"
            :disabled="!canBatchStart"
            @click="handleBatchStart"
          >
            🚀 批量打开 ({{ selectedStoppedCount }})
          </a-button>
          
          <!-- Phase 1.4: 批量关闭按钮 - 选中运行中的窗口时启用 -->
          <a-button 
            danger
            :disabled="!canBatchClose"
            @click="handleBatchClose"
          >
            ⏹️ 批量关闭 ({{ selectedRunningCount }})
          </a-button>
          
          <!-- 批量删除按钮 -->
          <a-button 
            type="primary" 
            danger 
            :disabled="selectedRowKeys.length === 0"
            @click="handleBatchDelete"
          >
            🗑️ 批量删除 ({{ selectedRowKeys.length }})
          </a-button>
        </a-space>
      </template>

      <!-- a-table 开启 row-selection 多选功能 -->
      <a-table
        :columns="columns"
        :data-source="profileList"
        :loading="loading"
        :pagination="pagination"
        :row-selection="{ selectedRowKeys, onChange: onSelectChange }"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <!-- Phase 1.4: 状态列 -->
          <template v-if="column.key === 'status'">
            <a-tag :color="isRunning(record.id) ? 'success' : 'default'">
              {{ isRunning(record.id) ? '🟢 运行中' : '⚪ 已停止' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'webrtcMode'">
            <a-tag :color="getWebRtcColor(record.webrtcMode)">
              {{ record.webrtcMode }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'proxy'">
            <a-tag v-if="record.proxy" color="blue">
              {{ record.proxy.name }}
            </a-tag>
            <a-tag v-else color="default">无</a-tag>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              
              <!-- Phase 1.4: 根据状态显示不同按钮 -->
              <a-button 
                v-if="!isRunning(record.id)"
                type="primary"
                size="small"
                @click="handleLaunch(record)"
              >
                🚀 打开
              </a-button>
              <a-button 
                v-else
                danger
                size="small"
                @click="handleClose(record)"
              >
                ⏹️ 关闭
              </a-button>
              
              <a-popconfirm
                title="确定要删除这个窗口配置吗？"
                ok-text="确认"
                cancel-text="取消"
                @confirm="handleDelete(record)"
              >
                <a-button type="link" size="small" danger>
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { getProfileList, deleteProfile, launchProfile, getProfilesStatus, closeProfile, type ProfileRecord } from '../api/profile'

const router = useRouter()

// 表格列定义
const columns = [
  {
    title: 'ID',
    dataIndex: 'id',
    key: 'id',
    width: 80
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100
  },
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
    width: 200
  },
  {
    title: 'Chrome版本',
    dataIndex: 'chromeVersion',
    key: 'chromeVersion',
    width: 120
  },
  {
    title: 'WebRTC模式',
    dataIndex: 'webrtcMode',
    key: 'webrtcMode',
    width: 120
  },
  {
    title: '分辨率',
    dataIndex: 'screenResolution',
    key: 'screenResolution',
    width: 120
  },
  {
    title: '代理',
    key: 'proxy',
    width: 150
  },
  {
    title: '操作',
    key: 'action',
    width: 220,
    fixed: 'right'
  }
]

// 窗口列表数据
const profileList = ref<ProfileRecord[]>([])

// 加载状态
const loading = ref(false)

// 状态加载状态
const statusLoading = ref(false)

// 运行中的窗口 ID 列表
const runningIds = ref<number[]>([])

// 分页配置
const pagination = ref({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => `共 ${total} 条`
})

// 多选相关状态
const selectedRowKeys = ref<number[]>([])
const selectedRows = ref<ProfileRecord[]>([])

/**
 * 选中项变化回调
 */
function onSelectChange(keys: number[], rows: ProfileRecord[]) {
  selectedRowKeys.value = keys
  selectedRows.value = rows
}

/**
 * 检查指定窗口是否运行中
 */
function isRunning(profileId: number): boolean {
  return runningIds.value.includes(profileId)
}

// 获取 WebRTC 模式对应的颜色
function getWebRtcColor(mode: string): string {
  const colorMap: Record<string, string> = {
    forward: 'blue',
    replace: 'green',
    disable: 'red'
  }
  return colorMap[mode] || 'default'
}

// 表格变化处理
function handleTableChange(pag: any) {
  pagination.value.current = pag.current
  pagination.value.pageSize = pag.pageSize
  loadProfileList()
}

// 加载窗口列表
async function loadProfileList() {
  loading.value = true
  try {
    const list = await getProfileList()
    profileList.value = list
    pagination.value.total = list.length
  } catch (error) {
    console.error('加载窗口列表失败:', error)
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

// 加载窗口运行状态
async function loadProfileStatus() {
  statusLoading.value = true
  try {
    const status = await getProfilesStatus()
    runningIds.value = status.runningIds || []
    console.log('[ProfileList] 状态已刷新，运行中:', runningIds.value)
  } catch (error) {
    console.error('加载窗口状态失败:', error)
  } finally {
    statusLoading.value = false
  }
}

// 新建窗口
function handleCreateProfile() {
  router.push('/profile/new')
}

// 编辑窗口
function handleEdit(record: ProfileRecord) {
  router.push({ path: '/profile/edit', query: { id: String(record.id) } })
}

// 启动窗口
async function handleLaunch(record: ProfileRecord) {
  try {
    const result = await launchProfile(record.id)
    message.success(`窗口已启动，PID: ${result.pid}`)
    // 刷新状态
    loadProfileStatus()
  } catch (error: any) {
    console.error('启动窗口失败:', error)
    message.error(error?.response?.data?.message || '启动失败')
  }
}

// Phase 1.4: 关闭窗口
async function handleClose(record: ProfileRecord) {
  try {
    const result = await closeProfile(record.id)
    if (result.success) {
      message.success('窗口已关闭')
    } else {
      message.warning(result.message || '窗口未运行')
    }
    // 刷新状态
    loadProfileStatus()
  } catch (error: any) {
    console.error('关闭窗口失败:', error)
    message.error(error?.response?.data?.message || '关闭失败')
  }
}

// 删除窗口（单个）
async function handleDelete(record: ProfileRecord) {
  try {
    await deleteProfile(record.id)
    message.success('删除成功')
    // 清空选中状态
    selectedRowKeys.value = selectedRowKeys.value.filter(key => key !== record.id)
    // 刷新列表和状态
    loadProfileList()
    loadProfileStatus()
  } catch (error) {
    console.error('删除窗口失败:', error)
    message.error('删除失败')
  }
}

// 批量删除
async function handleBatchDelete() {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的窗口配置')
    return
  }

  const count = selectedRowKeys.value.length
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除选中的 ${count} 个窗口配置吗？此操作不可恢复。`,
    okText: '确认',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      let successCount = 0
      let failCount = 0
      
      // 循环删除选中的窗口
      for (const id of selectedRowKeys.value) {
        try {
          await deleteProfile(id)
          successCount++
        } catch (error) {
          console.error(`删除窗口 ${id} 失败:`, error)
          failCount++
        }
      }
      
      // 清空选中状态
      selectedRowKeys.value = []
      selectedRows.value = []
      
      // 显示结果
      if (failCount === 0) {
        message.success(`批量删除成功，共删除 ${successCount} 个`)
      } else {
        message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
      
      // 刷新列表和状态
      loadProfileList()
      loadProfileStatus()
    }
  })
}

// Phase 1.4: 计算选中项中已停止的数量
const selectedStoppedCount = computed(() => {
  return selectedRows.value.filter(row => !isRunning(row.id)).length
})

// Phase 1.4: 计算选中项中运行中的数量
const selectedRunningCount = computed(() => {
  return selectedRows.value.filter(row => isRunning(row.id)).length
})

// Phase 1.4: 是否可以批量打开
const canBatchStart = computed(() => {
  return selectedStoppedCount.value > 0
})

// Phase 1.4: 是否可以批量关闭
const canBatchClose = computed(() => {
  return selectedRunningCount.value > 0
})

// Phase 1.4: 批量启动
async function handleBatchStart() {
  if (selectedStoppedCount.value === 0) {
    message.warning('请先选择已停止的窗口')
    return
  }

  const stoppedIds = selectedRows.value
    .filter(row => !isRunning(row.id))
    .map(row => row.id)

  Modal.confirm({
    title: '确认批量打开',
    content: `确定要批量打开选中的 ${stoppedIds.length} 个窗口吗？`,
    okText: '确认',
    cancelText: '取消',
    async onOk() {
      let successCount = 0
      let failCount = 0
      
      // 并行启动所有选中的窗口
      const results = await Promise.allSettled(
        stoppedIds.map(id => launchProfile(id))
      )
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++
        } else {
          console.error(`启动窗口 ${stoppedIds[index]} 失败:`, result.reason)
          failCount++
        }
      })
      
      // 显示结果
      if (failCount === 0) {
        message.success(`批量打开成功，共启动 ${successCount} 个窗口`)
      } else {
        message.warning(`批量打开完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
      
      // 刷新状态
      loadProfileStatus()
    }
  })
}

// Phase 1.4: 批量关闭
async function handleBatchClose() {
  if (selectedRunningCount.value === 0) {
    message.warning('请先选择运行中的窗口')
    return
  }

  const runningItems = selectedRows.value.filter(row => isRunning(row.id))

  Modal.confirm({
    title: '确认批量关闭',
    content: `确定要关闭运行中的 ${runningItems.length} 个窗口吗？`,
    okText: '确认',
    cancelText: '取消',
    async onOk() {
      let successCount = 0
      let failCount = 0
      
      // 并行关闭所有选中的窗口
      const results = await Promise.allSettled(
        runningItems.map(item => closeProfile(item.id))
      )
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++
        } else {
          console.error(`关闭窗口 ${runningItems[index].id} 失败:`, result)
          failCount++
        }
      })
      
      // 清空选中状态
      selectedRowKeys.value = []
      selectedRows.value = []
      
      // 显示结果
      if (failCount === 0) {
        message.success(`批量关闭成功，共关闭 ${successCount} 个窗口`)
      } else {
        message.warning(`批量关闭完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
      
      // 刷新状态
      loadProfileStatus()
    }
  })
}

// 定时刷新状态
let statusInterval: number | null = null

onMounted(() => {
  loadProfileList()
  loadProfileStatus()
  
  // 每 5 秒自动刷新状态
  statusInterval = window.setInterval(() => {
    loadProfileStatus()
  }, 5000)
})

onUnmounted(() => {
  // 清理定时器
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<style scoped>
.profile-list-container {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}
</style>
