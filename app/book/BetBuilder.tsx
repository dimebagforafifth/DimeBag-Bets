/**
 * The same-game BET BUILDER — a guided, single-game surface for combining game lines and
 * player props into ONE correlated ticket. It's a UX layer over the EXISTING engine, not a
 * fork: picks are grouped by `builderGroups`, each pick's state comes from
 * `selectionAvailability` (addable / on the ticket / blocked-with-reason / off-board), the
 * running price comes from `builderQuote` (the SGP correlation path), and placing runs
 * through `placeBookBet` — the same `core` money path every bet uses.
 *
 * Clean-UI: its own distraction-free view (one game, the picks, one running price, one
 * action). Graphite-and-gold, reusing the book's chip/leg/summary classes.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { availableToWager, type Account } from '../../core/index.js'
import type { NormalizedEvent, NormalizedMarket, Selection } from '../../lib/odds/contract.js'
import { americanFromDecimal, formatAmerican } from './odds-format.js'
import { chipLabel } from './MarketChips.js'
import { placeBookBet } from './placement.js'
import { getSgpRulesVersion, subscribeSgpRules } from './sgp-rules.js'
import {
  builderGroups,
  builderQuote,
  legsOffBoard,
  selectionAvailability,
  toggleBuilderLeg,
  type BuilderGroup,
} from './builder.js'
import { movedLegKeys, type SlipLeg } from './slip.js'
import './bet-builder.css'

const QUICK = [1_000, 2_500, 10_000] // $10 / $25 / $100 in cents

/** Selections in pairs (home/away, over/under) so a market reads as rows of two. */
function pairRows(selections: Selection[]): Selection[][] {
  const rows: Selection[][] = []
  for (let i = 0; i < selections.length; i += 2) rows.push(selections.slice(i, i + 2))
  return rows
}

