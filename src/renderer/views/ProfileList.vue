<template>
  <div class="profile-list-container">
    <div class="page-header">
      <h1 class="page-title">🖥️ 窗口配置</h1>
      <a-button type="primary" size="large" @click="handleCreateProfile">
        ➕ 新建窗口
      </a-button>
    </div>

    <a-row :gutter="16">
      <!-- 左侧：分组侧边栏 -->
      <a-col :span="5">
        <a-card :bordered="false" class="group-sidebar">
          <template #title>
            <span>📂 分组</span>
          </template>
          <template #extra>
            <a-button type="link" size="small" @click="openGroupModal()">
              ＋ 新建
            </a-button>
          </template>

          <div class="group-list">
            <div
              class="group-item"
              :class="{ active: selectedGroupKey[0] === 'all' }"
              @click="selectGroup('all')"
            >
              <span class="group-item-label">📁 全部窗口</span>
              <a-tag color="default">{{ totalCount }}</a-tag>
            </div>
            <div
              class="group-item"
              :class="{ active: selectedGroupKey[0] === 'ungrouped' }"
              @click="selectGroup('ungrouped')"
            >
              <span class="group-item-label">📭 未分组</span>
              <a-tag color="default">{{ ungroupedCount }}</a-tag>
            </div>
            <div
              v-for="g in groupList"
              :key="`g-${g.id}`"
              class="group-item"
              :class="{ active: selectedGroupKey[0] === `g-${g.id}` }"
              @click="selectGroup(`g-${g.id}`)"
            >
              <span class="group-item-label">
                <span class="group-color-dot" :style="{ background: g.color }"></span>
                {{ g.name }}
              </span>
              <span class="group-item-actions" @click.stop>
                <a-tag color="default">{{ g.profileCount || 0 }}</a-tag>
                <a-button
                  type="text"
                  size="small"
                  class="action-btn"
                  @click.stop="openGroupModal(g)"
                  title="编辑"
                >
                  ✏️
                </a-button>
                <a-button
                  type="text"
                  size="small"
                  class="action-btn"
                  @click.stop="confirmDeleteGroup(g)"
                  title="删除"
                >
                  🗑️
                </a-button>
              </span>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 右侧：窗口表格 -->
      <a-col :span="19">
        <a-card :bordered="false">
          <template #title>
            <span>窗口列表 - {{ currentGroupTitle }}</span>
          </template>
          <template #extra>
            <a-dropdown :disabled="selectedRowKeys.length === 0">
              <a-button type="primary">
                ⚡ 批量操作 ({{ selectedRowKeys.length }})
                <DownOutlined />
              </a-button>
              <template #overlay>
                <a-menu @click="onBatchMenuClick">
                  <a-sub-menu key="move">
                    <template #title>
                      <span>📂 移动到分组</span>
                    </template>
                    <a-menu-item key="move:ungrouped">📭 未分组</a-menu-item>
                    <a-menu-divider v-if="groupList.length > 0" />
                    <a-menu-item v-for="g in groupList" :key="`move:${g.id}`">
                      <span class="group-color-dot" :style="{ background: g.color }"></span>
                      {{ g.name }}
                    </a-menu-item>
                  </a-sub-menu>
                  <a-menu-divider />
                  <a-menu-item key="batchStart" :disabled="!canBatchStart">
                    🚀 批量打开 ({{ selectedStoppedCount }})
                  </a-menu-item>
                  <a-menu-item key="batchClose" :disabled="!canBatchClose">
                    ⏹️ 批量关闭 ({{ selectedRunningCount }})
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="batchDelete" danger>
                    🗑️ 批量删除 ({{ selectedRowKeys.length }})
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </template>

          <a-table
            :columns="columns"
            :data-source="profileList"
            :loading="loading"
            :pagination="pagination"
            :row-selection="{ selectedRowKeys, onChange: onSelectChange }"
            :scroll="{ x: 1000 }"
            row-key="id"
            size="middle"
            @change="handleTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <a-tag :color="isRunning(record.id) ? 'green' : 'red'">
                  {{ isRunning(record.id) ? '运行中' : '已停止' }}
                </a-tag>
              </template>

              <template v-else-if="column.key === 'group'">
                <span class="group-cell">
                  <span
                    class="group-color-dot"
                    :style="{ background: record.group ? record.group.color : '#d9d9d9' }"
                  ></span>
                  <span>{{ record.group ? record.group.name : '未分组' }}</span>
                </span>
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
                <a-space :size="4">
                  <a-button
                    v-if="!isRunning(record.id)"
                    type="primary"
                    size="small"
                    @click="handleLaunch(record)"
                  >
                    🚀 打开
                  </a-button>
                  <a-button v-else danger size="small" @click="handleClose(record)">
                    ⏹️ 关闭
                  </a-button>

                  <a-dropdown :trigger="['click']">
                    <a-button size="small">
                      更多
                      <DownOutlined />
                    </a-button>
                    <template #overlay>
                      <a-menu @click="(info: any) => onRowMoreClick(info, record)">
                        <a-menu-item key="edit">✏️ 编辑</a-menu-item>
                        <a-menu-item key="fingerprint" :disabled="checkingId === record.id">
                          <SafetyOutlined />
                          {{ checkingId === record.id ? ' 检测中...' : ' 检测指纹' }}
                        </a-menu-item>
                        <a-menu-divider />
                        <a-menu-item key="delete" danger>🗑️ 删除</a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <!-- 指纹检测弹窗 -->
    <FingerprintCheckModal
      v-model:visible="fingerprintModalVisible"
      :result="fingerprintResult"
      :loading="checkingId !== null"
      @checkAgain="handleCheckAgain"
    />

    <!-- 分组编辑弹窗 -->
    <a-modal
      v-model:open="groupModalVisible"
      :title="groupForm.id ? '编辑分组' : '新建分组'"
      @ok="onSaveGroup"
      @cancel="groupModalVisible = false"
      :ok-text="groupForm.id ? '保存' : '创建'"
      cancel-text="取消"
    >
      <a-form :model="groupForm" layout="vertical">
        <a-form-item label="分组名称" required>
          <a-input v-model:value="groupForm.name" placeholder="请输入分组名称" :maxlength="32" />
        </a-form-item>
        <a-form-item label="颜色">
          <a-space wrap>
            <span
              v-for="c in colorPresets"
              :key="c"
              class="color-swatch"
              :class="{ active: groupForm.color === c }"
              :style="{ background: c }"
              @click="groupForm.color = c"
            ></span>
          </a-space>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="groupForm.remark" :rows="2" placeholder="可选" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { SafetyOutlined, DownOutlined } from '@ant-design/icons-vue'
