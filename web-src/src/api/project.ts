import request from './index'

export interface Project {
  id: number
  name: string
  intro: string
  type: string
  artStyle: string
  videoRatio: string
  userId?: number
  createTime?: number
  currentStage?: number
}

export const getProjects = () => request.post('/project/getProject', {})

export const getSingleProject = (id: number) =>
  request.post('/project/getSingleProject', { id })

export const addProject = (data: {
  name: string
  intro: string
  type: string
  artStyle: string
  videoRatio: string
}) => request.post('/project/addProject', data)

export const updateProject = (data: {
  id: number
  name?: string
  intro?: string
  type?: string
  artStyle?: string
  videoRatio?: string
}) => request.post('/project/updateProject', data)

export const delProject = (id: number) =>
  request.post('/project/delProject', { id })
