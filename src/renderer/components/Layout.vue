<template>
  <a-layout class="layout-container">
    <!-- 顶部 Header -->
    <a-layout-header class="layout-header">
      <div class="logo">
        <span class="logo-icon">👻</span>
        <span class="logo-text">GhostBrowse</span>
      </div>

      <!-- Phase 1.8: 右上角用户信息和退出登录 -->
      <div class="user-area">
        <a-dropdown>
          <span class="user-trigger">
            <UserOutlined />
            <span class="username">{{ authStore.user?.display_name || authStore.user?.username }}</span>
          </span>
          <template #overlay>
            <a-menu>
              <a-menu-item key="logout" @click="handleLogout">
                <LogoutOutlined />
                <span>退出登录</span>
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </a-layout-header>

    <a-layout>
      <!-- 左侧菜单 -->
      <a-layout-sider
        v-model:collapsed="collapsed"
        :trigger="null"
        collapsible
        :width="200"
        class="layout-sider"
      >
        <a-menu
          v-model:selectedKeys="selectedKeys"
          theme="dark"
          mode="inline"
          @click="handleMenuClick"
        >
          <a-menu-item key="home">
            <span>🏠 首页</span>
          </a-menu-item>
          <a-menu-item key="proxy">
            <span>🌐 代理管理</span>
          </a-menu-item>
          <a-menu-item key="profile">
            <span>📋 窗口管理</span>
          </a-menu-item>
        </a-menu>
      </a-layout-sider>

      <!-- 右侧内容区 -->
      <a-layout-content class="layout-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { UserOutlined, LogoutOutlined } from '@ant-design/icons-vue'
import { authStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()

// 菜单折叠状态
const collapsed = ref(false)

// 当前选中的菜单项
const selectedKeys = ref<string[]>(['home'])

// 根据路由路径更新选中菜单
watch(
  () => route.path,
  (path) => {
    if (path === '/' || path === '/home') {
      selectedKeys.value = ['home']
    } else if (path === '/proxy') {
      selectedKeys.value = ['proxy']
    } else if (path === '/profile') {
      selectedKeys.value = ['profile']
    }
  },
  { immediate: true }
)

// 菜单点击处理
function handleMenuClick({ key }: { key: string }) {
  switch (key) {
    case 'home':
      router.push('/')
      break
    case 'proxy':
      router.push('/proxy')
      break
    case 'profile':
      router.push('/profile')
      break
    default:
      router.push('/')
  }
}

// Phase 1.8: 退出登录处理
function handleLogout() {
  authStore.logout()
}
</script>

<style scoped>
.layout-container {
  width: 100%;
  height: 100vh;
}

.layout-header {
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: #001529;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.logo {
  display: flex;
  align-items: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.logo-icon {
  font-size: 24px;
  margin-right: 8px;
}

.logo-text {
  letter-spacing: 1px;
}

.layout-sider {
  background: #001529;
}

.layout-content {
  padding: 24px;
  background: #f0f2f5;
  min-height: calc(100vh - 64px);
  overflow-y: auto;
}

/* Phase 1.8: 用户区域样式 */
.user-area {
  margin-left: auto;
  color: #fff;
  cursor: pointer;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  color: #fff;
}

.user-trigger:hover {
  opacity: 0.85;
}

.username {
  font-size: 14px;
}
</style>
