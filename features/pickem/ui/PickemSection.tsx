/**
 * Pick'em — the player section. A board of player-prop projections (tap Higher / Lower),
 * an entry slip (Power / Flex, stake, the fixed multiple + honest house-edge readout), and
 * "my entries". Reads the props off the shared odds feed; every stake/payout runs through
 * `core` (see ../entries). Styled with the GLOBAL design tokens (app/theme.css) under a
 * `.pk` scope — // SEAM (Agent D): final visual polish / motion is yours.
 *
 * Credits/balance only — integer cents, no cash, no buy-in, no cash-out.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Account } from '../../../core/index.js'
import { formatMoney } from '../../../games/shared/money.js'
import { useBookOdds } from '../../../app/book/odds-source.js'
import {
  FLEX_MIN_PICKS,
  MAX_PICKS,
  MIN_PICKS,
  impliedEdge,
  modeAvailable,
  topMultiple,
  type PickemMode,
} from '../config.js'
import { boardProjections, type Projection } from '../projections.js'
import {
  placeEntry,
  settleEntry,
  seedDemoEntries,
  entriesForAccount,
  getEntriesVersion,
  subscribeEntries,
  type EntryPick,
  type PickemEntry,
} from '../entries.js'
import type { PickResult, PickSide } from '../engine.js'
import './pickem.css'

const QUICK = [500, 2_000, 5_000] // $5 / $20 / $50 in cents

export interface PickemSectionProps {
  /** The current player's core account (account.id is the member id) — entries stake/settle
   *  on it through core, and it scopes "my entries". */
  account: Account
  playerName: string
  /** Demo sign-in → seed sample entries + show the simulate control. */
  isDemo?: boolean
  /** Nudge the app header to re-read the figure after a place/settle. */
  onBalanceChange?: () => void
}

