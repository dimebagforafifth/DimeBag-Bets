/**
 * The sign-in / sign-up screen, shown by main.tsx when there's no session.
 * Re-skinned to the PlayStadium "Chip Gold & Carbon" design system (Claude Design
 * ui_kits/playstadium-app/Auth.jsx + auth.css): a split-screen brand pane + a form
 * panel. All wiring stays on the real useAuth() — username + password for everyone,
 * Google OAuth (real backend only), demo logins (operator / agent / marco · pw
 * "demo"), and the verify-email state.
 */

import { useState, type FormEvent } from 'react'
import { ArrowLeft, Dice5, Info, Lock, MailCheck, ShieldCheck, Sparkles, Trophy, User, Zap } from 'lucide-react'
import { useAuth } from './AuthProvider.js'
import { DEMO_OPERATOR_USERNAME } from './demoAdapter.js'
import { Button } from '../components/ui/button.js'
import { Wordmark, ChipLogo } from '../components/brand/index.js'
import './auth.css'

/** A simple 0–4 password strength score (length + character variety). */
function pwScore(p: string): number {
  let s = 0
  if (p.length >= 6) s++
  if (p.length >= 10) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) s++
  return Math.min(4, s)
}

const DEMOS: { username: string; role: string }[] = [
  { username: DEMO_OPERATOR_USERNAME, role: 'Manager' },
  { username: 'agent', role: 'Agent' },
  { username: 'marco', role: 'Player' },
]

