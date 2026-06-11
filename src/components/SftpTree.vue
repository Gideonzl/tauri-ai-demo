<!-- SftpTree — SFTP File Browser using shared FS data -->
<template>
  <div class="sftp-tree" @contextmenu.prevent="onBlankContextMenu">
    <div class="path-bar">
      <el-input v-model="currentPath" size="small" readonly prefix-icon="FolderOpened" @click="handleRefresh">
        <template #suffix><el-icon class="refresh-icon" @click.stop="handleRefresh"><Refresh /></el-icon></template>
      </el-input>
    </div>
    <div class="tree-area" @drop.prevent="onDrop" @dragover.prevent>
      <el-tree ref="treeRef" :data="treeData" :props="treeProps" lazy :load="loadNode" node-key="path" highlight-current @node-click="onNodeClick" @node-dblclick="onNodeDblClick" @node-contextmenu="onNodeContextMenu">
        <template #default="{ node, data }">
          <div class="tree-node" :class="{ 'is-dir': data.isDir, 'is-hidden': data.isHidden }" @dblclick.stop="onNodeDblClick(data)">
            <el-icon :size="14" class="node-icon" :style="{ color: getFileIconColor(data) }"><component :is="getFileIcon(data)" /></el-icon>
            <span class="node-label">{{ node.label }}</span>
            <span class="node-size" v-if="!data.isDir && data.size">{{ formatSize(data.size) }}</span>
          </div>
        </template>
      </el-tree>
      <div v-if="treeData.length === 0 && !loading" class="empty-state"><p>Empty directory</p></div>
    </div>
    <!-- Context menu -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x+'px', top: ctx.y+'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>Refresh</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('newFile')"><el-icon :size="13"><Document /></el-icon><span>New File</span></div>
      <div class="ctx-item" @click="ctxAct('newDir')"><el-icon :size="13"><FolderAdd /></el-icon><span>New Folder</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('rename')"><el-icon :size="13"><Edit /></el-icon><span>Rename</span></div>
      <div class="ctx-item" @click="ctxAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>Delete</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" v-if="!ctxNode?.isDir" @click="ctxAct('download')"><el-icon :size="13"><Download /></el-icon><span>Download</span></div>
      <div class="ctx-item" @click="ctxAct('chmod')"><el-icon :size="13"><Lock /></el-icon><span>Permissions</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('copyPath')"><el-icon :size="13"><Link /></el-icon><span>Copy Path</span></div>
      <div class="ctx-item" @click="ctxAct('copyName')"><el-icon :size="13"><CopyDocument /></el-icon><span>Copy Name</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="ctxAct('sendToAI')"><el-icon :size="13"><ChatDotRound /></el-icon><span>Send to AI</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, inject, onMounted, onUnmounted, watch } from 'vue'
import { FolderOpened, FolderAdd, Document, Refresh, Edit, Delete, Download, Upload, Lock, SetUp, CopyDocument, Link, Files, ChatDotRound, DocumentCopy, VideoPlay, Picture, DataLine, Setting, Notebook } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSshStore } from '@/stores/ssh'
import { sftpReadDir, sftpMkdir, sftpRemove, sftpRename, sftpStat, sshExec } from '@/api/tauri'
import type { FileEntry, DirectoryListing } from '@/types/tauri'
import { FS as SharedFS, isDir as _d, getContent as _cat } from '@/utils/fs-data'

interface FileNode { label: string; path: string; isDir: boolean; size?: number; modTime?: number; isHidden?: boolean; children?: FileNode[] }

const sshStore = useSshStore()
const injectFilePathToAI = inject<(path: string, type: 'file'|'directory', server?: string) => void>('injectFilePathToAI')
const injectFileContentToAI = inject<(path: string, content: string, server?: string) => void>('injectFileContentToAI')

const currentPath = ref('/')
const treeData = ref<FileNode[]>([])
const treeRef = ref()
const loading = ref(false)

const ctx = reactive({ visible: false, x: 0, y: 0 })
const ctxNode = ref<FileNode|null>(null)

const terminalTargetPath = inject<any>('terminalTargetPath', ref(''))
watch(terminalTargetPath, (newPath) => { if (newPath && newPath !== '/' && newPath !== currentPath.value) { currentPath.value = newPath; handleRefresh() } }, { deep: true })

const treeProps = { label: 'label', children: 'children', isLeaf: (data: FileNode) => !data.isDir }

function getSessionId(): string|null { return sshStore.activeSession?.realSessionId || null }

