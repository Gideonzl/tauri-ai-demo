<!--
  SideNav — Termius 1:1 Left Sidebar Navigation
  Icon-only mode when sidebar is narrow (< 80px)
  Shows labels when expanded
  Settings icon pinned to bottom
-->
<template>
  <nav class="side-nav">
    <!-- Top section: main navigation -->
    <div class="nav-top">
      <div
        v-for="item in topItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        :title="item.label"
        @click="navigate(item.path)"
      >
        <el-icon :size="18"><component :is="item.icon" /></el-icon>
        <span v-if="showLabels" class="nav-label">{{ item.label }}</span>
      </div>
    </div>

    <!-- Bottom section: settings -->
    <div class="nav-bottom">
      <div
        v-for="item in bottomItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        :title="item.label"
        @click="navigate(item.path)"
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

const router = useRouter()
const route = useRoute()

// Sidebar width from parent → show labels when > 80px
const sidebarWidth = inject<Ref<number>>('sidebarWidth')
const showLabels = computed(() => (sidebarWidth?.value ?? 56) > 80)

// Navigation items
const topItems = [
  { path: '/', label: 'Hosts', icon: Monitor },
  { path: '/ai-config', label: 'AI Models', icon: Cpu },
  { path: '/', label: 'SFTP', icon: FolderOpened },  // SFTP is part of workspace
]

const bottomItems = [
  { path: '/settings', label: 'Settings', icon: Setting },
]

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/' || route.path.startsWith('/?')
  return route.path === path
}

function navigate(path: string) {
  if (path === route.path) return
  router.push(path)
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
