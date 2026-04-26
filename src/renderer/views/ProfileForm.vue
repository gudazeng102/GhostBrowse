<template>
  <div class="profile-form-container">
    <h1 class="page-title">{{ isEdit ? '✏️ 编辑窗口' : '➕ 新建窗口' }}</h1>

    <a-form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="profile-form"
    >
      <!-- 上半部分：左右分栏 -->
      <a-row :gutter="24">
        <!-- 左侧：基础配置 -->
        <a-col :span="12">
          <a-card title="基础配置" :bordered="false">
            <a-form-item label="窗口标题" name="title">
              <a-input
                v-model:value="formState.title"
                placeholder="请输入窗口标题，如：美国代理窗口"
                :maxlength="50"
              />
            </a-form-item>

            <a-form-item label="代理" name="proxyId">
              <a-select
                v-model:value="formState.proxyId"
                placeholder="请选择代理（可选）"
                allowClear
                :loading="proxyLoading"
              >
                <a-select-option v-for="proxy in proxyList" :key="proxy.id" :value="proxy.id">
                  {{ proxy.name }} ({{ proxy.host }}:{{ proxy.port }})
                </a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="Chrome 版本" name="chromeVersion">
              <a-select v-model:value="formState.chromeVersion" placeholder="请选择 Chrome 版本">
                <a-select-option value="124">Chrome 124</a-select-option>
                <a-select-option value="128">Chrome 128</a-select-option>
                <a-select-option value="130">Chrome 130</a-select-option>
                <a-select-option value="132">Chrome 132</a-select-option>
                <a-select-option value="134">Chrome 134</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="操作系统">
              <a-select v-model:value="formState.os" disabled>
                <a-select-option value="Windows">Windows</a-select-option>
              </a-select>
            </a-form-item>
          </a-card>
        </a-col>

        <!-- 右侧：指纹配置 -->
        <a-col :span="12">
          <a-card title="指纹配置" :bordered="false">
            <a-form-item label="WebRTC">
              <a-select v-model:value="formState.webrtcMode">
                <a-select-option value="forward">转发（保持原样）</a-select-option>
                <a-select-option value="replace">替换真实（显示代理IP）</a-select-option>
                <a-select-option value="disable">禁用（完全阻止）</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="时区">
              <a-select v-model:value="formState.timezoneMode" disabled>
                <a-select-option value="ip">基于 IP（自动获取）</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="地理位置">
              <a-select v-model:value="formState.geolocationMode" disabled>
                <a-select-option value="ip">基于 IP（自动获取）</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="语言">
              <a-select v-model:value="formState.languageMode" disabled>
                <a-select-option value="ip">基于 IP（自动获取）</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="界面语言">
              <a-select v-model:value="formState.uiLanguage" disabled>
                <a-select-option value="zh-CN">中文</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="分辨率">
              <a-select v-model:value="formState.screenResolution" disabled>
                <a-select-option value="1920x1080">1920×1080（16寸笔记本）</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="字体">
              <a-select v-model:value="formState.font" disabled>
                <a-select-option value="default">默认</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="Canvas 指纹">
              <a-select v-model:value="formState.canvasMode">
                <a-select-option value="default">默认</a-select-option>
                <a-select-option value="noise">简单噪声</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="WebGL 图像">
              <a-select v-model:value="formState.webglMode">
                <a-select-option value="default">默认</a-select-option>
                <a-select-option value="mock">固定伪装值</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item label="媒体设备">
              <a-select v-model:value="formState.mediaDeviceMode">
                <a-select-option value="default">默认</a-select-option>
                <a-select-option value="mock">固定列表</a-select-option>
              </a-select>
            </a-form-item>
          </a-card>
        </a-col>
      </a-row>

      <!-- 下半部分：代理检测 -->
      <a-card title="代理检测" :bordered="false" style="margin-top: 16px;">
        <template #extra>
          <a-tag v-if="isEdit" color="green">✅ 已保存窗口</a-tag>
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
                :disabled="!selectedProxyId"
              >
                🔍 检测代理
              </a-button>
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider />

        <!-- 检测结果 -->
        <a-alert
          v-if="checkResult"
          :type="checkResult.status === 'success' ? 'success' : 'error'"
          show-icon
          style="margin-bottom: 16px;"
        >
          <template #message>
            <span v-if="checkResult.status === 'success'">
              检测成功：{{ checkResult.ip }} - {{ checkResult.region }}（延迟：{{ checkResult.latency }}ms）
            </span>
            <span v-else>
              检测失败：{{ checkResult.error || '连接超时' }}
            </span>
          </template>
        </a-alert>

        <a-empty v-if="!checkResult && !checkLoading" description="暂无检测结果，请先选择一个代理并点击检测" />
        <a-spin v-if="checkLoading" />
      </a-card>

      <!-- 按钮区域 -->
      <div class="form-actions" style="margin-top: 16px;">
        <a-space>
          <a-button type="primary" @click="handleSubmit" :loading="submitting">
            {{ isEdit ? '保存修改' : '保存' }}
          </a-button>
          <a-button @click="handleCancel">取消</a-button>
        </a-space>
      </div>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'
