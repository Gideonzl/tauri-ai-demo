<!--
  TerminalPanel — Thin connector component
  Tabby equivalent: BaseTerminalTabComponent

  Architecture:
    XTermFrontend ←─(Observable streams)──→ BaseSession
                                              ├── SSHShellSession  (real server, PTY)
                                              └── DemoSession      (offline, local sim)

  This component only WIRES the streams. All logic lives in sessions/ and frontends/.
-->
<template>
<div class="tp">
  <div class="tbar">
    <span class="tdot" :class="status"></span>
    <b>{{ srvName }}</b>
    <span class="tbadge" :class="isReal ? 'real' : 'demo'">{{ isReal ? 'REAL' : 'DEMO' }}</span>
    <span v-if="isReal" class="tpty">PTY</span>
    <span class="tstatus">{{ status }}</span>
  </div>
  <div class="tb" ref="tbr" @contextmenu.prevent="onTermContextMenu"></div>

  <!-- 终端右键菜单 — 复用全局 ctx-menu/ctx-item/ctx-sep 样式，与文件树右键 1:1 一致 -->
  <div v-if="tmenu.visible" class="ctx-menu" :style="{ left: tmenu.x + 'px', top: tmenu.y + 'px' }">
    <div class="ctx-item" @click="tmenuAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('common.copy') }}</span></div>
    <div class="ctx-item" @click="tmenuAct('paste')"><el-icon :size="13"><DocumentCopy /></el-icon><span>{{ t('common.paste') }}</span></div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" @click="tmenuAct('selectAll')"><el-icon :size="13"><Select /></el-icon><span>{{ t('common.selectAll') }}</span></div>
    <div class="ctx-item" @click="tmenuAct('clear')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('common.clear') }}</span></div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" @click.stop="tmenu.showEmoji = !tmenu.showEmoji"><el-icon :size="13"><Sunny /></el-icon><span>{{ t('common.emoji') }}</span></div>
  </div>

  <!-- Emoji 弹出面板 -->
  <div v-if="tmenu.showEmoji && tmenu.visible" class="emoji-panel" :style="{ left: (tmenu.x + 190) + 'px', top: tmenu.y + 'px' }">
    <div class="emoji-grid">
      <span v-for="e in emojiList" :key="e" class="emoji-item" @click="insertEmoji(e)" :title="e">{{ e }}</span>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import type { Ref } from 'vue'
import { CopyDocument, DocumentCopy, Select, Delete, Sunny } from '@element-plus/icons-vue'
import { useSshStore } from '@/stores/ssh'
import { useConfigStore } from '@/stores/config'
import { useTerminalSettingsStore } from '@/stores/terminalSettings'
import { XTermFrontend } from '@/frontends/XTermFrontend'
import { BaseSession } from '@/sessions/BaseSession'
import { SSHShellSession } from '@/sessions/SSHShellSession'
import { DemoSession } from '@/sessions/DemoSession'
import { Subject } from '@/sessions/Observable'
import { useContextMenu } from '@/composables/useContextMenu'
import { useLocale } from '@/composables/useLocale'
import { useOperationRecordsStore } from '@/stores/operationRecords'
import { TerminalCommandCapture } from '@/utils/terminal-command-capture'
import { formatOperationForAi } from '@/utils/operation-records'

// ── Props, Emits, Store ──
const { t } = useLocale()
const operationRecords = useOperationRecordsStore()
const props = defineProps<{ session?: any }>()
const emit = defineEmits<{ cwdChange: [path: string] }>()
const sshStore = useSshStore()
const configStore = useConfigStore()
const termSettings = useTerminalSettingsStore()
const sendTerminalToAI = inject<(text: string, serverInfo?: string) => Promise<boolean>>('sendTerminalToAI')

// ── Quick command injection (from parent WorkspaceView) ──
// Route through frontend.input$ so it's echoed AND recorded to history (like typing).
const qc = inject<Ref<string>>('quickCommandToExecute', ref(''))
watch(qc, (v) => {
  if (v?.trim() && frontend) {
    frontend.input$.next(v.trim() + '\r')
    nextTick(() => { (qc as any).value = '' })
  }
})

// ── Cross-view command injection (from History / other views via store) ──
// Only the active session's panel runs it; routed through input$ so it records to history.
watch(() => sshStore.injectCommandSeq, () => {
  if (props.session?.id !== sshStore.activeSessionId) return
  const cmd = sshStore.injectedCommand
  if (cmd?.trim() && frontend) frontend.input$.next(cmd.trim() + '\r')
})

// ── Template refs ──
const tbr = ref<HTMLElement>()

