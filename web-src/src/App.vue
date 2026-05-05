<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>

<style>
/* =====================================================
   Design System — GalaxyLoom (ui-ux-pro-max generated)
   Micro SaaS Palette + Motion-Driven + Feature Showcase
   ===================================================== */
:root {
  /* Core palette — Micro SaaS */
  --tf-bg:           #F5F3FF;
  --tf-surface:      #FFFFFF;
  --tf-surface-2:    #FAF9FF;
  --tf-surface-3:    #EDE9FE;
  --tf-primary:      #6366F1;
  --tf-primary-b:    #818CF8;
  --tf-primary-deep: #4F46E5;
  --tf-primary-dim:  rgba(99,102,241,0.08);
  --tf-cta:          #10B981;
  --tf-text:         #1E1B4B;
  --tf-text-2:       #4C4B7A;
  --tf-text-3:       #9998C0;
  --tf-border:       #E5E4F8;
  --tf-border-a:     #C7C5EF;
  --tf-success:      #10B981;
  --tf-error:        #EF4444;
  --tf-warn:         #F59E0B;
  /* Shadow system */
  --tf-shadow-sm:    0 1px 3px rgba(30,27,75,0.06), 0 1px 2px rgba(30,27,75,0.04);
  --tf-shadow-md:    0 4px 16px rgba(30,27,75,0.08), 0 2px 4px rgba(30,27,75,0.05);
  --tf-shadow-hover: 0 12px 32px rgba(99,102,241,0.18), 0 4px 8px rgba(30,27,75,0.06);
  --tf-shadow-focus: 0 0 0 3px rgba(99,102,241,0.20);

  /* Element Plus overrides */
  --el-color-primary:          #6366F1;
  --el-color-primary-light-3:  #818CF8;
  --el-color-primary-light-5:  #A5B4FC;
  --el-color-primary-light-7:  #C7D2FE;
  --el-color-primary-light-9:  #EEF2FF;
  --el-color-primary-dark-2:   #4F46E5;
  --el-bg-color:               #FFFFFF;
  --el-bg-color-page:          #F5F3FF;
  --el-bg-color-overlay:       #FFFFFF;
  --el-text-color-primary:     #1E1B4B;
  --el-text-color-regular:     #3D3B6E;
  --el-text-color-secondary:   #4C4B7A;
  --el-text-color-placeholder: #9998C0;
  --el-border-color:           #D1CFF5;
  --el-border-color-light:     #E5E4F8;
  --el-border-color-lighter:   #F0EFFC;
  --el-fill-color:             #F5F3FF;
  --el-fill-color-light:       #FAF9FF;
  --el-fill-color-blank:       #FFFFFF;
  --el-mask-color:             rgba(245,243,255,0.82);
  --el-color-success:          #10B981;
  --el-color-warning:          #F59E0B;
  --el-color-danger:           #EF4444;
  --el-color-info:             #9998C0;
  --el-border-radius-base:     8px;
  --el-box-shadow:             var(--tf-shadow-md);
  --el-box-shadow-light:       var(--tf-shadow-sm);
}

/* =====================================================
   Base Reset
   ===================================================== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Plus Jakarta Sans', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  background: var(--tf-bg);
  color: var(--tf-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* =====================================================
   Scrollbar
   ===================================================== */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #C7C5EF; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--tf-primary-b); }

/* =====================================================
   Motion — prefers-reduced-motion respected
   ===================================================== */
@media (prefers-reduced-motion: no-preference) {
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-in { animation: fadeUp 0.32s ease both; }
  .fade-in:nth-child(1)  { animation-delay: 0.04s; }
  .fade-in:nth-child(2)  { animation-delay: 0.08s; }
  .fade-in:nth-child(3)  { animation-delay: 0.12s; }
  .fade-in:nth-child(4)  { animation-delay: 0.16s; }
  .fade-in:nth-child(5)  { animation-delay: 0.20s; }
  .fade-in:nth-child(6)  { animation-delay: 0.24s; }
  .fade-in:nth-child(n+7){ animation-delay: 0.28s; }
}

/* =====================================================
   El-Input
   ===================================================== */
.el-input__wrapper {
  background: #fff !important;
  box-shadow: 0 0 0 1px #D1CFF5 inset !important;
  transition: box-shadow 0.18s ease !important;
}
.el-input__wrapper:hover {
  box-shadow: 0 0 0 1px var(--tf-primary-b) inset !important;
}
.el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1.5px var(--tf-primary) inset, var(--tf-shadow-focus) !important;
}
.el-input__inner { color: var(--tf-text) !important; background: transparent !important; }
.el-input__inner::placeholder { color: var(--tf-text-3) !important; }

.el-textarea__inner {
  background: #fff !important;
  border: 1px solid #D1CFF5 !important;
  color: var(--tf-text) !important;
  font-family: inherit !important;
  transition: border-color 0.18s, box-shadow 0.18s !important;
}
.el-textarea__inner:focus {
  border-color: var(--tf-primary) !important;
  box-shadow: var(--tf-shadow-focus) !important;
}
.el-textarea__inner::placeholder { color: var(--tf-text-3) !important; }

/* =====================================================
   El-Button
   ===================================================== */
.el-button--primary {
  background: var(--tf-primary) !important;
  border-color: var(--tf-primary) !important;
  color: #fff !important;
  font-weight: 600 !important;
  letter-spacing: 0.01em !important;
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease !important;
}
.el-button--primary:hover {
  background: var(--tf-primary-deep) !important;
  border-color: var(--tf-primary-deep) !important;
  box-shadow: 0 4px 14px rgba(99,102,241,0.35) !important;
  transform: translateY(-1px) !important;
}
.el-button--primary:active { transform: translateY(0) !important; box-shadow: none !important; }

