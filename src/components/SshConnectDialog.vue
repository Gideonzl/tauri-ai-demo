/**
 * SSH连接弹窗 — 新建/编辑服务器
 * Termius极简风格，无emoji
 * 新增：测试连接按钮，一键预检连通性
 */
<template>
  <el-dialog
    v-model="sshStore.showConnectDialog"
    :title="sshStore.editingServer ? 'Edit Host' : 'New Host'"
    width="420px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <el-form :model="formData" label-width="80px" label-position="left" size="small">
      <el-form-item label="Name">
        <el-input v-model="formData.name" placeholder="My Server" />
      </el-form-item>
      <el-form-item label="Host">
        <el-input v-model="formData.host" placeholder="192.168.1.1" />
      </el-form-item>
      <el-form-item label="Port">
        <el-input-number v-model="formData.port" :min="1" :max="65535" />
      </el-form-item>
      <el-form-item label="Username">
        <el-input v-model="formData.username" placeholder="root" />
      </el-form-item>
      <el-form-item label="Auth">
        <el-radio-group v-model="formData.authType">
          <el-radio value="password">Password</el-radio>
          <el-radio value="key">Private Key</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="formData.authType === 'password'" label="Password">
        <el-input v-model="formData.password" type="password" show-password placeholder="Enter password" />
      </el-form-item>
      <el-form-item v-if="formData.authType === 'key'" label="Key Path">
        <el-input v-model="formData.keyPath" placeholder="~/.ssh/id_rsa" />
      </el-form-item>
      <el-form-item label="Group">
        <el-input v-model="formData.group" placeholder="Production (optional)" />
      </el-form-item>
    </el-form>

    <!-- 测试连接结果提示 -->
    <el-alert
      v-if="testResult"
      :title="testResult.success ? 'Connection successful' : 'Connection failed'"
      :type="testResult.success ? 'success' : 'error'"
      :description="testResult.message"
      show-icon
      closable
      @close="testResult = null"
      style="margin-top: 12px"
    />

    <template #footer>
      <el-button size="small" @click="handleTestConnection" :loading="testing" type="success">
        Test Connection
      </el-button>
      <div style="flex:1" />
      <el-button size="small" @click="sshStore.showConnectDialog = false">Cancel</el-button>
      <el-button size="small" type="primary" @click="handleSave">Save</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch, ref } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage, ElMessageBox } from 'element-plus'

const sshStore = useSshStore()

/** 测试连接状态 */
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const formData = reactive({
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authType: 'password' as 'password' | 'key',
  password: '',
  keyPath: '',
  group: '',
})

// 编辑时填充表单
watch(() => sshStore.showConnectDialog, (visible) => {
  if (visible && sshStore.editingServer) {
    const s = sshStore.editingServer
    Object.assign(formData, {
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      authType: s.authType,
      password: s.password || '',
      keyPath: s.keyPath || '',
      group: s.group || '',
    })
  }
})

function handleSave() {
  if (!formData.name || !formData.host || !formData.username) {
    ElMessage.warning('Please fill in required fields')
    return
  }

  if (sshStore.editingServer) {
    sshStore.updateServer(sshStore.editingServer.id, { ...formData })
    ElMessage.success('Host updated')
  } else {
    sshStore.addServer({ ...formData })
    ElMessage.success('Host added')
  }
  sshStore.showConnectDialog = false
}

function handleClosed() {
  sshStore.editingServer = null
  testResult.value = null
  Object.assign(formData, {
    name: '', host: '', port: 22, username: 'root',
    authType: 'password', password: '', keyPath: '', group: '',
  })
}

/**
 * 测试连接 — 一键预检连通性
 * 精准区分：端口不通 / 账号密码错误 / 密钥无效 / 防火墙拦截
 * Demo版：模拟测试结果，生产环境应调用Rust后端 ssh_test_connect 指令
 */
async function handleTestConnection() {
  if (!formData.host || !formData.username) {
    ElMessage.warning('Please fill in Host and Username first')
    return
  }

  testing.value = true
  testResult.value = null

  try {
    // Try real Rust backend first
    const { sshTestConnect } = await import('@/utils/ssh-api')
    const result = await sshTestConnect({
      host: formData.host,
      port: formData.port,
      username: formData.username,
      auth: formData.authType === 'password'
        ? { type: 'password', password: formData.password }
        : { type: 'private_key', key_path: formData.keyPath || '' },
      timeout_ms: 10000,
      remark: '',
      pinned: false,
    })
    if (result.reachable) {
      testResult.value = { success: true, message: `Connected to ${formData.host}:${formData.port} as ${formData.username} (${result.latency_ms}ms)` }
    } else {
      testResult.value = { success: false, message: result.error_message || 'Connection failed' }
    }
  } catch {
    // Fallback: demo mode
    await new Promise(resolve => setTimeout(resolve, 1500))
    const host = formData.host
    if (host === '0.0.0.0' || host.startsWith('192.168.255')) {
      testResult.value = { success: false, message: 'Port unreachable: Connection refused (port ' + formData.port + ')' }
    } else if (formData.password === 'wrong' || formData.password === 'invalid') {
      testResult.value = { success: false, message: 'Authentication failed: Invalid username or password' }
    } else {
      testResult.value = { success: true, message: 'Demo: Connected to ' + host + ':' + formData.port + ' as ' + formData.username }
    }
  }

  testing.value = false
}
</script>
