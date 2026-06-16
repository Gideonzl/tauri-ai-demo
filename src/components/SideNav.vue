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
import { Monitor, Cpu, FolderOpened, Setting } from '@element-plus/icons-vue'
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
  { id: 'ai', path: '/ai-config', label: t('nav.aiModels'), icon: Cpu },
  { id: 'sftp', path: '', label: t('nav.sftp'), icon: FolderOpened },
])
const bottomItems = computed<NavItem[]>(() => [
  { id: 'settings', path: '/settings', label: t('nav.settings'), icon: Setting },
])

function isActive(item: NavItem): boolean {
  if (item.id === 'sftp') return false  // SFTP is a panel toggle, never highlighted as route
  if (item.id === 'hosts') return route.path === '/' || route.path.startsWith('/?')
  return route.path === item.path
}

function navigate(item: NavItem) {
  if (item.id === 'sftp') { if (route.path !== '/') router.push('/'); return }
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

  &:hover {
    background-color: $color-bg-hover;
    color: $color-text-regular;
  }

  &.active {
    color: $color-primary;
    background-color: $color-bg-active;
    border-left-color: $color-primary;
  }
}

.nav-label {
  margin-left: $spacing-sm;
  font-size: $font-size-sm;
  font-weight: 500;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
