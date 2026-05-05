import request from './index'

export const getAssets = (projectId: number, type: string) =>
  request.post('/assets/getAssets', { projectId, type })

export const addAssets = (data: { projectId: number; name: string; intro: string; type: string; prompt: string }) =>
  request.post('/assets/addAssets', data)

// Generate an image for a specific asset
// artStyle: per-asset override; if omitted, backend uses project.artStyle
export const generateAssetImage = (data: {
  id: number; type: string; projectId: number; name: string; prompt: string; artStyle?: string; linked?: boolean; seed?: number; referenceImageUrl?: string; isPanel?: boolean
}) => request.post('/assets/generateAssets', data, { timeout: 300000 })

// Streaming version — returns raw Response for SSE reading
export const polishPromptStream = (data: { assetsId: number; projectId: number; type: string; name: string; describe: string }) => {
  const token = localStorage.getItem('token') || ''
  return fetch('/api/assets/polishPrompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(data),
  })
}

// Get asset with all its generated temp images
export const getImage = (assetsId: number) =>
  request.post('/assets/getImage', { assetsId })

export const saveAssets = (data: {
  id: number
  projectId: number
  base64?: string | null
  filePath?: string | null
  prompt?: string
  artStyle?: string | null
  selectedImages?: string | null
}) => request.post('/assets/saveAssets', data)

export const delAssets = (id: number) =>
  request.post('/assets/delAssets', { id })

// id = t_image record id (NOT asset id)
export const delImage = (id: number) =>
  request.post('/assets/delImage', { id })

// Get relevant script excerpts for an asset (for 剧情参考 panel)
export const getAssetContext = (projectId: number, name: string) =>
  request.post('/assets/getAssetContext', { projectId, name }, { timeout: 30000 })

// Get all assets for the reference image manager page (grouped by type, with full image lists)
export const getAllAssetsForManager = (projectId: number) =>
  request.post('/assets/getAllAssetsForManager', { projectId })
