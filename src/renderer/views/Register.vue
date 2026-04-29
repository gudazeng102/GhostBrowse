<template>
  <div class="auth-page">
    <!-- Left Split: Background Image -->
    <div class="left-split">
      <div class="left-gradient"></div>
      <img 
        class="left-bg-img" 
        alt="Abstract representation of ghostly data streams flowing vertically with a deep blue and cyan ethereal glow in a dark technological void" 
        :src="bgUrl"
      />
      <div class="left-content">
        <h2 class="left-title">开启安全浏览之旅</h2>
        <p class="left-desc">GhostBrowse 提供极致的隐秘性与高效性，让您的数据流动如幽灵般悄无声息且无处不在。</p>
      </div>
    </div>

    <!-- Right Split: Register Form -->
    <div class="right-split">
      <div class="bg-glow"></div>
      
      <a-card class="auth-card glass-card" :bordered="false">
        <!-- Header -->
        <div class="auth-header">
          <div class="logo-wrapper">
            <h1 class="auth-title">创建账号</h1>
          </div>
          <p class="auth-subtitle">加入 GhostBrowse 开启安全浏览</p>
        </div>

        <a-form
          :model="form"
          :rules="rules"
          @finish="handleSubmit"
          layout="vertical"
          class="auth-form"
        >
          <!-- Email Input -->
          <a-form-item name="email" class="form-item-custom">
            <template #label>
              <span class="custom-label">邮箱</span>
            </template>
            <div class="input-wrapper">
              <MailOutlined class="input-icon" />
              <a-input
                v-model:value="form.email"
                placeholder="example@domain.com"
                size="large"
                allow-clear
                class="custom-input"
              />
            </div>
          </a-form-item>

          <!-- Code Input -->
          <a-form-item name="code" class="form-item-custom">
            <template #label>
              <span class="custom-label">验证码</span>
            </template>
            <div class="code-input-wrapper">
              <div class="input-wrapper code-input-inner">
                <SafetyOutlined class="input-icon" />
                <a-input
                  v-model:value="form.code"
                  placeholder="请输入6位验证码"
                  size="large"
                  :maxlength="6"
                  class="custom-input code-input"
                />
              </div>
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

          <!-- Password Input -->
          <a-form-item name="password" class="form-item-custom">
            <template #label>
              <span class="custom-label">密码</span>
            </template>
            <div class="input-wrapper">
              <LockOutlined class="input-icon" />
              <a-input
                v-model:value="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="6-32个字符"
                size="large"
                class="custom-input custom-password"
              />
              <button type="button" class="visibility-btn" @click="showPassword = !showPassword">
                <EyeInvisibleOutlined v-if="showPassword" class="material-icon" />
                <EyeOutlined v-else class="material-icon" />
              </button>
            </div>
          </a-form-item>

          <!-- Confirm Password Input -->
          <a-form-item name="confirmPassword" class="form-item-custom">
            <template #label>
              <span class="custom-label">确认密码</span>
            </template>
            <div class="input-wrapper">
              <LockOutlined class="input-icon" />
              <a-input
                v-model:value="form.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="请再次输入密码"
                size="large"
                class="custom-input custom-password"
              />
              <button type="button" class="visibility-btn" @click="showConfirmPassword = !showConfirmPassword">
                <EyeInvisibleOutlined v-if="showConfirmPassword" class="material-icon" />
                <EyeOutlined v-else class="material-icon" />
              </button>
            </div>
          </a-form-item>

          <!-- Submit Button -->
          <a-form-item class="submit-item">
            <a-button
              type="primary"
              html-type="submit"
              size="large"
              block
              :loading="loading"
              class="submit-btn"
            >
              <span>创建账号</span>
              <ArrowRightOutlined class="btn-arrow" />
            </a-button>
          </a-form-item>
        </a-form>

        <!-- Footer -->
        <div class="auth-footer">
          <router-link to="/login" class="login-link">
            已有账号？立即登录
          </router-link>
        </div>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { MailOutlined, LockOutlined, SafetyOutlined, EyeOutlined, EyeInvisibleOutlined, ArrowRightOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { register, sendCode } from '../api/auth'
import bgUrl from '@/assets/icons/img/login-background.png'

const router = useRouter()

// 密码显示/隐藏
const showPassword = ref(false)
const showConfirmPassword = ref(false)

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
const CODE_COUNTDOWN_DURATION = 60
let countdownInterval: number | null = null
const codeCountdown = ref(0)

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

onBeforeUnmount(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
})

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