export function BetBuilder({
  event,
  account,
  playerName,
  onBack,
  onPlaced,
}: {
  event: NormalizedEvent
  account: Account
  playerName: string
  /** Back to the normal market view. */
  onBack: () => void
  /** Nudge the shell after a ticket is placed (figure/pending moved). */
  onPlaced?: () => void
}) {
  // Re-quote when the tenant SGP rules change (a manager tightening the leg cap / strictness
  // must instantly re-flag a now-illegal ticket, so the builder's "placeable" never diverges
  // from what placeBookBet would validate).
  useSyncExternalStore(subscribeSgpRules, getSgpRulesVersion, getSgpRulesVersion)

  const [legs, setLegs] = useState<SlipLeg[]>([])
  const [stakeCents, setStakeCents] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(() => builderGroups(event), [event])
  const available = availableToWager(account)
  const quote = builderQuote(legs, stakeCents)
  const conflictKeys = useMemo(() => new Set(quote.conflictKeys), [quote.conflictKeys])
  // Live drift since a leg was added (the `event` prop ticks with the slate): a moved price
  // forces an explicit re-confirm (CLAUDE.md §4); an off-board leg blocks placing until removed.
  const movedKeys = useMemo(() => new Set(movedLegKeys(legs, [event])), [legs, event])
  const offBoardKeys = useMemo(() => new Set(legsOffBoard(legs, event)), [legs, event])
  const overAvailable = quote.totalStakeCents > available
  const needsAccept = movedKeys.size > 0
  const hasOffBoard = offBoardKeys.size > 0
  const canPlace = quote.ok && stakeCents > 0 && !overAvailable && !needsAccept && !hasOffBoard

  function onPick(market: NormalizedMarket, sel: Selection) {
    const avail = selectionAvailability(legs, event, market, sel)
    if (avail.state === 'off-board') return
    if (avail.state === 'blocked') {
      setError(avail.message) // proactive "can't combine" messaging
      return
    }
    setError(null)
    setLegs((cur) => toggleBuilderLeg(cur, event, market, sel))
  }

  // Re-lock every moved leg to its current displayed price (bet acceptance, CLAUDE.md §4).
  function accept() {
    setLegs((cur) =>
      cur.map((l) => {
        const m = event.markets.find((mk) => mk.marketId === l.marketId)
        const s = m?.selections.find((x) => x.selectionId === l.key)
        return s ? { ...l, price: { ...s.priceDisplay } } : l
      }),
    )
    setError(null)
  }

  function place() {
    try {
      placeBookBet({
        account,
        playerName,
        placedBy: playerName,
        legs,
        mode: legs.length >= 2 ? 'parlay' : 'single',
        stakeCents,
        now: Date.now(),
      })
      setLegs([])
      setStakeCents(0)
      setError(null)
      onPlaced?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the bet.')
    }
  }

  return (
    <div className="bk-builder">
      <div className="bk-builder-menu">
        <button type="button" className="bk-back" onClick={onBack}>
          ← Markets
        </button>
        <div className="bk-event-top">
          <div className="bk-teams">
            {event.away}
            <span className="bk-at">@</span>
            {event.home}
          </div>
          <div className="bk-event-meta">
            <span className="bk-league-tag">{event.leagueId}</span>
            <span className="bk-builder-tag">Build a bet · one game</span>
          </div>
        </div>

        {groups.map((group: BuilderGroup) => (
          <div className="bk-mblock" key={group.marketId}>
            <h4 className="bk-mblock-title">{group.title}</h4>
            {pairRows(group.selections).map((pair, i) => (
              <div key={i} className={`bk-mrow ${group.kind === 'prop' ? 'is-prop' : ''}`}>
                {pair.map((sel) => {
                  const avail = selectionAvailability(legs, event, group.market, sel)
                  const on = avail.state === 'added'
                  const blocked = avail.state === 'blocked'
                  const off = avail.state === 'off-board'
                  return (
                    <button
                      key={sel.selectionId}
                      type="button"
                      className={`bk-chip ${on ? 'is-on' : ''} ${blocked ? 'is-blocked' : ''}`}
                      disabled={off}
                      aria-pressed={on}
                      aria-disabled={blocked || undefined}
                      title={blocked ? avail.message : undefined}
                      onClick={() => onPick(group.market, sel)}
                    >
                      <span className="bk-chip-pick">{chipLabel(event, group.market, sel)}</span>
                      <span className="bk-chip-price">
                        {formatAmerican(sel.priceDisplay.american)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="bk-builder-ticket">
        <div className="bk-slip-head">
          <h2 className="bk-slip-h">Your bet</h2>
          {legs.length > 0 && (
            <>
              <span className="bk-slip-count">{legs.length}</span>
              <button type="button" className="bk-slip-clear" onClick={() => setLegs([])}>
                Clear
              </button>
            </>
          )}
        </div>

        {legs.length === 0 ? (
          <p className="bk-slip-empty">
            Pick game lines and player props from this game to build a correlated bet.
          </p>
        ) : (
          <>
            {legs.map((l) => (
              <div
                key={l.key}
                className={`bk-leg ${conflictKeys.has(l.key) || offBoardKeys.has(l.key) ? 'is-conflict' : ''}`}
              >
                <div>
                  <div className="bk-leg-pick">{l.pick}</div>
                  <div className="bk-leg-sub">
                    {l.eventLabel}
                    {movedKeys.has(l.key) && <span className="bk-leg-moved"> · price changed</span>}
                    {offBoardKeys.has(l.key) && (
                      <span className="bk-leg-conflict"> · no longer available</span>
                    )}
                  </div>
                </div>
                <span className="bk-leg-price">{formatAmerican(l.price.american)}</span>
                <button
                  type="button"
                  className="bk-leg-x"
                  aria-label={`Remove ${l.pick}`}
                  onClick={() => setLegs((cur) => cur.filter((x) => x.key !== l.key))}
                >
                  ×
                </button>
              </div>
            ))}

            {quote.sgp && (
              <span className="bk-sgp" title="Legs on one game are priced for correlation">
                Same-game parlay · correlated price
              </span>
            )}

            <div className="bk-stake">
              <label className="bk-stake-label" htmlFor="bk-builder-stake">
                Stake
              </label>
              <input
                id="bk-builder-stake"
                className="bk-stake-input"
                type="number"
                min={0}
                inputMode="decimal"
                value={stakeCents ? stakeCents / 100 : ''}
                placeholder="0"
                onChange={(e) =>
                  setStakeCents(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))
                }
              />
              <div className="bk-quicks">
                {QUICK.map((c) => (
                  <button key={c} type="button" className="bk-quick" onClick={() => setStakeCents(c)}>
                    {formatMoney(c)}
                  </button>
                ))}
                <button type="button" className="bk-quick" onClick={() => setStakeCents(available)}>
                  Max
                </button>
              </div>
            </div>

            {legs.length >= 2 && (
              <div className="bk-summary">
                <span className="bk-summary-k">{quote.sgp ? 'SGP odds' : 'Odds'}</span>
                <span className="bk-summary-v">
                  {formatAmerican(americanFromDecimal(quote.decimal))}
                </span>
              </div>
            )}
            <div className="bk-summary">
              <span className="bk-summary-k">Total stake</span>
              <span className="bk-summary-v">{formatMoney(quote.totalStakeCents)}</span>
            </div>
            <div className="bk-summary is-return">
              <span className="bk-summary-k">To return</span>
              <span className="bk-summary-v">{formatMoney(quote.toReturnCents)}</span>
            </div>

            {needsAccept ? (
              <button type="button" className="bk-place is-accept" onClick={accept}>
                Accept price change
              </button>
            ) : (
              <button type="button" className="bk-place" disabled={!canPlace} onClick={place}>
                Place bet
              </button>
            )}

            {hasOffBoard && (
              <p className="bk-err">A selection is no longer available — remove it to place.</p>
            )}
            {quote.blockMessage && <p className="bk-err">{quote.blockMessage}</p>}
            {overAvailable && <p className="bk-err">Stake exceeds what’s available to wager.</p>}
            {error && <p className="bk-err">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
