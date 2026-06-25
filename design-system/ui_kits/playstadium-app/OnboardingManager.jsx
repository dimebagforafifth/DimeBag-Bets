/* global React, Icon, Button, Badge, cx */
// Operator (manager) onboarding — the real SetupWizard, PlayStadium-styled. Book
// basics → house profile (Conservative/Balanced/Aggressive presets, faithful RTP +
// risk + starter promos from app/console/presets.ts) → review → invite your desk
// (org hierarchy) → done. onDone() opens the console. Fully interactive.
const { useState: useMOState } = React

const mFmtCents = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })
const mPct = (n) => `${Math.round(n * 100)}%`

const PRESETS = [
  { key: 'conservative', label: 'Conservative', blurb: 'Small edge, tight credit, early alerts. Protect the book; grow slowly.',
    rtp: 0.99, creditUtil: 0.7, exposureCap: 50000, defaultCreditLimit: 10000, settlementPeriodDays: 7,
    promos: [{ name: 'Welcome free play', type: 'freeplay', cents: 1000 }, { name: 'Weekly reload', type: 'bonus', cents: 500 }] },
  { key: 'balanced', label: 'Balanced', blurb: 'A standard hold with moderate credit and alerts. The sensible default.',
    rtp: 0.97, creditUtil: 0.8, exposureCap: 200000, defaultCreditLimit: 20000, settlementPeriodDays: 7,
    promos: [{ name: 'Welcome free play', type: 'freeplay', cents: 2500 }, { name: 'Weekly reload', type: 'bonus', cents: 1000 }, { name: 'Win-back', type: 'freeplay', cents: 1500 }] },
  { key: 'aggressive', label: 'Aggressive', blurb: 'Max edge, loose credit, late alerts. Push growth; carry more risk.',
    rtp: 0.95, creditUtil: 0.9, exposureCap: null, defaultCreditLimit: 50000, settlementPeriodDays: 14,
    promos: [{ name: 'Welcome free play', type: 'freeplay', cents: 5000 }, { name: 'Weekly reload', type: 'bonus', cents: 2500 }, { name: 'Win-back', type: 'freeplay', cents: 2500 }, { name: 'VIP boost', type: 'bonus', cents: 10000 }] },
]

