<template>
  <div class="auth-page">
    <!-- Background -->
    <div class="bg-img"></div>
    <div class="bg-gradient"></div>
    <div class="bg-glow"></div>
    
    <!-- Main Content -->
    <main class="main-content">
      <a-card class="auth-card glass-card" :bordered="false">
        <div class="brand-area">
          <div class="logo-box">
            <span class="logo-emoji">👻</span>
          </div>
        </div>
        
        <div class="text-center mb-[24px]">
          <h2 class="auth-title">GhostBrowse</h2>
          <p class="auth-subtitle">忘记密码 - 找回账号</p>
        </div>

        <a-form
          :model="form"
          :rules="rules"
          @finish="handleSubmit"
          layout="vertical"
          class="auth-form"
        >
          <a-form-item name="email" class="form-item-custom no-label">
            <div class="input-wrapper">
              <MailOutlined class="input-icon" />
              <a-input
                v-model:value="form.email"
                placeholder="请输入注册时填写的邮箱"
                size="large"
                allow-clear
                class="custom-input"
              />
            </div>
          </a-form-item>

          <a-form-item class="submit-item">
            <a-button
              type="primary"
              html-type="submit"
              size="large"
              block
              :loading="loading"
              class="submit-btn"
            >
              发送重置邮件
            </a-button>
          </a-form-item>
        </a-form>

        <div class="auth-footer">
          <router-link to="/login" class="login-link">
            <ArrowLeftOutlined /> 返回登录
          </router-link>
        </div>
      </a-card>
    </main>

    <!-- 弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      title="输入验证码"
      :footer="null"
      width="400px"
      :closable="false"
      :maskClosable="false"
      wrapClassName="forgot-password-modal"
    >
      <div class="modal-form">
        <a-form
          :model="resetForm"
          :rules="resetRules"
          @finish="handleResetSubmit"
          layout="vertical"
          class="auth-form"
        >
          <a-form-item name="code" class="modal-form-item">
            <template #label>
              <span class="modal-label">验证码</span>
            </template>
            <div class="input-wrapper">
              <SafetyOutlined class="input-icon" />
              <a-input
                v-model:value="resetForm.code"
                placeholder="请输入6位验证码"
                size="large"
                :maxlength="6"
                class="custom-input"
              />
            </div>
          </a-form-item>

          <a-form-item name="newPassword" class="modal-form-item">
            <template #label>
              <span class="modal-label">新密码</span>
            </template>
            <div class="input-wrapper">
              <LockOutlined class="input-icon" />
              <a-input
                v-model:value="resetForm.newPassword"
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

          <a-form-item name="confirmPassword" class="modal-form-item">
            <template #label>
              <span class="modal-label">确认密码</span>
            </template>
            <div class="input-wrapper">
              <LockOutlined class="input-icon" />
              <a-input
                v-model:value="resetForm.confirmPassword"
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

          <a-form-item class="submit-item">
            <a-button
              type="primary"
              html-type="submit"
              size="large"
              block
              :loading="resetLoading"
              class="submit-btn"
            >
              重置密码
            </a-button>
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MailOutlined, LockOutlined, SafetyOutlined, EyeOutlined, EyeInvisibleOutlined, ArrowLeftOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { forgotPassword, resetPassword } from '../api/auth'
import bgUrl from '@/assets/icons/img/login-background.png'

const router = useRouter()
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const form = reactive({ email: '' })
const loading = ref(false)
const modalVisible = ref(false)
const resetForm = reactive({ code: '', newPassword: '', confirmPassword: '' })
const resetLoading = ref(false)
let verifiedEmail = ''
let savedResetToken = ''

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
  ]
}

const resetRules = {
  code: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    { len: 6, message: '验证码为6位', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '长度 6-32 字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string) => {
        if (value !== resetForm.newPassword) return Promise.reject('两次密码不一致')
        return Promise.resolve()
      },
      trigger: 'blur'
    }
  ]
}

