/**
 * Player onboarding — the post-sign-up flow, ported from the Claude Design system
 * (ui_kits/playstadium-app/OnboardingPlayer.jsx) and wired to the real backend:
 *
 *   • Account    → ensurePlayerAccount(userId, …) → a fresh self-signup has NO book node
 *                                                   yet, so we create their player figure
 *                                                   here — without it the choices below had
 *                                                   nothing to apply to (the bug this fixes).
 *   • Interests  → setFavourites(userId, picks)   → the lobby surfaces them first.
 *   • Limits     → setLimits(playerId, …)         → real responsible-play guardrails.
 *   • Free play  → fireTrigger('signup', …)       → the documented welcome-bonus seam
 *                                                   (oncePerPlayer, so claiming twice is safe);
 *                                                   the shown amount is the live rule's grant.
 *
 * It's additive and skippable: skipping still creates the figure (so the lobby renders) but
 * applies no limits or bonus; finishing applies the player's choices. onDone() hands control
 * back to the app, which lands the player on defaultSection('player') (the casino lobby).
 */

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Gift,
  Play,
  ShieldCheck,
  Trophy,
} from 'lucide-react'
import { Button } from '../../components/ui/button.js'
import { Switch } from '../../components/ui/switch.js'
import { Slider } from '../../components/ui/slider.js'
import { Wordmark, ChipLogo } from '../../components/brand/index.js'
import { GAMES } from '../games.js'
import { setLimits } from '../responsible-play.js'
import { fireTrigger, signupGrantPreviewCents } from '../../bonus/index.js'
import { ensurePlayerAccount } from '../book-store.js'
import { setFavourites, completePlayerOnboarding } from './onboarding-store.js'
import '../../auth/auth.css'

