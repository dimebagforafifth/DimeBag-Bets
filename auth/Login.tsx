/**
 * The sign-in / sign-up screen, shown by main.tsx when there's no session. Clean and
 * single-purpose (CLAUDE.md §2): one card, one primary action. In demo mode it offers
 * a one-tap "Continue as operator" so the app is instantly usable without keys.
 */

import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider.js'
import { DEMO_OPERATOR_USERNAME } from './demoAdapter.js'
import './auth.css'

export function Login() {
  const { signIn, signUp, isDemo } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(() =>
      mode === 'in' ? signIn(username, password) : signUp(username, password, displayName),
    )
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          DimeBag<span className="auth-brand-dot">·</span>Bets
        </div>
        <h1 className="auth-title">{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-sub">Points only — no real-money value, no buy-in, no cash-out.</p>

        {mode === 'up' && (
          <label className="auth-field">
            <span>Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="auth-field">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'in' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setError(null)
            setMode((m) => (m === 'in' ? 'up' : 'in'))
          }}
        >
          {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>

        {isDemo && (
          <div className="auth-demo">
            <button
              className="auth-demo-btn"
              type="button"
              disabled={busy}
              onClick={() => void run(() => signIn(DEMO_OPERATOR_USERNAME, 'demo'))}
            >
              Continue as operator (demo)
            </button>
            <p className="auth-demo-hint">
              Demo logins (password <code>demo</code>): <code>{DEMO_OPERATOR_USERNAME}</code> ·{' '}
              <code>agent</code> · <code>marco</code>
            </p>
          </div>
        )}
      </form>
    </div>
  )
}
