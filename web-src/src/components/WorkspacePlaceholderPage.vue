<template>
  <div class="workspace-page fade-in">
    <section class="hero-card">
      <div class="hero-copy">
        <span class="hero-badge">{{ badge }}</span>
        <h1 class="hero-title">{{ title }}</h1>
        <p class="hero-description">{{ description }}</p>
      </div>

      <div v-if="$slots.actions" class="hero-actions">
        <slot name="actions" />
      </div>
    </section>

    <section v-if="stats.length > 0" class="stats-grid">
      <article v-for="stat in stats" :key="stat.label" class="stat-card">
        <span class="stat-label">{{ stat.label }}</span>
        <strong class="stat-value">{{ stat.value }}</strong>
        <p v-if="stat.hint" class="stat-hint">{{ stat.hint }}</p>
      </article>
    </section>

    <section class="panel-grid">
      <article v-for="panel in panels" :key="panel.title" class="panel-card">
        <div class="panel-head">
          <span v-if="panel.tag" class="panel-tag">{{ panel.tag }}</span>
          <h3 class="panel-title">{{ panel.title }}</h3>
        </div>
        <p class="panel-description">{{ panel.description }}</p>
        <ul v-if="panel.points?.length" class="panel-points">
          <li v-for="point in panel.points" :key="point">{{ point }}</li>
        </ul>
      </article>
    </section>

    <section v-if="checklist.length > 0 || note" class="note-card">
      <div class="note-head">
        <h3 class="note-title">{{ checklistTitle }}</h3>
        <p v-if="note" class="note-description">{{ note }}</p>
      </div>

      <ul v-if="checklist.length > 0" class="checklist">
        <li v-for="item in checklist" :key="item" class="checklist-item">
          <span class="check-icon">+</span>
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
interface WorkspaceStat {
  label: string
  value: string
  hint?: string
}

interface WorkspacePanel {
  title: string
  description: string
  tag?: string
  points?: string[]
}

withDefaults(defineProps<{
  badge: string
  title: string
  description: string
  stats?: WorkspaceStat[]
  panels: WorkspacePanel[]
  checklistTitle?: string
  checklist?: string[]
  note?: string
}>(), {
  stats: () => [],
  checklistTitle: '页面规划',
  checklist: () => [],
  note: ''
})
</script>

<style scoped>
.workspace-page {
  height: calc(100vh - 60px);
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: radial-gradient(circle at top right, rgba(129, 140, 248, 0.18), transparent 22%), var(--tf-bg);
}

.hero-card,
.stat-card,
.panel-card,
.note-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--tf-border);
  border-radius: 20px;
  box-shadow: var(--tf-shadow-sm);
}

.hero-card {
  padding: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.hero-copy {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 760px;
}

.hero-badge {
  width: fit-content;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--tf-primary-dim);
  color: var(--tf-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.hero-title {
  font-size: 28px;
  line-height: 1.15;
  color: var(--tf-text);
  letter-spacing: -0.03em;
}

.hero-description {
  max-width: 720px;
  color: var(--tf-text-2);
  font-size: 14px;
  line-height: 1.8;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  min-width: 220px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--tf-text-3);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-value {
  font-size: 24px;
  color: var(--tf-text);
  letter-spacing: -0.03em;
}

.stat-hint {
  font-size: 13px;
  color: var(--tf-text-2);
  line-height: 1.7;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.panel-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-tag {
  padding: 4px 9px;
  border-radius: 999px;
  background: #eef2ff;
  color: var(--tf-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.panel-title {
  flex: 1;
  font-size: 17px;
  color: var(--tf-text);
  letter-spacing: -0.02em;
}

.panel-description {
  font-size: 13px;
  line-height: 1.75;
  color: var(--tf-text-2);
}

.panel-points {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel-points li {
  position: relative;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--tf-text-2);
}

.panel-points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tf-primary-b);
}

.note-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.note-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note-title {
  font-size: 17px;
  color: var(--tf-text);
  letter-spacing: -0.02em;
}

.note-description {
  font-size: 13px;
  color: var(--tf-text-2);
  line-height: 1.7;
}

.checklist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  list-style: none;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--tf-text-2);
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--tf-surface-2);
  border: 1px solid var(--tf-border);
}

.check-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--tf-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

@media (max-width: 1100px) {
  .hero-card {
    flex-direction: column;
  }

  .hero-actions {
    width: 100%;
    justify-content: flex-start;
    min-width: 0;
  }

  .stats-grid,
  .panel-grid,
  .checklist {
    grid-template-columns: 1fr;
  }
}
</style>
