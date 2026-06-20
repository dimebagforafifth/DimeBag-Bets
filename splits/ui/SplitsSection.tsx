/**
 * SplitsSection — the player-facing "Splits" surface: where the public's money is going.
 *
 *  - a "most-bet markets" discovery list (rank by tickets or handle), each row showing the
 *    bets%-vs-handle% lean with a thin split bar;
 *  - a downline-vs-global scope toggle (offered only when meaningful + allowed by Community
 *    Settings); and
 *  - the viewer's own CLV-beat credibility card.
 *
 * Every figure is a read-only projection over recorded bets + the verified record. No money path.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import type { Role } from '../../org/index.js'
import type { DiscoveryScope } from '../../profile/community-settings.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  defaultSplitScope,
  mostBetMarketsFor,
  scopeToggleAllowed,
  splitsVersion,
  subscribeSplits,
  viewerHasDownline,
} from '../source.js'
import { roundShares } from '../splits.js'
import type { RankBy, SideSplit } from '../types.js'
import { ClvBeatCard } from './ClvBeatCard.js'
import './splits.css'

const MARKET_LABEL: Record<string, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
  prop: 'Prop',
}

export function SplitsSection({
  viewerId,
  playerId,
  role,
}: {
  viewerId: string
  playerId: string
  role: Role
}) {
  useSyncExternalStore(subscribeSplits, splitsVersion)
  const canToggle = scopeToggleAllowed() && viewerHasDownline(viewerId)
  const [scope, setScope] = useState<DiscoveryScope>(() => defaultSplitScope())
  const [rankBy, setRankBy] = useState<RankBy>('tickets')
  const effScope: DiscoveryScope = canToggle ? scope : 'global'

  const ranked = useMemo(
    () => mostBetMarketsFor(viewerId, effScope, { by: rankBy, limit: 12 }),
    // re-rank when the recorded bets change (splitsVersion) or controls change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewerId, effScope, rankBy, splitsVersion()],
  )

  return (
    <div className="sp-section">
      <header className="sp-head">
        <div>
          <h2 className="sp-h1">Betting Splits</h2>
          <p className="sp-sub">
            Where the {effScope === 'downline' ? 'downline' : 'public'} is — share of tickets vs
            credits staked on each side. Read-only.
          </p>
        </div>
        <div className="sp-controls">
          {canToggle && (
            <div className="sp-toggle" role="group" aria-label="Scope">
              <button
                type="button"
                className={`sp-pill ${effScope === 'global' ? 'is-on' : ''}`}
                onClick={() => setScope('global')}
              >
                Global
              </button>
              <button
                type="button"
                className={`sp-pill ${effScope === 'downline' ? 'is-on' : ''}`}
                onClick={() => setScope('downline')}
              >
                Downline
              </button>
            </div>
          )}
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
        </div>
      </header>

      <section className="sp-clv-wrap" aria-label="Your credibility">
        <ClvBeatCard accountId={playerId} />
      </section>

      <section className="sp-board" aria-label="Most-bet markets">
        <h3 className="sp-h2">Most-bet markets</h3>
        {ranked.length === 0 ? (
          <p className="sp-empty">
            No action {effScope === 'downline' ? 'in your downline ' : ''}yet. Splits populate as
            bets are placed.
          </p>
        ) : (
          <ul className="sp-list">
            {ranked.map(({ rank, split, lean }) => (
              <li key={split.marketId} className="sp-card">
                <div className="sp-card-top">
                  <span className="sp-rank">#{rank}</span>
                  <div className="sp-card-id">
                    <span className="sp-event">{split.eventLabel}</span>
                    <span className="sp-market">
                      {MARKET_LABEL[split.marketType] ?? split.marketType} · {split.leagueId}
                    </span>
                  </div>
                  <div className="sp-card-totals">
                    <span className="sp-total-tix">{split.totalTickets} bets</span>
                    <span className="sp-total-handle">{formatMoney(split.totalHandleCents)}</span>
                  </div>
                </div>

                <div className="sp-bar-track" role="img" aria-label="Handle share by side">
                  {split.sides.map((s) => (
                    <span
                      key={s.side}
                      className="sp-bar-seg"
                      style={{ width: `${s.handlePct}%` }}
                      title={`${s.pick}: ${Math.round(s.handlePct)}% of handle`}
                    />
                  ))}
                </div>

                <ul className="sp-sides">
                  {(() => {
                    // Round per card so the labels sum to exactly 100.
                    const tix = roundShares(split.sides.map((s) => s.ticketPct))
                    const hnd = roundShares(split.sides.map((s) => s.handlePct))
                    return split.sides.map((s, i) => (
                      <SideRow
                        key={s.side}
                        side={s}
                        ticketPct={tix[i]}
                        handlePct={hnd[i]}
                        isLean={lean?.side === s.side}
                      />
                    ))
                  })()}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      {role !== 'player' && (
        <p className="sp-foot">Operator view — the console “Betting Splits” tile mirrors this.</p>
      )}
    </div>
  )
}

function SideRow({
  side,
  ticketPct,
  handlePct,
  isLean,
}: {
  side: SideSplit
  ticketPct: number
  handlePct: number
  isLean: boolean
}) {
  return (
    <li className={`sp-side ${isLean ? 'is-lean' : ''}`}>
      <span className="sp-side-pick">{side.pick}</span>
      <span className="sp-side-nums">
        <span className="sp-side-bets">{ticketPct}% bets</span>
        <span className="sp-side-handle">{handlePct}% handle</span>
      </span>
    </li>
  )
}
