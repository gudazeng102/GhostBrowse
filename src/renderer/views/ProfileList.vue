<template>
  <div class="profile-list-container">
    <div class="page-header">
      <h1 class="page-title">📋 窗口管理</h1>
      <a-button type="primary" size="large" @click="handleCreateProfile">
        ➕ 新建窗口
      </a-button>
    </div>

    <a-card :bordered="false">
      <template #title>
        <span>窗口列表</span>
      </template>

      <a-table
        :columns="columns"
        :data-source="profileList"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <!-- 代理列 -->
          <template v-if="column.key === 'proxy'">
            <span v-if="record.proxy">
              {{ record.proxy.name }} ({{ record.proxy.host }}:{{ record.proxy.port }})
            </span>
            <a-tag v-else color="default">无代理</a-tag>
          </template>

          <!-- Chrome 版本列 -->
          <template v-else-if="column.key === 'chromeVersion'">
            <a-tag color="blue">Chrome {{ record.chromeVersion }}</a-tag>
          </template>

          <!-- WebRTC 模式列 -->
          <template v-else-if="column.key === 'webrtcMode'">
            <a-tag :color="getWebRtcColor(record.webrtcMode)">
              {{ getWebRtcText(record.webrtcMode) }}
            </a-tag>
          </template>

          <!-- 分辨率列 -->
          <template v-else-if="column.key === 'screenResolution'">
            {{ record.screenResolution }}
          </template>

          <!-- 操作列 -->
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="primary" size="small" @click="handleLaunch(record)">
                打开
              </a-button>
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              <a-button type="link" size="small" danger @click="handleDelete(record)">
                删除
              </a-button>
            </a-space>
          </template>
        </template>

        <template #emptyText>
          <a-empty description="暂无窗口配置，点击「新建窗口」创建第一个指纹浏览器">
            <template #image>
              <span style="font-size: 48px;">🖥️</span>
            </template>
          </a-empty>
        </template>
      </a-table>
    </a-card>

    <!-- 提示信息 -->
    <a-card :bordered="false" style="margin-top: 16px;">
      <a-alert type="info" show-icon>
        <template #message>
          <span>Phase 1.3 功能提示</span>
        </template>
        <template #description>
          <span>每个窗口使用独立的 Chrome 用户数据目录，实现 Cookie、缓存、LocalStorage 完全隔离。</span>
        </template>
      </a-alert>
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
    title: '窗口标题',
    dataIndex: 'title',
    key: 'title',
    width: 200
  },
  {
    title: '代理',
    dataIndex: 'proxy',
    key: 'proxy',
    width: 250
  },
  {
    title: 'Chrome版本',
    dataIndex: 'chromeVersion',
    key: 'chromeVersion',
    width: 120
  },
  {
    title: 'WebRTC',
    dataIndex: 'webrtcMode',
    key: 'webrtcMode',
    width: 100
  },
  {
    title: '分辨率',
    dataIndex: 'screenResolution',
    key: 'screenResolution',
    width: 120
  },
  {
    title: '操作',
    key: 'action',
    width: 180,
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

/**
 * 获取 WebRTC 模式显示文本
 */
function getWebRtcText(mode: string): string {
  const modeMap: Record<string, string> = {
    forward: '转发',
    replace: '替换真实',
    disable: '禁用'
  }
  return modeMap[mode] || mode
}

/**
 * 获取 WebRTC 模式对应颜色
 */
function getWebRtcColor(mode: string): string {
  const colorMap: Record<string, string> = {
    forward: 'green',
    replace: 'orange',
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

// 删除窗口
async function handleDelete(record: ProfileRecord) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除窗口 "${record.title}" 吗？此操作不可恢复。`,
    okText: '确认',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteProfile(record.id)
        message.success('删除成功')
        loadProfileList()
      } catch (error) {
        console.error('删除窗口失败:', error)
        message.error('删除失败')
      }
    }
  })
}

// 启动窗口
async function handleLaunch(record: ProfileRecord) {
  try {
    const result = await launchProfile(record.id)
    message.success(`窗口已启动 (PID: ${result.pid})`)
  } catch (error: any) {
    console.error('启动窗口失败:', error)
    message.error(error?.response?.data?.message || '启动窗口失败')
  }
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
