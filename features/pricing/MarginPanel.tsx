/**
 * Margin & Pricing — the operator's hold-posture control (the Pinnacle-vs-recreational
 * knob). Sets the house margin the book runs: a base rate plus optional per-market
 * overrides (props usually carry more juice than the main lines), or a one-click posture
 * preset. Writes the live `lib/odds` margin config, which the poller reads each cycle, so a
 * change reprices the next poll. It moves no money and needs no keys — pure pricing config.
 *
 * The correlated same-game-parlay pricing is unaffected: it simply receives the resolved
 * per-market rate instead of the old hard-coded constant.
 */
import { useSyncExternalStore } from 'react'
import {
  getMarginConfig,
  getMarginVersion,
  subscribeMargin,
  setBaseMargin,
  setMarketMargin,
  applyPosture,
  resolveMargin,
  MARGIN_POSTURES,
  type MarginConfig,
  type MarginPosture,
  type MarketType,
} from '../../lib/odds/index.js'
import { PanelShell } from '../_desk/shared.js'

const POSTURES: { value: MarginPosture; label: string; hint: string }[] = [
  { value: 'recreational', label: 'Recreational', hint: 'Fat juice, softer players, lower limits' },
  { value: 'balanced', label: 'Balanced', hint: 'The book’s standard hold' },
  { value: 'sharp', label: 'Sharp', hint: 'Thin juice, high limits, Pinnacle-style' },
]

const MARKETS: { type: MarketType; label: string }[] = [
  { type: 'moneyline', label: 'Moneyline' },
  { type: 'spread', label: 'Spread' },
  { type: 'total', label: 'Total' },
  { type: 'prop', label: 'Player props' },
]

const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`

/** Does the live config exactly match a named posture? (drives the active highlight) */
function matchesPosture(config: MarginConfig, posture: MarginPosture): boolean {
  const preset = MARGIN_POSTURES[posture]
  if (config.base !== preset.base) return false
  const keys = new Set([
    ...Object.keys(config.perMarket ?? {}),
    ...Object.keys(preset.perMarket ?? {}),
  ])
  for (const k of keys) {
    const a = config.perMarket?.[k as MarketType]
    const b = preset.perMarket?.[k as MarketType]
    if ((a ?? null) !== (b ?? null)) return false
  }
  return true
}

export function MarginPanel({ onBack }: { onBack: () => void }) {
  // Subscribe for re-renders; `v` also keys the cards so they remount-resync on a change.
  const v = useSyncExternalStore(subscribeMargin, getMarginVersion)
  const config = getMarginConfig()
  const activePosture = POSTURES.find((p) => matchesPosture(config, p.value))?.value ?? null

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Your hold posture — how much juice the book runs. The base margin applies to every market;
          a per-market override lets you run, say, tighter moneylines and fatter props. Changes
          reprice the next poll. Same-game-parlay pricing follows the per-market rate.
        </p>
      </header>

      <section className="feat-card" aria-label="Posture presets" key={`p-${v}`}>
        <span className="feat-label">Posture</span>
        <div className="feat-actions">
          {POSTURES.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`feat-btn${activePosture === p.value ? ' is-active' : ''}`}
              aria-pressed={activePosture === p.value}
              title={p.hint}
              onClick={() => applyPosture(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="feat-card feat-grid" aria-label="Margin rates" key={`r-${v}`}>
        <label className="feat-field">
          <span className="feat-label">Base margin (%)</span>
          <input
            className="feat-input"
            type="number"
            min={0}
            max={50}
            step={0.25}
            defaultValue={(config.base * 100).toFixed(2)}
            onKeyDown={blurOnEnter}
            onBlur={(e) => setBaseMargin(Number(e.target.value) / 100)}
          />
        </label>

        {MARKETS.map((m) => {
          const override = config.perMarket?.[m.type]
          return (
            <label className="feat-field" key={m.type}>
              <span className="feat-label">{m.label} override (%, blank = base)</span>
              <input
                className="feat-input"
                type="number"
                min={0}
                max={50}
                step={0.25}
                placeholder={`base ${pct(config.base)}`}
                defaultValue={override == null ? '' : (override * 100).toFixed(2)}
                onKeyDown={blurOnEnter}
                onBlur={(e) =>
                  setMarketMargin(
                    m.type,
                    e.target.value.trim() === '' ? null : Number(e.target.value) / 100,
                  )
                }
              />
              <span className="feat-sub">effective {pct(resolveMargin(config, m.type))}</span>
            </label>
          )
        })}
      </section>
    </PanelShell>
  )
}
