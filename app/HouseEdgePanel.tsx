import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { GAMES, type GameDef } from './games.js'
import { nativeRtp } from './edge-config.js'
import {
  subscribeEdge,
  getEdgeVersion,
  getRtp,
  hasOverride,
  setRtp,
  resetRtp,
} from './edge-store.js'
import { RTP_POLICY, RTP_BOUNDS } from '../games/shared/edge.js'
import './houseedge.css'

/**
 * Manager control to tune the house edge of each eligible casino game, shown as
 * an RTP % (CLAUDE.md §4 honest). It lists ONLY games whose payouts derive from a
 * single edge (`supportsAdjustableEdge`); structural/skill games are absent. A
 * chosen RTP is persisted per book (app/edge-store.ts) and fed into the game's
 * real payout math via app/edge-config.ts — money still flows only through core.
 *
 * Mounted in the Management section beside the org tree + VIP panel.
 */
export function HouseEdgePanel() {
  // Re-render when any override changes (same channel the App uses).
  useSyncExternalStore(subscribeEdge, getEdgeVersion)
  const games = GAMES.filter((g) => g.supportsAdjustableEdge)
  if (games.length === 0) return null
  return (
    <section className="houseedge">
      <div className="houseedge-head">
        <h2 className="houseedge-title">House edge</h2>
        <p className="houseedge-sub">
          Set each game’s payout return (RTP). Lower RTP = bigger house edge. Changes apply to new
          bets and settle through the shared balance. Only games with a single house edge are
          listed.
        </p>
      </div>
      <div className="houseedge-list">
        {games.map((g) => (
          <EdgeRow key={g.key} game={g} />
        ))}
      </div>
    </section>
  )
}

function EdgeRow({ game }: { game: GameDef }) {
  const native = nativeRtp(game.key)
  const rtp = getRtp(game.key, native)
  const overridden = hasOverride(game.key)
  const bounds = game.rtpBounds ?? RTP_BOUNDS
  const minPct = Math.round(bounds.min * 100)
  const maxPct = Math.round(bounds.max * 100)
  const rtpPct = Math.round(rtp * 100)
  const edgePct = Math.round((1 - rtp) * 100)

  const warn = rtp < RTP_POLICY.WARN_BELOW

  const commit = (pct: number) => setRtp(game.key, pct / 100)

  // The number box keeps a local draft while editing so a manager can clear and
  // retype freely; it commits (clamped, whole %) on blur/Enter, and reverts to
  // the live value if left empty/invalid. null draft = show the live value.
  const [draft, setDraft] = useState<string | null>(null)
  const commitDraft = () => {
    if (draft !== null && draft.trim() !== '') {
      const v = Math.round(Number(draft))
      if (Number.isFinite(v)) commit(v)
    }
    setDraft(null)
  }

  return (
    <div className="houseedge-row">
      <div className="houseedge-game">
        <span className="houseedge-dot" style={{ background: game.accent } as CSSProperties} />
        <span className="houseedge-name">{game.name}</span>
      </div>

      <div className="houseedge-control">
        <input
          className="houseedge-range"
          type="range"
          min={minPct}
          max={maxPct}
          step={1}
          value={rtpPct}
          aria-label={`${game.name} RTP percent`}
          onChange={(e) => commit(Number(e.target.value))}
        />
        <div className="houseedge-input">
          <input
            className="field-input"
            type="number"
            min={minPct}
            max={maxPct}
            step={1}
            value={draft ?? String(rtpPct)}
            aria-label={`${game.name} RTP percent (exact)`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <span className="houseedge-pct">% RTP</span>
        </div>
      </div>

      <div className="houseedge-readout">
        <span className={`houseedge-rtp ${warn ? 'is-warn' : ''}`}>{rtpPct}% RTP</span>
        <span className="houseedge-edge">{edgePct}% edge</span>
      </div>

      <button
        className="houseedge-reset"
        disabled={!overridden}
        onClick={() => resetRtp(game.key)}
        title="Restore this game’s default edge"
      >
        Reset
      </button>

      {warn && (
        <p className="houseedge-warn-line">
          Higher edge means players lose faster and may disengage.
        </p>
      )}
    </div>
  )
}
