<!-- SftpView — 全页 SFTP 文件管理器（表格视图 + 批量操作） -->
<template>
  <div class="sftp-view" @contextmenu.prevent="onBlankCtx">
    <!-- 顶部工具栏 -->
    <div class="sv-toolbar">
      <div class="sv-title"><el-icon :size="16"><FolderOpened /></el-icon><span>{{ t('sftp.viewTitle') }}</span></div>
      <el-select v-model="selectedServerId" size="small" :placeholder="t('ops.selectServer')" :popper-append-to-body="false" style="width: 180px">
        <el-option v-for="s in sshStore.servers" :key="s.id" :label="s.name" :value="s.id">
          <span class="sv-opt-dot" :class="serverConn(s.id)"></span>{{ s.name }}
        </el-option>
      </el-select>
      <span v-if="connecting" class="sv-connecting"><el-icon :size="13" class="spin"><Loading /></el-icon></span>
      <div class="sv-spacer"></div>
      <el-button size="small" :disabled="!sessionId" @click="goUp" :title="t('sftp.goUp')"><el-icon :size="14"><Top /></el-icon></el-button>
      <el-button size="small" :disabled="!sessionId" @click="load" :title="t('sftp.refresh')"><el-icon :size="14"><Refresh /></el-icon></el-button>
      <el-button size="small" :disabled="!sessionId" @click="newFolder"><el-icon :size="14"><FolderAdd /></el-icon>{{ t('sftp.newFolder') }}</el-button>
      <el-button size="small" type="primary" :disabled="!sessionId" @click="uploadHere"><el-icon :size="14"><Upload /></el-icon>{{ t('sftp.upload') }}</el-button>
    </div>

    <!-- 面包屑 -->
    <div class="sv-crumb">
      <span class="sv-crumb-seg" @click="navigateTo('/')"><el-icon :size="12"><HomeFilled /></el-icon></span>
      <template v-for="(seg, i) in breadcrumbs" :key="i">
        <span class="sv-crumb-sep">/</span>
        <span class="sv-crumb-seg" :class="{ current: i === breadcrumbs.length - 1 }" @click="navigateTo(seg.path)">{{ seg.name }}</span>
      </template>
    </div>

    <!-- 无服务器 -->
    <div v-if="!sessionId && !connecting" class="sv-empty">
      <el-icon :size="40"><FolderOpened /></el-icon>
      <p>{{ sshStore.servers.length === 0 ? t('sftp.noServerConnected') : t('sftp.selectServerHint') }}</p>
    </div>

    <!-- 文件表格 -->
    <div v-else class="sv-table-wrap" v-loading="loading">
      <table class="sv-table">
        <thead>
          <tr>
            <th class="col-check"><el-checkbox :model-value="allChecked" :indeterminate="someChecked" @change="toggleAll" /></th>
            <th class="col-name sortable" @click="setSort('name')">{{ t('sftp.colName') }}<span v-if="sortBy==='name'" class="sort-ar">{{ sortAsc?'▲':'▼' }}</span></th>
            <th class="col-size sortable" @click="setSort('size')">{{ t('sftp.colSize') }}<span v-if="sortBy==='size'" class="sort-ar">{{ sortAsc?'▲':'▼' }}</span></th>
            <th class="col-time sortable" @click="setSort('modified')">{{ t('sftp.colModified') }}<span v-if="sortBy==='modified'" class="sort-ar">{{ sortAsc?'▲':'▼' }}</span></th>
            <th class="col-perm">{{ t('sftp.colPerms') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in sortedEntries" :key="e.path" class="sv-row" :class="{ selected: selected.has(e.path) }"
              @click="onRowClick(e, $event)" @dblclick="onRowDbl(e)" @contextmenu.prevent.stop="onRowCtx(e, $event)">
            <td class="col-check" @click.stop><el-checkbox :model-value="selected.has(e.path)" @change="toggleOne(e.path)" /></td>
            <td class="col-name">
              <span class="sv-icon" :style="{ backgroundColor: fileColor(e) }"><el-icon :size="12"><component :is="fileIcon(e)" /></el-icon></span>
              <span class="sv-fname" :class="{ hidden: e.isHidden }">{{ e.name }}</span>
            </td>
            <td class="col-size mono">{{ e.sizeStr }}</td>
            <td class="col-time mono">{{ e.modified }}</td>
            <td class="col-perm mono">{{ e.permOctal }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="entries.length === 0 && !loading" class="sv-empty-folder">{{ t('sftp.emptyFolder') }}</div>
    </div>

    <!-- 状态栏 -->
    <div class="sv-status">
      <span>{{ t('sftp.itemsCount', { n: entries.length }) }}</span>
      <template v-if="selected.size > 0">
        <span class="sv-sel">· {{ t('sftp.selectedCount', { n: selected.size }) }}</span>
        <div class="sv-spacer"></div>
        <el-button size="small" @click="bulkDownload"><el-icon :size="13"><Download /></el-icon>{{ t('sftp.bulkDownload') }}</el-button>
        <el-button size="small" type="danger" @click="bulkDelete"><el-icon :size="13"><Delete /></el-icon>{{ t('sftp.bulkDelete') }}</el-button>
      </template>
    </div>

    <!-- 右键菜单 -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x+'px', top: ctx.y+'px' }">
      <template v-if="ctx.entry">
        <div class="ctx-item" v-if="ctx.entry.isDir" @click="ctxAct('enter')"><el-icon :size="13"><FolderOpened /></el-icon><span>{{ t('sftp.propTypeDir') }}</span></div>
        <div class="ctx-item" v-else @click="ctxAct('download')"><el-icon :size="13"><Download /></el-icon><span>{{ t('sftp.download') }}</span></div>
        <div class="ctx-item" @click="ctxAct('rename')"><el-icon :size="13"><Edit /></el-icon><span>{{ t('sftp.rename') }}</span></div>
        <div class="ctx-item" @click="ctxAct('chmod')"><el-icon :size="13"><Lock /></el-icon><span>{{ t('sftp.permissions') }}</span></div>
        <div class="ctx-sep"></div>
        <div class="ctx-item" @click="ctxAct('copyPath')"><el-icon :size="13"><Link /></el-icon><span>{{ t('sftp.copyPath') }}</span></div>
        <div class="ctx-sep"></div>
        <div class="ctx-item danger" @click="ctxAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('sftp.delete') }}</span></div>
      </template>
      <template v-else>
        <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('sftp.refresh') }}</span></div>
        <div class="ctx-item" @click="ctxAct('newFolder')"><el-icon :size="13"><FolderAdd /></el-icon><span>{{ t('sftp.newFolder') }}</span></div>
        <div class="ctx-item" @click="ctxAct('upload')"><el-icon :size="13"><Upload /></el-icon><span>{{ t('sftp.upload') }}</span></div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { FolderOpened, FolderAdd, Refresh, Upload, Download, Delete, Edit, Lock, Link, Top, HomeFilled, Loading, Document, DocumentCopy, Picture, Files, Setting, Coin, DataLine } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { sftpReadDir, sftpMkdir, sftpRemove, sftpRename, sftpDownload, sftpUpload, sftpChmod, sshExec } from '@/api/tauri'
