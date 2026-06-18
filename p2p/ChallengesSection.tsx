/**
 * The Challenges section — peer-to-peer, no-vig head-to-head betting (CLAUDE.md §1: the moat a
 * real-money book can't build). A player proposes a matchup (a pick, agreed odds, a stake) to a
 * friend or open to the community; another accepts; the winner takes the pot and the HOUSE TAKES
 * NOTHING. Accepting escrows BOTH stakes through core; settlement (result-driven, not a player
 * action) pays the pot to the winner through core. Consumes the global tokens — no per-feature
 * palette.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { availableToWager } from '../core/index.js'
import { formatMoney } from '../games/shared/money.js'
import { challenges } from './store.js'
import { ensureViewerOffers, SEED_PLAYERS } from './seed.js'
import { accepterStakeFor, EVEN_ODDS, potCents } from './odds.js'
import { followingOf } from '../social/index.js'
import type { Challenge, ChallengeWinner, PlayerSectionProps } from './types.js'

type Tab = 'open' | 'active' | 'history'

/** Re-render on any change to the challenge store. */
function useChallengeTick(): number {
  return useSyncExternalStore(challenges.subscribe, challenges.version, challenges.version)
}

function ago(now: number, then: number): string {
  const m = Math.max(0, Math.round((now - then) / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

function untilExpiry(now: number, expiresAt: number): string {
  const m = Math.max(0, Math.round((expiresAt - now) / 60_000))
  if (m <= 0) return 'expired'
  if (m < 60) return `${m}m left`
  return `${Math.round(m / 60)}h left`
}

export function ChallengesSection({
  viewerId,
  viewerName,
  account,
  onBalanceChange,
  role,
}: PlayerSectionProps) {
  useEffect(() => {
    ensureViewerOffers(viewerId, viewerName, account, Date.now())
  }, [viewerId, viewerName, account])
  useChallengeTick()

  // Result settlement is operator-driven (never a participant picking their own winner). An
  // operator (non-player) gets settle/void controls on in-flight challenges below.
  const canSettle = role != null && role !== 'player'

  const [tab, setTab] = useState<Tab>('open')
  const [flash, setFlash] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const now = Date.now()
  const open = challenges.openFor(viewerId)
  const active = challenges.all().filter((c) => c.status === 'accepted')
  const history = challenges.all().filter((c) => c.status === 'settled' || c.status === 'voided')

  const accept = (c: Challenge): void => {
    try {
      challenges.accept(c.id, { playerId: viewerId, playerName: viewerName }, Date.now())
      onBalanceChange?.()
      setFlash(
        `Accepted — ${formatMoney(c.accepterStakeCents)} escrowed to win ${formatMoney(c.proposerStakeCents)}`,
      )
    } catch (e) {
      setFlash((e as Error).message)
    }
  }

  const decline = (c: Challenge): void => {
    challenges.decline(c.id, viewerId)
    setFlash('Declined')
  }

  // Operator-only: grade an in-flight challenge from the real result. Pays the pot to the winner
  // (or refunds both on void) THROUGH CORE — clearing the escrow pending so weekly settlement can
  // run (core.settleWeek requires no pending, so settle/void must precede the weekly square-up).
  const settle = (c: Challenge, winner: ChallengeWinner): void => {
    try {
      challenges.settle(c.id, winner)
      onBalanceChange?.()
      const name = winner === 'proposer' ? c.proposer.playerName : (c.accepter?.playerName ?? 'Accepter')
      setFlash(`Settled — ${name} takes ${formatMoney(potCents(c))}`)
    } catch (e) {
      setFlash((e as Error).message)
    }
  }

  const voidCh = (c: Challenge): void => {
    try {
      challenges.voidChallenge(c.id)
      onBalanceChange?.()
      setFlash('Voided — both stakes refunded')
    } catch (e) {
      setFlash((e as Error).message)
    }
  }

  return (
    <div className="p2p">
      <header className="p2p-top">
        <div>
          <h1 className="p2p-h1">Challenges</h1>
          <p className="p2p-sub">Stake head-to-head. Winner takes the pot — no house cut.</p>
        </div>
        <button className="p2p-cta" onClick={() => setShowNew((s) => !s)} aria-expanded={showNew}>
          {showNew ? 'Close' : 'New challenge'}
        </button>
      </header>

      {flash && (
        <div className="p2p-flash" role="status" onAnimationEnd={() => setFlash(null)}>
          {flash}
        </div>
      )}

      {showNew && (
        <NewChallenge
          viewerId={viewerId}
          viewerName={viewerName}
          account={account}
          onDone={(msg) => {
            setShowNew(false)
            setFlash(msg)
            setTab('open')
          }}
        />
      )}

      <nav className="p2p-tabs" role="tablist">
        {(['open', 'active', 'history'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`p2p-tab ${tab === t ? 'is-on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'open'
              ? `Open (${open.length})`
              : t === 'active'
                ? `Active (${active.length})`
                : 'History'}
          </button>
        ))}
      </nav>

      {tab === 'open' && (
        <div className="p2p-list">
          {open.length === 0 ? (
            <Empty>No open challenges right now. Start one with “New challenge”.</Empty>
          ) : (
            open.map((c) => (
              <ChallengeCard key={c.id} c={c} now={now} viewerId={viewerId} perspective="accepter">
                <div className="p2p-actions">
                  <button
                    className="p2p-accept"
                    onClick={() => accept(c)}
                    disabled={availableToWager(account) < c.accepterStakeCents}
                  >
                    Accept · risk {formatMoney(c.accepterStakeCents)} to win{' '}
                    {formatMoney(c.proposerStakeCents)}
                  </button>
                  {c.audience === 'friend' && c.targetPlayerId === viewerId && (
                    <button className="p2p-ghost" onClick={() => decline(c)}>
                      Decline
                    </button>
                  )}
                </div>
                {availableToWager(account) < c.accepterStakeCents && (
                  <p className="p2p-warn">
                    Not enough available — you can stake up to{' '}
                    {formatMoney(availableToWager(account))}.
                  </p>
                )}
              </ChallengeCard>
            ))
          )}
        </div>
      )}

      {tab === 'active' && (
        <div className="p2p-list">
          {active.length === 0 ? (
            <Empty>Nothing in flight. Accept an open challenge to escrow a head-to-head.</Empty>
          ) : (
            active.map((c) => (
              <ChallengeCard key={c.id} c={c} now={now} viewerId={viewerId} perspective="auto">
                <p className="p2p-status">
                  <span className="p2p-dot" aria-hidden /> Both stakes escrowed · pot{' '}
                  {formatMoney(potCents(c))} · awaiting result
                </p>
                {canSettle && (
                  <div className="p2p-actions">
                    {/* Operator settles from the real result — settle the week only AFTER this. */}
                    <button className="p2p-accept" onClick={() => settle(c, 'proposer')}>
                      {c.proposer.playerName} won
                    </button>
                    <button className="p2p-accept" onClick={() => settle(c, 'accepter')}>
                      {c.accepter?.playerName ?? 'Accepter'} won
                    </button>
                    <button className="p2p-ghost" onClick={() => voidCh(c)}>
                      Void
                    </button>
                  </div>
                )}
              </ChallengeCard>
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="p2p-list">
          {history.length === 0 ? (
            <Empty>No settled challenges yet.</Empty>
          ) : (
            history.map((c) => (
              <ChallengeCard key={c.id} c={c} now={now} viewerId={viewerId} perspective="auto">
                {c.status === 'voided' ? (
                  <p className="p2p-status is-void">Voided · both stakes refunded</p>
                ) : (
                  <p className="p2p-status is-settled">
                    {c.winner === 'proposer' ? c.proposer.playerName : c.accepter?.playerName} won{' '}
                    {formatMoney(potCents(c))}
                  </p>
                )}
              </ChallengeCard>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p2p-empty">{children}</p>
}

interface CardProps {
  c: Challenge
  now: number
  viewerId: string
  /** Whose side to foreground: the accepter's offer, or auto (the viewer's side if a party). */
  perspective: 'accepter' | 'auto'
  children?: ReactNode
}

function ChallengeCard({ c, now, viewerId, perspective, children }: CardProps) {
  const viewerIsProposer = c.proposer.playerId === viewerId
  const viewerIsAccepter = c.accepter?.playerId === viewerId
  const isEven = Math.abs(c.decimalOdds - EVEN_ODDS) < 1e-9
  return (
    <article className="p2p-card" aria-label={c.title}>
      <div className="p2p-card-top">
        <span className="p2p-title">{c.title}</span>
        {c.status === 'open' ? (
          <span className="p2p-when">{untilExpiry(now, c.expiresAt)}</span>
        ) : (
          <span className="p2p-when">{ago(now, c.settledAt ?? c.createdAt)}</span>
        )}
      </div>
      <div className="p2p-sides">
        <Side
          name={c.proposer.playerName + (viewerIsProposer ? ' (you)' : '')}
          pick={c.proposerPick}
          stake={c.proposerStakeCents}
          highlight={perspective === 'auto' && viewerIsProposer}
        />
        <span className="p2p-vs">vs</span>
        <Side
          name={(c.accepter?.playerName ?? 'Open seat') + (viewerIsAccepter ? ' (you)' : '')}
          pick={c.accepterPick}
          stake={c.accepterStakeCents}
          highlight={perspective === 'accepter' || (perspective === 'auto' && viewerIsAccepter)}
        />
      </div>
      <div className="p2p-meta">
        <span className="p2p-pot">Pot {formatMoney(potCents(c))}</span>
        <span className="p2p-odds">
          {isEven ? 'Even money' : `${c.decimalOdds.toFixed(2)} (custom)`}
        </span>
        <span className="p2p-novig">no vig</span>
      </div>
      {children}
    </article>
  )
}

function Side({
  name,
  pick,
  stake,
  highlight,
}: {
  name: string
  pick: string
  stake: number
  highlight: boolean
}) {
  return (
    <div className={`p2p-side ${highlight ? 'is-you' : ''}`}>
      <span className="p2p-side-name">{name}</span>
      <span className="p2p-side-pick">{pick}</span>
      <span className="p2p-side-stake">{formatMoney(stake)}</span>
    </div>
  )
}

/** The propose form. Proposing holds NO money — the stake is escrowed only when someone accepts. */
function NewChallenge({
  viewerId,
  viewerName,
  account,
  onDone,
}: {
  viewerId: string
  viewerName: string
  account: PlayerSectionProps['account']
  onDone: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [myPick, setMyPick] = useState('')
  const [theirPick, setTheirPick] = useState('')
  const [stake, setStake] = useState(20)
  const [custom, setCustom] = useState(false)
  const [decimal, setDecimal] = useState(2)
  // The live social graph: a player can directly challenge anyone they FOLLOW (social
  // followingOf). ids mirror the seed roster, so resolve names from it (falling back to the id).
  const friends = useMemo(() => {
    const nameById = new Map(SEED_PLAYERS.map((p) => [p.playerId, p.playerName]))
    return followingOf(viewerId)
      .filter((id) => id !== viewerId)
      .map((id) => ({ playerId: id, playerName: nameById.get(id) ?? id }))
  }, [viewerId])
  const [audience, setAudience] = useState<'open' | string>('open')

  const stakeCents = Math.round(stake * 100)
  const odds = custom ? decimal : EVEN_ODDS
  const accepterStake = stakeCents > 0 && odds > 1 ? accepterStakeFor(stakeCents, odds) : 0

  const submit = (): void => {
    if (!title.trim() || !myPick.trim() || !theirPick.trim() || stakeCents <= 0) {
      onDone('Fill in the matchup and a positive stake.')
      return
    }
    const friend = friends.find((f) => f.playerId === audience)
    challenges.propose({
      proposer: { playerId: viewerId, playerName: viewerName },
      title: title.trim(),
      proposerPick: myPick.trim(),
      accepterPick: theirPick.trim(),
      proposerStakeCents: stakeCents,
      decimalOdds: odds,
      audience: friend ? 'friend' : 'open',
      targetPlayerId: friend?.playerId,
      targetPlayerName: friend?.playerName,
      now: Date.now(),
    })
    onDone(
      `Challenge posted — ${formatMoney(stakeCents)} on ${myPick.trim()} (escrows only when accepted)`,
    )
  }

  return (
    <section className="p2p-new" aria-label="New challenge">
      <label className="p2p-field">
        <span>Matchup</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Lakers vs Suns tonight"
        />
      </label>
      <div className="p2p-row">
        <label className="p2p-field">
          <span>Your pick</span>
          <input
            value={myPick}
            onChange={(e) => setMyPick(e.target.value)}
            placeholder="Lakers ML"
          />
        </label>
        <label className="p2p-field">
          <span>Their pick</span>
          <input
            value={theirPick}
            onChange={(e) => setTheirPick(e.target.value)}
            placeholder="Suns ML"
          />
        </label>
      </div>
      <div className="p2p-row">
        <label className="p2p-field">
          <span>Your stake (credits)</span>
          <input
            type="number"
            min={1}
            value={stake}
            onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <label className="p2p-field">
          <span>Offer to</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="open">Open to community</option>
            {friends.map((f) => (
              <option key={f.playerId} value={f.playerId}>
                {f.playerName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="p2p-odds-row">
        <label className="p2p-check">
          <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />{' '}
          Custom odds
        </label>
        {custom && (
          <input
            type="number"
            step={0.05}
            min={1.01}
            value={decimal}
            onChange={(e) => setDecimal(Math.max(1.01, Number(e.target.value)))}
            aria-label="decimal odds"
          />
        )}
        <span className="p2p-derived">
          {custom ? `Even money is 2.00 · ` : ''}They stake {formatMoney(accepterStake)} · pot{' '}
          {formatMoney(stakeCents + accepterStake)}
        </span>
      </div>
      <p className="p2p-note">
        You can stake up to {formatMoney(availableToWager(account))}. Nothing is held until someone
        accepts.
      </p>
      <button className="p2p-accept" onClick={submit}>
        Post challenge
      </button>
    </section>
  )
}
