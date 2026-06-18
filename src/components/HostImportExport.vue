<!--
  HostImportExport — SSH Config Import + JSON Export/Import
  Termius CLI feature parity: termius host import/export
-->
<template>
  <el-dialog
    v-model="visible"
    title="Import / Export Hosts"
    width="560px"
    :close-on-click-modal="false"
  >
    <el-tabs v-model="activeTab" @contextmenu.prevent="onInputCtx">
      <!-- Tab 1: Import from SSH Config -->
      <el-tab-pane label="Import SSH Config" name="import">
        <div class="ie-section">
          <p class="ie-desc">Paste your ~/.ssh/config content below to import hosts.</p>
          <el-input
            v-model="sshConfigText"
            type="textarea"
            :rows="12"
            placeholder="Host myserver&#10;  HostName 192.168.1.1&#10;  User root&#10;  Port 22&#10;  IdentityFile ~/.ssh/id_rsa&#10;&#10;Host dbserver&#10;  HostName 10.0.0.50&#10;  User admin&#10;  Port 2222"
            class="ie-textarea"
          />
          <div class="ie-actions">
            <el-button size="small" @click="parseAndPreview">Parse & Preview</el-button>
            <el-button size="small" type="primary" @click="importFromConfig" :disabled="parsedHosts.length === 0">
              Import {{ parsedHosts.length }} Hosts
            </el-button>
          </div>
        </div>

        <!-- Preview table -->
        <div v-if="parsedHosts.length > 0" class="ie-preview">
          <div class="ie-preview-title">Preview ({{ parsedHosts.length }} hosts found)</div>
          <div class="ie-table">
            <div class="ie-row ie-header">
              <span>Name</span><span>Host</span><span>Port</span><span>User</span><span>Key</span>
            </div>
            <div v-for="h in parsedHosts" :key="h.name" class="ie-row">
              <span class="ie-name">{{ h.name }}</span>
              <span class="ie-mono">{{ h.host }}</span>
              <span>{{ h.port }}</span>
              <span>{{ h.username }}</span>
              <span class="ie-mono">{{ h.keyPath || '-' }}</span>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 2: Export as JSON -->
      <el-tab-pane label="Export JSON" name="export">
        <div class="ie-section">
          <p class="ie-desc">Export all saved hosts as JSON for backup or transfer.</p>
          <el-input
            v-model="exportJson"
            type="textarea"
            :rows="14"
            readonly
            class="ie-textarea"
          />
          <div class="ie-actions">
            <el-button size="small" @click="copyExport">
              <el-icon :size="13"><DocumentCopy /></el-icon>Copy JSON
            </el-button>
            <el-button size="small" @click="downloadExport">
              <el-icon :size="13"><Download /></el-icon>Download .json
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 3: Import JSON -->
      <el-tab-pane label="Import JSON" name="importJson">
        <div class="ie-section">
          <p class="ie-desc">Paste previously exported JSON to restore hosts.</p>
          <el-input
            v-model="importJson"
            type="textarea"
            :rows="14"
            placeholder='[{"name":"My Server","host":"192.168.1.1","port":22,"username":"root","authType":"password","password":"","group":""}]'
            class="ie-textarea"
          />
          <div class="ie-actions">
            <el-button size="small" type="primary" @click="importFromJson" :disabled="!importJson.trim()">
              <el-icon :size="13"><Upload /></el-icon>Import Hosts
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

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

    <template #footer>
      <el-button size="small" @click="visible = false">Close</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage } from 'element-plus'
import { DocumentCopy, Download, Upload } from '@element-plus/icons-vue'

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
const visible = ref(false)
const activeTab = ref('import')

// Import from SSH config
const sshConfigText = ref('')
const parsedHosts = ref<Array<{
  name: string
  host: string
  port: number
  username: string
  keyPath?: string
  group?: string
}>>([])

// Export JSON
const exportJson = computed(() => {
  return JSON.stringify(sshStore.servers.map(s => ({
    name: s.name,
    host: s.host,
    port: s.port,
    username: s.username,
    authType: s.authType,
    password: s.authType === 'password' ? '' : undefined, // Don't export passwords
    keyPath: s.keyPath,
    group: s.group,
  })), null, 2)
})

// Import JSON
const importJson = ref('')

