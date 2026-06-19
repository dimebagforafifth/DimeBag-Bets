/**
 * SGP Rules & Strictness — the operator console panel for the same-game-parlay conflict engine
 * (PART 1). Sets the tenant strictness + leg cap and shows the immutable hard-block matrix.
 * block_contradictions can never be turned off (agents inherit the tenant config and can't drop
 * below it). Consumes the global tokens — no per-feature palette. Renders only its body.
 */

import { useSyncExternalStore } from 'react'
import {
  HARD_BLOCK_MATRIX,
  HARD_MAX_LEGS,
  STRICTNESS_MAX_LEGS,
  currentStrictnessConfig,
  getSgpRulesVersion,
  setMaxLegs,
  setStrictness,
  subscribeSgpRules,
  type SgpStrictness,
} from './sgp-rules.js'
import './sgp-rules.css'

const STRICTNESS: { key: SgpStrictness; label: string; hint: string }[] = [
  { key: 'strict', label: 'Strict', hint: 'Tightest — caps legs low, blocks every contradiction' },
  { key: 'standard', label: 'Standard', hint: 'Industry default' },
  { key: 'loose', label: 'Loose', hint: 'Maximum legs, contradictions still blocked' },
]

export function SgpRulesPanel() {
  useSyncExternalStore(subscribeSgpRules, getSgpRulesVersion, getSgpRulesVersion)
  const cfg = currentStrictnessConfig()

  return (
    <section className="sgpr">
      <header className="sgpr-head">
        <h2 className="sgpr-title">SGP Rules &amp; Strictness</h2>
        <p className="sgpr-sub">
          How same-game parlays are validated before pricing. Contradictions (both sides of a total,
          both moneylines, nested props) are <strong>always</strong> blocked — agents inherit this
          and can’t turn it off.
        </p>
      </header>

      <div className="sgpr-field">
        <span className="sgpr-label">Strictness</span>
        <div className="sgpr-seg" role="radiogroup" aria-label="Strictness">
          {STRICTNESS.map((s) => (
            <button
              key={s.key}
              role="radio"
              aria-checked={cfg.strictness === s.key}
              className={`sgpr-seg-btn ${cfg.strictness === s.key ? 'is-on' : ''}`}
              onClick={() => setStrictness(s.key)}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="sgpr-hint">{STRICTNESS.find((s) => s.key === cfg.strictness)?.hint}</p>
      </div>

      <div className="sgpr-field">
        <span className="sgpr-label">Max legs</span>
        <div className="sgpr-stepper">
          <button
            className="sgpr-step"
            aria-label="fewer legs"
            disabled={cfg.max_legs <= 2}
            onClick={() => setMaxLegs(cfg.max_legs - 1)}
          >
            −
          </button>
          <span className="sgpr-step-val">{cfg.max_legs}</span>
          <button
            className="sgpr-step"
            aria-label="more legs"
            disabled={cfg.max_legs >= HARD_MAX_LEGS}
            onClick={() => setMaxLegs(cfg.max_legs + 1)}
          >
            +
          </button>
          <span className="sgpr-step-cap">of {HARD_MAX_LEGS} max</span>
        </div>
        <p className="sgpr-hint">
          This preset defaults to {STRICTNESS_MAX_LEGS[cfg.strictness]} legs; an 11th leg on a
          10-cap tenant is rejected.
        </p>
      </div>

      <div className="sgpr-field">
        <span className="sgpr-label">
          Hard-block matrix <span className="sgpr-lock">· always on</span>
        </span>
        <table className="sgpr-matrix">
          <tbody>
            {HARD_BLOCK_MATRIX.map((row) => (
              <tr key={row.pair}>
                <td className="sgpr-pair">{row.pair}</td>
                <td className="sgpr-outcome">{row.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
