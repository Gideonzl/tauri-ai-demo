<template><div class="tp"><div class="tb" ref="tbr"></div></div></template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, inject, computed } from 'vue'
import type { Ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useSshStore } from '@/stores/ssh'
import { FS, isDir as _d, isHidden as _h, getContent as _cat } from '@/utils/fs-data'

const props = defineProps<{ session?: any }>()
const emit = defineEmits<{ cwdChange: [path: string] }>()
const sshStore = useSshStore()
const qc = inject<Ref<string>>('quickCommandToExecute', ref(''))
watch(qc, (v) => { if (v?.trim() && xterm) { _in(v.trim() + '\r'); nextTick(() => { (qc as any).value = '' }) } })

const tbr = ref<HTMLElement>()
let xterm: Terminal | null = null
let fit: FitAddon | null = null
let buf = ''; let cwd = '/root'; let prevCwd = '/root'
let hist: string[] = []; let hi = -1

const srvName = computed(() => {
  if (props.session?.serverId) { const s = sshStore.servers.find((x: any) => x.id === props.session.serverId); if (s) return s.host || s.name || 'demo' }
  return 'demo'
})

function _r(p: string): string[] { return FS[p] || [] }

// === Tab complete ===
function _tab(): void {
  const t = xterm; if (!t) return
  if (!buf.trim()) { _sc(_cmds()); return }
  const parts = buf.split(/\s+/); const last = parts[parts.length-1]||''
  if (parts.length===1) {
    const m = _cmds().filter((c: string) => c.startsWith(last))
    if (m.length===1) _rb(parts, m[0]+' ')
    else if (m.length>1) { const c = _cp(m); if (c.length>last.length) _rb(parts,c); else _sc(m) }
    return
  }
  const fc = ['cd','cat','head','tail','less','vim','vi','nano','rm','cp','mv','chmod','chown','ls','grep','find','tree','stat','file','du','wc','mkdir','touch']
  if (!fc.includes(parts[0])) return
  const ls = last.lastIndexOf('/'); const dp = ls>=0 ? last.substring(0,ls+1) : ''
  const np = ls>=0 ? last.substring(ls+1) : last; const sd = ls>=0 ? _resolve(last.substring(0,ls)||'/') : cwd
  const all = _r(sd); if (!all.length) return
  const m = all.filter((f: string) => f.startsWith(np))
  if (!m.length) return
  if (m.length===1) { const full = sd==='/'?'/'+m[0]:sd+'/'+m[0]; _rb(parts, dp+m[0]+(_d(full)?'/':' ')) }
  else { const c = _cp(m); if (c.length>np.length) _rb(parts, dp+c); else _sc(m) }
}
function _rb(parts: string[], r: string): void { const t = xterm; if (!t) return; const p = parts.slice(0,-1).join(' ')+(parts.length>1?' ':''); buf = p+r; t.write('\r\x1b[2K'+_pr()+buf) }
function _sc(items: string[]): void {
  const t = xterm; if (!t) return; t.write('\r\n')
  const ml = Math.max(...items.map((i: string) => i.length)); const cw = ml+2
  const cols = Math.max(1,Math.floor((t.cols||80)/cw)); const rows = Math.ceil(items.length/cols)
  for (let r=0;r<rows;r++){let ln='';for(let c=0;c<cols;c++){const i=r+c*rows;if(i<items.length)ln+=items[i]+' '.repeat(cw-items[i].length)}t.writeln(ln.trimEnd())}
  t.write(_pr()+buf)
}
function _resolve(tg: string): string {
  if (!tg||tg==='~'||tg==='') return '/root'; if (tg==='-') return prevCwd; if (tg==='/') return '/'
  if (tg.startsWith('/')) return tg
  if (tg==='..') { const a=cwd.split('/').filter(Boolean);a.pop();return '/'+a.join('/')||'/' }
  if (tg==='.') return cwd
  let r=cwd; for(const p of tg.split('/')){if(p==='..'){const a=r.split('/').filter(Boolean);a.pop();r='/'+a.join('/')||'/'}else if(p&&p!=='.') r=r==='/'?'/'+p:r+'/'+p}
  return r
}
function _cp(strs: string[]): string { if(!strs.length)return'';let p=strs[0];for(const s of strs.slice(1)){while(!s.startsWith(p)&&p.length>0)p=p.slice(0,-1);if(!p)return''}return p }
function _sp(p: string): string { return p==='/root'?'~':p }
function _pr(): string { return `\x1b[1;32mroot@${srvName.value}\x1b[0m:\x1b[1;34m${_sp(cwd)}\x1b[0m# ` }
function _cmds(): string[] { return 'ls cd pwd cat head tail echo clear exit help whoami id hostname date uptime uname df free ps ss netstat ifconfig ip ping env printenv tree which whereis du stat file wc sort uniq cut tr diff grep find awk sed mkdir touch rm cp mv chmod chown ln tar gzip gunzip zip unzip kill killall top htop lsof dmesg journalctl systemctl service docker crontab curl wget ssh scp rsync git npm pip3 python3 node vi vim nano less more man history source export alias unalias adduser passwd su sudo shutdown reboot apt apt-get dpkg'.split(' ') }

