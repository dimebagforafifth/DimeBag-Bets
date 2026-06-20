/**
 * Betting Splits — operator console tile. A read-only oversight of where the book's action is
 * sitting: the most-bet markets across the whole tenant, with the bets%-vs-handle% lean on each.
 * Pure projection over recorded bets; mints nothing, mutates nothing. Plugs into the console
 * registry's FeatureManifest seam (see ../manifest.ts).
 */

import { useState, useSyncExternalStore } from 'react'
import { getBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import { PanelShell } from '../../features/operations/shared.js'
import { mostBetMarketsFor, splitsVersion, subscribeSplits } from '../source.js'
import type { RankBy } from '../types.js'
import './splits.css'

const pct = (n: number): string => `${Math.round(n)}%`
const MARKET_LABEL: Record<string, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
  prop: 'Prop',
}

export function SplitsConsolePanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeSplits, splitsVersion)
  const [rankBy, setRankBy] = useState<RankBy>('tickets')
  // Tenant-wide oversight: the whole book is the tenant (global scope ignores the viewer id).
  const viewerId = getBook().managerId
  const ranked = mostBetMarketsFor(viewerId, 'global', { by: rankBy, limit: 50 })
  const totalTickets = ranked.reduce((s, r) => s + r.split.totalTickets, 0)
  const totalHandle = ranked.reduce((s, r) => s + r.split.totalHandleCents, 0)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h2 className="feat-h1">Betting Splits</h2>
          <p className="feat-sub">
            Public bets % vs handle % by market, across the book. Read-only — projected from
            recorded action, never a credit moved.
          </p>
        </div>
        <div className="sp-toggle" role="group" aria-label="Rank by">
          <button
            type="button"
            className={`sp-pill ${rankBy === 'tickets' ? 'is-on' : ''}`}
            onClick={() => setRankBy('tickets')}
          >
            Most bets
          </button>
          <button
            type="button"
            className={`sp-pill ${rankBy === 'handle' ? 'is-on' : ''}`}
            onClick={() => setRankBy('handle')}
          >
            Most handle
          </button>
        </div>
      </header>

      <section className="feat-kpis" aria-label="Splits overview">
        <div className="feat-kpi">
          <span className="feat-label">Markets with action</span>
          <strong>{ranked.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Tickets</span>
          <strong>{totalTickets}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Handle</span>
          <strong>{formatMoney(totalHandle)}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Most-bet markets</h3>
        {ranked.length === 0 ? (
          <p className="sp-empty">No recorded action yet.</p>
        ) : (
          <table className="feat-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Public lean</th>
                <th className="num">Bets %</th>
                <th className="num">Handle %</th>
                <th className="num">Tickets</th>
                <th className="num">Handle</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ split, lean }) => (
                <tr key={split.marketId}>
                  <td>
                    <div className="sp-cell-id">
                      <span className="sp-event">{split.eventLabel}</span>
                      <span className="sp-market">
                        {MARKET_LABEL[split.marketType] ?? split.marketType} · {split.leagueId}
                      </span>
                    </div>
                  </td>
                  <td>{lean ? lean.pick : '—'}</td>
                  <td className="num">{lean ? pct(lean.ticketPct) : '—'}</td>
                  <td className="num">{lean ? pct(lean.handlePct) : '—'}</td>
                  <td className="num">{split.totalTickets}</td>
                  <td className="num">{formatMoney(split.totalHandleCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </PanelShell>
  )
}