export function Login() {
  const { signIn, signUp, signInWithGoogle, isDemo, canUseOAuth } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Set when a sign-up needs email confirmation — we swap the form for a "check your
  // inbox" message rather than treating the absent session as a failure.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)

  const score = pwScore(password)
  // Light, non-blocking guidance — the backend remains the source of truth, so we
  // only block on genuinely empty required fields (never a regex the server allows).
  const nameMissing = mode === 'up' && !displayName.trim()

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

  return (
    <div className="auth-root">
      <div className="auth-wrap">
        <BrandPane />
        <div className="auth-main">
          <div className="auth-panel">
            <MobileBrand />
            {verifyEmail ? (
              <VerifyEmail
                email={verifyEmail}
                onBack={() => {
                  setVerifyEmail(null)
                  setMode('in')
                }}
              />
            ) : (
              <>
                <div className="auth-head">
                  <div className="auth-kicker">{mode === 'in' ? 'Welcome back' : 'Join the stadium'}</div>
                  <h1 className="auth-title">{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
                  <p className="auth-sub">Points only — no real-money value, no buy-in, no cash-out.</p>
                </div>

                <form className="auth-form" onSubmit={submit} noValidate>
                  {mode === 'up' && (
                    <div className="auth-field">
                      <div className="auth-field-row">
                        <span className="label">Display name</span>
                      </div>
                      <div className="auth-input-wrap">
                        <User size={16} />
                        <input
                          className="input"
                          value={displayName}
                          placeholder="What we'll call you"
                          onChange={(e) => setDisplayName(e.target.value)}
                          autoComplete="name"
                        />
                      </div>
                      {nameMissing && (
                        <span className="auth-err-text">
                          <Info size={12} />
                          Tell us what to call you
                        </span>
                      )}
                    </div>
                  )}

                  <div className="auth-field">
                    <div className="auth-field-row">
                      <span className="label">Username</span>
                    </div>
                    <div className="auth-input-wrap">
                      <User size={16} />
                      <input
                        className="input"
                        type="text"
                        value={username}
                        placeholder="yourhandle"
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                      />
                    </div>
                  </div>

                  <div className="auth-field">
                    <div className="auth-field-row">
                      <span className="label">{mode === 'in' ? 'Password' : 'Create a password'}</span>
                    </div>
                    <div className="auth-input-wrap">
                      <Lock size={16} />
                      <input
                        className="input has-suffix"
                        type={reveal ? 'text' : 'password'}
                        value={password}
                        placeholder="••••••••"
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                        required
                      />
                      <button type="button" className="auth-reveal" onClick={() => setReveal((r) => !r)}>
                        {reveal ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {mode === 'up' && password.length > 0 && (
                      <div className={`auth-strength s${score}${score <= 1 ? ' weak' : ''}`}>
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="auth-formerr">
                      <Info size={16} />
                      {error}
                    </div>
                  )}

                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'}
                  </Button>

                  {canUseOAuth && (
                    <>
                      <div className="auth-or">
                        <span>or</span>
                      </div>
                      <button
                        className="auth-oauth"
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => signInWithGoogle())}
                      >
                        <GoogleG />
                        Continue with Google
                      </button>
                    </>
                  )}
                </form>

                <p className="auth-switch">
                  {mode === 'in' ? 'New here? ' : 'Have an account? '}
                  <button
                    className="auth-link"
                    type="button"
                    onClick={() => {
                      setError(null)
                      setMode((m) => (m === 'in' ? 'up' : 'in'))
                    }}
                  >
                    {mode === 'in' ? 'Create an account' : 'Sign in'}
                  </button>
                </p>

                {isDemo && mode === 'in' && (
                  <div className="auth-demo">
                    <div className="auth-demo-title">
                      <Zap size={12} />
                      Demo logins · password <code>demo</code>
                    </div>
                    <div className="auth-demo-grid">
                      {DEMOS.map((d) => (
                        <button
                          key={d.username}
                          className="auth-demo-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => signIn(d.username, 'demo'))}
                        >
                          <span className="auth-demo-role">{d.role}</span>
                          <span className="auth-demo-name">{d.username}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="auth-foot-note">
                  By continuing you agree this is a points-only social game. Must be 18+. Play for fun.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VerifyEmail({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="auth-center-state">
      <div className="auth-state-ic">
        <MailCheck size={28} />
      </div>
      <h1 className="auth-title">Check your email</h1>
      <p className="auth-sub">
        We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email}</strong>. Click it to
        verify your account, then come back and sign in.
      </p>
      <div style={{ marginTop: 22 }}>
        <Button variant="outline" size="lg" className="w-full" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to sign in
        </Button>
      </div>
    </div>
  )
}

/** The left brand showcase pane (hidden under 940px; MobileBrand shows instead). */
function BrandPane() {
  return (
    <aside className="auth-brandpane">
      <div className="auth-brand">
        <ChipLogo size={46} />
        <span className="auth-brand-name">
          <Wordmark />
        </span>
      </div>
      <div className="auth-brand-mid">
        <div className="auth-brand-eyebrow">Stack your week</div>
        <h2 className="auth-brand-head">21 Originals, one figure.</h2>
        <p className="auth-brand-sub">
          A points-based casino + sportsbook. Play the climb, chase the streak, top the weekly board — no
          buy-in, no cash-out, just the game.
        </p>
      </div>
      <div className="auth-brand-feats">
        <div className="auth-feat">
          <span className="ic">
            <ShieldCheck size={16} />
          </span>
          Provably fair — every roll is verifiable
        </div>
        <div className="auth-feat">
          <span className="ic">
            <Dice5 size={16} />
          </span>
          21 in-house Originals + a full sportsbook
        </div>
        <div className="auth-feat">
          <span className="ic">
            <Trophy size={16} />
          </span>
          Climb the weekly leaderboard
        </div>
        <div className="auth-feat">
          <span className="ic">
            <Sparkles size={16} />
          </span>
          Points only — no buy-in, no cash-out
        </div>
      </div>
      <div className="auth-brand-foot">© PlayStadium.io — a points-only social game. Must be 18+.</div>
    </aside>
  )
}

/** The compact brand lockup shown above the form on narrow screens. */
function MobileBrand() {
  return (
    <div className="auth-mobile-brand">
      <ChipLogo size={34} />
      <span className="nm">
        <Wordmark />
      </span>
    </div>
  )
}

/** Google's four-colour "G" mark for the OAuth button. */
function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" width="18" height="18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