import { resolveSession } from '@/utils/ops-connect'

interface FEntry { name: string; path: string; isDir: boolean; size: number; sizeStr: string; modified: string; permOctal: string; isHidden: boolean }

const sshStore = useSshStore()
const { t } = useLocale()

const selectedServerId = ref('')
const sessionId = ref('')
const connecting = ref(false)
const transientIds = new Set<string>()

const currentPath = ref('/')
const entries = ref<FEntry[]>([])
const loading = ref(false)
const selected = reactive(new Set<string>())
const sortBy = ref<'name' | 'size' | 'modified'>('name')
const sortAsc = ref(true)

const ctx = reactive({ visible: false, x: 0, y: 0, entry: null as FEntry | null })

// ── 服务器连接 ──
function serverConn(id: string): string {
  const s = sshStore.sessions.find(x => x.serverId === id)
  return s?.status === 'connected' ? 'connected' : 'disconnected'
}
async function ensureSession(id: string) {
  sessionId.value = ''
  if (!id) return
  const server = sshStore.servers.find(s => s.id === id)
  if (!server) return
  const existing = sshStore.sessions.find(s => s.serverId === id && s.status === 'connected' && s.realSessionId)
  if (existing?.realSessionId) { sessionId.value = existing.realSessionId; currentPath.value = '/'; load(); return }
  connecting.value = true
  const sess = await resolveSession(server)
  connecting.value = false
  if (sess) { sessionId.value = sess.id; if (sess.transient) transientIds.add(sess.id); currentPath.value = '/'; load() }
  else ElMessage.error('Connection failed')
}
watch(selectedServerId, (id) => ensureSession(id))
watch(() => sshStore.servers.map(s => s.id).join(','), () => {
  if ((!selectedServerId.value || !sshStore.servers.find(s => s.id === selectedServerId.value)) && sshStore.servers.length > 0) {
    selectedServerId.value = sshStore.servers[0].id
  }
}, { immediate: true })

