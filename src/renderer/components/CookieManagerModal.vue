<template>
  <a-modal
    v-model:open="modalVisible"
    title="🍪 浏览数据管理"
    width="720px"
    :centered="true"
    :footer="null"
    @cancel="handleClose"
  >
    <a-tabs v-model:activeKey="activeTab">
      <!-- 标签页一：当前状态 -->
      <a-tab-pane key="status" tab="当前状态">
        <a-spin :spinning="statusLoading">
          <a-descriptions :column="2" bordered size="small" style="margin-bottom: 16px;">
            <a-descriptions-item label="Cookie 数量">
              <a-tag color="blue">{{ cookieStatus?.cookieCount || 0 }}</a-tag> 条
            </a-descriptions-item>
            <a-descriptions-item label="涉及域名">
              {{ cookieStatus?.domainCount || 0 }} 个
            </a-descriptions-item>
            <a-descriptions-item label="识别平台" :span="2">
              <a-tag v-for="p in (cookieStatus?.platforms || [])" :key="p" color="processing">
                {{ p }}
              </a-tag>
              <span v-if="!(cookieStatus?.platforms?.length)" style="color: #999;">—</span>
            </a-descriptions-item>
            <a-descriptions-item label="Cookies 文件">
              <a-badge :status="cookieStatus?.cookiesFileExists ? 'success' : 'default'" :text="cookieStatus?.cookiesFileExists ? '存在' : '不存在'" />
            </a-descriptions-item>
            <a-descriptions-item label="LocalStorage">
              <a-badge :status="cookieStatus?.localStorageExists ? 'success' : 'default'" :text="cookieStatus?.localStorageExists ? '存在' : '不存在'" />
            </a-descriptions-item>
            <a-descriptions-item label="SessionStorage">
              <a-badge :status="cookieStatus?.sessionStorageExists ? 'success' : 'default'" :text="cookieStatus?.sessionStorageExists ? '存在' : '不存在'" />
            </a-descriptions-item>
            <a-descriptions-item label="IndexedDB">
              <a-badge :status="cookieStatus?.indexedDBExists ? 'success' : 'default'" :text="cookieStatus?.indexedDBExists ? '存在' : '不存在'" />
            </a-descriptions-item>
            <a-descriptions-item label="Cache">
              <a-badge :status="cookieStatus?.cacheExists ? 'success' : 'default'" :text="cookieStatus?.cacheExists ? '存在' : '不存在'" />
            </a-descriptions-item>
            <a-descriptions-item label="数据总大小" :span="2">
              {{ formatBytes(cookieStatus?.totalSizeBytes || 0) }}
            </a-descriptions-item>
            <a-descriptions-item label="主要域名" :span="2">
              <a-tag v-for="(d, idx) in (cookieStatus?.domains || []).slice(0, 5)" :key="idx" style="margin-bottom: 4px;">
                {{ d }}
              </a-tag>
              <span v-if="(cookieStatus?.domains?.length || 0) > 5" style="color: #999;">+{{ cookieStatus.domains.length - 5 }} 更多</span>
            </a-descriptions-item>
          </a-descriptions>
          <a-button type="default" @click="loadStatus" :loading="statusLoading">
            🔄 刷新状态
          </a-button>
        </a-spin>
      </a-tab-pane>

      <!-- 标签页二：备份管理 -->
      <a-tab-pane key="backups" tab="备份管理">
        <div style="margin-bottom: 12px;">
          <a-button type="primary" @click="handleExport" :loading="exportLoading" :disabled="isRunning">
            <ExportOutlined /> 立即备份
          </a-button>
        </div>
        <a-table
          :columns="backupColumns"
          :data-source="backups"
          :loading="backupLoading"
          :pagination="{ pageSize: 5 }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'createdAt'">
              {{ formatDate(record.createdAt) }}
            </template>
            <template v-else-if="column.key === 'backupType'">
              <a-tag :color="record.backupType === 'auto' ? 'orange' : 'blue'">
                {{ record.backupType === 'auto' ? '自动' : '手动' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'cookieCount'">
              {{ record.cookieCount }} 条
            </template>
            <template v-else-if="column.key === 'sizeBytes'">
              {{ formatBytes(record.sizeBytes) }}
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button type="link" size="small" @click="handleRestore(record)" :disabled="isRunning">
                恢复
              </a-button>
              <a-popconfirm
                title="确定删除此备份？"
                ok-text="确认"
                cancel-text="取消"
                @confirm="handleDeleteBackup(record)"
              >
                <a-button type="link" size="small" danger :disabled="isRunning">
                  删除
                </a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 标签页三：清理缓存 -->
      <a-tab-pane key="clear" tab="清理缓存">
        <a-form layout="vertical">
          <a-form-item label="选择清理模式">
            <a-radio-group v-model:value="clearMode">
              <a-radio value="all">
                全部清理（Cookies + 缓存 + 存储数据）
                <a-alert type="warning" message="⚠️ 将清空所有浏览数据，请确保已备份" style="margin-top: 4px;" />
              </a-radio>
              <a-radio value="cookies_only">
                仅清理 Cookies（保留缓存和存储）
              </a-radio>
              <a-radio value="cache_only">
                仅清理缓存（保留 Cookies）
              </a-radio>
            </a-radio-group>
          </a-form-item>
          <a-alert v-if="isRunning" type="warning" show-icon message="窗口正在运行中，浏览数据操作需先关闭窗口" style="margin-bottom: 12px;" />
          <a-button type="primary" danger @click="handleClear" :loading="clearLoading" :disabled="isRunning">
            执行清理
          </a-button>
        </a-form>
      </a-tab-pane>
    </a-tabs>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { ExportOutlined } from '@ant-design/icons-vue'
import { getCookieStatus, getCookieBackups, exportCookies, restoreCookies, clearCookies, deleteCookieBackup, type CookieStatus, type CookieBackup } from '../api/cookie'

const props = defineProps<{
  visible: boolean
  profileId: number
  profileTitle: string
  isRunning?: boolean
}>()

const emit = defineEmits(['update:visible', 'refresh'])

// 弹窗可见性
const modalVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 标签页
const activeTab = ref('status')

// 状态数据
const statusLoading = ref(false)
const cookieStatus = ref<CookieStatus | null>(null)

// 备份数据
const backupLoading = ref(false)
const backups = ref<CookieBackup[]>([])
const exportLoading = ref(false)

// 清理数据
const clearMode = ref<'all' | 'cookies_only' | 'cache_only'>('all')
const clearLoading = ref(false)

// 备份列定义
const backupColumns = [
  { title: '备份时间', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
  { title: '类型', dataIndex: 'backupType', key: 'backupType', width: 80 },
  { title: 'Cookie数量', dataIndex: 'cookieCount', key: 'cookieCount', width: 100 },
  { title: '文件大小', dataIndex: 'sizeBytes', key: 'sizeBytes', width: 100 },
  { title: '操作', key: 'action', width: 120 }
]

// 加载状态
async function loadStatus() {
  statusLoading.value = true
  try {
    const res: any = await getCookieStatus(props.profileId)
    if (res.data?.code === 200) {
      cookieStatus.value = res.data.data
    }
  } catch (err) {
    console.error('加载状态失败:', err)
  } finally {
    statusLoading.value = false
  }
}

// 加载备份列表
async function loadBackups() {
  backupLoading.value = true
  try {
    const res: any = await getCookieBackups(props.profileId)
    if (res.data?.code === 200) {
      backups.value = res.data.data || []
    }
  } catch (err) {
    console.error('加载备份列表失败:', err)
  } finally {
    backupLoading.value = false
  }
}

// 导出 Cookie
async function handleExport() {
  exportLoading.value = true
  try {
    const res: any = await exportCookies(props.profileId)
    if (res.data?.code === 200) {
      message.success(`导出成功：${res.data.data.cookieCount} 条 Cookie`)
      loadBackups()
    } else {
      message.error(res.data?.message || '导出失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '导出失败')
  } finally {
    exportLoading.value = false
  }
}

// 恢复备份
async function handleRestore(backup: CookieBackup) {
  try {
    const res: any = await restoreCookies(props.profileId, backup.id)
    if (res.data?.code === 200) {
      message.success('恢复成功')
      loadStatus()
      loadBackups()
    } else {
      message.error(res.data?.message || '恢复失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '恢复失败')
  }
}

// 删除备份
async function handleDeleteBackup(backup: CookieBackup) {
  try {
    const res: any = await deleteCookieBackup(props.profileId, backup.id)
    if (res.data?.code === 200) {
      message.success('删除成功')
      loadBackups()
    } else {
      message.error(res.data?.message || '删除失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '删除失败')
  }
}

// 清理缓存
async function handleClear() {
  try {
    const res: any = await clearCookies(props.profileId, clearMode.value)
    if (res.data?.code === 200) {
      message.success('清理完成')
      loadStatus()
    } else {
      message.error(res.data?.message || '清理失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '清理失败')
  }
}

// 格式化日期
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 格式化字节
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 关闭弹窗
function handleClose() {
  modalVisible.value = false
}

// 监听弹窗打开，加载数据
watch(() => props.visible, (val) => {
  if (val) {
    activeTab.value = 'status'
    loadStatus()
    loadBackups()
  }
})
</script>