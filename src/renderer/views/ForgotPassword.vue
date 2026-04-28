<template>
  <div class="auth-page">
    <a-card class="auth-card" :bordered="false">
      <div class="auth-header">
        <div class="auth-logo">👻</div>
        <h2 class="auth-title">GhostBrowse</h2>
        <p class="auth-subtitle">忘记密码 - 找回账号</p>
      </div>

      <a-form
        :model="form"
        :rules="rules"
        @finish="handleSubmit"
        layout="vertical"
      >
        <a-form-item name="username" label="用户名">
          <a-input
            v-model:value="form.username"
            placeholder="请输入用户名"
            size="large"
            allow-clear
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="email" label="注册邮箱">
          <a-input
            v-model:value="form.email"
            placeholder="请输入注册时填写的邮箱"
            size="large"
            allow-clear
          >
            <template #prefix>
              <MailOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            size="large"
            block
            :loading="loading"
          >
            获取重置令牌
          </a-button>
        </a-form-item>
      </a-form>

      <div class="auth-footer">
        <span>想起密码了？</span>
        <router-link to="/login">去登录</router-link>
      </div>
    </a-card>

    <!-- Phase 1.8: 令牌显示弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      title="重置令牌已生成"
      :footer="null"
      width="500px"
    >
      <div class="token-display">
        <a-alert
          message="令牌有效期 1 小时，请妥善保存或立即使用"
          type="info"
          show-icon
          style="margin-bottom: 16px"
        />

        <div class="token-section">
          <div class="token-label">重置令牌</div>
          <div class="token-value">
            <code>{{ resetToken }}</code>
            <a-button
              type="text"
              size="small"
              @click="copyToken"
            >
              复制
            </a-button>
          </div>
        </div>

        <div class="token-section">
          <div class="token-label">重置链接</div>
          <div class="token-link">
            <code>{{ resetLink }}</code>
          </div>
        </div>

        <div class="token-actions">
          <a-button type="primary" @click="goToReset">
            前往重置
          </a-button>
          <a-button @click="modalVisible = false">
            稍后
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { UserOutlined, MailOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { forgotPassword } from '../api/auth'

const router = useRouter()

// 表单数据
const form = reactive({
  username: '',
  email: ''
})

// 加载状态
const loading = ref(false)

// 弹窗状态
const modalVisible = ref(false)

// 重置令牌
const resetToken = ref('')

// 重置链接
const resetLink = computed(() => {
  return `${window.location.origin}/#/reset-password?token=${resetToken.value}`
})

// 表单校验规则
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
  ]
}

// 提交表单
async function handleSubmit() {
  loading.value = true
  try {
    const res: any = await forgotPassword(form)
    if (res.data?.code === 200 && res.data?.data) {
      resetToken.value = res.data.data.resetToken
      modalVisible.value = true
    } else {
      message.error(res.data?.message || res.message || '获取令牌失败')
    }
  } catch (err: any) {
    if (err.response?.status === 404) {
      message.error('用户不存在或信息不匹配')
    } else {
      message.error(err.response?.data?.message || err.message || '获取令牌失败')
    }
  } finally {
    loading.value = false
  }
}

// 复制令牌
async function copyToken() {
  try {
    await navigator.clipboard.writeText(resetToken.value)
    message.success('令牌已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动复制')
  }
}

// 前往重置页面
function goToReset() {
  modalVisible.value = false
  router.push(`/reset-password?token=${resetToken.value}`)
}
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.auth-card {
  width: 400px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-logo {
  font-size: 48px;
  margin-bottom: 8px;
}

.auth-title {
  font-size: 24px;
  font-weight: 600;
  color: #262626;
  margin: 0 0 8px 0;
}

.auth-subtitle {
  font-size: 14px;
  color: #8c8c8c;
  margin: 0;
}

.auth-footer {
  text-align: center;
  font-size: 14px;
  color: #8c8c8c;
}

.auth-footer a {
  color: #1890ff;
  text-decoration: none;
}

.auth-footer a:hover {
  text-decoration: underline;
}

/* 令牌显示弹窗样式 */
.token-display {
  padding: 8px 0;
}

.token-section {
  margin-bottom: 16px;
}

.token-label {
  font-size: 14px;
  color: #8c8c8c;
  margin-bottom: 8px;
}

.token-value {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
}

.token-value code {
  flex: 1;
  font-family: monospace;
  word-break: break-all;
}

.token-link {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-link code {
  font-family: monospace;
  word-break: break-all;
}

.token-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
