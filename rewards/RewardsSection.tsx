/**
 * Rewards — a top-level PLAYER section (sibling of Casino / Sportsbook). The loyalty/
 * status layer, now engine-backed: it reads THIS player's real reward state (status,
 * spendable, cashback, locked bonuses) and the operator's ENABLED programs (tiers, promos,
 * contests, …). A player sees only their own standing and only what the operator turned on.
 *
 * COINS / STATUS ONLY. Three kinds of value, none cash: the regular coin balance (betting,
 * read-only here), STATUS (monotonic tier points), and SPENDABLE rewards (the store
 * currency). Locked bonuses unlock to regular coins via a coins-only playthrough — never a
 * cash-out. `onCredit` lets the host move regular coins when an instant bonus is claimed.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { VIEWS, coins, tierForStatus, type RewardsApi, type ViewId } from './data.js'
import {
  getPlayerRewards,
  subscribeRewardsPlayers,
  getRewardsPlayersVersion,
  addSpendable,
  markClaimed,
  isClaimed as engineIsClaimed,
  claimCashback as engineClaimCashback,
  spendSpendable,
  grantLockedBonus,
} from './players.js'
import {
  getRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  visiblePromos,
  visibleContests,
} from './economy.js'
import { RewardsLanding } from './RewardsLanding.js'
import { RanksView } from './RanksView.js'
import { LeaderboardsView } from './LeaderboardsView.js'
import { StoreView } from './StoreView.js'
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
  /** The player's live REGULAR balance in whole COINS (read-only). */
  balanceCoins: number
  /** Optional: move REGULAR coins through the shared balance on an instant grant (+). */
  onCredit?: (deltaCoins: number) => void
}

const DEMO_NOW = 1_750_000_000_000

export function RewardsSection({
  memberId = 'demo',
  playerName = 'You',
  balanceCoins,
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
      balanceCoins,
      player: {
        wagered: state.status, // engagement cards read this; mirror real status
        betsPlaced: 412,
        daysActive: 23,
        loginStreak: state.dailyDay,
        dailyClaimedToday: state.dailyClaimedToday,
      },
      status: state.status,
      spendable: state.spendable,
      cashbackPending: state.cashbackPending,
      locked: state.locked,
      tiers: config.tiers,
      promos: config.enabled.promos ? visiblePromos(DEMO_NOW) : [],
      contests: config.enabled.contests ? visibleContests() : [],
      isClaimed: (id) => engineIsClaimed(memberId, id),
      go: setView,
      claim: (id, amount, label) => {
        if (engineIsClaimed(memberId, id)) return
        markClaimed(memberId, id)
        if (amount > 0) addSpendable(memberId, amount)
        setFlash(label ?? `Claimed ${coins(amount)} to your rewards balance`)
      },
      claimCashback: () => {
        const moved = engineClaimCashback(memberId)
        setFlash(moved > 0 ? `Claimed ${coins(moved)} cashback to rewards` : 'No cashback to claim yet.')
      },
      claimPromo: (promo) => {
        if (engineIsClaimed(memberId, promo.id)) return
        markClaimed(memberId, promo.id)
        if (promo.kind === 'topup' || promo.kind === 'bonus') {
          const out = grantLockedBonus(memberId, promo.amount, promo.playthrough, promo.name, `promo-${promo.id}`)
          if (out.instantCoins > 0) onCredit?.(out.instantCoins)
          setFlash(
            promo.playthrough > 0
              ? `${coins(promo.amount)} bonus added — unlocks as you play.`
              : `${coins(promo.amount)} bonus coins added.`,
          )
        } else if (promo.kind === 'freeplay') {
          setFlash(`${promo.amount} free play${promo.amount === 1 ? '' : 's'} added.`)
        } else {
          setFlash(`+${promo.amount}% odds boost opted in.`)
        }
      },
      spend: (id, cost, label) => {
        if (engineIsClaimed(memberId, id)) return false
        if (!spendSpendable(memberId, cost)) {
          setFlash('Not enough rewards coins for that yet.')
          return false
        }
        markClaimed(memberId, id)
        if (id.startsWith('bonus-')) {
          const out = grantLockedBonus(memberId, cost, 1, 'Store coin pack')
          if (out.instantCoins > 0) onCredit?.(out.instantCoins)
        }
        setFlash(label ?? `Redeemed for ${coins(cost)}.`)
        return true
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberId, playerName, balanceCoins, state, config],
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
      case 'store':
        return <StoreView api={api} />
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
    if (v.id === 'store') return config.enabled.store
    if (v.id === 'daily') return config.enabled.daily
    if (v.id === 'challenges') return config.enabled.missions
    return true // overview / ranks / badges always on
  })

  return (
    <div className="rewards">
      <div className="rw-head">
        <div className="rw-section-head">
          <h1 className="rw-h1">Rewards</h1>
          <p className="rw-sub">Everything you can earn — rank up, climb the boards, claim coins.</p>
        </div>
        <div className="rw-head-kpis">
          <div className="rw-kpi">
            <span className="rw-label">Status · {tier.name}</span>
            <strong className="rw-coins">{state.status.toLocaleString()}</strong>
          </div>
          <div className="rw-kpi">
            <span className="rw-label">Rewards balance</span>
            <strong className="rw-coins">{coins(state.spendable)}</strong>
          </div>
          <div className="rw-kpi">
            <span className="rw-label">Coin balance</span>
            <strong className="rw-coins rw-dim">{coins(balanceCoins)}</strong>
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
