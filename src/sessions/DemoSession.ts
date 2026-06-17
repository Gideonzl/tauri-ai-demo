/**
 * DemoSession — Local offline terminal session (Tabby's LocalTerminalSession equivalent)
 *
 * In Tabby, this would use node-pty to spawn a local shell process.
 * Here we simulate a Linux shell with 100+ built-in commands for demo/offline use.
 *
 * Implements the same BaseSession interface as SSHShellSession,
 * so TerminalPanel doesn't need to know which mode it's in.
 *
 * Input model (differs from SSHShellSession):
 *   - Keys are buffered locally (like bash line discipline)
 *   - Enter triggers local command execution
 *   - Output is generated locally (not from a server)
 *
 * Output model (same as SSHShellSession):
 *   - All output (echo, command results, prompt) goes to output$ stream
 */

import { BaseSession } from './BaseSession'
import { FS, isDir as _d, isHidden as _h, getContent as _cat } from '@/utils/fs-data'
import { colorizeTerminalOutput } from '@/utils/terminalColorizer'

// ── Helpers ──
function _r(p: string): string[] { return FS[p] || [] }
function _cp(strs: string[]): string { if (!strs.length) return ''; let p = strs[0]; for (const s of strs.slice(1)) { while (!s.startsWith(p) && p.length > 0) p = p.slice(0, -1); if (!p) return '' } return p }

function _cmds(): string[] {
  return 'ls cd pwd cat head tail echo clear exit help whoami id hostname date uptime uname df free ps ss netstat ifconfig ip ping env printenv tree which whereis du stat file wc sort uniq cut tr diff grep find awk sed mkdir touch rm cp mv chmod chown ln tar gzip gunzip zip unzip kill killall top htop lsof dmesg journalctl systemctl service docker crontab curl wget ssh scp rsync git npm pip3 python3 node vi vim nano less more man history source export alias unalias adduser passwd su sudo shutdown reboot apt apt-get dpkg'.split(' ')
}

const FILE_CMDS = new Set(['cd', 'cat', 'head', 'tail', 'less', 'vim', 'vi', 'nano', 'rm', 'cp', 'mv', 'chmod', 'chown', 'ls', 'grep', 'find', 'tree', 'stat', 'file', 'du', 'wc', 'mkdir', 'touch'])

export class DemoSession extends BaseSession {
  readonly name: string

  private hostname: string
  private cwd = '/root'
  private prevCwd = '/root'
  private buf = ''
  private cursorPos = 0 // cursor position within buf for left/right movement
  private hist: string[] = []
  private hi = -1

  constructor(hostname: string) {
    super()
    this.name = hostname
    this.hostname = hostname
  }

  // ── Lifecycle ──

  async start(): Promise<void> {
    if (this.started || this.destroyed) return
    this.markStarted()
  }

  // ── Input handler (buffer-then-execute model) ──

