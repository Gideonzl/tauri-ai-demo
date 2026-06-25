<!-- SplashScreen — Launch loading page with icon + subtle animation -->
<template>
  <div class="splash" :class="{ 'splash-out': leaving }">
    <div class="splash-content">
      <div class="splash-icon">
        <img src="/app-icon.png?v=2" alt="AITerminal" class="splash-img" />
      </div>
      <h1 class="splash-title">AITerminal</h1>
      <p class="splash-sub">Remote SSH + AI Terminal</p>
      <div class="splash-bar-track">
        <div class="splash-bar-fill"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{ duration?: number }>()
const emit = defineEmits<{ done: [] }>()

const leaving = ref(false)

onMounted(() => {
  const ms = props.duration ?? 1000
  // Start exit animation at ~80% of duration
  setTimeout(() => { leaving.value = true }, ms - 200)
  // Emit done after full duration
  setTimeout(() => { emit('done') }, ms)
})
</script>

<style lang="scss" scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg-app;
  transition: opacity 0.3s ease;
  opacity: 1;
}

.splash-out {
  opacity: 0;
  pointer-events: none;
}

.splash-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.splash-icon {
  width: 80px;
  height: 80px;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  animation: splash-pop 0.5s ease;
}

.splash-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.splash-title {
  font-size: 28px;
  font-weight: 700;
  color: $color-text-primary;
  letter-spacing: -0.5px;
  margin: 0;
  font-family: 'Inter', sans-serif;
}

.splash-sub {
  font-size: 13px;
  color: $color-text-secondary;
  margin: 0;
  font-family: 'Inter', sans-serif;
}

.splash-bar-track {
  width: 160px;
  height: 3px;
  border-radius: 2px;
  background: $color-bg-hover;
  overflow: hidden;
  margin-top: 8px;
}

.splash-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, $color-primary, $color-primary-light);
  animation: splash-load 0.8s ease forwards;
}

@keyframes splash-pop {
  0% { transform: scale(0.7); opacity: 0; }
  60% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes splash-load {
  0% { width: 0%; }
  100% { width: 100%; }
}
</style>
