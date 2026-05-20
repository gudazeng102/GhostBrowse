<template>
  <div class="cookie-manager-container">
    <!-- 页面标题区 -->
    <div class="page-header">
      <a-button type="link" @click="handleBack">
        <LeftOutlined /> 返回
      </a-button>
      <h1 class="page-title">🍪 Cookie 管理</h1>
    </div>

    <!-- Profile 信息卡片 -->
    <a-card size="small" style="margin-bottom: 16px; background: #fafafa;">
      <a-descriptions :column="3" size="small">
        <a-descriptions-item label="窗口 ID">{{ profileId }}</a-descriptions-item>
        <a-descriptions-item label="窗口标题">{{ profileTitle }}</a-descriptions-item>
        <a-descriptions-item label="运行状态">
          <a-tag :color="isRunning ? 'green' : 'default'">{{ isRunning ? '运行中' : '未运行' }}</a-tag>
        </a-descriptions-item>
      </a-descriptions>
    </a-card>

    <!-- 标签页切换 -->
    <a-tabs v-model:activeKey="activeTab">
      <!-- Tab 1: 实时 Cookie -->
      <a-tab-pane key="live" tab="📡 实时 Cookie">
        <a-card :bordered="false">
          <template #extra>
            <a-space>
              <a-button @click="loadCookies" :loading="loading">
                <ReloadOutlined /> 刷新
              </a-button>
              <a-button @click="clearCookies" danger :loading="clearing">
                🗑️ 清空全部
              </a-button>
            </a-space>
          </template>

          <!-- 未运行提示 -->
          <a-result v-if="!isRunning" title="窗口未运行" sub-title="请先启动窗口后再查看实时 Cookie">
            <template #extra>
              <a-button type="primary" @click="handleBack">返回窗口管理</a-button>
            </template>
          </a-result>

          <!-- Cookie 表格 -->
          <a-table
            v-if="isRunning"
            :columns="columns"
            :data-source="cookieList"
            :loading="loading"
            :pagination="cookiePagination"
            row-key="name"
            size="small"
            @change="handleCookieTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <span style="font-weight: 500;">{{ record.name }}</span>
              </template>
              <template v-else-if="column.key === 'value'">
                <span class="text-wrap">{{ record.value }}</span>
              </template>
              <template v-else-if="column.key === 'domain'">
                <a-tag>{{ record.domain }}</a-tag>
              </template>
              <template v-else-if="column.key === 'path'">
                <span style="color: #666;">{{ record.path }}</span>
              </template>
              <template v-else-if="column.key === 'secure'">
                <a-tag :color="record.secure ? 'blue' : 'default'">
                  {{ record.secure ? '是' : '否' }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'httpOnly'">
                <a-tag :color="record.httpOnly ? 'purple' : 'default'">
                  {{ record.httpOnly ? '是' : '否' }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'expires'">
                <span style="color: #666; font-size: 12px;">
                  {{ record.expires && record.expires > 0 ? formatDate(record.expires) : '会话' }}
                </span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space>
                  <a-tooltip title="复制 Cookie">
                    <a-button size="small" @click="copyCookie(record)">
                      <CopyOutlined />
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="删除此 Cookie">
                    <a-button size="small" danger @click="deleteSingleCookie(record)">
                      <DeleteOutlined />
                    </a-button>
                  </a-tooltip>
                </a-space>
              </template>
            </template>
          </a-table>

          <!-- 统计信息 -->
          <div v-if="cookieList.length > 0" style="margin-top: 12px; color: #666;">
            共 {{ cookieList.length }} 条 Cookie
          </div>
        </a-card>
      </a-tab-pane>

      <!-- Tab 2: 导入 Cookie -->
      <a-tab-pane key="import" tab="📥 导入 Cookie">
        <a-card :bordered="false">
          <a-space direction="vertical" :size="16" style="width: 100%;">
            <!-- 导入方式选择 -->
            <a-radio-group v-model:value="importMode">
              <a-radio value="json">📄 JSON 文件导入</a-radio>
              <a-radio value="paste">📋 粘贴 JSON 文本</a-radio>
            </a-radio-group>

            <!-- JSON 文件导入 -->
            <div v-if="importMode === 'json'">
              <a-upload
                :before-upload="beforeUpload"
                :max-count="1"
                accept=".json"
              >
                <a-button>
                  <UploadOutlined /> 选择 JSON 文件
                </a-button>
              </a-upload>
              <div style="margin-top: 8px; color: #888; font-size: 12px;">
                支持 Netscape 格式或 JSON 数组格式的 Cookie 文件
              </div>
            </div>

            <!-- 粘贴 JSON -->
            <div v-else>
              <a-textarea
                v-model:value="cookieText"
                :placeholder="cookiePlaceholder"
                :rows="8"
                style="font-family: monospace;"
              />
              <div style="margin-top: 8px; color: #888; font-size: 12px;">
                支持 JSON 数组格式，每项需包含 name、value、domain 字段
              </div>
            </div>

            <!-- 导入按钮 -->
            <a-button
              type="primary"
              :loading="importing"
              :disabled="!canImport"
              @click="handleImport"
            >
              🚀 导入 Cookie
            </a-button>

            <!-- 导入结果 -->
            <a-alert
              v-if="importResult"
              :type="importResult.success ? 'success' : 'error'"
              :message="importResult.message"
              show-icon
            />
          </a-space>
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { LeftOutlined, ReloadOutlined, DeleteOutlined, CopyOutlined, UploadOutlined } from '@ant-design/icons-vue'
import request from '../api/request'

// ==================== 类型定义 ====================

interface CookieItem {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: string
  expires?: number
}

// ==================== Props & Emits ====================

const router = useRouter()
const route = useRoute()

// ==================== 状态 ====================

const profileId = computed(() => Number(route.params.id))
const profileTitle = ref('')
const isRunning = ref(false)
const activeTab = ref('live')

// 实时 Cookie 列表
const cookieList = ref<CookieItem[]>([])
const loading = ref(false)
const clearing = ref(false)

// Cookie 表格分页配置
const cookiePagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  size: 'small',
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`
})

function handleCookieTableChange(pag: any) {
  // pageSize 变化时回到第一页
  if (pag.pageSize !== cookiePagination.pageSize) {
    cookiePagination.current = 1
  } else {
    cookiePagination.current = pag.current
  }
  cookiePagination.pageSize = pag.pageSize
}

// cookieList 变化时同步 total
watch(cookieList, (list) => {
  cookiePagination.total = list.length
})

// 导入
const importMode = ref('paste')
const cookieText = ref('')
const importFileJson = ref<string | null>(null)
const importing = ref(false)
const importResult = ref<{ success: boolean; message: string } | null>(null)

// ==================== 计算属性 ====================

const cookiePlaceholder = computed(() => {
  return '粘贴 JSON 数组，例如：\n[\n  {\n    "name": "session_id",\n    "value": "abc123",\n    "domain": ".example.com",\n    "path": "/"\n  }\n]'
})

const canImport = computed(() => {
  if (importMode.value === 'paste') {
    return cookieText.value.trim().length > 0
  } else {
    return importFileJson.value !== null
  }
})

// ==================== 表格列定义 ====================

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
  { title: '值', dataIndex: 'value', key: 'value', ellipsis: true },
  { title: '域名', dataIndex: 'domain', key: 'domain', width: 120 },
  { title: '路径', dataIndex: 'path', key: 'path', width: 80 },
  { title: '安全', dataIndex: 'secure', key: 'secure', width: 60 },
  { title: 'HttpOnly', dataIndex: 'httpOnly', key: 'httpOnly', width: 80 },
  { title: '过期时间', dataIndex: 'expires', key: 'expires', width: 140 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' },
]

// ==================== API 调用 ====================

/**
 * 获取窗口详情
 */
async function loadProfileDetail() {
  try {
    const api = await import('../api/profile')
    const res = await api.getProfileDetail(profileId.value)
    profileTitle.value = res.title || ''

    // ✅ Phase 4.0: 通过 /profiles/status 接口获取运行状态
    const statusRes = await api.getProfilesStatus()
    console.log('[CookieManager] getProfilesStatus 返回:', JSON.stringify(statusRes))
    isRunning.value = statusRes.runningIds?.includes(profileId.value) || false
    console.log('[CookieManager] Profile', profileId.value, '运行状态:', isRunning.value)
  } catch (e: any) {
    console.error('加载窗口详情失败:', e)
  }
}

/**
 * 加载实时 Cookie
 */
async function loadCookies() {
  if (!isRunning.value) {
    message.warning('窗口未运行，无法获取 Cookie')
    return
  }

  loading.value = true
  try {
    const res = await request.get(`/cookie-manager/${profileId.value}/live-cookies`)
    const json = res.data
    if (json.code === 0) {
      cookieList.value = json.data || []
    } else {
      message.error(json.message || '获取 Cookie 失败')
    }
  } catch (e: any) {
    message.error('获取 Cookie 失败: ' + (e.response?.data?.message || e.message))
  } finally {
    loading.value = false
  }
}

/**
 * 清空全部 Cookie
 */
async function clearCookies() {
  if (!isRunning.value) {
    message.warning('窗口未运行')
    return
  }

  Modal.confirm({
    title: '确认清空',
    content: `确定要清空 Profile ${profileId.value} 的所有 Cookie 吗？`,
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      clearing.value = true
      try {
        const res = await request.delete(`/cookie-manager/${profileId.value}/live-cookies`)
        const json = res.data
        if (json.code === 0) {
          message.success('Cookie 已清空')
          cookieList.value = []
        } else {
          message.error(json.message || '清空失败')
        }
      } catch (e: any) {
        message.error('清空失败: ' + (e.response?.data?.message || e.message))
      } finally {
        clearing.value = false
      }
    }
  })
}

/**
 * 删除单个 Cookie
 */
async function deleteSingleCookie(cookie: CookieItem) {
  if (!isRunning.value) return

  try {
    const res = await request.post(`/cookie-manager/${profileId.value}/live-cookies/delete`, {
      name: cookie.name,
      domain: cookie.domain
    })
    const json = res.data
    if (json.code === 0) {
      message.success('Cookie 已删除')
      loadCookies()
    } else {
      message.error(json.message || '删除失败')
    }
  } catch (e: any) {
    message.error('删除失败: ' + (e.response?.data?.message || e.message))
  }
}

/**
 * 导入 Cookie（实时）
 */
async function handleImport() {
  if (!isRunning.value) {
    message.warning('窗口未运行，请先启动窗口')
    return
  }

  let cookies: CookieItem[] = []
  try {
    if (importMode.value === 'paste') {
      cookies = JSON.parse(cookieText.value)
    } else if (importFileJson.value) {
      cookies = JSON.parse(importFileJson.value)
    }
  } catch (e) {
    message.error('JSON 格式错误: ' + (e as Error).message)
    return
  }

  if (!Array.isArray(cookies) || cookies.length === 0) {
    message.warning('Cookie 数据为空')
    return
  }

  importing.value = true
  importResult.value = null

  try {
    const res = await request.post(`/cookie-manager/${profileId.value}/live-cookies/import`, { cookies })
    const json = res.data
    importResult.value = {
      success: json.code === 0,
      message: json.message || (json.code === 0 ? '导入成功' : '导入失败')
    }
    if (json.code === 0) {
      loadCookies()
    }
  } catch (e: any) {
    importResult.value = { success: false, message: '导入失败: ' + (e.response?.data?.message || e.message) }
  } finally {
    importing.value = false
  }
}

// ==================== 工具函数 ====================

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

function copyCookie(cookie: CookieItem) {
  const text = JSON.stringify(cookie, null, 2)
  navigator.clipboard.writeText(text).then(() => {
    message.success('已复制到剪贴板')
  }).catch(() => {
    message.error('复制失败')
  })
}

function beforeUpload(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    importFileJson.value = e.target?.result as string
  }
  reader.readAsText(file)
  return false
}

// ==================== 导航 ====================

function handleBack() {
  router.push('/profile')
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await loadProfileDetail()
  if (isRunning.value) {
    loadCookies()
  }
})
</script>

<style scoped>
.cookie-manager-container {
  padding: 0;
}

.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  margin: 0 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.text-wrap {
  word-break: break-all;
  max-width: 300px;
  display: inline-block;
}
</style>