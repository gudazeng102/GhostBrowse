<template>
  <!-- Phase 1.8: 根据登录状态条件渲染 -->
  <!-- 已登录：渲染 Layout（带侧边栏和顶部栏） -->
  <!-- 未登录：全屏显示公共页面（登录/注册/忘记密码/重置密码） -->
  <Layout v-if="authStore.isLoggedIn" />
  <router-view v-else />
</template>

<script setup lang="ts">
import Layout from './components/Layout.vue'
import { authStore } from './stores/auth'

// 认证状态已在 main.ts 中初始化，这里不需要重复调用
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Noto Color Emoji';
}

#app {
  width: 100%;
  height: 100%;
}
</style>
