/**
 * 终端面板 — Xterm.js终端模拟器
 * Demo版：使用div模拟终端输出，后续集成xterm.js
 * 新增：终端右键菜单(复制/粘贴/全选/清空) + cd命令与SFTP双向同步
 * Termius极简风格，深色终端背景
 */
<template>
  <div class="terminal-panel" ref="terminalRef">
    <!-- 终端工具栏 -->
    <div class="terminal-toolbar">
      <span class="session-info">
        <span class="status-dot" :class="session.status"></span>
        <span class="session-name">{{ session.serverName }}</span>
        <span v-if="session.status === 'connecting'" class="session-status">Connecting...</span>
        <span v-else-if="session.status === 'error'" class="session-status error">{{ session.error }}</span>
      </span>
      <div class="toolbar-actions">
        <el-button size="small" text @click="handleClear" title="Clear">
          <el-icon><Delete /></el-icon>
        </el-button>
        <el-button size="small" text @click="handleCopy" title="Copy">
          <el-icon><DocumentCopy /></el-icon>
        </el-button>
        <el-button
          v-if="session.status === 'connected'"
          size="small" text type="danger"
          @click="handleDisconnect"
          title="Disconnect"
        >
          <el-icon><SwitchButton /></el-icon>
        </el-button>
        <el-button
          v-if="session.status === 'disconnected' || session.status === 'error'"
          size="small" text type="primary"
          @click="handleReconnect"
          title="Reconnect"
        >
          <el-icon><RefreshRight /></el-icon>
        </el-button>
        <span class="toolbar-sep"></span>
        <el-button
          v-if="session.status === 'connected'"
          size="small" text
          @click="handleExplainCommand"
          title="Explain last command to AI"
        >
          <el-icon><ChatDotSquare /></el-icon>
        </el-button>
        <el-button
          v-if="session.status === 'connected'"
          size="small" text
          @click="handleAnalyzeOutput"
          title="Analyze output with AI"
        >
          <el-icon><DataAnalysis /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- 终端内容区 -->
    <div class="terminal-body" @click="onTerminalBodyClick" @contextmenu.prevent="onTerminalContextMenu">
      <div class="terminal-output" ref="outputRef">
        <div v-for="(line, i) in outputLines" :key="i" class="output-line">
          <span v-if="line.type === 'cmd'" class="prompt">{{ line.promptAtTime || cwdPrompt }} </span>
          <span :class="line.type">{{ line.text }}</span>
        </div>
        <div v-if="session.status === 'connected'" class="input-line">
          <span class="prompt">{{ cwdPrompt }} </span>
          <input
            ref="inputRef"
            v-model="inputText"
            class="terminal-input"
            @keydown.enter="handleCommand" @keydown.up.prevent="handleHistoryUp" @keydown.down.prevent="handleHistoryDown" @keydown.tab.prevent="handleTabComplete"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
      </div>
    </div>

    <!-- 终端右键菜单 -->
    <div v-if="termContextMenu.visible" class="term-context-menu" :style="{ left: termContextMenu.x + 'px', top: termContextMenu.y + 'px' }" @click.stop>
      <!-- 有选中文字时的菜单 -->
      <template v-if="selectedText">
        <div class="tmenu-header">Selected: {{ selectedText.length > 40 ? selectedText.slice(0, 40) + '...' : selectedText }}</div>
        <div class="tmenu-item" @click.stop="termAction('copySelection'); termContextMenu.visible = false">
          <el-icon :size="13"><DocumentCopy /></el-icon><span>Copy</span>
          <span class="tmenu-shortcut">Ctrl+C</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('sendToAI'); termContextMenu.visible = false">
          <el-icon :size="13"><ChatDotSquare /></el-icon><span>Send to AI</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('executeAsCommand'); termContextMenu.visible = false">
          <el-icon :size="13"><Promotion /></el-icon><span>Execute as Command</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('searchWeb'); termContextMenu.visible = false">
          <el-icon :size="13"><Search /></el-icon><span>Search Web</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('saveAsQuickCommand'); termContextMenu.visible = false">
          <el-icon :size="13"><Star /></el-icon><span>Save as Quick Cmd</span>
        </div>
        <div class="tmenu-sep"></div>
        <div class="tmenu-item" @click.stop="termAction('selectAll'); termContextMenu.visible = false">
          <el-icon :size="13"><FullScreen /></el-icon><span>Select All</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('clear'); termContextMenu.visible = false">
          <el-icon :size="13"><Delete /></el-icon><span>Clear</span>
        </div>
      </template>
      <!-- 无选中文字时的菜单 -->
      <template v-else>
        <div class="tmenu-item" @click.stop="termAction('copy'); termContextMenu.visible = false">
          <el-icon :size="13"><DocumentCopy /></el-icon><span>Copy All</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('paste'); termContextMenu.visible = false">
          <el-icon :size="13"><CopyDocument /></el-icon><span>Paste</span>
          <span class="tmenu-shortcut">Ctrl+V</span>
        </div>
        <div class="tmenu-sep"></div>
        <div class="tmenu-item" @click.stop="termAction('selectAll'); termContextMenu.visible = false">
          <el-icon :size="13"><FullScreen /></el-icon><span>Select All</span>
        </div>
        <div class="tmenu-item" @click.stop="termAction('clear'); termContextMenu.visible = false">
          <el-icon :size="13"><Delete /></el-icon><span>Clear</span>
        </div>
        <div class="tmenu-sep"></div>
        <div class="tmenu-item" @click.stop="termAction('copyCommand'); termContextMenu.visible = false">
          <el-icon :size="13"><Document /></el-icon><span>Copy Last Cmd</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount, watch, computed, inject, type Ref } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage } from 'element-plus'
import { Delete, DocumentCopy, SwitchButton, RefreshRight, CopyDocument, Document, FullScreen, ChatDotSquare, DataAnalysis, Search, Promotion, Star } from '@element-plus/icons-vue'
import type { SshSession } from '@/stores/ssh'

const props = defineProps<{ session: SshSession }>()
const sshStore = useSshStore()

const terminalRef = ref<HTMLElement>()
const outputRef = ref<HTMLElement>()
const inputRef = ref<HTMLInputElement>()
const inputText = ref('')

// 当前工作目录（cd命令同步）
const currentWorkDir = ref('/root')

// 命令历史记录
const cmdHistory = ref<string[]>([])
const historyIndex = ref(-1)
const MAX_HISTORY = 100

// 常用命令列表（用于Tab补全）
const KNOWN_COMMANDS = [
  'ls', 'cd', 'cat', 'pwd', 'whoami', 'id', 'hostname', 'date', 'uname',
  'df -h', 'free -h', 'top', 'htop', 'ps aux', 'ps -ef', 'kill',
  'netstat -tlnp', 'ss -tlnp', 'ping', 'curl', 'wget',
  'docker ps', 'docker images', 'docker logs', 'docker compose',
  'systemctl status', 'systemctl start', 'systemctl stop', 'systemctl restart', 'systemctl enable',
  'journalctl -n 50', 'journalctl -f',
  'tail -f', 'tail -n 100', 'head -n 50', 'grep', 'find', 'tree',
  'mkdir', 'touch', 'rm', 'mv', 'cp', 'chmod', 'chown', 'ln',
  'tar -czf', 'tar -xzf', 'gzip', 'gunzip',
  'echo', 'printf', 'which', 'env', 'printenv', 'export',
  'sudo', 'su', 'bash', 'sh', 'exit', 'clear', 'history',
  'apt update', 'apt upgrade', 'apt install', 'npm', 'pip3',
  'ifconfig', 'ip addr', 'ip route', 'route',
  'vi', 'vim', 'nano', 'less', 'more',
  'sort', 'wc', 'cut', 'tr', 'uniq',
  'crontab -l', 'crontab -e',
  'service --status-all',
  'last', 'who', 'w', 'uptime',
]

// 提示符：user@host:path$
const cwdPrompt = computed(() => {
  const shortPath = currentWorkDir.value === '/root' ? '~' : currentWorkDir.value.replace('/home/admin', '~')
  return `root@${props.session.serverName.toLowerCase().replace(/\s/g, '-')}:${shortPath}$`
})

// SFTP路径同步（inject from WorkspaceView）
const syncSftpPath = inject<(path: string) => void>('syncSftpPath', undefined)

// Inject quick command execution ref
const quickCommandRef = inject<Ref<string>>('quickCommandToExecute', ref(''))
watch(quickCommandRef, (cmd) => {
  if (cmd && cmd.trim()) {
    inputText.value = cmd.trim()
    focusInput()
  }
})

