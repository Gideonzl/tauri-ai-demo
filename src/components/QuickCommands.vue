<!--
  QuickCommands — Quick Command Palette
  - Predefined ops commands (disk, memory, docker, nginx, logs, etc.)
  - Custom commands CRUD
  - Click to send command to terminal input
  - Collapsible panel at top of terminal area
  Termius dark style, no emoji
-->
<template>
  <div class="quick-cmds" :class="{ collapsed: collapsed }">
    <!-- Header bar -->
    <div class="qc-header" @click="collapsed = !collapsed">
      <div class="qc-header-left">
        <el-icon :size="12"><component :is="collapsed ? 'ArrowRight' : 'ArrowDown'" /></el-icon>
        <span class="qc-title">Quick Commands</span>
        <span class="qc-count">{{ filteredCommands.length }}</span>
      </div>
      <div class="qc-header-actions">
        <el-button size="small" text @click.stop="toggleManage">
          <el-icon :size="13"><Setting /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Command grid (collapsible) -->
    <div v-if="!collapsed" class="qc-body">
      <!-- Category filter tabs -->
      <div class="qc-categories">
        <span
          v-for="cat in categories"
          :key="cat"
          class="qc-cat-tag"
          :class="{ active: activeCategory === cat }"
          @click="activeCategory = cat"
        >{{ cat }}</span>
      </div>

      <!-- Command list -->
      <div class="qc-list">
        <div
          v-for="cmd in filteredCommands"
          :key="cmd.id"
          class="qc-item"
          :title="cmd.description"
          @click="handleExecute(cmd)"
          @contextmenu.prevent="handleItemContextMenu(cmd)"
        >
          <span class="qc-cmd-name">{{ cmd.name }}</span>
          <span class="qc-cmd-text">{{ cmd.command }}</span>
        </div>
        <div v-if="filteredCommands.length === 0" class="qc-empty">
          No commands in this category
        </div>
      </div>

      <!-- Manage mode: add new command -->
      <div v-if="manageMode" class="qc-manage">
        <div class="qc-manage-form">
          <el-input v-model="newCmd.name" size="small" placeholder="Command name" class="qc-mfield" />
          <el-input v-model="newCmd.command" size="small" placeholder="e.g. df -h" class="qc-mfield" />
          <el-select v-model="newCmd.category" size="small" placeholder="Category" class="qc-mfield">
            <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
          </el-select>
          <el-button size="small" type="primary" @click="handleAddCmd">Add</el-button>
        </div>
        <div v-for="cmd in sshStore.quickCommands" :key="cmd.id" class="qc-manage-item">
          <span class="qc-mname">{{ cmd.name }}</span>
          <el-button size="small" text type="danger" @click="sshStore.deleteQuickCommand(cmd.id)">
            <el-icon :size="12"><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage } from 'element-plus'
import { Setting, Delete, ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import type { QuickCommand } from '@/stores/ssh'

const sshStore = useSshStore()
const collapsed = ref(true)
const manageMode = ref(false)
const activeCategory = ref('All')

const categories = computed(() => {
  const cats = new Set<string>()
  cats.add('All')
  for (const cmd of sshStore.quickCommands) {
    if (cmd.category) cats.add(cmd.category)
  }
  return Array.from(cats)
})

const filteredCommands = computed(() => {
  if (activeCategory.value === 'All') return sshStore.quickCommands
  return sshStore.quickCommands.filter(c => c.category === activeCategory.value)
})

const newCmd = reactive({
  name: '',
  command: '',
  category: 'System',
})

function toggleManage() {
  manageMode.value = !manageMode.value
}

function handleAddCmd() {
  if (!newCmd.name || !newCmd.command) {
    ElMessage.warning('Please fill in name and command')
    return
  }
  sshStore.addQuickCommand({
    name: newCmd.name,
    command: newCmd.command,
    description: '',
    category: newCmd.category || 'Custom',
  })
  newCmd.name = ''
  newCmd.command = ''
  ElMessage.success('Command added')
}

function handleExecute(cmd: QuickCommand) {
  // Emit event up to TerminalPanel via provide/inject or custom event
  // We use inject from parent
  if (injectCommand) {
    injectCommand(cmd.command)
  } else {
    navigator.clipboard.writeText(cmd.command).then(() => {
      ElMessage.success('Copied to clipboard: ' + cmd.command)
    })
  }
}

function handleItemContextMenu(cmd: QuickCommand) {
  const text = `Click to execute "${cmd.command}"`
  ElMessage.info(text)
}

// inject from parent (TerminalPanel sets this up)
import { inject } from 'vue'
const injectCommand = inject<(cmd: string) => void>('injectQuickCommand', undefined)
</script>

<style lang="scss" scoped>
.quick-cmds {
  background-color: $color-bg-surface;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;

  &.collapsed {
    .qc-body { display: none; }
  }
}

.qc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 $spacing-sm;
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: $color-bg-hover;
  }
}

.qc-header-left {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.qc-title {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.qc-count {
  background-color: $color-bg-hover;
  padding: 0 5px;
  border-radius: $border-radius-sm;
  font-size: 10px;
  color: $color-text-muted;
}

.qc-body {
  padding: $spacing-xs $spacing-sm;
}

.qc-categories {
  display: flex;
  gap: 4px;
  margin-bottom: $spacing-xs;
  flex-wrap: wrap;
}

.qc-cat-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: $border-radius-sm;
  cursor: pointer;
  color: $color-text-secondary;
  background-color: $color-bg-input;
  transition: all $transition-fast;

  &:hover { color: $color-text-primary; }
  &.active {
    color: $color-primary;
    background-color: rgba(91, 141, 239, 0.12);
  }
}

.qc-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.qc-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 8px;
  border-radius: $border-radius-sm;
  cursor: pointer;
  background-color: $color-bg-input;
  border: 1px solid $color-border-light;
  transition: all $transition-fast;
  min-width: 100px;
  flex: 1 0 auto;

  &:hover {
    border-color: $color-primary;
    background-color: rgba(91, 141, 239, 0.08);
  }
}

.qc-cmd-name {
  font-size: $font-size-xs;
  font-weight: 600;
  color: $color-text-primary;
}

.qc-cmd-text {
  font-size: 10px;
  color: $color-text-secondary;
  font-family: $font-family-mono;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-empty {
  font-size: $font-size-xs;
  color: $color-text-placeholder;
  padding: $spacing-sm;
}

.qc-manage {
  border-top: 1px solid $color-border-light;
  margin-top: $spacing-xs;
  padding-top: $spacing-xs;
}

.qc-manage-form {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: $spacing-xs;
}

.qc-mfield {
  flex: 1;
  min-width: 80px;
}

.qc-manage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px $spacing-xs;
  font-size: $font-size-xs;
  color: $color-text-regular;

  &:hover {
    background-color: $color-bg-hover;
  }
}

.qc-mname {
  font-family: $font-family-mono;
  font-size: $font-size-xs;
}
</style>
