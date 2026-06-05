/**
 * 左侧导航菜单 — Termius极简导航
 * 连接 / AI模型管理 / 终端 / SFTP / 设置
 * 侧栏窄时仅图标，侧栏宽时图标+文字
 * 无emoji，使用Element Plus图标
 */
<template>
  <div class="side-nav">
    <div
      v-for="item in navItems"
      :key="item.path"
      class="nav-item"
      :class="{ active: currentRoute === item.path, bottom: item.bottom }"
      :title="item.label"
      @click="navigate(item.path)"
    >
      <el-icon :size="18"><component :is="item.icon" /></el-icon>
      <span v-if="showLabels" class="nav-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, Ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Monitor, Cpu, SetUp, FolderOpened, Setting } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const currentRoute = computed(() => route.path)

// 从MainLayout注入侧栏宽度
const sidebarWidth = inject<Ref<number>>('sidebarWidth', { value: 56 } as any)
// 宽度超过80px时显示文字标签
const showLabels = computed(() => sidebarWidth.value > 80)

const navItems = [
  { path: '/', label: 'Hosts', icon: Monitor, bottom: false },
  { path: '/ai-config', label: 'AI Models', icon: Cpu, bottom: false },
  { path: '/terminal', label: 'Terminal', icon: SetUp, bottom: false },
  { path: '/sftp', label: 'SFTP', icon: FolderOpened, bottom: false },
  { path: '/settings', label: 'Settings', icon: Setting, bottom: true },
]

function navigate(path: string) {
  router.push(path)
}
</script>

<style lang="scss" scoped>
.side-nav {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  padding-top: $spacing-md;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 $spacing-sm;
  border-radius: $border-radius-sm;
  cursor: pointer;
  color: $color-text-secondary;
  transition: all $transition-fast;
  position: relative;
  white-space: nowrap;
  overflow: hidden;

  &:hover {
    background-color: $color-bg-hover;
    color: $color-text-regular;
  }

  &.active {
    color: $color-primary;
    background-color: $color-bg-active;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 2px;
      height: 16px;
      background-color: $color-primary;
      border-radius: 0 1px 1px 0;
    }
  }

  &.bottom {
    margin-top: auto;
    margin-bottom: $spacing-md;
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
