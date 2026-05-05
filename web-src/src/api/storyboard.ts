import request from './index'

export const getStoryboard = (data: { projectId: number; scriptId: number }) =>
  request.post('/storyboard/getStoryboard', data)

export const saveStoryboard = (data: {
  id: number
  prompt?: string
  imageUrl?: string
  duration?: number
  videoPrompt?: string
  name?: string
  meta?: string | null
}) =>
  request.post('/storyboard/saveStoryboard', data)

export const generateVideoPrompt = (data: {
  projectId: number
  scriptId: number | null
  id: string
  src: string
  prompt?: string
  mode?: string
  currentVideoPrompt?: string
  previousPrompt?: string
  nextPrompt?: string
  refPrompts?: string[]
  continuityLandingPrompt?: string
  modelPromptTips?: string
}) =>
  request.post('/storyboard/generateVideoPrompt', data)

export const getVideoPromptTips = () =>
  request.post('/storyboard/getVideoPromptTips', {})

export const getImagePromptTips = () =>
  request.post('/storyboard/getImagePromptTips', {})

export const addShot = (data: {
  projectId: number
  scriptId: number
  segmentId?: number
  shotIndex?: number
  name?: string
  prompt?: string
  duration?: number
  meta?: string
}) =>
  request.post('/storyboard/addShot', data)

// 获取分镜参考图（角色/场景的所有图片 + 同场分镜图）
export const getShotRefImages = (data: {
  projectId: number
  assetNames: string[]
  scriptId?: number
  segmentId?: number
  currentShotId?: number
}) => request.post('/storyboard/getShotRefImages', data)

// 查询一批镜头的最新视频状态
export const getShotVideo = (data: { shotIds: number[] }) =>
  request.post('/video/getShotVideo', data)

// 生成分镜视频
export const generateShotVideoApi = (data: {
  projectId: number
  scriptId: number
  shotId: number
  resolution: string
  filePath: string[]
  duration: number
  prompt: string
  type?: string
}) =>
  request.post('/video/generateVideo', data)

// 重新生成单个分镜图片（图片生成耗时长，单独设 5 分钟超时）
// selectedRefPaths: 用户在 UI 中手动选中的参考图路径，直接传给后端用于生成
export const regenFrameImage = (data: { id: number; selectedRefPaths?: string[] }) =>
  request.post('/storyboard/regenFrameImage', data, { timeout: 300000 })

// 删除分镜生成图
export const deleteStoryboardImage = (data: { id: number }) =>
  request.post('/storyboard/deleteStoryboardImage', data)

// 从资产参考图列表移除一张图
export const removeAssetRefImage = (data: { assetId: number; rawPath: string }) =>
  request.post('/storyboard/removeAssetRefImage', data)

// SSE流式规划分镜（返回fetch Response，使用ReadableStream处理）
export const planShotsSSE = (data: {
  projectId: number
  scriptId: number
  targetCount?: number
  clearExisting?: boolean
  imageModelPromptTips?: string
}) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/storyboard/planShots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(data),
  })
}
