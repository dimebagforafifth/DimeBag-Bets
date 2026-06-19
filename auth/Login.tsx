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
  const { signIn, signUp, signInWithGoogle, isDemo, canUseOAuth } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Set when a sign-up needs email confirmation — we swap the form for a "check your
  // inbox" message rather than treating the absent session as a failure.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)

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
    void run(async () => {
      if (mode === 'in') {
        await signIn(username, password)
        return
      }
      const result = await signUp(username, password, displayName)
      // Confirmation ON → no session yet; show the verify-your-email state.
      if ('pendingVerification' in result) setVerifyEmail(result.email)
    })
  }

  if (verifyEmail) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            DimeBag<span className="auth-brand-dot">·</span>Bets
          </div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            We sent a confirmation link to <strong>{verifyEmail}</strong>. Click it to verify your
            account, then come back and sign in.
          </p>
          <button
            className="auth-switch"
            type="button"
            onClick={() => {
              setVerifyEmail(null)
              setMode('in')
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
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

        {canUseOAuth && (
          <>
            <div className="auth-or" aria-hidden="true">
              <span>or</span>
            </div>
            <button
              className="auth-oauth auth-oauth-google"
              type="button"
              disabled={busy}
              onClick={() => void run(() => signInWithGoogle())}
            >
              <GoogleMark />
              Continue with Google
            </button>
          </>
        )}

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

/** Google's four-colour "G" mark for the OAuth button. */
function GoogleMark() {
  return (
    <svg className="auth-oauth-ico" viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