.el-button--default {
  background: #fff !important;
  border: 1px solid #D1CFF5 !important;
  color: var(--tf-text-2) !important;
  transition: all 0.18s ease !important;
}
.el-button--default:hover {
  border-color: var(--tf-primary-b) !important;
  color: var(--tf-primary) !important;
  background: var(--tf-primary-dim) !important;
}

.el-button.is-text { color: var(--tf-text-2) !important; }
.el-button.is-text:hover {
  color: var(--tf-primary) !important;
  background: var(--tf-primary-dim) !important;
}

/* =====================================================
   El-Card
   ===================================================== */
.el-card {
  background: #fff !important;
  border: 1px solid var(--tf-border) !important;
  box-shadow: var(--tf-shadow-sm) !important;
  border-radius: 12px !important;
}

/* =====================================================
   El-Dialog
   ===================================================== */
.el-dialog {
  background: #fff !important;
  border: 1px solid var(--tf-border) !important;
  border-radius: 16px !important;
  box-shadow: 0 24px 64px rgba(30,27,75,0.16) !important;
}
.el-dialog__title { color: var(--tf-text) !important; font-weight: 700 !important; font-size: 16px !important; }
.el-dialog__header { border-bottom: 1px solid var(--tf-border) !important; padding-bottom: 16px !important; }
.el-dialog__footer { border-top: 1px solid var(--tf-border) !important; }

/* =====================================================
   El-Tag
   ===================================================== */
.el-tag {
  background: var(--tf-surface-3) !important;
  border-color: var(--tf-border-a) !important;
  color: var(--tf-text-2) !important;
  font-size: 11px !important;
  border-radius: 6px !important;
  font-family: inherit !important;
}
.el-tag--success { background: #D1FAE5 !important; border-color: #6EE7B7 !important; color: #065F46 !important; }
.el-tag--warning { background: #FEF3C7 !important; border-color: #FCD34D !important; color: #92400E !important; }
.el-tag--danger  { background: #FEE2E2 !important; border-color: #FCA5A5 !important; color: #991B1B !important; }
.el-tag--info    { background: var(--tf-surface-3) !important; border-color: var(--tf-border-a) !important; color: var(--tf-text-2) !important; }

/* =====================================================
   El-Select / Dropdown
   ===================================================== */
.el-select__wrapper {
  background: #fff !important;
  box-shadow: 0 0 0 1px #D1CFF5 inset !important;
}
.el-select__wrapper:hover { box-shadow: 0 0 0 1px var(--tf-primary-b) inset !important; }

.el-select-dropdown {
  background: #fff !important;
  border: 1px solid var(--tf-border-a) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(30,27,75,0.14) !important;
  overflow: hidden !important;
}
.el-select-dropdown__item { color: var(--tf-text-2) !important; font-family: inherit !important; }
.el-select-dropdown__item:hover,
.el-select-dropdown__item.is-hovering { background: var(--tf-primary-dim) !important; color: var(--tf-primary) !important; }
.el-select-dropdown__item.is-selected { color: var(--tf-primary) !important; font-weight: 600 !important; }

/* =====================================================
   El-Dropdown Menu
   ===================================================== */
.el-dropdown-menu {
  background: #fff !important;
  border: 1px solid var(--tf-border-a) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(30,27,75,0.12) !important;
  overflow: hidden !important;
}
.el-dropdown-menu__item { color: var(--tf-text-2) !important; font-family: inherit !important; }
.el-dropdown-menu__item:hover { background: var(--tf-primary-dim) !important; color: var(--tf-primary) !important; }

/* =====================================================
   El-Form
   ===================================================== */
.el-form-item__label { color: var(--tf-text-2) !important; font-weight: 500 !important; font-size: 13px !important; }

/* =====================================================
   El-Tabs
   ===================================================== */
.el-tabs__item { color: var(--tf-text-3) !important; font-weight: 500 !important; }
.el-tabs__item.is-active { color: var(--tf-primary) !important; font-weight: 600 !important; }
.el-tabs__active-bar { background: var(--tf-primary) !important; }
.el-tabs__nav-wrap::after { background: var(--tf-border) !important; height: 1px !important; }

/* =====================================================
   El-Loading
   ===================================================== */
.el-loading-mask {
  background: rgba(245,243,255,0.80) !important;
  backdrop-filter: blur(4px);
}

/* =====================================================
   El-Slider
   ===================================================== */
.el-slider__bar { background: var(--tf-primary) !important; }
.el-slider__button { border-color: var(--tf-primary) !important; }
.el-slider__button:hover { box-shadow: 0 0 0 4px rgba(99,102,241,0.2) !important; }

/* =====================================================
   El-Divider
   ===================================================== */
.el-divider--vertical { border-color: var(--tf-border-a) !important; }
.el-divider--horizontal { border-color: var(--tf-border) !important; }

/* =====================================================
   El-Empty
   ===================================================== */
.el-empty__description p { color: var(--tf-text-3) !important; }

/* =====================================================
   El-Message
   ===================================================== */
.el-message { border-radius: 10px !important; box-shadow: var(--tf-shadow-md) !important; }

/* =====================================================
   El-Notification
   ===================================================== */
.el-notification { border-radius: 12px !important; border-color: var(--tf-border) !important; }
</style>
