<template>
  <div class="home-page">
    <main class="home-main">
      <div class="page-head">
        <div>
          <span class="page-badge">阶段创作 / 项目列表</span>
          <h2 class="page-title">我的项目</h2>
          <p class="page-sub">在这里统一管理项目，并进入故事灵感、剧集大纲、剧本生成、资产整理、分镜制作与视频合成等阶段。</p>
        </div>
        <div class="page-actions">
          <span class="project-count" v-if="projects.length > 0">{{ projects.length }} 个项目</span>
          <el-button type="primary" @click="openCreate">
            <template #icon>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </template>
            新建项目
          </el-button>
        </div>
      </div>

      <div class="overview-card">
        <div class="overview-copy">
          <span class="overview-label">MODE 01</span>
          <strong>阶段创作主工作台</strong>
          <p>统一承载项目管理、六阶段创作流程，以及小说、剧本、资产等内容管理入口，方便围绕单个项目持续推进生产。</p>
        </div>
        <div class="overview-stats">
          <div class="overview-stat">
            <span>已建项目</span>
            <strong>{{ projects.length }}</strong>
          </div>
          <div class="overview-stat">
            <span>当前模式</span>
            <strong>阶段创作</strong>
          </div>
        </div>
      </div>

      <div v-if="projects.length === 0 && !loading" class="empty-state">
        <div class="empty-icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.5">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
        </div>
        <p class="empty-title">暂无项目</p>
        <p class="empty-desc">从这里新建你的第一个 AI 短剧项目</p>
        <el-button type="primary" @click="openCreate" style="margin-top: 8px">新建项目</el-button>
      </div>

      <div v-else class="projects-grid" v-loading="loading">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-card fade-in"
          @click="openProject(project)"
        >
          <div class="card-header">
            <div class="card-icon" :style="{ background: getProjectColor(project.type) }">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </div>
            <el-dropdown trigger="click" @click.stop>
              <button class="more-btn" @click.stop aria-label="更多操作">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5"/>
                  <circle cx="12" cy="12" r="1.5"/>
                  <circle cx="12" cy="19" r="1.5"/>
                </svg>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click.stop="editProject(project)">编辑项目</el-dropdown-item>
                  <el-dropdown-item @click.stop="confirmDelete(project)" style="color: #EF4444">删除项目</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <h3 class="card-name">{{ project.name }}</h3>
          <p class="card-intro">{{ project.intro || '暂无简介' }}</p>

          <div class="card-tags">
            <span class="tag">{{ project.type || '未设类型' }}</span>
            <span class="tag">{{ project.artStyle || '未设画风' }}</span>
            <span class="tag ratio-tag">{{ project.videoRatio || '16:9' }}</span>
          </div>

          <div class="card-footer">
            <div class="stage-track">
              <div
                class="stage-fill"
                :style="{ width: `${((project.currentStage || 1) / 6) * 100}%` }"
              />
            </div>
            <span class="stage-text">第 {{ project.currentStage || 1 }} / 6 阶段</span>
          </div>
        </div>
      </div>
    </main>

    <el-dialog v-model="showDialog" :title="editingProject ? '编辑项目' : '新建项目'" width="480px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="简介" prop="intro">
          <el-input v-model="form.intro" type="textarea" :rows="2" placeholder="简要描述故事内容" />
        </el-form-item>
        <el-form-item label="剧集类型" prop="type">
          <el-select v-model="form.type" placeholder="选择类型" style="width:100%">
            <el-option label="古装言情" value="古装言情" />
            <el-option label="现代都市" value="现代都市" />
            <el-option label="玄幻修仙" value="玄幻修仙" />
            <el-option label="悬疑推理" value="悬疑推理" />
            <el-option label="喜剧搞笑" value="喜剧搞笑" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="画面风格" prop="artStyle">
          <el-select v-model="form.artStyle" placeholder="选择画风" style="width:100%">
            <el-option label="写实风格" value="写实风格" />
            <el-option label="动漫风格" value="动漫风格" />
            <el-option label="水墨风格" value="水墨风格" />
            <el-option label="像素风格" value="像素风格" />
            <el-option label="赛博朋克" value="赛博朋克" />
          </el-select>
        </el-form-item>
        <el-form-item label="视频比例" prop="videoRatio">
          <el-select v-model="form.videoRatio" placeholder="选择比例" style="width:100%">
            <el-option label="16:9（横版）" value="16:9" />
            <el-option label="9:16（竖版）" value="9:16" />
            <el-option label="1:1（方形）" value="1:1" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProject">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { getProjects, addProject, updateProject, delProject } from '@/api/project'
import type { Project } from '@/api/project'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const projectStore = useProjectStore()
const projects = ref<Project[]>([])
const loading = ref(false)
const showDialog = ref(false)
const saving = ref(false)
const editingProject = ref<Project | null>(null)
const formRef = ref<FormInstance>()
const form = reactive({ name: '', intro: '', type: '', artStyle: '', videoRatio: '16:9' })
const rules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  intro: [{ required: true, message: '请输入简介', trigger: 'blur' }],
  type: [{ required: true, message: '请选择剧集类型', trigger: 'change' }],
  artStyle: [{ required: true, message: '请选择画面风格', trigger: 'change' }],
  videoRatio: [{ required: true, message: '请选择视频比例', trigger: 'change' }]
}

