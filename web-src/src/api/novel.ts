import request from './index'

export interface NovelChapter {
  id: number
  index: number
  reel: string
  chapter: string
  chapterData: string
}

export const getNovel = (projectId: number) =>
  request.post('/novel/getNovel', { projectId })

export const addNovel = (projectId: number, items: Array<{ index: number; reel: string; chapter: string; chapterData: string }>) =>
  request.post('/novel/addNovel', { projectId, data: items })

export const updateNovel = (data: { id: number; index: number; reel: string; chapter: string; chapterData: string }) =>
  request.post('/novel/updateNovel', data)

export const delNovel = (id: number) =>
  request.post('/novel/delNovel', { id })

// 流式聊天：返回 Response 供前端读取 SSE 流
export const chatNovelStream = (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/novel/chatNovel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ messages }),
  })
}

// 流式生成章节：返回 Response 供前端读取 SSE 流
export const generateNovelStream = (data: {
  projectId: number
  inspiration: string
  theme: string
  title: string
  chapterCount: number
  wordsPerChapter: number
}) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/novel/generateNovel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(data),
  })
}
