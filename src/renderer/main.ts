/**
 * Vue 3 应用入口
 * Phase 1.0: 初始化 Vue 应用，注册 Antd 和 Router
 * Phase 1.8: 追加认证状态初始化
 */

import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import App from './App.vue'
import router from './router'
import { authStore } from './stores/auth'

// 导入 Ant Design Vue 全局样式
import 'ant-design-vue/dist/reset.css'

// 创建 Vue 应用实例
const app = createApp(App)

// 注册 Ant Design Vue
app.use(Antd)

// 注册 Vue Router
app.use(router)

// 挂载到 #app（等待 authStore 初始化完成后再挂载）
authStore.init().then(() => {
  app.mount('#app')
})