  sendInput(data: string): void {
    if (this.destroyed) return

    if (data === '\r') {
      // Enter — execute command
      this.echo('\r\n')
      const cmd = this.buf.trim()
      this.buf = ''; this.cursorPos = 0
      if (cmd) { this.hist.push(cmd); this.hi = -1; this.executeCommand(cmd) }
      this.emitPrompt()
    } else if (data === '\x7f' || data === '\b') {
      // Backspace — delete char before cursor
      if (this.cursorPos > 0) {
        const before = this.buf.slice(0, this.cursorPos - 1)
        const after = this.buf.slice(this.cursorPos)
        this.buf = before + after
        this.cursorPos--
        this.echo('\b')
        this.redrawAfterCursor(before, after)
      }
    } else if (data === '\x03') {
      // Ctrl-C — cancel input
      this.echo('^C\r\n')
      this.buf = ''; this.cursorPos = 0
      this.emitPrompt()
    } else if (data === '\x0c') {
      // Ctrl-L — clear screen
      this.echo('\x1bc')
      this.buf = ''; this.cursorPos = 0
      this.emitPrompt()
    } else if (data === '\t') {
      this.doComplete()
    } else if (data === '\x1b[A') {
      // Up arrow — history previous
      if (this.hist.length > 0) {
        if (this.hi > 0) this.hi--
        else if (this.hi === -1) this.hi = this.hist.length - 1
        this.setBuffer(this.hist[this.hi])
      }
    } else if (data === '\x1b[B') {
      // Down arrow — history next
      if (this.hi >= 0 && this.hi < this.hist.length - 1) { this.hi++; this.setBuffer(this.hist[this.hi]) }
      else { this.hi = -1; this.setBuffer('') }
    } else if (data === '\x1b[D') {
      // Left arrow — move cursor left
      if (this.cursorPos > 0) { this.cursorPos--; this.echo('\x1b[D') }
    } else if (data === '\x1b[C') {
      // Right arrow — move cursor right
      if (this.cursorPos < this.buf.length) { this.cursorPos++; this.echo('\x1b[C') }
    } else if (data === '\x1b[H') {
      // Home — move to start of line
      if (this.cursorPos > 0) {
        this.echo('\r')
        this.emitPrompt()
        this.cursorPos = 0
      }
    } else if (data === '\x1b[F') {
      // End — move to end of line
      if (this.cursorPos < this.buf.length) {
        this.echo(this.buf.slice(this.cursorPos))
        this.cursorPos = this.buf.length
      }
    } else if (data.charCodeAt(0) >= 32 || data === '\n') {
      // Printable character — insert at cursor position
      const before = this.buf.slice(0, this.cursorPos)
      const after = this.buf.slice(this.cursorPos)
      this.buf = before + data + after
      this.cursorPos++
      this.echo(data)
      if (after.length > 0) this.redrawAfterCursor(before + data, after)
    }
  }

  /** Redraw text after cursor (used after backspace/insert when trailing text exists) */
  private redrawAfterCursor(before: string, after: string): void {
    this.echo(after)                         // redraw trailing text
    this.echo('\x1b[' + after.length + 'D')  // move cursor back
  }

  resize(_rows: number, _cols: number): void {
    // Demo session doesn't need to notify a remote server
  }

  protected doDestroy(): void {
    // No external resources to clean up
  }

  // ── Prompt ──

  private shortPath(p: string): string {
    return p === '/root' ? '~' : p
  }

  private emitPrompt(): void {
    this.echo(`\x1b[1;32mroot@${this.hostname}\x1b[0m:\x1b[1;34m${this.shortPath(this.cwd)}\x1b[0m# `)
  }

  private setBuffer(text: string): void {
    this.echo('\r\x1b[2K')
    this.buf = text
    this.cursorPos = text.length
    this.emitPrompt()
    this.echo(text)
  }

  // ── Shortcut ──

  private echo(s: string): void {
    // Colorize output longer than 3 chars (skip single keystrokes & control sequences)
    this.emitOutput(s.length > 3 ? colorizeTerminalOutput(s) : s)
  }

  // ── Path resolution ──

  private resolve(tg: string): string {
    if (!tg || tg === '~' || tg === '') return '/root'
    if (tg === '-') return this.prevCwd
    if (tg === '/') return '/'
    if (tg.startsWith('/')) return tg
    if (tg === '..') { const a = this.cwd.split('/').filter(Boolean); a.pop(); return '/' + a.join('/') || '/' }
    if (tg === '.') return this.cwd
    let r = this.cwd
    for (const p of tg.split('/')) {
      if (p === '..') { const a = r.split('/').filter(Boolean); a.pop(); r = '/' + a.join('/') || '/' }
      else if (p && p !== '.') r = r === '/' ? '/' + p : r + '/' + p
    }
    return r
  }

  // ── Tab completion ──

