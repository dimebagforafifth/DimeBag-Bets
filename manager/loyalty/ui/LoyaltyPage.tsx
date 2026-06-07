import { useMemo, useState, useSyncExternalStore } from 'react'
import { getVipConfig, getVipVersion, mutateVipConfig, subscribeVip } from '../../../app/vip-store.js'
import { setAutoGrant, setRankMinWagered, setRankReward, setReleased, type RankId } from '../../../vip/index.js'
import { NumberInput } from '../../../games/shared/NumberInput.js'
import { formatMoney, toCents } from '../../../games/shared/money.js'
import './loyalty.css'

/**
 * Loyalty / progression config — a manager surface over the existing VIP program
 * (vip/ + app/vip-store). It reads the live config and edits it through the program's
 * own guarded setters (threshold monotonicity is enforced there); it adds no new
 * model and moves no money. Self-contained; the shell mounts it.
 */
export function LoyaltyPage() {
  const v = useSyncExternalStore(subscribeVip, getVipVersion)
  const config = useMemo(() => getVipConfig(), [v])
  const [error, setError] = useState<string | null>(null)

  const ranks = config.ranks.filter((r) => r.id !== 'none') // 'none' is the floor everyone starts at

  const guard = (fn: () => void) => {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const toggleReleased = () => guard(() => mutateVipConfig((c) => setReleased(c, !config.released)))
  const toggleAuto = () => guard(() => mutateVipConfig((c) => setAutoGrant(c, !config.autoGrant)))
  const setThreshold = (id: RankId, cents: number) => guard(() => mutateVipConfig((c) => setRankMinWagered(c, id, cents)))
  const setReward = (id: RankId, cents: number) => guard(() => mutateVipConfig((c) => setRankReward(c, id, cents)))

  return (
    <div className="mgr-loy">
      <header className="mgr-loy-head">
        <h1 className="mgr-loy-title">Loyalty &amp; progression</h1>
        <p className="mgr-loy-sub">Tune the rank ladder — how much play reaches each tier and the free play it grants.</p>
      </header>

      <section className="mgr-loy-card" aria-label="Program">
        <Toggle label="Live to players" on={config.released} onClick={toggleReleased} hint="Show the program in-app." />
        <Toggle
          label="Auto-grant rewards"
          on={config.autoGrant}
          onClick={toggleAuto}
          hint="Drop a tier's free play automatically the moment a player reaches it."
        />
        <p className="mgr-loy-rate">Players earn <strong>1 point per $1 wagered</strong> toward their tier.</p>
      </section>

      {error && <p className="mgr-loy-err">{error}</p>}

      <section aria-label="Tiers">
        <h2 className="mgr-h2">Tiers</h2>
        <table className="mgr-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="num">Reach at (wagered)</th>
              <th className="num">Free-play reward</th>
              <th>Perks</th>
            </tr>
          </thead>
          <tbody>
            {ranks.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="mgr-loy-badge" style={{ background: r.color }} aria-hidden="true" />
                  {r.name}
                </td>
                <td className="num">
                  <DollarCell cents={r.minWagered} onCommit={(c) => setThreshold(r.id, c)} />
                </td>
                <td className="num">
                  <DollarCell cents={r.freePlayReward} onCommit={(c) => setReward(r.id, c)} />
                </td>
                <td className="mgr-dim">{r.perks.length ? r.perks.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mgr-loy-foot">
          Thresholds must keep climbing tier to tier — an out-of-order edit is rejected. Rewards land in a player's
          free-play pool, which credits the figure through <code>core.grant</code> on redemption.
        </p>
      </section>
    </div>
  )
}

function Toggle({ label, on, onClick, hint }: { label: string; on: boolean; onClick: () => void; hint: string }) {
  return (
    <div className="mgr-loy-toggle-row">
      <div>
        <span className="mgr-loy-toggle-label">{label}</span>
        <span className="mgr-loy-toggle-hint">{hint}</span>
      </div>
      <button className={`mgr-loy-switch ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} onClick={onClick}>
        <span />
      </button>
    </div>
  )
}

function DollarCell({ cents, onCommit }: { cents: number; onCommit: (cents: number) => void }) {
  return (
    <span className="mgr-loy-dollar">
      <span className="mgr-loy-prefix">$</span>
      <NumberInput
        className="mgr-loy-input"
        value={cents / 100}
        min={0}
        onCommit={(d) => onCommit(toCents(d ?? 0))}
        ariaLabel={`amount (${formatMoney(cents)})`}
      />
    </span>
  )
}
