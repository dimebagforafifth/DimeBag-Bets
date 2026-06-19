/**
 * Trading Desk — the operator console tile (Round 2, Lane B). One workspace for the post-pipeline
 * controls: pricing config (margin / posture / de-vig, writing Lane A's pricing_config), line
 * overrides, stake/payout limits, market suspensions, and a live hold readout per market
 * (true prob vs published odds vs hold%). Consumes the global tokens. Renders only its body.
 *
 * // SEAM (wiring): the acting role (manager vs agent) + downline scope come from auth; here a
 * toggle stands in so the floor rule (an agent can't widen margin below the manager floor) is
 * demonstrable end-to-end. The pricing rows write the interface store that Lane A's pricing_config
 * supersedes at wiring.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney, toCents } from '../games/shared/money.js'
import { formatAmerican } from '../app/book/odds-format.js'
import { useBookOdds } from '../app/book/odds-source.js'
import {
  allRows,
  globalRow,
  marginFloor,
  setDevigMethod,
  setMargin,
  setMarginFloor,
  setPosture,
  subscribePricingConfig,
  pricingConfigVersion,
} from './pricing-config.js'
import {
  getOverrides,
  setOverride,
  clearOverride,
  subscribeOverrides,
  overridesVersion,
} from './overrides.js'
import { getLimits, setLimit, removeLimit, subscribeLimits, limitsVersion } from './limits.js'
import { listSuspensions, suspend, unsuspend, subscribeSuspensions } from './suspensions.js'
import { marketHold } from './hold.js'
import { isTradingSeeded, seedTradingDesk } from './seed.js'
import type { DevigMethod, MarginPosture, TradingScope } from './types.js'
import './trading.css'

const POSTURES: MarginPosture[] = ['recreational', 'balanced', 'sharp']
const DEVIG: DevigMethod[] = ['multiplicative', 'additive', 'power', 'shin']
const pct = (f: number) => `${(f * 100).toFixed(2)}%`

type Tab = 'pricing' | 'overrides' | 'limits' | 'suspensions' | 'hold'

export function TradingDeskPanel() {
  useEffect(() => {
    if (!isTradingSeeded()) seedTradingDesk(Date.now())
  }, [])
  const [tab, setTab] = useState<Tab>('pricing')
  const [agent, setAgent] = useState(false)

  return (
    <div className="td">
      <div className="td-top">
        <nav className="td-tabs" role="tablist">
          {(['pricing', 'overrides', 'limits', 'suspensions', 'hold'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`td-tab ${tab === t ? 'is-on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'hold' ? 'Hold' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <label
          className="td-role"
          title="Agents inherit the manager config and can't widen margin below the floor"
        >
          <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} />{' '}
          Acting as agent
        </label>
      </div>

      {tab === 'pricing' && <PricingSection agent={agent} />}
      {tab === 'overrides' && <OverridesSection />}
      {tab === 'limits' && <LimitsSection />}
      {tab === 'suspensions' && <SuspensionsSection />}
      {tab === 'hold' && <HoldSection />}
    </div>
  )
}

function PricingSection({ agent }: { agent: boolean }) {
  useSyncExternalStore(subscribePricingConfig, pricingConfigVersion, pricingConfigVersion)
  const g = globalRow()
  const floor = marginFloor()
  const rows = allRows().filter((r) => r.scope !== 'global')
  const [sport, setSport] = useState('')

  return (
    <section className="td-sec">
      <h3 className="td-h">
        Pricing config {agent && <span className="td-floor-tag">agent — floor {pct(floor)}</span>}
      </h3>
      <div className="td-row">
        <span className="td-k">Global margin</span>
        <input
          type="range"
          min={Math.round(floor * 1000)}
          max={120}
          value={Math.round(g.margin * 1000)}
          aria-label="global margin"
          onChange={(e) =>
            setMargin('global', '', Number(e.target.value) / 1000, { asAgent: agent })
          }
        />
        <span className="td-v">{pct(g.margin)}</span>
      </div>
      {!agent && (
        <div className="td-row">
          <span className="td-k">Margin floor (manager)</span>
          <input
            type="range"
            min={0}
            max={80}
            value={Math.round(floor * 1000)}
            aria-label="margin floor"
            onChange={(e) => setMarginFloor(Number(e.target.value) / 1000)}
          />
          <span className="td-v">{pct(floor)}</span>
        </div>
      )}
      <div className="td-row">
        <span className="td-k">Posture</span>
        <Segmented
          options={POSTURES}
          value={g.posture}
          onChange={(p) => setPosture('global', '', p as MarginPosture)}
        />
      </div>
      <div className="td-row">
        <span className="td-k">De-vig method</span>
        <select
          value={g.devig_method}
          onChange={(e) => setDevigMethod('global', '', e.target.value as DevigMethod)}
        >
          {DEVIG.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <h4 className="td-sub">Per-sport overrides</h4>
      <div className="td-addrow">
        <input
          className="td-in"
          placeholder="SPORT (e.g. FOOTBALL)"
          value={sport}
          onChange={(e) => setSport(e.target.value.toUpperCase())}
        />
        <button
          className="td-btn"
          disabled={!sport}
          onClick={() => {
            setMargin('sport', sport, g.margin, { asAgent: agent })
            setSport('')
          }}
        >
          Add sport row
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="td-empty">
          No per-sport/market rows — every market inherits the global config.
        </p>
      ) : (
        rows.map((r) => (
          <div className="td-row" key={`${r.scope}:${r.key}`}>
            <span className="td-k">
              {r.scope}:{r.key}
            </span>
            <input
              type="range"
              min={Math.round(floor * 1000)}
              max={120}
              value={Math.round(r.margin * 1000)}
              aria-label={`${r.key} margin`}
              onChange={(e) =>
                setMargin(r.scope, r.key, Number(e.target.value) / 1000, { asAgent: agent })
              }
            />
            <span className="td-v">{pct(r.margin)}</span>
          </div>
        ))
      )}
    </section>
  )
}

function OverridesSection() {
  useSyncExternalStore(subscribeOverrides, overridesVersion, overridesVersion)
  const { events } = useBookOdds()
  const overrides = getOverrides()
  const [marketId, setMarketId] = useState('')
  const [selectionId, setSelectionId] = useState('')
  const [odds, setOdds] = useState('-150')

  const markets = useMemo(() => events.flatMap((e) => e.markets), [events])
  const sels = markets.find((m) => m.marketId === marketId)?.selections ?? []

  const submit = () => {
    if (!marketId || !selectionId) return
    setOverride({
      marketId,
      selectionId,
      override_odds: Number(odds),
      reason: 'manual',
      set_by: 'trader',
      set_at: Date.now(),
    })
    setSelectionId('')
  }

  return (
    <section className="td-sec">
      <h3 className="td-h">Line overrides</h3>
      <div className="td-addrow">
        <select
          className="td-in"
          value={marketId}
          onChange={(e) => {
            setMarketId(e.target.value)
            setSelectionId('')
          }}
        >
          <option value="">Market…</option>
          {markets.map((m) => (
            <option key={m.marketId} value={m.marketId}>
              {m.marketId}
            </option>
          ))}
        </select>
        <select
          className="td-in"
          value={selectionId}
          onChange={(e) => setSelectionId(e.target.value)}
          disabled={!marketId}
        >
          <option value="">Selection…</option>
          {sels.map((s) => (
            <option key={s.selectionId} value={s.selectionId}>
              {s.side} {s.line ?? ''} ({formatAmerican(s.priceDisplay.american)})
            </option>
          ))}
        </select>
        <input
          className="td-in td-odds"
          type="number"
          value={odds}
          onChange={(e) => setOdds(e.target.value)}
          aria-label="override odds"
        />
        <button className="td-btn" disabled={!selectionId} onClick={submit}>
          Override
        </button>
      </div>
      {overrides.length === 0 ? (
        <p className="td-empty">
          No active overrides — published odds come straight from the pipeline.
        </p>
      ) : (
        <ul className="td-list">
          {overrides.map((o) => (
            <li key={o.id} className="td-li">
              <span className="td-mono">{o.marketId}</span>
              <span className="td-pill">{formatAmerican(o.override_odds)}</span>
              <span className="td-muted">{o.reason}</span>
              {o.expires_at && <span className="td-muted">· expires</span>}
              <button className="td-x" onClick={() => clearOverride(o.marketId, o.selectionId)}>
                Clear
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LimitsSection() {
  useSyncExternalStore(subscribeLimits, limitsVersion, limitsVersion)
  const limits = getLimits()
  const [scope, setScope] = useState<TradingScope>('sport')
  const [key, setKey] = useState('')
  const [maxStake, setMaxStake] = useState('2500')
  const [maxPayout, setMaxPayout] = useState('20000')

  const add = () => {
    setLimit({
      scope,
      scope_key: scope === 'global' ? '' : key,
      max_stake_cents: toCents(Number(maxStake)),
      max_payout_cents: toCents(Number(maxPayout)),
      set_by: 'manager',
    })
    setKey('')
  }

  return (
    <section className="td-sec">
      <h3 className="td-h">Stake / payout limits</h3>
      <div className="td-addrow">
        <select
          className="td-in"
          value={scope}
          onChange={(e) => setScope(e.target.value as TradingScope)}
        >
          <option value="global">global</option>
          <option value="sport">sport</option>
          <option value="market">market</option>
        </select>
        <input
          className="td-in"
          placeholder="key"
          value={key}
          disabled={scope === 'global'}
          onChange={(e) => setKey(e.target.value)}
        />
        <input
          className="td-in td-odds"
          type="number"
          value={maxStake}
          onChange={(e) => setMaxStake(e.target.value)}
          aria-label="max stake"
        />
        <input
          className="td-in td-odds"
          type="number"
          value={maxPayout}
          onChange={(e) => setMaxPayout(e.target.value)}
          aria-label="max payout"
        />
        <button className="td-btn" onClick={add}>
          Add limit
        </button>
      </div>
      {limits.length === 0 ? (
        <p className="td-empty">No limits — core's own credit/max-bet caps still apply.</p>
      ) : (
        <ul className="td-list">
          {limits.map((l) => (
            <li key={l.id} className="td-li">
              <span className="td-mono">
                {l.scope}:{l.scope_key || '*'}
              </span>
              <span className="td-muted">≤ {formatMoney(l.max_stake_cents)} stake</span>
              <span className="td-muted">≤ {formatMoney(l.max_payout_cents)} payout</span>
              <span className="td-pill">{l.time_to_event_tier}</span>
              <button className="td-x" onClick={() => removeLimit(l.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SuspensionsSection() {
  useSyncExternalStore(
    subscribeSuspensions,
    () => listSuspensions().length,
    () => listSuspensions().length,
  )
  const suspensions = listSuspensions()
  const [key, setKey] = useState('')

  return (
    <section className="td-sec">
      <h3 className="td-h">Market suspensions</h3>
      <div className="td-addrow">
        <input
          className="td-in"
          placeholder="market/sport key (e.g. prop, FOOTBALL)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          className="td-btn"
          disabled={!key}
          onClick={() => {
            suspend({
              scope: 'market',
              scope_key: key,
              reason: 'manual',
              by: 'trader',
              at: Date.now(),
            })
            setKey('')
          }}
        >
          Suspend
        </button>
      </div>
      {suspensions.length === 0 ? (
        <p className="td-empty">Nothing suspended — all markets open.</p>
      ) : (
        <ul className="td-list">
          {suspensions.map((s) => (
            <li key={s.scope_key} className="td-li">
              <span className="td-mono">{s.scope_key}</span>
              <span className="td-muted">{s.reason}</span>
              <span className="td-muted">· {s.by}</span>
              <button className="td-x" onClick={() => unsuspend(s.scope_key)}>
                Lift
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function HoldSection() {
  const { events } = useBookOdds()
  const rows = events.flatMap((e) =>
    e.markets
      .filter((m) => m.selections.length >= 2 && !m.marketId.includes('-alt'))
      .slice(0, 1)
      .map((m) => ({ event: e, market: m, hold: marketHold(m) })),
  )
  return (
    <section className="td-sec">
      <h3 className="td-h">Live hold — true prob vs published vs hold%</h3>
      <table className="td-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>True</th>
            <th>Published</th>
            <th>Hold%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ event, market, hold }) => (
            <tr key={market.marketId}>
              <td className="td-mono">
                {event.away}@{event.home} · {market.type}
              </td>
              <td>{hold.selections.map((s) => `${(s.trueProb * 100).toFixed(0)}%`).join(' / ')}</td>
              <td>{hold.selections.map((s) => formatAmerican(s.publishedAmerican)).join(' / ')}</td>
              <td className="td-hold">{(hold.holdPct * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <span className="td-seg">
      {options.map((o) => (
        <button
          key={o}
          className={`td-seg-btn ${value === o ? 'is-on' : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </span>
  )
}
