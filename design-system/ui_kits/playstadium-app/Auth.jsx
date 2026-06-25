/* global React, Icon, Button, Badge, Switch, cx */
// Login / create-account — mirrors DimeBag-Bets auth module: username + password for
// everyone, roles (manager/agent/player), Google OAuth (real backend only), demo
// logins (operator/agent/marco · pw "demo"), and the verify-email state. Styled
// PlayStadium. onResult({mode,role,name,username}) hands control back to the flow.
const { useState: useAuthState, useMemo: useAuthMemo } = React

const LOGO_A = '../../assets/logo/playstadium-chip-logo.png'
const RESERVED = { operator: { role: 'manager', name: 'Operator' }, agent: { role: 'agent', name: 'East Desk Agent' }, marco: { role: 'player', name: 'Marco' } }
const norm = (u) => u.trim().toLowerCase()

function pwScore(p) {
  let s = 0
  if (p.length >= 6) s++
  if (p.length >= 10) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) s++
  return Math.min(4, s)
}

function Auth({ onResult, initialMode = 'in', initialType = 'player' }) {
  const [mode, setMode] = useAuthState(initialMode) // 'in' | 'up'
  const [type, setType] = useAuthState(initialType) // 'player' | 'operator'
  const [displayName, setDisplayName] = useAuthState('')
  const [username, setUsername] = useAuthState('')
  const [password, setPassword] = useAuthState('')
  const [reveal, setReveal] = useAuthState(false)
  const [touched, setTouched] = useAuthState({})
  const [formErr, setFormErr] = useAuthState(null)
  const [oauthNote, setOauthNote] = useAuthState(false)
  const [busy, setBusy] = useAuthState(false)
  const [verifyEmail, setVerifyEmail] = useAuthState(null)

  const uErr = useAuthMemo(() => {
    const u = norm(username)
    if (!u) return 'Username is required'
    if (u.length < 3) return 'At least 3 characters'
    if (!/^[a-z0-9_]+$/.test(u)) return 'Letters, numbers and _ only'
    return null
  }, [username])
  const pErr = useAuthMemo(() => {
    if (!password) return 'Password is required'
    if (mode === 'up' && password.length < 6) return 'At least 6 characters'
    return null
  }, [password, mode])
  const nErr = mode === 'up' && !displayName.trim() ? 'Tell us what to call you' : null
  const score = pwScore(password)

  function fail(msg) { setFormErr(msg); setBusy(false) }

  function submit(e) {
    e.preventDefault()
    setTouched({ displayName: true, username: true, password: true })
    setFormErr(null)
    if (uErr || pErr || nErr) return
    setBusy(true)
    // simulate the adapter round-trip
    setTimeout(() => {
      const u = norm(username)
      if (mode === 'in') {
        const seed = RESERVED[u]
        if (!seed || password !== 'demo') return fail('Invalid username or password')
        setBusy(false)
        onResult({ mode: 'in', role: seed.role, name: seed.name, username: u, isNew: false })
      } else {
        if (RESERVED[u]) return fail('That username is already taken')
        setBusy(false)
        const role = type === 'operator' ? 'manager' : 'player'
        onResult({ mode: 'up', role, name: displayName.trim() || u, username: u, isNew: true })
      }
    }, 460)
  }

  function quickDemo(u) {
    const seed = RESERVED[u]
    onResult({ mode: 'in', role: seed.role, name: seed.name, username: u, isNew: false })
  }

  if (verifyEmail) {
    return (
      <div className="auth-panel">
        <MobileBrand />
        <div className="auth-center-state">
          <div className="auth-state-ic"><Icon name="bell" size={28} /></div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{verifyEmail}</strong>. Click it to verify your account, then sign in.</p>
          <div style={{ marginTop: 22 }}>
            <Button variant="outline" block onClick={() => { setVerifyEmail(null); setMode('in') }}><Icon name="arrow-left" size={16} />Back to sign in</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <MobileBrand />
      <div className="auth-head">
        <div className="auth-kicker">{mode === 'in' ? 'Welcome back' : 'Join the stadium'}</div>
        <h1 className="auth-title">{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
        <p className="auth-sub">Points only — no real-money value, no buy-in, no cash-out.</p>
      </div>

      <form className="auth-form" onSubmit={submit} noValidate>
        {mode === 'up' && (
          <div className="auth-field">
            <span className="label">I'm signing up as</span>
            <div className="ob-typeseg">
              <button type="button" className={cx('ob-type', type === 'player' && 'is-on')} onClick={() => setType('player')}>
                <span className="ic"><Icon name="dice" size={20} /></span>
                <span className="ob-type-t">Player</span>
                <span className="ob-type-d">Play the casino & sportsbook for points.</span>
              </button>
              <button type="button" className={cx('ob-type', type === 'operator' && 'is-on')} onClick={() => setType('operator')}>
                <span className="ic"><Icon name="dashboard" size={20} /></span>
                <span className="ob-type-t">Operator</span>
                <span className="ob-type-d">Run a book — players, risk & settlement.</span>
              </button>
            </div>
          </div>
        )}

        {mode === 'up' && (
          <Field label="Display name" error={touched.displayName && nErr}>
            <div className="auth-input-wrap">
              <Icon name="user" size={16} />
              <input className="input" value={displayName} placeholder="What we'll call you"
                onChange={(e) => setDisplayName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, displayName: true }))} autoComplete="name" />
            </div>
          </Field>
        )}

        <Field label="Username" error={touched.username && uErr}>
          <div className="auth-input-wrap">
            <Icon name="user" size={16} />
            <input className="input" value={username} placeholder="yourhandle" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => setUsername(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, username: true }))} autoComplete="username" />
          </div>
        </Field>

        <Field label={mode === 'in' ? 'Password' : 'Create a password'} error={touched.password && pErr}
          hint={mode === 'in' ? <button type="button" className="auth-link" onClick={(e) => { e.preventDefault() }}>Forgot?</button> : null}>
          <div className="auth-input-wrap">
            <Icon name="lock" size={16} />
            <input className="input has-suffix" type={reveal ? 'text' : 'password'} value={password} placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
            <button type="button" className="auth-reveal" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide' : 'Show'}</button>
          </div>
          {mode === 'up' && password.length > 0 && (
            <div className={cx('auth-strength', `s${score}`, score <= 1 && 'weak')}><span /><span /><span /><span /></div>
          )}
        </Field>

        {formErr && <div className="auth-formerr"><Icon name="info" size={16} />{formErr}</div>}

        <Button variant="default" size="lg" block disabled={busy} type="submit">
          {busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </Button>

        <div className="auth-or"><span>or</span></div>
        <button type="button" className="auth-oauth" onClick={() => setOauthNote(true)}>
          <GoogleG />Continue with Google
        </button>
        {oauthNote && <p className="auth-hint-text" style={{ textAlign: 'center' }}>Google sign-in activates with the Supabase backend — demo mode uses username + password.</p>}
      </form>

      <p className="auth-switch">
        {mode === 'in' ? "New here? " : 'Have an account? '}
        <button className="auth-link" onClick={() => { setFormErr(null); setMode((m) => (m === 'in' ? 'up' : 'in')) }}>
          {mode === 'in' ? 'Create an account' : 'Sign in'}
        </button>
      </p>

      {mode === 'in' && (
        <div className="auth-demo">
          <div className="auth-demo-title"><Icon name="bolt" size={12} />Demo logins · password <code style={{ fontFamily: 'var(--font-num)' }}>demo</code></div>
          <div className="auth-demo-grid">
            <button className="auth-demo-btn" onClick={() => quickDemo('operator')}><span className="auth-demo-role">Manager</span><span className="auth-demo-name">operator</span></button>
            <button className="auth-demo-btn" onClick={() => quickDemo('agent')}><span className="auth-demo-role">Agent</span><span className="auth-demo-name">agent</span></button>
            <button className="auth-demo-btn" onClick={() => quickDemo('marco')}><span className="auth-demo-role">Player</span><span className="auth-demo-name">marco</span></button>
          </div>
        </div>
      )}

      <p className="auth-foot-note">By continuing you agree this is a points-only social game. Must be 18+. Play for fun.</p>
    </div>
  )
}

function Field({ label, error, hint, children }) {
  return (
    <div className="auth-field">
      <div className="auth-field-row"><span className="label">{label}</span>{hint}</div>
      {children}
      {error && <span className="auth-err-text"><Icon name="info" size={12} />{error}</span>}
    </div>
  )
}

function MobileBrand() {
  return (
    <div className="auth-mobile-brand">
      <img src={LOGO_A} alt="" />
      <span className="nm">PlayStadium<span className="dot">.io</span></span>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

window.Auth = Auth
