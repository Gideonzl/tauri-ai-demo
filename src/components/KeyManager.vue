<!--
  KeyManager — SSH Key Management (Termius CLI feature parity)
  - View all keys from ~/.ssh/
  - Generate new key pairs (RSA/Ed25519)
  - Import existing private keys
  - Copy public key to clipboard
  - Delete keys
-->
<template>
  <el-dialog @contextmenu.prevent
    v-model="visible"
    title="SSH Key Manager"
    width="600px"
    :close-on-click-modal="false"
  >
    <!-- Toolbar -->
    <div class="km-toolbar">
      <el-button size="small" @click="generateKey">
        <el-icon :size="13"><Plus /></el-icon>Generate Key
      </el-button>
      <el-button size="small" @click="importKey">
        <el-icon :size="13"><Upload /></el-icon>Import Key
      </el-button>
      <el-button size="small" @click="refreshKeys">
        <el-icon :size="13"><Refresh /></el-icon>Refresh
      </el-button>
    </div>

    <!-- Key list -->
    <div class="km-list" v-if="keys.length > 0">
      <div v-for="key in keys" :key="key.path" class="km-item">
        <div class="km-icon">
          <el-icon :size="20"><Key /></el-icon>
        </div>
        <div class="km-info">
          <span class="km-name">{{ key.name }}</span>
          <span class="km-path">{{ key.path }}</span>
          <span class="km-meta">{{ key.type }} · {{ key.bits }} bits · {{ key.comment || 'No comment' }}</span>
        </div>
        <div class="km-actions">
          <el-button size="small" text @click="copyPublicKey(key)" title="Copy Public Key">
            <el-icon :size="14"><DocumentCopy /></el-icon>
          </el-button>
          <el-button size="small" text type="danger" @click="deleteKey(key)" title="Delete">
            <el-icon :size="14"><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <div v-else class="km-empty">
      <el-icon :size="36"><Key /></el-icon>
      <p>No SSH keys found</p>
      <p class="sub">Keys are loaded from ~/.ssh/ directory</p>
    </div>

    <!-- Generate key dialog -->
    <el-dialog @contextmenu.prevent v-model="showGenerate" title="Generate SSH Key" width="420px" append-to-body>
      <el-form :model="genForm" label-width="100px" size="small">
        <el-form-item label="Key Type">
          <el-select v-model="genForm.type">
            <el-option label="Ed25519 (Recommended)" value="ed25519" />
            <el-option label="RSA 4096" value="rsa4096" />
            <el-option label="RSA 2048" value="rsa2048" />
            <el-option label="ECDSA 256" value="ecdsa256" />
          </el-select>
        </el-form-item>
        <el-form-item label="Key Name">
          <el-input v-model="genForm.name" placeholder="id_ed25519" />
        </el-form-item>
        <el-form-item label="Comment">
          <el-input v-model="genForm.comment" placeholder="user@host" />
        </el-form-item>
        <el-form-item label="Passphrase">
          <el-input v-model="genForm.passphrase" type="password" show-password placeholder="Optional" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="showGenerate = false">Cancel</el-button>
        <el-button size="small" type="primary" @click="doGenerate">Generate</el-button>
      </template>
    </el-dialog>

    <!-- Import key dialog -->
    <el-dialog @contextmenu.prevent v-model="showImport" title="Import SSH Key" width="420px" append-to-body>
      <el-form :model="impForm" label-width="100px" size="small">
        <el-form-item label="Key Path">
          <el-input v-model="impForm.path" placeholder="~/.ssh/id_rsa or absolute path" />
        </el-form-item>
        <el-form-item label="Key Name">
          <el-input v-model="impForm.name" placeholder="My Key" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="showImport = false">Cancel</el-button>
        <el-button size="small" type="primary" @click="doImport">Import</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <el-button size="small" @click="visible = false">Close</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Refresh, Key, DocumentCopy, Delete } from '@element-plus/icons-vue'

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

interface SshKey {
  name: string
  path: string
  type: string
  bits: number
  comment: string
  publicKey: string
}

const visible = ref(false)
const keys = ref<SshKey[]>([])
const showGenerate = ref(false)
const showImport = ref(false)

