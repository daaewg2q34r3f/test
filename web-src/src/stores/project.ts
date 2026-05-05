import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Project } from '@/api/project'

export const useProjectStore = defineStore('project', () => {
  const currentProject = ref<Project | null>(null)
  const currentStage = ref(1)

  function setProject(project: Project) {
    currentProject.value = project
    currentStage.value = project.currentStage || 1
  }

  function advanceStage(stage: number) {
    if (stage > currentStage.value) currentStage.value = stage
    if (currentProject.value) {
      currentProject.value.currentStage = Math.max(currentProject.value.currentStage || 1, stage)
    }
  }

  function clearProject() {
    currentProject.value = null
    currentStage.value = 1
  }

  return { currentProject, currentStage, setProject, advanceStage, clearProject }
})
