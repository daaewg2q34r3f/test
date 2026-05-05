import request from './index'

export const getScript = (projectId: number) =>
  request.post('/script/geScriptApi', { projectId })

export const saveScript = (data: { outlineId: number; scriptId: number; content: string }) =>
  request.post('/script/generateScriptSave', data)

// 流式生成单集剧本
export const generateScriptStream = (data: { scriptId: number; outlineId: number }) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/script/generateScriptStream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(data),
  })
}

// 流式聊天（剧本助手）
export const chatScriptStream = (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/script/chatScript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ messages }),
  })
}
