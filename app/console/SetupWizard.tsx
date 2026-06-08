import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { PRESET_LIST, applyPreset, type HousePreset, type PresetKey } from './presets.js'
import { completeSetup, getSetup, getSetupVersion, subscribeSetup } from './setup-store.js'

const pct = (n: number): string => `${Math.round(n * 100)}%`

/**
 * New-manager setup wizard (CLAUDE.md §2). Three steps — pick a profile, review what
 * it changes, apply — that drop a coherent house + risk config onto a fresh book in
 * one move. Applying writes only through public config setters (see presets.ts): no
 * money moves and no bonus is sent. Re-runnable any time to re-baseline the book.
 */
export function SetupWizard() {
  const v = useSyncExternalStore(subscribeSetup, getSetupVersion)
  const setup = useMemo(() => getSetup(), [v])

  const [step, setStep] = useState<'choose' | 'review' | 'done'>('choose')
  const [selected, setSelected] = useState<PresetKey>(setup.preset ?? 'balanced')
  const preset = PRESET_LIST.find((p) => p.key === selected) ?? PRESET_LIST[1]

  const apply = () => {
    applyPreset(selected)
    completeSetup(selected, preset.promos, Date.now())
    setStep('done')
  }

  return (
    <div className="con-wiz">
      <header className="con-wiz-head">
        <div>
          <h1 className="con-h1">Setup</h1>
          <p className="con-sub">
            {setup.completed
              ? `Currently on the ${labelFor(setup.preset)} profile. Re-run any time to re-baseline.`
              : 'Pick a starting profile to configure your house edge, credit, and alerts in one step.'}
          </p>
        </div>
        <ol className="con-wiz-steps" aria-label="Steps">
          <li className={step === 'choose' ? 'is-on' : ''}>1 · Profile</li>
          <li className={step === 'review' ? 'is-on' : ''}>2 · Review</li>
          <li className={step === 'done' ? 'is-on' : ''}>3 · Done</li>
        </ol>
      </header>

      {step === 'choose' && (
        <>
          <div className="con-preset-grid" role="radiogroup" aria-label="House profile">
            {PRESET_LIST.map((p) => (
              <button
                key={p.key}
                role="radio"
                aria-checked={p.key === selected}
                className={`con-preset ${p.key === selected ? 'is-on' : ''}`}
                onClick={() => setSelected(p.key)}
              >
                <span className="con-preset-name">{p.label}</span>
                <span className="con-preset-rtp">{pct(p.rtp)} RTP</span>
                <span className="con-preset-blurb">{p.blurb}</span>
              </button>
            ))}
          </div>
          <div className="con-wiz-foot">
            <button className="con-btn con-btn-primary" onClick={() => setStep('review')}>
              Review {preset.label} →
            </button>
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <PresetReview preset={preset} />
          <div className="con-wiz-foot">
            <button className="con-btn" onClick={() => setStep('choose')}>
              ← Back
            </button>
            <button className="con-btn con-btn-primary" onClick={apply}>
              Apply {preset.label}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <section className="con-card" aria-label="Applied">
          <h2 className="con-h2">✓ {preset.label} applied</h2>
          <p className="con-sub">
            House edge, credit, and risk alerts are set across the book. Your starter promos are
            ready to run from the Promotions tab — nothing was sent automatically.
          </p>
          <PresetReview preset={preset} />
          <div className="con-wiz-foot">
            <button className="con-btn" onClick={() => setStep('choose')}>
              Choose a different profile
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function PresetReview({ preset }: { preset: HousePreset }) {
  return (
    <div className="con-review">
      <section className="con-card" aria-label="House & risk">
        <h2 className="con-h2">House &amp; risk</h2>
        <dl className="con-defs">
          <Def
            k="Game RTP (all adjustable games)"
            v={`${pct(preset.rtp)} (${pct(1 - preset.rtp)} edge)`}
          />
          <Def k="Credit-use alert at" v={pct(preset.creditUtil)} />
          <Def
            k="Exposure alert cap"
            v={preset.exposureCap == null ? 'Off' : formatMoney(preset.exposureCap)}
          />
          <Def k="Default credit line" v={formatMoney(preset.defaultCreditLimit)} />
          <Def k="Settlement cadence" v={`${preset.settlementPeriodDays} days`} />
        </dl>
      </section>
      <section className="con-card" aria-label="Starter promos">
        <h2 className="con-h2">Starter promo templates</h2>
        <ul className="con-list">
          {preset.promos.map((promo) => (
            <li key={promo.name}>
              <span className="con-list-name">
                {promo.name}{' '}
                <em className="con-tag">{promo.type === 'freeplay' ? 'Free play' : 'Bonus'}</em>
              </span>
              <span className="con-list-num">{formatMoney(promo.cents)}</span>
            </li>
          ))}
        </ul>
        <p className="con-hint">Suggestions only — run them from Promotions when you're ready.</p>
      </section>
    </div>
  )
}

function Def({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  )
}

function labelFor(key: PresetKey | null): string {
  return PRESET_LIST.find((p) => p.key === key)?.label ?? 'a custom'
}