// === 全量目录→文件映射（与SFTP demo数据同步，覆盖所有路径） ===
const DIR_MAP: Record<string, string[]> = {
  '/':       ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'media', 'mnt', 'opt', 'proc', 'root', 'run', 'sbin', 'srv', 'sys', 'tmp', 'usr', 'var'],
  '/bin':    ['bash', 'sh', 'ls', 'cp', 'mv', 'rm', 'cat', 'grep', 'chmod', 'mkdir', 'ln', 'find', 'tar', 'gzip', 'mount', 'df', 'ps', 'kill', 'ping', 'curl', 'wget'],
  '/boot':   ['grub', 'vmlinuz', 'initrd.img', 'config-5.15.0'],
  '/boot/grub': ['grub.cfg'],
  '/dev':    ['null', 'zero', 'random', 'urandom', 'sda', 'sda1', 'sda2', 'tty', 'pts', 'shm'],
  '/etc':    ['nginx', 'ssh', 'systemd', 'docker', 'cron.d', 'hosts', 'passwd', 'shadow', 'group', 'fstab', 'resolv.conf', 'hostname', 'os-release', 'crontab', 'profile', 'environment', 'sudoers', 'shells', 'locale.conf', 'issue'],
  '/etc/nginx': ['nginx.conf', 'conf.d', 'sites-available', 'sites-enabled', 'mime.types', 'fastcgi_params'],
  '/etc/nginx/conf.d': ['default.conf', 'api.conf', 'ssl.conf'],
  '/etc/nginx/sites-available': ['default'],
  '/etc/nginx/sites-enabled': ['default'],
  '/etc/ssh': ['sshd_config', 'ssh_config', 'ssh_host_rsa_key.pub', 'ssh_host_ecdsa_key.pub'],
  '/etc/systemd': ['system'],
  '/etc/systemd/system': ['nginx.service', 'docker.service', 'sshd.service'],
  '/etc/docker': ['daemon.json', 'key.json'],
  '/etc/cron.d': ['backup', 'logrotate'],
  '/home':   ['admin', 'deploy', 'ubuntu', 'www-data'],
  '/home/admin': ['.bashrc', '.bash_history', '.profile', '.ssh', 'projects', 'scripts', 'notes.txt', 'todo.md'],
  '/home/admin/.ssh': ['authorized_keys', 'id_rsa', 'id_rsa.pub', 'known_hosts', 'config'],
  '/home/admin/projects': ['webapp', 'api-server', 'README.md'],
  '/home/admin/projects/webapp': ['package.json', 'tsconfig.json', 'vite.config.ts', 'src', 'Dockerfile', '.env', '.gitignore', 'index.html', 'README.md'],
  '/home/admin/projects/webapp/src': ['App.vue', 'main.ts', 'components', 'views', 'router', 'styles'],
  '/home/admin/projects/webapp/src/components': ['Header.vue', 'Footer.vue', 'Sidebar.vue'],
  '/home/admin/projects/api-server': ['main.py', 'requirements.txt', 'config.yaml', 'Dockerfile', '.env', 'app', 'tests'],
  '/home/admin/scripts': ['deploy.sh', 'backup.sh', 'healthcheck.sh', 'monitor.sh', 'sync.sh'],
  '/home/deploy': ['releases', 'current', 'shared'],
  '/home/deploy/releases': ['20240529', '20240530', '20240601'],
  '/home/deploy/current': ['REVISION'],
  '/lib':    ['x86_64-linux-gnu', 'modules', 'systemd', 'firmware'],
  '/lib/x86_64-linux-gnu': ['libc.so.6', 'libpthread.so.0', 'libm.so.6', 'libz.so.1', 'libssl.so.3'],
  '/lib/modules': ['5.15.0-91-generic'],
  '/media':  ['usb', 'cdrom'],
  '/media/usb': ['backup.dat'],
  '/media/cdrom': ['README.txt'],
  '/mnt':    ['data', 'backup', 'share'],
  '/mnt/data': ['shared_files'],
  '/mnt/backup': ['system_backup.tar.gz'],
  '/opt':    ['apps', 'tools', '1panel'],
  '/opt/apps': ['monitoring', 'web', 'database'],
  '/opt/apps/monitoring': ['prometheus.yml', 'grafana.ini', 'alertmanager.yml'],
  '/opt/tools': ['jq', 'yq', 'node_exporter'],
  '/proc':   ['cpuinfo', 'meminfo', 'version', 'uptime', 'loadavg', 'stat', 'mounts', 'filesystems', 'partitions', 'self'],
  '/root':   ['0.0.0.0:8081', '1panel-v2.1.13-linux-amd64', '1panel-v2.1.13-linux-amd64.tar.gz', 'dd_schedule.log', 'f2f_migrate_error_.log', 'f2f_migrate_schedule_.log', 'linux.log', 'SMS-Agent', 'SMS-Agent.tar.gz', 'SMS-Agent.tar.gz.cms', 'SMS-Agent.tar.gz.cms.crl', 'SMS-Agent.tar.gz.cms.crl.1', 'SMS-Agent.tar.gz.sha256'],
  '/root/.ssh': ['authorized_keys', 'id_rsa', 'id_rsa.pub'],
  '/run':    ['docker.sock', 'sshd.pid', 'systemd', 'lock', 'user'],
  '/sbin':   ['init', 'fdisk', 'fsck', 'mkfs', 'blkid', 'ifconfig', 'ip', 'reboot', 'shutdown', 'systemctl'],
  '/srv':    ['data', 'backups', 'www', 'ftp'],
  '/srv/data': ['uploads', 'db_dumps'],
  '/srv/data/uploads': ['report-2024.pdf', 'data.csv', 'backup.tar.gz'],
  '/srv/backups': ['db-20240530.sql.gz', 'db-20240529.sql.gz', 'db-20240528.sql.gz'],
  '/sys':    ['kernel', 'class', 'block', 'devices', 'power'],
  '/sys/kernel': ['hostname', 'version'],
  '/tmp':    ['build-output.log', 'debug.txt', 'cache', 'sessions', 'temp.sql'],
  '/tmp/cache': ['session.dat', 'npm-cache'],
  '/usr':    ['local', 'bin', 'lib', 'share', 'include', 'src'],
  '/usr/local': ['bin', 'etc', 'lib', 'share'],
  '/usr/local/bin': ['node', 'npm', 'python3', 'pip3', 'yarn', 'go', 'rustc'],
  '/usr/local/etc': ['local.conf', 'php.ini'],
  '/usr/bin': ['git', 'curl', 'wget', 'vim', 'htop', 'docker', 'docker-compose', 'tmux', 'screen', 'tree', 'jq', 'make', 'gcc', 'python3'],
  '/usr/lib': ['x86_64-linux-gnu', 'python3', 'node_modules'],
  '/usr/share': ['doc', 'man', 'locale', 'fonts', 'zoneinfo', 'icons'],
  '/usr/include': ['stdio.h', 'stdlib.h', 'string.h', 'unistd.h', 'fcntl.h'],
  '/var':    ['log', 'lib', 'www', 'cache', 'run', 'tmp', 'spool', 'backups'],
  '/var/log': ['syslog', 'auth.log', 'kern.log', 'dmesg', 'nginx', 'docker', 'mysql', 'postgresql', 'journal'],
  '/var/log/nginx': ['access.log', 'error.log', 'access.log.1.gz', 'error.log.1.gz'],
  '/var/log/docker': ['containerd.log', 'daemon.log'],
  '/var/log/mysql': ['error.log', 'slow.log', 'mysql.log'],
  '/var/log/postgresql': ['postgresql.log', 'pg_stat_tmp'],
  '/var/lib': ['docker', 'mysql', 'postgresql', 'apt', 'dpkg', 'systemd'],
  '/var/lib/docker': ['containers', 'image', 'volumes', 'overlay2', 'networks'],
  '/var/lib/mysql': ['ibdata1', 'ib_logfile0', 'ib_logfile1', 'mysql', 'performance_schema', 'myapp', 'wordpress'],
  '/var/lib/mysql/myapp': ['users.ibd', 'orders.ibd', 'products.ibd'],
  '/var/lib/apt': ['lists', 'archives'],
  '/var/www': ['html'],
  '/var/www/html': ['index.html', '50x.html', 'style.css', 'app.js', 'favicon.ico', 'robots.txt', 'assets'],
  '/var/cache': ['apt', 'nginx', 'fonts', 'debconf'],
  '/var/spool': ['cron', 'mail', 'postfix'],
}

/** 获取某个目录下的文件列表（模拟ls） */
function getDirFiles(dirPath: string): string[] {
  return DIR_MAP[dirPath] || [`README.txt`, `notes.md`, `config.yaml`, `.gitkeep`]
}

/** 获取某个目录下的详细文件信息（模拟ls -la） */
/** Format file list in columns like real ls (auto-detect terminal width ~80 chars) */
function formatLsColumns(files: string[]): string {
  if (!files || files.length === 0) return ''
  if (files.length === 1) return files[0]
  const termW = (window.innerWidth || 1400) - 70
  const maxChars = Math.floor(termW / 7.2)
  const maxLen = Math.max(...files.map(f => f.length))
  const colW = Math.min(maxLen + 2, 28)
  const cols = Math.max(1, Math.min(files.length, Math.floor(maxChars / colW)))
  const rows = Math.ceil(files.length / cols)
  let out = ''
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r + c * rows
      if (i < files.length) out += files[i].padEnd(colW)
    }
    out += '\n'
  }
  return out.trimEnd()
}

