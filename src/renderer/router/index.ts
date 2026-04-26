/**
 * Vue Router 配置
 * Phase 1.0: 使用 hash 模式，配置 3 个路由
 * Phase 1.3: 追加窗口管理路由
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// 导入视图组件
import Home from '../views/Home.vue'
import ProxyList from '../views/ProxyList.vue'
import ProxyForm from '../views/ProxyForm.vue'
import ProfileList from '../views/ProfileList.vue'
import ProfileForm from '../views/ProfileForm.vue'

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { title: '首页' }
  },
  {
    path: '/proxy',
    name: 'ProxyList',
    component: ProxyList,
    meta: { title: '代理管理' }
  },
  {
    path: '/proxy/new',
    name: 'ProxyNew',
    component: ProxyForm,
    meta: { title: '新建代理' }
  },
  {
    path: '/proxy/edit',
    name: 'ProxyEdit',
    component: ProxyForm,
    meta: { title: '编辑代理' }
  },
  // Phase 1.3: 窗口管理路由
  {
    path: '/profile',
    name: 'ProfileList',
    component: ProfileList,
    meta: { title: '窗口管理' }
  },
  {
    path: '/profile/new',
    name: 'ProfileNew',
    component: ProfileForm,
    meta: { title: '新建窗口' }
  },
  {
    path: '/profile/edit',
    name: 'ProfileEdit',
    component: ProfileForm,
    meta: { title: '编辑窗口' }
  }
]

// 创建 Router 实例
const router = createRouter({
  // Electron 内使用 hash 模式，避免路由刷新 404 问题
  history: createWebHashHistory(),
  routes
})

// 路由切换后更新页面标题
router.afterEach((to) => {
  const title = to.meta.title as string
  document.title = title ? `${title} - GhostBrowse` : 'GhostBrowse'
})

export default router
