<template>
  <div class="proxy-list-container">
    <div class="page-header">
      <h1 class="page-title">🌐 代理管理</h1>
      <a-button type="primary" size="large" @click="handleCreateProxy">
        ➕ 新建代理
      </a-button>
    </div>

    <a-card :bordered="false">
      <template #title>
        <span>代理列表</span>
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
          <a-input-search
            v-model:value="searchKeyword"
            placeholder="搜索代理名称..."
            style="width: 200px"
            @search="handleSearch"
          />
        </a-space>
      </template>

      <!-- 优化1：a-table 开启 row-selection 多选功能 -->
      <a-table
        :columns="columns"
        :data-source="proxyList"
        :loading="loading"
        :pagination="pagination"
        :row-selection="{ selectedRowKeys, onChange: onSelectChange }"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <a-tag :color="getTypeColor(record.type)">
              {{ record.type.toUpperCase() }}
            </a-tag>
          </template>
          
          <template v-else-if="column.key === 'host'">
            <span>{{ record.host }}:{{ record.port }}</span>
          </template>
          
          <template v-else-if="column.key === 'auth'">
            <a-tag v-if="record.username" color="blue">🔐 已设置</a-tag>
            <a-tag v-else color="default">无</a-tag>
          </template>
          
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              <a-popconfirm
                title="确定要删除这个代理吗？"
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

    <!-- 提示信息 -->
    <a-card :bordered="false" style="margin-top: 16px;">
      <a-alert type="info" show-icon>
        <template #message>
          <span>Phase 1.0 提示</span>
        </template>
        <template #description>
          <span>代理管理功能正在开发中，当前显示的是空数据占位。第二阶段将实现完整的 CRUD 操作。</span>
        </template>
      </a-alert>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { getProxyList, deleteProxy, batchDeleteProxy, type ProxyRecord } from '../api/proxy'

const router = useRouter()

// 表格列定义
const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
    width: 150
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 100
  },
  {
    title: 'Host:Port',
    dataIndex: 'host',
    key: 'host',
    width: 200
  },
  {
    title: '认证',
    dataIndex: 'auth',
    key: 'auth',
    width: 100
  },
  {
    title: '备注',
    dataIndex: 'remark',
    key: 'remark',
    ellipsis: true
  },
  {
    title: '操作',
    key: 'action',
    width: 150,
    fixed: 'right'
  }
]

// 代理列表数据
const proxyList = ref<ProxyRecord[]>([])

// 搜索关键词
const searchKeyword = ref('')

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
const selectedRows = ref<ProxyRecord[]>([])

/**
 * 选中项变化回调
 */
function onSelectChange(keys: number[], rows: ProxyRecord[]) {
  selectedRowKeys.value = keys
  selectedRows.value = rows
}

// 获取代理类型对应的颜色
function getTypeColor(type: string): string {
  const colorMap: Record<string, string> = {
    http: 'blue',
    https: 'green',
    socks5: 'purple'
  }
  return colorMap[type] || 'default'
}

// 搜索
function handleSearch() {
  pagination.value.current = 1
  loadProxyList()
}

// 表格变化处理
function handleTableChange(pag: any) {
  pagination.value.current = pag.current
  pagination.value.pageSize = pag.pageSize
  loadProxyList()
}

// 加载代理列表
async function loadProxyList() {
  loading.value = true
  try {
    const list = await getProxyList(searchKeyword.value)
    proxyList.value = list
    pagination.value.total = list.length
  } catch (error) {
    console.error('加载代理列表失败:', error)
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

// 新建代理
function handleCreateProxy() {
  router.push('/proxy/new')
}

// 编辑代理
function handleEdit(record: ProxyRecord) {
  router.push({ path: '/proxy/edit', query: { id: String(record.id) } })
}

// 删除代理（单个）
async function handleDelete(record: ProxyRecord) {
  try {
    await deleteProxy(record.id)
    message.success('删除成功')
    // 清空选中状态
    selectedRowKeys.value = selectedRowKeys.value.filter(key => key !== record.id)
    loadProxyList()
  } catch (error) {
    console.error('删除代理失败:', error)
    message.error('删除失败')
  }
}

// 优化2：批量删除（使用数组一次性提交）
async function handleBatchDelete() {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择要删除的代理')
    return
  }

  const count = selectedRowKeys.value.length
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除选中的 ${count} 条代理吗？此操作不可恢复。`,
    okText: '确认',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      try {
        // 使用批量删除 API，一次性传递 ID 数组
        const result = await batchDeleteProxy(selectedRowKeys.value)
        message.success(`批量删除成功，共删除 ${result.deletedCount} 条`)
      } catch (error: any) {
        console.error('批量删除失败:', error)
        message.error(error?.response?.data?.message || '批量删除失败')
      } finally {
        // 清空选中状态
        selectedRowKeys.value = []
        selectedRows.value = []
        // 刷新列表
        loadProxyList()
      }
    }
  })
}

onMounted(() => {
  loadProxyList()
})
</script>

<style scoped>
.proxy-list-container {
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
