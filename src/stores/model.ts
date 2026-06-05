/**
 * AI模型配置状态管理
 * 支持多组不同厂商AI配置、默认切换、持久化、连通性测试
 * AI配置完全收口，其他页面不持有任何Token/接口配置
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 单组AI模型配置 */
export interface ModelConfig {
  id: string
  name: string
  provider: string    // openai / deepseek / qwen / glm / wenxin / custom
  apiBase: string
  model: string
  token: string
  timeout: number
  testResult?: { success: boolean; message: string } | null
}

/** 连通性测试结果 */
export interface TestResult {
  success: boolean
  message: string
}

export const useModelStore = defineStore('model', () => {
  // 所有AI配置
  const configs = ref<ModelConfig[]>([])
  // 默认配置ID
  const defaultConfigId = ref<string>('')

  // 当前默认配置
  const defaultConfig = computed<ModelConfig | null>(() => {
    return configs.value.find(c => c.id === defaultConfigId.value) || configs.value[0] || null
  })

  // 生成唯一ID
  function genId(): string {
    return `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  // 新增配置
  function addConfig(data: Omit<ModelConfig, 'id' | 'testResult'>) {
    const config: ModelConfig = {
      id: genId(),
      ...data,
      testResult: null,
    }
    configs.value.push(config)
    // 如果是第一个配置，自动设为默认
    if (configs.value.length === 1) {
      defaultConfigId.value = config.id
    }
    saveToStorage()
  }

  // 更新配置
  function updateConfig(id: string, data: Partial<ModelConfig>) {
    const idx = configs.value.findIndex(c => c.id === id)
    if (idx !== -1) {
      configs.value[idx] = { ...configs.value[idx], ...data, id }
      saveToStorage()
    }
  }

  // 删除配置
  function deleteConfig(id: string) {
    configs.value = configs.value.filter(c => c.id !== id)
    if (defaultConfigId.value === id) {
      defaultConfigId.value = configs.value[0]?.id || ''
    }
    saveToStorage()
  }

  // 设为默认
  function setDefault(id: string) {
    defaultConfigId.value = id
    saveToStorage()
  }

  // 设置测试结果
  function setTestResult(id: string, result: TestResult | null) {
    const config = configs.value.find(c => c.id === id)
    if (config) {
      config.testResult = result
    }
  }

  // 连通性测试（前端fetch方式）
  async function testConnection(id: string): Promise<boolean> {
    const config = configs.value.find(c => c.id === id)
    if (!config) return false

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 10000)

      const response = await fetch(`${config.apiBase}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch {
      return false
    }
  }

  // 持久化到localStorage（Demo版，生产环境应走Rust加密存储）
  function saveToStorage() {
    try {
      const data = {
        configs: configs.value.map(c => ({ ...c, testResult: null })), // 不存测试结果
        defaultConfigId: defaultConfigId.value,
      }
      localStorage.setItem('ai-model-configs', JSON.stringify(data))
    } catch (e) {
      console.error('保存AI配置失败:', e)
    }
  }

  // 从localStorage加载
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('ai-model-configs')
      if (raw) {
        const data = JSON.parse(raw)
        configs.value = data.configs || []
        defaultConfigId.value = data.defaultConfigId || ''
      }
    } catch (e) {
      console.error('加载AI配置失败:', e)
    }
  }

  // 初始化
  function init() {
    loadFromStorage()
    // 如果没有配置，添加默认示例
    if (configs.value.length === 0) {
      addConfig({
        name: 'DeepSeek Demo',
        provider: 'deepseek',
        apiBase: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        token: '',
        timeout: 30000,
      })
    }
  }

  return {
    configs,
    defaultConfigId,
    defaultConfig,
    addConfig,
    updateConfig,
    deleteConfig,
    setDefault,
    setTestResult,
    testConnection,
    init,
  }
})
