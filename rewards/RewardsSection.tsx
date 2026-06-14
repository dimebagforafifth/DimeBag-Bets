/**
 * Rewards — a top-level player section (a sibling of Casino / Sportsbook). It's the
 * loyalty/status layer: rank, leaderboards, store, daily/streak, challenges, badges.
 *
 * COINS / STATUS ONLY. The shell owns the claim/spend state and a live coins balance
 * (display only — never cash, never withdrawable). `onCredit` lets the host actually
 * move coins through the shared balance when the player claims/spends.
 */
import { useMemo, useState } from 'react'
import { VIEWS, coins, seedPlayer, type RewardsApi, type ViewId } from './data.js'
import { RewardsLanding } from './RewardsLanding.js'
import { RanksView } from './RanksView.js'
import { LeaderboardsView } from './LeaderboardsView.js'
import { StoreView } from './StoreView.js'
import { DailyView } from './DailyView.js'
import { ChallengesView } from './ChallengesView.js'
import { BadgesView } from './BadgesView.js'
import './rewards.css'

export interface RewardsSectionProps {
  /** The signed-in player's display name (highlighted on the boards). */
  playerName?: string
  /** The player's live balance in whole COINS (read-only). */
  balanceCoins: number
  /** Optional: move coins through the shared balance on claim (+) / spend (−). */
  onCredit?: (deltaCoins: number) => void
}

export function RewardsSection({ playerName = 'You', balanceCoins, onCredit }: RewardsSectionProps) {
  const [view, setView] = useState<ViewId>('overview')
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(() => new Set())
  const [credited, setCredited] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const player = useMemo(seedPlayer, [])

  const live = balanceCoins + credited

  const api: RewardsApi = {
    playerName,
    balanceCoins: live,
    player,
    flash,
    isClaimed: (id) => claimed.has(id),
    go: setView,
    claim: (id, amount, label) => {
      if (claimed.has(id)) return
      setClaimed((s) => new Set(s).add(id))
      if (amount !== 0) {
        setCredited((c) => c + amount)
        onCredit?.(amount)
      }
      setFlash(label ?? `Claimed ${coins(amount)}`)
    },
    spend: (id, cost, label) => {
      if (claimed.has(id)) return false
      if (live < cost) {
        setFlash('Not enough coins for that yet.')
        return false
      }
      setClaimed((s) => new Set(s).add(id))
      setCredited((c) => c - cost)
      onCredit?.(-cost)
      setFlash(label ?? `Done — spent ${coins(cost)}.`)
      return true
    },
  }

  const Active = () => {
    switch (view) {
      case 'ranks':
        return <RanksView api={api} />
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

  return (
    <div className="rewards">
      <div className="rw-head">
        <div className="rw-section-head">
          <h1 className="rw-h1">Rewards</h1>
          <p className="rw-sub">Everything you can earn — rank up, climb the boards, claim coins.</p>
        </div>
        <div className="rw-kpi" style={{ minWidth: 160 }}>
          <span className="rw-label">Your balance</span>
          <strong className="rw-coins">{coins(live)}</strong>
        </div>
      </div>

      <nav className="rw-subnav" aria-label="Rewards sections">
        {VIEWS.map((v) => (
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
