import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    // 后端登录返回的 token 已带 "Bearer " 前缀，直接使用
    config.headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  response => {
    const data = response.data
    if (data.code !== undefined && data.code !== 200 && data.code !== 0) {
      ElMessage.error(data.message || '请求失败')
      return Promise.reject(new Error(data.message || '请求失败'))
    }
    return data
  },
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      window.location.href = '/login'
    } else {
      ElMessage.error(error.response?.data?.message || error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
