/**
 * Casino Edge — the operator console panel for per-game house-edge bands (PART 2). Each game has
 * a min/max/default band (in bps); the slider is clamped to that band, with a live RTP/edge
 * readout and a reset-to-default. Variable games (sic bo, roulette, baccarat) expose their
 * per-bet-type bands too. Agents inherit; they can't exceed the manager ceilings (the same clamp
 * applies to every setter). Consumes the global tokens. Renders only its body.
 */

import { useSyncExternalStore } from 'react'
import { GAME_EDGE_BANDS, bpsToRtp } from '../game-edge-config.js'
import {
  bandOf,
  currentEdgeBps,
  getEdgeBandsVersion,
  hasEdgeOverride,
  isEdgeApplied,
  resetEdgeBps,
  setEdgeBps,
  subscribeEdgeBands,
} from './edge-bands-store.js'
import './casino-edge.css'

const titleCase = (id: string): string =>
  id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

const pct = (bps: number): string => (bps / 100).toFixed(2)

export function CasinoEdgePanel() {
  useSyncExternalStore(subscribeEdgeBands, getEdgeBandsVersion, getEdgeBandsVersion)
  const games = Object.keys(GAME_EDGE_BANDS).sort()

  return (
    <section className="ced">
      <header className="ced-head">
        <h2 className="ced-title">Casino Edge</h2>
        <p className="ced-sub">
          Per-game house-edge bands. Each game is capped to a credible min/max; a tight game
          (blackjack ≤ 2%) can’t be pushed to a keno-style 30%. The edge only scales payouts — it
          never touches the provably-fair RNG.
        </p>
      </header>

      <div className="ced-list">
        {games.map((gameId) => (
          <EdgeRow key={gameId} gameId={gameId} />
        ))}
      </div>
    </section>
  )
}

function EdgeRow({ gameId }: { gameId: string }) {
  const cfg = GAME_EDGE_BANDS[gameId]
  const betTypes = cfg.bet_type_overrides ? Object.keys(cfg.bet_type_overrides) : []
  return (
    <div className="ced-row">
      <div className="ced-game">{titleCase(gameId)}</div>
      <EdgeControl gameId={gameId} label="Base" />
      {betTypes.map((bt) => (
        <EdgeControl key={bt} gameId={gameId} betType={bt} label={titleCase(bt)} />
      ))}
    </div>
  )
}

function EdgeControl({
  gameId,
  betType,
  label,
}: {
  gameId: string
  betType?: string
  label: string
}) {
  const bounds = bandOf(gameId, betType)
  const current = currentEdgeBps(gameId, betType)
  const overridden = hasEdgeOverride(gameId, betType)
  const applied = isEdgeApplied(gameId, betType)
  const rtpPct = (bpsToRtp(current) * 100).toFixed(2)

  return (
    <div className={`ced-control${applied ? '' : ' is-policy-only'}`}>
      <span className="ced-bt">
        {label}
        {!applied && (
          <span
            className="ced-note"
            title="Recorded as a policy target — this game's payout math doesn't read it yet, so changing it won't move live payouts."
          >
            Policy only
          </span>
        )}
      </span>
      <input
        className="ced-range"
        type="range"
        min={bounds.edge_min_bps}
        max={bounds.edge_max_bps}
        step={5}
        value={current}
        aria-label={`${titleCase(gameId)} ${label} edge bps`}
        onChange={(e) => setEdgeBps(gameId, Number(e.target.value), betType)}
      />
      <span className="ced-readout">
        <span className="ced-edge">{pct(current)}% edge</span>
        <span className="ced-rtp">{rtpPct}% RTP</span>
        <span className="ced-band">
          band {pct(bounds.edge_min_bps)}–{pct(bounds.edge_max_bps)}%
        </span>
      </span>
      <button
        className="ced-reset"
        disabled={!overridden}
        onClick={() => resetEdgeBps(gameId, betType)}
        title={`Reset to ${pct(bounds.edge_default_bps)}% default`}
      >
        Reset
      </button>
    </div>
  )
}