// ── Terminal context menu (复用 global.scss 的 ctx-menu/ctx-item/ctx-sep 样式) ──
const tmenu = reactive({ visible: false, x: 0, y: 0, showEmoji: false })

const { register, unregister } = useContextMenu()

function onTermContextMenu(e: MouseEvent) {
  tmenu.x = e.clientX
  tmenu.y = e.clientY
  tmenu.showEmoji = false
  tmenu.visible = true
}

function hideTermMenu() { tmenu.visible = false; tmenu.showEmoji = false }

function tmenuAct(action: string) {
  hideTermMenu()
  if (!frontend) return
  switch (action) {
    case 'copy': frontend.copySelection(); break
    case 'paste': frontend.paste().then(() => frontend?.focus()); break
    case 'selectAll': frontend.selectAll(); break
    case 'clear': frontend.clear(); break
  }
}

// Common emoji list for terminal use
const emojiList = [
  '😀','😂','🤣','😊','😍','🥰','😎','🤔','😢','😡','👍','👎','✅','❌','❤️','🔥','⭐','💯',
  '😃','😄','😁','😅','🤩','😇','🙂','😉','😌','🥲','😋','😜','🤪','🧐','🤓','😏','😒','😞',
  '😔','😟','😣','😫','😤','🤬','😱','😨','😰','😥','😓','🤗','😶','😑','😬','🙄','😴','🤤',
  '👏','🤝','💪','🙏','✋','👋','👆','👇','👈','👉','✨','🌟','💫','🎉','🎊','🏆','🥇','💀',
  '📁','📂','📝','🔍','🔑','🔒','💰','💎','⚙️','🔧','📌','✂️','📋','📎','📏','🔖','🧷','💡',
  '💻','🖥️','⌨️','🖱️','📱','🔋','🔌','🌐','📡','💾','🎧','🎤','🛜','📟','🧮','🖨️','💿','📀',
  '🍎','🍕','🍔','☕','🍺','🎂','🍿','🥤','🧃','🧊','🍩','🍪','🥜','🍫','🍾','🍷','🥂','🥃',
  '▶️','⏸️','⏹️','⏺️','⏭️','⏮️','🔀','🔁','🔂','🔄','⬆️','⬇️','⬅️','➡️','↗️','↘️','↙️','↖️',
]

function insertEmoji(emoji: string) {
  if (!frontend) return
  frontend.input$.next(emoji)
  tmenu.showEmoji = false
  tmenu.visible = false
  frontend.focus()
}

// ── Independent operation recording ──
let cmdBuffer = ''

const capture = new TerminalCommandCapture({
  onComplete: (input) => {
    try {
      const record = operationRecords.addRecord(input)
      frontend?.addOperationAction(record.id, () => {
        void sendTerminalToAI?.(formatOperationForAi(record), record.serverName)
      })
    } catch (error) {
      console.warn('[TerminalPanel] operation record could not be saved:', error)
    }
  },
})

function captureInput(data: string) {
  if (data === '\x03') {
    capture.interrupt()
    return
  }
  for (const ch of data) {
    if (ch === '\r') {
      const cmd = cmdBuffer.trim()
      if (cmd && props.session) {
        capture.submit(cmd, {
          serverId: props.session.serverId,
          serverName: props.session.serverName || srvName.value,
          sessionId: props.session.realSessionId,
        })
      }
      cmdBuffer = ''
    } else if (ch === '\x7f' || ch === '\b') {
      // Backspace — remove last char
      cmdBuffer = cmdBuffer.slice(0, -1)
    } else if (ch === '\x1b') {
      // ANSI escape sequence start — skip until terminated
      // (simplified: just ignore the escape char itself)
    } else if (ch.charCodeAt(0) >= 32) {
      // Printable character
      cmdBuffer += ch
    }
  }
}

// ── Core objects — one fixed session per TerminalPanel instance ──
let frontend: XTermFrontend | null = null
let session: BaseSession | null = null
let subs: ReturnType<typeof Subject.combine> | null = null

function formatPtyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const detail = error as { message?: unknown; source?: unknown; error_code?: unknown }
    const message = typeof detail.message === 'string' ? detail.message : ''
    const source = typeof detail.source === 'string' ? detail.source : ''
    const code = detail.error_code === undefined ? '' : ` [${String(detail.error_code)}]`
    if (message || source) return `${message}${source ? ` (${source})` : ''}${code}`.trim()
    try { return JSON.stringify(error) } catch { return 'Unknown PTY error' }
  }
  return String(error || 'Unknown PTY error')
}

