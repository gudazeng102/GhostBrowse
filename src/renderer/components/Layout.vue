<template>
  <a-layout class="layout-container">
    <!-- 顶部 Header -->
    <a-layout-header class="layout-header">
      <div class="logo">
        <img
          v-if="collapsed"
          src="http://localhost:3000/icons/logo1.png"
          class="header-logo-img header-logo-small"
          alt="logo"
        />
        <img
          v-else
          src="http://localhost:3000/icons/logo2.png"
          class="header-logo-img header-logo-large"
          alt="GhostBrowse"
        />

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
        :collapsed-width="64"
        class="layout-sider"
      >

        <a-menu
          v-model:selectedKeys="selectedKeys"
          theme="dark"
          mode="inline"
          :inline-collapsed="collapsed"
          @click="handleMenuClick"
        >
          <a-menu-item key="home">
            <template #icon>
              <span class="menu-emoji">🏠</span>
            </template>
            <span>首页</span>
          </a-menu-item>
          <a-menu-item key="proxy">
            <template #icon>
              <span class="menu-emoji">🌐</span>
            </template>
            <span>代理管理</span>
          </a-menu-item>
          <a-menu-item key="profile">
            <template #icon>
              <span class="menu-emoji">📋</span>
            </template>
            <span>窗口管理</span>
          </a-menu-item>
          <a-menu-item key="ai">
            <template #icon>
              <span class="menu-emoji">🤖</span>
            </template>
            <span>AI 控制台</span>
          </a-menu-item>
          <a-menu-item key="group-control">
            <template #icon>
              <span class="menu-emoji">🗂️</span>
            </template>
            <span>群控管理</span>
          </a-menu-item>
        </a-menu>

        <!-- 收缩/展开按钮：固定在侧栏底部 -->
        <div class="sider-collapse-trigger" @click="toggleCollapsed">
          <MenuUnfoldOutlined v-if="collapsed" />
          <MenuFoldOutlined v-else />
          <span v-if="!collapsed" class="trigger-text">收起</span>
        </div>
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
import {
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons-vue'
import { authStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()

// 菜单折叠状态（持久化到 localStorage）
const COLLAPSED_KEY = 'gb_sider_collapsed'
const collapsed = ref<boolean>(localStorage.getItem(COLLAPSED_KEY) === '1')

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  localStorage.setItem(COLLAPSED_KEY, collapsed.value ? '1' : '0')
}

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
    } else if (path.startsWith('/ai')) {
      selectedKeys.value = ['ai']
    } else if (path.startsWith('/group-control')) {
      selectedKeys.value = ['group-control']
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
    case 'ai':
      router.push('/ai')
      break
    case 'group-control':
      router.push('/group-control')
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
  padding: 0 20px;
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

.header-logo-img {
  margin-right: 8px;
  object-fit: contain;
}
.header-logo-small {
  width: 28px;
  height: 28px;
}
.header-logo-large {
  width: 162px;
  height: 62px;
}

.logo-text {
  letter-spacing: 1px;
}

/* 侧边栏 Logo */
.sider-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 10px;
  gap: 8px;
}
.sider-logo-img {
  object-fit: contain;
}
.sider-logo-small {
  width: 28px;
  height: 28px;
}
.sider-logo-large {
  width: 32px;
  height: 32px;
}
.sider-logo-text {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  white-space: nowrap;
}

.layout-sider {
  background: #001529;
  position: relative;
}

/* 让菜单不要顶到底部按钮 */
.layout-sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.layout-sider :deep(.ant-menu) {
  flex: 1;
  overflow-y: auto;
}

/* 收缩状态下让 emoji 居中显示 */
.menu-emoji {
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
}

/* 折叠按钮 */
.sider-collapse-trigger {
  flex-shrink: 0;
  height: 48px;
  line-height: 48px;
  padding: 0 16px;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  transition: color 0.2s, background 0.2s;
}

.sider-collapse-trigger:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.trigger-text {
  font-size: 14px;
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