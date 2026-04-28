<template>
  <div class="auth-page">
    <a-card class="auth-card" :bordered="false">
      <div class="auth-header">
        <div class="auth-logo">👻</div>
        <h2 class="auth-title">GhostBrowse</h2>
        <p class="auth-subtitle">指纹浏览器 - 登录</p>
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

        <a-form-item name="password" label="密码">
          <a-input-password
            v-model:value="form.password"
            placeholder="请输入密码"
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
            登录
          </a-button>
        </a-form-item>
      </a-form>

      <div class="auth-footer">
        <span>还没有账号？</span>
        <router-link to="/register">去注册</router-link>
        <span class="separator">|</span>
        <router-link to="/forgot-password">忘记密码？</router-link>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Form } from 'ant-design-vue'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { login } from '../api/auth'
import { authStore } from '../stores/auth'

const router = useRouter()

// 表单数据
const form = reactive({
  username: '',
  password: ''
})

// 加载状态
const loading = ref(false)

// 表单校验规则
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

// 提交表单
async function handleSubmit() {
  loading.value = true
  try {
    const res: any = await login(form)
    if (res.data?.code === 200 && res.data?.data) {
      authStore.setAuth(res.data.data.token, res.data.data.user)
      message.success('登录成功')
      router.push('/')
    } else {
      message.error(res.data?.message || res.message || '登录失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || err.message || '登录失败')
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

.auth-footer .separator {
  margin: 0 8px;
}

.auth-footer a {
  color: #1890ff;
  text-decoration: none;
}

.auth-footer a:hover {
  text-decoration: underline;
}
</style>
