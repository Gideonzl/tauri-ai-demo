/**
 * Observable stream layer — lightweight RxJS-style Subject/Observer
 * Mirrors Tabby's usage of RxJS Subjects for terminal I/O streams.
 *
 * Tabby pattern:
 *   input$:  Subject<string>   — user keystrokes from xterm
 *   output$: Subject<string>   — server/process output to xterm
 *   resize$: Subject<{rows,cols}> — terminal dimension changes
 *   destroyed$: Subject<void>  — session teardown signal
 */

export interface Subscription {
  unsubscribe(): void
}

export interface Observer<T> {
  next: (value: T) => void
  error?: (err: any) => void
  complete?: () => void
}

export class Subject<T> {
  private observers: Set<Observer<T>> = new Set()
  private _closed = false

  /** Subscribe to stream values. Returns a disposable Subscription. */
  subscribe(observerOrNext: Observer<T> | ((value: T) => void)): Subscription {
    const observer: Observer<T> =
      typeof observerOrNext === 'function'
        ? { next: observerOrNext }
        : observerOrNext

    if (this._closed) {
      observer.complete?.()
      return { unsubscribe: () => {} }
    }

    this.observers.add(observer)

    return {
      unsubscribe: () => {
        this.observers.delete(observer)
      },
    }
  }

  /** Emit a value to all subscribers */
  next(value: T): void {
    if (this._closed) return
    // Snapshot to avoid mutation-during-iteration issues
    for (const obs of [...this.observers]) {
      try {
        obs.next(value)
      } catch (e) {
        console.error('[Subject] observer error:', e)
      }
    }
  }

  /** Signal error — closes the stream */
  error(err: any): void {
    if (this._closed) return
    this._closed = true
    for (const obs of [...this.observers]) {
      try { obs.error?.(err) } catch { /* swallow */ }
    }
    this.observers.clear()
  }

  /** Signal completion — closes the stream */
  complete(): void {
    if (this._closed) return
    this._closed = true
    for (const obs of [...this.observers]) {
      try { obs.complete?.() } catch { /* swallow */ }
    }
    this.observers.clear()
  }

  get isClosed(): boolean {
    return this._closed
  }

  /** Utility: combine multiple subscriptions into one disposable */
  static combine(...subs: Subscription[]): Subscription {
    return {
      unsubscribe: () => subs.forEach((s) => s.unsubscribe()),
    }
  }
}
