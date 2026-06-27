/**
 * Transport-agnostic client error reporting — the local half of the G5
 * crash-reporting seam, with NO external dependency.
 *
 * Callers (the ErrorBoundary, global handlers) just call `reportError`. Where
 * those reports go is decided by an optional *sink*: by default they're only
 * console-logged, but a future remote backend (e.g. a Sentry SDK reading a DSN
 * from `import.meta.env`) can register a sink via `setErrorSink` without any
 * caller having to change. `reportError` is best-effort — it normalizes weird
 * inputs, de-dupes rapid repeats, and never throws.
 */

/** A normalized, serializable error report. Stable shape for any sink. */
export interface ErrorReport {
  /** Best-effort human-readable message. */
  message: string
  /** Error name when the input was an Error (e.g. 'TypeError'). */
  name?: string
  /** Stack trace when available. */
  stack?: string
  /** Caller-supplied context (componentStack, route, etc.). */
  context?: Record<string, unknown>
  /** When the report was created (epoch ms). */
  at: number
}

/** A place reports are forwarded to. Should be best-effort and not throw. */
export type ErrorSink = (report: ErrorReport) => void

/** How long (ms) an identical report is suppressed after the first. */
const DEDUPE_WINDOW_MS = 2_000
/** Cap on the in-memory buffer so a storm can't grow unbounded. */
const BUFFER_LIMIT = 50

let sink: ErrorSink | null = null
const buffer: ErrorReport[] = []
/** signature → last-reported timestamp, for de-duping rapid repeats. */
const lastSeen = new Map<string, number>()

/**
 * Register the sink reports are forwarded to (e.g. future Sentry wiring).
 * Any buffered reports collected before a sink existed are flushed to it.
 * Pass `null` to detach. Returns the previously registered sink, if any.
 */
export function setErrorSink(next: ErrorSink | null): ErrorSink | null {
  const prev = sink
  sink = next
  if (next) {
    // Drain anything buffered before the sink was attached.
    const pending = buffer.splice(0, buffer.length)
    for (const report of pending) {
      safeForward(next, report)
    }
  }
  return prev
}

/** Snapshot of buffered reports awaiting a sink (mainly for tests/diagnostics). */
export function getBufferedReports(): readonly ErrorReport[] {
  return buffer.slice()
}

/** Clear all buffered reports and de-dupe state. Mainly for tests. */
export function resetErrorReporting(): void {
  buffer.length = 0
  lastSeen.clear()
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/** Turn anything thrown into a stable, serializable report. Never throws. */
function normalize(error: unknown, context?: Record<string, unknown>): ErrorReport {
  const at = Date.now()
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Error',
      name: error.name,
      stack: error.stack,
      context,
      at,
    }
  }
  // Error-like objects (e.g. cross-realm errors, DOMException) without instanceof.
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    const message =
      typeof obj.message === 'string' && obj.message ? obj.message : asString(error)
    return {
      message,
      name: typeof obj.name === 'string' ? obj.name : undefined,
      stack: typeof obj.stack === 'string' ? obj.stack : undefined,
      context,
      at,
    }
  }
  return { message: error === undefined ? 'undefined' : asString(error), context, at }
}

function safeForward(target: ErrorSink, report: ErrorReport): void {
  try {
    target(report)
  } catch {
    // A broken sink must never break the app or the reporter.
  }
}

/**
 * Report an error. Safe to call from anywhere: normalizes the input, suppresses
 * an identical report seen within {@link DEDUPE_WINDOW_MS}, and forwards to the
 * registered sink (buffering if none is attached yet). Never throws.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    const report = normalize(error, context)

    // De-dupe rapid repeats of the same message+stack.
    const signature = `${report.name ?? ''}|${report.message}|${report.stack ?? ''}`
    const now = report.at
    const prev = lastSeen.get(signature)
    if (prev !== undefined && now - prev < DEDUPE_WINDOW_MS) {
      lastSeen.set(signature, now)
      return
    }
    lastSeen.set(signature, now)
    // Keep the de-dupe map from growing without bound.
    if (lastSeen.size > BUFFER_LIMIT * 4) {
      const cutoff = now - DEDUPE_WINDOW_MS
      for (const [key, ts] of lastSeen) {
        if (ts < cutoff) lastSeen.delete(key)
      }
    }

    if (sink) {
      safeForward(sink, report)
    } else {
      buffer.push(report)
      if (buffer.length > BUFFER_LIMIT) buffer.shift()
    }
  } catch {
    // reportError is a last line of defense; it must never throw.
  }
}

/**
 * Register global `error` + `unhandledrejection` listeners that route through
 * {@link reportError}. Returns an uninstall function. No-op (returns a no-op
 * disposer) when there's no window — e.g. during SSR or tests in node.
 */
export function installGlobalErrorReporting(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = typeof window !==
  'undefined'
    ? window
    : undefined,
): () => void {
  if (!target) return () => {}

  const onError = (event: ErrorEvent): void => {
    reportError(event.error ?? event.message, {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  }
  const onRejection = (event: PromiseRejectionEvent): void => {
    reportError(event.reason, { source: 'unhandledrejection' })
  }

  target.addEventListener('error', onError as EventListener)
  target.addEventListener('unhandledrejection', onRejection as EventListener)

  return () => {
    target.removeEventListener('error', onError as EventListener)
    target.removeEventListener('unhandledrejection', onRejection as EventListener)
  }
}
