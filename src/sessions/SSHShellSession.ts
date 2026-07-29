/**
 * SSHShellSession — SSH PTY shell session (Tabby's SSHShellSession equivalent)
 *
 * In Tabby, this uses ssh2's Channel (Node.js Duplex stream).
 * In our Tauri architecture, we use invoke + events as IPC:
 *
 *   Tabby                          Tauri equivalent
 *   ──────────────────────         ─────────────────────────────
 *   channel.write(data)      →     sshWrite(sessionId, data)
 *   channel.stream.on('data') →    onSshData(sessionId, callback)
 *   channel.setWindow(r,c)   →     sshResize(sessionId, cols, rows)
 *   channel.close()          →     unlisten events (auto-cleanup)
 *
 * Data flow:
 *   User keystroke → sendInput(data) → sshWrite → Rust shell_task → PTY → server
 *   Server output → ssh-data event → emitOutput(data) → output$ stream → xterm
 *
 * CRITICAL: Listeners are set up BEFORE shell is opened.
 * Otherwise the server's initial MOTD/prompt is lost (race condition).
 */

import { BaseSession } from './BaseSession'
import { sshOpenShell, sshWrite, sshResize, onSshData, onSshStatus } from '@/api/tauri'
import { colorizeTerminalOutput } from '@/utils/terminalColorizer'

export class SSHShellSession extends BaseSession {
  readonly name: string

  private sessionId: string
  private cols: number
  private rows: number
  private unlistenData: (() => void) | null = null
  private unlistenStatus: (() => void) | null = null

  constructor(sessionId: string, name: string, cols = 80, rows = 24) {
    super()
    this.sessionId = sessionId
    this.name = name
    this.cols = cols
    this.rows = rows
  }

  // ── Lifecycle ──

  async start(): Promise<void> {
    if (this.started || this.destroyed) {
      console.log('[SSHShellSession] start() skipped — started:', this.started, 'destroyed:', this.destroyed)
      return
    }
    console.log('[SSHShellSession] start() beginning, sessionId:', this.sessionId)

    // 1) Set up event listeners FIRST (before shell is opened)
    //    Tabby equivalent: channel.stream.on('data') before channel.shell()
    this.unlistenData = await onSshData(this.sessionId, (data: string) => {
      this.emitOutput(colorizeTerminalOutput(data))
    })
    console.log('[SSHShellSession] onSshData listener set up')

    this.unlistenStatus = await onSshStatus(
      this.sessionId,
      (status: string, error?: string) => {
        console.log('[SSHShellSession] status event:', status, error)
        if (status === 'disconnected' || status === 'error') {
          if (error) {
            this.emitOutput(`\r\n\x1b[1;31m● ${error}\x1b[0m\r\n`)
          }
          this.destroy()
        }
      }
    )
    console.log('[SSHShellSession] onSshStatus listener set up')

    // 2) Now open PTY shell — listeners will capture initial MOTD + prompt
    //    Tabby equivalent: channel.shell() after stream setup
    console.log('[SSHShellSession] calling sshOpenShell...')
    try {
      await sshOpenShell(this.sessionId, this.cols, this.rows)
      console.log('[SSHShellSession] sshOpenShell succeeded')
      this.markStarted()
    } catch (error) {
      // The listener setup precedes shell creation to avoid losing the prompt;
      // undo it when the request fails so a later retry does not duplicate output.
      this.unlistenData?.()
      this.unlistenStatus?.()
      this.unlistenData = null
      this.unlistenStatus = null
      throw error
    }
  }

  // ── I/O ──

  /** Send keystroke to remote PTY — every char, no buffering (Tabby: channel.write) */
  sendInput(data: string): void {
    if (this.destroyed) return
    sshWrite(this.sessionId, data)
  }

  /** Notify server of terminal size change (Tabby: channel.setWindow) */
  resize(rows: number, cols: number): void {
    if (this.destroyed) return
    this.cols = cols
    this.rows = rows
    sshResize(this.sessionId, cols, rows)
  }

  // ── Cleanup ──

  protected doDestroy(): void {
    this.unlistenData?.()
    this.unlistenStatus?.()
    this.unlistenData = null
    this.unlistenStatus = null
  }
}
