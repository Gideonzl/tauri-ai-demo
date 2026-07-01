<!-- SftpTree — SFTP File Browser using shared FS data -->
<template>
  <div class="sftp-tree" @contextmenu.prevent="onBlankContextMenu">
    <!-- 面包屑导航 -->
    <div class="crumb-bar">
      <span class="crumb-seg" @click="navigateTo('/')" title="/">
        <el-icon :size="12"><HomeFilled /></el-icon>
      </span>
      <template v-for="(seg, i) in breadcrumbs" :key="i">
        <span class="crumb-sep">/</span>
        <span class="crumb-seg" :class="{ current: i === breadcrumbs.length - 1 }" @click="navigateTo(seg.path)">{{ seg.name }}</span>
      </template>
      <div class="crumb-spacer" />
      <el-icon class="crumb-icon" :class="{ active: showHidden }" @click.stop="showHidden = !showHidden" :title="showHidden ? t('sftp.hideHidden') : t('sftp.showHidden')"><View /></el-icon>
      <el-dropdown trigger="click" @command="(c) => sortBy = c">
        <el-icon class="crumb-icon" :title="t('sftp.sortBy')"><Sort /></el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="name" :class="{ active: sortBy === 'name' }">{{ t('sftp.sortName') }}</el-dropdown-item>
            <el-dropdown-item command="size" :class="{ active: sortBy === 'size' }">{{ t('sftp.sortSize') }}</el-dropdown-item>
            <el-dropdown-item command="type" :class="{ active: sortBy === 'type' }">{{ t('sftp.sortType') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-icon class="crumb-icon" @click.stop="handleRefresh" :title="t('sftp.refresh')"><Refresh /></el-icon>
    </div>
    <!-- 当前目录过滤 -->
    <div class="filter-bar">
      <el-input v-model="filterText" size="small" :placeholder="t('sftp.filter')" clearable>
        <template #prefix><el-icon :size="13"><Search /></el-icon></template>
      </el-input>
    </div>
    <div class="tree-area" @drop.prevent="onDrop" @dragover.prevent>
      <el-tree ref="treeRef" :data="treeData" :props="treeProps" lazy :load="loadNode" node-key="path" highlight-current :filter-node-method="filterNode" @node-click="onNodeClick" @node-dblclick="onNodeDblClick" @node-contextmenu="onNodeContextMenu">
        <template #default="{ node, data }">
          <div class="tree-node" :class="{ 'is-dir': data.isDir, 'is-hidden': data.isHidden }" @dblclick.stop="onNodeDblClick(data)">
            <span class="file-icon-badge" :class="getFileTypeClass(data)" :style="{ backgroundColor: getFileColor(data) }">
              <el-icon :size="12"><component :is="getFileIcon(data)" /></el-icon>
            </span>
            <span class="node-label">{{ node.label }}</span>
            <span class="node-size" v-if="!data.isDir && data.size">{{ formatSize(data.size) }}</span>
          </div>
        </template>
      </el-tree>
      <div v-if="treeData.length === 0 && !loading" class="empty-state"><p>Empty directory</p></div>
    </div>
    <!-- Context menu -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x+'px', top: ctx.y+'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('sftp.refresh') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('newFile')"><el-icon :size="13"><Document /></el-icon><span>{{ t('sftp.newFile') }}</span></div>
      <div class="ctx-item" @click="ctxAct('newDir')"><el-icon :size="13"><FolderAdd /></el-icon><span>{{ t('sftp.newFolder') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('rename')"><el-icon :size="13"><Edit /></el-icon><span>{{ t('sftp.rename') }}</span></div>
      <div class="ctx-item danger" @click="ctxAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('sftp.delete') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" v-if="!ctxNode?.isDir" @click="ctxAct('download')"><el-icon :size="13"><Download /></el-icon><span>{{ t('sftp.download') }}</span></div>
      <div class="ctx-item" @click="ctxAct('upload')"><el-icon :size="13"><Upload /></el-icon><span>{{ t('sftp.upload') }}</span></div>
      <div class="ctx-item" @click="ctxAct('chmod')"><el-icon :size="13"><Lock /></el-icon><span>{{ t('sftp.permissions') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('copyPath')"><el-icon :size="13"><Link /></el-icon><span>{{ t('sftp.copyPath') }}</span></div>
      <div class="ctx-item" @click="ctxAct('copyName')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('sftp.copyName') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('sendToAI')"><el-icon :size="13"><ChatDotRound /></el-icon><span>{{ t('sftp.sendToAI') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, inject, onMounted, onUnmounted, watch, computed } from 'vue'
import { FolderOpened, FolderAdd, Document, Refresh, Edit, Delete, Download, Upload, Lock, SetUp, CopyDocument, Link, Files, ChatDotRound, DocumentCopy, VideoPlay, Picture, DataLine, Setting, Notebook, Coffee, Cpu, Monitor, MagicStick, Coin, HomeFilled, View, Sort, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSshStore } from '@/stores/ssh'
import { sftpReadDir, sftpMkdir, sftpRemove, sftpRename, sftpStat, sshExec, sftpDownload, sftpUpload, sftpChmod, sftpTouch } from '@/api/tauri'
import type { FileEntry, DirectoryListing } from '@/types/tauri'
import { FS as SharedFS, isDir as _d, getContent as _cat } from '@/utils/fs-data'
import { useContextMenu } from '@/composables/useContextMenu'
import { useLocale } from '@/composables/useLocale'

interface FileNode { label: string; path: string; isDir: boolean; size?: number; modTime?: number; isHidden?: boolean; children?: FileNode[] }

const sshStore = useSshStore()
const injectFilePathToAI = inject<(path: string, type: 'file'|'directory', server?: string) => void>('injectFilePathToAI')
const injectFileContentToAI = inject<(path: string, content: string, server?: string) => void>('injectFileContentToAI')

const currentPath = ref('/')
const treeData = ref<FileNode[]>([])
const treeRef = ref()
const loading = ref(false)

// SFTP view controls
const showHidden = ref(false)
const sortBy = ref<'name' | 'size' | 'type'>('name')
const filterText = ref('')

/** 扩展名（用于 type 排序） */
function extOf(n: FileNode): string { const i = n.label.lastIndexOf('.'); return i > 0 ? n.label.slice(i + 1).toLowerCase() : '' }

/** 统一排序：目录优先，再按选定维度 */
function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    if (sortBy.value === 'size') return (b.size || 0) - (a.size || 0)
    if (sortBy.value === 'type') { const e = extOf(a).localeCompare(extOf(b)); if (e !== 0) return e }
    return a.label.localeCompare(b.label)
  })
}

/** 应用隐藏过滤 + 排序 */
function applyView(nodes: FileNode[]): FileNode[] {
  const filtered = showHidden.value ? nodes : nodes.filter(n => !n.isHidden)
  return sortNodes(filtered)
}

/** 面包屑分段 */
const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const segs: Array<{ name: string; path: string }> = []
  let acc = ''
  for (const p of parts) { acc += '/' + p; segs.push({ name: p, path: acc }) }
  return segs
})

function navigateTo(path: string) { currentPath.value = path || '/'; handleRefresh() }

/** el-tree 过滤方法（对已加载节点生效） */
function filterNode(value: string, data: FileNode): boolean {
  if (!value) return true
  return data.label.toLowerCase().includes(value.toLowerCase())
}

// 重新排序/切换隐藏时刷新当前目录
watch([sortBy, showHidden], () => handleRefresh())
// 过滤词变化 → 应用到树
watch(filterText, (v) => treeRef.value?.filter(v))

const ctx = reactive({ visible: false, x: 0, y: 0 })
const ctxNode = ref<FileNode|null>(null)

const { t } = useLocale()
const { register, unregister } = useContextMenu()
const terminalTargetPath = inject<any>('terminalTargetPath', ref(''))
watch(terminalTargetPath, (newPath) => { if (newPath && newPath !== '/' && newPath !== currentPath.value) { currentPath.value = newPath; handleRefresh() } }, { deep: true })

// When switching server sessions, reload file tree for the new server
watch(
  () => sshStore.activeSessionId,
  () => {
    currentPath.value = '/'
    treeData.value = []
    handleRefresh()
  }
)

const treeProps = { label: 'label', children: 'children', isLeaf: (data: FileNode) => !data.isDir }

function getSessionId(): string|null { return sshStore.activeSession?.realSessionId || null }

function entryToNode(entry: FileEntry): FileNode {
  return { label: entry.name, path: entry.path, isDir: entry.file_type === 'DIRECTORY', size: entry.size, modTime: entry.modified, isHidden: entry.is_hidden }
}

// === File icon — expanded mapping for richer visual differentiation ===
function getFileIcon(data: FileNode) {
  if (data.isDir) return FolderOpened
  const n = data.label.toLowerCase()
  // Source code by language
  if (['.ts','.js','.tsx','.jsx','.mjs','.cjs'].some(e=>n.endsWith(e))) return DocumentCopy  // JS/TS family
  if (['.vue','.svelte'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.py','.pyi','.pyx'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.rs'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.go'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.java','.jar','.class','.kt','.kts'].some(e=>n.endsWith(e))) return Coffee
  if (['.c','.cpp','.h','.hpp','.cc','.cxx'].some(e=>n.endsWith(e))) return Cpu
  if (['.rb','.rake'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.php','.phtml'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.sh','.bash','.zsh','.fish'].some(e=>n.endsWith(e))) return Monitor
  // Styles
  if (['.css','.scss','.sass','.less','.styl'].some(e=>n.endsWith(e))) return MagicStick
  // Config & data
  if (['.json','.yaml','.yml','.toml','.ini','.conf','.env','.cfg','.xml','.lock'].some(e=>n.endsWith(e))) return Setting
  // Documents
  if (['.md','.mdx','.txt','.rst','.readme'].some(e=>n.endsWith(e))) return Notebook
  if (['.pdf'].some(e=>n.endsWith(e))) return Document
  // Logs
  if (n.endsWith('.log')||n.endsWith('.out')||n.endsWith('.err')) return DataLine
  // Archives
  if (['.gz','.zip','.tar','.rar','.7z','.bz2','.xz','.tgz'].some(e=>n.endsWith(e))) return Files
  // Images
  if (['.png','.jpg','.jpeg','.gif','.svg','.ico','.bmp','.webp'].some(e=>n.endsWith(e))) return Picture
  // Database
  if (['.ibd','.sql','.db','.sqlite','.sqlite3'].some(e=>n.endsWith(e))) return Coin
  // Executables / binaries
  if (['docker','node','npm','npx','python3','pip3','git','curl','wget','vim','htop','bash','sh','ls','chmod','mkdir','jq','yq'].includes(n)) return VideoPlay
  return Document
}
function getFileTypeClass(data: FileNode): string {
  if (data.isDir) return 'ft-dir'
  const n = data.label.toLowerCase()
  if (['.ts','.js','.vue','.tsx','.jsx','.py','.rs','.go','.java','.c','.cpp','.h','.rb','.php','.sh','.bash','.css','.scss','.less','.html','.svelte'].some(e=>n.endsWith(e))) return 'ft-code'
  if (['.json','.yaml','.yml','.toml','.ini','.conf','.env','.cfg','.xml'].some(e=>n.endsWith(e))) return 'ft-config'
  if (n.endsWith('.log')||n.endsWith('.out')) return 'ft-log'
  if (['.gz','.zip','.tar','.rar','.7z','.bz2','.xz','.tgz'].some(e=>n.endsWith(e))) return 'ft-archive'
  if (['.md','.mdx','.txt','.rst'].some(e=>n.endsWith(e))) return 'ft-doc'
  if (['.png','.jpg','.jpeg','.gif','.svg','.ico','.webp'].some(e=>n.endsWith(e))) return 'ft-image'
  if (['docker','node','npm','python3','pip3','git','curl','wget','vim','htop','bash','sh','ls','chmod','mkdir','jq','yq'].includes(n)) return 'ft-exec'
  return 'ft-default'
}

/** VSCode-style brand colors for file type icon badges */
function getFileColor(data: FileNode): string {
  if (data.isDir) return '#dcb67a'  // folder gold
  const n = data.label.toLowerCase()
  // JavaScript / TypeScript
  if (['.ts','.tsx'].some(e=>n.endsWith(e))) return '#3178c6'     // TS blue
  if (['.js','.jsx','.mjs','.cjs'].some(e=>n.endsWith(e))) return '#f7df1e'  // JS yellow
  // Frameworks
  if (n.endsWith('.vue')) return '#42b883'    // Vue green
  if (n.endsWith('.svelte')) return '#ff3e00' // Svelte orange
  // Languages
  if (n.endsWith('.py')) return '#3776ab'     // Python blue
  if (n.endsWith('.rs')) return '#dea584'     // Rust brown
  if (n.endsWith('.go')) return '#00add8'     // Go cyan
  if (['.java','.jar','.class'].some(e=>n.endsWith(e))) return '#b07219'  // Java brown
  if (['.c','.cpp','.h','.hpp','.cc'].some(e=>n.endsWith(e))) return '#555555'  // C/C++ gray
  if (n.endsWith('.php')) return '#777bb3'    // PHP purple
  if (n.endsWith('.rb')) return '#cc342d'     // Ruby red
  // Shell
  if (['.sh','.bash','.zsh','.fish'].some(e=>n.endsWith(e))) return '#4eaa25'  // Shell green
  // Styles
  if (['.css','.less'].some(e=>n.endsWith(e))) return '#1572b6'   // CSS blue
  if (['.scss','.sass'].some(e=>n.endsWith(e))) return '#c6538c'  // SCSS pink
  // HTML
  if (['.html','.htm'].some(e=>n.endsWith(e))) return '#e34f26'   // HTML orange
  // Config
  if (['.json'].some(e=>n.endsWith(e))) return '#c0c0c0'  // JSON gray
  if (['.yaml','.yml'].some(e=>n.endsWith(e))) return '#cb171e'   // YAML red
  if (n.endsWith('.toml')) return '#9c4221'  // TOML brown
  if (['.xml','.svg'].some(e=>n.endsWith(e))) return '#e67e22'   // XML/SVG orange
  if ('.env'.includes(n) || n.endsWith('.env')) return '#ecd53f'  // ENV yellow
  // Documents
  if (['.md','.mdx'].some(e=>n.endsWith(e))) return '#42a5f5'    // Markdown blue
  if (n.endsWith('.pdf')) return '#e53935'     // PDF red
  // Logs
  if (['.log','.out','.err'].some(e=>n.endsWith(e))) return '#78909c'  // Log gray
  // Archives
  if (['.gz','.zip','.tar','.rar','.7z'].some(e=>n.endsWith(e))) return '#8d6e63'  // Archive brown
  // Images
  if (['.png','.jpg','.jpeg','.gif','.webp'].some(e=>n.endsWith(e))) return '#26a69a'  // Image teal
  // Database
  if (['.sql','.db','.sqlite'].some(e=>n.endsWith(e))) return '#ff7043'  // DB orange-red
  // Docker
  if (n.includes('docker')) return '#2496ed'    // Docker blue
  // Git
  if (n.includes('git')) return '#f05032'       // Git orange
  // Default
  return '#7a8a9e'  // neutral gray
}

// === Lazy load from shared FS or real SSH ===
async function loadNode(node: any, resolve: Function) {
  const path = node.data?.path || '/'
  const sid = getSessionId()
  if (sid) {
    try { const listing: DirectoryListing = await sftpReadDir(sid, path); resolve(applyView(listing.entries.map(entryToNode))); return }
    catch (e: any) { console.warn('[SftpTree] read_dir failed, using shared FS:', e) }
  }
  // Use shared FS data
  const entries = SharedFS[path]
  if (!entries) { resolve([]); return }
  const nodes: FileNode[] = entries.map(e => {
    const isDir = e.endsWith('/'); const name = isDir ? e.slice(0, -1) : e
    const fp = path === '/' ? '/' + name : path + '/' + name
    return { label: name, path: fp, isDir, size: isDir ? 0 : Math.floor(Math.random()*50000+128), isHidden: name.startsWith('.') }
  })
  resolve(applyView(nodes))
}

function onNodeClick(data: FileNode, node: any) {
  if (data.isDir) { currentPath.value = data.path; if (node && !node.expanded) node.expand() }
}
async function onNodeDblClick(data: FileNode) {
  if (data.isDir) { currentPath.value = data.path; handleRefresh(); return }
  const existing = sshStore.openFiles.findIndex(f => f.path === data.path)
  if (existing >= 0) { sshStore.activeFileIndex = existing; return }
  const idx = sshStore.openFiles.length
  sshStore.openFiles.push({ path: data.path, name: data.label, content: 'Loading...', loading: true })
  sshStore.activeFileIndex = idx
  // Use shared content immediately
  const localContent = _cat(data.path)
  if (sshStore.openFiles[idx]) { sshStore.openFiles[idx].content = localContent || '(empty)'; sshStore.openFiles[idx].loading = false }
  // Try real SSH if available
  const sid = getSessionId()
  if (sid && typeof sid === 'string' && sid.length > 0) {
    const safePath = data.path.replace(/'/g, `'\\''`)
    try {
      const result = await sshExec(sid, `cat '${safePath}' 2>/dev/null`)
      if (sshStore.openFiles[idx] && result) sshStore.openFiles[idx].content = result
    } catch { /* keep local preview */ }
    if (sshStore.openFiles[idx]) sshStore.openFiles[idx].loading = false
  }
}

// === Context menu ===
function onNodeContextMenu(e: MouseEvent, node: any, data: FileNode) { e.preventDefault(); ctxNode.value = data; showCtx(e.clientX, e.clientY) }
function onBlankContextMenu(e: MouseEvent) { ctxNode.value = null; showCtx(e.clientX, e.clientY) }
function showCtx(x: number, y: number) { ctx.x = x; ctx.y = y; ctx.visible = true }
function hideCtx() { ctx.visible = false }
async function ctxAct(cmd: string) {
  hideCtx(); const n = ctxNode.value
  switch (cmd) {
    case 'refresh': handleRefresh(); break
    case 'newFile': {
      try {
        const { value } = await ElMessageBox.prompt(t('sftp.fileNamePlaceholder'), t('sftp.newFile'))
        if (!value) break
        const dir = n?.isDir ? n.path : currentPath.value
        const fullPath = `${dir}/${value}`.replace(/\/+/g, '/')
        const sid = getSessionId()
        if (sid) await sftpTouch(sid, fullPath)
        ElMessage.success(t('sftp.created', { path: fullPath }))
        handleRefresh()
      } catch {} break
    }
    case 'newDir': { try { const { value } = await ElMessageBox.prompt(t('sftp.dirNamePlaceholder'), t('sftp.newFolder')); const sid=getSessionId(); if(sid)await sftpMkdir(sid,`${(n?.isDir?n.path:currentPath.value)}/${value}`.replace(/\/+/g,'/'));ElMessage.success(t('sftp.created',{path:value}));handleRefresh() } catch {} break }
    case 'rename': { if(!n)break; try { const { value } = await ElMessageBox.prompt(t('sftp.newNamePlaceholder'),t('sftp.rename'),{inputValue:n.label}); const sid=getSessionId(); if(sid)await sftpRename(sid,n.path,`${n.path.substring(0,n.path.lastIndexOf('/'))}/${value}`);ElMessage.success(t('sftp.renamed',{old:n.label,new:value}));handleRefresh() } catch {} break }
    case 'delete': { if(!n)break; try { await ElMessageBox.confirm(t('sftp.deleteConfirm',{type:n.isDir?t('ai.directory'):t('ai.file'),path:n.path}),t('common.confirm'),{type:'warning'}); const sid=getSessionId(); if(sid)await sftpRemove(sid,n.path,n.isDir);ElMessage.success(t('sftp.deleted'));handleRefresh() } catch {} break }
    case 'download': {
      if (!n || n.isDir) break
      const sid = getSessionId()
      if (!sid) { ElMessage.warning(t('sftp.noConnection')); break }
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const localPath = await invoke<string | null>('plugin:dialog|save', { options: { defaultPath: n.label } })
        if (!localPath) break
        ElMessage.info(t('sftp.downloading'))
        await sftpDownload(sid, n.path, localPath)
        ElMessage.success(t('sftp.downloaded', { name: n.label }))
      } catch (e: any) { ElMessage.error(t('sftp.downloadFailed') + ': ' + (e?.message || e)) }
      break
    }
    case 'upload': {
      const sid = getSessionId()
      if (!sid) { ElMessage.warning(t('sftp.noConnection')); break }
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const selected = await invoke<string | string[] | null>('plugin:dialog|open', { options: { multiple: true } })
        if (!selected) break
        const paths = Array.isArray(selected) ? selected : [selected]
        const destDir = n?.isDir ? n.path : currentPath.value
        await uploadFiles(sid, paths, destDir)
      } catch (e: any) { ElMessage.error(t('sftp.uploadFailed') + ': ' + (e?.message || e)) }
      break
    }
    case 'chmod': {
      if (!n) break
      try {
        const { value } = await ElMessageBox.prompt(t('sftp.chmodPlaceholder'), t('sftp.chmodTitle'), { inputValue: '755' })
        const sid = getSessionId()
        if (sid) { await sftpChmod(sid, n.path, value); ElMessage.success(t('sftp.chmodDone', { mode: value })) }
      } catch {} break
    }
    case 'copyName': if(n){navigator.clipboard.writeText(n.label);ElMessage.success(t('sftp.copied'))} break
    case 'copyPath': if(n){navigator.clipboard.writeText(n.path);ElMessage.success(t('sftp.copied'))} break
    case 'sendToAI': if(n&&injectFilePathToAI){injectFilePathToAI(n.path,n.isDir?'directory':'file',sshStore.activeSession?.serverName);ElMessage.success(t('sftp.sentToAI'))} break
  }
}

/** Upload one or more local files to a remote directory */
async function uploadFiles(sid: string, localPaths: string[], destDir: string) {
  let ok = 0
  ElMessage.info(t('sftp.uploading'))
  for (const lp of localPaths) {
    const name = lp.split(/[\\/]/).pop() || 'file'
    const remotePath = `${destDir}/${name}`.replace(/\/+/g, '/')
    try { await sftpUpload(sid, lp, remotePath); ok++ }
    catch (e: any) { ElMessage.error(`${name}: ${e?.message || e}`) }
  }
  if (ok > 0) { ElMessage.success(t('sftp.uploaded', { n: ok })); handleRefresh() }
}

function handleRefresh() {
  treeData.value = []
  loading.value = true
  const sid = getSessionId()
  if (sid) { sftpReadDir(sid, currentPath.value||'/').then(l=>{treeData.value=applyView(l.entries.map(entryToNode))}).catch(()=>{treeData.value=getDemoChildren(currentPath.value)}).finally(()=>{loading.value=false}) }
  else { setTimeout(()=>{treeData.value=getDemoChildren(currentPath.value);loading.value=false}, 200) }
}
function getDemoChildren(parentPath: string): FileNode[] {
  const entries = SharedFS[parentPath]
  if (!entries) return []
  return applyView(entries.map(e => {
    const isDir = e.endsWith('/'); const name = isDir ? e.slice(0,-1) : e
    const path = parentPath === '/' ? '/' + name : parentPath + '/' + name
    return { label: name, path, isDir, size: isDir ? 0 : Math.floor(Math.random()*50000+128), isHidden: name.startsWith('.') }
  }))
}
// HTML drop is intercepted by Tauri WebView (no real paths). Real upload is wired
// via the native webview drag-drop listener in onMounted below.
function onDrop(_e: DragEvent) { /* handled by Tauri onDragDropEvent */ }
function formatSize(bytes: number): string { if(bytes<1024)return`${bytes}B`; if(bytes<1048576)return`${(bytes/1024).toFixed(1)}K`; return`${(bytes/1048576).toFixed(1)}M` }

let unlistenDrop: (() => void) | null = null

onMounted(async () => {
  treeData.value = getDemoChildren(currentPath.value)
  register(hideCtx)
  document.addEventListener('click', hideCtx)

  // Native Tauri drag-drop → upload real files to current SFTP directory
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    unlistenDrop = await getCurrentWebview().onDragDropEvent(async (event: any) => {
      if (event.payload.type !== 'drop') return
      const sid = getSessionId()
      const paths: string[] = event.payload.paths || []
      if (!sid || !paths.length) return
      try {
        await ElMessageBox.confirm(
          t('sftp.confirmUpload', { n: paths.length, path: currentPath.value }),
          t('sftp.upload'),
          { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
        )
        await uploadFiles(sid, paths, currentPath.value)
      } catch {}
    })
  } catch { /* not in Tauri runtime — drag-drop unavailable */ }
})
onUnmounted(() => { unregister(hideCtx); document.removeEventListener('click', hideCtx); if (unlistenDrop) unlistenDrop() })
</script>

<style lang="scss" scoped>
.sftp-tree { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.path-bar { padding:$spacing-xs $spacing-sm; border-bottom:1px solid $color-border-light; flex-shrink:0; .refresh-icon{cursor:pointer;color:$color-text-secondary;&:hover{color:$color-primary}} }

// 面包屑导航栏
.crumb-bar { display:flex; align-items:center; gap:2px; padding:5px $spacing-sm; border-bottom:1px solid $color-border-light; flex-shrink:0; overflow-x:auto; white-space:nowrap;
  &::-webkit-scrollbar{height:0} }
.crumb-seg { display:inline-flex; align-items:center; gap:3px; padding:2px 5px; border-radius:$border-radius-sm; cursor:pointer; font-size:$font-size-xs; color:$color-text-secondary; transition:all $transition-fast;
  &:hover{ background:$color-bg-hover; color:$color-text-primary; }
  &.current{ color:$color-text-primary; font-weight:600; } }
.crumb-sep { color:$color-text-muted; font-size:$font-size-xs; }
.crumb-spacer { flex:1; min-width:8px; }
.crumb-icon { padding:4px; border-radius:$border-radius-sm; cursor:pointer; color:$color-text-secondary; transition:all $transition-fast; flex-shrink:0;
  &:hover{ background:$color-bg-hover; color:$color-primary; }
  &.active{ color:$color-primary; background:$color-bg-active; } }

// 当前目录过滤
.filter-bar { padding:$spacing-xs $spacing-sm; border-bottom:1px solid $color-border-light; flex-shrink:0; }
:deep(.el-dropdown-menu__item.active){ color:$color-primary; }
.tree-area { flex:1; overflow-y:auto; padding:$spacing-xs 0;
  :deep(.el-tree){background:transparent;color:$color-text-primary;
    .el-tree-node__content{height:28px;&:hover{background-color:rgba(76,175,125,0.08)}}
    .el-tree-node.is-current>.el-tree-node__content{background-color:rgba(76,175,125,0.15)}
  }
}
.tree-node { display:flex; align-items:center; gap:4px; font-size:$font-size-sm;
  &.is-hidden{opacity:0.6}
  .node-icon{flex-shrink:0}
  .node-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .node-size{font-size:$font-size-xs;color:$color-text-secondary;font-family:$font-family-mono;flex-shrink:0}
}
.empty-state { display:flex; align-items:center; justify-content:center; height:100%; color:$color-text-placeholder; font-size:$font-size-xs; }
// .ctx-menu / .ctx-item / .ctx-sep styles now live in global.scss — shared with host context menu
:deep(.el-input__wrapper){background:$color-bg-surface!important;box-shadow:none!important}

// VSCode-style file icon badges
.file-icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  flex-shrink: 0;
  color: #fff; // White icon on colored background

  // Dark text for light-colored badges (JS yellow, JSON gray)
  &.ft-dir { color: #2c2c2c; }     // Gold BG → dark icon
  &.ft-code.js-family { color: #2c2c2c; } // JS yellow → dark icon
}

// Old node-icon styling (now just for alignment)
.node-icon {
  color: inherit; // Inherit from badge
}
</style>
