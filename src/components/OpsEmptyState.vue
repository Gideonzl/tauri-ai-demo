<template>
  <section class="ops-empty-state" :aria-label="title">
    <div class="ops-empty-icon">
      <el-icon :size="24"><component :is="icon" /></el-icon>
    </div>
    <div class="ops-empty-copy">
      <strong>{{ title }}</strong>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.action" class="ops-empty-action"><slot name="action" /></div>
  </section>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  title: string
  description?: string
}>()
</script>

<style lang="scss" scoped>
.ops-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 180px;
  padding: 28px;
  text-align: center;
  color: $color-text-secondary;
}
.ops-empty-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid $color-border;
  border-radius: 14px;
  color: $color-primary;
  background: $color-bg-active;
}
.ops-empty-copy { display: flex; flex-direction: column; gap: 4px; }
.ops-empty-copy strong { color: $color-text-primary; font-size: $font-size-sm; font-weight: 650; }
.ops-empty-copy p { max-width: 320px; margin: 0; color: $color-text-placeholder; font-size: $font-size-xs; line-height: 1.55; }
.ops-empty-action { margin-top: 4px; }
</style>
