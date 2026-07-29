<!--
  SideNav — Termius 1:1 Left Sidebar Navigation
  Icon-only mode when sidebar is narrow (< 80px)
  Shows labels when expanded
  Settings icon pinned to bottom
-->
<template>
  <nav class="side-nav" @contextmenu.prevent>
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
        <el-icon :size="18"><component :is="item.icon" /></el-icon>
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
        <el-icon :size="18"><component :is="item.icon" /></el-icon>
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
  padding: 0;
}

.nav-top {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding-top: $spacing-md;
  gap: 1px;
}

.nav-bottom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: auto;
  padding-bottom: $spacing-md;
  gap: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 $spacing-md;
  border-radius: 0;
  cursor: pointer;
  color: $color-text-secondary;
  transition: all $transition-fast;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  border-left: 2px solid transparent;
  animation: fade-in-up 0.3s ease backwards;

  .el-icon {
    transition: transform $transition-normal, filter $transition-normal;
  }

  &:hover {
    background-color: $color-bg-hover;
    color: $color-text-regular;
    .el-icon { transform: scale(1.14); }
  }

  &.active {
    color: $color-primary;
    background-color: $color-bg-active;
    border-left-color: $color-primary;
    .el-icon { filter: drop-shadow(0 0 6px var(--color-primary, #5b8def)); }
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
  font-weight: 500;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
