/**
 * SSH连接弹窗 — 新建/编辑服务器
 * Termius极简风格，无emoji
 * 新增：测试连接按钮，一键预检连通性
 */
<template>
  <el-dialog
    v-model="sshStore.showConnectDialog"
    :title="sshStore.editingServer ? t('ssh.dialogTitleEdit') : t('ssh.dialogTitleNew')"
    width="560px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <el-form :model="formData" label-width="80px" label-position="left" size="small" @contextmenu.prevent="onInputCtx">
      <el-form-item :label="t('ssh.group')">
        <el-autocomplete
          v-model="formData.group"
          :fetch-suggestions="queryGroupSuggestions"
          :placeholder="t('ssh.group')"
          clearable
          style="width:100%"
        />
      </el-form-item>
      <el-form-item :label="t('ssh.name')">
        <el-input v-model="formData.name" :placeholder="t('ssh.name')" />
      </el-form-item>
      <el-form-item :label="t('ssh.host')">
        <el-input v-model="formData.host" placeholder="192.168.1.1" />
      </el-form-item>
      <el-form-item :label="t('ssh.port')">
        <el-input-number v-model="formData.port" :min="1" :max="65535" />
      </el-form-item>
      <el-form-item :label="t('ssh.username')">
        <el-input v-model="formData.username" placeholder="root" />
      </el-form-item>
      <el-form-item :label="t('ssh.auth')">
        <el-radio-group v-model="formData.authType">
          <el-radio value="password">{{ t('ssh.password') }}</el-radio>
          <el-radio value="key">{{ t('ssh.privateKey') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="formData.authType === 'password'" :label="t('ssh.password')">
        <el-input v-model="formData.password" type="password" show-password :placeholder="t('ssh.password')" />
      </el-form-item>
      <el-form-item v-if="formData.authType === 'key'" :label="t('ssh.keyContent')">
        <div class="key-material-control" @dragover.prevent @drop.prevent="onKeyDrop">
          <el-input
            v-model="formData.keyContent"
            type="textarea"
            :rows="5"
            :placeholder="t('ssh.pasteKeyPlaceholder')"
          />
          <div class="key-material-actions">
            <el-button size="small" @click="triggerKeyFilePicker">{{ t('ssh.loadLocalKey') }}</el-button>
            <span>{{ t('ssh.dragKeyHere') }}</span>
            <span v-if="formData.keyRef && !formData.keyContent" class="key-vault-hint">{{ t('ssh.savedKeyAvailable') }}</span>
          </div>
          <input ref="keyFileInput" class="key-file-input" type="file" accept=".pem,.key,.ppk,.rsa,.ed25519,*/*" @change="onKeyFileSelected" />
        </div>
      </el-form-item>
      <el-form-item v-if="formData.authType === 'key'" :label="t('ssh.keyPath')">
        <el-input v-model="formData.keyPath" :placeholder="t('ssh.optionalKeyPath')" />
      </el-form-item>
      <el-form-item v-if="formData.authType === 'key'" :label="t('ssh.keyPassphrase')">
        <el-input v-model="formData.keyPassphrase" type="password" show-password :placeholder="t('ssh.keyPassphrasePlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('ssh.remark')">
        <el-input v-model="formData.remark" type="textarea" :rows="2" :placeholder="t('ssh.remarkPlaceholder')" />
      </el-form-item>
    </el-form>

    <div v-if="ictx.visible" class="ctx-menu" :style="{ left: ictx.x + 'px', top: ictx.y + 'px' }">
      <div class="ctx-item" @click="ictxAct('undo')"><el-icon :size="13"><RefreshLeft /></el-icon><span>{{ t('ssh.undo') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ictxAct('cut')"><el-icon :size="13"><Scissor /></el-icon><span>{{ t('ssh.cut') }}</span></div>
      <div class="ctx-item" @click="ictxAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('ssh.copy') }}</span></div>
      <div class="ctx-item" @click="ictxAct('paste')"><el-icon :size="13"><DocumentCopy /></el-icon><span>{{ t('ssh.paste') }}</span></div>
      <div class="ctx-item" @click="ictxAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('ssh.delete') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ictxAct('selectAll')"><el-icon :size="13"><Select /></el-icon><span>{{ t('ssh.selectAll') }}</span></div>
    </div>

    <!-- 测试连接结果提示 -->
    <el-alert
      v-if="testResult"
      :title="testResult.success ? t('ssh.testSuccess') : t('ssh.testFail')"
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
          {{ t('ssh.testConnection') }}
        </el-button>
        <span class="host-dialog-footer-spacer" />
        <el-button size="small" @click="sshStore.showConnectDialog = false">{{ t('ssh.cancel') }}</el-button>
        <el-button size="small" type="primary" @click="handleSave">{{ t('ssh.save') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch, ref, onMounted, onUnmounted } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage } from 'element-plus'
import { saveSshPrivateKey, sshTestConnect } from '@/api/tauri'
import { useLocale } from '@/composables/useLocale'
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
const { t } = useLocale()

// Group autocomplete suggestions
function queryGroupSuggestions(queryString: string, cb: (results: { value: string }[]) => void) {
  const names = sshStore.allGroupNames.filter(n => n.toLowerCase().includes(queryString.toLowerCase()))
  cb(names.map(n => ({ value: n })))
}

/** 测试连接状态 */
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const keyFileInput = ref<HTMLInputElement | null>(null)

const formData = reactive({
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authType: 'password' as 'password' | 'key',
  password: '',
  keyPath: '',
  keyContent: '',
  keyRef: '',
  keyPassphrase: '',
  group: '',
  remark: '',
})

function triggerKeyFilePicker() {
  keyFileInput.value?.click()
}

function loadKeyFile(file?: File) {
  if (!file) return
  if (file.size > 1024 * 1024) {
    ElMessage.warning(t('ssh.keyTooLarge'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    formData.keyContent = String(reader.result || '').replace(/\r\n/g, '\n')
    formData.keyPath = ''
    ElMessage.success(t('ssh.keyLoaded'))
  }
  reader.onerror = () => ElMessage.error(t('ssh.keyReadFailed'))
  reader.readAsText(file)
}

function onKeyFileSelected(event: Event) {
  loadKeyFile((event.target as HTMLInputElement).files?.[0])
  ;(event.target as HTMLInputElement).value = ''
}

function onKeyDrop(event: DragEvent) {
  loadKeyFile(event.dataTransfer?.files?.[0])
}

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
      keyContent: '',
      keyRef: s.keyRef || '',
      keyPassphrase: s.keyPassphrase || '',
      group: s.group || '',
      remark: s.remark || '',
    })
  }
})

function makeKeyRef() {
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function handleSave() {
  if (!formData.name || !formData.host || !formData.username) {
    ElMessage.warning(t('ssh.fillRequired'))
    return
  }
  if (formData.authType === 'key' && !formData.keyContent.trim() && !formData.keyPath.trim() && !formData.keyRef) {
    ElMessage.warning(t('ssh.keyRequiredSave'))
    return
  }

  try {
    let keyRef = formData.keyRef
    if (formData.authType === 'key' && formData.keyContent.trim()) {
      keyRef ||= makeKeyRef()
      await saveSshPrivateKey(keyRef, formData.keyContent.trim())
    }
    const { keyContent: _keyContent, ...serverData } = formData
    const safeData = { ...serverData, keyRef }
    if (sshStore.editingServer) {
      sshStore.updateServer(sshStore.editingServer.id, safeData)
      ElMessage.success(t('ssh.hostUpdated'))
    } else {
      sshStore.addServer(safeData)
      ElMessage.success(t('ssh.hostAdded'))
    }
  } catch (error) {
    ElMessage.error(t('ssh.keySaveFailed', { message: error instanceof Error ? error.message : String(error) }))
    return
  }
  sshStore.showConnectDialog = false
}

function handleClosed() {
  sshStore.editingServer = null
  testResult.value = null
  Object.assign(formData, {
    name: '', host: '', port: 22, username: 'root',
    authType: 'password', password: '', keyPath: '', keyContent: '', keyRef: '', keyPassphrase: '', group: '', remark: '',
  })
}

/**
 * 测试连接 — 一键预检连通性
 * 精准区分：端口不通 / 账号密码错误 / 密钥无效 / 防火墙拦截
 * 直接调用 Rust 后端；失败必须显示真实错误，不能伪造连接成功。
 */
async function handleTestConnection() {
  if (!formData.host || !formData.username) {
    ElMessage.warning(t('ssh.fillHostUser'))
    return
  }
  if (formData.authType === 'key' && !formData.keyContent.trim() && !formData.keyPath.trim() && !formData.keyRef) {
    ElMessage.warning(t('ssh.keyRequiredTest'))
    return
  }

  testing.value = true
  testResult.value = null

  try {
    const result = await sshTestConnect({
      host: formData.host,
      port: formData.port,
      username: formData.username,
      auth: formData.authType === 'password'
        ? { type: 'password', password: formData.password }
        : {
            type: 'private_key',
            key_path: formData.keyPath.trim() || undefined,
            key_content: formData.keyContent.trim() || undefined,
            key_ref: formData.keyRef || undefined,
            passphrase: formData.keyPassphrase || undefined,
          },
      timeout_ms: 10000,
      remark: formData.remark,
      pinned: false,
    })
    if (result.reachable) {
      testResult.value = { success: true, message: t('ssh.connectedAs', { host: formData.host, port: formData.port, user: formData.username, latency: result.latency_ms ?? 0 }) }
    } else {
      testResult.value = { success: false, message: result.error_message || t('ssh.testFail') }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    testResult.value = { success: false, message: t('ssh.testCouldNotRun', { message }) }
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

.key-material-control { width: 100%; }
.key-material-actions { display: flex; align-items: center; gap: 8px; margin-top: 7px; color: var(--el-text-color-secondary); font-size: 12px; flex-wrap: wrap; }
.key-vault-hint { color: var(--el-color-success); }
.key-file-input { display: none; }

@media (max-width: 460px) {
  .host-dialog-footer { flex-wrap: wrap; }
  .host-dialog-footer-spacer { display: none; }
  .host-dialog-footer > :first-child { margin-right: auto; }
}
</style>