function getDirFilesDetailed(dirPath: string): string[] {
  const files = getDirFiles(dirPath)
  const result = [`total ${files.length * 4}`]
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  if (dirPath === '/') {
    result.unshift('drwxr-xr-x  18 root root  4096 ' + dateStr + ' .')
  }

  for (const f of files) {
    const isDir = !f.includes('.') || f === 'grub' || f === 'ssh' || f === 'conf.d' || f === 'sites-available' || f === 'sites-enabled' || f === 'system' || f === 'docker' || f === 'cron.d' || f === 'projects' || f === 'scripts' || f === '.ssh' || f === 'releases' || f === 'current' || f === 'shared' || f === 'src' || f === 'components' || f === 'views' || f === 'router' || f === 'styles' || f === 'apps' || f === 'tools' || f === 'data' || f === 'backups' || f === 'uploads' || f === 'html' || f === 'cache' || f === 'kernel' || f === 'nginx' || f === 'mysql' || f === 'postgresql' || f === 'systemd' || f === 'journal' || f === 'containers' || f === 'image' || f === 'volumes' || f === 'overlay2' || f === 'networks' || f === 'lists' || f === 'archives' || f === 'assets' || f === 'doc' || f === 'man' || f === 'fonts' || f === 'locale' || f === 'zoneinfo' || f === 'icons' || f.startsWith('lib') || f === 'x86_64-linux-gnu'
    const prefix = isDir ? 'drwxr-xr-x' : '-rw-r--r--'
    const links = isDir ? '  2' : '  1'
    const perms = isDir ? 'root root  4096' : `root root  ${Math.floor(Math.random() * 51200 + 128)}`
    const hidden = f.startsWith('.') ? '. ' : '  '
    result.push(`${prefix}${links} ${perms} ${dateStr} ${hidden}${f}`)
  }
  return result
}

interface OutputLine {
  type: 'cmd' | 'output' | 'error' | 'info'
  text: string
  promptAtTime?: string  // 记录命令执行时的提示符
}

const outputLines = ref<OutputLine[]>([])

// 终端右键菜单
const termContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
})

// 连接成功后显示欢迎信息
watch(() => props.session.status, (status) => {
  if (status === 'connected') {
    outputLines.value.push(
      { type: 'info', text: `Connected to ${props.session.serverName}` },
      { type: 'output', text: 'Welcome to Ubuntu 22.04 LTS (GNU/Linux 5.15.0-91-generic x86_64)' },
      { type: 'output', text: '' },
    )
    nextTick(() => focusInput())
  } else if (status === 'error') {
    outputLines.value.push({ type: 'error', text: props.session.error || 'Connection failed' })
  }
}, { immediate: true })

onMounted(() => {
  focusInput()
  document.addEventListener('click', closeTermContextMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeTermContextMenu)
})

function closeTermContextMenu() {
  termContextMenu.visible = false
}

function focusInput() {
  inputRef.value?.focus()
}

/** 点击终端内容区：如果有选中文字则保留选中，否则聚焦输入框 */
function onTerminalBodyClick(e: MouseEvent) {
  const selection = window.getSelection()
  const selected = selection?.toString().trim()
  if (selected && selected.length > 0) {
    // 有选中文字时不聚焦输入框，保留选中状态方便右键操作
    return
  }
  focusInput()
}

function handleHistoryUp() {
  if (cmdHistory.value.length === 0) return
  if (historyIndex.value > 0) {
    historyIndex.value--
  } else if (historyIndex.value === -1) {
    historyIndex.value = cmdHistory.value.length - 1
  }
  inputText.value = cmdHistory.value[historyIndex.value] || ''
  nextTick(() => focusInput())
}

function handleHistoryDown() {
  if (cmdHistory.value.length === 0 || historyIndex.value === -1) return
  historyIndex.value++
  if (historyIndex.value >= cmdHistory.value.length) {
    historyIndex.value = -1
    inputText.value = ''
  } else {
    inputText.value = cmdHistory.value[historyIndex.value] || ''
  }
  nextTick(() => focusInput())
}

function handleTabComplete() {
  const text = inputText.value.trim()
  if (!text) return

  const parts = text.split(/\s+/)
  const isFirstToken = parts.length === 1

  // 第一个token：补全命令名
  if (isFirstToken) {
    const candidates = KNOWN_COMMANDS.filter(c => c.startsWith(text))
    if (candidates.length === 1) {
      inputText.value = candidates[0] + ' '
    } else if (candidates.length > 1) {
      showCompletionCandidates(candidates.slice(0, 20))
    }
    return
  }

  // 第二个及之后的token：补全文件路径
  const command = parts[0]
  const partial = parts[parts.length - 1]
  // 需要文件参数的命令
  const fileCommands = ['cd', 'cat', 'less', 'more', 'head', 'tail', 'vi', 'vim', 'nano', 'rm', 'cp', 'mv', 'chmod', 'chown', 'ls', 'find', 'grep', 'wc', 'sort', 'cut', 'diff', 'stat', 'file', 'du', 'tar', 'gzip', 'gunzip']
  if (!fileCommands.includes(command)) {
    // 非文件命令，尝试命令补全
    const candidates = KNOWN_COMMANDS.filter(c => c.startsWith(partial))
    if (candidates.length === 1) {
      parts[parts.length - 1] = candidates[0]
      inputText.value = parts.join(' ') + ' '
    } else if (candidates.length > 1) {
      showCompletionCandidates(candidates.slice(0, 20))
    }
    return
  }

  // 文件路径补全
  if (!partial) {
    // 无输入时，列出当前目录文件
    const files = getDirFiles(currentWorkDir.value)
    showCompletionCandidates(files)
    return
  }

  // 解析partial：可能包含目录前缀
  const lastSlash = partial.lastIndexOf('/')
  let dirPrefix = ''
  let namePrefix = partial
  let searchDir = currentWorkDir.value

  if (lastSlash >= 0) {
    dirPrefix = partial.substring(0, lastSlash + 1)
    namePrefix = partial.substring(lastSlash + 1)
    searchDir = resolvePath(partial.substring(0, lastSlash) || '/')
  }

  // 在searchDir中查找匹配的文件/目录
  const dirFiles = getDirFiles(searchDir)
  const candidates = dirFiles.filter(f => f.startsWith(namePrefix))

  if (candidates.length === 0) return

  if (candidates.length === 1) {
    const match = candidates[0]
    const fullPath = searchDir === '/' ? `/${match}` : `${searchDir}/${match}`
    const isDir = isDirPath(fullPath)
    parts[parts.length - 1] = dirPrefix + match + (isDir ? '/' : ' ')
    inputText.value = parts.join(' ')
  } else {
    // 多个匹配：找公共前缀
    const common = findCommonPrefix(candidates)
    if (common && common.length > namePrefix.length) {
      parts[parts.length - 1] = dirPrefix + common
      inputText.value = parts.join(' ')
    } else {
      showCompletionCandidates(candidates)
    }
  }
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return ''
  let prefix = strings[0]
  for (const s of strings.slice(1)) {
    while (!s.startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1)
    }
    if (prefix.length === 0) return ''
  }
  return prefix
}

function showCompletionCandidates(candidates: string[]) {
  if (candidates.length === 0) return
  const msg = candidates.join('  ')
  outputLines.value.push({ type: 'info', text: msg })
  nextTick(() => {
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  })
}

function handleCommand() {
  const cmd = inputText.value.trim()
  if (!cmd) return

  outputLines.value.push({ type: 'cmd', text: cmd, promptAtTime: cwdPrompt.value })
  // 立即滚动显示输入的命令
  scrollToBottom()
  // Add to command history
  if (cmd.trim()) {
    cmdHistory.value.push(cmd.trim())
    if (cmdHistory.value.length > MAX_HISTORY) {
      cmdHistory.value.shift()
    }
  }
  historyIndex.value = -1
  inputText.value = ''

  // cd命令 — 同步工作目录 + 通知SFTP
  if (cmd.startsWith('cd ')) {
    const target = cmd.slice(3).trim()
    if (target === '~' || target === '') {
      currentWorkDir.value = '/root'
    } else if (target === '..') {
      const parts = currentWorkDir.value.split('/').filter(Boolean)
      parts.pop()
      currentWorkDir.value = '/' + parts.join('/') || '/'
    } else if (target.startsWith('/')) {
      currentWorkDir.value = target
    } else {
      currentWorkDir.value = currentWorkDir.value === '/' ? `/${target}` : `${currentWorkDir.value}/${target}`
    }
    // 通知SFTP文件树同步路径
    if (syncSftpPath) {
      syncSftpPath(currentWorkDir.value)
    }
    scrollToBottom()
    return
  }

  if (cmd === 'clear') {
    outputLines.value = []
    return
  }
  if (cmd === 'exit') {
    handleDisconnect()
    return
  }

  // Use mock output for consistent UX across dev/build modes
  // Real SSH exec is available via executeRemoteCommand but mock gives better formatting
  const realSessionId = props.session.realSessionId
  if (realSessionId) {
    executeRemoteCommand(realSessionId, cmd)
  } else {
    const mockOutput = getMockOutput(cmd)
    if (mockOutput) {
      outputLines.value.push({ type: 'output', text: mockOutput })
    } else if (mockOutput === '') {
      // 静默成功的命令（如mkdir/touch），仍推进一条空输出
    } else {
      outputLines.value.push({ type: 'output', text: mockOutput || '' })
    }
    scrollToBottom()
  }
}