const colorMap: Record<string, string> = {
  '古装言情': 'linear-gradient(135deg,#F472B6,#EC4899)',
  '现代都市': 'linear-gradient(135deg,#60A5FA,#3B82F6)',
  '玄幻修仙': 'linear-gradient(135deg,#A78BFA,#7C3AED)',
  '悬疑推理': 'linear-gradient(135deg,#6B7280,#374151)',
  '喜剧搞笑': 'linear-gradient(135deg,#FBBF24,#F59E0B)',
  '其他': 'linear-gradient(135deg,#6366F1,#4F46E5)'
}

function getProjectColor(type: string) {
  return colorMap[type] || 'linear-gradient(135deg,#6366F1,#818CF8)'
}

async function loadProjects() {
  loading.value = true
  try {
    const res = await getProjects() as any
    projects.value = res.data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingProject.value = null
  resetForm()
  showDialog.value = true
}

function openProject(project: Project) {
  projectStore.setProject(project)
  router.push(`/project/${project.id}`)
}

function editProject(project: Project) {
  editingProject.value = project
  Object.assign(form, {
    name: project.name,
    intro: project.intro,
    type: project.type,
    artStyle: project.artStyle,
    videoRatio: project.videoRatio
  })
  showDialog.value = true
}

async function saveProject() {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    if (editingProject.value) {
      await updateProject({ id: editingProject.value.id, ...form })
      const target = projects.value.find(project => project.id === editingProject.value?.id)
      if (target) Object.assign(target, form)
      if (projectStore.currentProject?.id === editingProject.value.id) {
        Object.assign(projectStore.currentProject, form)
      }
      ElMessage.success('项目已更新')
    } else {
      await addProject({ ...form })
      ElMessage.success('项目已创建')
    }
    showDialog.value = false
    await loadProjects()
  } finally {
    saving.value = false
  }
}

async function confirmDelete(project: Project) {
  await ElMessageBox.confirm(`确认删除"${project.name}"？此操作不可撤销`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await delProject(project.id)
  ElMessage.success('已删除')
  loadProjects()
}

function resetForm() {
  formRef.value?.resetFields()
  Object.assign(form, { name: '', intro: '', type: '', artStyle: '', videoRatio: '16:9' })
}

onMounted(loadProjects)
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--tf-bg);
}

.home-main {
  padding: 28px 30px 34px;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.page-badge {
  display: inline-flex;
  margin-bottom: 10px;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--tf-text);
  letter-spacing: -0.03em;
}

.page-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--tf-text-3);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-count {
  font-size: 12px;
  color: var(--tf-text-3);
  font-weight: 600;
}

.overview-card {
  margin-bottom: 24px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid var(--tf-border);
  background: linear-gradient(140deg, rgba(99,102,241,0.08), rgba(255,255,255,1));
  box-shadow: var(--tf-shadow-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.overview-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overview-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--tf-primary);
}

.overview-copy strong {
  font-size: 18px;
  color: var(--tf-text);
  letter-spacing: -0.02em;
}

.overview-copy p {
  font-size: 13px;
  color: var(--tf-text-2);
  line-height: 1.7;
}

.overview-stats {
  display: flex;
  gap: 12px;
}

.overview-stat {
  min-width: 120px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255,255,255,0.88);
  border: 1px solid var(--tf-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overview-stat span {
  font-size: 11px;
  color: var(--tf-text-3);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.overview-stat strong {
  font-size: 20px;
  color: var(--tf-text);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 110px 0;
}

.empty-icon-wrap {
  width: 72px;
  height: 72px;
  background: var(--tf-surface-3);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--tf-text);
}

.empty-desc {
  font-size: 13px;
  color: var(--tf-text-3);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

.project-card {
  background: #fff;
  border: 1px solid var(--tf-border);
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow: var(--tf-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.project-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--tf-shadow-hover);
  border-color: var(--tf-border-a);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.more-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--tf-text-3);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.more-btn:hover {
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--tf-text);
  letter-spacing: -0.01em;
  line-height: 1.35;
}

.card-intro {
  font-size: 13px;
  color: var(--tf-text-2);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag {
  font-size: 11px;
  color: var(--tf-text-2);
  background: var(--tf-surface-3);
  border: 1px solid var(--tf-border);
  border-radius: 5px;
  padding: 2px 8px;
  font-weight: 500;
}

.ratio-tag {
  color: var(--tf-primary);
  background: var(--tf-primary-dim);
  border-color: #C7D2FE;
}

.card-footer {
  padding-top: 10px;
  border-top: 1px solid var(--tf-border);
  display: flex;
  align-items: center;
  gap: 10px;
}

.stage-track {
  flex: 1;
  height: 4px;
  background: var(--tf-surface-3);
  border-radius: 2px;
  overflow: hidden;
}

.stage-fill {
  height: 100%;
  background: var(--tf-primary);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.stage-text {
  font-size: 11px;
  color: var(--tf-text-3);
  white-space: nowrap;
  font-weight: 500;
}

@media (max-width: 900px) {
  .home-main {
    padding: 20px;
  }

  .page-head,
  .overview-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .overview-stats {
    width: 100%;
    flex-direction: column;
  }
}
</style>