// === Execute ===
function _ex(cmd: string): void {
  const t = xterm; if (!t) return
  const parts = cmd.trim().split(/\s+/); const c = parts[0]; const args = parts.slice(1)
  if (!c) return
  if (cmd.trim()) { hist.push(cmd.trim()); hi = -1 }
  switch (c) {
    case 'cd': { const target = _resolve(args.join(' ')||'~'); if (_d(target)) { prevCwd = cwd; cwd = target; emit('cwdChange',cwd) } else t.writeln(`\x1b[1;31mbash: cd: ${args[0]||''}: No such file or directory\x1b[0m`); return }
    case 'ls': {
      let target=cwd; let lng=false; let all=false
      for (const a of args) { if (a.startsWith('-')) { for (const ch of a.slice(1)) { if (ch==='l')lng=true; if (ch==='a')all=true } } else target=_resolve(a) }
      if (!_d(target)) { t.writeln(`\x1b[1;31mls: cannot access '${args[args.length-1]||target}': No such file or directory\x1b[0m`); return }
      let items = _r(target).filter((i: string) => all || !_h(i))
      if (lng) { t.writeln(`total ${items.length*4}`); for (const item of items) { const d=item.endsWith('/'); const name=d?item.slice(0,-1):item; const sz=d?4096:Math.floor(Math.random()*90000+1024); t.writeln(`${d?'d':'-'}rwxr-xr-x 1 root root ${String(sz).padStart(6)} Jun  8 10:00 ${name}`) } }
      else { if (!items.length) return; const display = items.map((i: string) => i.endsWith('/')?`\x1b[1;34m${i.slice(0,-1)}\x1b[0m`:i); const rl = display.map((d: string) => d.replace(/\x1b\[[0-9;]*m/g,'').length); const cw = Math.max(...rl)+2; const cols = Math.max(1,Math.floor((t.cols||80)/cw)); for (let r=0;r<Math.ceil(display.length/cols);r++){let ln='';for(let c=0;c<cols;c++){const i=r+c*Math.ceil(display.length/cols);if(i<display.length)ln+=display[i]+' '.repeat(Math.max(2,cw-rl[i]))}t.writeln(ln.trimEnd())} }
      return
    }
    case 'pwd': t.writeln(cwd); return
    case 'whoami': t.writeln('root'); return
    case 'id': t.writeln('uid=0(root) gid=0(root) groups=0(root)'); return
    case 'hostname': t.writeln(srvName.value); return
    case 'date': t.writeln(new Date().toString()); return
    case 'uptime': t.writeln(' '+new Date().toTimeString().slice(0,8)+' up 30 days, 2:00, 1 user, load average: 0.10, 0.05, 0.01'); return
    case 'uname': if(args[0]==='-a')t.writeln('Linux '+srvName.value+' 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux'); else if(args[0]==='-r')t.writeln('5.15.0-91-generic'); else t.writeln('Linux'); return
    case 'echo': t.writeln(args.join(' ')); return
    case 'cat': { if(!args.length)return; for(const f of args){const fp=_resolve(f);if(_d(fp)){t.writeln(`\x1b[1;31mcat: ${f}: Is a directory\x1b[0m`);continue};const ct=_cat(fp);if(ct!==null){for(const l of ct.split('\n'))t.writeln(l)}else t.writeln(`\x1b[1;31mcat: ${f}: No such file or directory\x1b[0m`)} return }
    case 'head':case 'tail':{let n=10,fi=1;if(args[0]?.startsWith('-n')){n=parseInt(args[0].slice(2))||10;fi=2}else if(args[0]?.startsWith('-')){n=parseInt(args[0].slice(1))||10;fi=2};const fn=args[fi-1];if(!fn)return;const fp=_resolve(fn);if(_d(fp)){t.writeln(`\x1b[1;31m${c}: ${fn}: Is a directory\x1b[0m`);return};const ct=_cat(fp);if(ct===null){t.writeln(`\x1b[1;31m${c}: ${fn}: No such file or directory\x1b[0m`);return};const lines=ct.split('\n');const sel=c==='head'?lines.slice(0,n):lines.slice(-n);for(const l of sel)t.writeln(l);return}
    case 'clear': t.clear(); return
    case 'exit': t.writeln('logout'); return
    case 'df': t.writeln('Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        50G   12G   36G  25% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm\n/dev/vdb1       100G   45G   55G  45% /data'); return
    case 'free': t.writeln('              total     used     free   shared  buff/cache   available\nMem:          7.8Gi    2.1Gi    3.2Gi    256Mi       2.5Gi       5.2Gi\nSwap:         2.0Gi       0B    2.0Gi'); return
    case 'ps': t.writeln('  PID TTY      TIME CMD\n    1 ?    00:00:02 systemd\n  256 ?    00:00:00 sshd\n  512 ?    00:00:01 nginx\n 1024 ?    00:05:30 dockerd\n12345 pts/0 00:00:00 bash'); return
    case 'ss':case 'netstat': t.writeln('tcp LISTEN 0 128 0.0.0.0:22   *:*\ntcp LISTEN 0 128 0.0.0.0:80   *:*\ntcp LISTEN 0 128 0.0.0.0:443  *:*\ntcp LISTEN 0 128 127.0.0.1:3306 *:*\ntcp LISTEN 0 128 127.0.0.1:6379 *:*'); return
    case 'docker': if(args[0]==='ps')t.writeln('CONTAINER ID   IMAGE          STATUS    PORTS              NAMES\na1b2c3d4e5f6   nginx:latest   Up 2d   0.0.0.0:80->80     web\nb2c3d4e5f6a7   postgres:16    Up 3d   0.0.0.0:5432->5432 db');else if(args[0]==='images')t.writeln('REPOSITORY   TAG       SIZE\nnginx        latest    187MB\npostgres     16        412MB');else t.writeln('Usage: docker COMMAND'); return
    case 'systemctl': if(args[0]&&args[1])t.writeln('● '+args[1]+'.service\n   Active: active (running)\n   Main PID: 512'); return
    case 'env':case 'printenv': t.writeln('SHELL=/bin/bash\nHOME=/root\nUSER=root\nTERM=xterm-256color\nLANG=en_US.UTF-8\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nPWD='+cwd); return
    case 'tree': { const d=args[0]?_resolve(args[0]):cwd; if(!_d(d)){t.writeln(`\x1b[1;31mtree: ${args[0]}: No such file or directory\x1b[0m`);return}; const items=_r(d).filter((i:string)=>!_h(i)); t.writeln(`\x1b[1;34m${_sp(d)}\x1b[0m`); for(let i=0;i<items.length;i++){const lst=i===items.length-1;const nm=items[i].endsWith('/')?items[i].slice(0,-1):items[i];t.writeln((lst?'└── ':'├── ')+(items[i].endsWith('/')?`\x1b[1;34m${nm}\x1b[0m`:nm))}; return }
    case 'du': { const d=args[0]?_resolve(args[0]):cwd; if(!_d(d)){t.writeln(`\x1b[1;31mdu: ${args[0]}: No such file or directory\x1b[0m`);return}; for(const i of _r(d).filter((x:string)=>!_h(x)))t.writeln(`${String(Math.floor(Math.random()*10000+128)).padStart(6)}\t${i}`); return }
    case 'wc': { if(!args.length||args[0].startsWith('-'))return; for(const f of args){const ct=_cat(_resolve(f));if(ct===null){t.writeln(`\x1b[1;31mwc: ${f}: No such file or directory\x1b[0m`);continue};const l=ct.split('\n').length;const w=ct.split(/\s+/).filter(Boolean).length;t.writeln(` ${String(l).padStart(4)} ${String(w).padStart(4)} ${String(ct.length).padStart(6)} ${f}`)}; return }
    case 'grep': { if(args.length<2){t.writeln('Usage: grep PATTERN FILE');return};const pat=args[0].replace(/['"]/g,'');const ct=_cat(_resolve(args[1]));if(ct===null){t.writeln(`\x1b[1;31mgrep: ${args[1]}: No such file or directory\x1b[0m`);return};const m=ct.split('\n').filter((l:string)=>l.toLowerCase().includes(pat.toLowerCase()));for(const l of m)t.writeln(l); return }
    case 'find': { const pth=args[0]?.startsWith('-')?cwd:(args[0]?_resolve(args[0]):cwd); const ni=args.indexOf('-name');const pat=ni>=0?(args[ni+1]||'').replace(/['"*]/g,''):''; const rs:string[]=[]; for(const d of Object.keys(FS)){if(!d.startsWith(pth))continue;for(const f of _r(d)){const fp=d==='/'?'/'+f:d+'/'+f;if(pat){if(f.includes(pat))rs.push(fp)}else rs.push(fp)}}; t.writeln(rs.slice(0,50).join('\n')||'none'); return }
    case 'which': { if(!args[0])return; for(const d of['/bin','/usr/bin','/usr/local/bin','/sbin']){if(_r(d).includes(args[0])){t.writeln(d+'/'+args[0]);return}}; t.writeln(`${args[0]} not found`); return }
    case 'history': hist.forEach((cmd,i)=>t.writeln(' '+String(i+1).padStart(5)+'  '+cmd)); return
    case 'help': t.writeln('Commands: ls cd pwd cat head tail echo clear exit help\n  whoami id hostname date uptime uname df free ps ss\n  find grep tree du wc env history which\n  docker ps/images  systemctl  mkdir touch rm cp mv\n  Tab=complete  ↑↓=history  Ctrl+C=cancel'); return
    case 'mkdir':case'touch':case'rm':case'mv':case'cp':case'chmod':case'chown':case'ln':case'kill':case'killall':case'export':case'source':case'alias':case'unalias':case'tar':case'gzip':case'gunzip':case'zip':case'unzip': return
    case 'apt':case'apt-get': t.writeln('Reading package lists... Done'); return
    case 'npm': t.writeln('up to date in 2s'); return
    case 'pip3': t.writeln('Requirement already satisfied'); return
    case 'curl':case'wget': t.writeln('[Demo] Network unavailable in local mode'); return
    case 'ping': t.writeln('PING '+srvName.value+' (127.0.0.1): 1 packets, 0% loss'); return
    case 'ifconfig':case'ip': t.writeln('eth0: inet 192.168.1.100  netmask 255.255.255.0\nlo:   inet 127.0.0.1  netmask 255.0.0.0'); return
    default: t.writeln(`\x1b[1;31mbash: ${c}: command not found\x1b[0m`)
  }
}

// === Input ===
function _in(data: string): void {
  const t = xterm; if (!t) return
  if (data==='\r'){t.write('\r\n');const cmd=buf.trim();buf='';if(cmd)_ex(cmd);t.write(_pr())}
  else if(data==='\x7f'||data==='\b'){if(buf.length>0){buf=buf.slice(0,-1);t.write('\b \b')}}
  else if(data==='\x03'){t.write('^C\r\n');buf='';t.write(_pr())}
  else if(data==='\x0c'){t.clear();t.write(_pr());buf=''}
  else if(data==='\t'){_tab()}
  else if(data==='\x1b[A'){if(hist.length>0&&hi>0){hi--;_sb(hist[hi])}else if(hist.length>0&&hi===-1){hi=hist.length-1;_sb(hist[hi])}}
  else if(data==='\x1b[B'){if(hi>=0&&hi<hist.length-1){hi++;_sb(hist[hi])}else{hi=-1;_sb('')}}
  else if(data.charCodeAt(0)>=32){buf+=data;t.write(data)}
}
function _sb(text: string): void { const t=xterm;if(!t)return;buf=text;t.write('\r\x1b[2K'+_pr()+text) }

// === Lifecycle ===
let ro: ResizeObserver|null=null
onMounted(() => {
  nextTick(()=>{
    const el=tbr.value;if(!el)return
    xterm=new Terminal({
      fontSize:13,fontFamily:"'JetBrains Mono','Fira Code','Consolas',monospace",
      theme:{background:'#0d0d1a',foreground:'#e8e8f0',cursor:'#5b8def',cursorAccent:'#0d0d1a',
        selectionBackground:'rgba(91,155,213,0.35)',selectionForeground:'#fff',
        black:'#1a1a2e',red:'#ff5370',green:'#c3e88d',yellow:'#ffcb6b',blue:'#82aaff',magenta:'#c792ea',cyan:'#89ddff',white:'#e8e8f0',
        brightBlack:'#444460',brightRed:'#ff5370',brightGreen:'#c3e88d',brightYellow:'#ffcb6b',brightBlue:'#82aaff',brightMagenta:'#c792ea',brightCyan:'#89ddff',brightWhite:'#fff'},
      cursorBlink:true,cursorStyle:'bar',scrollback:10000,cols:80,rows:24,
    })
    fit=new FitAddon();xterm.loadAddon(fit);xterm.open(el);fit.fit()
    setTimeout(()=>xterm?.focus(),80)
    xterm.element?.addEventListener('click',()=>xterm?.focus())
    xterm.onData((d:string)=>_in(d))
    const h=srvName.value
    xterm.writeln(`\x1b[1;36m╔══════════════════════════════════════════╗\x1b[0m`)
    xterm.writeln(`\x1b[1;36m║\x1b[0m  \x1b[1;37mTauri AI Demo — Terminal\x1b[0m`)
    xterm.writeln(`\x1b[1;36m║\x1b[0m  \x1b[2;37mroot@${h}\x1b[0m`)
    xterm.writeln(`\x1b[1;36m║\x1b[0m  \x1b[2;37mTab=complete  ↑↓=history  help\x1b[0m`)
    xterm.writeln(`\x1b[1;36m╚══════════════════════════════════════════╝\x1b[0m`)
    xterm.writeln('');xterm.write(_pr())
  })
  ro=new ResizeObserver(()=>fit?.fit())
  if(tbr.value)ro.observe(tbr.value)
})
watch(()=>props.session?.status,(st)=>{if(!xterm)return;if(st==='error'){xterm.clear();xterm.writeln('\x1b[1;31m══════════════════════════════════════════\x1b[0m');xterm.writeln('\x1b[1;31m  SSH Connection Failed\x1b[0m');xterm.writeln(`\x1b[1;31m  ${props.session?.error||'Unknown error'}\x1b[0m`);xterm.writeln('\x1b[1;31m  Check host credentials\x1b[0m');xterm.writeln('\x1b[1;31m══════════════════════════════════════════\x1b[0m')}else if(st==='connected'){xterm.clear();xterm.writeln(`\x1b[1;36mConnected to ${srvName.value}\x1b[0m`);xterm.writeln('');xterm.write(_pr())}})
onUnmounted(()=>{ro?.disconnect();xterm?.dispose();xterm=null})
</script>
<style scoped>.tp{height:100%;width:100%;background:#0d0d1a;display:flex;flex-direction:column}.tb{flex:1;overflow:hidden;padding:4px 8px}</style>
