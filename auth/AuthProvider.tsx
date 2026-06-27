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
import type { AuthAdapter, AuthContextValue, AuthStatus, Session, SignUpResult } from './types.js'

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
    async (username: string, password: string, displayName?: string): Promise<SignUpResult> => {
      const result = await adapter.signUp(username, password, displayName)
      // Only flip to authenticated when a real session came back. A pending-verification
      // result leaves the user unauthenticated (they confirm via email first); the caller
      // shows the "check your email" state from the returned result.
      if ('session' in result) {
        setSession(result.session)
        setStatus('authenticated')
      }
      return result
    },
    [adapter],
  )
  const signInWithGoogle = useCallback(async () => {
    // Redirect-based: the browser leaves for Google and returns to the app, where the
    // mount-time getSession() establishes the session. Nothing to set here.
    await adapter.signInWithOAuth('google')
  }, [adapter])
  const requestPasswordReset = useCallback(
    // Fire-and-forget: the backend emails a reset link. No session change here — the user
    // stays unauthenticated until they follow the link and set a new password.
    (email: string) => adapter.requestPasswordReset(email),
    [adapter],
  )
  const signOut = useCallback(async () => {
    await adapter.signOut()
    setSession(null)
    setStatus('unauthenticated')
  }, [adapter])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      isDemo: adapter.kind === 'demo',
      canUseOAuth: adapter.kind === 'supabase',
      signIn,
      signUp,
      signInWithGoogle,
      requestPasswordReset,
      signOut,
    }),
    [status, session, adapter, signIn, signUp, signInWithGoogle, requestPasswordReset, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** A demo-operator session used when no <AuthProvider> is mounted, so the app shell
 *  (and standalone component tests) render exactly as before auth was introduced. */
const FALLBACK: AuthContextValue = {
  status: 'authenticated',
  user: { id: 'mgr', username: DEMO_OPERATOR_USERNAME, displayName: 'Operator' },
  isDemo: true,
  canUseOAuth: false,
  async signIn() {},
  async signUp() {
    return { session: { user: FALLBACK.user!, token: 'demo-fallback', expiresAt: null } }
  },
  async signInWithGoogle() {},
  async requestPasswordReset() {},
  async signOut() {},
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? FALLBACK
}
