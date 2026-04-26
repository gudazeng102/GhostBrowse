<template>
  <div class="proxy-form-container">
    <!-- 优化3：页面标题区增加返回按钮 -->
    <div class="page-header">
      <a-button type="link" @click="handleBack">
        <LeftOutlined /> 返回
      </a-button>
      <h1 class="page-title">{{ isEdit ? '✏️ 编辑代理' : '➕ 新建代理' }}</h1>
    </div>

    <a-form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="proxy-form"
    >
      <!-- 上半部分：左右分栏 -->
      <a-row :gutter="24">
        <!-- 左侧：代理类型说明 -->
        <a-col :span="10">
          <a-card title="代理类型说明" :bordered="false">
            <a-typography>
              <a-typography-title :level="4">HTTP</a-typography-title>
              <a-typography-paragraph>
                明文传输协议，适用于普通浏览场景。配置简单，兼容性好。
              </a-typography-paragraph>
              
              <a-typography-title :level="4">HTTPS</a-typography-title>
              <a-typography-paragraph>
                加密传输协议，安全性更高。适用于需要加密通信的场景。
              </a-typography-paragraph>
              
              <a-typography-title :level="4">SOCKS5</a-typography-title>
              <a-typography-paragraph>
                支持 UDP 和身份验证的代理协议。灵活性最高，可用于各种网络应用。
              </a-typography-paragraph>
            </a-typography>

            <a-divider />

            <a-typography-title :level="5">注意事项</a-typography-title>
            <a-typography-paragraph>
              <ul>
                <li>格式：<code>host:port</code></li>
                <li>账号密码可为空（如为空则无需认证）</li>
                <li>端口范围：1-65535</li>
              </ul>
            </a-typography-paragraph>
          </a-card>
        </a-col>

        <!-- 右侧：表单控件 -->
        <a-col :span="14">
          <a-card title="代理配置" :bordered="false">
            <a-form-item label="代理名称" name="name">
              <a-input
                v-model:value="formState.name"
                placeholder="请输入代理名称，如：我的代理"
                :maxlength="50"
              />
            </a-form-item>

            <a-form-item label="代理类型" name="type">
              <a-select v-model:value="formState.type" placeholder="请选择代理类型">
                <a-select-option value="http">HTTP</a-select-option>
                <a-select-option value="https">HTTPS</a-select-option>
                <a-select-option value="socks5">SOCKS5</a-select-option>
              </a-select>
            </a-form-item>

            <a-row :gutter="12">
              <a-col :span="16">
                <a-form-item label="主机地址" name="host">
                  <a-input
                    v-model:value="formState.host"
                    placeholder="如：127.0.0.1 或 proxy.example.com"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="8">
                <a-form-item label="端口" name="port">
                  <a-input-number
                    v-model:value="formState.port"
                    :min="1"
                    :max="65535"
                    placeholder="端口"
                    style="width: 100%"
                  />
                </a-form-item>
              </a-col>
            </a-row>

            <a-row :gutter="12">
              <a-col :span="12">
                <a-form-item label="账号" name="username">
                  <a-input
                    v-model:value="formState.username"
                    placeholder="可选，如无需认证可不填"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="密码" name="password">
                  <a-input-password
                    v-model:value="formState.password"
                    placeholder="可选"
                  />
                </a-form-item>
              </a-col>
            </a-row>

            <a-form-item label="备注" name="remark">
              <a-textarea
                v-model:value="formState.remark"
                placeholder="可选备注信息"
                :rows="2"
                :maxlength="200"
              />
            </a-form-item>

            <a-divider />

            <!-- 按钮区域 -->
            <div class="form-actions">
              <a-space>
                <a-button type="primary" @click="handleSubmit" :loading="submitting">
                  {{ isEdit ? '保存修改' : '保存' }}
                </a-button>
                <!-- 优化3：保留取消按钮也返回列表 -->
                <a-button @click="handleBack">取消</a-button>
              </a-space>
            </div>
          </a-card>
        </a-col>
      </a-row>

      <!-- 下半部分：检测区域 -->
      <a-card title="代理检测" :bordered="false" style="margin-top: 16px;">
        <template #extra>
          <a-tag v-if="isEdit" color="green">✅ 已保存代理</a-tag>
          <a-tag v-else color="orange">⚠️ 请先保存</a-tag>
        </template>
        
        <a-row :gutter="16" align="middle">
          <a-col :span="8">
            <a-form-item label="检测渠道">
              <a-select v-model:value="checkChannel" placeholder="选择检测渠道">
                <a-select-option value="ip.sb">IP.SB</a-select-option>
                <a-select-option value="ipinfo.io">IPInfo</a-select-option>
                <a-select-option value="ip-api.com">IP-API</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label=" " :colon="false">
              <a-button 
                type="primary" 
                @click="handleCheckProxy"
                :loading="checkLoading"
                :disabled="!isEdit"
              >
                🔍 检测当前代理
              </a-button>
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider />

        <!-- 检测结果表格 -->
        <a-table
          :columns="checkColumns"
          :data-source="checkResults"
          :pagination="{ pageSize: 5 }"
          row-key="id"
        >
          <!-- 渠道列：显示友好名称 -->
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'channel'">
              {{ getChannelName(record.channel) }}
            </template>
            
            <!-- 状态列：显示彩色 tag -->
            <template v-else-if="column.key === 'status'">
              <a-tag v-if="record.status === 'success'" color="success">✅ 成功</a-tag>
              <a-tag v-else color="error">❌ 失败</a-tag>
            </template>
            
            <!-- 延迟列：显示数值和单位 -->
            <template v-else-if="column.key === 'latency'">
              {{ record.latency ? record.latency + 'ms' : '-' }}
            </template>
          </template>
          
          <template #emptyText>
            <a-empty description="暂无检测结果，请先点击「检测当前代理」按钮" />
          </template>
        </a-table>
      </a-card>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { LeftOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import { getProxyDetail, createProxy, updateProxy, checkProxy, getProxyChecks, type ProxyRecord, type ProxyDto, type CheckChannel, type ProxyCheckResult } from '../api/proxy'

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()

// 判断是新建还是编辑模式
const isEdit = computed(() => !!route.query.id)
const editId = computed(() => route.query.id ? Number(route.query.id) : null)

// 提交状态
const submitting = ref(false)

// 表单数据
const formState = reactive<ProxyDto>({
  name: '',
  type: 'http',
  host: '',
  port: 1080,
  username: '',
  password: '',
  remark: ''
})

// 表单校验规则
const rules = {
  name: [
    { required: true, message: '请输入代理名称', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择代理类型', trigger: 'change' }
  ],
  host: [
    { required: true, message: '请输入主机地址', trigger: 'blur' }
  ],
  port: [
    { required: true, message: '请输入端口', trigger: 'blur' },
    { type: 'number', min: 1, max: 65535, message: '端口范围 1-65535', trigger: 'blur' }
  ]
}

// ==================== Phase 1.2: 检测相关 ====================

/** 检测渠道选项 */
const channelOptions = [
  { value: 'ip.sb', label: 'IP.SB' },
  { value: 'ipinfo.io', label: 'IPInfo' },
  { value: 'ip-api.com', label: 'IP-API' }
]

/** 检测相关状态 */
const checkChannel = ref<CheckChannel>('ip.sb')
const checkLoading = ref(false)
const checkResults = ref<ProxyCheckResult[]>([])

/** 检测结果表格列定义 */
const checkColumns = [
  { 
    title: '检测渠道', 
    dataIndex: 'channel', 
    key: 'channel',
    width: 120
  },
  { 
    title: '状态', 
    dataIndex: 'status', 
    key: 'status',
    width: 100
  },
  { 
    title: '所在区域', 
    dataIndex: 'region', 
    key: 'region',
    width: 150
  },
  { 
    title: '延迟', 
    dataIndex: 'latency', 
    key: 'latency',
    width: 100
  },
  { 
    title: '检测时间', 
    dataIndex: 'checkedAtStr', 
    key: 'checkedAtStr'
  }
]

/** 获取渠道显示名称 */
function getChannelName(channelId: string): string {
  const channel = channelOptions.find(c => c.value === channelId)
  return channel ? channel.label : channelId
}

/** 加载检测历史 */
async function loadCheckHistory() {
  if (!editId.value) return
  
  try {
    const history = await getProxyChecks(editId.value)
    checkResults.value = history
  } catch (error) {
    console.error('加载检测历史失败:', error)
  }
}

/** 检测代理 */
async function handleCheckProxy() {
  // 新建模式且未保存时，不能检测
  if (!isEdit.value || !editId.value) {
    message.warning('请先保存代理配置后再进行检测')
    return
  }
  
  checkLoading.value = true
  try {
    const result = await checkProxy(editId.value, checkChannel.value)
    
    // 添加到结果列表（插入到最前面）
    checkResults.value.unshift({
      ...result,
      checkedAtStr: new Date(result.checkedAt).toLocaleString('zh-CN')
    })
    
    // 显示结果消息
    if (result.status === 'success') {
      message.success(`检测成功：${result.ip} - ${result.region}（${result.latency}ms）`)
    } else {
      message.error(`检测失败：${result.error || '连接超时'}`)
    }
  } catch (error: any) {
    console.error('检测代理失败:', error)
    message.error(error?.response?.data?.message || '检测失败')
  } finally {
    checkLoading.value = false
  }
}

// 加载代理详情（编辑模式）
async function loadProxyDetail() {
  if (!editId.value) return
  
  try {
    const data = await getProxyDetail(editId.value) as ProxyRecord
    formState.name = data.name
    formState.type = data.type
    formState.host = data.host
    formState.port = data.port
    formState.username = data.username || ''
    formState.password = data.password || ''
    formState.remark = data.remark || ''
  } catch (error) {
    console.error('加载代理详情失败:', error)
    message.error('加载代理详情失败')
  }
}

// 提交表单
async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (isEdit.value && editId.value) {
      // 更新
      await updateProxy(editId.value, formState)
      message.success('修改成功')
    } else {
      // 新建
      await createProxy(formState)
      message.success('创建成功')
    }
    // 返回列表页
    router.push('/proxy')
  } catch (error: any) {
    console.error('提交失败:', error)
    message.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 优化3：返回按钮处理函数
function handleBack() {
  router.push('/proxy')
}

// 取消（已改为调用 handleBack）
function handleCancel() {
  handleBack()
}

onMounted(() => {
  if (isEdit.value) {
    loadProxyDetail()
    loadCheckHistory() // 加载检测历史
  }
})
</script>

<style scoped>
.proxy-form-container {
  padding: 0;
}

/* 优化3：页面标题区布局 */
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

.proxy-form {
  margin-top: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: 8px;
}

code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: Consolas, monospace;
}
</style>