async function handleSendCode() {
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
/* ====== 页面布局 ====== */
.auth-page {
  display: flex;
  min-height: 100vh;
  background-color: #0b1326;
  color: #dae2fd;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ====== 左侧分栏 ====== */
.left-split {
  display: none;
  width: 50%;
  position: relative;
  background-color: #060e20;
  overflow: hidden;
}

@media (min-width: 1024px) {
  .left-split {
    display: block;
  }
}

.left-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, #060e20, transparent, #0b1326);
  opacity: 0.6;
  z-index: 10;
}

.left-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.left-content {
  position: relative;
  z-index: 20;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 48px;
  padding-bottom: 96px;
  max-width: 576px;
}

.left-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 38px;
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 16px;
  text-shadow: 0 4px 12px rgba(0,0,0,0.6);
}

.left-desc {
  font-family: 'Inter', sans-serif;
  font-size: 18px;
  line-height: 1.6;
  font-weight: 400;
  color: #c2c6d6;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}

/* ====== 右侧分栏 ====== */
.right-split {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: #0b1326;
  position: relative;
}

@media (min-width: 1024px) {
  .right-split {
    width: 50%;
    padding: 48px;
  }
}

.bg-glow {
  position: absolute;
  width: 400px;
  height: 400px;
  background-color: rgba(173, 198, 255, 0.1);
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
}

/* ====== 玻璃卡片 ====== */
.glass-card {
  background-color: rgba(30, 41, 59, 0.8) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 12px 24px -10px rgba(0,0,0,0.5) !important;
  border-radius: 8px !important;
}

.auth-card {
  width: 100%;
  max-width: 448px;
  padding: 32px;
}

@media (min-width: 1024px) {
  .auth-card {
    padding: 32px;
  }
}

/* ====== 头部区域 ====== */
.auth-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32px;
}

.logo-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.auth-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 700;
  color: #dae2fd;
  letter-spacing: -0.01em;
  margin: 0;
}

.auth-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  font-weight: 400;
  color: #c2c6d6;
  text-align: center;
  margin: 0;
}

/* ====== 表单样式 ====== */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item-custom {
  margin-bottom: 0 !important;
}

.form-item-custom :deep(.ant-form-item-label) {
  padding-bottom: 8px;
}

.form-item-custom :deep(.ant-form-item-label > label) {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  color: #c2c6d6;
  height: auto;
}

.form-item-custom :deep(.ant-form-item-explain) {
  color: #ffb4ab;
  font-size: 12px;
  margin-top: 4px;
}

.form-item-custom :deep(.ant-form-item-control-input) {
  min-height: auto;
}

/* ====== 自定义输入框 ====== */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  color: #424754;
  font-size: 20px;
  z-index: 2;
  pointer-events: none;
}

/* 清除按钮 */
.custom-input :deep(.ant-input-clear-icon) {
  color: #424754;
  margin-right: 8px;
}

.custom-input :deep(.ant-input-clear-icon:hover) {
  color: #c2c6d6;
}

/* 密码框 */
.custom-password :deep(.ant-input) {
  padding-right: 48px !important;
}

.visibility-btn {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #424754;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.2s ease;
  z-index: 2;
}

.visibility-btn:hover {
  color: #adc6ff;
}

.visibility-btn .material-icon {
  font-size: 20px;
}

/* ====== 验证码区域 ====== */
.code-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.code-input-inner {
  flex: 1;
}

.code-input {
  width: 100%;
}