// ── 面包屑 ──
const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const segs: Array<{ name: string; path: string }> = []
  let acc = ''
  for (const p of parts) { acc += '/' + p; segs.push({ name: p, path: acc }) }
  return segs
})

// ── 列表加载（ls -la 富信息） ──
function humanSize(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'G'
  if (b >= 1048576) return (b / 1048576).toFixed(1) + 'M'
  if (b >= 1024) return (b / 1024).toFixed(1) + 'K'
  return b + 'B'
}
function permToOctal(sym: string): string {
  const s = sym.slice(1, 10)
  let o = ''
  for (let i = 0; i < 9; i += 3) o += String((s[i] === 'r' ? 4 : 0) + (s[i + 1] === 'w' ? 2 : 0) + (/[xst]/.test(s[i + 2]) ? 1 : 0))
  return o
}
function parseLs(raw: string, base: string): FEntry[] {
  const out: FEntry[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('total ')) continue
    const m = line.match(/^([dlbcps-][rwxsStT-]{9}[.+]?)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d\d-\d\d\s+\d\d:\d\d)\s+(.+)$/)
    if (!m) continue
    const perms = m[1]
    let name = m[4]
    if (perms[0] === 'l') name = name.split(' -> ')[0]
    if (name === '.' || name === '..') continue
    const isDir = perms[0] === 'd'
    const size = parseInt(m[2]) || 0
    const path = base === '/' ? '/' + name : base + '/' + name
    out.push({ name, path, isDir, size, sizeStr: isDir ? '-' : humanSize(size), modified: m[3], permOctal: permToOctal(perms), isHidden: name.startsWith('.') })
  }
  return out
}

