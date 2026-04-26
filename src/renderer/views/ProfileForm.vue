<template>
  <div class="profile-form-container">
    <!-- 优化3：页面标题区增加返回按钮 -->
    <div class="page-header">
      <a-button type="link" @click="handleBack">
        <LeftOutlined /> 返回
      </a-button>
      <h1 class="page-title">{{ isEdit ? '✏️ 编辑窗口' : '➕ 新建窗口' }}</h1>
    </div>

    <a-form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="profile-form"
    >
      <!-- 基本信息卡片 -->
      <a-card title="基本信息" :bordered="false" style="margin-bottom: 16px;">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="窗口标题" name="title">
              <a-input
                v-model:value="formState.title"
                placeholder="如：账号1-美国代理"
                :maxlength="50"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="绑定代理" name="proxyId">
              <a-select
                v-model:value="formState.proxyId"
                placeholder="选择代理（可选）"
                allowClear
              >
                <a-select-option v-for="proxy in proxyList" :key="proxy.id" :value="proxy.id">
                  {{ proxy.name }} ({{ proxy.host }}:{{ proxy.port }})
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <!-- 浏览器指纹卡片 -->
      <a-card title="🖥️ 浏览器指纹" :bordered="false" style="margin-bottom: 16px;">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="Chrome 版本" name="chromeVersion">
              <a-select v-model:value="formState.chromeVersion">
                <a-select-option value="124">Chrome 124</a-select-option>
                <a-select-option value="128">Chrome 128</a-select-option>
                <a-select-option value="130">Chrome 130</a-select-option>
                <a-select-option value="132">Chrome 132</a-select-option>
                <a-select-option value="134">Chrome 134</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="操作系统" name="os">
              <a-select v-model:value="formState.os">
                <a-select-option value="windows">Windows</a-select-option>
                <a-select-option value="mac">macOS</a-select-option>
                <a-select-option value="linux">Linux</a-select-option>
                <a-select-option value="android">Android</a-select-option>
                <a-select-option value="ios">iOS</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="界面语言" name="uiLanguage">
              <a-select v-model:value="formState.uiLanguage">
                <a-select-option value="zh-CN">简体中文</a-select-option>
                <a-select-option value="zh-TW">繁体中文</a-select-option>
                <a-select-option value="en-US">English</a-select-option>
                <a-select-option value="ja-JP">日本語</a-select-option>
                <a-select-option value="ko-KR">한국어</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="屏幕分辨率" name="screenResolution">
              <a-select v-model:value="formState.screenResolution">
                <a-select-option value="1920x1080">1920×1080</a-select-option>
                <a-select-option value="1366x768">1366×768</a-select-option>
                <a-select-option value="1536x864">1536×864</a-select-option>
                <a-select-option value="2560x1440">2560×1440</a-select-option>
                <a-select-option value="3840x2160">3840×2160</a-select-option>
                <a-select-option value="1280x720">1280×720</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="字体" name="font">
              <a-select v-model:value="formState.font">
                <a-select-option value="Microsoft YaHei">微软雅黑</a-select-option>
                <a-select-option value="SimSun">宋体</a-select-option>
                <a-select-option value="Arial">Arial</a-select-option>
                <a-select-option value="Times New Roman">Times New Roman</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="语言模式" name="languageMode">
              <a-select v-model:value="formState.languageMode">
                <a-select-option value="mask">模拟浏览器</a-select-option>
                <a-select-option value="timezone">使用代理时区</a-select-option>
                <a-select-option value="custom">自定义</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <!-- 高级指纹卡片 -->
      <a-card title="🔒 高级指纹保护" :bordered="false" style="margin-bottom: 16px;">
        <a-row :gutter="16">
          <a-col :span="6">
            <a-form-item label="WebRTC 防护" name="webrtcMode">
              <a-select v-model:value="formState.webrtcMode">
                <a-select-option value="forward">使用真实IP</a-select-option>
                <a-select-option value="replace">替换为代理IP</a-select-option>
                <a-select-option value="disable">完全禁用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="Canvas 指纹" name="canvasMode">
              <a-select v-model:value="formState.canvasMode">
                <a-select-option value="noise">添加噪声</a-select-option>
                <a-select-option value="block">屏蔽</a-select-option>
                <a-select-option value="fake">模拟</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="WebGL 指纹" name="webglMode">
              <a-select v-model:value="formState.webglMode">
                <a-select-option value="mock">模拟WebGL</a-select-option>
                <a-select-option value="disable">禁用WebGL</a-select-option>
                <a-select-option value="real">使用真实</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="媒体设备" name="mediaDeviceMode">
              <a-select v-model:value="formState.mediaDeviceMode">
                <a-select-option value="mock">模拟设备</a-select-option>
                <a-select-option value="disable">禁用设备</a-select-option>
                <a-select-option value="real">使用真实</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="时区模式" name="timezoneMode">
              <a-select v-model:value="formState.timezoneMode">
                <a-select-option value="ip">跟随代理IP</a-select-option>
                <a-select-option value="custom">自定义时区</a-select-option>
                <a-select-option value="real">使用真实时区</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="地理位置" name="geolocationMode">
              <a-select v-model:value="formState.geolocationMode">
                <a-select-option value="ip">跟随代理IP</a-select-option>
                <a-select-option value="custom">自定义位置</a-select-option>
                <a-select-option value="real">使用真实位置</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
      </a-card>

      <!-- 按钮区域 -->
      <div class="form-actions">
        <a-space>
          <a-button type="primary" @click="handleSubmit" :loading="submitting">
            {{ isEdit ? '保存修改' : '创建窗口' }}
          </a-button>
          <!-- 优化3：保留取消按钮也返回列表 -->
          <a-button @click="handleBack">取消</a-button>
        </a-space>
      </div>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { LeftOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import { getProxyList, type ProxyRecord } from '../api/proxy'
import { getProfileDetail, createProfile, updateProfile, type ProfileDto, type ProfileRecord, type WebRtcMode } from '../api/profile'

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

// 表单数据（使用 any 类型避免 font 字段类型冲突）
const formState: any = reactive({
  title: '',
  proxyId: undefined,
  chromeVersion: '128',
  os: 'windows',
  webrtcMode: 'replace',
  timezoneMode: 'ip',
  geolocationMode: 'ip',
  languageMode: 'mask',
  uiLanguage: 'zh-CN',
  screenResolution: '1920x1080',
  font: 'Microsoft YaHei,Arial',
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

// 加载代理列表
async function loadProxyList() {
  try {
    const list = await getProxyList()
    proxyList.value = list
  } catch (error) {
    console.error('加载代理列表失败:', error)
  }
}

// 加载窗口详情
async function loadProfileDetail() {
  if (!editId.value) return

  try {
    const data = await getProfileDetail(editId.value) as ProfileRecord
    formState.title = data.title
    formState.proxyId = data.proxyId ?? undefined
    formState.chromeVersion = data.chromeVersion
    formState.os = data.os
    formState.webrtcMode = data.webrtcMode
    formState.timezoneMode = data.timezoneMode
    formState.geolocationMode = data.geolocationMode
    formState.languageMode = data.languageMode
    formState.uiLanguage = data.uiLanguage
    formState.screenResolution = data.screenResolution
    formState.font = data.font ? data.font.split(',') : []
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
    // 构建提交数据
    const submitData: ProfileDto = {
      ...formState,
      font: Array.isArray(formState.font) ? formState.font.join(',') : formState.font
    }

    if (isEdit.value && editId.value) {
      await updateProfile(editId.value, submitData)
      message.success('修改成功')
    } else {
      await createProfile(submitData)
      message.success('创建成功')
    }
    router.push('/profile')
  } catch (error: any) {
    console.error('提交失败:', error)
    message.error(error?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

// 优化3：返回按钮处理函数
function handleBack() {
  router.push('/profile')
}

// 取消（已改为调用 handleBack）
function handleCancel() {
  handleBack()
}

onMounted(async () => {
  await loadProxyList()
  if (isEdit.value) {
    loadProfileDetail()
  }
})
</script>

<style scoped>
.profile-form-container {
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

.profile-form {
  margin-top: 16px;
}

.form-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: 8px;
}
</style>
