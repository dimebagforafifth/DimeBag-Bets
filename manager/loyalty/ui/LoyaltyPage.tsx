import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  getPlayerVip,
  getVipConfig,
  getVipVersion,
  grantFreePlay,
  leaderboard,
  mutateVipConfig,
  settleOwedRewards,
  subscribeVip,
} from '../../../app/vip-store.js'
import { getBookVersion, listPlayers, subscribeBook } from '../../../app/book-store.js'
import {
  rankProgress,
  setAutoGrant,
  setRankMinWagered,
  setRankReward,
  setReleased,
  unclaimedRewards,
  type LeaderboardRow,
  type RankDef,
  type RankId,
} from '../../../vip/index.js'
import { NumberInput } from '../../../games/shared/NumberInput.js'
import { formatMoney, toCents } from '../../../games/shared/money.js'
import './loyalty.css'
import './loyalty-ops.css'

/**
 * Loyalty / progression — a manager surface over the existing VIP program
 * (vip/ + app/vip-store). It reads the live config and edits it through the
 * program's own guarded setters (threshold monotonicity is enforced there); it
 * adds no new model and moves no money on the CONFIG side.
 *
 * On top of the config it surfaces the OPERATIONS a book runs on the loyalty
 * program: a lifetime-wagered leaderboard, a per-player VIP inspector (standing,
 * claimed ranks, free-play balance, progress to the next tier), a manual
 * free-play grant (the one money-adjacent action — routed through
 * vip-store.grantFreePlay, which credits the player's promo pool, NEVER a core
 * balance), and a program-wide free-play liability widget. Self-contained; the
 * shell mounts it. Reactive via subscribeVip + subscribeBook.
 */
export function LoyaltyPage() {
  const v = useSyncExternalStore(subscribeVip, getVipVersion)
  // subscribeBook so the player roster / names stay live (recruit, rename, suspend).
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const config = useMemo(() => getVipConfig(), [v])
  const [error, setError] = useState<string | null>(null)

  const ranks = config.ranks.filter((r) => r.id !== 'none') // 'none' is the floor everyone starts at

  // Players in the book → leaderboard rows (sorted by lifetime wagered). Recomputed
  // on either store tick (config re-pricing changes ranks; book changes the roster).
  const players = useMemo(() => listPlayers().map((p) => ({ id: p.id, name: p.name })), [bv])
  const rows = useMemo(() => leaderboard(players), [players, v, bv])

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

      <LiabilityWidget rows={rows} ranks={ranks} />

      <Leaderboard rows={rows} />

      <Inspector
        players={players}
        ranks={ranks}
        v={v}
        onGrant={(id, cents) => grantFreePlay(id, cents)}
        onSettleOwed={(id) => settleOwedRewards(id)}
      />

      <BulkGrant rows={rows} ranks={ranks} onGrant={(id, cents) => grantFreePlay(id, cents)} />
    </div>
  )
}

/* ------------------------------ liability ------------------------------- */

/** Program-wide free-play exposure: total outstanding free-play owed across all
 *  players (a real liability the book carries) + a headcount per rank. */
