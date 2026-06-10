import { useState, useSyncExternalStore } from 'react'
import {
  getRules,
  getRulesVersion,
  subscribeRules,
  updateRules,
  type RulesConfig,
} from './rules-store.js'
import { toCents, toDollars } from '../../games/shared/money.js'
import './catalog.css'
import './rules.css'

/**
 * Rules — the book-level TRADING & GRADING rulebook (Catalog ▸ Rules). A clean,
 * search-light settings form grouped into three cards that mirror CLAUDE.md §4
 * (house rules) and §3 (the money contract). Everything here is a DEFAULT that the
 * sportsbook's pricing/grading and per-player Limits read from — this panel moves
 * NO money and edits NO live account (CLAUDE.md §3); it only writes to rules-store.
 *
 * Scope is trading/grading ONLY. Tenant Settings (branding, presentation, cadence)
 * are a separate lane in control/ — not touched here.
 *
 * COINS ONLY. Amount fields are edited in whole/decimal COINS and stored as integer
 * cents (games/shared/money.ts). We render the unit as the word "coins" rather than
 * formatMoney() because the default money display prints a "$" symbol, which the
 * coins-only rule forbids.
 *
 *   // SEAM: Save writes to the in-memory rules-store only; persist to the
 *   //       server / settings-store later.
 */

/** A unit hint shown to the right of a numeric input. */
type Unit = 'coins' | '%' | '×' | 'legs' | 'min'

/** Render a draft string from an editable coin amount stored as cents. */
function coinsField(cents: number): string {
  return String(toDollars(cents))
}

/** Parse a coins draft string back into integer cents (clamped ≥ 0). */
function coinsToCents(draft: string): number {
  return toCents(Number(draft) || 0)
}

export function RulesPanel({ onBack }: { onBack: () => void }) {
  // onBack is handled by the shell's top bar; this body ignores it.
  void onBack
  useSyncExternalStore(subscribeRules, getRulesVersion)
  const rules = getRules()

  return (
    <div className="feat feat-stack">
      <GradingSection rules={rules} />
      <LimitsSection rules={rules} />
      <ResponsibleSection rules={rules} />
    </div>
  )
}

/* ----------------------------- shared controls ---------------------------- */

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="rules-sec-head">
      <h3 className="feat-h">{title}</h3>
      <p className="feat-note">{note}</p>
    </div>
  )
}

function Toggle({
  name,
  desc,
  on,
  onChange,
}: {
  name: string
  desc: string
  on: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="rules-toggle">
      <span className="rules-toggle-text">
        <span className="rules-toggle-name">{name}</span>
        <span className="feat-note">{desc}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={name}
        className={`rules-switch${on ? ' is-on' : ''}`}
        onClick={() => onChange(!on)}
      />
    </div>
  )
}

function NumField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string
  unit: Unit
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label className="feat-field">
      <span>{label}</span>
      <span className="rules-input-unit">
        <input
          className="feat-input"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="rules-unit">{unit}</span>
      </span>
    </label>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rules-info-row">
      <span className="rules-info-key">{label}</span>
      <span className="rules-info-val">{value}</span>
    </div>
  )
}

function SaveRow({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <div className="rules-save">
      <button type="button" className="feat-btn is-primary" onClick={onSave}>
        Save
      </button>
      {saved && <p className="feat-ok">Saved.</p>}
    </div>
  )
}

/* ------------------------------ 1) Grading -------------------------------- */

function GradingSection({ rules }: { rules: RulesConfig }) {
  const [voidNonOfficial, setVoid] = useState(rules.voidNonOfficial)
  const [pushReturns, setPush] = useState(rules.pushReturnsStake)
  const [saved, setSaved] = useState(false)

  function save() {
    updateRules({ voidNonOfficial, pushReturnsStake: pushReturns })
    setSaved(true)
  }
  function touch<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setSaved(false)
    }
  }

  return (
    <section className="feat-form">
      <SectionHead
        title="Grading rules"
        note="House rules for settling bets (CLAUDE.md §4). Half-point lines can't push; official results are the source of truth."
      />
      <Toggle
        name="Void non-official games"
        desc="A game that never goes far enough to be official voids the bet and returns the stake."
        on={voidNonOfficial}
        onChange={touch(setVoid)}
      />
      <Toggle
        name="Push returns stake"
        desc="An exact tie on a spread or total is a push — no win or loss, stake returned."
        on={pushReturns}
        onChange={touch(setPush)}
      />
      <Toggle
        name="Half-point lines can't push"
        desc="Informational — a ½-point line (e.g. −2.5) has no exact tie, so it never pushes. Fixed rule."
        on={true}
        onChange={() => {}}
      />
      <div className="feat-card">
        <h4 className="feat-h">Official-game thresholds</h4>
        <p className="feat-note">
          How far a game must go to stand (otherwise void, stake returned). Informational, per league.
        </p>
        <InfoRow label="NFL" value="Full game" />
        <InfoRow label="NBA" value="43 of 48 min" />
        <InfoRow label="MLB — moneyline" value="5 innings (4½ if home leads)" />
        <InfoRow label="MLB — run line / totals" value="Full 9 (8½)" />
        <InfoRow label="NHL / soccer" value="Full regulation" />
      </div>
      <SaveRow saved={saved} onSave={save} />
    </section>
  )
}

