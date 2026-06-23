/**
 * The Community section — the social surface (CLAUDE.md §1). A clean activity feed of
 * friends' shared slips (selections, stake in credits, odds, result) with reactions +
 * comments and one-tap tail/fade, plus a Friends tab to follow players in the book.
 *
 * Tail/fade place a REAL bet through the book → core (social/tail.ts) respecting the
 * player's own limits; everything else is display + the social graph. Consumes the global
 * design tokens (app/theme.css) via social.css — no per-feature palette.
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { availableToWager } from '../../core/index.js'
import { membersByRole } from '../org/index.js'
import { getBook } from '../../app/book-store.js'
import { useBookOdds } from '../../app/book/odds-source.js'
import { formatAmerican, americanFromDecimal, toReturnCents } from '../../app/book/odds-format.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  follow,
  unfollow,
  isFollowing,
  followingOf,
  followCounts,
  subscribeFollows,
  followsVersion,
} from './follows-store.js'
import {
  feedFor,
  toggleReaction,
  reactionCounts,
  addComment,
  setVisibility,
  shareSlip,
  subscribeFeed,
  feedVersion,
} from './feed-store.js'
import { tailSlip, fadeSlip, canFade } from './tail.js'
import { ensureSeeded } from './seed.js'
import { REACTION_EMOJIS, type PlayerSectionProps, type SharedSlip } from './types.js'
import './social.css'

/** Re-render on any change to the feed or the follow graph. */
function useSocialTick(): number {
  return useSyncExternalStore(
    (cb) => {
      const a = subscribeFeed(cb)
      const b = subscribeFollows(cb)
      return () => {
        a()
        b()
      }
    },
    () => feedVersion() * 1_000_000 + followsVersion(),
    () => feedVersion() * 1_000_000 + followsVersion(),
  )
}

