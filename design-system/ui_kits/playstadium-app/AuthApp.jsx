/* global React, ReactDOM, Auth, OnboardingPlayer, OnboardingManager, Icon, cx */
// Auth + onboarding orchestrator. Constant split-screen brand pane (left) + a right
// panel that swaps Login ↔ player/operator onboarding. Sign-in (existing account)
// goes straight to the app; sign-up routes into the matching onboarding, which ends
// by opening the app. A prototype jump-menu lets reviewers hit any flow directly.
const { useState: useFlow } = React

const LOGO = '../../assets/logo/playstadium-chip-logo.png'
const APP_URL = 'index.html'

const BRAND_COPY = {
  auth: { eyebrow: 'PlayStadium.io', head: 'Stack your week.', sub: 'One points balance across 21 casino Originals and the sportsbook. No buy-in, no cash-out — just the action.' },
  player: { eyebrow: 'Player setup', head: 'Welcome to the floor.', sub: "A few quick steps to personalise your lobby and set your limits. Then your figure's ready to play." },
  manager: { eyebrow: 'Operator setup', head: 'Set up your book.', sub: 'Pick a house profile, build your desk, and go live. Everything settles under one tenant you control.' },
}

function BrandPane({ phase }) {
  const c = BRAND_COPY[phase] || BRAND_COPY.auth
  return (
    <aside className="auth-brandpane">
      <div className="auth-brand">
        <img src={LOGO} alt="" />
        <span className="auth-brand-name">PlayStadium<span className="dot">.io</span></span>
      </div>
      <div className="auth-brand-mid">
        <div className="auth-brand-eyebrow">{c.eyebrow}</div>
        <h2 className="auth-brand-head">{c.head}</h2>
        <p className="auth-brand-sub">{c.sub}</p>
      </div>
      <div className="auth-brand-feats">
        <Feat icon="sparkles" t="21 Originals + a full sportsbook" />
        <Feat icon="shield-check" t="Provably fair, points-only play" />
        <Feat icon="trophy" t="Weekly leaderboards & VIP tiers" />
      </div>
      <div className="auth-brand-foot">Points only — no real-money value. Must be 18+. Play for fun.</div>
    </aside>
  )
}
function Feat({ icon, t }) {
  return <div className="auth-feat"><span className="ic"><Icon name={icon} size={16} /></span>{t}</div>
}

function AuthApp() {
  const [phase, setPhase] = useFlow('auth') // 'auth' | 'player' | 'manager'
  const [authMode, setAuthMode] = useFlow('in')
  const [authType, setAuthType] = useFlow('player')
  const [session, setSession] = useFlow({ name: '', username: '' })
  const [jumpKey, setJumpKey] = useFlow(0) // forces Auth remount when jump menu seeds it

  const launch = () => { window.location.href = APP_URL }

  function onAuthResult(r) {
    setSession({ name: r.name, username: r.username, role: r.role })
    if (r.mode === 'in') { launch(); return } // existing account → straight into the app
    setPhase(r.role === 'manager' ? 'manager' : 'player') // new account → onboarding
  }

  function jump(v) {
    if (v === 'signin') { setPhase('auth'); setAuthMode('in'); setJumpKey((k) => k + 1) }
    else if (v === 'signup-player') { setPhase('auth'); setAuthMode('up'); setAuthType('player'); setJumpKey((k) => k + 1) }
    else if (v === 'signup-operator') { setPhase('auth'); setAuthMode('up'); setAuthType('operator'); setJumpKey((k) => k + 1) }
    else if (v === 'onboard-player') { setSession({ name: 'Marco', username: 'marco', role: 'player' }); setPhase('player') }
    else if (v === 'onboard-manager') { setSession({ name: 'Operator', username: 'operator', role: 'manager' }); setPhase('manager') }
  }

  return (
    <div className="auth-root">
      <div className="auth-wrap">
        <BrandPane phase={phase} />
        <div className="auth-main">
          <div className="auth-proto">
            <span className="auth-proto-label">Prototype · jump to</span>
            <select value="" onChange={(e) => { jump(e.target.value); e.target.value = '' }}>
              <option value="" disabled>Choose a flow…</option>
              <option value="signin">Sign in</option>
              <option value="signup-player">Player sign-up</option>
              <option value="signup-operator">Operator sign-up</option>
              <option value="onboard-player">Player onboarding</option>
              <option value="onboard-manager">Operator setup</option>
            </select>
          </div>

          <div key={`${phase}-${jumpKey}`} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            {phase === 'auth' && <Auth key={jumpKey} onResult={onAuthResult} initialMode={authMode} initialType={authType} />}
            {phase === 'player' && <OnboardingPlayer name={session.name} username={session.username} onDone={launch} />}
            {phase === 'manager' && <OnboardingManager name={session.name} username={session.username} onDone={launch} />}
          </div>
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuthApp />)
