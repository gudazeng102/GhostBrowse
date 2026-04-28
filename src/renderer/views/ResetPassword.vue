<template>
  <div class="auth-page">
    <a-card class="auth-card" :bordered="false">
      <div class="auth-header">
        <div class="auth-logo">👻</div>
        <h2 class="auth-title">GhostBrowse</h2>
        <p class="auth-subtitle">重置密码</p>
      </div>

      <!-- 无令牌时显示提示 -->
      <a-result
        v-if="!hasToken"
        status="warning"
        title="重置令牌无效"
        sub-title="请从忘记密码页面获取有效的重置令牌"
      >
        <template #extra>
          <a-button type="primary" @click="goToForgotPassword">
            前往获取令牌
          </a-button>
        </template>
      </a-result>

      <!-- 有令牌时显示重置表单 -->
      <a-form
        v-else
        :model="form"
        :rules="rules"
        @finish="handleSubmit"
        layout="vertical"
      >
        <a-form-item name="newPassword" label="新密码">
          <a-input-password
            v-model:value="form.newPassword"
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
            placeholder="请再次输入新密码"
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
            重置密码
          </a-button>
        </a-form-item>
      </a-form>

      <div class="auth-footer">
        <router-link to="/login">返回登录</router-link>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { resetPassword } from '../api/auth'

const router = useRouter()
const route = useRoute()

// 是否有令牌
const hasToken = ref(false)

// 表单数据
const form = reactive({
  newPassword: '',
  confirmPassword: ''
})

// 加载状态
const loading = ref(false)

// 表单校验规则
const rules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '长度 6-32 字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string) => {
        if (value !== form.newPassword) return Promise.reject('两次密码不一致')
        return Promise.resolve()
      },
      trigger: 'blur'
    }
  ]
}

// 页面加载时检查令牌
onMounted(() => {
  const token = route.query.token as string
  if (token) {
    hasToken.value = true
  }
})

// 提交表单
async function handleSubmit() {
  loading.value = true
  try {
    const token = route.query.token as string
    const res: any = await resetPassword({
      token,
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword
    })
    if (res.data?.code === 200) {
      message.success('密码重置成功，请使用新密码登录')
      router.push('/login')
    } else {
      message.error(res.data?.message || res.message || '重置失败')
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || err.message || '重置失败')
  } finally {
    loading.value = false
  }
}

// 前往忘记密码页面
function goToForgotPassword() {
  router.push('/forgot-password')
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
