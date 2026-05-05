import request from './index'

export const getOutline = (projectId: number) =>
  request.post('/outline/getOutline', { projectId })

export const addOutline = (data: { projectId: number; episode: number; data: string }) =>
  request.post('/outline/addOutline', data)

export const updateOutline = (data: { id: number; data: Record<string, any> }) =>
  request.post('/outline/updateOutline', data)

export const delOutline = (id: number, projectId: number) =>
  request.post('/outline/delOutline', { id, projectId })

export const getStoryline = (projectId: number) =>
  request.post('/outline/getStoryline', { projectId })

export const updateStoryline = (data: { projectId: number; content: string }) =>
  request.post('/outline/updateStoryline', data)

// 流式生成大纲
export const generateOutlineStream = (data: {
  projectId: number
  episodeCount: number
  notes?: string
}) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/outline/generateOutline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(data),
  })
}

// 流式聊天（大纲助手）
export const chatOutlineStream = (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/outline/chatOutline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ messages }),
  })
}