/* ------------------------- 2) Market & limit defaults --------------------- */

function LimitsSection({ rules }: { rules: RulesConfig }) {
  const [margin, setMargin] = useState(String(rules.defaultMarginPct))
  const [maxBet, setMaxBet] = useState(coinsField(rules.defaultMaxBetCents))
  const [marketLimit, setMarketLimit] = useState(coinsField(rules.defaultMarketLimitCents))
  const [legs, setLegs] = useState(String(rules.maxParlayLegs))
  const [payoutCap, setPayoutCap] = useState(String(rules.maxParlayPayoutX))
  const [saved, setSaved] = useState(false)

  function touch(set: (v: string) => void) {
    return (v: string) => {
      set(v)
      setSaved(false)
    }
  }
  function save() {
    updateRules({
      defaultMarginPct: Math.max(0, Number(margin) || 0),
      defaultMaxBetCents: coinsToCents(maxBet),
      defaultMarketLimitCents: coinsToCents(marketLimit),
      maxParlayLegs: Math.max(1, Math.round(Number(legs) || 1)),
      maxParlayPayoutX: Math.max(1, Math.round(Number(payoutCap) || 1)),
    })
    setSaved(true)
  }

  return (
    <section className="feat-form">
      <SectionHead
        title="Market & limit defaults"
        note="Default pricing margin and the limit ceilings every market and parlay inherits (CLAUDE.md §4). Per-player Limits can tighten these."
      />
      <div className="rules-grid">
        <NumField label="Default margin / vig" unit="%" value={margin} onChange={touch(setMargin)} />
        <NumField label="Default max bet" unit="coins" value={maxBet} onChange={touch(setMaxBet)} />
        <NumField
          label="Default per-market limit"
          unit="coins"
          value={marketLimit}
          onChange={touch(setMarketLimit)}
        />
        <NumField label="Max parlay legs" unit="legs" value={legs} onChange={touch(setLegs)} />
        <NumField
          label="Max parlay payout"
          unit="×"
          value={payoutCap}
          onChange={touch(setPayoutCap)}
        />
      </div>
      <SaveRow saved={saved} onSave={save} />
    </section>
  )
}

/* ----------------------- 3) Responsible-play params ----------------------- */

function ResponsibleSection({ rules }: { rules: RulesConfig }) {
  const [lossLimit, setLossLimit] = useState(coinsField(rules.dailyLossLimitCents))
  const [reminder, setReminder] = useState(String(rules.sessionReminderMins))
  const [coolOff, setCoolOff] = useState(rules.coolOffEnabled)
  const [saved, setSaved] = useState(false)

  function save() {
    updateRules({
      dailyLossLimitCents: coinsToCents(lossLimit),
      sessionReminderMins: Math.max(0, Math.round(Number(reminder) || 0)),
      coolOffEnabled: coolOff,
    })
    setSaved(true)
  }
  function touch<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v)
      setSaved(false)
    }
  }

  return (
    <section className="feat-form">
      <SectionHead
        title="Responsible-play parameters"
        note="Book-level defaults for healthy play — distinct from per-player Limits and from tenant Settings."
      />
      <div className="rules-grid">
        <NumField
          label="Default daily loss limit"
          unit="coins"
          value={lossLimit}
          onChange={touch(setLossLimit)}
        />
        <NumField
          label="Session-time reminder"
          unit="min"
          value={reminder}
          onChange={touch(setReminder)}
        />
      </div>
      <Toggle
        name="Cool-off enabled"
        desc="Offer players a self-exclusion cool-off period from the lobby."
        on={coolOff}
        onChange={touch(setCoolOff)}
      />
      <SaveRow saved={saved} onSave={save} />
    </section>
  )
}
