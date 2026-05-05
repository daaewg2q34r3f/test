<template>
  <div class="empty-page">
    <div class="empty-inner">
      <div class="empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      </div>
      <p class="empty-title">智能导演</p>
      <p class="empty-desc">即将上线，敬请期待</p>
    </div>
  </div>
</template>

<style scoped>
.empty-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tf-bg);
}
.empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--tf-text-3);
}
.empty-icon { opacity: 0.35; }
.empty-title { font-size: 15px; font-weight: 600; color: var(--tf-text-2); }
.empty-desc { font-size: 13px; }
</style>
