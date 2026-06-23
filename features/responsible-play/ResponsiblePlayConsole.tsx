/**
 * Responsible Play (operator) — a READ-ONLY oversight of player self-limits.
 *
 * The player owns their limits; an operator can SEE who has set what (caps, cool-offs) and their
 * recent activity, but cannot set or lift a player's limit here — that would defeat the purpose.
 * Pure read over the player-owned store + the durable ledger; no control moves money or mutates
 * a limit. Presentation consumes the console shell tokens.
 */

import { useSyncExternalStore } from 'react'
import { PanelShell } from '../_desk/shared.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { getBookLedgerVersion, subscribeBookLedger } from '../../app/book-ledger.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  activityBreakdown,
  effectiveLimitsOf,
  getLimitsVersion,
  limitedPlayerIds,
  limitStateOf,
  subscribeLimits,
} from './index.js'

const fmtDate = (ms: number): string => new Date(ms).toLocaleDateString()
const capText = (l?: { amountCents?: number | null; period?: string | null }): string =>
  l?.amountCents != null ? `${formatMoney(l.amountCents)} / ${l.period ?? 'day'}` : '—'

export function ResponsiblePlayConsole({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeLimits, getLimitsVersion, getLimitsVersion)
  useSyncExternalStore(subscribeBook, getBookVersion, getBookVersion)
  useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion, getBookLedgerVersion)

  const org = getBook()
  const now = Date.now()
  const ids = limitedPlayerIds()
  const rows = ids
    .map((id) => {
      const eff = effectiveLimitsOf(id)
      const state = limitStateOf(id)
      const cooloff = state.cooloff?.active
      const cooloffUntil = cooloff?.until != null && now < cooloff.until ? cooloff.until : null
      const week = activityBreakdown(id, now).week
      return {
        id,
        name: org.members[id]?.name ?? id,
        wager: eff.wager,
        loss: eff.loss,
        cooloffUntil,
        weekNet: week.netCents,
        weekWagered: week.wageredCents,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const inCooloff = rows.filter((r) => r.cooloffUntil != null).length

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Who&rsquo;s set a self-limit, and where they stand this week. Read-only by design — limits
          are the player&rsquo;s to set and lift, never the operator&rsquo;s. Credits only.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Responsible-play summary">
        <div className="feat-kpi">
          <span className="feat-label">Players with limits</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">In cool-off</span>
          <strong>{inCooloff}</strong>
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="feat-empty">No players have set a self-limit yet.</p>
      ) : (
        <div className="mdsk-scroll">
          <table className="feat-table" aria-label="Player self-limits">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Wager limit</th>
                <th className="num">Loss limit</th>
                <th>Cool-off</th>
                <th className="num">Wagered (wk)</th>
                <th className="num">Net (wk)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="num">{capText(r.wager)}</td>
                  <td className="num">{capText(r.loss)}</td>
                  <td>
                    {r.cooloffUntil != null ? (
                      <span className="feat-down">until {fmtDate(r.cooloffUntil)}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{formatMoney(r.weekWagered)}</td>
                  <td
                    className={`num ${r.weekNet < 0 ? 'feat-down' : r.weekNet > 0 ? 'feat-up' : ''}`}
                  >
                    {formatMoney(r.weekNet)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}
