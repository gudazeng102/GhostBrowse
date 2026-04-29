/**
 * 全局认证状态管理
 * Phase 1.8: 使用 Vue 3 reactive 实现简单的全局状态（不引入 Pinia）
 */

import { reactive } from 'vue'
import { getMe } from '../api/auth'

/** 用户信息接口 */
export interface User {
  id: number
  username: string | null
  email: string
  display_name: string
  status?: string
}

/** 认证状态单例 */
export const authStore = reactive({
  // Token（从 localStorage 恢复）
  token: localStorage.getItem('token') || '',
  // 当前用户信息（从 localStorage 恢复）
  user: JSON.parse(localStorage.getItem('user') || 'null') as User | null,
  // 是否已登录（从 localStorage 恢复）
  isLoggedIn: !!localStorage.getItem('token'),

  /**
   * 初始化认证状态
   * 应用启动时调用，验证已登录用户的 Token 是否有效
   */
  async init() {
    // 如果没有 Token，直接跳过
    if (!this.token) {
      return
    }

    // 尝试验证 Token 是否有效
    try {
      const res: any = await getMe()
      if (res.data?.code === 200 && res.data?.data) {
        // Token 有效，更新用户信息
        this.user = res.data.data as User
        this.isLoggedIn = true
        localStorage.setItem('user', JSON.stringify(res.data.data))
      } else {
        // Token 无效，清除登录状态
        this.logout()
      }
    } catch {
      // 验证失败，清除登录状态
      this.logout()
    }
  },

  /**
   * 设置认证信息（登录/注册成功后调用）
   */
  setAuth(token: string, user: User) {
    this.token = token
    this.user = user
    this.isLoggedIn = true
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
  },

  /**
   * 退出登录
   */
  logout() {
    this.token = ''
    this.user = null
    this.isLoggedIn = false
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/#/login'
  }
})