import {
  getProfileList,
  deleteProfile,
  launchProfile,
  getProfilesStatus,
  closeProfile,
  type ProfileRecord
} from '../api/profile'
import {
  getGroupList,
  createGroup,
  updateGroup,
  deleteGroup,
  moveProfilesToGroup,
  type ProfileGroup
} from '../api/profile-group'
import { checkFingerprint } from '../api/fingerprint'
import FingerprintCheckModal from '../components/FingerprintCheckModal.vue'

const router = useRouter()

// ==================== 分组相关 ====================
const groupList = ref<ProfileGroup[]>([])
const ungroupedCount = ref(0)
const totalCount = ref(0)
const selectedGroupKey = ref<string[]>(['all'])

const colorPresets = [
  '#1890ff', '#52c41a', '#faad14', '#f5222d',
  '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'
]

const groupModalVisible = ref(false)
const groupForm = reactive<{
  id: number | null
  name: string
  color: string
  remark: string
}>({
  id: null,
  name: '',
  color: '#1890ff',
  remark: ''
})

const currentGroupTitle = computed(() => {
  const key = selectedGroupKey.value[0] || 'all'
  if (key === 'all') return '全部窗口'
  if (key === 'ungrouped') return '未分组'
  const id = Number(key.replace('g-', ''))
  const g = groupList.value.find(x => x.id === id)
  return g ? g.name : '全部窗口'
})

