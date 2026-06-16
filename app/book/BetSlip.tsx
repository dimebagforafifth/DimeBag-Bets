/**
 * The bet slip — the one place a bet is confirmed. Legs lock at the `priceDisplay`
 * they were added at; with ≥2 legs the player chooses Singles or Parlay (a same-game
 * set is flagged SGP); related-contingency legs can't be parlayed; and if a leg's
 * price has moved the slip must re-confirm before placing (CLAUDE.md §4). All amounts
 * are credits/balance through `core`.
 */

import { formatMoney } from '../../games/shared/money.js'
import { americanFromDecimal, formatAmerican } from './odds-format.js'
import { isSameGame, relatedConflicts, slipQuote, type SlipLeg, type SlipMode } from './slip.js'

const QUICK = [1_000, 2_500, 10_000] // $10 / $25 / $100 in cents

export function BetSlip({
  legs,
  mode,
  onMode,
  stakeCents,
  onStake,
  movedKeys,
  available,
  error,
  onRemove,
  onClear,
  onPlace,
  onAccept,
}: {
  legs: SlipLeg[]
  mode: SlipMode
  onMode: (m: SlipMode) => void
  stakeCents: number
  onStake: (cents: number) => void
  movedKeys: Set<string>
  available: number
  error: string | null
  onRemove: (key: string) => void
  onClear: () => void
  onPlace: () => void
  onAccept: () => void
}) {
  const effMode: SlipMode = legs.length >= 2 ? mode : 'single'
  const quote = slipQuote(legs, effMode, stakeCents)
  const conflicts = effMode === 'parlay' ? relatedConflicts(legs) : []
  const sameGame = isSameGame(legs)
  const needsAccept = movedKeys.size > 0
  const overAvailable = quote.totalStakeCents > available
  const canPlace =
    legs.length > 0 && stakeCents > 0 && !overAvailable && conflicts.length === 0 && !needsAccept

  const maxStake =
    legs.length === 0 ? 0 : effMode === 'parlay' ? available : Math.floor(available / legs.length)

  return (
    <div className="bk-slip">
      <div className="bk-slip-head">
        <h2 className="bk-slip-h">Bet slip</h2>
        {legs.length > 0 && (
          <>
            <span className="bk-slip-count">{legs.length}</span>
            <button type="button" className="bk-slip-clear" onClick={onClear}>
              Clear
            </button>
          </>
        )}
      </div>

      {legs.length === 0 ? (
        <p className="bk-slip-empty">Tap a price to add it to your slip.</p>
      ) : (
        <>
          {legs.map((l) => (
            <div key={l.key} className="bk-leg">
              <div>
                <div className="bk-leg-pick">{l.pick}</div>
                <div className="bk-leg-sub">
                  {l.eventLabel}
                  {movedKeys.has(l.key) && <span className="bk-leg-moved"> · price changed</span>}
                </div>
              </div>
              <span className="bk-leg-price">{formatAmerican(l.price.american)}</span>
              <button
                type="button"
                className="bk-leg-x"
                aria-label={`Remove ${l.pick}`}
                onClick={() => onRemove(l.key)}
              >
                ×
              </button>
            </div>
          ))}

          {legs.length >= 2 && (
            <>
              {sameGame && mode === 'parlay' && <span className="bk-sgp">Same-game parlay</span>}
              <div className="bk-modes">
                <button
                  type="button"
                  className={`bk-mode ${mode === 'single' ? 'is-on' : ''}`}
                  onClick={() => onMode('single')}
                >
                  Singles
                </button>
                <button
                  type="button"
                  className={`bk-mode ${mode === 'parlay' ? 'is-on' : ''}`}
                  onClick={() => onMode('parlay')}
                >
                  Parlay
                </button>
              </div>
            </>
          )}

          <div className="bk-stake">
            <label className="bk-stake-label" htmlFor="bk-stake-input">
              {effMode === 'single' && legs.length > 1 ? 'Stake per pick' : 'Stake'}
            </label>
            <input
              id="bk-stake-input"
              className="bk-stake-input"
              type="number"
              min={0}
              inputMode="decimal"
              value={stakeCents ? stakeCents / 100 : ''}
              placeholder="0"
              onChange={(e) => onStake(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))}
            />
            <div className="bk-quicks">
              {QUICK.map((c) => (
                <button key={c} type="button" className="bk-quick" onClick={() => onStake(c)}>
                  {formatMoney(c)}
                </button>
              ))}
              <button type="button" className="bk-quick" onClick={() => onStake(maxStake)}>
                Max
              </button>
            </div>
          </div>

          {effMode === 'parlay' && (
            <div className="bk-summary">
              <span className="bk-summary-k">Parlay odds</span>
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
            <button type="button" className="bk-place is-accept" onClick={onAccept}>
              Accept price change
            </button>
          ) : (
            <button type="button" className="bk-place" disabled={!canPlace} onClick={onPlace}>
              Place bet
            </button>
          )}

          {conflicts.length > 0 && (
            <p className="bk-err">Related selections can’t be parlayed — switch to Singles.</p>
          )}
          {overAvailable && !error && (
            <p className="bk-err">Stake exceeds what’s available to wager.</p>
          )}
          {error && <p className="bk-err">{error}</p>}
        </>
      )}
    </div>
  )
}
