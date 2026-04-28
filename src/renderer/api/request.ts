/**
 * Axios HTTP 请求封装
 * Phase 1.0: 基础封装，baseURL 指向 http://localhost:3000/api/v1
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

// 创建 Axios 实例
const request: AxiosInstance = axios.create({
  // API 基础路径
  baseURL: 'http://localhost:3000/api/v1',
  
  // 请求超时时间
  timeout: 10000,
  
  // 请求头
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // Phase 1.8: 自动携带 Token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    console.log(`[Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
    return config
  },
  (error) => {
    console.error('[Request] 请求配置错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`[Response] ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    // 统一错误处理
    const status = error.response?.status
    const message = error.response?.data?.message || error.message

    console.error(`[Response] Error ${status}: ${message}`)

    switch (status) {
      case 400:
        console.error('请求参数错误')
        break
      case 401:
        console.error('未授权，请登录')
        // Phase 1.8: 401 自动跳转登录页并清理 Token
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/#/login'
        break
      case 403:
        console.error('拒绝访问')
        break
      case 404:
        console.error('请求资源不存在')
        break
      case 500:
        console.error('服务器内部错误')
        break
      case 502:
        console.error('网关错误')
        break
      case 503:
        console.error('服务不可用')
        break
      case 504:
        console.error('网关超时')
        break
      default:
        if (error.code === 'ECONNABORTED') {
          console.error('请求超时')
        } else if (error.code === 'ERR_NETWORK') {
          console.error('网络错误，请检查服务是否启动')
        }
    }

    return Promise.reject(error)
  }
)

// 导出 request 实例
export default request
