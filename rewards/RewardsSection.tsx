/**
 * Rewards — one simple, real hub (sibling of Casino / Sportsbook). Everything here is live,
 * stateful and CREDITS ONLY: rakeback accrues from real wagering and claims into the balance,
 * the daily bonus runs a real 24h cooldown + streak, the warm-up bonus unlocks by wagering,
 * free spins decrement and pay credits, and the store spends credits you actually have. No
 * cash, no cash value, no withdrawal.
 *
 * "What you have / what you can claim / when" at a glance — rank, then the claimables, then
 * the store and the board. A demo control (demo sign-in only) simulates wagers + fast-forwards
 * the clock so every mechanic can be exercised and SEEN working without waiting 24h.
 */
import { useEffect, useReducer, useState, useSyncExternalStore } from 'react'
import { fmt, fmtCents, num, tierProgressFor, tierVisual } from './data.js'
import {
  getPlayerRewards,
  subscribeRewardsPlayers,
  getRewardsPlayersVersion,
  claimRakeback,
  dailyStatus,
  claimDaily,
  playFreeSpin,
  redeemStoreItem,
  settleWager,
  rankedByWagered,
} from './players.js'
import { getRewardsConfig, subscribeRewardsConfig, getRewardsConfigVersion } from './economy.js'
import { rewardsNow, advanceDemoClock, resetDemoClock, subscribeClock, getClockVersion } from './clock.js'
import { getBook } from '../app/book-store.js'
import { useAuth } from '../auth/index.js'
import './rewards.css'

const HOUR = 3_600_000
const DAY = 86_400_000

