<!--
  SideNav — Termius 1:1 Left Sidebar Navigation
  Icon-only mode when sidebar is narrow (< 80px)
  Shows labels when expanded
  Settings icon pinned to bottom
-->
<template>
  <nav class="side-nav" @contextmenu.prevent>
    <div class="rail-glow"></div>
    <!-- Top section: main navigation -->
    <div class="nav-top">
      <div
        v-for="item in topItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: isActive(item) }"
        :title="item.label"
        @click="navigate(item)"
      >
        <span class="nav-icon-shell">
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
        </span>
        <span v-if="showLabels" class="nav-label">{{ item.label }}</span>
      </div>
    </div>

    <!-- Bottom section: settings -->
    <div class="nav-bottom">
      <div
        v-for="item in bottomItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: isActive(item) }"
        :title="item.label"
        @click="navigate(item)"
      >
        <span class="nav-icon-shell">
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
        </span>
        <span v-if="showLabels" class="nav-label">{{ item.label }}</span>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Monitor, Cpu, FolderOpened, Setting, Clock, Odometer } from '@element-plus/icons-vue'
import type { Ref } from 'vue'
import { useLocale } from '@/composables/useLocale'

const router = useRouter()
const route = useRoute()
const { t } = useLocale()

// Sidebar width from parent → show labels when > 80px
const sidebarWidth = inject<Ref<number>>('sidebarWidth')
const showLabels = computed(() => (sidebarWidth?.value ?? 56) > 80)

// Navigation items — labels reactive to locale
interface NavItem { id: string; path: string; label: string; icon: any }
const topItems = computed<NavItem[]>(() => [
  { id: 'hosts', path: '/', label: t('nav.hosts'), icon: Monitor },
  { id: 'history', path: '/history', label: t('nav.history'), icon: Clock },
  { id: 'ops', path: '/ops', label: t('nav.ops'), icon: Odometer },
  { id: 'ai', path: '/ai-config', label: t('nav.aiModels'), icon: Cpu },
  { id: 'sftp', path: '/sftp', label: t('nav.sftp'), icon: FolderOpened },
])
const bottomItems = computed<NavItem[]>(() => [
  { id: 'settings', path: '/settings', label: t('nav.settings'), icon: Setting },
])

function isActive(item: NavItem): boolean {
  if (item.id === 'hosts') return route.path === '/' || route.path.startsWith('/?')
  return route.path === item.path
}

function navigate(item: NavItem) {
  if (item.path === route.path) return
  router.push(item.path)
}
</script>

<style lang="scss" scoped>
.side-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 10px 8px;
  position: relative;
  overflow: hidden;
}

.rail-glow {
  position: absolute;
  left: 7px;
  top: 18px;
  bottom: 18px;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(34,247,255,0.7), rgba(168,85,255,0.6), transparent);
  box-shadow: $glow-cyan;
  opacity: 0.55;
}

.nav-top {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding-top: $spacing-sm;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.nav-bottom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: auto;
  padding-bottom: $spacing-sm;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 8px;
  border-radius: 16px;
  cursor: pointer;
  color: $color-text-regular;
  transition: all $transition-fast;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  border: 1px solid transparent;
  animation: fade-in-up 0.3s ease backwards;
  background: transparent;

  &:hover {
    background: rgba(255,255,255,0.04);
    color: $color-text-primary;
    border-color: rgba(34,247,255,0.13);
    .nav-icon-shell { transform: translateY(-1px) scale(1.04); border-color: rgba(34,247,255,0.36); box-shadow: $glow-soft; }
  }

  &.active {
    color: $neon-cyan;
    background:
      linear-gradient(90deg, rgba(34,247,255,0.16), rgba(168,85,255,0.08)),
      rgba(255,255,255,0.035);
    border-color: rgba(34,247,255,0.28);
    box-shadow: inset 0 0 18px rgba(34,247,255,0.08), 0 0 22px rgba(34,247,255,0.08);
    .nav-icon-shell {
      color: #061018;
      background: linear-gradient(135deg, $neon-cyan, $neon-violet);
      border-color: rgba(255,255,255,0.4);
      box-shadow: $glow-cyan;
    }
  }
}

.nav-icon-shell {
  width: 30px;
  height: 30px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.035);
  color: inherit;
  text-shadow: $text-shadow-strong;
  flex-shrink: 0;
  transition: all $transition-normal;

  .el-icon {
    transition: transform $transition-normal, filter $transition-normal;
  }
}

// Stagger nav entrance
.nav-top .nav-item:nth-child(1) { animation-delay: 0.02s; }
.nav-top .nav-item:nth-child(2) { animation-delay: 0.06s; }
.nav-top .nav-item:nth-child(3) { animation-delay: 0.10s; }
.nav-top .nav-item:nth-child(4) { animation-delay: 0.14s; }

.nav-label {
  margin-left: $spacing-sm;
  font-size: $font-size-sm;
  font-weight: 650;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
