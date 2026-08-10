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
    <el-form :model="formData" label-width="80px" label-position="left" size="small" @contextmenu.prevent="onInputCtx">
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
      <el-form-item v-if="formData.authType === 'key'" label="Passphrase">
        <el-input v-model="formData.keyPassphrase" type="password" show-password placeholder="Leave blank for an unencrypted key" />
      </el-form-item>
      <el-form-item label="Group">
        <el-autocomplete
          v-model="formData.group"
          :fetch-suggestions="queryGroupSuggestions"
          placeholder="Select or type group name"
          clearable
          style="width:100%"
        />
      </el-form-item>
    </el-form>

    <div v-if="ictx.visible" class="ctx-menu" :style="{ left: ictx.x + 'px', top: ictx.y + 'px' }">
      <div class="ctx-item" @click="ictxAct('undo')"><el-icon :size="13"><RefreshLeft /></el-icon><span>撤销</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ictxAct('cut')"><el-icon :size="13"><Scissor /></el-icon><span>剪切</span></div>
      <div class="ctx-item" @click="ictxAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>复制</span></div>
      <div class="ctx-item" @click="ictxAct('paste')"><el-icon :size="13"><DocumentCopy /></el-icon><span>粘贴</span></div>
      <div class="ctx-item" @click="ictxAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>删除</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ictxAct('selectAll')"><el-icon :size="13"><Select /></el-icon><span>全选</span></div>
    </div>

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
      <div class="host-dialog-footer">
        <el-button size="small" @click="handleTestConnection" :loading="testing" type="success">
          Test Connection
        </el-button>
        <span class="host-dialog-footer-spacer" />
        <el-button size="small" @click="sshStore.showConnectDialog = false">Cancel</el-button>
        <el-button size="small" type="primary" @click="handleSave">Save</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch, ref, onMounted, onUnmounted } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage } from 'element-plus'
import { RefreshLeft, Scissor, CopyDocument, DocumentCopy, Delete, Select } from '@element-plus/icons-vue'

const ictx = reactive({ visible: false, x: 0, y: 0, target: null as HTMLInputElement | HTMLTextAreaElement | null })
function onInputCtx(e: MouseEvent) {
  let el = e.target as HTMLElement
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') el = (el.closest('input, textarea') || el) as HTMLElement
  if (!el) return
  ictx.target = el as HTMLInputElement | HTMLTextAreaElement
  ictx.x = e.clientX; ictx.y = e.clientY; ictx.visible = true
}
function hideIctx() { ictx.visible = false }
function ictxAct(action: string) {
  const el = ictx.target; hideIctx()
  if (!el) return
  el.focus()
  switch (action) {
    case 'undo': document.execCommand('undo'); break
    case 'cut': document.execCommand('cut'); break
    case 'copy': document.execCommand('copy'); break
    case 'paste': document.execCommand('paste'); break
    case 'delete': { const s=el.selectionStart||0,e=el.selectionEnd||0; if(s!==e){el.value=el.value.slice(0,s)+el.value.slice(e);el.selectionStart=el.selectionEnd=s;el.dispatchEvent(new Event('input',{bubbles:true}))} break }
    case 'selectAll': el.select(); break
  }
}
onMounted(() => document.addEventListener('click', hideIctx))
onUnmounted(() => document.removeEventListener('click', hideIctx))

const sshStore = useSshStore()

// Group autocomplete suggestions
function queryGroupSuggestions(queryString: string, cb: (results: { value: string }[]) => void) {
  const names = sshStore.allGroupNames.filter(n => n.toLowerCase().includes(queryString.toLowerCase()))
  cb(names.map(n => ({ value: n })))
}

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
  keyPassphrase: '',
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
      keyPassphrase: s.keyPassphrase || '',
      group: s.group || '',
    })
  }
})

function handleSave() {
  if (!formData.name || !formData.host || !formData.username) {
    ElMessage.warning('Please fill in required fields')
    return
  }
  if (formData.authType === 'key' && !formData.keyPath.trim()) {
    ElMessage.warning('Please provide a private key path')
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
    authType: 'password', password: '', keyPath: '', keyPassphrase: '', group: '',
  })
}

/**
 * 测试连接 — 一键预检连通性
 * 精准区分：端口不通 / 账号密码错误 / 密钥无效 / 防火墙拦截
 * 直接调用 Rust 后端；失败必须显示真实错误，不能伪造连接成功。
 */
async function handleTestConnection() {
  if (!formData.host || !formData.username) {
    ElMessage.warning('Please fill in Host and Username first')
    return
  }
  if (formData.authType === 'key' && !formData.keyPath.trim()) {
    ElMessage.warning('Please provide a private key path first')
    return
  }

  testing.value = true
  testResult.value = null

  try {
    const { sshTestConnect } = await import('@/api/tauri')
    const result = await sshTestConnect({
      host: formData.host,
      port: formData.port,
      username: formData.username,
      auth: formData.authType === 'password'
        ? { type: 'password', password: formData.password }
        : { type: 'private_key', key_path: formData.keyPath.trim(), passphrase: formData.keyPassphrase || undefined },
      timeout_ms: 10000,
      remark: '',
      pinned: false,
    })
    if (result.reachable) {
      testResult.value = { success: true, message: `Connected to ${formData.host}:${formData.port} as ${formData.username} (${result.latency_ms}ms)` }
    } else {
      testResult.value = { success: false, message: result.error_message || 'Connection failed' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    testResult.value = { success: false, message: `Test could not run: ${message}` }
  } finally {
    testing.value = false
  }
}
</script>

<style scoped lang="scss">
.host-dialog-footer {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: 100%;
}

.host-dialog-footer-spacer { flex: 1 1 auto; }

@media (max-width: 460px) {
  .host-dialog-footer { flex-wrap: wrap; }
  .host-dialog-footer-spacer { display: none; }
  .host-dialog-footer > :first-child { margin-right: auto; }
}
</style>
