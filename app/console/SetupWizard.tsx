import { useMemo, useState, useSyncExternalStore } from 'react'
import './console.css' // con-* page styles (kept loaded for other console panels)
import { ArrowLeft, ArrowRight, Check, LayoutDashboard, Plus, UserPlus, X } from 'lucide-react'
import { formatMoney } from '../../games/shared/money.js'
import { Button } from '../../components/ui/button.js'
import { addAgent } from '../../org/index.js'
import { mutateBook } from '../book-store.js'
import { PRESET_LIST, applyPreset, type HousePreset, type PresetKey } from './presets.js'
import { completeSetup, getSetup, getSetupVersion, subscribeSetup } from './setup-store.js'
import '../../auth/auth.css' // ob-* onboarding step styles (shared with player onboarding + login)

const pct = (n: number): string => `${Math.round(n * 100)}%`

type Step = 'profile' | 'review' | 'desk' | 'done'
const STEP_ORDER: Step[] = ['profile', 'review', 'desk', 'done']
const STEP_LABEL: Record<Step, string> = { profile: 'Profile', review: 'Review', desk: 'Desk', done: 'Done' }

interface DeskAgent {
  id: number
  name: string
}

/**
 * New-manager setup — the PlayStadium operator onboarding (Claude Design system
 * OnboardingManager), wired to the real console. Pick a house profile → review what
 * it sets → build your desk (invite agents) → done. Applying a profile writes only
 * house + risk config (presets.ts: applyPreset / completeSetup — no money moves, no
 * bonuses sent). Inviting agents creates real org members (addAgent under the
 * manager, through mutateBook so it persists). Re-runnable any time to re-baseline.
 */
