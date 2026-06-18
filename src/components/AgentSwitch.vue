/**
 * 智能体切换 — Agent 选择栏（编程/运维/分析/通用）
 * 模式切换（智能问答/智能体）已移至输入框旁的下拉选择器
 */
<template>
  <div class="agent-switch" @contextmenu.prevent>
    <div
      v-for="agent in agentStore.agents"
      :key="agent.id"
      class="agent-item"
      :class="{ active: agent.id === agentStore.activeAgentId }"
      :title="agent.name"
      @click="agentStore.switchAgent(agent.id)"
    >
      <el-icon :size="16"><component :is="agentIcons[agent.id]" /></el-icon>
      <span class="agent-name">{{ agent.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAgentStore } from '@/stores/agent'
import { Edit, SetUp, DataLine, ChatDotRound } from '@element-plus/icons-vue'

const agentStore = useAgentStore()

const agentIcons: Record<string, any> = {
  coder: Edit,
  ops: SetUp,
  analyst: DataLine,
  assistant: ChatDotRound,
}
</script>

<style lang="scss" scoped>
.agent-switch {
  display: flex;
  gap: 2px;
  padding: 0 $spacing-sm;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: $border-radius-sm;
  cursor: pointer;
  color: $color-text-secondary;
  transition: all $transition-fast;
  white-space: nowrap;

  .agent-name {
    font-size: $font-size-xs;
    display: none;
  }

  &:hover {
    background-color: $color-bg-hover;
    color: $color-text-regular;

    .agent-name { display: inline; }
  }

  &.active {
    color: $color-primary;
    background-color: $color-bg-active;

    .agent-name { display: inline; }
  }
}
</style>
