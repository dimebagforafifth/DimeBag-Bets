/* global React, Icon, Button, Badge, Switch, cx */
// Player onboarding — a 7-step flow after sign-up. Personalisation (handle, agent
// code, game interests) + the real responsible-play limits (per-bet / session-loss /
// session-time, in cents) + the balanced-preset welcome free play ($25.00). onDone()
// launches the app. Fully interactive: validation, progress, step transitions.
const { useState: usePOState } = React

const fmtCents = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })
const fmtMin = (m) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`) : `${m}m`)

function OnboardingPlayer({ name, username, onDone }) {
  const D = window.PSA_DATA
  const [step, setStep] = usePOState(0)
  const [handle, setHandle] = usePOState(name || '')
  const [agentCode, setAgentCode] = usePOState('')
  const [codeOk, setCodeOk] = usePOState(null)
  const [picks, setPicks] = usePOState(() => new Set(['mines', 'crash', 'plinko']))
  const [limits, setLimits] = usePOState({
    perBet: { on: true, val: 20000 }, // cents → PlayerLimits.perBetMax
    loss: { on: true, val: 50000 }, //  cents → PlayerLimits.sessionLossLimit
    time: { on: false, val: 90 }, //    minutes → PlayerLimits.sessionMinutes
  })
  const [claimed, setClaimed] = usePOState(false)

  const STEPS = ['Welcome', 'Handle', 'Agent', 'Interests', 'Limits', 'Bonus', 'Done']
  const last = STEPS.length - 1
  const pct = Math.round((step / last) * 100)
  const next = () => setStep((s) => Math.min(last, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const togglePick = (k) => setPicks((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const setLim = (key, patch) => setLimits((l) => ({ ...l, [key]: { ...l[key], ...patch } }))
  const checkCode = () => { const v = agentCode.trim(); setCodeOk(v ? /^[a-z0-9-]{4,}$/i.test(v) : null) }

  const handleErr = step === 1 && !handle.trim() ? "Pick something — you can change it later" : null

  return (
    <div className="ob-shell">
      <div className="ob-progress">
        <div className="ob-progress-top">
          <span className="ob-step-count"><b>{step + 1}</b> / {STEPS.length} · {STEPS[step]}</span>
          {step > 0 && step < last && <button className="ob-skip" onClick={next}>Skip</button>}
        </div>
        <div className="ob-bar"><span style={{ width: `${Math.max(8, pct)}%` }} /></div>
      </div>

      <div className="ob-step" key={step}>
        {step === 0 && (
          <React.Fragment>
            <div className="ob-eyebrow">Welcome, {(name || 'player').split(' ')[0]}</div>
            <h2 className="ob-title">One figure. Every game.</h2>
            <p className="ob-lede">Your points balance works across the casino Originals and the sportsbook. Here's the deal before you play.</p>
            <div className="ob-points">
              <Point icon="coins" t="Points, not money" d="No buy-in and no cash-out. Points are for fun and bragging rights." />
              <Point icon="shield-check" t="Provably fair" d="Every Original is verifiable — the house can't move the result." />
              <Point icon="trophy" t="Climb the week" d="Wager to rise the weekly leaderboard and unlock VIP tiers." />
            </div>
          </React.Fragment>
        )}

        {step === 1 && (
          <React.Fragment>
            <div className="ob-eyebrow">Your handle</div>
            <h2 className="ob-title">What should we call you?</h2>
            <p className="ob-lede">This shows on the leaderboard and the live-wins ticker. Keep it clean.</p>
            <div className="ob-body">
              <div className="auth-field">
                <span className="label">Display name</span>
                <div className="auth-input-wrap">
                  <Icon name="user" size={16} />
                  <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={24} placeholder="e.g. Marco" />
                </div>
                {handleErr ? <span className="auth-err-text"><Icon name="info" size={12} />{handleErr}</span>
                  : <span className="auth-hint-text">Signed in as <b style={{ fontFamily: 'var(--font-num)', color: 'var(--muted)' }}>@{username}</b></span>}
              </div>
            </div>
          </React.Fragment>
        )}

        {step === 2 && (
          <React.Fragment>
            <div className="ob-eyebrow">Recruitment</div>
            <h2 className="ob-title">Got an agent code?</h2>
            <p className="ob-lede">If an agent recruited you, drop their code to join their desk. No code? Skip — an operator can link you later.</p>
            <div className="ob-body">
              <div className="auth-field">
                <span className="label">Agent or referral code <span style={{ color: 'var(--faint)' }}>· optional</span></span>
                <div className="ob-invite-add">
                  <div className="auth-input-wrap" style={{ flex: 1 }}>
                    <Icon name="hash" size={16} />
                    <input className="input" value={agentCode} onChange={(e) => { setAgentCode(e.target.value); setCodeOk(null) }} placeholder="EAST-DESK" autoCapitalize="characters" />
                  </div>
                  <Button variant="secondary" onClick={checkCode} disabled={!agentCode.trim()}>Apply</Button>
                </div>
                {codeOk === true && <span className="auth-err-text" style={{ color: 'var(--green)' }}><Icon name="check" size={12} />Linked to <b>East Desk</b> — nice.</span>}
                {codeOk === false && <span className="auth-err-text"><Icon name="info" size={12} />That code doesn't look right.</span>}
              </div>
            </div>
          </React.Fragment>
        )}

        {step === 3 && (
          <React.Fragment>
            <div className="ob-eyebrow">Personalise</div>
            <h2 className="ob-title">Pick a few favourites</h2>
            <p className="ob-lede">We'll surface these first in your lobby. Choose as many as you like — or none.</p>
            <div className="ob-chips">
              {D.GAMES.filter((g) => g.hot || g.new || ['dice', 'blackjack', 'roulette', 'keno', 'wheel'].includes(g.key)).slice(0, 12).map((g) => (
                <button key={g.key} className={cx('ob-chip', picks.has(g.key) && 'is-on')} onClick={() => togglePick(g.key)}>
                  <img src={g.icon} alt="" />
                  <span className="ob-chip-name">{g.name}</span>
                  <span className="tick"><Icon name="check" size={15} /></span>
                </button>
              ))}
            </div>
          </React.Fragment>
        )}

        {step === 4 && (
          <React.Fragment>
            <div className="ob-eyebrow">Responsible play</div>
            <h2 className="ob-title">Set your guardrails</h2>
            <p className="ob-lede">Points are for fun — these keep it that way. They actually block over-limit play, and you can change them anytime in Profile.</p>
            <div className="ob-body">
              <LimitRow label="Per-bet cap" sub="Largest single stake allowed" on={limits.perBet.on} onToggle={(v) => setLim('perBet', { on: v })}
                valLabel={fmtCents(limits.perBet.val)} min={500} max={50000} step={500} val={limits.perBet.val} onVal={(v) => setLim('perBet', { val: v })} />
              <LimitRow label="Session loss limit" sub="Stop play once you're down this much" on={limits.loss.on} onToggle={(v) => setLim('loss', { on: v })}
                valLabel={fmtCents(limits.loss.val)} min={1000} max={200000} step={1000} val={limits.loss.val} onVal={(v) => setLim('loss', { val: v })} />
              <LimitRow label="Session time limit" sub="Take a break after this long" on={limits.time.on} onToggle={(v) => setLim('time', { on: v })}
                valLabel={fmtMin(limits.time.val)} min={15} max={240} step={15} val={limits.time.val} onVal={(v) => setLim('time', { val: v })} />
            </div>
          </React.Fragment>
        )}

        {step === 5 && (
          <React.Fragment>
            <div className="ob-eyebrow">On the house</div>
            <h2 className="ob-title">Here's your welcome free play</h2>
            <p className="ob-lede">A little something to get you off the mark. It lands in your balance the moment you claim.</p>
            <div className="ob-claim">
              <div className="ob-claim-label">Welcome free play</div>
              <div className="ob-claim-amt">{fmtCents(2500)}</div>
              {!claimed
                ? <Button variant="default" size="lg" onClick={() => setClaimed(true)}><Icon name="gift" size={17} />Claim free play</Button>
                : <div className="ob-claimed-badge"><Icon name="check" size={18} />Claimed — it's in your balance</div>}
              <div className="ob-claim-note">Free play only — points have no cash value.</div>
            </div>
          </React.Fragment>
        )}

        {step === 6 && (
          <React.Fragment>
            <div className="ob-eyebrow">All set</div>
            <h2 className="ob-title">You're in, {(handle || 'player').split(' ')[0]}.</h2>
            <p className="ob-lede">Your figure is ready and your lobby is personalised. Time to play.</p>
            <div className="ob-done-summary">
              <div className="ob-done-row"><Icon name="check" size={16} />Playing as <b>{handle || username}</b></div>
              <div className="ob-done-row"><Icon name="check" size={16} /><b>{picks.size}</b> favourite{picks.size === 1 ? '' : 's'} pinned to your lobby</div>
              <div className="ob-done-row"><Icon name="check" size={16} />{[limits.perBet.on, limits.loss.on, limits.time.on].filter(Boolean).length} play limit(s) active</div>
              <div className="ob-done-row"><Icon name="check" size={16} /><b>{fmtCents(2500)}</b> free play {claimed ? 'claimed' : 'waiting in Rewards'}</div>
            </div>
          </React.Fragment>
        )}
      </div>

      <div className="ob-foot">
        {step > 0 ? <Button variant="ghost" onClick={back}><Icon name="arrow-left" size={16} />Back</Button> : <span />}
        <span className="spacer" />
        {step < last
          ? <Button variant="default" onClick={next} disabled={step === 1 && !!handleErr}>{step === 0 ? "Let's go" : 'Continue'}<Icon name="arrow-right" size={16} /></Button>
          : <Button variant="default" size="lg" onClick={onDone}><Icon name="play" size={16} />Enter PlayStadium</Button>}
      </div>
    </div>
  )
}

function Point({ icon, t, d }) {
  return (
    <div className="ob-point">
      <span className="ic"><Icon name={icon} size={19} /></span>
      <div><div className="ob-point-t">{t}</div><div className="ob-point-d">{d}</div></div>
    </div>
  )
}

function LimitRow({ label, sub, on, onToggle, valLabel, min, max, step, val, onVal }) {
  return (
    <div className="ob-limit">
      <div className="ob-limit-top">
        <div><div className="ob-limit-label">{label}</div><div className="ob-limit-sub">{sub}</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={cx('ob-limit-val', !on && 'off')}>{on ? valLabel : 'Off'}</span>
          <Switch checked={on} onChange={onToggle} />
        </div>
      </div>
      <input type="range" className="slider" min={min} max={max} step={step} value={val} disabled={!on}
        onChange={(e) => onVal(Number(e.target.value))} style={{ opacity: on ? 1 : 0.4 }} />
    </div>
  )
}

window.OnboardingPlayer = OnboardingPlayer