function fmtDuration(ms: number): string {
  if (ms <= 0) return 'now'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export interface RewardsSectionProps {
  memberId?: string
  playerName?: string
  /** Live core balance (cents) — the figure rewards pay into / the store spends from. */
  balanceCents: number
  /** Available credit to wager (cents). */
  availableCents?: number
}

export function RewardsSection({
  memberId = 'demo',
  playerName = 'You',
  balanceCents,
  availableCents = 0,
}: RewardsSectionProps) {
  useSyncExternalStore(subscribeRewardsPlayers, getRewardsPlayersVersion)
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  useSyncExternalStore(subscribeClock, getClockVersion)
  const { isDemo } = useAuth()

  // 1s tick so the daily countdown updates live (recomputed from rewardsNow()).
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  const [flash, setFlash] = useState<string | null>(null)
  const [spinResult, setSpinResult] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [flash])

  const now = rewardsNow()
  const state = getPlayerRewards(memberId)
  const cfg = getRewardsConfig()
  const loyalty = cfg.loyalty
  const wageredCredits = Math.floor(state.wagered / 100)
  const prog = tierProgressFor(cfg.tiers, wageredCredits)
  const tierV = tierVisual(prog.tier.id)
  const TierIcon = tierV.icon
  const daily = dailyStatus(memberId, now)

  return (
    <div className="rewards">
      <div className="rw-head">
        <div className="rw-section-head">
          <h1 className="rw-h1">Rewards</h1>
          <p className="rw-sub">Everything you can earn — claim it into your balance. Credits only.</p>
        </div>
        <div className="rw-head-kpis">
          <div className="rw-kpi">
            <span className="rw-label">Rank · {prog.tier.name}</span>
            <strong className="rw-coins">{num(wageredCredits)}</strong>
          </div>
          <div className="rw-kpi">
            <span className="rw-label">Balance</span>
            <strong className="rw-coins">{fmtCents(balanceCents)}</strong>
          </div>
          <div className="rw-kpi">
            <span className="rw-label">Available credit</span>
            <strong className="rw-coins rw-dim">{fmtCents(availableCents)}</strong>
          </div>
        </div>
      </div>

      {flash && (
        <p className="rw-saved" role="status">
          {flash}
        </p>
      )}

      {/* ── Rank hero ── */}
      <section className="rw-hero" style={{ ['--accent' as string]: tierV.color }} aria-label="Your rank">
        <div className="rw-hero-emblem">
          <TierIcon aria-hidden="true" />
        </div>
        <div className="rw-hero-body">
          <div className="rw-head">
            <span className="rw-h2" style={{ margin: 0 }}>
              {prog.tier.name} rank
            </span>
            {prog.next ? (
              <span className="rw-sub" style={{ margin: 0 }}>
                {num(prog.toNext)} more wagered to <strong style={{ color: 'var(--text)' }}>{prog.next.name}</strong>
              </span>
            ) : (
              <span className="rw-pill is-gold">Top rank reached</span>
            )}
          </div>
          <div className="rw-progress" role="progressbar" aria-valuenow={Math.round(prog.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="rw-progress-fill" style={{ width: `${prog.pct * 100}%` }} />
          </div>
          <div className="rw-perks">
            {prog.tier.perks.map((p, i) => (
              <span className="rw-pill" key={i}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Claimables: rakeback / daily / free spins ── */}
      <div className="rw-grid">
        {/* Rakeback */}
        <section className="rw-card rw-stat" aria-label="Rakeback">
          <div className="rw-head">
            <h2 className="rw-h2" style={{ margin: 0 }}>
              Rakeback
            </h2>
            <span className="rw-pill">{Math.round(loyalty.rakebackRate * 100)}% of wagers</span>
          </div>
          <strong className="rw-big">{fmtCents(state.rakebackAccrued)}</strong>
          <span className="rw-row-desc">accrued from your play</span>
          <button
            type="button"
            className="rw-btn rw-btn-primary"
            disabled={state.rakebackAccrued <= 0}
            onClick={() => {
              const amt = claimRakeback(memberId, now)
              setFlash(amt > 0 ? `Claimed ${fmtCents(amt)} rakeback to your balance` : 'No rakeback to claim yet.')
            }}
          >
            {state.rakebackAccrued > 0 ? `Claim ${fmtCents(state.rakebackAccrued)}` : 'Nothing to claim'}
          </button>
        </section>

        {/* Daily bonus + streak */}
        <section className="rw-card rw-stat" aria-label="Daily bonus">
          <div className="rw-head">
            <h2 className="rw-h2" style={{ margin: 0 }}>
              Daily bonus
            </h2>
            <span className="rw-pill is-gold">🔥 {state.streak}-day streak</span>
          </div>
          {daily.claimable ? (
            <>
              <strong className="rw-big">{fmtCents(daily.amountCents)}</strong>
              <span className="rw-row-desc">ready to claim</span>
              <button
                type="button"
                className="rw-btn rw-btn-primary"
                onClick={() => {
                  const r = claimDaily(memberId, now)
                  if (r.ok) setFlash(`Daily bonus +${fmtCents(r.amountCents)} — streak now ${r.streak} 🔥`)
                }}
              >
                Claim {fmtCents(daily.amountCents)}
              </button>
            </>
          ) : (
            <>
              <strong className="rw-big">{fmtDuration(daily.msLeft)}</strong>
              <span className="rw-row-desc">until your next daily bonus</span>
              <button type="button" className="rw-btn" disabled>
                Claimed — come back soon
              </button>
            </>
          )}
        </section>

        {/* Free spins */}
        <section className="rw-card rw-stat" aria-label="Free spins">
          <div className="rw-head">
            <h2 className="rw-h2" style={{ margin: 0 }}>
              Free spins
            </h2>
            <span className="rw-pill">{state.freeSpins} left</span>
          </div>
          <strong className="rw-big">{spinResult ?? '🎡'}</strong>
          <span className="rw-row-desc">
            spin the wheel — pays {fmt(loyalty.spinMin)}–{fmt(loyalty.spinMax)}
          </span>
          <button
            type="button"
            className="rw-btn rw-btn-primary"
            disabled={state.freeSpins <= 0}
            onClick={() => {
              const r = playFreeSpin(memberId, now, Math.random())
              if (r.ok) {
                setSpinResult(`+${fmtCents(r.payoutCents)}`)
                setFlash(`Spin paid ${fmtCents(r.payoutCents)} — ${r.spinsLeft} spin${r.spinsLeft === 1 ? '' : 's'} left`)
              }
            }}
          >
            {state.freeSpins > 0 ? 'Spin' : 'No spins left'}
          </button>
        </section>
      </div>

      {/* ── Warm-up bonus ── */}
      {state.warmup && (
        <section className="rw-card" aria-label="Warm-up bonus">
          <div className="rw-head">
            <h2 className="rw-h2" style={{ margin: 0 }}>
              Warm-up bonus — {fmtCents(state.warmup.locked)} locked
            </h2>
            <span className="rw-pill">{Math.round((state.warmup.wagered / state.warmup.required) * 100)}%</span>
          </div>
          <p className="rw-sub" style={{ margin: '0 0 8px' }}>
            Keep wagering to unlock these credits into your balance — never a cash-out.
          </p>
          <div className="rw-progress">
            <div className="rw-progress-fill" style={{ width: `${Math.min(100, (state.warmup.wagered / state.warmup.required) * 100)}%` }} />
          </div>
          <div className="rw-progress-meta">
            <span>{fmtCents(state.warmup.wagered)} wagered</span>
            <span>{fmtCents(state.warmup.required)} to unlock</span>
          </div>
        </section>
      )}

      {/* ── Store + Leaderboard ── */}
      <div className="rw-grid-2">
        <section className="rw-card" aria-label="Rewards store">
          <h2 className="rw-h2">Store</h2>
          <p className="rw-sub" style={{ margin: '0 0 10px' }}>
            Spend your credits on spins, rank boosts and flair.
          </p>
          <div className="rw-list">
            {loyalty.store.map((item) => {
              const owned = !!item.once && state.redeemed.includes(item.id)
              const afford = balanceCents >= item.cost * 100
              return (
                <div className="rw-row" key={item.id}>
                  <div className="rw-row-body">
                    <span className="rw-row-name">{item.name}</span>
                    <span className="rw-row-desc">{item.desc}</span>
                  </div>
                  {owned ? (
                    <span className="rw-pill is-up">Owned</span>
                  ) : (
                    <button
                      type="button"
                      className="rw-btn rw-btn-primary"
                      disabled={!afford}
                      onClick={() => {
                        const r = redeemStoreItem(memberId, item.id, now)
                        setFlash(r.ok ? `Redeemed ${item.name} for ${fmt(item.cost)}` : (r.reason ?? 'Could not redeem.'))
                      }}
                      title={afford ? '' : 'Not enough credits'}
                    >
                      {fmt(item.cost)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="rw-card" aria-label="Leaderboard">
          <h2 className="rw-h2">Top players — wagered</h2>
          <table className="rw-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col" className="num">
                  Wagered
                </th>
              </tr>
            </thead>
            <tbody>
              {rankedByWagered()
                .slice(0, 8)
                .map((r, i) => {
                  const name = r.id === memberId ? playerName : getBook().members[r.id]?.name ?? r.id
                  return (
                    <tr key={r.id} className={r.id === memberId ? 'is-you' : undefined}>
                      <td className={`rw-rankno${i < 3 ? ' is-top' : ''}`}>{i + 1}</td>
                      <td>{name}</td>
                      <td className="num rw-value">{fmtCents(r.wagered)}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── Demo control (demo sign-in only) ── */}
      {isDemo && (
        <section className="rw-card rw-demo" aria-label="Demo controls">
          <div className="rw-head">
            <h2 className="rw-h2" style={{ margin: 0 }}>
              Demo controls
            </h2>
            <span className="rw-pill">dev only</span>
          </div>
          <p className="rw-sub" style={{ margin: '0 0 10px' }}>
            Simulate activity to see the mechanics work: place sample wagers (accrues rakeback +
            advances warm-up + rank) and fast-forward the clock (daily reset + streak).
          </p>
          <div className="rw-demo-btns">
            <button
              type="button"
              className="rw-btn"
              onClick={() => {
                settleWager(memberId, 5_000, now)
                setFlash('Simulated a $50 wager.')
              }}
            >
              Wager $50
            </button>
            <button
              type="button"
              className="rw-btn"
              onClick={() => {
                settleWager(memberId, 50_000, now)
                setFlash('Simulated a $500 wager.')
              }}
            >
              Wager $500
            </button>
            <button
              type="button"
              className="rw-btn"
              onClick={() => {
                advanceDemoClock(HOUR)
                setFlash('Clock advanced 1 hour.')
              }}
            >
              +1 hour
            </button>
            <button
              type="button"
              className="rw-btn"
              onClick={() => {
                advanceDemoClock(DAY)
                setFlash('Clock advanced 24 hours — daily bonus reset.')
              }}
            >
              +24 hours
            </button>
            <button
              type="button"
              className="rw-btn"
              onClick={() => {
                resetDemoClock()
                setFlash('Demo clock reset to real time.')
              }}
            >
              Reset clock
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
