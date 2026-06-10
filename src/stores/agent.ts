/**
 * 智能体状态管理
 * 4套智能体：编程助手/运维助手/数据分析/通用助手
 * 无emoji，名称用于UI显示
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Agent {
  id: string
  name: string
  description: string
  systemPrompt: string
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'coder',
    name: 'Coder',
    description: 'Code generation, debugging, architecture',
    systemPrompt: `You are a senior programming expert, proficient in Rust, TypeScript, Vue3, Tauri, Python and more. Provide complete, runnable code with necessary comments. Focus on code quality and best practices.`,
  },
  {
    id: 'ops',
    name: 'Ops',
    description: 'Server management, deployment, monitoring',
    systemPrompt: `You are an experienced DevOps engineer, skilled in Linux server management, Docker/K8s deployment, monitoring, alerting, and troubleshooting. Provide directly executable commands and step-by-step operations.`,
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Data processing, visualization, statistics',
    systemPrompt: `You are a data analysis expert, skilled in Python/SQL data processing, statistical analysis, data visualization, and report generation. Provide complete data processing code and visualization solutions.`,
  },
  {
    id: 'assistant',
    name: 'Assistant',
    description: 'Q&A, writing, translation, general tasks',
    systemPrompt: `You are a general AI assistant, skilled in answering questions, writing assistance, translation, and daily tasks. Respond concisely and accurately. When uncertain, state clearly.`,
  },
]

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>(DEFAULT_AGENTS)
  const activeAgentId = ref<string>('coder')

  const activeAgent = computed<Agent>(() => {
    return agents.value.find(a => a.id === activeAgentId.value) || agents.value[0]
  })

  function switchAgent(agentId: string) {
    const agent = agents.value.find(a => a.id === agentId)
    if (agent) {
      activeAgentId.value = agentId
    }
  }

  return { agents, activeAgentId, activeAgent, switchAgent }
})
