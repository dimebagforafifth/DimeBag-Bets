import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getBufferedReports,
  installGlobalErrorReporting,
  reportError,
  resetErrorReporting,
  setErrorSink,
  type ErrorReport,
} from './error-report.js'

afterEach(() => {
  setErrorSink(null)
  resetErrorReporting()
  vi.useRealTimers()
})

describe('reportError — never throws on weird inputs', () => {
  it.each([
    undefined,
    null,
    0,
    '',
    'a string error',
    42,
    Symbol('x'),
    { message: 'plain object' },
    [1, 2, 3],
    new Error('boom'),
    (() => {
      const e = new TypeError('typed');
      return e
    })(),
  ])('does not throw for %o', (input) => {
    expect(() => reportError(input as unknown)).not.toThrow()
  })

  it('survives an input whose JSON serialization throws (circular)', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => reportError(circular)).not.toThrow()
  })

  it('never throws even when the registered sink throws', () => {
    setErrorSink(() => {
      throw new Error('bad sink')
    })
    expect(() => reportError(new Error('x'))).not.toThrow()
  })
})

describe('reportError — normalization', () => {
  it('extracts message/name/stack from an Error', () => {
    const reports: ErrorReport[] = []
    setErrorSink((r) => reports.push(r))
    reportError(new TypeError('kaboom'), { route: '/mines' })
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      message: 'kaboom',
      name: 'TypeError',
      context: { route: '/mines' },
    })
    expect(typeof reports[0].at).toBe('number')
  })

  it('handles a bare string', () => {
    const reports: ErrorReport[] = []
    setErrorSink((r) => reports.push(r))
    reportError('just a message')
    expect(reports[0].message).toBe('just a message')
  })
})

describe('reportError — buffering and forwarding', () => {
  it('buffers when no sink is registered, then flushes on registration', () => {
    reportError(new Error('one'))
    reportError(new Error('two'))
    expect(getBufferedReports()).toHaveLength(2)

    const reports: ErrorReport[] = []
    setErrorSink((r) => reports.push(r))
    // Flushed on registration; buffer drained.
    expect(reports.map((r) => r.message)).toEqual(['one', 'two'])
    expect(getBufferedReports()).toHaveLength(0)
  })

  it('forwards directly to a sink once registered', () => {
    const sink = vi.fn()
    setErrorSink(sink)
    reportError(new Error('live'))
    expect(sink).toHaveBeenCalledOnce()
    expect((sink.mock.calls[0][0] as ErrorReport).message).toBe('live')
    expect(getBufferedReports()).toHaveLength(0)
  })
})

describe('reportError — de-dupes rapid repeats', () => {
  it('suppresses an identical report inside the dedupe window', () => {
    vi.useFakeTimers()
    const sink = vi.fn()
    setErrorSink(sink)
    const err = new Error('repeat')
    reportError(err)
    reportError(err) // immediate repeat → suppressed
    expect(sink).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(5_000) // past the window
    reportError(err)
    expect(sink).toHaveBeenCalledTimes(2)
  })
})

describe('installGlobalErrorReporting', () => {
  it('returns a no-op disposer when there is no target', () => {
    const uninstall = installGlobalErrorReporting(undefined)
    expect(uninstall).toBeTypeOf('function')
    expect(() => uninstall()).not.toThrow()
  })

  it('routes window error + unhandledrejection events through reportError', () => {
    const handlers = new Map<string, EventListener>()
    const target = {
      addEventListener: (type: string, fn: EventListener) => handlers.set(type, fn),
      removeEventListener: (type: string) => handlers.delete(type),
    }
    const uninstall = installGlobalErrorReporting(target)

    const reports: ErrorReport[] = []
    setErrorSink((r) => reports.push(r))

    handlers.get('error')!({ error: new Error('global throw'), message: 'global throw' } as unknown as Event)
    handlers.get('unhandledrejection')!({ reason: new Error('rejected') } as unknown as Event)

    expect(reports.map((r) => r.message)).toEqual(['global throw', 'rejected'])
    expect(reports[0].context).toMatchObject({ source: 'window.onerror' })
    expect(reports[1].context).toMatchObject({ source: 'unhandledrejection' })

    uninstall()
    expect(handlers.size).toBe(0)
  })
})
