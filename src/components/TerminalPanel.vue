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
  setTimeout(() => {
    // Try real SSH first, fallback to mock
    if (realSessionId) {
      executeRemoteCommand(realSessionId, cmd)
    } else {
      const mockOutput = getMockOutput(cmd)
      if (mockOutput) {
        outputLines.value.push({ type: 'output', text: mockOutput })
      }
      nextTick(() => {
        if (outputRef.value) {
          outputRef.value.scrollTop = outputRef.value.scrollHeight
        }
      })
    }
  }, 50)
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
  if (filePath === '/etc/passwd') return 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nadmin:x:1000:1000:,,,:/home/admin:/bin/bash'
  if (filePath === '/etc/shadow') return 'root:$6$rounds=4096$xxx:19000:0:99999:7:::'
  if (filePath === '/etc/group') return 'root:x:0:\ndaemon:x:1:\nadmin:x:1000:'
  if (filePath === '/etc/fstab') return '# /etc/fstab: static file system information.\nUUID=a1b2c3d4  /  ext4  defaults  0  1\ntmpfs  /dev/shm  tmpfs  defaults  0  0'
  if (filePath === '/etc/resolv.conf') return 'nameserver 8.8.8.8\nnameserver 8.8.4.4'
  if (filePath === '/etc/hosts') return '127.0.0.1\tlocalhost\n127.0.1.1\tdemo-server\n192.168.1.100\tweb\n192.168.1.101\tdb'
  if (filePath === '/etc/os-release') return 'PRETTY_NAME="Ubuntu 22.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy\nID=ubuntu\nID_LIKE=debian'
  if (filePath === '/etc/crontab') return '# /etc/crontab: system-wide crontab\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\n# m h dom mon dow user command\n17 * * * * root  cd / && run-parts --report /etc/cron.hourly\n25 6 * * * root  test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )'
  if (filePath === '/etc/profile') return '# /etc/profile: system-wide .profile file\nif [ "$(id -u)" -eq 0 ]; then\n  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"\nelse\n  PATH="/usr/local/bin:/usr/bin:/usr/games"\nfi\nexport PATH\numask 022'
  if (filePath === '/etc/environment') return 'PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"'
  if (filePath === '/etc/sudoers') return 'Defaults\tenv_reset\nDefaults\tsecure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nroot\tALL=(ALL:ALL) ALL\n%admin\tALL=(ALL) ALL'
  if (filePath === '/etc/shells') return '/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/dash\n/usr/bin/dash'
  if (filePath === '/etc/issue') return 'Ubuntu 22.04.3 LTS \\n \\l'
  if (filePath === '/etc/nginx/nginx.conf') return 'user www-data;\nworker_processes auto;\npid /run/nginx.pid;\nevents {\n  worker_connections 768;\n  multi_accept on;\n}\nhttp {\n  sendfile on;\n  tcp_nopush on;\n  types_hash_max_size 2048;\n  include /etc/nginx/mime.types;\n  default_type application/octet-stream;\n  access_log /var/log/nginx/access.log;\n  error_log /var/log/nginx/error.log;\n  gzip on;\n  include /etc/nginx/conf.d/*.conf;\n  include /etc/nginx/sites-enabled/*;\n}'
  if (filePath === '/etc/ssh/sshd_config') return 'Port 22\nProtocol 2\nHostKey /etc/ssh/ssh_host_rsa_key\nHostKey /etc/ssh/ssh_host_ecdsa_key\nPermitRootLogin yes\nPubkeyAuthentication yes\nPasswordAuthentication yes\nX11Forwarding no\nPrintMotd no\nAcceptEnv LANG LC_*\nSubsystem sftp /usr/lib/openssh/sftp-server'
  if (filePath === '/etc/ssh/ssh_config') return 'Host *\n  SendEnv LANG LC_*\n  HashKnownHosts yes\n  GSSAPIAuthentication yes'
  if (filePath === '/etc/docker/daemon.json') return '{\n  "registry-mirrors": ["https://mirror.example.com"],\n  "log-driver": "json-file",\n  "log-opts": {"max-size": "10m", "max-file": "3"},\n  "storage-driver": "overlay2"\n}'
  if (filePath === '/proc/cpuinfo') return 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Platinum 8269CY\ncpu MHz\t\t: 2500.000\ncache size\t: 36608 KB\nprocessor\t: 1\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Platinum 8269CY\ncpu MHz\t\t: 2500.000\ncache size\t: 36608 KB'
  if (filePath === '/proc/meminfo') return 'MemTotal:        8192000 kB\nMemFree:         3200000 kB\nMemAvailable:    5200000 kB\nBuffers:          256000 kB\nCached:          1536000 kB\nSwapTotal:       2048000 kB\nSwapFree:        2048000 kB'
  if (filePath === '/proc/version') return 'Linux version 5.15.0-91-generic (gcc version 11.4.0 (Ubuntu 11.4.0-1ubuntu1)) #101-Ubuntu SMP x86_64'
  if (filePath === '/proc/uptime') return '2592000.00 5184000.00'
  if (filePath === '/proc/loadavg') return '0.10 0.05 0.01 1/120 256'
  if (filePath === '/proc/stat') return 'cpu  2255 34 2290 22625563 6290 0 0 0\ncpu0 1132 17 1145 11312781 3145 0 0 0\ncpu1 1123 17 1145 11312782 3145 0 0 0'
  if (filePath === '/var/log/syslog') return 'Jun  4 10:00:00 demo-server systemd[1]: Started nginx.service\nJun  4 09:55:00 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100\nJun  4 09:50:00 demo-server kernel: IPv6: ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready\nJun  4 09:45:00 demo-server docker[1024]: Container webapp started\nJun  4 09:40:00 demo-server cron[300]: (root) CMD (/usr/local/bin/healthcheck.sh)'
  if (filePath === '/var/log/auth.log') return 'Jun  4 09:55:00 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100 port 22 ssh2\nJun  4 09:50:00 demo-server sshd[256]: pam_unix(sshd:session): session opened for user root'
  if (filePath === '/var/log/nginx/access.log') return '192.168.1.1 - - [04/Jun/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 1234 "-" "curl/7.68"\n192.168.1.2 - - [04/Jun/2026:09:59:00 +0000] "POST /api/data HTTP/1.1" 201 256 "-" "Mozilla/5.0"\n192.168.1.3 - - [04/Jun/2026:09:58:00 +0000] "GET /static/app.js HTTP/1.1" 304 0 "-" "Mozilla/5.0"'
  if (filePath === '/var/log/nginx/error.log') return '2026/06/04 09:45:00 [error] 512#512: *1 connect() failed (111: Connection refused) while connecting to upstream\n2026/06/04 09:40:00 [warn] 512#512: *2 upstream sent too big header'
  if (filePath === '/var/log/docker/daemon.log') return 'time="2026-06-04T09:50:00Z" level=info msg="Container webapp started"\ntime="2026-06-04T09:45:00Z" level=info msg="Loading containers: start"'
  if (filePath === '/var/log/mysql/error.log') return '2026-06-04 09:50:00 0 [Note] /usr/sbin/mysqld: ready for connections.\n2026-06-04 09:45:00 0 [Note] InnoDB: Buffer pool(s) load completed at'

  // 按扩展名生成
  if (['log', 'out'].includes(ext)) return `[2026-06-04 10:00:00] INFO  Server started successfully on port 8081\n[2026-06-04 09:55:00] INFO  SSH login from 192.168.1.100\n[2026-06-04 09:50:00] WARN  Nginx service reloaded\n[2026-06-04 09:45:00] ERROR Docker container webapp restarted (exit code 137)\n[2026-06-04 09:40:00] INFO  SSL certificate renewed for *.example.com\n[2026-06-04 09:35:00] INFO  Backup completed: 512MB transferred\n[2026-06-04 09:30:00] DEBUG Health check passed: all services OK\n[2026-06-04 09:25:00] INFO  Cron job executed: /usr/local/bin/backup.sh`
  if (ext === 'json') return '{\n  "name": "' + fileName.replace('.json', '') + '",\n  "version": "1.0.0",\n  "description": "Application configuration",\n  "port": 8081,\n  "debug": false,\n  "database": {\n    "host": "localhost",\n    "port": 3306,\n    "name": "myapp"\n  }\n}'
  if (ext === 'yaml' || ext === 'yml') return '# ' + fileName + '\nversion: "3.8"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "80:80"\n    volumes:\n      - ./html:/usr/share/nginx/html\n  app:\n    build: .\n    ports:\n      - "8081:8081"\n    environment:\n      - NODE_ENV=production'
  if (ext === 'toml') return '# ' + fileName + '\n[server]\nhost = "0.0.0.0"\nport = 8081\nworkers = 4\n\n[database]\nurl = "postgres://localhost/myapp"\nmax_connections = 20'
  if (ext === 'sh' || ext === 'bash') return '#!/bin/bash\n# ' + fileName + '\nset -e\n\necho "Starting ' + fileName.replace('.sh', '') + '..."\n\n# Main logic\nif [ -z "$1" ]; then\n  echo "Usage: $0 <argument>"\n  exit 1\nfi\n\necho "Done."'
  if (ext === 'py') return '#!/usr/bin/env python3\n"""' + fileName + '"""\n\nimport os\nimport sys\n\ndef main():\n    print("Hello from ' + fileName.replace('.py', '') + '")\n\nif __name__ == "__main__":\n    main()'
  if (ext === 'js' || ext === 'ts') return '// ' + fileName + '\nconst express = require("express");\nconst app = express();\nconst PORT = process.env.PORT || 8081;\n\napp.get("/", (req, res) => {\n  res.json({ status: "ok" });\n});\n\napp.listen(PORT, () => {\n  console.log(`Server running on port ${PORT}`);\n});'
  if (ext === 'vue') return '<template>\n  <div class="app">\n    <h1>Hello World</h1>\n  </div>\n</template>\n\n<script setup>\n// ' + fileName + '\n</script>\n\n<style scoped>\n.app { padding: 20px; }\n</style>'
  if (ext === 'html') return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>' + fileName.replace('.html', '') + '</title>\n</head>\n<body>\n  <h1>Welcome</h1>\n</body>\n</html>'
  if (ext === 'css' || ext === 'scss') return '/* ' + fileName + ' */\n:root {\n  --primary: #5b8def;\n  --bg: #1a1a2e;\n  --text: #e8e8f0;\n}\n\nbody {\n  font-family: sans-serif;\n  background: var(--bg);\n  color: var(--text);\n}'
  if (ext === 'md') return '# ' + fileName.replace('.md', '') + '\n\n## Overview\nThis is a markdown file on the server.\n\n## Usage\n```bash\nnpm install\nnpm start\n```\n\n## Notes\n> File: ' + filePath
  if (ext === 'conf' || ext === 'cfg' || ext === 'ini') return '# ' + fileName + '\nserver_name = demo-server\nlisten_port = 8081\nworker_processes = 4\nlog_level = info\nmax_connections = 1024'
  if (ext === 'env') return '# Environment variables\nNODE_ENV=production\nPORT=8081\nDATABASE_URL=postgres://localhost:5432/myapp\nREDIS_URL=redis://localhost:6379'
  if (ext === 'sql') return '-- ' + fileName + '\nSELECT * FROM users WHERE active = true ORDER BY created_at DESC LIMIT 10;'
  if (ext === 'csv') return 'id,name,email,role\n1,admin,admin@example.com,admin\n2,user,user@example.com,user\n3,ops,ops@example.com,operator'
  if (ext === 'txt') return 'This is the content of ' + fileName + '.\nCreated on 2026-06-04.\nPath: ' + filePath + '\n\nNotes:\n- Server: demo-server\n- OS: Ubuntu 22.04 LTS\n- Status: Running'
  if (ext === 'xml') return '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <server>\n    <host>0.0.0.0</host>\n    <port>8081</port>\n  </server>\n</config>'
  if (ext === 'rs') return '// ' + fileName + '\nfn main() {\n    println!("Hello from Rust!");\n}'
  if (ext === 'go') return 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n}'
  if (ext === 'java') return 'public class ' + fileName.replace('.java', '') + ' {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}'
  if (ext === 'c' || ext === 'cpp' || ext === 'h') return '// ' + fileName + '\n#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}'
  if (ext === 'rb') return '# ' + fileName + '\nputs "Hello from Ruby!"'
  if (ext === 'php') return '<?php\n// ' + fileName + '\necho "Hello from PHP!";\n?>'
  if (ext === 'dockerfile') return 'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --production\nCOPY . .\nEXPOSE 8081\nCMD ["node", "server.js"]'
  if (ext === 'gitignore') return 'node_modules/\ndist/\n.env\n*.log\n.DS_Store'
  if (ext === 'pub') return 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... root@demo-server'
  if (ext === 'service') return '[Unit]\nDescription=' + fileName.replace('.service', '') + '\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=/usr/bin/' + fileName.replace('.service', '') + '\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target'
  if (ext === 'types') return 'text/css text/html application/json application/javascript'
  if (ext === 'gz' || ext === 'tgz' || ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'bz2' || ext === 'xz') return `[Binary file: ${fileName}] - cannot display contents`
  if (ext === 'ico' || ext === 'icns' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'svg' || ext === 'bmp' || ext === 'webp') return `[Image file: ${fileName}] - cannot display contents`
  if (ext === 'ibd' || ext === 'sql.gz') return `[Database file: ${fileName}] - binary data`
  if (ext === 'cms' || ext === 'crl' || ext === 'sha256') return `[Encrypted/Checksum file: ${fileName}]`

  // 无扩展名文件 — 可能是配置文件或脚本
  return `# ${fileName}\n# Path: ${filePath}\n# Last modified: ${dateStr}\n\nThis is the content of ${fileName}.`
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
    const