function ago(now: number, then: number): string {
  const m = Math.max(0, Math.round((now - then) / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
  push: 'Push',
  void: 'Void',
  cashed: 'Cashed',
}

export function CommunitySection({ viewerId, viewerName, account, onBalanceChange }: PlayerSectionProps) {
  useEffect(() => {
    ensureSeeded(Date.now())
  }, [])
  useSocialTick()
  const { events: slate } = useBookOdds()
  const [tab, setTab] = useState<'feed' | 'friends'>('feed')
  const [flash, setFlash] = useState<string | null>(null)

  const followingIds = followingOf(viewerId)
  const feed = feedFor(viewerId, followingIds)

  const place = (kind: 'tail' | 'fade', slip: SharedSlip): void => {
    try {
      const stake = Math.min(slip.stakeCents, availableToWager(account))
      if (stake < 1) {
        setFlash(`Not enough available to ${kind}`)
        return
      }
      const placed =
        kind === 'tail'
          ? tailSlip({ slip, account, playerName: viewerName, stakeCents: stake, now: Date.now() })
          : fadeSlip({ slip, account, playerName: viewerName, slate, stakeCents: stake, now: Date.now() })
      const first = placed[0]
      shareSlip({
        playerId: viewerId,
        playerName: viewerName,
        legs: first.legs,
        mode: first.mode,
        stakeCents: stake,
        decimal: first.decimal,
        status: 'open',
        sharedAt: Date.now(),
        origin: { kind, ofSlipId: slip.id, ofPlayerName: slip.playerName },
      })
      onBalanceChange?.()
      const what = first.legs.length === 1 ? first.legs[0].pick : `${first.legs.length}-leg parlay`
      setFlash(`${kind === 'tail' ? 'Tailed' : 'Faded'} ${slip.playerName} — ${formatMoney(stake)} on ${what}`)
    } catch (e) {
      setFlash((e as Error).message)
    }
  }

  return (
    <div className="sc">
      <header className="sc-top">
        <h1 className="sc-h1">Community</h1>
        <div className="sc-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'feed'}
            className={`sc-tab ${tab === 'feed' ? 'is-on' : ''}`}
            onClick={() => setTab('feed')}
          >
            Feed
          </button>
          <button
            role="tab"
            aria-selected={tab === 'friends'}
            className={`sc-tab ${tab === 'friends' ? 'is-on' : ''}`}
            onClick={() => setTab('friends')}
          >
            Friends
          </button>
        </div>
      </header>

      {flash && (
        <div className="sc-flash" role="status" onAnimationEnd={() => setFlash(null)}>
          {flash}
        </div>
      )}

      {tab === 'feed' ? (
        <div className="sc-feed">
          {feed.length === 0 ? (
            <p className="sc-empty">
              Your feed is quiet. Follow players in <button className="sc-link" onClick={() => setTab('friends')}>Friends</button> to see their slips.
            </p>
          ) : (
            feed.map((slip) => (
              <FeedCard
                key={slip.id}
                slip={slip}
                viewerId={viewerId}
                viewerName={viewerName}
                fadeable={canFade(slip, slate)}
                onReact={(emoji) => toggleReaction(slip.id, viewerId, emoji)}
                onComment={(text) => addComment(slip.id, viewerId, viewerName, text, Date.now())}
                onPrivacy={(vis) => setVisibility(slip.id, viewerId, vis)}
                onTail={() => place('tail', slip)}
                onFade={() => place('fade', slip)}
              />
            ))
          )}
        </div>
      ) : (
        <FriendsTab viewerId={viewerId} />
      )}
    </div>
  )
}

interface FeedCardProps {
  slip: SharedSlip
  viewerId: string
  viewerName: string
  fadeable: boolean
  onReact: (emoji: string) => void
  onComment: (text: string) => void
  onPrivacy: (vis: 'public' | 'private') => void
  onTail: () => void
  onFade: () => void
}

function FeedCard({ slip, viewerId, fadeable, onReact, onComment, onPrivacy, onTail, onFade }: FeedCardProps) {
  const [draft, setDraft] = useState('')
  const isOwn = slip.playerId === viewerId
  const counts = reactionCounts(slip)
  const reacted = (emoji: string) => slip.reactions.some((r) => r.playerId === viewerId && r.emoji === emoji)
  const combinedAmerican = slip.legs.length > 1 ? americanFromDecimal(slip.decimal) : slip.legs[0]?.price.american ?? 0

  const submit = (): void => {
    if (!draft.trim()) return
    onComment(draft)
    setDraft('')
  }

  return (
    <article className="sc-card" aria-label={`slip by ${slip.playerName}`}>
      <div className="sc-card-top">
        <span className="sc-avatar" aria-hidden>
          {slip.playerName.charAt(0)}
        </span>
        <div className="sc-who">
          <span className="sc-name">{slip.playerName}</span>
          <span className="sc-sub">
            {slip.origin ? `${slip.origin.kind === 'tail' ? 'tailed' : 'faded'} ${slip.origin.ofPlayerName} · ` : ''}
            {slip.mode === 'parlay' ? `${slip.legs.length}-leg parlay` : 'single'} · {ago(Date.now(), slip.sharedAt)}
          </span>
        </div>
        <span className={`sc-pill is-${slip.status}`}>{STATUS_LABEL[slip.status] ?? slip.status}</span>
      </div>

      <ul className="sc-legs">
        {slip.legs.map((leg) => (
          <li key={leg.key} className="sc-leg">
            <span className="sc-pick">{leg.pick}</span>
            <span className="sc-odds">{formatAmerican(leg.price.american)}</span>
          </li>
        ))}
      </ul>

      <div className="sc-stake">
        <span>
          Stake <strong>{formatMoney(slip.stakeCents)}</strong>
        </span>
        <span className="sc-price">{formatAmerican(combinedAmerican)}</span>
        <span className="sc-return">
          {slip.status === 'won'
            ? `Won ${formatMoney(toReturnCents(slip.stakeCents, slip.decimal))}`
            : slip.status === 'lost'
              ? '—'
              : `To win ${formatMoney(toReturnCents(slip.stakeCents, slip.decimal) - slip.stakeCents)}`}
        </span>
      </div>

      <div className="sc-reacts">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            className={`sc-react ${reacted(emoji) ? 'is-on' : ''}`}
            aria-label={`react ${emoji}`}
            aria-pressed={reacted(emoji)}
            onClick={() => onReact(emoji)}
          >
            <span aria-hidden>{emoji}</span>
            {counts[emoji] ? <span className="sc-rc">{counts[emoji]}</span> : null}
          </button>
        ))}
        <span className="sc-spacer" />
        {isOwn ? (
          <button
            className="sc-ghost"
            onClick={() => onPrivacy(slip.visibility === 'public' ? 'private' : 'public')}
          >
            {slip.visibility === 'public' ? '🔓 Shared' : '🔒 Private'}
          </button>
        ) : (
          <>
            <button className="sc-tail" onClick={onTail}>
              Tail
            </button>
            <button className="sc-ghost" onClick={onFade} disabled={!fadeable} title={fadeable ? 'Take the opposite' : 'No opposite to fade'}>
              Fade
            </button>
          </>
        )}
      </div>

      {slip.comments.length > 0 && (
        <ul className="sc-comments">
          {slip.comments.map((c) => (
            <li key={c.id} className="sc-comment">
              <span className="sc-cname">{c.playerName}</span> {c.text}
            </li>
          ))}
        </ul>
      )}

      <div className="sc-addc">
        <input
          className="sc-input"
          placeholder="Add a comment…"
          value={draft}
          aria-label={`comment on ${slip.playerName}'s slip`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="sc-ghost" onClick={submit} disabled={!draft.trim()}>
          Post
        </button>
      </div>
    </article>
  )
}

function FriendsTab({ viewerId }: { viewerId: string }): ReactNode {
  useSocialTick()
  const counts = followCounts(viewerId)
  const players = membersByRole(getBook(), 'player').filter((m) => m.id !== viewerId)

  return (
    <div className="sc-friends">
      <p className="sc-counts">
        <strong>{counts.following}</strong> following · <strong>{counts.followers}</strong> followers
      </p>
      <ul className="sc-people">
        {players.map((m) => {
          const following = isFollowing(viewerId, m.id)
          const c = followCounts(m.id)
          return (
            <li key={m.id} className="sc-person">
              <span className="sc-avatar" aria-hidden>
                {m.name.charAt(0)}
              </span>
              <div className="sc-who">
                <span className="sc-name">{m.profile?.nickname || m.name}</span>
                <span className="sc-sub">{c.followers} followers</span>
              </div>
              <button
                className={following ? 'sc-ghost' : 'sc-tail'}
                aria-pressed={following}
                onClick={() => (following ? unfollow(viewerId, m.id) : follow(viewerId, m.id))}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
