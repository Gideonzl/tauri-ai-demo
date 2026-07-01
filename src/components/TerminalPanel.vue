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
import { useCommandHistoryStore } from '@/stores/commandHistory'

// ── Props, Emits, Store ──
const { t } = useLocale()
const cmdHistory = useCommandHistoryStore()
const props = defineProps<{ session?: any }>()
const emit = defineEmits<{ cwdChange: [path: string] }>()
const sshStore = useSshStore()
const configStore = useConfigStore()
const termSettings = useTerminalSettingsStore()

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

// ── Command history recording ──
let cmdBuffer = ''

function recordCommand(data: string) {
  for (const ch of data) {
    if (ch === '\r') {
      // Enter pressed — flush buffer as a command
      const cmd = cmdBuffer.trim()
      if (cmd && sshStore.activeSession) {
        cmdHistory.addEntry(
          sshStore.activeSession.serverId,
          sshStore.activeSession.serverName,
          cmd
        )
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

// ── Display state (watch Pinia store, NOT props — props are shallow reactive) ──
const srvName = computed(() => {
  const sid = sshStore.activeSession?.serverId
  if (sid) {
    const s = sshStore.servers.find((x: any) => x.id === sid)
    if (s) return s.host || s.name || 'demo'
  }
  return 'demo'
})
const isReal = computed(() => !!sshStore.activeSession?.realSessionId)
const status = computed(() => sshStore.activeSession?.status || '')

// ── Session factory ──
async function createSession(): Promise<void> {
  console.log('[TerminalPanel] createSession() called, isReal:', isReal.value)

  // Each TerminalPanel instance owns exactly one session — no switching
  subs?.unsubscribe()
  subs = null

  if (!frontend) return

  if (isReal.value && sshStore.activeSession?.realSessionId) {
    // ── Real SSH PTY shell (Tabby: SSHShellSession) ──
    const s = new SSHShellSession(
      sshStore.activeSession.realSessionId,
      srvName.value,
      frontend.cols,
      frontend.rows
    )
    try {
      await s.start()
      session = s
      frontend.writeln('\x1b[1;32m● PTY shell connected\x1b[0m')
    } catch (e) {
      console.error('[TerminalPanel] PTY shell open failed:', e)
      frontend.writeln(`\x1b[1;33m● PTY failed: ${e}\x1b[0m`)
      session = new DemoSession(srvName.value)
      await session.start()
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
    session.sendInput('\r')
  }

  if (!session) return

  // ── Wire streams (Tabby's BaseTerminalTabComponent.connectStreams) ──
  // input$:  frontend (xterm.onData) → session.sendInput
  // output$: session.emitOutput      → frontend.write
  // resize$: frontend (ResizeObserver) → session.resize

  subs = Subject.combine(
    frontend.input$.subscribe((data: string) => {
      session!.sendInput(data)
      // Record commands for history (extract lines ending with \r)
      recordCommand(data)
    }),

    session.output$.subscribe((data: string) => {
      frontend!.write(data)
    }),

    frontend.resize$.subscribe(({ rows, cols }: { rows: number; cols: number }) => {
      session!.resize(rows, cols)
    })
  )

  // Cleanup when session destroys itself (e.g., server disconnect)
  session.destroyed$.subscribe(() => {
    subs?.unsubscribe()
    subs = null
  })
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
    console.log('[TerminalPanel] ptyRequestCount watcher, count:', count, 'frontend:', !!frontend, 'sessionIsSSH:', session instanceof SSHShellSession, 'realSessionId:', sshStore.activeSession?.realSessionId, 'isReal:', isReal.value)
    const rsid = sshStore.activeSession?.realSessionId
    if (count > 0 && frontend && rsid && !(session instanceof SSHShellSession)) {
      console.log('[TerminalPanel] → creating PTY shell for realSessionId:', rsid)
      frontend.writeln('\r\n\x1b[1;36m● Opening PTY shell...\x1b[0m')
      createSession()
    }
  },
  { immediate: true }
)

// Watch the Pinia store directly for status changes (error / disconnect).
// Same reason as above: Vue prop shallow reactivity breaks on nested mutations.
watch(
  () => sshStore.activeSession?.status,
  (st) => {
    console.log('[TerminalPanel] status watcher fired, status:', st)
    if (!frontend) return
    if (st === 'error') {
      const errMsg = sshStore.activeSession?.error || 'Unknown error'
      frontend.clear()
      frontend.writeln('\x1b[1;31m══════════════════════════════════════════\x1b[0m')
      frontend.writeln('\x1b[1;31m  SSH Connection Failed\x1b[0m')
      frontend.writeln(`\x1b[1;31m  ${errMsg}\x1b[0m`)
      frontend.writeln('\x1b[1;31m  Check host credentials\x1b[0m')
      frontend.writeln('\x1b[1;31m══════════════════════════════════════════\x1b[0m')
    } else if (st === 'disconnected') {
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
  session?.destroy()
  session = null
  frontend?.dispose()
  frontend = null
})
</script>

<style lang="scss" scoped>
.tp { height: 100%; width: 100%; background: $color-bg-app; display: flex; flex-direction: column }
.tbar { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; background: $color-bg-sidebar; border-bottom: 1px solid $color-border-light; font-size: 12px; color: $color-text-primary; flex-shrink: 0 }
.tdot { width: 7px; height: 7px; border-radius: 50%; background: $color-text-placeholder; flex-shrink: 0 }
.tdot.connected { background: $color-success }
.tdot.connecting { background: $color-warning }
.tdot.error { background: $color-danger }
.tdot.disconnected { background: $color-text-placeholder }
.tb { flex: 1; overflow: hidden; padding: 4px 8px }
.tbadge { font-weight: bold; margin-left: 8px; font-size: 12px }
.tbadge.real { color: $color-success }
.tbadge.demo { color: $color-warning }
.tpty { color: $color-primary-light; font-size: 10px; margin-left: 4px }
.tstatus { margin-left: auto; color: $color-text-secondary; font-size: 11px }

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