export function SetupWizard() {
  const v = useSyncExternalStore(subscribeSetup, getSetupVersion)
  const setup = useMemo(() => getSetup(), [v])

  const [step, setStep] = useState<Step>('profile')
  const [selected, setSelected] = useState<PresetKey>(setup.preset ?? 'balanced')
  const [desk, setDesk] = useState<DeskAgent[]>([])
  const [agentName, setAgentName] = useState('')
  const [createdCount, setCreatedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const preset = PRESET_LIST.find((p) => p.key === selected) ?? PRESET_LIST[1]
  const stepIndex = STEP_ORDER.indexOf(step)
  const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100)

  const addToDesk = () => {
    const n = agentName.trim()
    if (!n) return
    setDesk((d) => [...d, { id: d.length ? d[d.length - 1].id + 1 : 1, name: n }])
    setAgentName('')
  }

  /** Review → Desk: apply the house profile (config only — no money moves). */
  const applyProfile = () => {
    applyPreset(selected)
    completeSetup(selected, preset.promos, Date.now())
    setStep('desk')
  }

  /** Desk → Done: create the invited agents as real org members under the manager. */
  const finishDesk = () => {
    setError(null)
    let made = 0
    try {
      for (const a of desk) {
        mutateBook((o) => addAgent(o, o.managerId, { name: a.name }))
        made += 1
      }
      setCreatedCount(made)
      setStep('done')
    } catch (e) {
      setCreatedCount(made)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="auth-root" style={{ minHeight: 'auto', overflow: 'visible' }}>
      <div className="ob-shell">
        <div className="ob-progress">
          <div className="ob-progress-top">
            <span className="ob-step-count">
              <b>{stepIndex + 1}</b> / {STEP_ORDER.length} · {STEP_LABEL[step]}
              {setup.completed && step === 'profile' ? ` · on ${labelFor(setup.preset)}` : ''}
            </span>
            {step === 'desk' && (
              <button className="ob-skip" type="button" onClick={finishDesk}>
                Skip for now
              </button>
            )}
          </div>
          <div className="ob-bar">
            <span style={{ width: `${Math.max(8, progress)}%` }} />
          </div>
        </div>

        <div className="ob-step" key={step}>
          {step === 'profile' && (
            <>
              <div className="ob-eyebrow">House profile</div>
              <h2 className="ob-title">Pick a starting profile</h2>
              <p className="ob-lede">
                One click sets your house edge, credit line, exposure alerts, and settlement cadence across
                every game. Re-baseline anytime from Setup.
              </p>
              <div className="ob-presets" role="radiogroup" aria-label="House profile">
                {PRESET_LIST.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={p.key === selected}
                    className={`ob-preset${p.key === selected ? ' is-on' : ''}`}
                    onClick={() => setSelected(p.key)}
                  >
                    <span className="ob-preset-radio" />
                    <span>
                      <span className="ob-preset-name">{p.label}</span>
                      <span className="ob-preset-blurb">{p.blurb}</span>
                    </span>
                    <span className="ob-preset-rtp">
                      {pct(p.rtp)}
                      <small>RTP</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="ob-eyebrow">Review · {preset.label}</div>
              <h2 className="ob-title">Here&apos;s what this sets</h2>
              <p className="ob-lede">
                Applying writes only house + risk config — no money moves and no bonuses are sent. Promo
                templates wait in Promotions.
              </p>
              <PresetReview preset={preset} />
            </>
          )}

          {step === 'desk' && (
            <>
              <div className="ob-eyebrow">Build your desk</div>
              <h2 className="ob-title">Invite your agents</h2>
              <p className="ob-lede">
                Agents sit under you and recruit players. Add a few now or skip — you can manage the whole
                hierarchy from Players later.
              </p>
              <div className="ob-body">
                <div className="auth-field">
                  <span className="label">Add an agent</span>
                  <div className="ob-invite-add">
                    <div className="auth-input-wrap" style={{ flex: 1 }}>
                      <UserPlus size={16} />
                      <input
                        className="input"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="Agent name"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToDesk())}
                      />
                    </div>
                    <Button variant="secondary" onClick={addToDesk} disabled={!agentName.trim()}>
                      <Plus size={16} />
                      Add
                    </Button>
                  </div>
                </div>
                {desk.length === 0 ? (
                  <div className="ob-invite-empty">No agents yet — your desk is just you for now.</div>
                ) : (
                  <div className="ob-invite-list">
                    {desk.map((a) => (
                      <div className="ob-invite-item" key={a.id}>
                        <span className="ob-invite-avatar">{a.name[0]?.toUpperCase()}</span>
                        <div className="ob-invite-meta">
                          <div className="ob-invite-nm">{a.name}</div>
                          <div className="ob-invite-un">agent · under you</div>
                        </div>
                        <button
                          type="button"
                          className="ob-invite-x"
                          aria-label={`Remove ${a.name}`}
                          onClick={() => setDesk((d) => d.filter((x) => x.id !== a.id))}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {error && (
                  <div className="auth-formerr">
                    <X size={16} />
                    {error}
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="ob-eyebrow">Book is live</div>
              <h2 className="ob-title">Your book is ready.</h2>
              <p className="ob-lede">
                Your house, risk posture, and desk are configured. Take it from here in the console.
              </p>
              <div className="ob-done-summary">
                <div className="ob-done-row">
                  <Check size={16} />
                  <b>{preset.label}</b> profile · {pct(preset.rtp)} RTP, {preset.settlementPeriodDays}-day
                  settle
                </div>
                <div className="ob-done-row">
                  <Check size={16} />
                  <b>{createdCount}</b> agent{createdCount === 1 ? '' : 's'} added to your desk
                </div>
                <div className="ob-done-row">
                  <Check size={16} />
                  <b>{preset.promos.length}</b> promo templates ready in Promotions
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ob-foot">
          {step !== 'profile' && step !== 'done' ? (
            <Button variant="ghost" onClick={() => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)])}>
              <ArrowLeft size={16} />
              Back
            </Button>
          ) : (
            <span />
          )}
          <span className="spacer" />
          {step === 'profile' && (
            <Button onClick={() => setStep('review')}>
              Review {preset.label}
              <ArrowRight size={16} />
            </Button>
          )}
          {step === 'review' && (
            <Button onClick={applyProfile}>
              Apply {preset.label}
              <ArrowRight size={16} />
            </Button>
          )}
          {step === 'desk' && (
            <Button onClick={finishDesk}>
              {desk.length ? `Add ${desk.length} & finish` : 'Finish setup'}
              <ArrowRight size={16} />
            </Button>
          )}
          {step === 'done' && (
            <Button
              onClick={() => {
                setDesk([])
                setError(null)
                setStep('profile')
              }}
            >
              <LayoutDashboard size={16} />
              Choose a different profile
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function PresetReview({ preset }: { preset: HousePreset }) {
  return (
    <div className="ob-review">
      <div className="ob-review-sec">
        <div className="ob-review-h">House &amp; risk</div>
        <dl style={{ margin: 0 }}>
          <Def k="Game RTP (all adjustable games)" v={`${pct(preset.rtp)} · ${pct(1 - preset.rtp)} edge`} />
          <Def k="Credit-use alert at" v={pct(preset.creditUtil)} />
          <Def k="Exposure alert cap" v={preset.exposureCap == null ? 'Off' : formatMoney(preset.exposureCap)} />
          <Def k="Default credit line" v={formatMoney(preset.defaultCreditLimit)} />
          <Def k="Settlement cadence" v={`${preset.settlementPeriodDays} days`} />
        </dl>
      </div>
      <div className="ob-review-sec">
        <div className="ob-review-h">Starter promo templates</div>
        {preset.promos.map((promo) => (
          <div className="ob-promo" key={promo.name}>
            <span className="nm">
              {promo.name}
              <em>{promo.type === 'freeplay' ? 'Free play' : 'Bonus'}</em>
            </span>
            <span className="amt">{formatMoney(promo.cents)}</span>
          </div>
        ))}
        <p className="auth-hint-text" style={{ marginTop: 8 }}>
          Suggestions only — run them from Promotions when you&apos;re ready.
        </p>
      </div>
    </div>
  )
}

function Def({ k, v }: { k: string; v: string }) {
  return (
    <div className="ob-def">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function labelFor(key: PresetKey | null): string {
  return PRESET_LIST.find((p) => p.key === key)?.label ?? 'a custom'
}