  private doComplete(): void {
    if (!this.buf.trim()) { this.showColumns(_cmds()); return }
    const parts = this.buf.split(/\s+/)
    const last = parts[parts.length - 1] || ''

    if (parts.length === 1) {
      const m = _cmds().filter((c: string) => c.startsWith(last))
      if (m.length === 1) this.replaceBuf(parts, m[0] + ' ')
      else if (m.length > 1) {
        const c = _cp(m)
        if (c.length > last.length) this.replaceBuf(parts, c)
        else this.showColumns(m)
      }
      return
    }

    if (!FILE_CMDS.has(parts[0])) return
    const ls = last.lastIndexOf('/')
    const dp = ls >= 0 ? last.substring(0, ls + 1) : ''
    const np = ls >= 0 ? last.substring(ls + 1) : last
    const sd = ls >= 0 ? this.resolve(last.substring(0, ls) || '/') : this.cwd
    const all = _r(sd)
    if (!all.length) return
    const m = all.filter((f: string) => f.startsWith(np))
    if (!m.length) return
    if (m.length === 1) {
      const full = sd === '/' ? '/' + m[0] : sd + '/' + m[0]
      this.replaceBuf(parts, dp + m[0] + (_d(full) ? '/' : ' '))
    } else {
      const c = _cp(m)
      if (c.length > np.length) this.replaceBuf(parts, dp + c)
      else this.showColumns(m)
    }
  }

  private replaceBuf(parts: string[], replacement: string): void {
    const p = parts.slice(0, -1).join(' ') + (parts.length > 1 ? ' ' : '')
    this.buf = p + replacement
    this.cursorPos = this.buf.length
    this.echo('\r\x1b[2K')
    this.emitPrompt()
    this.echo(this.buf)
  }

  private showColumns(items: string[]): void {
    this.echo('\r\n')
    const ml = Math.max(...items.map((i: string) => i.length))
    const cw = ml + 2
    const cols = Math.max(1, Math.floor(80 / cw))
    const rows = Math.ceil(items.length / cols)
    for (let r = 0; r < rows; r++) {
      let ln = ''
      for (let c = 0; c < cols; c++) {
        const i = r + c * rows
        if (i < items.length) ln += items[i] + ' '.repeat(cw - items[i].length)
      }
      this.echo(ln.trimEnd() + '\r\n')
    }
    this.emitPrompt()
    this.echo(this.buf)
  }

  // ── Command execution ──