// ── Display state — always bind this panel to its own session ──
const srvName = computed(() => {
  const sid = props.session?.serverId
  if (sid) {
    const s = sshStore.servers.find((x: any) => x.id === sid)
    if (s) return s.host || s.name || 'demo'
  }
  return 'demo'
})
const isReal = computed(() => !!props.session?.realSessionId)
const status = computed(() => props.session?.status || '')
const isPanelActive = computed(() => props.session?.id === sshStore.activeSessionId)

function wireSessionStreams(activeSession: BaseSession): void {
  if (!frontend) return

  // Subscribe before a real shell is opened. A server can send its MOTD and
  // prompt immediately after accepting the shell request; wiring afterwards
  // loses that first output because Subject intentionally does not replay it.
  subs = Subject.combine(
    frontend.input$.subscribe((data: string) => {
      activeSession.sendInput(data)
      captureInput(data)
    }),

    activeSession.output$.subscribe((data: string) => {
      frontend!.write(data, () => {
        try { capture.append(data) } catch (error) {
          console.warn('[TerminalPanel] terminal output capture failed:', error)
        }
      })
    }),

    frontend.resize$.subscribe(({ rows, cols }: { rows: number; cols: number }) => {
      activeSession.resize(rows, cols)
    })
  )

  // Cleanup when the session destroys itself (e.g., server disconnect).
  activeSession.destroyed$.subscribe(() => {
    capture.flush()
    subs?.unsubscribe()
    subs = null
  })
}

// ── Session factory ──
async function createSession(): Promise<void> {
  console.log('[TerminalPanel] createSession() called, isReal:', isReal.value)

  // Each TerminalPanel instance owns exactly one session — no switching
  subs?.unsubscribe()
  subs = null
  capture.flush()
  cmdBuffer = ''

  if (!frontend) return

  if (isPanelActive.value && isReal.value && props.session?.realSessionId) {
    // ── Real SSH PTY shell (Tabby: SSHShellSession) ──
    const s = new SSHShellSession(
      props.session.realSessionId,
      srvName.value,
      frontend.cols,
      frontend.rows
    )
    session = s
    wireSessionStreams(s)
    try {
      await s.start()
      frontend.writeln('\x1b[1;32m● PTY shell connected\x1b[0m')
      // A carriage return is harmless when a prompt is already visible and
      // asks shells that suppress their first prompt to render one now.
      s.sendInput('\r')
    } catch (e) {
      console.error('[TerminalPanel] PTY shell open failed:', e)
      // A real SSH session must never silently fall back to the local demo shell:
      // that could make remote commands look as if they ran successfully.
      subs?.unsubscribe()
      subs = null
      s.destroy()
      frontend.writeln(`\x1b[1;31m● PTY unavailable: ${formatPtyError(e)}\x1b[0m`)
      session = null
    }
  } else {
    // ── Demo/offline terminal (Tabby: LocalTerminalSession) ──
    session = new DemoSession(srvName.value)
    await session.start()

    // Welcome banner (demo only — real server sends its own MOTD)
    const h = srvName.value
    frontend.writeln(`\x1b[1;36m╔══════════════════════════════════════════╗\x1b[0m`)
    frontend.writeln(`\x1b[1;36m║\x1b[0m  \x1b[1;37mAITerminal\x1b[0m`)
    frontend.writeln(`\x1b[1;36m║\x1b[0m  \x1b[2;37mroot@${h}\x1b[0m`)
    frontend.writeln(`\x1b[1;36m║\x1b[0m  \x1b[2;37mTab=complete  ↑↓=history  help\x1b[0m`)
    frontend.writeln(`\x1b[1;36m╚══════════════════════════════════════════╝\x1b[0m`)
    frontend.writeln('')

    // Emit initial prompt after banner
    wireSessionStreams(session)
    session.sendInput('\r')
  }
}

// ── Lifecycle ──
onMounted(() => {
  register(hideTermMenu)
  document.addEventListener('click', hideTermMenu)
  nextTick(() => {
    if (!tbr.value) return
    frontend = new XTermFrontend()
    frontend.open(tbr.value)
    frontend.updateTheme() // Apply current theme to terminal
    frontend.applySettings({ ...termSettings.settings }) // Apply user terminal prefs
    createSession()
  })
})

// Re-apply terminal settings live when user changes them
watch(() => termSettings.version, () => {
  frontend?.applySettings({ ...termSettings.settings })
})

