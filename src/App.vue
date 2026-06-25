<!-- App root — splash screen → main layout -->
<template>
  <SplashScreen v-if="!splashDone" @done="splashDone = true" />
  <router-view v-if="splashDone" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SplashScreen from '@/components/SplashScreen.vue'

const splashDone = ref(false)
</script>

<style lang="scss">
// 全局样式已在 main.ts 中引入
</style>