function LiabilityWidget({ rows, ranks }: { rows: LeaderboardRow[]; ranks: RankDef[] }) {
  const liability = rows.reduce((sum, r) => sum + r.freePlay, 0)
  const owed = rows.filter((r) => r.freePlay > 0).length
  const ranked = rows.filter((r) => r.rank.id !== 'none').length
  // Per editable rank (skip 'none'): headcount + free-play liability carried by
  // that tier, built from the live rows. A real book wants to know not just how
  // many sit at each tier but how much promo each tier is sitting on.
  const breakdown = ranks.map((rk) => {
    const at = rows.filter((r) => r.rank.id === rk.id)
    return {
      rank: rk,
      n: at.length,
      owed: at.reduce((sum, r) => sum + r.freePlay, 0),
    }
  })
  const totalHeads = rows.length

  return (
    <section aria-label="VIP exposure">
      <h2 className="mgr-h2">VIP exposure</h2>
      <div className="loy-stat-grid">
        <Stat label="Free-play liability" value={formatMoney(liability)} hint="Outstanding promo owed" tone="warn" />
        <Stat label="Players owed" value={String(owed)} hint="Carry a free-play balance" />
        <Stat label="Ranked players" value={`${ranked} / ${totalHeads}`} hint="Reached at least Bronze" />
      </div>
      <table className="loy-exposure">
        <thead>
          <tr>
            <th>Tier</th>
            <th className="num">Players</th>
            <th className="num">Free-play owed</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map(({ rank, n, owed: rankOwed }) => (
            <tr key={rank.id}>
              <td>
                <span className="loy-rank-tag">
                  <span className="mgr-loy-badge" style={{ background: rank.color }} aria-hidden="true" />
                  {rank.name}
                </span>
              </td>
              <td className="num">{n}</td>
              <td className={`num loy-money ${rankOwed > 0 ? 'is-free' : ''}`}>
                {rankOwed > 0 ? formatMoney(rankOwed) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{totalHeads}</td>
            <td className={`num loy-money ${liability > 0 ? 'is-free' : ''}`}>
              {liability > 0 ? formatMoney(liability) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

/* ----------------------------- leaderboard ------------------------------ */

/** Lifetime-wagered leaderboard. Sorted by wagered (vip-store does the sort);
 *  shows position, player, lifetime wagered, current rank, free-play balance.
 *  Search-first (CLAUDE.md §2): filter by name and clamp to a single tier. The
 *  POSITION stays the player's true book-wide standing (from the unfiltered row),
 *  so filtering never re-ranks — it just narrows the view. */
function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<RankId | 'all'>('all')

  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    (r) => (q === '' || r.name.toLowerCase().includes(q)) && (tier === 'all' || r.rank.id === tier),
  )
  // Distinct tiers actually present, in leaderboard order, for the filter chips.
  const tiers: RankDef[] = []
  for (const r of rows) if (!tiers.some((t) => t.id === r.rank.id)) tiers.push(r.rank)

  return (
    <section aria-label="Leaderboard">
      <h2 className="mgr-h2">Leaderboard</h2>
      {rows.length === 0 ? (
        <p className="mgr-loy-foot">No players in the book yet.</p>
      ) : (
        <>
          <div className="loy-lb-controls">
            <input
              className="loy-lb-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players…"
              aria-label="Search the leaderboard by player name"
            />
            <div className="loy-lb-chips" role="group" aria-label="Filter by tier">
              <button
                type="button"
                className={`loy-chip ${tier === 'all' ? 'is-on' : ''}`}
                onClick={() => setTier('all')}
                aria-pressed={tier === 'all'}
              >
                All
              </button>
              {tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`loy-chip ${tier === t.id ? 'is-on' : ''}`}
                  onClick={() => setTier(t.id)}
                  aria-pressed={tier === t.id}
                >
                  <span className="mgr-loy-badge" style={{ background: t.color }} aria-hidden="true" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="mgr-loy-foot">No players match.</p>
          ) : (
            <table className="loy-lb">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Player</th>
                  <th>Rank</th>
                  <th className="num">Lifetime wagered</th>
                  <th className="num">Free play</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="num loy-pos">{r.position}</td>
                    <td className="loy-name">{r.name}</td>
                    <td>
                      <span className="loy-rank-tag">
                        <span className="mgr-loy-badge" style={{ background: r.rank.color }} aria-hidden="true" />
                        {r.rank.name}
                      </span>
                    </td>
                    <td className="num loy-money">{formatMoney(r.wagered)}</td>
                    <td className={`num loy-money ${r.freePlay > 0 ? 'is-free' : ''}`}>
                      {r.freePlay > 0 ? formatMoney(r.freePlay) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}

/* ------------------------------ inspector ------------------------------- */

/**
 * Per-player VIP inspector + manual free-play grant. Pick a player, see their
 * lifetime wagered, current rank, claimed ranks, free-play balance, and progress
 * to the next tier; then optionally grant free play to the player or — bulk — top
 * every player up to a tier's reward. The grant routes through
 * vip-store.grantFreePlay (credits the promo pool only — never a core balance).
 */
function Inspector({
  players,
  ranks,
  v,
  onGrant,
  onSettleOwed,
}: {
  players: { id: string; name: string }[]
  ranks: RankDef[]
  v: number
  onGrant: (id: string, cents: number) => void
  onSettleOwed: (id: string) => number
}) {
  const [selected, setSelected] = useState<string>('')
  const [coins, setCoins] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const config = useMemo(() => getVipConfig(), [v])
  const player = players.find((p) => p.id === selected) ?? null
  // Recompute on the vip tick (v) so a grant we just made shows immediately.
  const vip = useMemo(() => (player ? getPlayerVip(player.id) : null), [player, v])
  const progress = useMemo(() => (vip ? rankProgress(vip.wagered, config) : null), [vip, config])
  // Tiers the player has REACHED but whose reward hasn't dropped (auto-grant off,
  // or a threshold lowered before a player re-played). Read-only signal + a
  // one-click settle that routes the owed total through the same promo path.
  const owedRewards = useMemo(() => (vip ? unclaimedRewards(vip, config) : []), [vip, config])
  const owedTotal = owedRewards.reduce((sum, r) => sum + r.freePlayReward, 0)

  const grant = () => {
    if (!player || coins == null || coins <= 0) return
    const cents = toCents(coins)
    if (cents <= 0) return
    onGrant(player.id, cents)
    setDone(`Granted ${formatMoney(cents)} free play to ${player.name}.`)
    setCoins(null)
  }

  const grantOwed = () => {
    if (!player || owedTotal <= 0) return
    // Idempotent settle: marks each reached tier claimed so the same reward can't be
    // granted twice (unlike the free-form grant above). A second click grants 0.
    const granted = onSettleOwed(player.id)
    setDone(`Settled ${formatMoney(granted)} in reached-tier rewards to ${player.name}.`)
    setCoins(null)
  }

  return (
    <section aria-label="Player inspector" className="loy-inspector">
      <h2 className="mgr-h2">Player VIP inspector</h2>
      <label className="loy-pick">
        <span className="loy-pick-label">Player</span>
        <select
          className="loy-select"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setDone(null)
            setCoins(null)
          }}
          aria-label="Select a player to inspect"
        >
          <option value="">Select a player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {player && vip && progress ? (
        <>
          <div className="loy-stat-grid">
            <Stat label="Lifetime wagered" value={formatMoney(vip.wagered)} />
            <Stat
              label="Current rank"
              value={progress.current.name}
              badge={progress.current.color}
            />
            <Stat
              label="Free-play balance"
              value={vip.freePlay > 0 ? formatMoney(vip.freePlay) : '—'}
              tone={vip.freePlay > 0 ? 'free' : undefined}
            />
            <Stat label="Ranks claimed" value={vip.claimedRanks.length ? String(vip.claimedRanks.length) : '0'} />
          </div>

          <div className="loy-progress">
            {progress.next ? (
              <>
                <div className="loy-progress-head">
                  <span>
                    To <strong>{progress.next.name}</strong>
                  </span>
                  <span className="loy-progress-pct">{Math.round(progress.pct * 100)}%</span>
                </div>
                <div className="loy-bar" role="progressbar" aria-valuenow={Math.round(progress.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="loy-bar-fill" style={{ width: `${Math.round(progress.pct * 100)}%`, background: progress.next.color }} />
                </div>
                <p className="loy-progress-rem">{formatMoney(progress.remaining)} more wagered to reach {progress.next.name}.</p>
              </>
            ) : (
              <p className="loy-progress-rem">At the top of the ladder — {progress.current.name}.</p>
            )}
          </div>

          {vip.claimedRanks.length > 0 && (
            <div className="loy-claimed">
              <span className="loy-claimed-label">Claimed</span>
              {ranks
                .filter((rk) => vip.claimedRanks.includes(rk.id))
                .map((rk) => (
                  <span key={rk.id} className="loy-rank-tag">
                    <span className="mgr-loy-badge" style={{ background: rk.color }} aria-hidden="true" />
                    {rk.name}
                  </span>
                ))}
            </div>
          )}

          {owedTotal > 0 && (
            <div className="loy-owed">
              <div className="loy-owed-head">
                <span className="loy-owed-label">Reached, not yet granted</span>
                <span className="loy-owed-total loy-money is-free">{formatMoney(owedTotal)}</span>
              </div>
              <div className="loy-owed-tags">
                {owedRewards.map((rk) => (
                  <span key={rk.id} className="loy-rank-tag">
                    <span className="mgr-loy-badge" style={{ background: rk.color }} aria-hidden="true" />
                    {rk.name}
                    <span className="loy-owed-amt">{formatMoney(rk.freePlayReward)}</span>
                  </span>
                ))}
              </div>
              <button className="loy-grant-btn is-owed" onClick={grantOwed}>
                Grant owed reward{owedRewards.length > 1 ? 's' : ''}
              </button>
              <p className="loy-grant-note">
                These tiers were reached while auto-grant was off (or after a threshold drop). Settling drops the
                pooled reward into the player's free play — same promo path, never their figure.
              </p>
            </div>
          )}

          <div className="loy-grant">
            <span className="loy-grant-label">Grant free play</span>
            <div className="loy-grant-row">
              <span className="mgr-loy-dollar">
                <span className="mgr-loy-prefix">$</span>
                <NumberInput
                  className="mgr-loy-input"
                  value={coins}
                  min={0}
                  onCommit={(d) => setCoins(d)}
                  ariaLabel="free-play amount"
                  placeholder="0.00"
                />
              </span>
              <button className="loy-grant-btn" onClick={grant} disabled={coins == null || coins <= 0}>
                Grant
              </button>
            </div>
            <p className="loy-grant-note">
              Credits the player's free-play pool only — never their figure. They redeem it themselves, which credits
              the balance through <code>core.grant</code>.
            </p>
            {done && <p className="loy-grant-ok" role="status">{done}</p>}
          </div>
        </>
      ) : (
        <p className="mgr-loy-foot">Pick a player to see their VIP standing and grant free play.</p>
      )}
    </section>
  )
}

/* ------------------------------ bulk grant ------------------------------ */

/**
 * Grant a flat free-play amount to EVERY player currently at a chosen tier — the
 * "comp the whole rank" lever a book pulls for a promo (e.g. "give every Gold
 * +$25 this week"). Pick a tier, see the headcount + total it will cost, set an
 * amount, confirm. Each credit routes through the same vip-store.grantFreePlay
 * promo path (never a core balance). Requires an explicit confirm step because it
 * touches many players at once.
 */
function BulkGrant({
  rows,
  ranks,
  onGrant,
}: {
  rows: LeaderboardRow[]
  ranks: RankDef[]
  onGrant: (id: string, cents: number) => void
}) {
  const [tier, setTier] = useState<RankId | ''>('')
  const [coins, setCoins] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const recipients = tier ? rows.filter((r) => r.rank.id === tier) : []
  const cents = coins != null && coins > 0 ? toCents(coins) : 0
  const totalCost = cents * recipients.length
  const tierName = ranks.find((r) => r.id === tier)?.name ?? ''
  const ready = !!tier && recipients.length > 0 && cents > 0

  const apply = () => {
    if (!ready) return
    for (const r of recipients) onGrant(r.id, cents)
    setDone(
      `Granted ${formatMoney(cents)} free play to ${recipients.length} ${tierName} ${
        recipients.length === 1 ? 'player' : 'players'
      } — ${formatMoney(totalCost)} total.`,
    )
    setCoins(null)
    setConfirming(false)
  }

  return (
    <section aria-label="Bulk grant" className="loy-bulk">
      <h2 className="mgr-h2">Grant to a whole tier</h2>
      <div className="loy-bulk-row">
        <label className="loy-pick">
          <span className="loy-pick-label">Tier</span>
          <select
            className="loy-select"
            value={tier}
            onChange={(e) => {
              setTier(e.target.value as RankId | '')
              setConfirming(false)
              setDone(null)
            }}
            aria-label="Select a tier to grant free play to"
          >
            <option value="">Select a tier…</option>
            {ranks.map((r) => {
              const n = rows.filter((row) => row.rank.id === r.id).length
              return (
                <option key={r.id} value={r.id}>
                  {r.name} ({n})
                </option>
              )
            })}
          </select>
        </label>
        <span className="mgr-loy-dollar">
          <span className="mgr-loy-prefix">$</span>
          <NumberInput
            className="mgr-loy-input"
            value={coins}
            min={0}
            onCommit={(d) => {
              setCoins(d)
              setConfirming(false)
            }}
            ariaLabel="bulk free-play amount per player"
            placeholder="0.00"
          />
        </span>
        {!confirming ? (
          <button className="loy-grant-btn" onClick={() => setConfirming(true)} disabled={!ready}>
            Grant to tier
          </button>
        ) : (
          <span className="loy-bulk-confirm">
            <button className="loy-grant-btn is-confirm" onClick={apply}>
              Confirm
            </button>
            <button className="loy-grant-btn is-ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        )}
      </div>
      {ready ? (
        <p className="loy-bulk-preview">
          {formatMoney(cents)} each to <strong>{recipients.length}</strong> {tierName}{' '}
          {recipients.length === 1 ? 'player' : 'players'} — <strong>{formatMoney(totalCost)}</strong> total.
        </p>
      ) : tier && recipients.length === 0 ? (
        <p className="mgr-loy-foot">No players currently at {tierName}.</p>
      ) : (
        <p className="mgr-loy-foot">
          Pick a tier and an amount to comp every player at that rank. Credits the free-play pool only.
        </p>
      )}
      {done && <p className="loy-grant-ok" role="status">{done}</p>}
    </section>
  )
}

/* --------------------------------- bits --------------------------------- */

function Stat({
  label,
  value,
  hint,
  tone,
  badge,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'warn' | 'free'
  badge?: string
}) {
  return (
    <div className="loy-stat">
      <span className="loy-stat-label">{label}</span>
      <span className={`loy-stat-value ${tone ? `is-${tone}` : ''}`}>
        {badge && <span className="mgr-loy-badge" style={{ background: badge }} aria-hidden="true" />}
        {value}
      </span>
      {hint && <span className="loy-stat-hint">{hint}</span>}
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