const currentGroupFilter = computed<number | 'ungrouped' | undefined>(() => {
  const key = selectedGroupKey.value[0] || 'all'
  if (key === 'all') return undefined
  if (key === 'ungrouped') return 'ungrouped'
  return Number(key.replace('g-', ''))
})

async function loadGroups() {
  try {
    const data = await getGroupList()
    groupList.value = data.groups
    ungroupedCount.value = data.ungroupedCount
    totalCount.value =
      data.ungroupedCount +
      data.groups.reduce((sum, g) => sum + (g.profileCount || 0), 0)
  } catch (err) {
    console.error('加载分组失败:', err)
  }
}

function selectGroup(key: string) {
  if (selectedGroupKey.value[0] === key) return
  selectedGroupKey.value = [key]
  loadProfileList()
}

function confirmDeleteGroup(g: ProfileGroup) {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除分组「${g.name}」吗？组内窗口将变为未分组`,
    okText: '确认',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: () => onDeleteGroup(g)
  })
}

function openGroupModal(g?: ProfileGroup) {
  if (g) {
    groupForm.id = g.id
    groupForm.name = g.name
    groupForm.color = g.color || '#1890ff'
    groupForm.remark = g.remark || ''
  } else {
    groupForm.id = null
    groupForm.name = ''
    groupForm.color = '#1890ff'
    groupForm.remark = ''
  }
  groupModalVisible.value = true
}

async function onSaveGroup() {
  if (!groupForm.name.trim()) {
    message.warning('请输入分组名称')
    return
  }
  try {
    if (groupForm.id) {
      await updateGroup(groupForm.id, {
        name: groupForm.name.trim(),
        color: groupForm.color,
        remark: groupForm.remark
      })
      message.success('分组已更新')
    } else {
      await createGroup({
        name: groupForm.name.trim(),
        color: groupForm.color,
        remark: groupForm.remark
      })
      message.success('分组已创建')
    }
    groupModalVisible.value = false
    await loadGroups()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  }
}

async function onDeleteGroup(g: ProfileGroup) {
  try {
    await deleteGroup(g.id)
    message.success('分组已删除')
    // 如果当前选中的就是该分组，则切回"全部"
    if (selectedGroupKey.value[0] === `g-${g.id}`) {
      selectedGroupKey.value = ['all']
      await loadProfileList()
    } else {
      await loadProfileList()
    }
    await loadGroups()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '删除失败')
  }
}

async function doMoveToGroup(rawKey: string) {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择窗口')
    return
  }
  const targetGroupId = rawKey === 'ungrouped' ? null : Number(rawKey)
  try {
    const result = await moveProfilesToGroup(targetGroupId, selectedRowKeys.value)
    message.success(`已移动 ${result.changes} 个窗口`)
    selectedRowKeys.value = []
    selectedRows.value = []
    await loadGroups()
    await loadProfileList()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '移动失败')
  }
}

function onBatchMenuClick({ key }: { key: string }) {
  if (typeof key === 'string' && key.startsWith('move:')) {
    doMoveToGroup(key.slice(5))
    return
  }
  switch (key) {
    case 'batchStart':
      handleBatchStart()
      break
    case 'batchClose':
      handleBatchClose()
      break
    case 'batchDelete':
      handleBatchDelete()
      break
  }
}

function onRowMoreClick(info: { key: string }, record: ProfileRecord) {
  switch (info.key) {
    case 'edit':
      handleEdit(record)
      break
    case 'fingerprint':
      handleFingerprintCheck(record)
      break
    case 'delete':
      Modal.confirm({
        title: '确认删除',
        content: '确定要删除这个窗口配置吗？此操作不可恢复。',
        okText: '确认',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => handleDelete(record)
      })
      break
  }
}

// ==================== 指纹检测 ====================
const fingerprintModalVisible = ref(false)
const fingerprintResult = ref<any>(null)
const checkingId = ref<number | null>(null)

async function handleFingerprintCheck(profile: any) {
  checkingId.value = profile.id
  try {
    const res: any = await checkFingerprint(profile.id)
    if (res.data?.code === 200 && res.data?.data) {
      fingerprintResult.value = res.data.data
      fingerprintModalVisible.value = true
    } else {
      message.error(res.data?.message || res.message || '检测失败')
    }
  } catch (err: any) {
    console.error('[ProfileList] 指纹检测失败:', err)
    message.error(err.response?.data?.message || err.message || '检测请求失败')
  } finally {
    checkingId.value = null
  }
}

function handleCheckAgain() {
  if (fingerprintResult.value) {
    const profileId = fingerprintResult.value.profile.id
    const profile = profileList.value.find(p => p.id === profileId)
    if (profile) {
      fingerprintModalVisible.value = false
      handleFingerprintCheck(profile)
    }
  }
}

// ==================== 表格列 ====================
const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60, fixed: 'left' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '标题', dataIndex: 'title', key: 'title', width: 180, ellipsis: true },
  { title: '分组', key: 'group', width: 140 },
  { title: 'Chrome版本', dataIndex: 'chromeVersion', key: 'chromeVersion', width: 110 },
  { title: '代理', key: 'proxy', width: 140 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' }
]

// ==================== 列表数据与状态 ====================
const profileList = ref<ProfileRecord[]>([])
const loading = ref(false)
const statusLoading = ref(false)
const runningIds = ref<number[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`
})

