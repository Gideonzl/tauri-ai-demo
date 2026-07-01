<!-- App root — splash screen → main layout -->
<template>
  <SplashScreen v-if="showSplash && !splashDone" @done="splashDone = true" />
  <router-view v-if="splashDone || !showSplash" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SplashScreen from '@/components/SplashScreen.vue'

// Read splash preference directly from localStorage (before stores init, avoids flash)
let showSplash = true
try {
  const s = localStorage.getItem('terminal-settings')
  if (s) { const p = JSON.parse(s); if (p && p.showSplash === false) showSplash = false }
} catch {}

const splashDone = ref(false)
</script>

<style lang="scss">
// 全局样式已在 main.ts 中引入
</style>