.send-code-btn {
  flex-shrink: 0;
  min-width: 120px;
  height: 48px;
  background: linear-gradient(135deg, #4d8eff 0%, #005ac2 100%) !important;
  border: none !important;
  color: #ffffff !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  border-radius: 8px !important;
  transition: all 0.3s ease !important;
  box-shadow: 0 0 15px rgba(77, 142, 255, 0.3) !important;
}

.send-code-btn:hover {
  background: linear-gradient(135deg, #5c9aff 0%, #0066d9 100%) !important;
  box-shadow: 0 0 25px rgba(77, 142, 255, 0.5) !important;
}

.send-code-btn:active {
  background: linear-gradient(135deg, #3d7eef 0%, #004ea8 100%) !important;
}

.send-code-btn:disabled {
  background: #222a3d !important;
  color: #8c909f !important;
  box-shadow: none !important;
  cursor: not-allowed;
}

/* ====== 提交按钮 ====== */
.submit-item {
  margin-bottom: 0 !important;
  padding-top: 8px;
}

.submit-btn {
  background: linear-gradient(135deg, #4d8eff 0%, #005ac2 100%) !important;
  border: none !important;
  color: #ffffff !important;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  padding-top: 12px !important;
  padding-bottom: 12px !important;
  height: auto !important;
  border-radius: 8px !important;
  transition: all 0.3s ease;
  box-shadow: 0 0 15px rgba(77, 142, 255, 0.3);
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
}

.submit-btn:hover {
  background: linear-gradient(135deg, #5c9aff 0%, #0066d9 100%) !important;
  box-shadow: 0 0 25px rgba(77, 142, 255, 0.5) !important;
  transform: translateY(-1px);
}

.submit-btn:active {
  background: linear-gradient(135deg, #3d7eef 0%, #004ea8 100%) !important;
  transform: translateY(0);
}

.btn-arrow {
  font-size: 16px;
  transition: transform 0.3s ease;
}

.submit-btn:hover .btn-arrow {
  transform: translateX(4px);
}

/* ====== 底部区域 ====== */
.auth-footer {
  margin-top: 24px;
  text-align: center;
}

.login-link {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
  color: #c2c6d6;
  text-decoration: none;
  transition: color 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.login-link:hover {
  color: #adc6ff;
}

/* ====== 覆盖 Ant Design Card 默认样式 ====== */
.auth-card :deep(.ant-card-body) {
  padding: 0;
}
</style>

<!-- 全局样式：覆盖 Ant Design 组件默认样式 -->
<style>
/* ====== 所有 input 基础样式 ====== */
.auth-page .ant-input {
  background-color: #171f33 !important;
  border: 1px solid #424754 !important;
  border-radius: 8px !important;
  color: #dae2fd !important;
  height: 48px !important;
  padding-left: 48px !important;
  padding-right: 16px !important;
  font-size: 16px !important;
  box-shadow: none !important;
  transition: all 0.2s ease !important;
}

.auth-page .ant-input::placeholder {
  color: #8c909f !important;
}

.auth-page .ant-input:focus {
  border-color: #adc6ff !important;
  box-shadow: 0 0 0 1px #adc6ff !important;
}

/* ====== affix-wrapper 外层样式 ====== */
.auth-page .ant-input-affix-wrapper {
  background-color: #171f33 !important;
  border: 1px solid #424754 !important;
  border-radius: 8px !important;
  padding: 0 16px 0 0 !important;
  min-height: 48px !important;
  display: flex !important;
  align-items: center !important;
  transition: all 0.2s ease !important;
}

.auth-page .ant-input-affix-wrapper-focused {
  border-color: #adc6ff !important;
  box-shadow: 0 0 0 1px #adc6ff !important;
}

.auth-page .ant-input-affix-wrapper:hover {
  border-color: #8c909f !important;
}

/* ====== affix-wrapper 内部的 input 保持透明无边框 ====== */
.auth-page .ant-input-affix-wrapper .ant-input {
  background-color: transparent !important;
  border: none !important;
  height: 46px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

/* ====== 密码框右侧留出眼睛图标位置 ====== */
.auth-page .custom-password .ant-input {
  padding-right: 48px !important;
}

/* ====== 验证码输入框无右侧 padding ====== */
.auth-page .code-input .ant-input {
  padding-right: 16px !important;
}

/* ====== 清除按钮 ====== */
.auth-page .ant-input-clear-icon {
  color: #424754 !important;
}

.auth-page .ant-input-clear-icon:hover {
  color: #c2c6d6 !important;
}

/* ====== 按钮 loading 状态 ====== */
.auth-page .submit-btn.ant-btn-loading {
  opacity: 0.8 !important;
}
</style>