const selectedRowKeys = ref<number[]>([])
const selectedRows = ref<ProfileRecord[]>([])

function onSelectChange(keys: number[], rows: ProfileRecord[]) {
  selectedRowKeys.value = keys
  selectedRows.value = rows
}

function isRunning(profileId: number): boolean {
  return runningIds.value.includes(profileId)
}

function getWebRtcColor(mode: string): string {
  const colorMap: Record<string, string> = {
    forward: 'blue',
    replace: 'green',
    disable: 'red'
  }
  return colorMap[mode] || 'default'
}

function handleTableChange(pag: any) {
  if (pag.pageSize !== pagination.pageSize) {
    pagination.current = 1
  } else {
    pagination.current = pag.current
  }
  pagination.pageSize = pag.pageSize
}

async function loadProfileList() {
  loading.value = true
  try {
    const list = await getProfileList(currentGroupFilter.value)
    profileList.value = list
    pagination.total = list.length
  } catch (error) {
    console.error('加载窗口列表失败:', error)
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

async function loadProfileStatus() {
  statusLoading.value = true
  try {
    const status = await getProfilesStatus()
    runningIds.value = status.runningIds || []
  } catch (error) {
    console.error('加载窗口状态失败:', error)
  } finally {
    statusLoading.value = false
  }
}

function handleCreateProfile() {
  router.push('/profile/new')
}

function handleEdit(record: ProfileRecord) {
  router.push({ path: '/profile/edit', query: { id: String(record.id) } })
}

async function handleLaunch(record: ProfileRecord) {
  try {
    const result = await launchProfile(record.id)
    message.success(`窗口已启动，PID: ${result.pid}`)
    loadProfileStatus()
  } catch (error: any) {
    console.error('启动窗口失败:', error)
    message.error(error?.response?.data?.message || '启动失败')
  }
}

async function handleClose(record: ProfileRecord) {
  try {
    const result = await closeProfile(record.id)
    if (result.success) {
      message.success('窗口已关闭')
    } else {
      message.warning(result.message || '窗口未运行')
    }
    loadProfileStatus()
  } catch (error: any) {
    console.error('关闭窗口失败:', error)
    message.error(error?.response?.data?.message || '关闭失败')
  }
}

async function handleDelete(record: ProfileRecord) {
  try {
    await deleteProfile(record.id)
    message.success('删除成功')
    selectedRowKeys.value = selectedRowKeys.value.filter(key => key !== record.id)
    await loadGroups()
    loadProfileList()
    loadProfileStatus()
  } catch (error) {
    console.error('删除窗口失败:', error)
    message.error('删除失败')
  }
}

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
      for (const id of selectedRowKeys.value) {
        try {
          await deleteProfile(id)
          successCount++
        } catch (error) {
          console.error(`删除窗口 ${id} 失败:`, error)
          failCount++
        }
      }
      selectedRowKeys.value = []
      selectedRows.value = []
      if (failCount === 0) {
        message.success(`批量删除成功，共删除 ${successCount} 个`)
      } else {
        message.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
      await loadGroups()
      loadProfileList()
      loadProfileStatus()
    }
  })
}

