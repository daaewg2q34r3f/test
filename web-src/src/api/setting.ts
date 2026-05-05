import request from './index'

export interface LangModel {
  model: string
  apiKey: string
  baseURL: string
  manufacturer: string
}

export interface ImageModel {
  model: string
  apiKey: string
  baseURL?: string
  manufacturer: string
}

export interface VideoConfig {
  id?: number
  name: string
  model: string
  apiKey: string
  baseUrl: string
  manufacturer: string
}

export const getSetting = (userId: number) =>
  request.post('/setting/getSetting', { userId })

export const updateSetting = (userId: number, data: {
  languageModel?: LangModel
  imageModel?: ImageModel
  videoModel?: VideoConfig[]
  name?: string
  password?: string
}) => request.post('/setting/updateSetting', { userId, ...data })

// 测试语言模型（成功后自动保存）
export const testAI = (data: {
  modelName: string
  apiKey: string
  baseURL?: string
  manufacturer?: string
}) => request.post('/other/testAI', data)

// 测试图像模型（成功后自动保存）
export const testImage = (data: {
  modelName?: string
  apiKey: string
  baseURL?: string
  manufacturer: string
}) => request.post('/other/testImage', data)

export const login = (data: { username: string; password: string }) =>
  request.post('/other/login', data)