/**
 * Watch Pinia ptyRequestCount — a simple numeric counter incremented
 * after sshConnect succeeds and realSessionId is set. A counter change
 * is unambiguous and always fires the watcher regardless of Vue's
 * deep-reactivity chain on object properties.
 *
 * CRITICAL: We must NOT watch `props.session?.realSessionId` because
 * Vue props are shallow reactive — when Pinia mutates a nested property
 * on the same object reference, the prop watcher does NOT fire.
 */
watch(
  () => sshStore.ptyRequestCount,
  (count) => {
    console.log('[TerminalPanel] ptyRequestCount watcher, count:', count, 'frontend:', !!frontend, 'sessionIsSSH:', session instanceof SSHShellSession, 'realSessionId:', props.session?.realSessionId, 'isReal:', isReal.value)
    const rsid = props.session?.realSessionId
    if (count > 0 && frontend && isPanelActive.value && rsid && !(session instanceof SSHShellSession)) {
      console.log('[TerminalPanel] → creating PTY shell for realSessionId:', rsid)
      frontend.writeln('\r\n\x1b[1;36m● Opening PTY shell...\x1b[0m')
      createSession()
    }
  },
  { immediate: true }
)

// Watch this panel's own session state so background tabs cannot affect it.
watch(
  () => props.session?.status,
  (st) => {
    console.log('[TerminalPanel] status watcher fired, status:', st)
    if (!frontend) return
    if (st === 'error') {
      const errMsg = props.session?.error || 'Unknown error'
      frontend.clear()
      frontend.writeln('\x1b[1;31m══════════════════════════════════════════\x1b[0m')
      frontend.writeln('\x1b[1;31m  SSH Connection Failed\x1b[0m')
      frontend.writeln(`\x1b[1;31m  ${errMsg}\x1b[0m`)
      frontend.writeln('\x1b[1;31m  Check host credentials\x1b[0m')
      frontend.writeln('\x1b[1;31m══════════════════════════════════════════\x1b[0m')
    } else if (st === 'disconnected') {
      capture.flush()
      if (session && !session.destroyed) {
        frontend.writeln('\r\n\x1b[1;33m● Disconnected\x1b[0m')
      }
      session?.destroy()
    }
  }
)

// Watch theme changes → update xterm terminal colors
watch(() => configStore.colorScheme, () => {
  frontend?.updateTheme()
})

onUnmounted(() => {
  unregister(hideTermMenu)
  document.removeEventListener('click', hideTermMenu)
  subs?.unsubscribe()
  subs = null
  capture.flush()
  session?.destroy()
  session = null
  frontend?.dispose()
  frontend = null
})
</script>

<style lang="scss" scoped>
.tp { height: 100%; width: 100%; background: $color-bg-app; display: flex; flex-direction: column }
.tbar { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; background: linear-gradient(90deg, $color-bg-active, transparent 34%), $surface-contrast; border-bottom: 1px solid $color-border; font-size: 12px; color: $color-text-primary; flex-shrink: 0 }
.tdot { width: 7px; height: 7px; border-radius: 50%; background: $color-text-placeholder; flex-shrink: 0 }
.tdot.connected { background: $color-success }
.tdot.connecting { background: $color-warning }
.tdot.error { background: $color-danger }
.tdot.disconnected { background: $color-text-placeholder }
.tb { flex: 1; overflow: hidden; padding: 6px 10px }
.tbadge { font-weight: bold; margin-left: 8px; font-size: 12px }
.tbadge.real { color: $color-success }
.tbadge.demo { color: $color-warning }
.tpty { color: $color-primary-light; font-size: 10px; margin-left: 4px }
.tstatus { margin-left: auto; color: $color-text-secondary; font-size: 11px }

:deep(.xterm-operation-ai) {
  width: 22px;
  height: 18px;
  padding: 0;
  border: 1px solid $color-border;
  border-radius: 5px;
  background: $color-bg-toolbar;
  color: $color-primary-light;
  font: 600 9px/16px system-ui, sans-serif;
  opacity: .66;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    opacity: 1;
    border-color: $color-primary;
    outline: none;
  }
}

// Emoji popup panel — theme-aware, VSCode-style
.emoji-panel {
  position: fixed;
  z-index: 10000;
  background: $color-bg-toolbar;
  border: 1px solid $color-border;
  border-radius: $border-radius-md;
  box-shadow: $shadow-lg;
  padding: 8px;
  width: 320px;
  max-height: 260px;
  overflow-y: auto;
  backdrop-filter: blur(8px);
}
.emoji-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.emoji-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 18px;
  cursor: pointer;
  border-radius: $border-radius-sm;
  transition: background $transition-fast, transform 0.1s;
  &:hover {
    background: $color-bg-hover;
    transform: scale(1.3);
  }
}
</style>