async function handleSubmit() {
  loading.value = true
  try {
    const res: any = await forgotPassword({ email: form.email })
    if (res.data?.code === 200) {
      verifiedEmail = form.email
      // 保存后端返回的 resetToken
      if (res.data?.data?.resetToken) {
        savedResetToken = res.data.data.resetToken
        console.log('[ForgotPassword] 保存 resetToken:', savedResetToken)
      }
      modalVisible.value = true
    } else {
      message.error(res.data?.message || res.message || '操作失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || err.message || '操作失败')
  } finally {
    loading.value = false
  }
}

async function handleResetSubmit() {
  resetLoading.value = true
  try {
    const res: any = await resetPassword({
      token: savedResetToken,
      newPassword: resetForm.newPassword,
      confirmPassword: resetForm.confirmPassword,
      code: resetForm.code
    })
    if (res.data?.code === 200) {
      message.success('密码重置成功，请使用新密码登录')
      modalVisible.value = false
      router.push('/login')
    } else {
      message.error(res.data?.message || res.message || '重置失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || err.message || '重置失败')
  } finally {
    resetLoading.value = false
  }
}
</script>
<style scoped>
/* ====== 页面布局 ====== */
.auth-page {
  min-height: 100vh;
  background-color: #0f172a;
  color: #ffffff;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

.bg-img {
  position: absolute;
  inset: 0;
  background-image: url('@/assets/icons/img/login-background.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.2;
  mix-blend-mode: screen;
  pointer-events: none;
  z-index: 0;
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom right, rgba(15, 23, 42, 0.9), transparent, rgba(15, 23, 42, 0.9));
  pointer-events: none;
  z-index: 1;
}

.bg-glow {
  position: absolute;
  width: 400px;
  height: 400px;
  background-color: rgba(59, 130, 246, 0.1);
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
  z-index: 2;
}

.main-content {
  width: 100%;
  max-width: 400px;
  position: relative;
  z-index: 10;
}

.glass-card {
  background-color: rgba(30, 41, 59, 0.8) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(148, 163, 184, 0.2) !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
  border-radius: 8px !important;
}

.auth-card {
  width: 100%;
  padding: 24px;
}

.auth-card :deep(.ant-card-body) {
  padding: 0;
}

.brand-area {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.logo-box {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background-color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.3);
}

.logo-emoji {
  font-size: 24px;
}

.text-center {
  text-align: center;
}

.mb-\[24px\] {
  margin-bottom: 24px;
}

.auth-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 24px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 8px 0;
}

.auth-subtitle {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item-custom {
  margin-bottom: 0 !important;
}

.no-label :deep(.ant-form-item-label) {
  display: none !important;
}

.form-item-custom :deep(.ant-form-item-explain) {
  color: #ffb4ab;
  font-size: 12px;
  margin-top: 4px;
}

.form-item-custom :deep(.ant-form-item-control-input) {
  min-height: auto;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: #64748b;
  font-size: 16px;
  z-index: 2;
  pointer-events: none;
}

/* ====== 修复：给 custom-input 补上 padding-left，只影响本页面 ====== */
.custom-input :deep(.ant-input) {
  padding-left: 44px !important;
  padding-right: 12px !important;
}

.custom-input :deep(.ant-input-clear-icon) {
  color: #64748b;
  margin-right: 8px;
}

.custom-input :deep(.ant-input-clear-icon:hover) {
  color: #94a3b8;
}

.custom-password :deep(.ant-input) {
  padding-right: 36px !important;
}

.visibility-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.2s ease;
  z-index: 2;
}

.visibility-btn:hover {
  color: #3b82f6;
}

.visibility-btn .material-icon {
  font-size: 16px;
}

.submit-item {
  margin-bottom: 0 !important;
  padding-top: 8px;
}

.submit-btn {
  background-color: #3b82f6 !important;
  border-color: #3b82f6 !important;
  color: #ffffff !important;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  padding-top: 8px !important;
  padding-bottom: 8px !important;
  height: auto !important;
  border-radius: 6px !important;
  transition: all 0.2s ease;
  box-shadow: none !important;
}

.submit-btn:hover {
  background-color: #2563eb !important;
  border-color: #2563eb !important;
}

.submit-btn:focus {
  outline: none !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
}

.auth-footer {
  margin-top: 24px;
  text-align: center;
}

.login-link {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
  color: #94a3b8;
  text-decoration: none;
  transition: color 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.login-link:hover {
  color: #ffffff;
}

/* Modal 内表单样式 */
.modal-form .modal-form-item {
  margin-bottom: 0 !important;
}

.modal-form .modal-form-item :deep(.ant-form-item-label) {
  padding-bottom: 8px;
}

.modal-form .modal-form-item :deep(.ant-form-item-label > label) {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  color: #c2c6d6 !important;
  height: auto;
}

.modal-form .modal-form-item :deep(.ant-form-item-explain) {
  color: #ffb4ab;
  font-size: 12px;
  margin-top: 4px;
}

.modal-form .modal-form-item :deep(.ant-form-item-control-input) {
  min-height: auto;
}

.modal-form .modal-label {
  color: #c2c6d6;
}
</style>


<!-- 全局样式 -->
<style>
/* ====== 页面 input ====== */
.auth-page .ant-input {
  background-color: #0f172a !important;
  border: 1px solid #475569 !important;
  border-radius: 6px !important;
  color: #ffffff !important;
  height: 40px !important;
  padding-left: 44px !important;
  padding-right: 12px !important;
  font-size: 14px !important;
  box-shadow: none !important;
  transition: all 0.2s ease !important;
}

.auth-page .ant-input::placeholder {
  color: #64748b !important;
}

.auth-page .ant-input:hover {
  border-color: #3b82f6 !important;
}

.auth-page .ant-input:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 1px #3b82f6 !important;
}

.auth-page .ant-input-affix-wrapper {
  background-color: #0f172a !important;
  border: 1px solid #475569 !important;
  border-radius: 6px !important;
  padding: 0 12px 0 0 !important;
  min-height: 40px !important;
  display: flex !important;
  align-items: center !important;
  transition: all 0.2s ease !important;
}

.auth-page .ant-input-affix-wrapper:hover {
  border-color: #3b82f6 !important;
}

.auth-page .ant-input-affix-wrapper-focused {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 1px #3b82f6 !important;
}

.auth-page .ant-input-affix-wrapper .ant-input {
  background-color: transparent !important;
  border: none !important;
  height: 38px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.auth-page .custom-password .ant-input {
  padding-right: 36px !important;
}

.auth-page .ant-input-clear-icon {
  color: #64748b !important;
}

.auth-page .ant-input-clear-icon:hover {
  color: #94a3b8 !important;
}

.auth-page .submit-btn.ant-btn-loading {
  opacity: 0.8 !important;
}

/* ====== 仅 forgot-password 弹窗 ====== */
.forgot-password-modal .ant-modal-content {
  background-color: rgba(30, 41, 59, 0.95) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(148, 163, 184, 0.2) !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
}

.forgot-password-modal .ant-modal-header {
  background-color: transparent !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
  padding: 16px 24px !important;
}

.forgot-password-modal .ant-modal-title {
  color: #ffffff !important;
  font-family: 'Space Grotesk', sans-serif !important;
  font-size: 18px !important;
  font-weight: 600 !important;
}

.forgot-password-modal .ant-modal-body {
  padding: 24px !important;
  background-color: transparent !important;
}

.forgot-password-modal .ant-modal-close {
  color: #94a3b8 !important;
}

.forgot-password-modal .ant-modal-close:hover {
  color: #ffffff !important;
}

.forgot-password-modal .ant-modal-mask {
  background-color: rgba(0, 0, 0, 0.7) !important;
  backdrop-filter: blur(4px) !important;
}

/* 弹窗内输入框（修复错位：padding-left 44px 给图标留足空间） */
.forgot-password-modal .ant-input,
.forgot-password-modal .ant-input-affix-wrapper {
  background-color: #0f172a !important;
  border: 1px solid #475569 !important;
  border-radius: 6px !important;
  color: #ffffff !important;
  padding-left: 35px;
}

.forgot-password-modal .ant-input-affix-wrapper {
  min-height: 40px !important;
  display: flex !important;
  align-items: center !important;
  padding: 0 12px 0 0 !important;
}

.forgot-password-modal .ant-input-affix-wrapper .ant-input {
  background-color: transparent !important;
  border: none !important;
  height: 38px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-left: 44px !important;
  color: #ffffff !important;
}

.forgot-password-modal .ant-input::placeholder {
  color: #64748b !important;
}

.forgot-password-modal .ant-input:hover,
.forgot-password-modal .ant-input-affix-wrapper:hover {
  border-color: #3b82f6 !important;
}

.forgot-password-modal .ant-input:focus,
.forgot-password-modal .ant-input-affix-wrapper-focused {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 1px #3b82f6 !important;
}

/* 弹窗内 label */
.forgot-password-modal .ant-form-item-label > label {
  color: #c2c6d6 !important;
  font-size: 14px !important;
}

/* 弹窗内错误提示 */
.forgot-password-modal .ant-form-item-explain-error {
  color: #ffb4ab !important;
}

/* 弹窗内按钮 */
.forgot-password-modal .ant-btn-primary {
  background-color: #3b82f6 !important;
  border-color: #3b82f6 !important;
  color: #ffffff !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  padding-top: 8px !important;
  padding-bottom: 8px !important;
  height: auto !important;
  border-radius: 6px !important;
  box-shadow: none !important;
}

.forgot-password-modal .ant-btn-primary:hover {
  background-color: #2563eb !important;
  border-color: #2563eb !important;
}

/* 弹窗内清除按钮 */
.forgot-password-modal .ant-input-clear-icon {
  color: #64748b !important;
}

.forgot-password-modal .ant-input-clear-icon:hover {
  color: #94a3b8 !important;
}

.forgot-password-modal :deep(.ant-input) {
  padding-left: 44px !important;
  padding-right: 12px !important;
}
</style>