/** Parse SSH config text */
function parseAndPreview() {
  const text = sshConfigText.value.trim()
  if (!text) {
    ElMessage.warning('Please paste SSH config content')
    return
  }

  const hosts: typeof parsedHosts.value = []
  let currentHost: any = null

  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // New Host block
    const hostMatch = trimmed.match(/^Host\s+(.+)$/i)
    if (hostMatch) {
      if (currentHost?.name) hosts.push(currentHost)
      // Skip wildcard hosts
      const hostName = hostMatch[1].trim()
      if (hostName.includes('*')) {
        currentHost = null
        continue
      }
      currentHost = {
        name: hostName,
        host: hostName,
        port: 22,
        username: 'root',
      }
      continue
    }

    if (!currentHost) continue

    // Parse directives
    const parts = trimmed.split(/\s+/)
    const directive = parts[0].toLowerCase()
    const value = parts.slice(1).join(' ')

    switch (directive) {
      case 'hostname': currentHost.host = value; break
      case 'user': currentHost.username = value; break
      case 'port': currentHost.port = parseInt(value) || 22; break
      case 'identityfile': currentHost.keyPath = value; break
    }
  }

  // Push last host
  if (currentHost?.name) hosts.push(currentHost)

  parsedHosts.value = hosts
  ElMessage.success(`Parsed ${hosts.length} host(s)`)
}

/** Import parsed hosts */
function importFromConfig() {
  if (parsedHosts.value.length === 0) return

  for (const h of parsedHosts.value) {
    // Check duplicate
    const exists = sshStore.servers.find(s => s.host === h.host && s.port === h.port)
    if (exists) continue

    sshStore.addServer({
      name: h.name,
      host: h.host,
      port: h.port,
      username: h.username,
      authType: h.keyPath ? 'key' : 'password',
      password: '',
      keyPath: h.keyPath,
      group: h.group,
    })
  }

  ElMessage.success(`Imported ${parsedHosts.value.length} host(s)`)
  parsedHosts.value = []
  sshConfigText.value = ''
}

/** Import from JSON */
function importFromJson() {
  try {
    const data = JSON.parse(importJson.value)
    if (!Array.isArray(data)) {
      ElMessage.error('JSON must be an array of hosts')
      return
    }

    let count = 0
    for (const item of data) {
      if (!item.host) continue
      const exists = sshStore.servers.find(s => s.host === item.host && s.port === item.port)
      if (exists) continue

      sshStore.addServer({
        name: item.name || item.host,
        host: item.host,
        port: item.port || 22,
        username: item.username || 'root',
        authType: item.authType || 'password',
        password: '',
        keyPath: item.keyPath,
        group: item.group,
      })
      count++
    }

    ElMessage.success(`Imported ${count} host(s)`)
    importJson.value = ''
  } catch {
    ElMessage.error('Invalid JSON format')
  }
}

/** Copy export to clipboard */
async function copyExport() {
  await navigator.clipboard.writeText(exportJson.value)
  ElMessage.success('JSON copied to clipboard')
}

/** Download export as file */
function downloadExport() {
  const blob = new Blob([exportJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tauri-hosts-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('Download started')
}

function open() {
  visible.value = true
}

defineExpose({ open })
</script>

<style lang="scss" scoped>
.ie-section {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.ie-desc {
  font-size: $font-size-xs;
  color: $color-text-secondary;
  margin: 0;
}

.ie-textarea {
  :deep(.el-textarea__inner) {
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    background-color: $color-bg-input !important;
    color: $color-text-primary !important;
  }
}

.ie-actions {
  display: flex;
  gap: $spacing-sm;
}

.ie-preview {
  margin-top: $spacing-md;
}

.ie-preview-title {
  font-size: $font-size-xs;
  font-weight: 600;
  color: $color-text-primary;
  text-transform: uppercase;
  margin-bottom: $spacing-xs;
}

.ie-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 200px;
  overflow-y: auto;
}

.ie-row {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 0.5fr 0.8fr 1fr;
  gap: $spacing-xs;
  padding: 4px $spacing-sm;
  font-size: $font-size-xs;
  color: $color-text-regular;
  border-radius: $border-radius-sm;

  &.ie-header {
    color: $color-text-secondary;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 10px;
    background-color: $color-bg-surface;
  }

  &:not(.ie-header):hover {
    background-color: $color-bg-hover;
  }
}

.ie-name {
  font-weight: 500;
  color: $color-text-primary;
}

.ie-mono {
  font-family: $font-family-mono;
  font-size: 10px;
  color: $color-text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