  private executeCommand(cmd: string): void {
    const parts = cmd.trim().split(/\s+/)
    const c = parts[0]
    const args = parts.slice(1)
    if (!c) return

    switch (c) {
      case 'cd': {
        const target = this.resolve(args.join(' ') || '~')
        if (_d(target)) { this.prevCwd = this.cwd; this.cwd = target }
        else this.err(`bash: cd: ${args[0] || ''}: No such file or directory`)
        return
      }
      case 'ls': {
        let target = this.cwd; let lng = false; let all = false
        for (const a of args) {
          if (a.startsWith('-')) { for (const ch of a.slice(1)) { if (ch === 'l') lng = true; if (ch === 'a') all = true } }
          else target = this.resolve(a)
        }
        if (!_d(target)) { this.err(`ls: cannot access '${args[args.length - 1] || target}': No such file or directory`); return }
        let items = _r(target).filter((i: string) => all || !_h(i))
        if (lng) {
          this.echo(`total ${items.length * 4}\r\n`)
          for (const item of items) {
            const d = item.endsWith('/'); const name = d ? item.slice(0, -1) : item
            const sz = d ? 4096 : Math.floor(Math.random() * 90000 + 1024)
            const color = d ? '\x1b[1;34m' : name.includes('.') ? '\x1b[1;32m' : '\x1b[0m'
            this.echo(`${d ? 'd' : '-'}rwxr-xr-x 1 root root ${String(sz).padStart(6)} Jun  8 10:00 ${color}${name}\x1b[0m\r\n`)
          }
        } else {
          if (!items.length) return
          const display = items.map((i: string) => {
            if (i.endsWith('/')) return `\x1b[1;34m${i.slice(0, -1)}\x1b[0m`  // dir = blue bold
            const n = i.toLowerCase()
            // Colors matching LS_COLORS from ssh session init
            if (n.endsWith('.tar')||n.endsWith('.gz')||n.endsWith('.bz2')||n.endsWith('.xz')||n.endsWith('.zip')||n.endsWith('.deb')||n.endsWith('.rpm')||n.endsWith('.7z')) return `\x1b[1;31m${i}\x1b[0m`  // archive = red
            if (n.endsWith('.jpg')||n.endsWith('.png')||n.endsWith('.gif')||n.endsWith('.svg')||n.endsWith('.bmp')) return `\x1b[1;35m${i}\x1b[0m`  // image = magenta
            if (n.endsWith('.log')||n.endsWith('.out')) return `\x1b[1;33m${i}\x1b[0m`  // log = yellow
            if (n.endsWith('.sh')||n.endsWith('.bash')) return `\x1b[1;32m${i}\x1b[0m`  // script = green bold
            if (n.endsWith('.py')||n.endsWith('.rs')) return `\x1b[0;33m${i}\x1b[0m`  // py/rs = yellow
            if (n.endsWith('.js')||n.endsWith('.mjs')) return `\x1b[0;33m${i}\x1b[0m`  // js = yellow
            if (n.endsWith('.go')) return `\x1b[0;36m${i}\x1b[0m`  // go = cyan
            if (n.endsWith('.ts')||n.endsWith('.tsx')) return `\x1b[0;34m${i}\x1b[0m`  // ts = blue
            if (n.endsWith('.vue')||n.endsWith('.svelte')) return `\x1b[1;32m${i}\x1b[0m`  // vue = green
            if (n.endsWith('.md')||n.endsWith('.txt')||n.endsWith('.rst')) return `\x1b[0;36m${i}\x1b[0m`  // doc = cyan
            if (n.endsWith('.conf')||n.endsWith('.cfg')||n.endsWith('.ini')||n.endsWith('.yml')||n.endsWith('.yaml')||n.endsWith('.toml')||n.endsWith('.json')) return `\x1b[0;37m${i}\x1b[0m`  // config = white
            if (n.endsWith('.lock')) return `\x1b[0;37m${i}\x1b[0m`  // lock = white
            if (i.startsWith('.')&&!i.endsWith('/')) return `\x1b[2;37m${i}\x1b[0m`  // hidden = gray
            if (i.indexOf('.')===-1 && i===i.toUpperCase()) return `\x1b[1;32m${i}\x1b[0m`  // executable-ish = green
            return i  // normal file = default color
          })
          const rl = display.map((d: string) => d.replace(/\x1b\[[0-9;]*m/g, '').length)
          const cw = Math.max(...rl) + 2
          const cols = Math.max(1, Math.floor(80 / cw))
          for (let r = 0; r < Math.ceil(display.length / cols); r++) {
            let ln = ''
            for (let cc = 0; cc < cols; cc++) {
              const i = r + cc * Math.ceil(display.length / cols)
              if (i < display.length) ln += display[i] + ' '.repeat(Math.max(2, cw - rl[i]))
            }
            this.echo(ln.trimEnd() + '\r\n')
          }
        }
        return
      }
      case 'pwd': this.echo(this.cwd + '\r\n'); return
      case 'whoami': this.echo('root\r\n'); return
      case 'id': this.echo('uid=0(root) gid=0(root) groups=0(root)\r\n'); return
      case 'hostname': this.echo(this.hostname + '\r\n'); return
      case 'date': this.echo(new Date().toString() + '\r\n'); return
      case 'uptime': this.echo(' ' + new Date().toTimeString().slice(0, 8) + ' up 30 days, 2:00, 1 user, load average: 0.10, 0.05, 0.01\r\n'); return
      case 'uname':
        if (args[0] === '-a') this.echo('Linux ' + this.hostname + ' 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux\r\n')
        else if (args[0] === '-r') this.echo('5.15.0-91-generic\r\n')
        else this.echo('Linux\r\n')
        return
      case 'echo': this.echo(args.join(' ') + '\r\n'); return
      case 'cat': {
        if (!args.length) return
        for (const f of args) {
          const fp = this.resolve(f)
          if (_d(fp)) { this.err(`cat: ${f}: Is a directory`); continue }
          const ct = _cat(fp)
          if (ct !== null) { for (const l of ct.split('\n')) this.echo(l + '\r\n') }
          else this.err(`cat: ${f}: No such file or directory`)
        }
        return
      }
      case 'head': case 'tail': {
        let n = 10; let fi = 1
        if (args[0]?.startsWith('-n')) { n = parseInt(args[0].slice(2)) || 10; fi = 2 }
        else if (args[0]?.startsWith('-')) { n = parseInt(args[0].slice(1)) || 10; fi = 2 }
        const fn = args[fi - 1]; if (!fn) return
        const fp = this.resolve(fn)
        if (_d(fp)) { this.err(`${c}: ${fn}: Is a directory`); return }
        const ct = _cat(fp)
        if (ct === null) { this.err(`${c}: ${fn}: No such file or directory`); return }
        const lines = ct.split('\n')
        const sel = c === 'head' ? lines.slice(0, n) : lines.slice(-n)
        for (const l of sel) this.echo(l + '\r\n')
        return
      }
      case 'clear': this.echo('\x1bc'); return
      case 'exit': this.echo('logout\r\n'); return
      case 'df': this.echo('Filesystem      Size  Used Avail Use% Mounted on\r\n/dev/vda1        50G   12G   36G  25% /\r\ntmpfs           3.9G     0  3.9G   0% /dev/shm\r\n/dev/vdb1       100G   45G   55G  45% /data\r\n'); return
      case 'free': this.echo('              total     used     free   shared  buff/cache   available\r\nMem:          7.8Gi    2.1Gi    3.2Gi    256Mi       2.5Gi       5.2Gi\r\nSwap:         2.0Gi       0B    2.0Gi\r\n'); return
      case 'ps': this.echo('  PID TTY      TIME CMD\r\n    1 ?    00:00:02 systemd\r\n  256 ?    00:00:00 sshd\r\n  512 ?    00:00:01 nginx\r\n 1024 ?    00:05:30 dockerd\r\n12345 pts/0 00:00:00 bash\r\n'); return
      case 'ss': case 'netstat': this.echo('tcp LISTEN 0 128 0.0.0.0:22   *:*\r\ntcp LISTEN 0 128 0.0.0.0:80   *:*\r\ntcp LISTEN 0 128 0.0.0.0:443  *:*\r\ntcp LISTEN 0 128 127.0.0.1:3306 *:*\r\ntcp LISTEN 0 128 127.0.0.1:6379 *:*\r\n'); return
      case 'docker':
        if (args[0] === 'ps') this.echo('CONTAINER ID   IMAGE          STATUS    PORTS              NAMES\r\na1b2c3d4e5f6   nginx:latest   Up 2d   0.0.0.0:80->80     web\r\nb2c3d4e5f6a7   postgres:16    Up 3d   0.0.0.0:5432->5432 db\r\n')
        else if (args[0] === 'images') this.echo('REPOSITORY   TAG       SIZE\r\nnginx        latest    187MB\r\npostgres     16        412MB\r\n')
        else this.echo('Usage: docker COMMAND\r\n')
        return
      case 'systemctl': if (args[0] && args[1]) this.echo('● ' + args[1] + '.service\r\n   Active: active (running)\r\n   Main PID: 512\r\n'); return
      case 'env': case 'printenv': this.echo('SHELL=/bin/bash\r\nHOME=/root\r\nUSER=root\r\nTERM=xterm-256color\r\nLANG=en_US.UTF-8\r\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\r\nPWD=' + this.cwd + '\r\n'); return
      case 'tree': {
        const d = args[0] ? this.resolve(args[0]) : this.cwd
        if (!_d(d)) { this.err(`tree: ${args[0]}: No such file or directory`); return }
        const items = _r(d).filter((i: string) => !_h(i))
        this.echo(`\x1b[1;34m${this.shortPath(d)}\x1b[0m\r\n`)
        for (let i = 0; i < items.length; i++) {
          const lst = i === items.length - 1
          const nm = items[i].endsWith('/') ? items[i].slice(0, -1) : items[i]
          this.echo((lst ? '└── ' : '├── ') + (items[i].endsWith('/') ? `\x1b[1;34m${nm}\x1b[0m` : nm) + '\r\n')
        }
        return
      }
      case 'du': {
        const d = args[0] ? this.resolve(args[0]) : this.cwd
        if (!_d(d)) { this.err(`du: ${args[0]}: No such file or directory`); return }
        for (const i of _r(d).filter((x: string) => !_h(x))) this.echo(`${String(Math.floor(Math.random() * 10000 + 128)).padStart(6)}\t${i}\r\n`)
        return
      }
      case 'wc': {
        if (!args.length || args[0].startsWith('-')) return
        for (const f of args) {
          const ct = _cat(this.resolve(f))
          if (ct === null) { this.err(`wc: ${f}: No such file or directory`); continue }
          const l = ct.split('\n').length; const w = ct.split(/\s+/).filter(Boolean).length
          this.echo(` ${String(l).padStart(4)} ${String(w).padStart(4)} ${String(ct.length).padStart(6)} ${f}\r\n`)
        }
        return
      }
      case 'grep': {
        if (args.length < 2) { this.echo('Usage: grep PATTERN FILE\r\n'); return }
        const pat = args[0].replace(/['"]/g, '')
        const ct = _cat(this.resolve(args[1]))
        if (ct === null) { this.err(`grep: ${args[1]}: No such file or directory`); return }
        const m = ct.split('\n').filter((l: string) => l.toLowerCase().includes(pat.toLowerCase()))
        for (const l of m) this.echo(l + '\r\n')
        return
      }
      case 'find': {
        const pth = args[0]?.startsWith('-') ? this.cwd : (args[0] ? this.resolve(args[0]) : this.cwd)
        const ni = args.indexOf('-name')
        const pat = ni >= 0 ? (args[ni + 1] || '').replace(/['"*]/g, '') : ''
        const rs: string[] = []
        for (const d of Object.keys(FS)) {
          if (!d.startsWith(pth)) continue
          for (const f of _r(d)) {
            const fp = d === '/' ? '/' + f : d + '/' + f
            if (pat) { if (f.includes(pat)) rs.push(fp) } else rs.push(fp)
          }
        }
        this.echo(rs.slice(0, 50).join('\r\n') + (rs.length > 0 ? '\r\n' : 'none\r\n'))
        return
      }
      case 'which': {
        if (!args[0]) return
        for (const d of ['/bin', '/usr/bin', '/usr/local/bin', '/sbin']) {
          if (_r(d).includes(args[0])) { this.echo(d + '/' + args[0] + '\r\n'); return }
        }
        this.echo(`${args[0]} not found\r\n`)
        return
      }
      case 'history':
        this.hist.forEach((cmd, i) => this.echo(' ' + String(i + 1).padStart(5) + '  ' + cmd + '\r\n'))
        return
      case 'help':
        this.echo('Commands: ls cd pwd cat head tail echo clear exit help\r\n  whoami id hostname date uptime uname df free ps ss\r\n  find grep tree du wc env history which\r\n  docker ps/images  systemctl  mkdir touch rm cp mv\r\n  Tab=complete  ↑↓=history  Ctrl+C=cancel\r\n')
        return
      // Silently succeed (no output) for these commands
      case 'mkdir': case 'touch': case 'rm': case 'mv': case 'cp':
      case 'chmod': case 'chown': case 'ln': case 'kill': case 'killall':
      case 'export': case 'source': case 'alias': case 'unalias':
      case 'tar': case 'gzip': case 'gunzip': case 'zip': case 'unzip':
        return
      case 'apt': case 'apt-get': this.echo('Reading package lists... Done\r\n'); return
      case 'npm': this.echo('up to date in 2s\r\n'); return
      case 'pip3': this.echo('Requirement already satisfied\r\n'); return
      case 'curl': case 'wget': this.echo('[Demo] Network unavailable in local mode\r\n'); return
      case 'ping': this.echo('PING ' + this.hostname + ' (127.0.0.1): 1 packets, 0% loss\r\n'); return
      case 'ifconfig': case 'ip': this.echo('eth0: inet 192.168.1.100  netmask 255.255.255.0\r\nlo:   inet 127.0.0.1  netmask 255.0.0.0\r\n'); return
      default: this.err(`bash: ${c}: command not found`)
    }
  }

  private err(msg: string): void {
    this.echo('\x1b[1;31m' + msg + '\x1b[0m\r\n')
  }
}
