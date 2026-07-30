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
import { Monitor, Cpu, Document, FolderOpened, Setting, Clock, Odometer } from '@element-plus/icons-vue'
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
  { id: 'scripts', path: '/scripts', label: t('nav.scripts'), icon: Document },
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
  background: $shell-nav-rail;
  box-shadow: none;
  opacity: 0.18;
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
  height: 48px;
  padding: 0 7px;
  border-radius: 8px;
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
    background: $color-bg-hover;
    color: $color-text-primary;
    border-color: $color-border;
    .nav-icon-shell { transform: none; color: $color-primary; }
  }

  &.active {
    color: $color-primary;
    background: $color-bg-active;
    border-color: transparent;
    box-shadow: none;
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 9px;
      bottom: 9px;
      width: 2px;
      border-radius: 0 2px 2px 0;
      background: $color-primary;
    }
    .nav-icon-shell {
      color: $color-primary;
      background: transparent;
      border-color: transparent;
      box-shadow: none;
    }
  }
}

.nav-icon-shell {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
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
