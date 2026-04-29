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
            发送验证码
          </a-button>
        </a-form-item>
      </a-form>

      <div class="auth-footer">
        <span>想起密码了？</span>
        <router-link to="/login">去登录</router-link>
      </div>
    </a-card>

    <!-- 验证码输入弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      title="输入验证码"
      :footer="null"
      width="400px"
      :closable="false"
      :maskClosable="false"
    >
      <a-form
        :model="resetForm"
        :rules="resetRules"
        @finish="handleResetSubmit"
        layout="vertical"
      >
        <a-form-item name="code" label="验证码">
          <a-input
            v-model:value="resetForm.code"
            placeholder="请输入6位验证码"
            size="large"
            :maxlength="6"
          >
            <template #prefix>
              <SafetyOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="newPassword" label="新密码">
          <a-input-password
            v-model:value="resetForm.newPassword"
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
            v-model:value="resetForm.confirmPassword"
            placeholder="请再次输入密码"
            size="large"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="resetLoading">
            重置密码
          </a-button>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MailOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { forgotPassword, resetPassword } from '../api/auth'

const router = useRouter()

// 表单数据
const form = reactive({
  email: ''
})

// 加载状态
const loading = ref(false)

// 弹窗状态
const modalVisible = ref(false)

// 重置表单数据
const resetForm = reactive({
  code: '',
  newPassword: '',
  confirmPassword: ''
})

// 重置加载状态
const resetLoading = ref(false)

// 存储验证通过的邮箱
let verifiedEmail = ''

// 表单校验规则
const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
  ]
}

// 重置表单校验规则
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

// 提交表单
async function handleSubmit() {
  loading.value = true
  try {
    const res: any = await forgotPassword({ email: form.email })
    if (res.data?.code === 200) {
      verifiedEmail = form.email
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

// 重置密码提交
async function handleResetSubmit() {
  resetLoading.value = true
  try {
    // 生成一个随机 token 用于重置
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    const res: any = await resetPassword({
      token,
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
</style>
