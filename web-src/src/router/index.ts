import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/',
      component: () => import('@/views/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/creation/projects'
        },
        {
          path: 'creation/projects',
          name: 'Home',
          component: () => import('@/views/Home.vue'),
          meta: {
            mode: 'creation',
            label: '项目列表',
            description: '阶段创作模式的入口页，集中查看和管理全部短剧项目。'
          }
        },
        {
          path: 'assets',
          name: 'AssetsTop',
          component: () => import('@/views/project/AssetManager.vue'),
          meta: {
            mode: 'creation',
            label: '资产管理',
            description: '统一管理角色、场景、道具等项目资产和引用关系。'
          }
        },
        {
          path: 'workflow',
          name: 'WorkflowStudio',
          component: () => import('@/views/project/WorkflowStudio.vue'),
          meta: {
            mode: 'workflow',
            label: '画布编排',
            description: '用节点连线和模块编排的方式组织短剧生产流程。'
          }
        },
        {
          path: 'director',
          name: 'DirectorStudio',
          component: () => import('@/views/project/DirectorStudio.vue'),
          meta: {
            mode: 'director',
            label: '智能导演',
            description: '通过 Agent 调用 Skill 和工具链，一键推进创作任务。'
          }
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/Settings.vue'),
          meta: {
            mode: 'creation',
            label: '设置',
            description: '管理模型配置、账号信息和全局参数。'
          }
        },
        {
          path: 'project/:id',
          component: () => import('@/views/project/Layout.vue'),
          meta: { mode: 'creation' },
          children: [
        {
          path: '',
          redirect: to => `/project/${to.params.id}/creation/stage1`
        },
        {
          path: 'stage1',
          redirect: to => `/project/${to.params.id}/creation/stage1`
        },
        {
          path: 'stage2',
          redirect: to => `/project/${to.params.id}/creation/stage2`
        },
        {
          path: 'stage3',
          redirect: to => `/project/${to.params.id}/creation/stage3`
        },
        {
          path: 'stage4',
          redirect: to => `/project/${to.params.id}/creation/stage4`
        },
        {
          path: 'stage5',
          redirect: to => `/project/${to.params.id}/creation/stage5`
        },
        {
          path: 'stage6',
          redirect: to => `/project/${to.params.id}/creation/stage6`
        },
        {
          path: 'creation/stage1',
          name: 'Stage1Novel',
          component: () => import('@/views/project/Stage1Novel.vue'),
          meta: {
            mode: 'creation',
            stageId: 1,
            label: '故事灵感',
            description: '围绕项目原稿、章节和故事灵感推进创作起点。'
          }
        },
        {
          path: 'creation/stage2',
          name: 'Stage2Outline',
          component: () => import('@/views/project/Stage2Outline.vue'),
          meta: {
            mode: 'creation',
            stageId: 2,
            label: '剧集大纲',
            description: '把原始故事沉淀成分集大纲、故事线和结构规划。'
          }
        },
        {
          path: 'creation/stage3',
          name: 'Stage3Script',
          component: () => import('@/views/project/Stage3Script.vue'),
          meta: {
            mode: 'creation',
            stageId: 3,
            label: '剧本生成',
            description: '基于大纲生成分集剧本，并持续打磨可拍摄内容。'
          }
        },
        {
          path: 'creation/stage4',
          name: 'Stage4Assets',
          component: () => import('@/views/project/Stage4Assets.vue'),
          meta: {
            mode: 'creation',
            stageId: 4,
            label: '项目资产',
            description: '围绕角色、场景、道具等项目资产做生成和整理。'
          }
        },
        {
          path: 'creation/stage5',
          name: 'Stage5Storyboard',
          component: () => import('@/views/project/Stage5Storyboard.vue'),
          meta: {
            mode: 'creation',
            stageId: 5,
            label: '分镜制作',
            description: '根据剧本和资产继续生成镜头规划与分镜结果。'
          }
        },
        {
          path: 'creation/stage6',
          name: 'Stage6Video',
          component: () => import('@/views/project/Stage6Video.vue'),
          meta: {
            mode: 'creation',
            stageId: 6,
            label: '视频合成',
            description: '配置视频生成方案，组织片段并输出最终内容。'
          }
        },
        {
          path: 'creation/novels',
          name: 'NovelManager',
          component: () => import('@/views/project/NovelManager.vue'),
          meta: {
            mode: 'creation',
            label: '小说管理',
            description: '集中管理项目中的长篇原稿、章节结构和版本快照。'
          }
        },
        {
          path: 'creation/scripts',
          name: 'ScriptManager',
          component: () => import('@/views/project/ScriptManager.vue'),
          meta: {
            mode: 'creation',
            label: '剧本管理',
            description: '集中查看项目的分集剧本、草稿版本和审核状态。'
          }
        },
        {
          path: 'creation/assets-library',
          name: 'AssetManager',
          component: () => import('@/views/project/AssetManager.vue'),
          meta: {
            mode: 'creation',
            label: '资产管理',
            description: '统一管理角色、场景、道具等项目资产和引用关系。'
          }
        }
          ]
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/creation/projects'
    }
  ]
})

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth !== false && !userStore.isLoggedIn()) {
    next('/login')
  } else if (to.path === '/login' && userStore.isLoggedIn()) {
    next('/')
  } else {
    next()
  }
})

export default router
