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
        <a-form-item name="username" label="用户名">
          <a-input
            v-model:value="form.username"
            placeholder="3-20个字符，字母、数字、下划线"
            size="large"
            allow-clear
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

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
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { register } from '../api/auth'
import { authStore } from '../stores/auth'

const router = useRouter()

// 表单数据
const form = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
})

// 加载状态
const loading = ref(false)

// 表单校验规则
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度 3-20 字符', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '只允许字母、数字、下划线', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'blur' }
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
    // axios 响应结构：res.data 才是 API 返回的 body
    if (res.data?.code === 200 && res.data?.data) {
      authStore.setAuth(res.data.data.token, res.data.data.user)
      message.success('注册成功')
      router.push('/')
    } else {
      message.error(res.data?.message || res.message || '注册失败')
    }
  } catch (err: any) {
    if (err.response?.status === 409) {
      message.error('用户名或邮箱已被注册')
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
