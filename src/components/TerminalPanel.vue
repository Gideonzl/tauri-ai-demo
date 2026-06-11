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
    <span :style="{color:isReal?'#4caf7d':'#d4a24e',fontWeight:'bold',marginLeft:'8px'}">{{ isReal ? 'REAL' : 'DEMO' }}</span>
    <span v-if="isReal" style="color:#89ddff;font-size:10px;margin-left:4px">PTY</span>
    <span style="margin-left:auto;color:#888;font-size:11px">{{ status }}</span>
  </div>
  <div class="tb" ref="tbr"></div>
</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import type { Ref } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { XTermFrontend } from '@/frontends/XTermFrontend'
import { BaseSession } from '@/sessions/BaseSession'
import { SSHShellSession } from '@/sessions/SSHShellSession'
import { DemoSession } from '@/sessions/DemoSession'
import { Subject } from '@/sessions/Observable'

// ── Props, Emits, Store ──
const props = defineProps<{ session?: any }>()
const emit = defineEmits<{ cwdChange: [path: string] }>()
const sshStore = useSshStore()

// ── Quick command injection (from parent WorkspaceView) ──
const qc = inject<Ref<string>>('quickCommandToExecute', ref(''))
watch(qc, (v) => {
  if (v?.trim() && session) {
    session.sendInput(v.trim() + '\r')
    nextTick(() => { (qc as any).value = '' })
  }
})

// ── Template refs ──
const tbr = ref<HTMLElement>()

// ── Core objects (Tabby pattern: frontend + session) ──
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
  console.log('[TerminalPanel] createSession() called, isReal:', isReal.value, 'realSessionId:', sshStore.activeSession?.realSessionId, 'current session type:', session?.constructor.name)

  // Tear down existing session
  subs?.unsubscribe()
  session?.destroy()
  session = null

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
    frontend.writeln(`\x1b[1;36m║\x1b[0m  \x1b[1;37mTauri AI Demo — Terminal\x1b[0m`)
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
  nextTick(() => {
    if (!tbr.value) return
    frontend = new XTermFrontend()
    frontend.open(tbr.value)
    createSession()
  })
})

/**
 * Watch activeSessionId — when the user closes a tab or switches to another,
 * recreate the session for the new active session.
 */
watch(
  () => sshStore.activeSessionId,
  (newId, oldId) => {
    console.log('[TerminalPanel] activeSessionId changed:', oldId, '→', newId)
    if (newId && frontend && oldId !== undefined) {
      console.log('[TerminalPanel] → recreating session for new activeSessionId:', newId)
      createSession()
    }
  }
)

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

onUnmounted(() => {
  subs?.unsubscribe()
  session?.destroy()
  frontend?.dispose()
  frontend = null
})
</script>

<style scoped>
.tp { height: 100%; width: 100%; background: #0d0d1a; display: flex; flex-direction: column }
.tbar { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; background: #16162a; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12px; color: #e8e8f0; flex-shrink: 0 }
.tdot { width: 7px; height: 7px; border-radius: 50%; background: #555; flex-shrink: 0 }
.tdot.connected { background: #4caf7d } .tdot.connecting { background: #d4a24e } .tdot.error { background: #d45454 } .tdot.disconnected { background: #555 }
.tb { flex: 1; overflow: hidden; padding: 4px 8px }
</style>
