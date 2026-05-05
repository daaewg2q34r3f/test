<template>
  <div class="app-shell" :class="{ collapsed: isCollapsed }">
    <aside class="app-sidebar">
      <div class="sidebar-brand">
        <div class="brand-icon">
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#6366F1"/>
            <path d="M8 11l8-4 8 4v10l-8 4-8-4V11z" stroke="white" stroke-width="1.5" fill="none"/>
            <circle cx="16" cy="16" r="3" fill="white"/>
          </svg>
        </div>
        <span v-if="!isCollapsed" class="brand-name">GalaxyLoom</span>
        <button v-if="!isCollapsed" class="collapse-btn" @click="isCollapsed = true" title="收起">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      <button v-if="isCollapsed" class="expand-fab" @click="isCollapsed = false" title="展开侧边栏">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <nav class="sidebar-nav">
        <div class="nav-group">
          <button class="nav-item" :class="{ active: currentMode === 'creation' }" @click="router.push('/creation/projects')" :title="isCollapsed ? '阶段创作' : ''">
            <span class="nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </span>
            <span v-if="!isCollapsed">阶段创作</span>
          </button>
        </div>

        <div class="nav-group">
          <button class="nav-item" :class="{ active: route.path === '/assets' }" @click="router.push('/assets')" :title="isCollapsed ? '资产管理' : ''">
            <span class="nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </span>
            <span v-if="!isCollapsed">资产管理</span>
          </button>
        </div>

        <div class="nav-group">
          <button class="nav-item" :class="{ active: currentMode === 'workflow' }" @click="router.push('/workflow')" :title="isCollapsed ? '画布编排' : ''">
            <span class="nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </span>
            <span v-if="!isCollapsed">画布编排</span>
          </button>

          <button class="nav-item" :class="{ active: currentMode === 'director' }" @click="router.push('/director')" :title="isCollapsed ? '智能导演' : ''">
            <span class="nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </span>
            <span v-if="!isCollapsed">智能导演</span>
          </button>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="footer-item" @click="router.push('/settings')" :title="isCollapsed ? '设置' : ''">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          <span v-if="!isCollapsed">设置</span>
        </button>
        <div v-if="!isCollapsed" class="footer-user">{{ userStore.userInfo?.name || '未登录' }}</div>
        <button class="footer-item danger" @click="handleLogout" :title="isCollapsed ? '退出' : ''">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span v-if="!isCollapsed">退出</span>
        </button>
      </div>
    </aside>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSingleProject } from '@/api/project'
import { useProjectStore } from '@/stores/project'
import { useUserStore } from '@/stores/user'
import { type ProjectModeKey } from '@/views/project/navigation'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const userStore = useUserStore()

const isCollapsed = ref(false)

const currentMode = computed<ProjectModeKey>(() => (route.meta.mode as ProjectModeKey) || 'creation')
const currentProject = computed(() => projectStore.currentProject)
const currentProjectId = computed(() => {
  const routeId = route.params.id
  if (routeId) return String(routeId)
  if (projectStore.currentProject?.id) return String(projectStore.currentProject.id)
  return ''
})

async function ensureProjectLoaded(id: string | string[] | undefined) {
  const projectId = Array.isArray(id) ? id[0] : id
  if (!projectId) return
  if (currentProject.value?.id === Number(projectId)) return
  try {
    const res = await getSingleProject(Number(projectId)) as any
    const data = Array.isArray(res.data) ? res.data[0] : res.data
    if (data) projectStore.setProject(data)
  } catch (error) {
    console.error('[项目加载失败]:', error)
  }
}

function handleLogout() {
  userStore.logout()
  projectStore.clearProject()
  router.push('/login')
}

watch(() => route.params.id, (id) => {
  if (id) {
    isCollapsed.value = true
    ensureProjectLoaded(id)
  } else {
    ensureProjectLoaded(undefined)
  }
}, { immediate: true })
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  background: var(--tf-bg);
}

.app-sidebar {
  width: 220px;
  flex-shrink: 0;
  min-height: 100vh;
  border-right: 1px solid var(--tf-border);
  background: var(--tf-surface, #fafafa);
  display: flex;
  flex-direction: column;
  padding: 14px 10px 12px;
  gap: 4px;
  transition: width 0.2s ease;
  overflow: hidden;
}

.app-shell.collapsed .app-sidebar {
  width: 52px;
  padding: 14px 8px 12px;
}

.app-main {
  flex: 1;
  min-width: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 12px;
  border-bottom: 1px solid var(--tf-border);
  margin-bottom: 4px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tf-primary-dim);
  flex-shrink: 0;
}

.brand-name {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  color: var(--tf-text);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--tf-text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}

.collapse-btn:hover {
  background: var(--tf-surface-2, rgba(0,0,0,0.06));
  color: var(--tf-text);
}

.expand-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--tf-border);
  background: #fff;
  color: var(--tf-text-2);
  cursor: pointer;
  margin: 0 auto 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  transition: background 0.12s, color 0.12s, box-shadow 0.12s;
}

.expand-fab:hover {
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
  border-color: rgba(99,102,241,0.3);
  box-shadow: 0 2px 8px rgba(99,102,241,0.15);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--tf-border);
}

.nav-group:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--tf-text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
  font-family: inherit;
  text-align: left;
  width: 100%;
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--tf-surface-2, rgba(0,0,0,0.04));
  color: var(--tf-text);
}

.nav-item.active {
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
  font-weight: 600;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

.nav-item.active .nav-icon { opacity: 1; }

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--tf-border);
}

.footer-user {
  flex: 1;
  font-size: 11px;
  color: var(--tf-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}

.footer-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--tf-text-3);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
}

.footer-item:hover {
  background: var(--tf-surface-2, rgba(0,0,0,0.04));
  color: var(--tf-text);
}

.footer-item.danger:hover {
  color: #dc2626;
  background: rgba(220,38,38,0.06);
}

@media (max-width: 1100px) {
  .app-shell { flex-direction: column; }
  .app-sidebar { width: 100% !important; min-height: auto; border-right: none; border-bottom: 1px solid var(--tf-border); }
}
</style>
