<template>
  <div class="auth-page">
    <a-card class="auth-card" :bordered="false">
      <div class="auth-header">
        <div class="auth-logo">👻</div>
        <h2 class="auth-title">GhostBrowse</h2>
        <p class="auth-subtitle">创建新账号</p>
      </div>

      <a-form
        :model="form"
        :rules="rules"
        @finish="handleSubmit"
        layout="vertical"
      >
        <a-form-item name="email" label="邮箱">
          <a-input
            v-model:value="form.email"
            placeholder="请输入邮箱地址"
            size="large"
            allow-clear
          >
            <template #prefix>
              <MailOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="code" label="验证码">
          <div class="code-input-wrapper">
            <a-input
              v-model:value="form.code"
              placeholder="请输入6位验证码"
              size="large"
              :maxlength="6"
              class="code-input"
            >
              <template #prefix>
                <SafetyOutlined />
              </template>
            </a-input>
            <a-button
              size="large"
              :disabled="codeCountdown > 0"
              @click="handleSendCode"
              class="send-code-btn"
            >
              {{ codeCountdown > 0 ? `${codeCountdown}s后重发` : '发送验证码' }}
            </a-button>
          </div>
        </a-form-item>

        <a-form-item name="password" label="密码">
          <a-input-password
            v-model:value="form.password"
            placeholder="6-32个字符"
            size="large"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item name="confirmPassword" label="确认密码">
          <a-input-password
            v-model:value="form.confirmPassword"
            placeholder="请再次输入密码"
            size="large"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            size="large"
            block
            :loading="loading"
          >
            注册
          </a-button>
        </a-form-item>
      </a-form>

      <div class="auth-footer">
        <span>已有账号？</span>
        <router-link to="/login">去登录</router-link>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { MailOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { register, sendCode } from '../api/auth'

const router = useRouter()

// 表单数据
const form = reactive({
  email: '',
  code: '',
  password: '',
  confirmPassword: ''
})

// 加载状态
const loading = ref(false)

// 验证码倒计时
const CODE_COUNTDOWN_KEY = 'ghostbrowse_register_code_countdown'
const CODE_COUNTDOWN_DURATION = 60 // 60秒
let countdownInterval: number | null = null
const codeCountdown = ref(0)

// 初始化倒计时状态
onMounted(() => {
  const savedEndTime = sessionStorage.getItem(CODE_COUNTDOWN_KEY)
  if (savedEndTime) {
    const remaining = Math.max(0, Math.ceil((parseInt(savedEndTime) - Date.now()) / 1000))
    if (remaining > 0) {
      codeCountdown.value = remaining
      startCountdown(remaining)
    } else {
      sessionStorage.removeItem(CODE_COUNTDOWN_KEY)
    }
  }
})

// 清理定时器
onBeforeUnmount(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
})

// 开始倒计时
function startCountdown(seconds: number) {
  codeCountdown.value = seconds
  const endTime = Date.now() + seconds * 1000
  sessionStorage.setItem(CODE_COUNTDOWN_KEY, endTime.toString())

  if (countdownInterval) {
    clearInterval(countdownInterval)
  }

  countdownInterval = window.setInterval(() => {
    const remaining = Math.max(0, Math.ceil((parseInt(sessionStorage.getItem(CODE_COUNTDOWN_KEY) || '0') - Date.now()) / 1000))
    codeCountdown.value = remaining
    if (remaining <= 0) {
      if (countdownInterval) {
        clearInterval(countdownInterval)
        countdownInterval = null
      }
      sessionStorage.removeItem(CODE_COUNTDOWN_KEY)
    }
  }, 1000)
}

// 发送验证码
async function handleSendCode() {
  // 邮箱格式校验
  if (!form.email?.trim()) {
    message.error('请输入邮箱')
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    message.error('邮箱格式不正确')
    return
  }

  try {
    const res: any = await sendCode({ email: form.email, purpose: 'register' })
    if (res.data?.code === 200) {
      message.success('验证码已发送到邮箱')
      startCountdown(CODE_COUNTDOWN_DURATION)
    } else {
      message.error(res.data?.message || res.message || '发送验证码失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || err.message || '发送验证码失败')
  }
}

// 表单校验规则
const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    { len: 6, message: '验证码为6位', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '长度 6-32 字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string) => {
        if (value !== form.password) return Promise.reject('两次密码不一致')
        return Promise.resolve()
      },
      trigger: 'blur'
    }
  ]
}

// 提交表单
async function handleSubmit() {
  loading.value = true
  try {
    const res: any = await register(form)
    if (res.data?.code === 200 && res.data?.data) {
      message.success('注册成功，请登录')
      router.push('/login')
    } else {
      message.error(res.data?.message || res.message || '注册失败')
    }
  } catch (err: any) {
    if (err.response?.status === 409) {
      message.error('该邮箱已被注册')
    } else {
      message.error(err.response?.data?.message || err.message || '注册失败')
    }
  } finally {
    loading.value = false
  }
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
  width: 420px;
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

.code-input-wrapper {
  display: flex;
  gap: 8px;
}

.code-input {
  flex: 1;
}

.send-code-btn {
  flex-shrink: 0;
  min-width: 120px;
}
</style>