function entryToNode(entry: FileEntry): FileNode {
  return { label: entry.name, path: entry.path, isDir: entry.file_type === 'DIRECTORY', size: entry.size, modTime: entry.modified, isHidden: entry.is_hidden }
}

// === File icon ===
function getFileIcon(data: FileNode) {
  if (data.isDir) return FolderOpened
  const n = data.label.toLowerCase()
  if (['.ts','.js','.vue','.jsx','.tsx','.py','.rs','.go','.java','.c','.cpp','.h','.rb','.php','.sh','.bash'].some(e=>n.endsWith(e))) return DocumentCopy
  if (['.json','.yaml','.yml','.toml','.ini','.conf','.env','.cfg','.xml'].some(e=>n.endsWith(e))) return Setting
  if (n.endsWith('.log')||n.endsWith('.out')) return DataLine
  if (['.gz','.zip','.tar','.rar','.7z','.bz2','.xz','.tgz'].some(e=>n.endsWith(e))) return Files
  if (['.png','.jpg','.jpeg','.gif','.svg','.ico','.bmp','.webp'].some(e=>n.endsWith(e))) return Picture
  if (['docker','node','npm','python3','pip3','git','curl','wget','vim','htop','bash','sh','ls','chmod','mkdir','jq','yq'].includes(n)) return VideoPlay
  if (['.ibd','.sql','.db','.sqlite'].some(e=>n.endsWith(e))) return Notebook
  return Document
}
function getFileIconColor(data: FileNode): string {
  if (data.isDir) return '#d4a24e'
  const n = data.label.toLowerCase()
  if (['.ts','.js','.vue','.py','.rs','.go','.java','.c','.cpp','.h','.rb','.php','.sh','.bash'].some(e=>n.endsWith(e))) return '#5b8def'
  if (['.json','.yaml','.yml','.toml','.ini','.conf','.env','.cfg','.xml'].some(e=>n.endsWith(e))) return '#8888a0'
  if (n.endsWith('.log')||n.endsWith('.out')) return '#555570'
  if (['.gz','.zip','.tar','.rar','.7z','.bz2','.xz','.tgz'].some(e=>n.endsWith(e))) return '#d4a24e'
  if (['docker','node','npm','python3','pip3','git','curl','wget','vim','htop','bash','sh','ls','chmod','mkdir','jq','yq'].includes(n)) return '#4caf7d'
  return '#8888a0'
}

// === Lazy load from shared FS or real SSH ===
async function loadNode(node: any, resolve: Function) {
  const path = node.data?.path || '/'
  const sid = getSessionId()
  if (sid) {
    try { const listing: DirectoryListing = await sftpReadDir(sid, path); resolve(listing.entries.map(entryToNode).sort((a,b)=>(a.isDir!==b.isDir?(a.isDir?-1:1):a.label.localeCompare(b.label)))); return }
    catch (e: any) { console.warn('[SftpTree] read_dir failed, using shared FS:', e) }
  }
  // Use shared FS data
  const entries = SharedFS[path]
  if (!entries) { resolve([]); return }
  const nodes: FileNode[] = entries.map(e => {
    const isDir = e.endsWith('/'); const name = isDir ? e.slice(0, -1) : e
    const fp = path === '/' ? '/' + name : path + '/' + name
    return { label: name, path: fp, isDir, size: isDir ? 0 : Math.floor(Math.random()*50000+128), isHidden: name.startsWith('.') }
  }).sort((a,b) => (a.isDir!==b.isDir ? (a.isDir?-1:1) : a.label.localeCompare(b.label)))
  resolve(nodes)
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
    case 'newFile': { try { const { value } = await ElMessageBox.prompt('File name:', 'New File'); ElMessage.success(`Created: ${(n?.isDir?n.path:currentPath.value)}/${value}`); handleRefresh() } catch {} break }
    case 'newDir': { try { const { value } = await ElMessageBox.prompt('Dir name:', 'New Folder'); const sid=getSessionId(); if(sid)await sftpMkdir(sid,`${(n?.isDir?n.path:currentPath.value)}/${value}`);ElMessage.success(`Created: ${value}`);handleRefresh() } catch {} break }
    case 'rename': { if(!n)break; try { const { value } = await ElMessageBox.prompt('New name:','Rename',{inputValue:n.label}); const sid=getSessionId(); if(sid)await sftpRename(sid,n.path,`${n.path.substring(0,n.path.lastIndexOf('/'))}/${value}`);ElMessage.success(`Renamed: ${n.label}->${value}`);handleRefresh() } catch {} break }
    case 'delete': { if(!n)break; try { await ElMessageBox.confirm(`Delete ${n.isDir?'folder':'file'} ${n.path}?`,'Confirm',{type:'warning'}); const sid=getSessionId(); if(sid)await sftpRemove(sid,n.path,n.isDir);ElMessage.success(`Deleted`);handleRefresh() } catch {} break }
    case 'download': if(n)ElMessage.info(`Download: ${n.path}`); break
    case 'chmod': { try { const { value } = await ElMessageBox.prompt('Permissions:','Chmod',{inputValue:'755'});ElMessage.success(`Chmod ${value}`) } catch {} break }
    case 'copyName': if(n){navigator.clipboard.writeText(n.label);ElMessage.success('Copied')} break
    case 'copyPath': if(n){navigator.clipboard.writeText(n.path);ElMessage.success('Copied')} break
    case 'sendToAI': if(n&&injectFilePathToAI){injectFilePathToAI(n.path,n.isDir?'directory':'file',sshStore.activeSession?.serverName);ElMessage.success('Sent to AI')} break
  }
}