import { 
  getProfileDetail, 
  createProfile, 
  updateProfile,
  type ProfileDto 
} from '../api/profile'
import { getProxyList, checkProxy, type ProxyRecord, type CheckChannel } from '../api/proxy'

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()

// 判断是新建还是编辑模式
const isEdit = computed(() => !!route.query.id)
const editId = computed(() => route.query.id ? Number(route.query.id) : null)

// 提交状态
const submitting = ref(false)

// 代理列表
const proxyList = ref<ProxyRecord[]>([])
const proxyLoading = ref(false)

// 当前选中的代理 ID
const selectedProxyId = computed(() => formState.proxyId)

// 表单数据
const formState = reactive<ProfileDto>({
  title: '',
  proxyId: undefined,
  chromeVersion: '128',
  os: 'Windows',
  webrtcMode: 'replace',
  timezoneMode: 'ip',
  geolocationMode: 'ip',
  languageMode: 'ip',
  uiLanguage: 'zh-CN',
  screenResolution: '1920x1080',
  font: 'default',
  canvasMode: 'noise',
  webglMode: 'mock',
  mediaDeviceMode: 'mock'
})

// 表单校验规则
const rules = {
  title: [
    { required: true, message: '请输入窗口标题', trigger: 'blur' }
  ]
}

// ==================== 代理检测相关 ====================

/** 检测渠道 */
const checkChannel = ref<CheckChannel>('ip.sb')
const checkLoading = ref(false)
const checkResult = ref<any>(null)

/** 加载代理列表 */
async function loadProxyList() {
  proxyLoading.value = true
  try {
    const list = await getProxyList()
    proxyList.value = list
  } catch (error) {
    console.error('加载代理列表失败:', error)
  } finally {
    proxyLoading.value = false
  }
}

/** 检测代理 */
async function handleCheckProxy() {
  if (!formState.proxyId) {
    message.warning('请先选择一个代理')
    return
  }
  
  checkLoading.value = true
  checkResult.value = null
  try {
    const result = await checkProxy(formState.proxyId, checkChannel.value)
    checkResult.value = {
      status: result.status,
      ip: result.ip,
      region: result.region,
      latency: result.latency,
      error: result.error
    }
    
    if (result.status === 'success') {
      message.success(`检测成功：${result.ip} - ${result.region}`)
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

// 加载窗口详情（编辑模式）
async function loadProfileDetail() {
  if (!editId.value) return
  
  try {
    const data = await getProfileDetail(editId.value)
    formState.title = data.title
    formState.proxyId = data.proxyId || undefined
    formState.chromeVersion = data.chromeVersion
    formState.os = data.os
    formState.webrtcMode = data.webrtcMode
    formState.timezoneMode = data.timezoneMode
    formState.geolocationMode = data.geolocationMode
    formState.languageMode = data.languageMode
    formState.uiLanguage = data.uiLanguage
    formState.screenResolution = data.screenResolution
    formState.font = data.font
    formState.canvasMode = data.canvasMode
    formState.webglMode = data.webglMode
    formState.mediaDeviceMode = data.mediaDeviceMode
  } catch (error) {
    console.error('加载窗口详情失败:', error)
    message.error('加载窗口详情失败')
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
      await updateProfile(editId.value, formState)
      message.success('修改成功')
    } else {
      // 新建
      await createProfile(formState)
      message.success('创建成功')
    }
    // 返回列表页
    router.push('/profile')
  } catch (error: any) {
    console.error('提交失败:', error)
    message.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 取消
function handleCancel() {
  router.push('/profile')
}

onMounted(() => {
  // 加载代理列表
  loadProxyList()
  
  // 编辑模式加载详情
  if (isEdit.value) {
    loadProfileDetail()
  }
})
</script>

<style scoped>
.profile-form-container {
  padding: 0;
}

.page-title {
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 600;
  color: #262626;
}

.profile-form {
  margin-top: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: 8px;
}
</style>
