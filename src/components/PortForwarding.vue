<!--
  PortForwarding — Port Forwarding Manager (Termius style)
  Supports: Local, Remote, Dynamic forwarding
  Right-click host → Port Forwarding
-->
<template>
  <el-dialog @contextmenu.prevent
    v-model="visible"
    title="Port Forwarding"
    width="560px"
    :close-on-click-modal="false"
  >
    <!-- Forwarding rules list -->
    <div class="pf-rules" v-if="rules.length > 0">
      <div v-for="rule in rules" :key="rule.id" class="pf-rule">
        <span class="pf-type" :class="rule.type">{{ rule.type.toUpperCase() }}</span>
        <div class="pf-detail">
          <span class="pf-bind">{{ rule.type === 'remote' ? rule.remoteHost + ':' + rule.remotePort : 'localhost:' + rule.localPort }}</span>
          <el-icon :size="12"><ArrowRight /></el-icon>
          <span class="pf-target">{{ rule.type === 'remote' ? 'localhost:' + rule.localPort : rule.remoteHost + ':' + rule.remotePort }}</span>
        </div>
        <span class="pf-status" :class="{ active: rule.active }">{{ rule.active ? 'Active' : 'Inactive' }}</span>
        <el-button size="small" text type="danger" @click="removeRule(rule.id)">
          <el-icon :size="13"><Delete /></el-icon>
        </el-button>
      </div>
    </div>
    <div v-else class="pf-empty">
      <p>No port forwarding rules</p>
      <p class="sub">Add a rule to forward ports through this host</p>
    </div>

    <!-- Add new rule -->
    <div class="pf-add">
      <div class="pf-add-header">
        <span class="pf-add-title">New Rule</span>
      </div>
      <div class="pf-add-form">
        <el-select v-model="newRule.type" size="small" style="width: 110px">
          <el-option label="Local" value="local" />
          <el-option label="Remote" value="remote" />
          <el-option label="Dynamic" value="dynamic" />
        </el-select>

        <template v-if="newRule.type === 'local'">
          <span class="pf-label">Local Port</span>
          <el-input-number v-model="newRule.localPort" :min="1" :max="65535" size="small" style="width: 100px" />
          <span class="pf-label">Remote Host</span>
          <el-input v-model="newRule.remoteHost" size="small" placeholder="localhost" style="width: 120px" />
          <span class="pf-label">Remote Port</span>
          <el-input-number v-model="newRule.remotePort" :min="1" :max="65535" size="small" style="width: 100px" />
        </template>

        <template v-else-if="newRule.type === 'remote'">
          <span class="pf-label">Remote Port</span>
          <el-input-number v-model="newRule.remotePort" :min="1" :max="65535" size="small" style="width: 100px" />
          <span class="pf-label">Local Port</span>
          <el-input-number v-model="newRule.localPort" :min="1" :max="65535" size="small" style="width: 100px" />
        </template>

        <template v-else>
          <span class="pf-label">Local Port</span>
          <el-input-number v-model="newRule.localPort" :min="1" :max="65535" size="small" style="width: 100px" />
          <span class="pf-desc">SOCKS5 proxy on localhost:{{ newRule.localPort }}</span>
        </template>

        <el-button size="small" type="primary" @click="addRule" :disabled="!canAdd">
          <el-icon :size="13"><Plus /></el-icon>Add
        </el-button>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="visible = false">Close</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, Delete, Plus } from '@element-plus/icons-vue'

interface ForwardRule {
  id: string
  type: 'local' | 'remote' | 'dynamic'
  localPort: number
  remoteHost: string
  remotePort: number
  active: boolean
}

const visible = ref(false)
const rules = ref<ForwardRule[]>([])

const newRule = reactive({
  type: 'local' as 'local' | 'remote' | 'dynamic',
  localPort: 8080,
  remoteHost: 'localhost',
  remotePort: 80,
})

const canAdd = computed(() => {
  if (newRule.type === 'dynamic') return newRule.localPort > 0
  return newRule.localPort > 0 && newRule.remotePort > 0
})

function genId(): string {
  return `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function addRule() {
  if (!canAdd.value) return

  rules.value.push({
    id: genId(),
    type: newRule.type,
    localPort: newRule.localPort,
    remoteHost: newRule.type === 'local' ? (newRule.remoteHost || 'localhost') : 'localhost',
    remotePort: newRule.remotePort,
    active: true,
  })

  // Reset for next
  newRule.localPort = newRule.localPort + 1
  ElMessage.success('Port forwarding rule added')
}

function removeRule(id: string) {
  rules.value = rules.value.filter(r => r.id !== id)
  ElMessage.success('Rule removed')
}

function open() {
  visible.value = true
}

defineExpose({ open })
</script>

<style lang="scss" scoped>
.pf-rules {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: $spacing-md;
  max-height: 200px;
  overflow-y: auto;
}

.pf-rule {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  background-color: $color-bg-input;
  border: 1px solid $color-border-light;
  border-radius: $border-radius-sm;
  font-size: $font-size-sm;
}

.pf-type {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 2px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  flex-shrink: 0;

  &.local { background-color: rgba(91, 141, 239, 0.15); color: $color-primary; }
  &.remote { background-color: rgba(76, 175, 125, 0.15); color: $color-success; }
  &.dynamic { background-color: rgba(212, 162, 78, 0.15); color: $color-warning; }
}

.pf-detail {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  color: $color-text-regular;
  overflow: hidden;
}

.pf-bind, .pf-target {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pf-status {
  font-size: 10px;
  color: $color-text-muted;
  flex-shrink: 0;

  &.active {
    color: $color-success;
  }
}

.pf-empty {
  text-align: center;
  padding: $spacing-xl;
  color: $color-text-secondary;
  p { font-size: $font-size-sm; }
  .sub { font-size: $font-size-xs; color: $color-text-placeholder; margin-top: $spacing-xs; }
}

.pf-add {
  border-top: 1px solid $color-border-light;
  padding-top: $spacing-md;
}

.pf-add-header {
  margin-bottom: $spacing-sm;
}

.pf-add-title {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-primary;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pf-add-form {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex-wrap: wrap;
}

.pf-label {
  font-size: $font-size-xs;
  color: $color-text-placeholder;
  white-space: nowrap;
}

.pf-desc {
  font-size: $font-size-xs;
  color: $color-text-muted;
  font-family: $font-family-mono;
}
</style>
