import request from './index'

export type VideoGenerationFrameRef = string | {
  path: string
  role?: string
}

export const getVideoConfigs = (scriptId: number) =>
  request.get('/video/getVideoConfigs', { params: { scriptId, _: Date.now() } })

export const addVideoConfig = (data: {
  projectId: number
  scriptId: number
  duration: number
  durationSource?: 'stage5' | 'manual' | 'ai'
  prompt?: string
  startFrame?: { id: number; filePath: string; prompt?: string }
  endFrame?: { id: number; filePath: string; prompt?: string } | null
  images?: Array<{ id: number; filePath: string; prompt?: string }>
  mode?: string
  resolution?: string
  manufacturer?: string
}) => request.post('/video/addVideoConfig', data)

export const updateVideoConfig = (data: {
  id: number
  manufacturer?: string
  mode?: string
  startFrame?: { id: number; filePath: string; prompt?: string }
  endFrame?: { id: number; filePath: string; prompt?: string } | null
  images?: Array<{ id: number; filePath: string; prompt?: string }>
  resolution?: string
  type?: string
  duration?: number
  durationSource?: 'stage5' | 'manual' | 'ai'
  prompt?: string
}) => request.post('/video/upDateVideoConfig', data)

export const generateVideo = (data: {
  projectId: number
  scriptId: number
  filePath: VideoGenerationFrameRef[]
  duration: number
  prompt: string
  continuityHint?: string
  preferredVoiceStyle?: string
  audioMode?: 'auto' | 'dialogue' | 'narration' | 'silent'
  voiceCharacterBible?: string
  previousVoiceText?: string
  nextVoiceText?: string
  primarySpeakerHint?: string
  previousSpeakerHint?: string
  nextSpeakerHint?: string
  resolution: string
  configId?: number
  shotId?: number
  batchId?: string
  type?: string
  mode?: string
  audio?: boolean
}) => request.post('/video/generateVideo', data)

export const getVideo = (scriptId: number) =>
  request.get('/video/getVideo', { params: { scriptId, _: Date.now() } })

export const mergeVideos = (data: { scriptId: number; projectId: number }) =>
  request.post('/video/mergeVideos', data, { timeout: 300000 })