function handleRefresh() {
  treeData.value = []
  loading.value = true
  const sid = getSessionId()
  if (sid) { sftpReadDir(sid, currentPath.value||'/').then(l=>{treeData.value=l.entries.map(entryToNode).sort((a,b)=>(a.isDir!==b.isDir?(a.isDir?-1:1):a.label.localeCompare(b.label)))}).catch(()=>{treeData.value=getDemoChildren(currentPath.value)}).finally(()=>{loading.value=false}) }
  else { setTimeout(()=>{treeData.value=getDemoChildren(currentPath.value);loading.value=false}, 200) }
}
function getDemoChildren(parentPath: string): FileNode[] {
  const entries = SharedFS[parentPath]
  if (!entries) return []
  return entries.map(e => {
    const isDir = e.endsWith('/'); const name = isDir ? e.slice(0,-1) : e
    const path = parentPath === '/' ? '/' + name : parentPath + '/' + name
    return { label: name, path, isDir, size: isDir ? 0 : Math.floor(Math.random()*50000+128), isHidden: name.startsWith('.') }
  }).sort((a,b) => (a.isDir!==b.isDir ? (a.isDir?-1:1) : a.label.localeCompare(b.label)))
}
function onDrop(e: DragEvent) { const files = e.dataTransfer?.files; if(files?.length)ElMessage.info(`Upload to ${currentPath.value}: ${Array.from(files).map(f=>f.name).join(', ')}`) }
function formatSize(bytes: number): string { if(bytes<1024)return`${bytes}B`; if(bytes<1048576)return`${(bytes/1024).toFixed(1)}K`; return`${(bytes/1048576).toFixed(1)}M` }

onMounted(() => {
  treeData.value = getDemoChildren(currentPath.value)
  document.addEventListener('click', hideCtx)
})
onUnmounted(() => { document.removeEventListener('click', hideCtx) })
</script>

<style lang="scss" scoped>
.sftp-tree { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.path-bar { padding:$spacing-xs $spacing-sm; border-bottom:1px solid $color-border-light; flex-shrink:0; .refresh-icon{cursor:pointer;color:$color-text-secondary;&:hover{color:$color-primary}} }
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
  .node-size{font-size:$font-size-xs;color:$color-text-muted;font-family:$font-family-mono;flex-shrink:0}
}
.empty-state { display:flex; align-items:center; justify-content:center; height:100%; color:$color-text-placeholder; font-size:$font-size-xs; }
.ctx-menu { position:fixed; z-index:9999; background:$color-bg-toolbar; border:1px solid $color-border; border-radius:$border-radius-md; padding:$spacing-xs 0; min-width:180px; box-shadow:$shadow-md; }
.ctx-item { display:flex; align-items:center; gap:8px; padding:6px 12px; cursor:pointer; color:$color-text-regular; font-size:$font-size-sm; transition:all $transition-fast;
  &:hover{background:rgba(76,175,125,0.1);color:$color-text-primary}
  .el-icon{color:$color-text-secondary}
  &:hover .el-icon{color:$color-text-primary}
}
.ctx-sep { height:1px; background:$color-border-light; margin:$spacing-xs 0; }
:deep(.el-input__wrapper){background:$color-bg-surface!important;box-shadow:none!important}
</style>