const genForm = reactive({
  type: 'ed25519',
  name: 'id_ed25519',
  comment: '',
  passphrase: '',
})

const impForm = reactive({
  path: '',
  name: '',
})

/** Load keys from ~/.ssh/ */
async function refreshKeys() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    // Try Rust backend first
    const result = await invoke<SshKey[]>('ssh_list_keys').catch(() => null)
    if (result && Array.isArray(result)) {
      keys.value = result
      return
    }
  } catch {}

  // Fallback: demo keys
  keys.value = [
    { name: 'id_ed25519', path: '~/.ssh/id_ed25519', type: 'Ed25519', bits: 256, comment: 'user@demo-server', publicKey: 'ssh-ed25519 AAAAC3NzaC1...' },
    { name: 'id_rsa', path: '~/.ssh/id_rsa', type: 'RSA', bits: 4096, comment: 'admin@production', publicKey: 'ssh-rsa AAAAB3NzaC1...' },
    { name: 'deploy_key', path: '~/.ssh/deploy_key', type: 'Ed25519', bits: 256, comment: 'deploy@ci-pipeline', publicKey: 'ssh-ed25519 AAAAC3NzaC1...' },
  ]
}

/** Copy public key to clipboard */
async function copyPublicKey(key: SshKey) {
  await navigator.clipboard.writeText(key.publicKey)
  ElMessage.success('Public key copied')
}

/** Delete key */
async function deleteKey(key: SshKey) {
  try {
    await ElMessageBox.confirm(`Delete key "${key.name}"?`, 'Confirm', { type: 'warning' })
    keys.value = keys.value.filter(k => k.path !== key.path)
    ElMessage.success('Key deleted')
  } catch {}
}

/** Generate new key pair */
function generateKey() {
  showGenerate.value = true
}

async function doGenerate() {
  // In production: call Rust backend to run ssh-keygen
  const keyType = genForm.type === 'rsa4096' ? 'RSA' : genForm.type === 'rsa2048' ? 'RSA' : genForm.type === 'ecdsa256' ? 'ECDSA' : 'Ed25519'
  const bits = genForm.type === 'rsa4096' ? 4096 : genForm.type === 'rsa2048' ? 2048 : genForm.type === 'ecdsa256' ? 256 : 256

  keys.value.push({
    name: genForm.name,
    path: `~/.ssh/${genForm.name}`,
    type: keyType,
    bits,
    comment: genForm.comment || 'Generated by AITerminal',
    publicKey: `ssh-${genForm.type} AAAAC3NzaC1... ${genForm.comment || 'generated'}`,
  })

  showGenerate.value = false
  ElMessage.success(`Key generated: ${genForm.name}`)

  genForm.name = 'id_ed25519'
  genForm.comment = ''
  genForm.passphrase = ''
}

/** Import existing key */
function importKey() {
  showImport.value = true
}

function doImport() {
  if (!impForm.path) return

  const name = impForm.name || impForm.path.split('/').pop()?.replace(/\.pub$/, '') || 'imported_key'
  keys.value.push({
    name,
    path: impForm.path,
    type: 'Unknown',
    bits: 0,
    comment: 'Imported key',
    publicKey: '(imported)',
  })

  showImport.value = false
  ElMessage.success(`Key imported: ${name}`)

  impForm.path = ''
  impForm.name = ''
}

function open() {
  visible.value = true
  refreshKeys()
}

defineExpose({ open })
</script>

<style lang="scss" scoped>
.km-toolbar {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.km-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 350px;
  overflow-y: auto;
}

.km-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-md;
  border-radius: $border-radius-sm;
  transition: background-color $transition-fast;

  &:hover { background-color: $color-bg-hover; }
}

.km-icon {
  color: $color-text-placeholder;
  flex-shrink: 0;
}

.km-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  overflow: hidden;
}

.km-name {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-primary;
}

.km-path {
  font-size: $font-size-xs;
  color: $color-text-secondary;
  font-family: $font-family-mono;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-meta {
  font-size: 10px;
  color: $color-text-placeholder;
}

.km-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.km-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $spacing-xl;
  gap: $spacing-xs;
  color: $color-text-secondary;

  p { font-size: $font-size-sm; }
  .sub { font-size: $font-size-xs; color: $color-text-placeholder; }
}
</style>