const selectedStoppedCount = computed(() => {
  return selectedRows.value.filter(row => !isRunning(row.id)).length
})
const selectedRunningCount = computed(() => {
  return selectedRows.value.filter(row => isRunning(row.id)).length
})
const canBatchStart = computed(() => selectedStoppedCount.value > 0)
const canBatchClose = computed(() => selectedRunningCount.value > 0)

async function handleBatchStart() {
  if (selectedStoppedCount.value === 0) {
    message.warning('请先选择已停止的窗口')
    return
  }
  const stoppedIds = selectedRows.value.filter(row => !isRunning(row.id)).map(row => row.id)
  Modal.confirm({
    title: '确认批量打开',
    content: `确定要批量打开选中的 ${stoppedIds.length} 个窗口吗？`,
    okText: '确认',
    cancelText: '取消',
    async onOk() {
      let successCount = 0
      let failCount = 0
      const results = await Promise.allSettled(stoppedIds.map(id => launchProfile(id)))
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++
        } else {
          console.error(`启动窗口 ${stoppedIds[index]} 失败:`, result.reason)
          failCount++
        }
      })
      if (failCount === 0) {
        message.success(`批量打开成功，共启动 ${successCount} 个`)
      } else {
        message.warning(`启动完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
      loadProfileStatus()
    }
  })
}

async function handleBatchClose() {
  if (selectedRunningCount.value === 0) {
    message.warning('请先选择运行中的窗口')
    return
  }
  const runningIdList = selectedRows.value.filter(row => isRunning(row.id)).map(row => row.id)
  Modal.confirm({
    title: '确认批量关闭',
    content: `确定要批量关闭选中的 ${runningIdList.length} 个窗口吗？`,
    okText: '确认',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      let successCount = 0
      let failCount = 0
      const results = await Promise.allSettled(runningIdList.map(id => closeProfile(id)))
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && (result.value as any)?.success) {
          successCount++
        } else {
          console.error(`关闭窗口 ${runningIdList[index]} 失败:`,
            result.status === 'rejected' ? result.reason : (result.value as any)?.message)
          failCount++
        }
      })
      if (failCount === 0) {
        message.success(`批量关闭成功，共关闭 ${successCount} 个`)
      } else {
        message.warning(`关闭完成：成功 ${successCount} 个，失败 ${failCount} 个`)
      }
      loadProfileStatus()
    }
  })
}

// ==================== 生命周期 ====================
let statusTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await loadGroups()
  await loadProfileList()
  await loadProfileStatus()
  statusTimer = setInterval(() => {
    loadProfileStatus()
  }, 5000)
})

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
})
</script>

<style scoped>

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
}

.group-sidebar :deep(.ant-card-body) {
  padding: 8px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.group-item:hover {
  background: #f5f5f5;
}

.group-item.active {
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 500;
}

.group-item-label {
  display: inline-flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-item-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.group-item .action-btn {
  opacity: 0;
  padding: 0 4px;
  transition: opacity 0.2s;
}

.group-item:hover .action-btn {
  opacity: 1;
}

.group-color-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

.color-swatch {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
}

.color-swatch.active {
  border-color: #000;
  box-shadow: 0 0 0 2px #fff inset;
}

.group-cell {
  display: inline-flex;
  align-items: center;
}
</style>
