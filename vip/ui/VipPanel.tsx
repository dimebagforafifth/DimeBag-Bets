import { useState, useSyncExternalStore } from 'react'
import { formatMoney, toCents } from '../../games/shared/money.js'
import { NumberInput } from '../../games/shared/NumberInput.js'
import { setAutoGrant, setRankMinWagered, setRankReward, setReleased, type RankDef } from '../index.js'
import {
  getVipConfig,
  getVipVersion,
  grantFreePlay,
  mutateVipConfig,
  subscribeVip,
} from '../../app/vip-store.js'
import { RankBadge } from './Leaderboard.js'
import './vip.css'

/**
 * The MANAGER console for the VIP program (CLAUDE.md §2, §4). It lets the operator
 * release the leaderboard, toggle automatic reward granting, re-price the rank
 * ladder (threshold + reward, in dollars → cents), and hand a player a manual
 * free-play grant. Every config change goes through `mutateVipConfig`, which
 * re-runs granting so a lowered threshold immediately pays out. This view never
 * moves money — redeeming free play credits the core balance elsewhere.
 */
export function VipPanel({ players }: { players: { id: string; name: string }[] }) {
  useSyncExternalStore(subscribeVip, getVipVersion)
  const config = getVipConfig()
  const [error, setError] = useState<string | null>(null)

  // a mutation runner that surfaces a rejected edit (e.g. a monotonicity break)
  const run = (fn: (c: ReturnType<typeof getVipConfig>) => void) => {
    try {
      mutateVipConfig(fn)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="vip-panel">
      <div className="vip-panel-head">
        <h2 className="vip-panel-title">VIP program</h2>
        <p className="vip-panel-sub">
          Ranks reward lifetime wagered with free play. Free play is a promo pool — redeeming it
          credits the player&rsquo;s balance through core, never here.
        </p>
      </div>

      {error && <p className="vip-error">{error}</p>}

      {/* release + auto-grant toggles */}
      <div className="vip-card">
        <h3 className="vip-card-title">Program</h3>
        <div className="vip-toggles">
          <ToggleRow
            label="Leaderboard released"
            hint="When off, players see a “not released yet” note; managers still see it."
            on={config.released}
            onToggle={() => run((c) => setReleased(c, !config.released))}
          />
          <ToggleRow
            label="Auto-grant rank rewards"
            hint="Land each rank reward in free play the moment it’s reached."
            on={config.autoGrant}
            onToggle={() => run((c) => setAutoGrant(c, !config.autoGrant))}
          />
        </div>
      </div>

      {/* editable rank ladder */}
      <div className="vip-card">
        <h3 className="vip-card-title">Rank ladder</h3>
        <table className="vip-ranks">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Threshold (wagered)</th>
              <th>Free-play reward</th>
              <th>Perks</th>
            </tr>
          </thead>
          <tbody>
            {config.ranks.map((rank) => (
              <RankRow key={rank.id} rank={rank} run={run} />
            ))}
          </tbody>
        </table>
      </div>

      {/* manual free-play grant */}
      <div className="vip-card">
        <h3 className="vip-card-title">Grant free play</h3>
        <GrantFreePlay players={players} />
      </div>
    </section>
  )
}

/** A labelled on/off switch row. */
function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string
  hint: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="vip-toggle-row">
      <div className="vip-toggle-text">
        <span className="vip-toggle-label">{label}</span>
        <span className="vip-toggle-hint">{hint}</span>
      </div>
      <button className={`vip-switch ${on ? 'is-on' : ''}`} onClick={onToggle}>
        {on ? 'On' : 'Off'}
      </button>
    </div>
  )
}

/** One editable ladder row: badge, threshold ($), reward ($), perks. */
function RankRow({
  rank,
  run,
}: {
  rank: RankDef
  run: (fn: (c: ReturnType<typeof getVipConfig>) => void) => void
}) {
  return (
    <tr>
      <td>
        <RankBadge rank={rank} />
      </td>
      <td>
        <MoneyField
          cents={rank.minWagered}
          onCommit={(cents) => run((c) => setRankMinWagered(c, rank.id, cents))}
        />
      </td>
      <td>
        <MoneyField
          cents={rank.freePlayReward}
          onCommit={(cents) => run((c) => setRankReward(c, rank.id, cents))}
        />
      </td>
      <td className="vip-perks">{rank.perks.length ? rank.perks.join(' · ') : '—'}</td>
    </tr>
  )
}

/** An inline $ editor over the shared NumberInput; commits dollars → cents. */
function MoneyField({ cents, onCommit }: { cents: number; onCommit: (cents: number) => void }) {
  return (
    <span className="vip-money">
      <span className="vip-money-prefix">$</span>
      <NumberInput
        className="vip-money-input"
        value={cents / 100}
        min={0}
        decimals={2}
        onCommit={(n) => onCommit(toCents(n ?? 0))}
      />
    </span>
  )
}

/** Pick a player + dollar amount → grant free play (a manual manager promo). */
function GrantFreePlay({ players }: { players: { id: string; name: string }[] }) {
  const [playerId, setPlayerId] = useState<string>(players[0]?.id ?? '')
  const [amount, setAmount] = useState<number | null>(null)

  const target = players.find((p) => p.id === playerId) ?? players[0]
  const cents = toCents(amount ?? 0)
  const canGrant = target != null && cents > 0

  function grant() {
    if (!canGrant || !target) return
    grantFreePlay(target.id, cents)
    setAmount(null)
  }

  if (players.length === 0) {
    return <p className="vip-toggle-hint">No players to grant to yet.</p>
  }

  return (
    <div className="vip-grant">
      <label className="field">
        <span className="field-label">Player</span>
        <select
          className="vip-grant-select"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Amount</span>
        <span className="vip-money">
          <span className="vip-money-prefix">$</span>
          <NumberInput
            className="vip-money-input"
            value={amount}
            min={0}
            decimals={2}
            allowEmpty
            placeholder="0.00"
            onCommit={setAmount}
          />
        </span>
      </label>
      <button className="action action-bet vip-grant-action" disabled={!canGrant} onClick={grant}>
        Grant {canGrant ? formatMoney(cents) : ''}
      </button>
    </div>
  )
}