async function load() {
  if (!sessionId.value) return
  loading.value = true
  selected.clear()
  const p = currentPath.value.replace(/'/g, `'\\''`)
  try {
    const raw = await sshExec(sessionId.value, `LC_ALL=C ls -la --time-style=long-iso '${p}' 2>/dev/null`)
    entries.value = parseLs(raw, currentPath.value)
    if (entries.value.length === 0) {
      // fallback to sftp read for structured listing
      try {
        const listing = await sftpReadDir(sessionId.value, currentPath.value)
        entries.value = listing.entries.filter(e => e.name !== '.' && e.name !== '..').map(e => ({
          name: e.name, path: e.path, isDir: e.file_type === 'DIRECTORY', size: e.size,
          sizeStr: e.file_type === 'DIRECTORY' ? '-' : humanSize(e.size),
          modified: e.modified ? new Date(e.modified * 1000).toISOString().slice(0, 16).replace('T', ' ') : '-',
          permOctal: '-', isHidden: e.is_hidden,
        }))
      } catch {}
    }
  } catch (e: any) { ElMessage.error(String(e?.message || e)); entries.value = [] }
  finally { loading.value = false }
}

// ── 排序 ──
const sortedEntries = computed(() => {
  const arr = [...entries.value]
  arr.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let r = 0
    if (sortBy.value === 'size') r = a.size - b.size
    else if (sortBy.value === 'modified') r = a.modified.localeCompare(b.modified)
    else r = a.name.localeCompare(b.name)
    return sortAsc.value ? r : -r
  })
  return arr
})
function setSort(key: 'name' | 'size' | 'modified') {
  if (sortBy.value === key) sortAsc.value = !sortAsc.value
  else { sortBy.value = key; sortAsc.value = true }
}

// ── 选择 ──
const allChecked = computed(() => entries.value.length > 0 && selected.size === entries.value.length)
const someChecked = computed(() => selected.size > 0 && selected.size < entries.value.length)
function toggleAll() { if (allChecked.value) selected.clear(); else entries.value.forEach(e => selected.add(e.path)) }
function toggleOne(p: string) { selected.has(p) ? selected.delete(p) : selected.add(p) }
function onRowClick(e: FEntry, ev: MouseEvent) { if (ev.ctrlKey || ev.metaKey) toggleOne(e.path) }
function onRowDbl(e: FEntry) { if (e.isDir) navigateTo(e.path); else downloadFile(e) }

// ── 导航 ──
function navigateTo(p: string) { currentPath.value = p || '/'; load() }
function goUp() { const p = currentPath.value; const up = p.substring(0, p.lastIndexOf('/')) || '/'; navigateTo(up) }

// ── 图标/颜色 ──
function fileIcon(e: FEntry) {
  if (e.isDir) return FolderOpened
  const n = e.name.toLowerCase()
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|bmp)$/.test(n)) return Picture
  if (/\.(gz|zip|tar|rar|7z|bz2|xz|tgz)$/.test(n)) return Files
  if (/\.(json|yaml|yml|toml|ini|conf|env|cfg|xml)$/.test(n)) return Setting
  if (/\.(sql|db|sqlite)$/.test(n)) return Coin
  if (/\.(log|out|err)$/.test(n)) return DataLine
  if (/\.(js|ts|vue|py|go|rs|java|c|cpp|sh|css|html)$/.test(n)) return DocumentCopy
  return Document
}
function fileColor(e: FEntry): string {
  if (e.isDir) return '#dcb67a'
  const n = e.name.toLowerCase()
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(n)) return '#26a69a'
  if (/\.(gz|zip|tar|rar|7z)$/.test(n)) return '#8d6e63'
  if (/\.(json|yaml|yml|toml|conf|env)$/.test(n)) return '#c0c0c0'
  if (/\.(sql|db)$/.test(n)) return '#ff7043'
  if (/\.(log|out)$/.test(n)) return '#78909c'
  if (/\.(js|ts|vue|py|go|rs|sh)$/.test(n)) return '#3178c6'
  return '#7a8a9e'
}

// ── 操作 ──
async function newFolder() {
  try {
    const { value } = await ElMessageBox.prompt(t('sftp.dirNamePlaceholder'), t('sftp.newFolder'))
    if (!value) return
    await sftpMkdir(sessionId.value, `${currentPath.value}/${value}`.replace(/\/+/g, '/'))
    ElMessage.success(t('sftp.created', { path: value })); load()
  } catch {}
}
async function uploadHere() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const sel = await invoke<string | string[] | null>('plugin:dialog|open', { options: { multiple: true } })
    if (!sel) return
    const paths = Array.isArray(sel) ? sel : [sel]
    ElMessage.info(t('sftp.uploading'))
    let ok = 0
    for (const lp of paths) {
      const name = lp.split(/[\\/]/).pop() || 'file'
      try { await sftpUpload(sessionId.value, lp, `${currentPath.value}/${name}`.replace(/\/+/g, '/')); ok++ } catch {}
    }
    if (ok) { ElMessage.success(t('sftp.uploaded', { n: ok })); load() }
  } catch (e: any) { ElMessage.error(t('sftp.uploadFailed') + ': ' + (e?.message || e)) }
}
async function downloadFile(e: FEntry) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const local = await invoke<string | null>('plugin:dialog|save', { options: { defaultPath: e.name } })
    if (!local) return
    ElMessage.info(t('sftp.downloading'))
    await sftpDownload(sessionId.value, e.path, local)
    ElMessage.success(t('sftp.downloaded', { name: e.name }))
  } catch (e2: any) { ElMessage.error(t('sftp.downloadFailed') + ': ' + (e2?.message || e2)) }
}
async function bulkDownload() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const dir = await invoke<string | null>('plugin:dialog|open', { options: { directory: true } })
    if (!dir) return
    ElMessage.info(t('sftp.downloading'))
    let ok = 0
    for (const p of selected) {
      const e = entries.value.find(x => x.path === p)
      if (!e || e.isDir) continue
      try { await sftpDownload(sessionId.value, e.path, `${dir}/${e.name}`); ok++ } catch {}
    }
    ElMessage.success(t('sftp.downloaded', { name: `${ok}` }))
  } catch (e: any) { ElMessage.error(String(e?.message || e)) }
}
async function bulkDelete() {
  try {
    await ElMessageBox.confirm(t('sftp.confirmBulkDelete', { n: selected.size }), t('common.confirm'), { type: 'warning' })
    for (const p of selected) {
      const e = entries.value.find(x => x.path === p)
      if (e) { try { await sftpRemove(sessionId.value, e.path, e.isDir) } catch {} }
    }
    ElMessage.success(t('sftp.deleted')); load()
  } catch {}
}
async function renameEntry(e: FEntry) {
  try {
    const { value } = await ElMessageBox.prompt(t('sftp.newNamePlaceholder'), t('sftp.rename'), { inputValue: e.name })
    if (!value) return
    await sftpRename(sessionId.value, e.path, `${e.path.substring(0, e.path.lastIndexOf('/'))}/${value}`)
    ElMessage.success(t('sftp.renamed', { old: e.name, new: value })); load()
  } catch {}
}
async function deleteEntry(e: FEntry) {
  try {
    await ElMessageBox.confirm(t('sftp.deleteConfirm', { type: e.isDir ? t('sftp.propTypeDir') : t('sftp.propTypeFile'), path: e.name }), t('common.confirm'), { type: 'warning' })
    await sftpRemove(sessionId.value, e.path, e.isDir)
    ElMessage.success(t('sftp.deleted')); load()
  } catch {}
}
async function chmodEntry(e: FEntry) {
  try {
    const { value } = await ElMessageBox.prompt(t('sftp.chmodPlaceholder'), t('sftp.permTitle'), { inputValue: e.permOctal !== '-' ? e.permOctal : '755' })
    await sftpChmod(sessionId.value, e.path, value)
    ElMessage.success(t('sftp.permApplied', { mode: value })); load()
  } catch {}
}

// ── 右键菜单 ──
function onRowCtx(e: FEntry, ev: MouseEvent) { ctx.entry = e; ctx.x = ev.clientX; ctx.y = ev.clientY; ctx.visible = true }
function onBlankCtx(ev: MouseEvent) { ctx.entry = null; ctx.x = ev.clientX; ctx.y = ev.clientY; ctx.visible = true }
function hideCtx() { ctx.visible = false }
async function ctxAct(cmd: string) {
  const e = ctx.entry; hideCtx()
  switch (cmd) {
    case 'enter': if (e) navigateTo(e.path); break
    case 'download': if (e) downloadFile(e); break
    case 'rename': if (e) renameEntry(e); break
    case 'delete': if (e) deleteEntry(e); break
    case 'chmod': if (e) chmodEntry(e); break
    case 'copyPath': if (e) { navigator.clipboard.writeText(e.path); ElMessage.success(t('sftp.copied')) } break
    case 'refresh': load(); break
    case 'newFolder': newFolder(); break
    case 'upload': uploadHere(); break
  }
}

onMounted(() => { document.addEventListener('click', hideCtx); if (sshStore.servers.length === 0) sshStore.init() })
onUnmounted(async () => {
  document.removeEventListener('click', hideCtx)
  for (const id of transientIds) { try { const { sshDisconnect } = await import('@/api/tauri'); await sshDisconnect(id) } catch {} }
})
</script>

<style lang="scss" scoped>
.sftp-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: $color-bg-app; }

.sv-toolbar {
  display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 $spacing-md; flex-shrink: 0;
  border-bottom: 1px solid $color-border-light; background: $glass-bg; backdrop-filter: blur(10px);
}
.sv-title { display: flex; align-items: center; gap: 6px; font-size: $font-size-md; font-weight: 600; color: $color-text-primary;
  .el-icon { color: $color-primary; }
}
.sv-opt-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: $color-text-muted;
  &.connected { background: $color-success; }
}
.sv-connecting { color: $color-warning; display: inline-flex; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.sv-spacer { flex: 1; }

.sv-crumb { display: flex; align-items: center; gap: 2px; padding: 6px $spacing-md; flex-shrink: 0; border-bottom: 1px solid $color-border-light; overflow-x: auto; white-space: nowrap;
  &::-webkit-scrollbar { height: 0; }
}
.sv-crumb-seg { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: $border-radius-sm; cursor: pointer; font-size: $font-size-xs; color: $color-text-secondary; transition: all $transition-fast;
  &:hover { background: $color-bg-hover; color: $color-text-primary; }
  &.current { color: $color-text-primary; font-weight: 600; }
}
.sv-crumb-sep { color: $color-text-muted; font-size: $font-size-xs; }

.sv-empty, .sv-empty-folder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; } p { margin: 0; font-size: $font-size-sm; }
}
.sv-empty-folder { padding: $spacing-xl; font-size: $font-size-sm; }

.sv-table-wrap { flex: 1; overflow-y: auto; min-height: 0; }
.sv-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: $font-size-sm;
  th { position: sticky; top: 0; z-index: 3; text-align: left; padding: 8px 10px; font-size: $font-size-xs; font-weight: 600; color: $color-text-secondary; background: $color-bg-surface; box-shadow: inset 0 -1px 0 $color-border; white-space: nowrap;
    &.sortable { cursor: pointer; user-select: none; &:hover { color: $color-text-primary; } }
    .sort-ar { margin-left: 3px; font-size: 9px; color: $color-primary; }
  }
  td { padding: 6px 10px; border-bottom: 1px solid $color-border-light; background: transparent; }
  .col-check { width: 36px; }
  .col-size { width: 90px; text-align: right; }
  .col-time { width: 150px; }
  .col-perm { width: 70px; }
}
.sv-row { cursor: default; transition: background $transition-fast;
  &:hover { background: $color-bg-hover; }
  &.selected { background: $color-bg-active; }
}
td.col-name { display: flex; align-items: center; gap: 8px; }
.sv-icon { width: 22px; height: 22px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.sv-fname { color: $color-text-primary; overflow: hidden; text-overflow: ellipsis;
  &.hidden { opacity: 0.55; }
}
.mono { font-family: $font-family-mono; color: $color-text-secondary; font-size: $font-size-xs; }

.sv-status { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 $spacing-md; flex-shrink: 0; border-top: 1px solid $color-border-light; background: $color-bg-app; font-size: $font-size-xs; color: $color-text-secondary;
  .sv-sel { color: $color-primary; }
}
</style>
