/**
 * AI模型管理页面 — 独立专属页面
 * 所有Token、接口、模型配置仅在此操作
 * 支持多组配置CRUD + 连通性测试 + 设为默认
 * Termius极简风格，无emoji
 */
<template>
  <div class="ai-config-view">
    <div class="config-header">
      <span class="title">AI Model Config</span>
      <el-button size="small" type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        Add Config
      </el-button>
    </div>

    <!-- 配置列表 -->
    <div class="config-list">
      <div
        v-for="config in modelStore.configs"
        :key="config.id"
        class="config-card"
        :class="{ active: config.id === modelStore.defaultConfigId }"
      >
        <div class="card-header">
          <div class="card-info">
            <span class="card-name">{{ config.name }}</span>
            <span v-if="config.id === modelStore.defaultConfigId" class="default-badge">DEFAULT</span>
          </div>
          <div class="card-actions">
            <el-button size="small" text @click="handleTest(config)">
              <el-icon><Connection /></el-icon>
              Test
            </el-button>
            <el-button
              v-if="config.id !== modelStore.defaultConfigId"
              size="small" text
              @click="handleSetDefault(config.id)"
            >
              Set Default
            </el-button>
            <el-button size="small" text type="danger" @click="handleDelete(config.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
        <div class="card-body">
          <div class="card-field">
            <span class="field-label">Provider</span>
            <span class="field-value">{{ config.provider }}</span>
          </div>
          <div class="card-field">
            <span class="field-label">API Base</span>
            <span class="field-value mono">{{ config.apiBase }}</span>
          </div>
          <div class="card-field">
            <span class="field-label">Model</span>
            <span class="field-value mono">{{ config.model }}</span>
          </div>
          <div class="card-field">
            <span class="field-label">Token</span>
            <span class="field-value mono">{{ maskToken(config.token) }}</span>
          </div>
        </div>
        <!-- 测试结果 -->
        <div v-if="config.testResult" class="card-test-result" :class="config.testResult.success ? 'success' : 'error'">
          {{ config.testResult.message }}
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="modelStore.configs.length === 0" class="empty-state">
        <el-icon :size="36"><Cpu /></el-icon>
        <p>No AI model configurations</p>
        <p class="sub">Add a configuration to start using AI features</p>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="showDialog"
      :title="editingConfig ? 'Edit Config' : 'Add Config'"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form :model="formData" label-width="80px" label-position="left" size="small">
        <el-form-item label="Name">
          <el-input v-model="formData.name" placeholder="e.g. My DeepSeek" />
        </el-form-item>
        <el-form-item label="Provider">
          <el-select v-model="formData.provider" @change="handleProviderChange">
            <el-option label="OpenAI" value="openai" />
            <el-option label="DeepSeek" value="deepseek" />
            <el-option label="Qwen (Tongyi)" value="qwen" />
            <el-option label="GLM (Zhipu)" value="glm" />
            <el-option label="Wenxin (Baidu)" value="wenxin" />
            <el-option label="Custom" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Base">
          <el-input v-model="formData.apiBase" placeholder="https://api.openai.com/v1" />
        </el-form-item>
        <el-form-item label="Model">
          <el-input v-model="formData.model" placeholder="gpt-4o-mini" />
        </el-form-item>
        <el-form-item label="Token">
          <el-input v-model="formData.token" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="Timeout">
          <el-input-number v-model="formData.timeout" :min="5000" :max="120000" :step="5000" />
          <span class="unit-label">ms</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="showDialog = false">Cancel</el-button>
        <el-button size="small" type="primary" @click="handleSave">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useModelStore } from '@/stores/model'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Connection, Delete, Cpu } from '@element-plus/icons-vue'
import type { ModelConfig } from '@/stores/model'

const modelStore = useModelStore()

const showDialog = ref(false)
const editingConfig = ref<ModelConfig | null>(null)

const formData = reactive({
  name: '',
  provider: 'openai',
  apiBase: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  token: '',
  timeout: 30000,
})

