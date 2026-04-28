/**
 * Vue Router 配置
 * Phase 1.0: 使用 hash 模式，配置 3 个路由
 * Phase 1.3: 追加窗口管理路由
 * Phase 1.8: 追加认证路由 + 路由守卫
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// 导入视图组件
import Home from '../views/Home.vue'
import ProxyList from '../views/ProxyList.vue'
import ProxyForm from '../views/ProxyForm.vue'
import ProfileList from '../views/ProfileList.vue'
import ProfileForm from '../views/ProfileForm.vue'

// 导入认证页面组件
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import ForgotPassword from '../views/ForgotPassword.vue'
import ResetPassword from '../views/ResetPassword.vue'

// 导入认证状态
import { authStore } from '../stores/auth'

// 路由配置
const routes: RouteRecordRaw[] = [
  // ==================== Phase 1.8: 公共路由（无需登录） ====================
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: '登录', public: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { title: '注册', public: true }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: ForgotPassword,
    meta: { title: '忘记密码', public: true }
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: ResetPassword,
    meta: { title: '重置密码', public: true }
  },

  // ==================== 需要登录的路由 ====================
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

// ==================== Phase 1.8: 全局路由守卫 ====================
// - 未登录用户访问非公共路由 → 跳转登录页
// - 已登录用户访问公共路由（登录/注册等）→ 跳转首页
router.beforeEach(async (to, from, next) => {
  // 如果目标页面是公开页面
  if (to.meta.public === true) {
    if (authStore.isLoggedIn) {
      // 已登录用户访问公开页面（如登录页），跳转首页
      next('/')
    } else {
      // 未登录用户访问公开页面，允许访问
      next()
    }
    return
  }

  // 目标页面需要登录
  if (!authStore.isLoggedIn) {
    // 未登录，跳转登录页
    next('/login')
    return
  }

  // 已登录用户访问受保护页面，允许访问
  next()
})

export default router
