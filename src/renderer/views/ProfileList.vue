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
          <!-- 优化1+2：批量删除按钮，选中至少一项时启用 -->
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

      <!-- 优化1：a-table 开启 row-selection 多选功能 -->
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
          <template v-if="column.key === 'webrtcMode'">
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
              <a-button type="link" size="small" @click="handleLaunch(record)">
                启动
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { getProfileList, deleteProfile, launchProfile, type ProfileRecord } from '../api/profile'

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
    width: 200,
    fixed: 'right'
  }
]

// 窗口列表数据
const profileList = ref<ProfileRecord[]>([])

// 加载状态
const loading = ref(false)

// 分页配置
const pagination = ref({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => `共 ${total} 条`
})

// 优化1：多选相关状态
const selectedRowKeys = ref<number[]>([])
const selectedRows = ref<ProfileRecord[]>([])

/**
 * 选中项变化回调
 */
function onSelectChange(keys: number[], rows: ProfileRecord[]) {
  selectedRowKeys.value = keys
  selectedRows.value = rows
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
  } catch (error: any) {
    console.error('启动窗口失败:', error)
    message.error(error?.response?.data?.message || '启动失败')
  }
}

// 删除窗口（单个）
async function handleDelete(record: ProfileRecord) {
  try {
    await deleteProfile(record.id)
    message.success('删除成功')
    // 清空选中状态
    selectedRowKeys.value = selectedRowKeys.value.filter(key => key !== record.id)
    loadProfileList()
  } catch (error) {
    console.error('删除窗口失败:', error)
    message.error('删除失败')
  }
}

// 优化2：批量删除
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
      
      // 刷新列表
      loadProfileList()
    }
  })
}

onMounted(() => {
  loadProfileList()
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