// 厂商预设
const providerPresets: Record<string, { apiBase: string; model: string }> = {
  openai: { apiBase: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { apiBase: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  qwen: { apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  glm: { apiBase: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  wenxin: { apiBase: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1', model: 'ernie-4.0-8k' },
  custom: { apiBase: '', model: '' },
}

function handleProviderChange(provider: string) {
  const preset = providerPresets[provider]
  if (preset) {
    formData.apiBase = preset.apiBase
    formData.model = preset.model
  }
}

function maskToken(token: string): string {
  if (!token || token.length < 8) return '****'
  return token.slice(0, 4) + '****' + token.slice(-4)
}

function handleAdd() {
  editingConfig.value = null
  Object.assign(formData, {
    name: '',
    provider: 'openai',
    apiBase: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    token: '',
    timeout: 30000,
  })
  showDialog.value = true
}

function handleSave() {
  if (!formData.name || !formData.apiBase || !formData.token) {
    ElMessage.warning('Please fill in required fields')
    return
  }

  if (editingConfig.value) {
    modelStore.updateConfig(editingConfig.value.id, { ...formData })
    ElMessage.success('Config updated')
  } else {
    modelStore.addConfig({ ...formData })
    ElMessage.success('Config added')
  }
  showDialog.value = false
}

function handleSetDefault(id: string) {
  modelStore.setDefault(id)
  ElMessage.success('Default config set')
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('Delete this configuration?', 'Confirm', { type: 'warning' })
    modelStore.deleteConfig(id)
    ElMessage.success('Config deleted')
  } catch { /* cancelled */ }
}

async function handleTest(config: ModelConfig) {
  modelStore.setTestResult(config.id, null)
  try {
    const ok = await modelStore.testConnection(config.id)
    modelStore.setTestResult(config.id, {
      success: ok,
      message: ok ? 'Connection successful' : 'Connection failed',
    })
    ElMessage(ok ? 'success' : 'error', ok ? 'Connection OK' : 'Connection failed')
  } catch (e) {
    modelStore.setTestResult(config.id, {
      success: false,
      message: `Error: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
</script>

<style lang="scss" scoped>
.ai-config-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.config-header {
  height: $header-height;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-lg;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
  background-color: $color-bg-toolbar;

  .title {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $color-text-regular;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.config-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-md $spacing-lg;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.config-card {
  background-color: $color-bg-toolbar;
  border: 1px solid $color-border-light;
  border-radius: $border-radius-md;
  padding: $spacing-md $spacing-lg;
  transition: border-color $transition-fast;

  &:hover {
    border-color: $color-border;
  }

  &.active {
    border-color: $color-primary;
    border-left: 2px solid $color-primary;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $spacing-sm;
}

.card-info {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.card-name {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $color-text-primary;
}

.default-badge {
  font-size: 9px;
  font-weight: 700;
  color: $color-primary;
  background-color: rgba(91, 155, 213, 0.15);
  padding: 1px 6px;
  border-radius: 2px;
  letter-spacing: 0.5px;
}

.card-actions {
  display: flex;
  gap: 2px;
}

.card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-xs $spacing-lg;
}

.card-field {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.field-label {
  font-size: $font-size-xs;
  color: $color-text-placeholder;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.field-value {
  font-size: $font-size-sm;
  color: $color-text-regular;

  &.mono {
    font-family: $font-family-mono;
    font-size: $font-size-xs;
  }
}

.card-test-result {
  margin-top: $spacing-sm;
  padding: $spacing-xs $spacing-sm;
  border-radius: $border-radius-sm;
  font-size: $font-size-xs;
  font-family: $font-family-mono;

  &.success {
    background-color: rgba(107, 199, 107, 0.1);
    color: $color-success;
  }

  &.error {
    background-color: rgba(224, 85, 85, 0.1);
    color: $color-danger;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-sm;
  color: $color-text-secondary;

  p { font-size: $font-size-md; }
  .sub { font-size: $font-size-sm; color: $color-text-placeholder; }
}

.unit-label {
  margin-left: $spacing-xs;
  font-size: $font-size-xs;
  color: $color-text-placeholder;
}
</style>
