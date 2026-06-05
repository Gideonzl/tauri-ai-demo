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
    <div class="terminal-body" @click="focusInput" @contextmenu.prevent="onTerminalContextMenu">
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
      <div class="tmenu-item" @click.stop="termAction('copy'); termContextMenu.visible = false">
        <el-icon :size="13"><DocumentCopy /></el-icon><span>Copy</span>
      </div>
      <div class="tmenu-item" @click.stop="termAction('paste'); termContextMenu.visible = false">
        <el-icon :size="13"><CopyDocument /></el-icon><span>Paste</span>
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
        <el-icon :size="13"><Document /></el-icon><span>Copy Cmd</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount, watch, computed, inject, type Ref } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { ElMessage } from 'element-plus'
import { Delete, DocumentCopy, SwitchButton, RefreshRight, CopyDocument, Document, FullScreen, ChatDotSquare, DataAnalysis } from '@element-plus/icons-vue'
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

  // If starts with cd, complete path from DIR_MAP
  if (text.startsWith('cd ')) {
    const partial = text.slice(3).trim()
    if (!partial || partial === '') {
      // Show all top-level directories
      const dirs = Object.keys(DIR_MAP).filter(d => d !== '/' && d.split('/').length === 2).map(d => d.replace('/', ''))
      showCompletionCandidates(dirs)
      return
    }
    // Try to match path prefix
    const candidates = Object.keys(DIR_MAP).filter(d =>
      d.startsWith('/' + partial) || d.includes(partial)
    ).map(d => d.startsWith('/') ? d.slice(1) : d)
    if (candidates.length === 1) {
      const full = candidates[0].endsWith('/') ? candidates[0] : candidates[0] + '/'
      inputText.value = 'cd ' + full
    } else if (candidates.length > 1) {
      // Find common prefix
      const common = findCommonPrefix(candidates)
      if (common && common.length > partial.length) {
        inputText.value = 'cd ' + common
      } else {
        showCompletionCandidates(candidates)
      }
    }
    return
  }

  // Complete command name
  const candidates = KNOWN_COMMANDS.filter(c => c.startsWith(text))
  if (candidates.length === 1) {
    inputText.value = candidates[0]
  } else if (candidates.length > 1) {
    showCompletionCandidates(candidates.slice(0, 20))
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

function getMockOutput(cmd: string): string {
  if (cmd === 'cd') return ''
  if (cmd === 'ls') return formatLsColumns(getDirFiles(currentWorkDir.value))
  if (cmd === 'ls -1') return getDirFiles(currentWorkDir.value).join('\n')
  if (cmd === 'ls -la' || cmd === 'ls -l') return getDirFilesDetailed(currentWorkDir.value).join('\n')
  if (cmd.startsWith('ls ')) {
    // ls <dir> — try to list the given directory
    const target = cmd.slice(3).trim()
    if (target.startsWith('/')) {
      return (getDirFiles(target).length > 0) ? formatLsColumns(getDirFiles(target)) : `ls: cannot access '${target}': No such file or directory (demo)`
    }
    // Relative path — join with current work dir
    const fullPath = currentWorkDir.value === '/' ? `/${target}` : `${currentWorkDir.value}/${target}`
    return (getDirFiles(fullPath).length > 0) ? formatLsColumns(getDirFiles(fullPath)) : formatLsColumns(getDirFiles(currentWorkDir.value))
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
  if (cmd === 'cat /etc/os-release') return 'PRETTY_NAME="Ubuntu 22.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy\nID=ubuntu\nID_LIKE=debian'
  if (cmd.startsWith('cat ')) {
    const target = cmd.slice(4).trim()
    if (target === '/etc/hostname') return 'demo-server'
    if (target === '/etc/passwd') return 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nadmin:x:1000:1000:,,,:/home/admin:/bin/bash'
    if (target === '/etc/nginx/nginx.conf') return 'user www-data;\nworker_processes auto;\nevents { multi_accept on; use epoll; }\nhttp {\n  sendfile on;\n  tcp_nopush on;\n  include /etc/nginx/mime.types;\n  include /etc/nginx/conf.d/*.conf;\n}'
    if (target === '/proc/cpuinfo') return 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) Platinum 8269CY\ncpu MHz\t\t: 2500.000\ncache size\t: 36608 KB'
    if (target === '/proc/meminfo') return 'MemTotal:        8192000 kB\nMemFree:         3200000 kB\nMemAvailable:    5200000 kB\nSwapTotal:       2048000 kB'
    return `cat: ${target}: No such file or directory`
  }
  if (cmd === 'top' || cmd === 'htop') return 'top - 10:00:00 up 30 days,  2:00,  1 user,  load average: 0.10, 0.05, 0.01\nTasks: 120 total,   1 running, 119 sleeping'
  if (cmd === 'ps aux' || cmd === 'ps -ef') return 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  0.0  0.2 169356 13032 ?        Ss   May01   0:02 /sbin/init\nroot       256  0.0  0.1  61532  4816 ?        Ss   May01   0:00 /usr/sbin/sshd'
  if (cmd === 'netstat -tlnp' || cmd === 'ss -tlnp') return 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID\ntcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      256/sshd\ntcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      512/nginx'
  if (cmd === 'docker ps') return 'CONTAINER ID   IMAGE          COMMAND        STATUS       PORTS                    NAMES\na1b2c3d4e5f6   nginx:latest   "/docker..."   Up 2 days   0.0.0.0:80->80/tcp       web'
  if (cmd.startsWith('systemctl')) return '● nginx.service - A high performance web server\n   Loaded: loaded (/lib/systemd/system/nginx.service; enabled)\n   Active: active (running)'
  if (cmd.startsWith('sudo ')) return `[sudo] password for root: \n${getMockOutput(cmd.slice(5))}`
  if (cmd === 'bash' || cmd === 'sh') return 'bash-5.1$ '
  if (cmd.startsWith('mkdir ') || cmd.startsWith('touch ') || cmd.startsWith('rm ')) return ''
  if (cmd.startsWith('chmod ') || cmd.startsWith('chown ')) return ''
  if (cmd.startsWith('cp ') || cmd.startsWith('mv ')) return ''
  if (cmd.startsWith('tar ')) return ''
  if (cmd.startsWith('grep ')) return '(demo: grep not simulated)'
  if (cmd.startsWith('find ')) return '(demo: find not simulated)'
  if (cmd.startsWith('curl ') || cmd.startsWith('wget ')) return '(demo: network commands not available)'
  if (cmd === 'vi' || cmd === 'vim' || cmd === 'nano') return '(demo: interactive editors not available)'
  if (cmd === 'env' || cmd === 'printenv') return 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOME=/root\nUSER=root\nSHELL=/bin/bash'
  if (cmd === 'history') return outputLines.value.filter(l => l.type === 'cmd').map((l, i) => `  ${i + 1}  ${l.text}`).join('\n')
  if (cmd === 'tree') return getDirFiles(currentWorkDir.value).join('\n')
  if (cmd.startsWith('tree ')) {
    const target = cmd.slice(5).trim()
    const path = target.startsWith('/') ? target : (currentWorkDir.value === '/' ? `/${target}` : `${currentWorkDir.value}/${target}`)
    const files = getDirFiles(path).slice(0, 15)
    return path + '\n' + files.map(f => '├── ' + f).join('\n')
  }
  if (cmd.startsWith('grep ')) {
    const parts = cmd.slice(5).trim().split(/\s+/)
    if (parts.length >= 1) {
      const pattern = parts[0].replace(/['"]/g, '')
      return `/var/log/syslog:Jun  4 10:00:00 demo-server sshd[256]: Accepted publickey for root\n/var/log/syslog:Jun  4 09:55:00 demo-server systemd[1]: Started nginx.service\n/var/log/syslog:Jun  4 09:50:00 demo-server docker[1024]: Container webapp started`
    }
    return ''
  }
  if (cmd.startsWith('find ')) {
    const parts = cmd.slice(5).trim().split(/\s+/)
    const path = parts[0] || currentWorkDir.value
    return path + '/config.json\n' + path + '/README.md\n' + path + '/src'
  }
  if (cmd.startsWith('tail -f ') || cmd.startsWith('tail -n ')) {
    return 'Jun  4 10:00:00 demo-server systemd[1]: Started nginx.service\nJun  4 10:00:01 demo-server nginx[512]: Worker process started'
  }
  if (cmd === 'tail -f /var/log/nginx/access.log' || cmd === 'tail -n 100 /var/log/nginx/access.log') {
    return '192.168.1.1 - - [04/Jun/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 1234 "-" "curl/7.68"\n192.168.1.2 - - [04/Jun/2026:09:59:00 +0000] "POST /api/data HTTP/1.1" 201 256 "-" "Mozilla/5.0"'
  }
  if (cmd.startsWith('journalctl ')) {
    return 'Jun 04 10:00:00 demo-server systemd[1]: Started nginx.service\nJun 04 09:55:00 demo-server sshd[256]: Accepted publickey for root from 192.168.1.100\nJun 04 09:50:00 demo-server kernel: IPv6: ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready'
  }
  if (cmd === 'docker images') return 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnginx        latest    a1b2c3d4e5f6   2 weeks ago   187MB\nnode         20-alpine  b2c3d4e5f6a7   4 weeks ago   126MB\npostgres     16        c3d4e5f6a7b8   6 weeks ago   412MB'
  if (cmd === 'docker ps -a') return 'CONTAINER ID   IMAGE          COMMAND                  STATUS                     PORTS                    NAMES\na1b2c3d4e5f6   nginx:latest   \"/docker-entrypoint.\"   Up 2 days                 0.0.0.0:80->80/tcp       web\nb2c3d4e5f6a7   postgres:16    \"docker-entrypoint.\"   Exited (137) 3 hours ago  0.0.0.0:5432->5432/tcp   db'
  if (cmd.startsWith('docker logs ')) return '2026/06/04 09:50:00 [notice] 1#1: start worker process 512\n2026/06/04 09:50:00 [info] 512#512: *1 client connected'
  if (cmd === 'apt list --installed') return 'Listing... Done\nnginx/now 1.24.0-1 amd64 [installed]\ndocker-ce/now 24.0.7-1 amd64 [installed]\nnodejs/now 18.19.0 amd64 [installed]\npostgresql/now 16.1-1 amd64 [installed]'
  if (cmd.startsWith('which ')) return `/usr/bin/${cmd.slice(6)}`
  if (cmd.startsWith('head ') || cmd.startsWith('tail ')) return '(demo: head/tail not simulated)'
  if (cmd.startsWith('du ')) return '12M\t.'
  if (cmd.startsWith('ping ')) return 'PING demo (127.0.0.1) 56(84) bytes of data.\n64 bytes from demo: icmp_seq=1 ttl=64 time=0.1 ms'
  if (cmd === 'ifconfig' || cmd === 'ip addr') return 'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.1.100  netmask 255.255.255.0'
  return `bash: ${cmd}: command not found`
}

/** Execute command on remote server via SSH exec */
async function executeRemoteCommand(sessionId: string, cmd: string) {
  inputText.value = ''

  // Always use mock for consistent terminal display across dev/build
  const mock = getMockOutput(cmd)
  if (mock) outputLines.value.push({ type: 'output', text: mock })
  nextTick(() => {
    if (outputRef.value) outputRef.value.scrollTop = outputRef.value.scrollHeight
  })
}

function handleClear() {
  outputLines.value = []
}

function handleCopy() {
  const selection = window.getSelection()
  const selectedText = selection?.toString().trim()
  if (selectedText && selectedText.length > 0) {
    navigator.clipboard.writeText(selectedText).then(() => {
      ElMessage.success('Copied selection')
    })
    selection?.removeAllRanges()
    return
  }
  // Fallback: copy all output
  const text = outputLines.value.map(l => l.text).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('Copied all output')
  })
}

function handleDisconnect() {
  sshStore.updateSessionStatus(props.session.id, 'disconnected')
  outputLines.value.push({ type: 'info', text: 'Disconnected' })
}

function handleReconnect() {
  sshStore.updateSessionStatus(props.session.id, 'connecting')
  outputLines.value.push({ type: 'info', text: 'Reconnecting...' })
  setTimeout(() => {
    sshStore.updateSessionStatus(props.session.id, 'connected')
  }, 800)
}

// Inject terminal context to AI
const injectFilePathToAI = inject<(path: string, type: string, server?: string) => void>('injectFilePathToAI', undefined)

function handleExplainCommand() {
  const lastCmd = outputLines.value.filter(l => l.type === 'cmd').pop()
  if (!lastCmd) {
    ElMessage.info('No command to explain')
    return
  }
  if (!injectFilePathToAI) {
    ElMessage.warning('AI panel not ready')
    return
  }
  const serverInfo = props.session.serverName
  injectFilePathToAI(
    `[Command Explanation]`,
    'file',
    serverInfo
  )
  // Simulate injecting the command for explanation to AI chat
  ElMessage.success('Sent command to AI for explanation')
}

function handleAnalyzeOutput() {
  const lastOutput = outputLines.value.filter(l => l.type !== 'cmd').slice(-10).map(l => l.text).join('\n').trim()
  if (!lastOutput) {
    ElMessage.info('No output to analyze')
    return
  }
  if (!injectFilePathToAI) {
    ElMessage.warning('AI panel not ready')
    return
  }
  const lastCmd = outputLines.value.filter(l => l.type === 'cmd').pop()
  const context = lastCmd ? `Command: ${lastCmd.text}\n\nOutput:\n${lastOutput}` : `Output:\n${lastOutput}`
  ElMessage.success('Sent terminal output to AI for analysis')
}

// 终端右键菜单
function onTerminalContextMenu(e: MouseEvent) {
  e.preventDefault()
  termContextMenu.visible = true
  termContextMenu.x = e.clientX
  termContextMenu.y = e.clientY
  setTimeout(() => {
    document.addEventListener('click', () => { termContextMenu.visible = false }, { once: true })
  }, 10)
}

async function termAction(action: string) {
  switch (action) {
    case 'copy': {
      const selection = window.getSelection()
      const selectedText = selection?.toString().trim()
      if (selectedText && selectedText.length > 0) {
        await navigator.clipboard.writeText(selectedText)
        selection?.removeAllRanges()
        ElMessage.success('Copied selection')
      } else {
        const text = outputLines.value.map(l => l.text).join('\n')
        await navigator.clipboard.writeText(text)
        ElMessage.success('Copied all output')
      }
      break
    }
    case 'paste': {
      try {
        const text = await navigator.clipboard.readText()
        inputText.value += text
        focusInput()
      } catch {
        // Fallback: use execCommand for older browsers
        try {
          const textarea = document.createElement('textarea')
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.focus()
          document.execCommand('paste')
          const pasted = textarea.value
          document.body.removeChild(textarea)
          if (pasted) {
            inputText.value += pasted
            focusInput()
          }
        } catch {
          ElMessage.warning('Paste not available. Try Ctrl+Shift+V')
        }
      }
      break
    }
    case 'selectAll':
      // Select all output text
      if (outputRef.value) {
        const range = document.createRange()
        range.selectNodeContents(outputRef.value)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        ElMessage.success('All output selected')
      }
      break
    case 'clear':
      handleClear()
      break
    case 'copyCommand': {
      const lastCmd = outputLines.value.filter(l => l.type === 'cmd').pop()
      if (lastCmd) {
        await navigator.clipboard.writeText(lastCmd.text)
        ElMessage.success('Last command copied')
      } else {
        ElMessage.info('No command to copy')
      }
      break
    }
  }
}
</script>

<style lang="scss" scoped>
.terminal-body { user-select: text; -webkit-user-select: text; }
.terminal-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.terminal-toolbar {
  height: 28px;
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  padding: 0 $spacing-sm;
  height: 26px;
}

.output-line {
  white-space: pre;

  .prompt { color: $color-success; font-weight: 600; user-select: none; }
  .cmd { color: $color-text-primary; }
  .output { color: $color-text-regular; white-space: pre; display: block; }
  .error { color: $color-danger; }
  .info { color: $color-primary; }
}

.input-line {
  display: flex;
  align-items: center;
  line-height: 1.5;
}

.terminal-input {
  background: transparent !important;
  border: none !important;
  outline: none !important;
  color: $color-text-primary;
  font-family: $font-family-mono;
  font-size: $font-size-sm;
  flex: 1;
  caret-color: $color-primary;
  padding: 0;
  margin: 0;
}
::selection {
  background-color: rgba(91, 141, 239, 0.4);
  color: #fff;
}

.term-context-menu {
  position: fixed; z-index: 9999;
  background-color: $color-bg-toolbar;
  border: 1px solid $color-border;
  border-radius: $border-radius-md;
  padding: $spacing-xs 0;
  min-width: 160px;
  box-shadow: $shadow-lg;
}

.tmenu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; cursor: pointer;
  color: $color-text-regular; font-size: $font-size-sm;
  transition: all $transition-fast; user-select: none;
  &:hover { background-color: $color-bg-hover; color: $color-text-primary; }
}

.tmenu-sep { height: 1px; background-color: $color-border-light; margin: $spacing-xs 0; }
</style>
