/**
 * Rewards — a top-level PLAYER section (sibling of Casino / Sportsbook). The loyalty/
 * status layer, engine-backed: it reads THIS player's real reward state (status, cashback,
 * locked bonuses) and the operator's ENABLED programs (tiers, promos, contests, …). A
 * player sees only their own standing and only what the operator turned on.
 *
 * BALANCE & STATUS ONLY. Two kinds of value, neither cash: the player's regular core
 * BALANCE (the betting figure) and STATUS (monotonic tier points). Every reward — cashback,
 * daily, missions, promos, comps — credits the regular balance (locked bonuses unlock to it
 * through a play-through, never a cash-out). `onCredit` moves balance through core when a
 * reward is claimed.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { VIEWS, fmt, fmtCents, tierForStatus, type RewardsApi, type ViewId } from './data.js'
import {
  getPlayerRewards,
  subscribeRewardsPlayers,
  getRewardsPlayersVersion,
  markClaimed,
  isClaimed as engineIsClaimed,
  claimCashback as engineClaimCashback,
  grantLockedBonus,
} from './players.js'
import {
  getRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  visiblePromos,
  visibleContests,
  canIssue,
  recordIssuance,
} from './economy.js'
import { RewardsLanding } from './RewardsLanding.js'
import { RanksView } from './RanksView.js'
import { LeaderboardsView } from './LeaderboardsView.js'
import { DailyView } from './DailyView.js'
import { ChallengesView } from './ChallengesView.js'
import { BadgesView } from './BadgesView.js'
import { PromotionsView } from './PromotionsView.js'
import { ContestsView } from './ContestsView.js'
import './rewards.css'

export interface RewardsSectionProps {
  /** The signed-in player's book member id — keys their engine reward state. */
  memberId?: string
  /** The signed-in player's display name (highlighted on the boards). */
  playerName?: string
  /** The player's live core BALANCE in cents (the figure; read-only here). */
  balanceCents: number
  /** Available CREDIT to wager in cents (credit limit + figure − pending). */
  availableCents?: number
  /** Move REGULAR balance through the shared core figure when a reward is claimed (+ units). */
  onCredit?: (deltaUnits: number) => void
}

const DEMO_NOW = 1_750_000_000_000

export function RewardsSection({
  memberId = 'demo',
  playerName = 'You',
  balanceCents,
  availableCents = 0,
  onCredit,
}: RewardsSectionProps) {
  const [view, setView] = useState<ViewId>('overview')
  const [flash, setFlash] = useState<string | null>(null)
  useSyncExternalStore(subscribeRewardsPlayers, getRewardsPlayersVersion)
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)

  const state = getPlayerRewards(memberId)
  const config = getRewardsConfig()
  const tier = tierForStatus(config.tiers, state.status)

  const api: RewardsApi = useMemo(
    () => ({
      playerName,
      balanceCents,
      availableCents,
      player: {
        wagered: state.status, // engagement cards read this; mirror real status
        betsPlaced: 412,
        daysActive: 23,
        loginStreak: state.dailyDay,
        dailyClaimedToday: state.dailyClaimedToday,
      },
      status: state.status,
      cashbackPending: state.cashbackPending,
      locked: state.locked,
      tiers: config.tiers,
      promos: config.enabled.promos ? visiblePromos(DEMO_NOW) : [],
      contests: config.enabled.contests ? visibleContests() : [],
      isClaimed: (id) => engineIsClaimed(memberId, id),
      go: setView,
      claim: (id, amount, label) => {
        if (engineIsClaimed(memberId, id)) return
        if (amount > 0) {
          const cap = canIssue(amount, DEMO_NOW) // total cap + weekly budget
          if (!cap.ok) {
            setFlash(cap.reason ?? 'Rewards budget reached — try again later.')
            return
          }
        }
        markClaimed(memberId, id)
        if (amount > 0) {
          onCredit?.(amount) // straight to the player's balance
          recordIssuance(id.startsWith('daily') ? 'daily' : 'mission', amount, DEMO_NOW)
        }
        setFlash(label ?? `Added ${fmt(amount)} to your balance`)
      },
      claimCashback: () => {
        const moved = engineClaimCashback(memberId)
        if (moved > 0) {
          onCredit?.(moved)
          recordIssuance('cashback', moved, DEMO_NOW)
        }
        setFlash(moved > 0 ? `Claimed ${fmt(moved)} cashback to your balance` : 'No cashback to claim yet.')
      },
      claimPromo: (promo) => {
        if (engineIsClaimed(memberId, promo.id)) return
        if ((promo.kind === 'topup' || promo.kind === 'bonus') && !canIssue(promo.amount, DEMO_NOW).ok) {
          setFlash('Rewards budget reached — try again later.')
          return
        }
        markClaimed(memberId, promo.id)
        if (promo.kind === 'topup' || promo.kind === 'bonus') {
          const out = grantLockedBonus(memberId, promo.amount, promo.playthrough, promo.name, `promo-${promo.id}`)
          recordIssuance('promo', promo.amount, DEMO_NOW)
          if (out.instant > 0) onCredit?.(out.instant)
          setFlash(
            promo.playthrough > 0
              ? `${fmt(promo.amount)} bonus added — unlocks as you play.`
              : `${fmt(promo.amount)} added to your balance.`,
          )
        } else if (promo.kind === 'freeplay') {
          setFlash(`${promo.amount} free play${promo.amount === 1 ? '' : 's'} added.`)
        } else {
          setFlash(`+${promo.amount}% odds boost opted in.`)
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberId, playerName, balanceCents, availableCents, state, config],
  )

  const Active = () => {
    switch (view) {
      case 'ranks':
        return <RanksView api={api} />
      case 'promos':
        return <PromotionsView api={api} now={DEMO_NOW} />
      case 'contests':
        return <ContestsView api={api} />
      case 'boards':
        return <LeaderboardsView api={api} />
      case 'daily':
        return <DailyView api={api} />
      case 'challenges':
        return <ChallengesView api={api} />
      case 'badges':
        return <BadgesView api={api} />
      default:
        return <RewardsLanding api={api} />
    }
  }

  const enabledViews = VIEWS.filter((v) => {
    if (v.id === 'promos') return config.enabled.promos
    if (v.id === 'contests') return config.enabled.contests
    if (v.id === 'boards') return config.enabled.leaderboards
    if (v.id === 'daily') return config.enabled.daily
    if (v.id === 'challenges') return config.enabled.missions
    return true // overview / ranks / badges always on
  })

  return (
    <div className="rewards">
      <div className="rw-head">
        <div className="rw-section-head">
          <h1 className="rw-h1">Rewards</h1>
          <p className="rw-sub">Everything you can earn — rank up, climb the boards, claim rewards.</p>
        </div>
        <div className="rw-head-kpis">
          <div className="rw-kpi">
            <span className="rw-label">Status · {tier.name}</span>
            <strong className="rw-coins">{state.status.toLocaleString()}</strong>
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

      <nav className="rw-subnav" aria-label="Rewards sections">
        {enabledViews.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`rw-tab ${v.id === view ? 'is-on' : ''}`}
            aria-current={v.id === view ? 'page' : undefined}
            title={v.hint}
            onClick={() => setView(v.id)}
          >
            <v.icon aria-hidden="true" />
            {v.name}
          </button>
        ))}
      </nav>

      {flash && (
        <p className="rw-saved" role="status">
          {flash}
        </p>
      )}

      <div className="rw-view">
        <Active />
      </div>
    </div>
  )
}