const fmtCents = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })
const fmtMin = (m: number) => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`) : `${m}m`)

function gameIconUrl(key: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + '/game-icons/' + key + '.png'
}

interface LimitState {
  on: boolean
  val: number
}
interface Limits {
  perBet: LimitState
  loss: LimitState
  time: LimitState
}

export interface OnboardingPlayerProps {
  /** Auth identity id — keys onboarding completion + favourites. */
  userId: string
  /** Resolved book member id, or null if not yet linked (limits/bonus then skip safely). */
  playerId: string | null
  name: string
  username: string
  onDone: () => void
}

const STEPS = ['Welcome', 'Interests', 'Limits', 'Bonus', 'Done']

export function OnboardingPlayer({ userId, playerId, name, username, onDone }: OnboardingPlayerProps) {
  const [step, setStep] = useState(0)
  const [picks, setPicks] = useState<Set<string>>(() => new Set(['mines', 'crash', 'plinko']))
  const [limits, setLimitsState] = useState<Limits>({
    perBet: { on: true, val: 20000 },
    loss: { on: true, val: 50000 },
    time: { on: false, val: 90 },
  })
  const [claimed, setClaimed] = useState(false)
  // The welcome free play is whatever the LIVE signup rules grant a fresh player — read once
  // so the screen never drifts from what the claim actually credits. `granted` captures the
  // real amount returned by fireTrigger so the "claimed" copy shows the true figure.
  const [welcomeCents] = useState(() => signupGrantPreviewCents())
  const [grantedCents, setGrantedCents] = useState(0)

  const last = STEPS.length - 1
  const pct = Math.round((step / last) * 100)
  const next = () => setStep((s) => Math.min(last, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const togglePick = (k: string) =>
    setPicks((p) => {
      const n = new Set(p)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const setLim = (key: keyof Limits, patch: Partial<LimitState>) =>
    setLimitsState((l) => ({ ...l, [key]: { ...l[key], ...patch } }))

  /** The player's book figure — the linked member if they have one, otherwise a freshly
   *  created player account (a self-signup arrives here unlinked). Idempotent. */
  function resolvePlayerId(): string {
    return playerId ?? ensurePlayerAccount(userId, name)
  }

  function claimFreePlay() {
    if (claimed) return
    // The documented welcome seam (main.tsx). oncePerPlayer guards a double-grant, and the
    // credit lands in the figure we just ensured exists — so it actually moves the balance.
    const { granted } = fireTrigger('signup', { playerId: resolvePlayerId() })
    setGrantedCents(granted.reduce((sum, g) => sum + g.grantedCents, 0))
    setClaimed(true)
  }

  /** Apply the player's choices to their figure, then hand control back to the app. */
  function commitAndEnter() {
    const pid = resolvePlayerId()
    setFavourites(userId, [...picks])
    setLimits(pid, {
      perBetMax: limits.perBet.on ? limits.perBet.val : undefined,
      sessionLossLimit: limits.loss.on ? limits.loss.val : undefined,
      sessionMinutes: limits.time.on ? limits.time.val : undefined,
    })
    completePlayerOnboarding(userId)
    onDone()
  }

  /** Skip the rest — still create the figure so the lobby renders, but apply no limits or
   *  bonus (clean defaults). Favourites stay whatever the player had already picked. */
  function skipAll() {
    resolvePlayerId()
    completePlayerOnboarding(userId)
    onDone()
  }

  const interestGames = GAMES.slice(0, 12)

  return (
    <div className="auth-root">
      <div className="auth-wrap">
        <BrandSidePanel />
        <div className="auth-main">
          <div className="ob-shell">
            <MobileBrand />
            <div className="ob-progress">
              <div className="ob-progress-top">
                <span className="ob-step-count">
                  <b>{step + 1}</b> / {STEPS.length} · {STEPS[step]}
                </span>
                {step < last && (
                  <button className="ob-skip" type="button" onClick={skipAll}>
                    Skip
                  </button>
                )}
              </div>
              <div className="ob-bar">
                <span style={{ width: `${Math.max(8, pct)}%` }} />
              </div>
            </div>

            <div className="ob-step" key={step}>
              {step === 0 && (
                <>
                  <div className="ob-eyebrow">Welcome, {(name || 'player').split(' ')[0]}</div>
                  <h2 className="ob-title">One figure. Every game.</h2>
                  <p className="ob-lede">
                    Your points balance works across the casino Originals and the sportsbook. Here&apos;s the
                    deal before you play.
                  </p>
                  <div className="ob-points">
                    <Point
                      icon={<Coins size={19} />}
                      t="Points, not money"
                      d="No buy-in and no cash-out. Points are for fun and bragging rights."
                    />
                    <Point
                      icon={<ShieldCheck size={19} />}
                      t="Provably fair"
                      d="Every Original is verifiable — the house can't move the result."
                    />
                    <Point
                      icon={<Trophy size={19} />}
                      t="Climb the week"
                      d="Wager to rise the weekly leaderboard and unlock VIP tiers."
                    />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="ob-eyebrow">Personalise</div>
                  <h2 className="ob-title">Pick a few favourites</h2>
                  <p className="ob-lede">
                    We&apos;ll surface these first in your lobby. Choose as many as you like — or none.
                  </p>
                  <div className="ob-chips">
                    {interestGames.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        className={`ob-chip${picks.has(g.key) ? ' is-on' : ''}`}
                        onClick={() => togglePick(g.key)}
                      >
                        <img src={gameIconUrl(g.key)} alt="" />
                        <span className="ob-chip-name">{g.name}</span>
                        <span className="tick">
                          <Check size={15} />
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="ob-eyebrow">Responsible play</div>
                  <h2 className="ob-title">Set your guardrails</h2>
                  <p className="ob-lede">
                    Points are for fun — these keep it that way. They actually block over-limit play, and you
                    can change them anytime in Profile.
                  </p>
                  <div className="ob-body">
                    <LimitRow
                      label="Per-bet cap"
                      sub="Largest single stake allowed"
                      on={limits.perBet.on}
                      onToggle={(v) => setLim('perBet', { on: v })}
                      valLabel={fmtCents(limits.perBet.val)}
                      min={500}
                      max={50000}
                      step={500}
                      val={limits.perBet.val}
                      onVal={(v) => setLim('perBet', { val: v })}
                    />
                    <LimitRow
                      label="Session loss limit"
                      sub="Stop play once you're down this much"
                      on={limits.loss.on}
                      onToggle={(v) => setLim('loss', { on: v })}
                      valLabel={fmtCents(limits.loss.val)}
                      min={1000}
                      max={200000}
                      step={1000}
                      val={limits.loss.val}
                      onVal={(v) => setLim('loss', { val: v })}
                    />
                    <LimitRow
                      label="Session time limit"
                      sub="Take a break after this long"
                      on={limits.time.on}
                      onToggle={(v) => setLim('time', { on: v })}
                      valLabel={fmtMin(limits.time.val)}
                      min={15}
                      max={240}
                      step={15}
                      val={limits.time.val}
                      onVal={(v) => setLim('time', { val: v })}
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="ob-eyebrow">On the house</div>
                  <h2 className="ob-title">Here&apos;s your welcome free play</h2>
                  <p className="ob-lede">
                    A little something to get you off the mark. It lands in your balance the moment you claim.
                  </p>
                  <div className="ob-claim">
                    <div className="ob-claim-label">Welcome free play</div>
                    <div className="ob-claim-amt">{fmtCents(claimed ? grantedCents : welcomeCents)}</div>
                    {!claimed ? (
                      <Button size="lg" onClick={claimFreePlay}>
                        <Gift size={17} />
                        Claim free play
                      </Button>
                    ) : (
                      <div className="ob-claimed-badge">
                        <Check size={18} />
                        Claimed — it&apos;s in your balance
                      </div>
                    )}
                    <div className="ob-claim-note">Free play only — points have no cash value.</div>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="ob-eyebrow">All set</div>
                  <h2 className="ob-title">You&apos;re in, {(name || 'player').split(' ')[0]}.</h2>
                  <p className="ob-lede">Your figure is ready and your lobby is personalised. Time to play.</p>
                  <div className="ob-done-summary">
                    <div className="ob-done-row">
                      <Check size={16} />
                      Playing as <b>{name || username}</b>
                    </div>
                    <div className="ob-done-row">
                      <Check size={16} />
                      <b>{picks.size}</b> favourite{picks.size === 1 ? '' : 's'} pinned to your lobby
                    </div>
                    <div className="ob-done-row">
                      <Check size={16} />
                      {[limits.perBet.on, limits.loss.on, limits.time.on].filter(Boolean).length} play limit(s)
                      active
                    </div>
                    <div className="ob-done-row">
                      <Check size={16} />
                      <b>{fmtCents(claimed ? grantedCents : welcomeCents)}</b> free play{' '}
                      {claimed ? 'in your balance' : 'waiting in Rewards'}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="ob-foot">
              {step > 0 ? (
                <Button variant="ghost" onClick={back}>
                  <ArrowLeft size={16} />
                  Back
                </Button>
              ) : (
                <span />
              )}
              <span className="spacer" />
              {step < last ? (
                <Button onClick={next}>
                  {step === 0 ? "Let's go" : 'Continue'}
                  <ArrowRight size={16} />
                </Button>
              ) : (
                <Button size="lg" onClick={commitAndEnter}>
                  <Play size={16} />
                  Enter PlayStadium
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Point({ icon, t, d }: { icon: React.ReactNode; t: string; d: string }) {
  return (
    <div className="ob-point">
      <span className="ic">{icon}</span>
      <div>
        <div className="ob-point-t">{t}</div>
        <div className="ob-point-d">{d}</div>
      </div>
    </div>
  )
}

function LimitRow({
  label,
  sub,
  on,
  onToggle,
  valLabel,
  min,
  max,
  step,
  val,
  onVal,
}: {
  label: string
  sub: string
  on: boolean
  onToggle: (v: boolean) => void
  valLabel: string
  min: number
  max: number
  step: number
  val: number
  onVal: (v: number) => void
}) {
  return (
    <div className="ob-limit">
      <div className="ob-limit-top">
        <div>
          <div className="ob-limit-label">{label}</div>
          <div className="ob-limit-sub">{sub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`ob-limit-val${on ? '' : ' off'}`}>{on ? valLabel : 'Off'}</span>
          <Switch checked={on} onCheckedChange={onToggle} />
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[val]}
        disabled={!on}
        onValueChange={([v]) => onVal(v)}
        style={{ opacity: on ? 1 : 0.4 }}
      />
    </div>
  )
}

/** The left brand showcase (shared with Login; hidden under 940px). */
function BrandSidePanel() {
  return (
    <aside className="auth-brandpane">
      <div className="auth-brand">
        <ChipLogo size={46} />
        <span className="auth-brand-name">
          <Wordmark />
        </span>
      </div>
      <div className="auth-brand-mid">
        <div className="auth-brand-eyebrow">Almost in</div>
        <h2 className="auth-brand-head">Set up your figure.</h2>
        <p className="auth-brand-sub">
          A couple of quick choices — your favourites, your guardrails, your welcome free play — and the
          stadium is yours.
        </p>
      </div>
      <div className="auth-brand-foot">© PlayStadium.io — a points-only social game. Must be 18+.</div>
    </aside>
  )
}

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