/** 判断路径是否为目录（在DIR_MAP中存在） */
function isDirPath(path: string): boolean {
  return path in DIR_MAP
}

/** 判断路径是否为文件（父目录在DIR_MAP中且包含该文件名） */
function isFilePath(path: string): boolean {
  if (path in DIR_MAP) return false // 是目录
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash < 0) return false
  const parentDir = path.substring(0, lastSlash) || '/'
  const fileName = path.substring(lastSlash + 1)
  const siblings = DIR_MAP[parentDir]
  return siblings ? siblings.includes(fileName) : false
}

/** 解析路径（支持相对路径和~） */
function resolvePath(path: string): string {
  if (path.startsWith('~')) path = '/root' + path.slice(1)
  if (path.startsWith('/')) return path
  return currentWorkDir.value === '/' ? `/${path}` : `${currentWorkDir.value}/${path}`
}

/** 根据文件扩展名生成合理的mock内容 */
function getMockFileContent(filePath: string): string | null {
  if (isDirPath(filePath)) return null // 目录不能cat
  if (!isFilePath(filePath)) return null // 文件不存在

  const fileName = filePath.split('/').pop() || ''
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  // 特定文件优先
  if (filePath === '/etc/hostname') return 'demo-server'
  if (filePath === '/etc/passwd') return `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
admin:x:1000:1000:,,,:/home/admin:/bin/bash`
  if (filePath === '/etc/shadow') return 'root:$6$rounds=4096$xxx:19000:0:99999:7:::'
  if (filePath === '/etc/group') return `root:x:0:
daemon:x:1:
admin:x:1000:`
  if (filePath === '/etc/fstab') return `# /etc/fstab: static file system information.
UUID=a1b2c3d4  /  ext4  defaults  0  1
tmpfs  /dev/shm  tmpfs  defaults  0  0`
  if (filePath === '/etc/resolv.conf') return `nameserver 8.8.8.8
nameserver 8.8.4.4`
  if (filePath === '/etc/hosts') return `127.0.0.1	localhost
127.0.1.1	demo-server
192.168.1.100	web
192.168.1.101	db`
  if (filePath === '/etc/os-release') return `PRETTY_NAME="Ubuntu 22.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian`
  if (filePath === '/etc/crontab') return `# /etc/crontab: system-wide crontab
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
# m h dom mon dow user command
17 * * * * root  cd / && run-parts --report /etc/cron.hourly
25 6 * * * root  test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )`
  if (filePath === '/etc/profile') return `# /etc/profile: system-wide .profile file
if [ "$(id -u)" -eq 0 ]; then
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
else
  PATH="/usr/local/bin:/usr/bin:/usr/games"
fi
export PATH
umask 022`
  if (filePath === '/etc/environment') return 'PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"'
  if (filePath === '/etc/sudoers') return `Defaults	env_reset
Defaults	secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
root	ALL=(ALL:ALL) ALL
%admin	ALL=(ALL) ALL`
  if (filePath === '/etc/shells') return `/bin/sh
/bin/bash
/usr/bin/bash
/bin/dash
/usr/bin/dash`
  if (filePath === '/etc/issue') return 'Ubuntu 22.04.3 LTS \\n \\l'
  if (filePath === '/etc/nginx/nginx.conf') return `user www-data;
worker_processes auto;
pid /run/nginx.pid;
events {
  worker_connections 768;
  multi_accept on;
}
http {
  sendfile on;
  tcp_nopush on;
  types_hash_max_size 2048;
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log /var/log/nginx/access.log;
  error_log /var/log/nginx/error.log;
  gzip on;
  include /etc/nginx/conf.d/*.conf;
  include /etc/nginx/sites-enabled/*;
}`
  if (filePath === '/etc/ssh/sshd_config') return `Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
PermitRootLogin yes
PubkeyAuthentication yes
PasswordAuthentication yes
X11Forwarding no
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server`
  if (filePath === '/etc/ssh/ssh_config') return `Host *
  SendEnv LANG LC_*
  HashKnownHosts yes
  GSSAPIAuthentication yes`
  if (filePath === '/etc/docker/daemon.json') return `{
  "registry-mirrors": ["https://mirror.example.com"],
  "log-driver": "json-file",
  "log-opts": {"max-size": "10m", "max-file": "3"},
  "storage-driver": "overlay2"
}`
  if (filePath === '/proc/cpuinfo') return `processor	: 0
vendor_id	: GenuineIntel
model name	: Intel(R) Xeon(R) Platinum 8269CY
cpu MHz		: 2500.000
cache size	: 36608 KB
processor	: 1
vendor_id	: GenuineIntel
model name	: Intel(R) Xeon(R) Platinum 8269CY
cpu MHz		: 2500.000
cache size	: 36608 KB`
  if (filePath === '/proc/meminfo') return `MemTotal:        8192000 kB
MemFree:         3200000 kB
MemAvailable:    5200000 kB
Buffers:          256000 kB
Cached:          1536000 kB
SwapTotal:       2048000 kB
SwapFree:        2048000 kB`
  if (filePath === '/proc/version') return 'Linux version 5.15.0-91-generic (gcc version 11.4.0 (Ubuntu 11.4.0-1ubuntu1)) #101-Ubuntu SMP x86_64'
  if (filePath === '/proc/uptime') return '2592000.00 5184000.00'
  if (filePath === '/proc/loadavg') return '0.10 0.05 0.01 1/120 256'
  if (filePath === '/proc/stat') return `cpu  2255 34 2290 22625563 6290 0 0 0
cpu0 1132 17 1145 11312781 3145 0 0 0
cpu1 1123 17 1145 11312782 3145 0 0 0`
  if (filePath === '/var/log/syslog') return `Jun  4 10:00:00 demo-server systemd[1]: Started nginx.service
Jun  4 09:55:00 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100
Jun  4 09:50:00 demo-server kernel: IPv6: ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready
Jun  4 09:45:00 demo-server docker[1024]: Container webapp started
Jun  4 09:40:00 demo-server cron[300]: (root) CMD (/usr/local/bin/healthcheck.sh)`
  if (filePath === '/var/log/auth.log') return `Jun  4 09:55:00 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100 port 22 ssh2
Jun  4 09:50:00 demo-server sshd[256]: pam_unix(sshd:session): session opened for user root`
  if (filePath === '/var/log/nginx/access.log') return `192.168.1.1 - - [04/Jun/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 1234 "-" "curl/7.68"
192.168.1.2 - - [04/Jun/2026:09:59:00 +0000] "POST /api/data HTTP/1.1" 201 256 "-" "Mozilla/5.0"
192.168.1.3 - - [04/Jun/2026:09:58:00 +0000] "GET /static/app.js HTTP/1.1" 304 0 "-" "Mozilla/5.0"`
  if (filePath === '/var/log/nginx/error.log') return `2026/06/04 09:45:00 [error] 512#512: *1 connect() failed (111: Connection refused) while connecting to upstream
2026/06/04 09:40:00 [warn] 512#512: *2 upstream sent too big header`
  if (filePath === '/var/log/docker/daemon.log') return `time="2026-06-04T09:50:00Z" level=info msg="Container webapp started"
time="2026-06-04T09:45:00Z" level=info msg="Loading containers: start"`
  if (filePath === '/var/log/mysql/error.log') return `2026-06-04 09:50:00 0 [Note] /usr/sbin/mysqld: ready for connections.
2026-06-04 09:45:00 0 [Note] InnoDB: Buffer pool(s) load completed at`

  // 按扩展名生成
  if (['log', 'out'].includes(ext)) return `[2026-06-04 10:00:00] INFO  Server started successfully on port 8081
[2026-06-04 09:55:00] INFO  SSH login from 192.168.1.100
[2026-06-04 09:50:00] WARN  Nginx service reloaded
[2026-06-04 09:45:00] ERROR Docker container webapp restarted (exit code 137)
[2026-06-04 09:40:00] INFO  SSL certificate renewed for *.example.com
[2026-06-04 09:35:00] INFO  Backup completed: 512MB transferred
[2026-06-04 09:30:00] DEBUG Health check passed: all services OK
[2026-06-04 09:25:00] INFO  Cron job executed: /usr/local/bin/backup.sh`
  if (ext === 'json') return `{
  "name": "${fileName.replace('.json', '')}",
  "version": "1.0.0",
  "description": "Application configuration",
  "port": 8081,
  "debug": false,
  "database": {
    "host": "localhost",
    "port": 3306,
    "name": "myapp"
  }
}`
  if (ext === 'yaml' || ext === 'yml') return `# ${fileName}
version: "3.8"
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html
  app:
    build: .
    ports:
      - "8081:8081"
    environment:
      - NODE_ENV=production`
  if (ext === 'toml') return `# ${fileName}
[server]
host = "0.0.0.0"
port = 8081
workers = 4

[database]
url = "postgres://localhost/myapp"
max_connections = 20`
  if (ext === 'sh' || ext === 'bash') return `#!/bin/bash
# ${fileName}
set -e

echo "Starting ${fileName.replace('.sh', '')}..."

# Main logic
if [ -z "$1" ]; then
  echo "Usage: $0 ${'<'}argument${'>'}"
  exit 1
fi

echo "Done."`
  if (ext === 'py') return `#!/usr/bin/env python3
"""${fileName}"""

import os
import sys

def main():
    print("Hello from ${fileName.replace('.py', '')}")

if __name__ == "__main__":
    main()`
  if (ext === 'js' || ext === 'ts') return `// ${fileName}
const express = require("express");
const app = express();
const PORT = process.env.PORT || 8081;

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});`
  if (ext === 'vue') return `${'<'}template>
  ${'<'}div class="app">
    ${'<'}h1>Hello World${'<'}${'/'}h1>
  ${'<'}${'/'}div>
${'<'}${'/'}template>

${'<'}script setup>
// ${fileName}
${'<'}${'/'}script>

${'<'}style scoped>
.app { padding: 20px; }
${'<'}${'/'}style>`
  if (ext === 'html') return `${'<'}!DOCTYPE html>
${'<'}html lang="en">
${'<'}head>
  ${'<'}meta charset="UTF-8">
  ${'<'}title>${fileName.replace('.html', '')}${'<'}${'/'}title>
${'<'}${'/'}head>
${'<'}body>
  ${'<'}h1>Welcome${'<'}${'/'}h1>
${'<'}${'/'}body>
${'<'}${'/'}html>`
  if (ext === 'css' || ext === 'scss') return `/* ${fileName} */
:root {
  --primary: #5b8def;
  --bg: #1a1a2e;
  --text: #e8e8f0;
}

body {
  font-family: sans-serif;
  background: var(--bg);
  color: var(--text);
}`
  if (ext === 'md') return `# ${fileName.replace('.md', '')}

## Overview
This is a markdown file on the server.

## Usage
\`\`\`bash
npm install
npm start
\`\`\`

## Notes
> File: ${filePath}`
  if (ext === 'conf' || ext === 'cfg' || ext === 'ini') return `# ${fileName}
server_name = demo-server
listen_port = 8081
worker_processes = 4
log_level = info
max_connections = 1024`
  if (ext === 'env') return `# Environment variables
NODE_ENV=production
PORT=8081
DATABASE_URL=postgres://localhost:5432/myapp
REDIS_URL=redis://localhost:6379`
  if (ext === 'sql') return `-- ${fileName}
SELECT * FROM users WHERE active = true ORDER BY created_at DESC LIMIT 10;`
  if (ext === 'csv') return `id,name,email,role
1,admin,admin@example.com,admin
2,user,user@example.com,user
3,ops,ops@example.com,operator`
  if (ext === 'txt') return `This is the content of ${fileName}.
Created on 2026-06-04.
Path: ${filePath}

Notes:
- Server: demo-server
- OS: Ubuntu 22.04 LTS
- Status: Running`
  if (ext === 'xml') return `${'<' + '?'}xml version="1.0" encoding="UTF-8"?>
${'<'}config>
  ${'<'}server>
    ${'<'}host>0.0.0.0${'<'}${'/'}host>
    ${'<'}port>8081${'<'}${'/'}port>
  ${'<'}${'/'}server>
${'<'}${'/'}config>`
  if (ext === 'rs') return `// ${fileName}
fn main() {
    println!("Hello from Rust!");
}`
  if (ext === 'go') return `package main

import "fmt"

func main() {
    fmt.Println("Hello from Go!")
}`
  if (ext === 'java') return `public class ${fileName.replace('.java', '')} {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
    }
}`
  if (ext === 'c' || ext === 'cpp' || ext === 'h') return `// ${fileName}
${'#'}include ${'<'}stdio.h${'>'}

int main() {
    printf("Hello, World!\\n");
    return 0;
}`
  if (ext === 'rb') return `# ${fileName}
puts "Hello from Ruby!"`
  if (ext === 'php') return `${'<' + '?'}php
// ${fileName}
echo "Hello from PHP!";
?>`
  if (ext === 'dockerfile') return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8081
CMD ["node", "server.js"]`
  if (ext === 'gitignore') return `node_modules/
dist/
.env
*.log
.DS_Store`
  if (ext === 'pub') return 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... root@demo-server'
  if (ext === 'service') return `[Unit]
Description=${fileName.replace('.service', '')}
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/${fileName.replace('.service', '')}
Restart=on-failure

[Install]
WantedBy=multi-user.target`
  if (ext === 'types') return 'text/css text/html application/json application/javascript'
  if (['gz', 'tgz', 'zip', 'rar', '7z', 'bz2', 'xz'].includes(ext)) return `[Binary file: ${fileName}] - cannot display contents`
  if (['ico', 'icns', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'].includes(ext)) return `[Image file: ${fileName}] - cannot display contents`
  if (['ibd', 'sql.gz'].includes(ext)) return `[Database file: ${fileName}] - binary data`
  if (['cms', 'crl', 'sha256'].includes(ext)) return `[Encrypted/Checksum file: ${fileName}]`

  // 无扩展名文件
  return `# ${fileName}
# Path: ${filePath}
# Last modified: ${dateStr}

This is the content of ${fileName}.`
}

function getMockOutput(cmd: string): string {
  if (cmd === 'cd') return ''
  if (cmd === 'ls') return formatLsColumns(getDirFiles(currentWorkDir.value))
  if (cmd === 'ls -1') return getDirFiles(currentWorkDir.value).join('\n')
  if (cmd === 'ls -la' || cmd === 'ls -l') return getDirFilesDetailed(currentWorkDir.value).join('\n')
  if (cmd.startsWith('ls ')) {
    const target = cmd.slice(3).trim()
    const fullPath = resolvePath(target)
    if (isDirPath(fullPath)) return formatLsColumns(getDirFiles(fullPath))
    if (isFilePath(fullPath)) return target // ls a-file just shows the name
    return `ls: cannot access '${target}': No such file or directory`
  }
  if (cmd === 'pwd') return currentWorkDir.value
  if (cmd === 'whoami') return 'root'
  if (cmd === 'id') return 'uid=0(root) gid=0(root) groups=0(root)'
  if (cmd === 'hostname') return props.session.serverName.toLowerCase().replace(/\s/g, '-')
  if (cmd === 'date') return new Date().toString()
  if (cmd === 'uname -a') return 'Linux demo-server 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux'
  if (cmd === 'uname -r') return '5.15.0-91-generic'
  if (cmd === 'df -h') return 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        50G   12G   36G  25% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm'
  if (cmd === 'free -h') return '              total        used        free      shared  buff/cache   available\nMem:          7.8Gi       2.1Gi       3.2Gi       256Mi       2.5Gi       5.2Gi\nSwap:         2.0Gi          0B       2.0Gi'
  if (cmd.startsWith('echo ')) return cmd.slice(5)

  // === cat: 读取文件内容 ===
  if (cmd.startsWith('cat ')) {
    const target = cmd.slice(4).trim()
    const fullPath = resolvePath(target)
    if (isDirPath(fullPath)) return `cat: ${target}: Is a directory`
    const content = getMockFileContent(fullPath)
    if (content !== null) return content
    return `cat: ${target}: No such file or directory`
  }

  // === head: 显示文件前N行 ===
  if (cmd.startsWith('head ')) {
    const parts = cmd.slice(5).trim().split(/\s+/)
    let n = 10
    let fileIdx = 0
    if (parts[0]?.startsWith('-n')) {
      n = parseInt(parts[0].replace('-n', '')) || 10
      fileIdx = 1
    } else if (parts[0]?.startsWith('-')) {
      n = parseInt(parts[0].slice(1)) || 10
      fileIdx = 1
    }
    const target = parts[fileIdx]
    if (!target) return ''
    const fullPath = resolvePath(target)
    const content = getMockFileContent(fullPath)
    if (content === null) return `head: ${target}: No such file or directory`
    return content.split('\n').slice(0, n).join('\n')
  }

  // === tail: 显示文件后N行 ===
  if (cmd.startsWith('tail ')) {
    const rest = cmd.slice(5).trim()
    if (rest.startsWith('-f ')) {
      // tail -f: 模拟输出最新几行
      const target = rest.slice(3).trim()
      const fullPath = resolvePath(target)
      const content = getMockFileContent(fullPath)
      if (content === null) return `tail: ${target}: No such file or directory`
      const lines = content.split('\n')
      return lines.slice(-5).join('\n')
    }
    const parts = rest.split(/\s+/)
    let n = 10
    let fileIdx = 0
    if (parts[0]?.startsWith('-n')) {
      n = parseInt(parts[0].replace('-n', '')) || 10
      fileIdx = 1
    } else if (parts[0]?.startsWith('-')) {
      n = parseInt(parts[0].slice(1)) || 10
      fileIdx = 1
    }
    const target = parts[fileIdx]
    if (!target) return ''
    const fullPath = resolvePath(target)
    const content = getMockFileContent(fullPath)
    if (content === null) return `tail: ${target}: No such file or directory`
    return content.split('\n').slice(-n).join('\n')
  }

  // === wc: 统计行数/词数/字节数 ===
  if (cmd.startsWith('wc ')) {
    const parts = cmd.slice(3).trim().split(/\s+/)
    const target = parts.find(p => !p.startsWith('-')) || ''
    if (!target) return ''
    const fullPath = resolvePath(target)
    const content = getMockFileContent(fullPath)
    if (content === null) return `wc: ${target}: No such file or directory`
    const lines = content.split('\n').length
    const words = content.split(/\s+/).filter(Boolean).length
    const bytes = new TextEncoder().encode(content).length
    return `  ${lines}  ${words} ${bytes} ${target}`
  }

  // === sort: 排序 ===
  if (cmd.startsWith('sort ')) {
    const target = cmd.slice(5).trim().split(/\s+/).find(p => !p.startsWith('-')) || ''
    if (!target) return ''
    const fullPath = resolvePath(target)
    const content = getMockFileContent(fullPath)
    if (content === null) return `sort: ${target}: No such file or directory`
    return content.split('\n').sort().join('\n')
  }

  // === uniq: 去重 ===
  if (cmd.startsWith('uniq ')) {
    const target = cmd.slice(5).trim().split(/\s+/).find(p => !p.startsWith('-')) || ''
    if (!target) return ''
    const fullPath = resolvePath(target)
    const content = getMockFileContent(fullPath)
    if (content === null) return `uniq: ${target}: No such file or directory`
    const lines = content.split('\n')
    return lines.filter((l, i) => l !== lines[i - 1]).join('\n')
  }

  // === cut: 截取列 ===
  if (cmd.startsWith('cut ')) {
    const rest = cmd.slice(4).trim()
    const dMatch = rest.match(/-d['"]?([^'"\s]+)/)
    const fMatch = rest.match(/-f(\d+)/)
    const target = rest.split(/\s+/).find(p => !p.startsWith('-')) || ''
    if (!target) return ''
    const fullPath = resolvePath(target)
    const content = getMockFileContent(fullPath)
    if (content === null) return `cut: ${target}: No such file or directory`
    const delim = dMatch ? dMatch[1] : '\t'
    const field = fMatch ? parseInt(fMatch[1]) - 1 : 0
    return content.split('\n').map(line => line.split(delim)[field] || '').join('\n')
  }

  // === grep: 搜索文本 ===
  if (cmd.startsWith('grep ')) {
    const rest = cmd.slice(5).trim()
    const parts = rest.split(/\s+/).filter(p => !p.startsWith('-'))
    if (parts.length < 1) return ''
    const pattern = parts[0].replace(/['"]/g, '')
    // 有文件参数时，在文件内容中搜索
    if (parts.length >= 2) {
      const target = parts[1]
      const fullPath = resolvePath(target)
      const content = getMockFileContent(fullPath)
      if (content === null) return `grep: ${target}: No such file or directory`
      return content.split('\n').filter(l => l.includes(pattern)).join('\n') || ''
    }
    // 无文件参数时，模拟搜索syslog
    return `Jun  4 10:00:00 demo-server sshd[256]: Accepted publickey for root\nJun  4 09:55:00 demo-server systemd[1]: Started nginx.service\nJun  4 09:50:00 demo-server docker[1024]: Container webapp started`
  }

  // === find: 查找文件 ===
  if (cmd.startsWith('find ')) {
    const parts = cmd.slice(5).trim().split(/\s+/)
    const path = parts[0]?.startsWith('-') ? currentWorkDir.value : resolvePath(parts[0] || '.')
    const nameIdx = parts.indexOf('-name')
    const namePattern = nameIdx >= 0 ? parts[nameIdx + 1]?.replace(/['"*]/g, '') : ''
    // 从DIR_MAP中查找匹配的路径
    const results: string[] = []
    for (const dir of Object.keys(DIR_MAP)) {
      if (!dir.startsWith(path)) continue
      for (const f of DIR_MAP[dir]) {
        const fullPath = dir === '/' ? `/${f}` : `${dir}/${f}`
        if (namePattern) {
          if (f.includes(namePattern)) results.push(fullPath)
        } else {
          results.push(fullPath)
        }
      }
    }
    return results.slice(0, 30).join('\n') || `${path}\n${path}/config.json\n${path}/README.md`
  }

  // === which: 查找命令位置 ===
  if (cmd.startsWith('which ')) {
    const name = cmd.slice(6).trim()
    const binDirs = ['/usr/bin', '/usr/local/bin', '/bin', '/sbin']
    for (const d of binDirs) {
      if (DIR_MAP[d]?.includes(name)) return `${d}/${name}`
    }
    return KNOWN_COMMANDS.some(c => c.startsWith(name)) ? `/usr/bin/${name}` : `${name} not found`
  }

  // === du: 磁盘使用 ===
  if (cmd.startsWith('du ')) {
    const target = cmd.slice(3).trim().split(/\s+/).find(p => !p.startsWith('-')) || '.'
    const fullPath = resolvePath(target)
    if (isDirPath(fullPath)) {
      const files = getDirFiles(fullPath)
      return files.map(f => `4.0K\t${fullPath === '/' ? '/' + f : fullPath + '/' + f}`).join('\n') + `\n${12 + files.length * 4}K\t${fullPath}`
    }
    return '4.0K\t' + target
  }

  // === stat: 文件状态 ===
  if (cmd.startsWith('stat ')) {
    const target = cmd.slice(5).trim()
    const fullPath = resolvePath(target)
    const fileName = fullPath.split('/').pop() || ''
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    if (isDirPath(fullPath)) return `  File: ${fileName}\n  Size: 4096\tBlocks: 8\tIO Block: 4096\tdirectory\nAccess: (0755/drwxr-xr-x)  Uid: (0/root)   Gid: (0/root)\nModify: ${dateStr}`
    if (isFilePath(fullPath)) return `  File: ${fileName}\n  Size: ${1024 + Math.floor(Math.random() * 51200)}\tBlocks: 16\tIO Block: 4096\tregular file\nAccess: (0644/-rw-r--r--)  Uid: (0/root)   Gid: (0/root)\nModify: ${dateStr}`
    return `stat: cannot stat '${target}': No such file or directory`
  }

  // === file: 文件类型 ===
  if (cmd.startsWith('file ')) {
    const target = cmd.slice(5).trim()
    const fullPath = resolvePath(target)
    if (isDirPath(fullPath)) return `${target}: directory`
    if (isFilePath(fullPath)) {
      const ext = target.split('.').pop()?.toLowerCase() || ''
      if (['sh', 'bash'].includes(ext)) return `${target}: Bourne-Again shell script, ASCII text executable`
      if (['py'].includes(ext)) return `${target}: Python script, ASCII text executable`
      if (['js', 'ts'].includes(ext)) return `${target}: ASCII text`
      if (['json'].includes(ext)) return `${target}: JSON data`
      if (['gz', 'zip', 'tgz'].includes(ext)) return `${target}: gzip compressed data`
      return `${target}: ASCII text`
    }
    return `${target}: cannot open (No such file or directory)`
  }

  // === diff: 文件比较 ===
  if (cmd.startsWith('diff ')) return ''

  // === touch/mkdir/rm/cp/mv/chmod/chown/ln: 静默成功 ===
  if (cmd.startsWith('mkdir ') || cmd.startsWith('touch ') || cmd.startsWith('rm ')) return ''
  if (cmd.startsWith('chmod ') || cmd.startsWith('chown ')) return ''
  if (cmd.startsWith('cp ') || cmd.startsWith('mv ') || cmd.startsWith('ln ')) return ''
  if (cmd.startsWith('tar ')) return ''
  if (cmd.startsWith('gzip ') || cmd.startsWith('gunzip ')) return ''

  // === 常用命令 ===
  if (cmd === 'top' || cmd === 'htop') return 'top - 10:00:00 up 30 days,  2:00,  1 user,  load average: 0.10, 0.05, 0.01\nTasks: 120 total,   1 running, 119 sleeping\n%Cpu(s):  2.0 us,  0.5 sy,  0.0 ni, 97.5 id,  0.0 wa\nMiB Mem :   7800.0 total,   3200.0 free,   2100.0 used,   2500.0 buff/cache'
  if (cmd === 'ps aux' || cmd === 'ps -ef') return 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  0.0  0.2 169356 13032 ?        Ss   May01   0:02 /sbin/init\nroot       256  0.0  0.1  61532  4816 ?        Ss   May01   0:00 /usr/sbin/sshd -D\nroot       512  0.0  0.3  57344 28672 ?        Ss   May01   0:01 nginx: master process\nwww-data   513  0.0  0.1  57344  8192 ?        S    May01   0:02 nginx: worker process\nroot      1024  0.1  0.5 819200 40960 ?        Sl   May01   5:30 /usr/bin/dockerd'
  if (cmd === 'netstat -tlnp' || cmd === 'ss -tlnp') return 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID\ntcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      256/sshd\ntcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      512/nginx\ntcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN      512/nginx\ntcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN      768/mysqld'
  if (cmd === 'docker ps') return 'CONTAINER ID   IMAGE          COMMAND        STATUS       PORTS                    NAMES\na1b2c3d4e5f6   nginx:latest   "/docker..."   Up 2 days   0.0.0.0:80->80/tcp       web\nb2c3d4e5f6a7   postgres:16    "docker..."    Up 3 days   0.0.0.0:5432->5432/tcp   db'
  if (cmd.startsWith('systemctl')) return '● nginx.service - A high performance web server\n   Loaded: loaded (/lib/systemd/system/nginx.service; enabled)\n   Active: active (running)\n   Main PID: 512 (nginx)\n   CGroup: /system.slice/nginx.service'
  if (cmd.startsWith('sudo ')) return `[sudo] password for root: \n${getMockOutput(cmd.slice(5))}`
  if (cmd === 'bash' || cmd === 'sh') return 'bash-5.1$ '
  if (cmd === 'env' || cmd === 'printenv') return 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOME=/root\nUSER=root\nSHELL=/bin/bash\nLANG=en_US.UTF-8\nTERM=xterm-256color'
  if (cmd === 'history') return outputLines.value.filter(l => l.type === 'cmd').map((l, i) => `  ${i + 1}  ${l.text}`).join('\n')
  if (cmd === 'tree') {
    const files = getDirFiles(currentWorkDir.value)
    return currentWorkDir.value + '\n' + files.map(f => {
      const isDir = isDirPath(currentWorkDir.value === '/' ? `/${f}` : `${currentWorkDir.value}/${f}`)
      return '├── ' + f + (isDir ? '/' : '')
    }).join('\n')
  }
  if (cmd.startsWith('tree ')) {
    const target = cmd.slice(5).trim()
    const path = resolvePath(target)
    if (!isDirPath(path)) return `tree: ${target}: Not a directory`
    const files = getDirFiles(path)
    return path + '\n' + files.map(f => {
      const isDir = isDirPath(path === '/' ? `/${f}` : `${path}/${f}`)
      return '├── ' + f + (isDir ? '/' : '')
    }).join('\n')
  }
  if (cmd.startsWith('journalctl')) return 'Jun 04 10:00:00 demo-server systemd[1]: Started nginx.service\nJun 04 09:55:00 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100\nJun 04 09:50:00 demo-server kernel: IPv6: ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready'
  if (cmd === 'docker images') return 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnginx        latest    a1b2c3d4e5f6   2 weeks ago   187MB\nnode         20-alpine  b2c3d4e5f6a7   4 weeks ago   126MB\npostgres     16        c3d4e5f6a7b8   6 weeks ago   412MB'
  if (cmd === 'docker ps -a') return 'CONTAINER ID   IMAGE          COMMAND                  STATUS                     PORTS                    NAMES\na1b2c3d4e5f6   nginx:latest   \"/docker-entrypoint.\"   Up 2 days                 0.0.0.0:80->80/tcp       web\nb2c3d4e5f6a7   postgres:16    \"docker-entrypoint.\"   Exited (137) 3 hours ago  0.0.0.0:5432->5432/tcp   db'
  if (cmd.startsWith('docker logs ')) return '2026/06/04 09:50:00 [notice] 1#1: start worker process 512\n2026/06/04 09:50:00 [info] 512#512: *1 client connected\n2026/06/04 09:45:00 [notice] 1#1: gracefully shutting down'
  if (cmd === 'apt list --installed') return 'Listing... Done\nnginx/now 1.24.0-1 amd64 [installed]\ndocker-ce/now 24.0.7-1 amd64 [installed]\nnodejs/now 18.19.0 amd64 [installed]\npostgresql/now 16.1-1 amd64 [installed]'
  if (cmd.startsWith('ping ') || cmd === 'ping') return 'PING demo (127.0.0.1) 56(84) bytes of data.\n64 bytes from demo: icmp_seq=1 ttl=64 time=0.1 ms\n64 bytes from demo: icmp_seq=2 ttl=64 time=0.1 ms\n64 bytes from demo: icmp_seq=3 ttl=64 time=0.1 ms\n\n--- demo ping statistics ---\n3 packets transmitted, 3 received, 0% packet loss'
  if (cmd === 'ifconfig' || cmd === 'ip addr' || cmd.startsWith('ifconfig ') || cmd.startsWith('ip addr ')) return 'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255\n        inet6 fe80::1  prefixlen 64  scopeid 0x20<link>\n        ether 00:16:3e:xx:xx:xx  txqueuelen 1000\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0'
  if (cmd === 'ip route' || cmd.startsWith('ip route ')) return 'default via 192.168.1.1 dev eth0\n192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.100'
  if (cmd === 'route' || cmd === 'route -n') return 'Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\ndefault         192.168.1.1     0.0.0.0         UG    0      0        0 eth0\n192.168.1.0     0.0.0.0         255.255.255.0   U     0      0        0 eth0'
  if (cmd === 'uptime') return ' 10:00:00 up 30 days,  2:00,  1 user,  load average: 0.10, 0.05, 0.01'
  if (cmd === 'w' || cmd === 'who') return 'root     pts/0    Jun 4 09:55 (192.168.1.100)'
  if (cmd === 'last') return 'root     pts/0        192.168.1.100   Thu Jun  4 09:55   still logged in\nroot     pts/0        192.168.1.100   Wed Jun  3 10:00 - 18:00  (08:00)'
  if (cmd === 'crontab -l' || cmd === 'crontab') return '# Edit this file to introduce tasks to be run by cron\n# m h  dom mon dow   command\n*/5 * * * * /usr/local/bin/healthcheck.sh\n0 2 * * * /usr/local/bin/backup.sh'
  if (cmd === 'service --status-all') return ' [ + ]  cron\n [ + ]  docker\n [ + ]  nginx\n [ + ]  ssh\n [ - ]  postgresql'
  if (cmd.startsWith('curl ') || cmd.startsWith('wget ')) return '(demo: network commands not available in mock mode)'
  if (cmd === 'vi' || cmd === 'vim' || cmd === 'nano') return '(demo: interactive editors not available — use cat to view files)'
  if (cmd === 'less' || cmd === 'more') return '(demo: pagers not available — use cat instead)'

  // === 智能 fallback：检查命令名是否已知 ===
  const cmdName = cmd.split(' ')[0]
  const knownCommands: Record<string, () => string> = {
    'ping': () => 'PING demo (127.0.0.1) 56(84) bytes of data.\n64 bytes from demo: icmp_seq=1 ttl=64 time=0.1 ms\n64 bytes from demo: icmp_seq=2 ttl=64 time=0.1 ms\n\n--- demo ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss',
    'cat': () => '(no input file specified — usage: cat <filename>)',
    'ls': () => formatLsColumns(getDirFiles(currentWorkDir.value)),
    'df': () => 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        50G   12G   36G  25% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm',
    'free': () => '              total        used        free      shared  buff/cache   available\nMem:          7.8Gi       2.1Gi       3.2Gi       256Mi       2.5Gi       5.2Gi\nSwap:         2.0Gi          0B       2.0Gi',
    'top': () => 'top - 10:00:00 up 30 days,  2:00,  1 user,  load average: 0.10, 0.05, 0.01\nTasks: 120 total,   1 running, 119 sleeping',
    'ps': () => 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  0.0  0.2 169356 13032 ?        Ss   May01   0:02 /sbin/init\nroot       256  0.0  0.1  61532  4816 ?        Ss   May01   0:00 /usr/sbin/sshd',
    'kill': () => 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]',
    'killall': () => '',
    'pkill': () => '',
    'ln': () => '',
    'docker': () => 'Usage: docker [OPTIONS] COMMAND\n\nCommands:\n  ps          List containers\n  images      List images\n  logs        Fetch the logs of a container',
    'systemctl': () => '● nginx.service - A high performance web server\n   Loaded: loaded\n   Active: active (running)',
    'journalctl': () => 'Jun 04 10:00:00 demo-server systemd[1]: Started nginx.service\nJun 04 09:55:00 demo-server sshd[256]: Accepted publickey for root',
    'ssh': () => 'usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-b bind_address] [-c cipher_spec]\n           [-D [bind_address:]port] [-E log_file] [-e escape_char]\n           [-F configfile] [-I pkcs11] [-i identity_file]\n           [-J [user@]host[:port]] [-L address] [-l login_name] [-m mac_spec]',
    'scp': () => 'usage: scp [-346BCpqrv] [-c cipher] [-F ssh_config] [-i identity_file]\n           [-l limit] [-o ssh_option] [-P port] [-S program] source ... target',
    'apt': () => 'apt 2.4.8 (amd64)\nUsage: apt [options] command\nMost used commands:\n  list - list packages\n  update - update package list\n  upgrade - upgrade the system\n  install - install packages\n  remove - remove packages',
    'apt-get': () => 'apt 2.4.8 (amd64)',
    'npm': () => 'npm v9.8.0\nUsage: npm <command>\n\nCommands:\n  install, i   Install a package\n  start        Start a package\n  run          Run arbitrary package scripts',
    'node': () => 'Welcome to Node.js v18.19.0.\nType ".help" for more information.',
    'python3': () => 'Python 3.10.12 (main, Nov 20 2023, 15:14:05) [GCC 11.4.0] on linux',
    'python': () => 'Python 3.10.12 (main, Nov 20 2023, 15:14:05) [GCC 11.4.0] on linux',
    'pip3': () => 'pip 23.0.1 from /usr/lib/python3/dist-packages/pip (python 3.10)',
    'pip': () => 'pip 23.0.1 from /usr/lib/python3/dist-packages/pip (python 3.10)',
    'git': () => 'usage: git [--version] [--help] [-C <path>] [-c <name>=<value>]\n           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]\nThe most commonly used git commands are:\n   clone     Clone a repository into a new directory\n   init      Create an empty Git repository\n   add       Add file contents to the index\n   commit    Record changes to the repository\n   push      Update remote refs along with associated objects\n   pull      Fetch from and integrate with another repository',
    'curl': () => 'curl: try "curl --help" for more information',
    'wget': () => 'wget: missing URL\nUsage: wget [OPTION]... [URL]...',
    'make': () => 'make: *** No targets specified and no makefile found.  Stop.',
    'gcc': () => 'gcc: fatal error: no input files\ncompilation terminated.',
    'g++': () => 'g++: fatal error: no input files\ncompilation terminated.',
    'mount': () => '/dev/vda1 on / type ext4 (rw,relatime)\ntmpfs on /dev/shm type tmpfs (rw)\n/dev/vdb1 on /data type ext4 (rw,noatime)',
    'umount': () => 'umount: missing operand',
    'dmesg': () => '[    0.000000] Linux version 5.15.0-91-generic\n[    0.000000] Command line: BOOT_IMAGE=/boot/vmlinuz-5.15.0-91-generic\n[    0.000000] KERNEL supported cpus:\n[    0.000000]   Intel GenuineIntel\n[    0.000000]   AMD AuthenticAMD\n[    0.500000] ACPI: 1 ACPI AML tables successfully acquired and loaded',
    'lscpu': () => 'Architecture:                    x86_64\nCPU op-mode(s):                  32-bit, 64-bit\nCPU(s):                          4\nThread(s) per core:              1\nCore(s) per socket:              2\nSocket(s):                       2\nModel name:                      Intel(R) Xeon(R) Platinum 8269CY',
    'lsblk': () => 'NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT\nvda    252:0    0   50G  0 disk \n├─vda1 252:1    0   49G  0 part /\n└─vda2 252:2    0    1G  0 part [SWAP]\nvdb    252:16   0  100G  0 disk \n└─vdb1 252:17   0  100G  0 part /data',
    'lsmod': () => 'Module                  Size  Used by\nxt_conntrack           16384  1\nnf_conntrack          139264  1 xt_conntrack\noverlay               151552  1\ndocker                110592  0',
    'lsof': () => 'COMMAND    PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nsshd       256 root    3u  IPv4  10240      0t0  TCP *:22 (LISTEN)\nnginx      512 root    6u  IPv4  20480      0t0  TCP *:80 (LISTEN)',
    'netstat': () => 'Proto Recv-Q Send-Q Local Address           Foreign Address         State\nudp        0      0 0.0.0.0:68              0.0.0.0:*',
    'ss': () => 'Netid  State   Recv-Q  Send-Q  Local Address:Port   Peer Address:Port\ntcp    LISTEN  0       128         0.0.0.0:22          0.0.0.0:*',
    'telnet': () => 'telnet: missing operand\nTry "telnet --help" for more information.',
    'nc': () => 'Cmd line: no host specified.',
    'nslookup': () => 'nslookup: missing hostname',
    'dig': () => 'dig: missing hostname',
    'crontab': () => '# Edit this file to introduce tasks to be run by cron.',
    'service': () => 'Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]',
    'chkconfig': () => 'nginx           0:off  1:off  2:on   3:on   4:on   5:on   6:off',
    'update-rc.d': () => 'usage: update-rc.d [-n] [-f] <basename> remove\n       update-rc.d [-n] <basename> defaults [NN | SS KK]',
    'useradd': () => 'Usage: useradd [options] LOGIN',
    'userdel': () => 'Usage: userdel [options] LOGIN',
    'usermod': () => 'Usage: usermod [options] LOGIN',
    'groupadd': () => 'Usage: groupadd [options] GROUP',
    'passwd': () => 'Changing password for root.\n(current) UNIX password: ',
    'su': () => 'su: must be run from a terminal',
    'sudo': () => 'usage: sudo -h | -K | -k | -V\nusage: sudo -v [-AknS] [-g group] [-h host] [-p prompt] [-u user]',
    'source': () => '',
    '.': () => '', // source alias
    'nohup': () => 'nohup: missing operand\nTry "nohup --help" for more information.',
    'bg': () => 'bash: bg: no job control in this shell',
    'fg': () => 'bash: fg: no job control in this shell',
    'jobs': () => '',
    'time': () => '\nreal\t0m0.000s\nuser\t0m0.000s\nsys\t0m0.000s',
    'type': () => 'type: missing operand',
    'export': () => '',
    'alias': () => '',
    'unalias': () => 'unalias: not enough arguments',
    'unset': () => '',
    'set': () => 'BASH=/bin/bash\nHOME=/root\nLANG=en_US.UTF-8\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nPWD=/root\nSHELL=/bin/bash\nTERM=xterm-256color\nUSER=root',
    'read': () => '',
    'printf': () => '',
    'sleep': () => '',
    'wait': () => '',
    'exec': () => 'exec: missing program argument',
    'ulimit': () => 'unlimited',
    'screen': () => 'screen: missing command',
    'tmux': () => 'tmux: missing command',
    'grep': () => 'Usage: grep [OPTION]... PATTERNS [FILE]...',
    'find': () => '.',
    'tree': () => '',
    'wc': () => '',
    'sort': () => 'Usage: sort [OPTION]... [FILE]...',
    'cut': () => 'Usage: cut OPTION... [FILE]...',
    'uniq': () => 'Usage: uniq [OPTION]... [INPUT [OUTPUT]]',
    'tr': () => 'Usage: tr [OPTION]... SET1 [SET2]',
    'diff': () => 'Usage: diff [OPTION]... FILES',
    'head': () => '',
    'tail': () => '',
    'xargs': () => '',
    'tee': () => '',
    'base64': () => '',
    'md5sum': () => '',
    'sha256sum': () => '',
    'sha1sum': () => '',
    'mkfs': () => 'mkfs: missing filesystem type',
    'fdisk': () => 'Usage: fdisk [options] <disk>',
    'parted': () => 'GNU Parted 3.4\nUsing /dev/vda',
    'blkid': () => '/dev/vda1: UUID="a1b2c3d4" TYPE="ext4" PARTUUID="e1e2e3e4-01"',
    'lsblk': () => 'NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT\nvda    252:0    0   50G  0 disk',
    'iostat': () => 'Linux 5.15.0-91-generic (demo-server)\navg-cpu:  %user   %nice %system %iowait  %steal   %idle\n           2.00    0.00    0.50    0.10    0.00   97.40',
    'vmstat': () => 'procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----\n r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st\n 0  0      0 3200000 256000 1536000    0    0     0     0    1    1  2  1 97  0  0',
    'sar': () => 'Linux 5.15.0-91-generic (demo-server)\n12:00:01 AM     CPU     %user     %nice   %system   %iowait    %steal     %idle',
    'iptables': () => 'Chain INPUT (policy ACCEPT)\ntarget     prot opt source               destination\nChain FORWARD (policy ACCEPT)\ntarget     prot opt source               destination\nChain OUTPUT (policy ACCEPT)\ntarget     prot opt source               destination',
    'firewall-cmd': () => '',
    'ufw': () => 'Status: inactive',
    'cron': () => 'usage: cron [-n | -p | -x debugflags]',
    'rsync': () => 'rsync: missing source and destination\nusage: rsync [OPTION]... SRC [SRC]... DEST',
    'sync': () => '',
    'shutdown': () => 'Shutdown scheduled for +10 minutes\nUse "shutdown -c" to cancel',
    'reboot': () => 'Reboot scheduled for +5 minutes',
    'init': () => 'init: missing runlevel',
    'hostnamectl': () => '   Static hostname: demo-server\n         Icon name: computer-vm\n