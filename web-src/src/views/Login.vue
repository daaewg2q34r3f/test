<template>
  <div class="login-page">
    <div class="login-card fade-in">
      <div class="login-brand">
        <div class="brand-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="10" fill="#6366F1"/>
            <path d="M8 11l8-4 8 4v10l-8 4-8-4V11z" stroke="white" stroke-width="1.5" fill="none"/>
            <circle cx="16" cy="16" r="3" fill="white"/>
          </svg>
        </div>
        <h1 class="brand-title">GalaxyLoom</h1>
        <p class="brand-desc">AI 短剧创作平台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" size="large" prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="login-btn" @click="handleLogin">
          登录
        </el-button>
      </el-form>
    </div>

    <!-- Background decoration -->
    <div class="bg-orb bg-orb-1" />
    <div class="bg-orb bg-orb-2" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { login } from '@/api/setting'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  if (!formRef.value) return
  await formRef.value.validate()
  loading.value = true
  try {
    const res = await login(form) as any
    const { token, name, id } = res.data
    userStore.setToken(token)
    userStore.setUserInfo({ id, name })
    ElMessage.success('登录成功')
    router.push('/')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tf-bg);
  position: relative;
  overflow: hidden;
}

/* Soft ambient orbs */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
}
.bg-orb-1 {
  width: 500px; height: 500px;
  background: rgba(99,102,241,0.12);
  top: -120px; left: -120px;
}
.bg-orb-2 {
  width: 400px; height: 400px;
  background: rgba(129,140,248,0.10);
  bottom: -100px; right: -80px;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 400px;
  background: #fff;
  border: 1px solid var(--tf-border);
  border-radius: 20px;
  padding: 48px 40px 40px;
  box-shadow: 0 2px 8px rgba(30,27,75,0.06), 0 20px 56px rgba(99,102,241,0.12);
}

.login-brand {
  text-align: center;
  margin-bottom: 36px;
}

.brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.brand-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--tf-text);
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}

.brand-desc {
  font-size: 13px;
  color: var(--tf-text-3);
}

:deep(.el-form-item) { margin-bottom: 16px; }

.login-btn {
  width: 100%;
  margin-top: 8px;
  height: 44px !important;
  font-size: 15px !important;
  border-radius: 10px !important;
  font-weight: 600 !important;
}
</style>