export function PickemSection({
  account,
  playerName,
  isDemo = false,
  onBalanceChange,
}: PickemSectionProps) {
  const { events } = useBookOdds()
  useSyncExternalStore(subscribeEntries, getEntriesVersion)

  const board = useMemo(() => boardProjections(events), [events])
  const [selected, setSelected] = useState<Map<string, PickSide>>(new Map())
  const [mode, setMode] = useState<PickemMode>('power')
  const [stakeCents, setStakeCents] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Demo: seed sample entries on whoever you're playing as (no-op once they exist).
  useEffect(() => {
    if (isDemo) {
      seedDemoEntries(account, playerName, Date.now())
      onBalanceChange?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, account.id])

  const count = selected.size
  const effMode: PickemMode = modeAvailable(mode, count) ? mode : 'power'
  const byId = useMemo(() => new Map(board.map((p) => [p.id, p])), [board])
  const picks = useMemo(
    () =>
      [...selected]
        .map(([id, side]) => ({ projection: byId.get(id), side }))
        .filter((p) => p.projection),
    [selected, byId],
  ) as Array<{ projection: Projection; side: PickSide }>

  const topMul = count >= MIN_PICKS ? topMultiple(effMode, count) : 0
  const toWinCents = Math.round(stakeCents * topMul)
  const edge = count >= MIN_PICKS ? impliedEdge(effMode, count) : 0
  const canPlace = count >= MIN_PICKS && count <= MAX_PICKS && stakeCents > 0

  function toggle(p: Projection, side: PickSide) {
    setError(null)
    setSelected((cur) => {
      const next = new Map(cur)
      if (next.get(p.id) === side) {
        next.delete(p.id) // tapping the same side again clears it
      } else {
        if (!next.has(p.id) && next.size >= MAX_PICKS) return cur // at the cap
        next.set(p.id, side)
      }
      return next
    })
  }

  function submit() {
    try {
      placeEntry({ account, playerName, mode: effMode, picks, stakeCents, now: Date.now() })
      setSelected(new Map())
      setStakeCents(0)
      setError(null)
      onBalanceChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit the entry.')
    }
  }

  // Demo: grade every open entry through core — a stand-in for the real prop feed settling
  // the slate. Smaller entries (2 picks) hit clean (a win); 3+ pick entries miss their first
  // leg, so the demo shows BOTH a winning and a losing/flex-partial outcome.
  function settleOpenDemo() {
    for (const e of entriesForAccount(account.id)) {
      if (e.status !== 'open') continue
      const results: Record<string, PickResult> = {}
      e.picks.forEach((pk, i) => {
        results[pk.projectionId] = i === 0 && e.picks.length > 2 ? otherSide(pk.side) : pk.side
      })
      settleEntry(e.id, results, Date.now())
    }
    onBalanceChange?.()
  }

  const mine = entriesForAccount(account.id)
  const groups = useMemo(() => groupByGame(board), [board])

  return (
    <div className="pk">
      <div className="pk-main">
        <header className="pk-head">
          <h1 className="pk-title">Pick&rsquo;em</h1>
          <p className="pk-sub">
            Pick {MIN_PICKS}&ndash;{MAX_PICKS} projections higher or lower. Hit them to win a fixed
            multiplier &mdash; one stake, one payout, no odds to read.
          </p>
        </header>

        {groups.map((g) => (
          <section key={g.eventId} className="pk-game">
            <div className="pk-game-head">
              <span className="pk-game-name">{g.eventLabel}</span>
              <span className="pk-game-meta">
                {g.league}
                {g.live && <span className="pk-live">LIVE</span>}
              </span>
            </div>
            <div className="pk-ladder">
              {g.projections.map((p) => {
                const side = selected.get(p.id)
                const full = !selected.has(p.id) && count >= MAX_PICKS
                return (
                  <div key={p.id} className={`pk-proj${side ? ' is-picked' : ''}`}>
                    <div className="pk-proj-info">
                      <span className="pk-proj-player">{p.playerName}</span>
                      <span className="pk-proj-line">
                        <b className="pk-proj-num">{p.line}</b> {p.statLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`pk-pick pk-higher${side === 'higher' ? ' is-on' : ''}`}
                      disabled={full}
                      onClick={() => toggle(p, 'higher')}
                    >
                      Higher
                    </button>
                    <button
                      type="button"
                      className={`pk-pick pk-lower${side === 'lower' ? ' is-on' : ''}`}
                      disabled={full}
                      onClick={() => toggle(p, 'lower')}
                    >
                      Lower
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="pk-aside">
        <div className="pk-slip">
          <div className="pk-slip-head">
            <h2 className="pk-slip-h">Your entry</h2>
            {count > 0 && (
              <button type="button" className="pk-clear" onClick={() => setSelected(new Map())}>
                Clear
              </button>
            )}
          </div>

          {count === 0 ? (
            <p className="pk-slip-empty">Tap Higher or Lower on a projection to start.</p>
          ) : (
            <>
              {picks.map(({ projection: p, side }) => (
                <div key={p.id} className="pk-leg">
                  <div className="pk-leg-info">
                    <span className="pk-leg-player">{p.playerName}</span>
                    <span className="pk-leg-pick">
                      <b className={side === 'higher' ? 'is-higher' : 'is-lower'}>
                        {side === 'higher' ? 'Higher' : 'Lower'}
                      </b>{' '}
                      {p.line} {p.statLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pk-leg-x"
                    aria-label="Remove"
                    onClick={() => toggle(p, side)}
                  >
                    &times;
                  </button>
                </div>
              ))}

              <div className="pk-modes">
                <button
                  type="button"
                  className={`pk-mode${effMode === 'power' ? ' is-on' : ''}`}
                  onClick={() => setMode('power')}
                >
                  Power
                  <span className="pk-mode-sub">all or nothing</span>
                </button>
                <button
                  type="button"
                  className={`pk-mode${effMode === 'flex' ? ' is-on' : ''}`}
                  disabled={!modeAvailable('flex', count)}
                  onClick={() => setMode('flex')}
                  title={
                    count < FLEX_MIN_PICKS
                      ? `Flex needs ${FLEX_MIN_PICKS}+ picks`
                      : 'Miss one, still cash'
                  }
                >
                  Flex
                  <span className="pk-mode-sub">miss one, still cash</span>
                </button>
              </div>

              <div className="pk-stake">
                <label className="pk-stake-label" htmlFor="pk-stake">
                  Stake
                </label>
                <input
                  id="pk-stake"
                  className="pk-stake-input"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={stakeCents ? stakeCents / 100 : ''}
                  placeholder="0"
                  onChange={(e) =>
                    setStakeCents(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))
                  }
                />
                <div className="pk-quicks">
                  {QUICK.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="pk-quick"
                      onClick={() => setStakeCents(c)}
                    >
                      {formatMoney(c)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pk-summary">
                <div className="pk-summary-row">
                  <span>
                    {count}-pick {effMode === 'power' ? 'Power' : 'Flex'}
                  </span>
                  <span className="pk-mult">{topMul}&times;</span>
                </div>
                <div className="pk-summary-row">
                  <span>To win{effMode === 'flex' ? ' (all hit)' : ''}</span>
                  <span className="pk-towin">{formatMoney(toWinCents)}</span>
                </div>
                <div className="pk-summary-row pk-edge">
                  <span>House edge</span>
                  <span>{(edge * 100).toFixed(1)}%</span>
                </div>
              </div>

              <button type="button" className="pk-submit" disabled={!canPlace} onClick={submit}>
                Submit entry
              </button>
              {error && <p className="pk-err">{error}</p>}
            </>
          )}
        </div>

        <div className="pk-panel">
          <div className="pk-panel-head">
            <h3 className="pk-panel-h">My entries</h3>
            {isDemo && mine.some((e) => e.status === 'open') && (
              <button type="button" className="pk-demo-btn" onClick={settleOpenDemo}>
                Simulate results
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <p className="pk-empty">No entries yet.</p>
          ) : (
            mine.slice(0, 12).map((e) => <EntryRow key={e.id} entry={e} />)
          )}
        </div>
      </aside>
    </div>
  )
}

function EntryRow({ entry }: { entry: PickemEntry }) {
  const label = `${entry.picks.length} picks · ${entry.mode === 'power' ? 'Power' : 'Flex'}`
  return (
    <div className="pk-entry">
      <div className="pk-entry-main">
        <div className="pk-entry-label">
          {label} <span className="pk-entry-mult">{entry.topMultiple}&times;</span>
        </div>
        <div className="pk-entry-picks">{entry.picks.map(legText).join(' · ')}</div>
      </div>
      <div className="pk-entry-right">
        <span className="pk-entry-stake">{formatMoney(entry.stakeCents)}</span>
        <span className={`pk-status is-${entry.status}`}>
          {entry.status === 'open'
            ? 'Open'
            : entry.status === 'won'
              ? `Won ${formatMoney(entry.returnCents ?? 0)}`
              : entry.status === 'void'
                ? 'Void'
                : 'Lost'}
        </span>
      </div>
    </div>
  )
}

function legText(pk: EntryPick): string {
  const arrow = pk.side === 'higher' ? '↑' : '↓'
  const mark = pk.result ? (pk.result === 'void' ? ' ⊘' : pk.result === pk.side ? ' ✓' : ' ✗') : ''
  return `${pk.playerName} ${arrow}${pk.line} ${pk.statLabel}${mark}`
}

interface GameGroup {
  eventId: string
  eventLabel: string
  league: string
  live: boolean
  projections: Projection[]
}
function groupByGame(board: Projection[]): GameGroup[] {
  const groups: GameGroup[] = []
  const index = new Map<string, GameGroup>()
  for (const p of board) {
    let g = index.get(p.eventId)
    if (!g) {
      g = {
        eventId: p.eventId,
        eventLabel: p.eventLabel,
        league: p.league,
        live: p.live,
        projections: [],
      }
      index.set(p.eventId, g)
      groups.push(g)
    }
    g.projections.push(p)
  }
  return groups
}

function otherSide(side: PickSide): PickSide {
  return side === 'higher' ? 'lower' : 'higher'
}
