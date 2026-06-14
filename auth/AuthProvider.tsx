/**
 * The auth context + provider. It owns the SESSION (who's signed in) over the chosen
 * adapter and exposes signup/login/logout to the app. Role/account resolution is left
 * to consumers (App reads the book, which it already subscribes to), keeping this the
 * pure session surface.
 *
 * `useAuth()` falls back to a demo-operator context when no provider is mounted, so
 * components — and the existing test suite that renders <App/> directly — behave
 * exactly as they did before auth existed. main.tsx mounts the real provider in front
 * of the app.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createAuthAdapter } from './adapter.js'
import { DEMO_OPERATOR_USERNAME } from './demoAdapter.js'
import type { AuthAdapter, AuthContextValue, AuthStatus, Session } from './types.js'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState<AuthAdapter>(() => createAuthAdapter())
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Restore the persisted session on mount (the demo adapter may bootstrap one).
  useEffect(() => {
    let alive = true
    adapter
      .getSession()
      .then((s) => {
        if (!alive) return
        setSession(s)
        setStatus(s ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => {
        if (alive) setStatus('unauthenticated')
      })
    return () => {
      alive = false
    }
  }, [adapter])

  const signIn = useCallback(
    async (username: string, password: string) => {
      const s = await adapter.signIn(username, password)
      setSession(s)
      setStatus('authenticated')
    },
    [adapter],
  )
  const signUp = useCallback(
    async (username: string, password: string, displayName?: string) => {
      const s = await adapter.signUp(username, password, displayName)
      setSession(s)
      setStatus('authenticated')
    },
    [adapter],
  )
  const signOut = useCallback(async () => {
    await adapter.signOut()
    setSession(null)
    setStatus('unauthenticated')
  }, [adapter])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user: session?.user ?? null, isDemo: adapter.kind === 'demo', signIn, signUp, signOut }),
    [status, session, adapter, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** A demo-operator session used when no <AuthProvider> is mounted, so the app shell
 *  (and standalone component tests) render exactly as before auth was introduced. */
const FALLBACK: AuthContextValue = {
  status: 'authenticated',
  user: { id: 'mgr', username: DEMO_OPERATOR_USERNAME, displayName: 'Operator' },
  isDemo: true,
  async signIn() {},
  async signUp() {},
  async signOut() {},
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? FALLBACK
}
