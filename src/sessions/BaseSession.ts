/**
 * BaseSession — Abstract terminal session contract
 *
 * Equivalent to Tabby's BaseSession class.
 * All terminal session types (SSH, local, serial, demo) implement this interface.
 *
 * Tabby pattern:
 *   - Observable streams for output, bell, title, destroy
 *   - Abstract start/sendInput/resize/destroy lifecycle
 *   - Concrete emit helpers for subclasses
 */

import { Subject } from './Observable'

export abstract class BaseSession {
  // ── Observable Streams (Tabby: output$, bell$, title$, destroyed$) ──
  readonly output$ = new Subject<string>()
  readonly bell$ = new Subject<void>()
  readonly title$ = new Subject<string>()
  readonly destroyed$ = new Subject<void>()

  abstract readonly name: string

  // ── Internal state ──
  private _started = false
  private _destroyed = false

  get started(): boolean { return this._started }
  get destroyed(): boolean { return this._destroyed }

  // ── Lifecycle (abstract — each session type implements) ──

  /** Open the connection, allocate PTY, start the shell process */
  abstract start(): Promise<void>

  /** Send user keyboard input to the underlying shell/process */
  abstract sendInput(data: string): void

  /** Notify the underlying process of terminal size change */
  abstract resize(rows: number, cols: number): void

  // ── Cleanup (template method) ──

  /** Destroy the session — calls doDestroy() then completes all streams */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true

    this.doDestroy()

    this.destroyed$.next()
    this.destroyed$.complete()
    this.output$.complete()
    this.bell$.complete()
    this.title$.complete()
  }

  /** Subclass-specific cleanup (close channel, unlisten events, etc.) */
  protected abstract doDestroy(): void

  // ── Protected helpers for subclasses ──

  protected markStarted(): void {
    this._started = true
  }

  protected emitOutput(data: string): void {
    if (!this._destroyed) this.output$.next(data)
  }

  protected emitBell(): void {
    if (!this._destroyed) this.bell$.next()
  }

  protected emitTitle(title: string): void {
    if (!this._destroyed) this.title$.next(title)
  }
}
