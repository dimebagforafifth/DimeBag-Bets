/**
 * Boosts admin (manager) — compose profit / odds boosts and enable them. A boost is a bonus-rule
 * offer with a slip qualifier; saving one writes its bonus-engine rule. Nothing here moves money —
 * the uplift is granted at settlement through the engine. Rides the rewards admin manifest.
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { formatMoney, toCents } from '../../../games/shared/money.js'
import { getBonusGrants, getBonusGrantsVersion, subscribeBonusGrants } from '../../bonus/index.js'
import {
  getBoosts,
  getBoostsVersion,
  removeBoost,
  seedBoostsDemo,
  setBoostEnabled,
  subscribeBoosts,
  upsertBoost,
} from '../store.js'
import { armBoostEngine } from '../engine.js'
import type { BonusEligibility } from '../../bonus/index.js'
import type { BoostDef, BoostType } from '../types.js'
import './boosts.css'

const DAY = 86_400_000

type Audience = 'everyone' | 'vip' | 'at-risk' | 'gold-plus'
const AUDIENCES: { key: Audience; label: string; eligibility: BonusEligibility }[] = [
  { key: 'everyone', label: 'Everyone', eligibility: {} },
  { key: 'vip', label: 'VIP segment', eligibility: { segments: ['vip'] } },
  { key: 'at-risk', label: 'At-risk segment', eligibility: { segments: ['at-risk'] } },
  {
    key: 'gold-plus',
    label: 'Gold tier +',
    eligibility: { tiers: ['gold', 'platinum', 'diamond'] },
  },
]

const SPORTS = ['', 'BASKETBALL', 'FOOTBALL', 'BASEBALL', 'HOCKEY', 'SOCCER']
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'boost'

export function BoostsPanel({ onBack }: { onBack: () => void }): ReactNode {
  useSyncExternalStore(subscribeBoosts, getBoostsVersion, getBoostsVersion)
  useSyncExternalStore(subscribeBonusGrants, getBonusGrantsVersion, getBonusGrantsVersion)
  // Seed demo boosts + go live while the operator is in the desk (opt-in, like the bonus panel).
  useEffect(() => {
    seedBoostsDemo(Date.now())
    armBoostEngine()
  }, [])

  const boosts = getBoosts()
  const boostIds = new Set(boosts.map((b) => b.id))
  const grants = getBonusGrants().filter((g) => boostIds.has(g.ruleId))

  return (
    <section className="boosts">
      <header className="boosts-head">
        <button className="boosts-back" onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1 className="boosts-h1">Boosts</h1>
          <p className="boosts-sub">
            Profit &amp; odds boosts — issued at settlement through the bonus engine. Credits only.
          </p>
        </div>
      </header>

      <Composer />

      <div className="boosts-section">
        <h2 className="boosts-h2">Live &amp; drafted boosts</h2>
        {boosts.length === 0 ? (
          <p className="boosts-empty">No boosts yet — compose one above.</p>
        ) : (
          <div className="boosts-list">
            {boosts.map((b) => (
              <BoostRow key={b.id} boost={b} />
            ))}
          </div>
        )}
      </div>

      {grants.length > 0 && (
        <div className="boosts-section">
          <h2 className="boosts-h2">Recent boost grants</h2>
          <div className="boosts-grants">
            {grants.slice(0, 8).map((g) => (
              <div className="boosts-grant" key={g.id}>
                <span className="boosts-grant-name">{g.playerName}</span>
                <span className="boosts-grant-rule">{g.ruleName}</span>
                <span className="boosts-grant-amt">{formatMoney(g.grantedCents)}</span>
                <span className={`boosts-grant-status is-${g.status}`}>{g.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function BoostRow({ boost }: { boost: BoostDef }): ReactNode {
  const q = boost.qualifier
  const bits = [
    boost.boostType === 'odds' ? 'odds' : 'profit',
    `+${boost.pct}%`,
    q.sgpOnly ? 'SGP' : null,
    q.sports?.length ? q.sports.join('/') : null,
    q.minLegs ? `${q.minLegs}+ legs` : null,
    boost.maxWinCents != null ? `cap ${formatMoney(boost.maxWinCents)}` : 'uncapped',
  ].filter(Boolean)
  return (
    <div className={`boosts-row ${boost.enabled ? 'is-on' : ''}`}>
      <div className="boosts-row-main">
        <span className="boosts-row-name">{boost.name}</span>
        <span className="boosts-row-bits">{bits.join(' · ')}</span>
      </div>
      <div className="boosts-row-actions">
        <button
          className={`boosts-toggle ${boost.enabled ? 'is-on' : ''}`}
          onClick={() => setBoostEnabled(boost.id, !boost.enabled)}
        >
          {boost.enabled ? 'Enabled' : 'Disabled'}
        </button>
        <button
          className="boosts-remove"
          onClick={() => removeBoost(boost.id)}
          aria-label={`Remove ${boost.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function Composer(): ReactNode {
  const [name, setName] = useState('')
  const [boostType, setBoostType] = useState<BoostType>('profit')
  const [pct, setPct] = useState(25)
  const [maxWin, setMaxWin] = useState(100) // dollars; 0 = uncapped
  const [playthroughX, setPlaythroughX] = useState(1)
  const [expiryDays, setExpiryDays] = useState(7)
  const [audience, setAudience] = useState<Audience>('everyone')
  const [sport, setSport] = useState('')
  const [minLegs, setMinLegs] = useState(1)
  const [sgpOnly, setSgpOnly] = useState(false)

  const valid = name.trim().length > 0 && pct > 0

  function create(): void {
    if (!valid) return
    const elig = AUDIENCES.find((a) => a.key === audience)!.eligibility
    const def: BoostDef = {
      id: `boost-${slug(name)}`,
      name: name.trim(),
      enabled: true,
      boostType,
      pct,
      maxWinCents: maxWin > 0 ? toCents(maxWin) : null,
      playthroughX,
      expiryMs: Math.max(1, expiryDays) * DAY,
      eligibility: elig,
      qualifier: {
        sports: sport ? [sport] : undefined,
        minLegs: minLegs > 1 ? minLegs : undefined,
        sgpOnly: sgpOnly || undefined,
      },
    }
    upsertBoost(def)
    setName('')
  }

  return (
    <div className="boosts-composer">
      <h2 className="boosts-h2">Compose a boost</h2>
      <div className="boosts-form">
        <label className="boosts-field boosts-field-wide">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="NBA SGP Boost"
          />
        </label>
        <label className="boosts-field">
          <span>Type</span>
          <select value={boostType} onChange={(e) => setBoostType(e.target.value as BoostType)}>
            <option value="profit">Profit boost</option>
            <option value="odds">Odds boost</option>
          </select>
        </label>
        <label className="boosts-field">
          <span>Boost %</span>
          <input
            type="number"
            min={1}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
          />
        </label>
        <label className="boosts-field">
          <span>Max win ($, 0 = none)</span>
          <input
            type="number"
            min={0}
            value={maxWin}
            onChange={(e) => setMaxWin(Number(e.target.value))}
          />
        </label>
        <label className="boosts-field">
          <span>Playthrough ×</span>
          <input
            type="number"
            min={0}
            value={playthroughX}
            onChange={(e) => setPlaythroughX(Number(e.target.value))}
          />
        </label>
        <label className="boosts-field">
          <span>Expiry (days)</span>
          <input
            type="number"
            min={1}
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          />
        </label>
        <label className="boosts-field">
          <span>Audience</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {AUDIENCES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="boosts-field">
          <span>Sport</span>
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s ? s[0] + s.slice(1).toLowerCase() : 'Any'}
              </option>
            ))}
          </select>
        </label>
        <label className="boosts-field">
          <span>Min legs</span>
          <input
            type="number"
            min={1}
            value={minLegs}
            onChange={(e) => setMinLegs(Number(e.target.value))}
          />
        </label>
        <label className="boosts-field boosts-field-check">
          <input type="checkbox" checked={sgpOnly} onChange={(e) => setSgpOnly(e.target.checked)} />
          <span>Same-game only</span>
        </label>
      </div>
      <button className="boosts-create" disabled={!valid} onClick={create}>
        Create boost
      </button>
    </div>
  )
}