function OnboardingManager({ name, username, onDone }) {
  const [step, setStep] = useMOState(0)
  const [book, setBook] = useMOState('')
  const [operator, setOperator] = useMOState(name || '')
  const [presetKey, setPresetKey] = useMOState('balanced')
  const [desk, setDesk] = useMOState([])
  const [agentName, setAgentName] = useMOState('')
  const [agentUser, setAgentUser] = useMOState('')

  const STEPS = ['Book', 'Profile', 'Review', 'Desk', 'Done']
  const last = STEPS.length - 1
  const pct = Math.round((step / last) * 100)
  const preset = PRESETS.find((p) => p.key === presetKey)
  const next = () => setStep((s) => Math.min(last, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const bookErr = step === 0 && !book.trim() ? 'Give your book a name' : null
  const addAgent = () => {
    if (!agentName.trim()) return
    setDesk((d) => [...d, { id: Date.now(), name: agentName.trim(), username: agentUser.trim() || agentName.trim().toLowerCase().replace(/\s+/g, '') }])
    setAgentName(''); setAgentUser('')
  }

  return (
    <div className="ob-shell">
      <div className="ob-progress">
        <div className="ob-progress-top">
          <span className="ob-step-count"><b>{step + 1}</b> / {STEPS.length} · {STEPS[step]}</span>
          {step === 3 && <button className="ob-skip" onClick={next}>Skip for now</button>}
        </div>
        <div className="ob-bar"><span style={{ width: `${Math.max(8, pct)}%` }} /></div>
      </div>

      <div className="ob-step" key={step}>
        {step === 0 && (
          <React.Fragment>
            <div className="ob-eyebrow">Welcome, operator</div>
            <h2 className="ob-title">Name your book</h2>
            <p className="ob-lede">This is your tenant — the whole pyramid of agents and players settles under it. You can rebrand anytime.</p>
            <div className="ob-body">
              <div className="auth-field">
                <span className="label">Book name</span>
                <div className="auth-input-wrap"><Icon name="flag" size={16} /><input className="input" value={book} onChange={(e) => setBook(e.target.value)} placeholder="e.g. Stadium Club" maxLength={32} /></div>
                {bookErr && <span className="auth-err-text"><Icon name="info" size={12} />{bookErr}</span>}
              </div>
              <div className="auth-field">
                <span className="label">Operator display name</span>
                <div className="auth-input-wrap"><Icon name="user" size={16} /><input className="input" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Your name" /></div>
                <span className="auth-hint-text">Signed in as <b style={{ fontFamily: 'var(--font-num)', color: 'var(--muted)' }}>@{username}</b> · manager (root of the org)</span>
              </div>
            </div>
          </React.Fragment>
        )}

        {step === 1 && (
          <React.Fragment>
            <div className="ob-eyebrow">House profile</div>
            <h2 className="ob-title">Pick a starting profile</h2>
            <p className="ob-lede">One click sets your house edge, credit line, exposure alerts, and settlement cadence across every game. Re-baseline anytime in Setup.</p>
            <div className="ob-presets">
              {PRESETS.map((p) => (
                <button key={p.key} className={cx('ob-preset', p.key === presetKey && 'is-on')} onClick={() => setPresetKey(p.key)}>
                  <span className="ob-preset-radio" />
                  <span><span className="ob-preset-name">{p.label}</span><span className="ob-preset-blurb">{p.blurb}</span></span>
                  <span className="ob-preset-rtp">{mPct(p.rtp)}<small>RTP</small></span>
                </button>
              ))}
            </div>
          </React.Fragment>
        )}

        {step === 2 && (
          <React.Fragment>
            <div className="ob-eyebrow">Review · {preset.label}</div>
            <h2 className="ob-title">Here's what this sets</h2>
            <p className="ob-lede">Applying writes only house + risk config — no money moves and no bonuses are sent. Promo templates wait in Promotions.</p>
            <div className="ob-review">
              <div className="ob-review-sec">
                <div className="ob-review-h">House &amp; risk</div>
                <dl style={{ margin: 0 }}>
                  <Def k="Game RTP (all adjustable games)" v={`${mPct(preset.rtp)} · ${mPct(1 - preset.rtp)} edge`} />
                  <Def k="Credit-use alert at" v={mPct(preset.creditUtil)} />
                  <Def k="Exposure alert cap" v={preset.exposureCap == null ? 'Off' : mFmtCents(preset.exposureCap)} />
                  <Def k="Default credit line" v={mFmtCents(preset.defaultCreditLimit)} />
                  <Def k="Settlement cadence" v={`${preset.settlementPeriodDays} days`} />
                </dl>
              </div>
              <div className="ob-review-sec">
                <div className="ob-review-h">Starter promo templates</div>
                {preset.promos.map((pr) => (
                  <div className="ob-promo" key={pr.name}><span className="nm">{pr.name}<em>{pr.type === 'freeplay' ? 'Free play' : 'Bonus'}</em></span><span className="amt">{mFmtCents(pr.cents)}</span></div>
                ))}
                <p className="auth-hint-text" style={{ marginTop: 8 }}>Suggestions only — run them from Promotions when you're ready.</p>
              </div>
            </div>
          </React.Fragment>
        )}

        {step === 3 && (
          <React.Fragment>
            <div className="ob-eyebrow">Build your desk</div>
            <h2 className="ob-title">Invite your agents</h2>
            <p className="ob-lede">Agents sit under you and recruit players. Add a few now or skip — you can manage the whole hierarchy from Players later.</p>
            <div className="ob-body">
              <div className="auth-field">
                <span className="label">Add an agent</span>
                <div className="ob-invite-add">
                  <div className="auth-input-wrap" style={{ flex: 1.2 }}><Icon name="user" size={16} /><input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Agent name" onKeyDown={(e) => e.key === 'Enter' && addAgent()} /></div>
                  <div className="auth-input-wrap" style={{ flex: 1 }}><Icon name="hash" size={16} /><input className="input" value={agentUser} onChange={(e) => setAgentUser(e.target.value)} placeholder="username" autoCapitalize="none" onKeyDown={(e) => e.key === 'Enter' && addAgent()} /></div>
                  <Button variant="secondary" icon onClick={addAgent} disabled={!agentName.trim()}><Icon name="plus" size={16} /></Button>
                </div>
              </div>
              {desk.length === 0
                ? <div className="ob-invite-empty">No agents yet — your desk is just you for now.</div>
                : <div className="ob-invite-list">{desk.map((a) => (
                    <div className="ob-invite-item" key={a.id}>
                      <span className="avatar sm">{a.name[0].toUpperCase()}</span>
                      <div className="ob-invite-meta"><div className="ob-invite-nm">{a.name}</div><div className="ob-invite-un">@{a.username} · agent</div></div>
                      <button className="ob-invite-x" onClick={() => setDesk((d) => d.filter((x) => x.id !== a.id))}><Icon name="x" size={15} /></button>
                    </div>
                  ))}</div>}
            </div>
          </React.Fragment>
        )}

        {step === 4 && (
          <React.Fragment>
            <div className="ob-eyebrow">Book is live</div>
            <h2 className="ob-title">{book || 'Your book'} is ready.</h2>
            <p className="ob-lede">Your house, risk posture, and desk are configured. Open the console to take it from here.</p>
            <div className="ob-done-summary">
              <div className="ob-done-row"><Icon name="check" size={16} />Book <b>{book || 'Stadium Club'}</b> · operator <b>{operator || username}</b></div>
              <div className="ob-done-row"><Icon name="check" size={16} /><b>{preset.label}</b> profile · {mPct(preset.rtp)} RTP, {preset.settlementPeriodDays}-day settle</div>
              <div className="ob-done-row"><Icon name="check" size={16} /><b>{desk.length}</b> agent{desk.length === 1 ? '' : 's'} on the desk</div>
              <div className="ob-done-row"><Icon name="check" size={16} /><b>{preset.promos.length}</b> promo templates ready in Promotions</div>
            </div>
          </React.Fragment>
        )}
      </div>

      <div className="ob-foot">
        {step > 0 ? <Button variant="ghost" onClick={back}><Icon name="arrow-left" size={16} />Back</Button> : <span />}
        <span className="spacer" />
        {step < last
          ? <Button variant="default" onClick={next} disabled={!!bookErr}>{step === 2 ? `Apply ${preset.label}` : 'Continue'}<Icon name="arrow-right" size={16} /></Button>
          : <Button variant="default" size="lg" onClick={onDone}><Icon name="dashboard" size={16} />Open your console</Button>}
      </div>
    </div>
  )
}

function Def({ k, v }) {
  return <div className="ob-def"><dt>{k}</dt><dd>{v}</dd></div>
}

window.OnboardingManager = OnboardingManager
