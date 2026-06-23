/**
 * Invite Friends — the player's referral surface.
 *
 * Honest by default (CLAUDE.md §2): if no program is running it says so. When it is, the player
 * gets a stable invite code/link, can share it with people they follow (the Round-3 follow
 * graph), redeem a code they were sent, and watch their invites move pending → rewarded. The
 * reward itself is issued by core (the store's audited grant); this surface only shares + reads.
 */

import { useState, useSyncExternalStore } from 'react'
import type { Role } from '../../org/index.js'
import { getBook } from '../../../app/book-store.js'
import { followingOf, followsVersion, subscribeFollows } from '../../social/index.js'
import { formatMoney } from '../../../games/shared/money.js'
import {
  claimReferral,
  createCode,
  getReferralConfig,
  getReferralsVersion,
  personalCodeOf,
  referralsFor,
  subscribeReferrals,
} from '../store.js'
import type { ReferralStatus } from '../types.js'
import './referrals.css'

/** The player-section descriptor (the wiring pass registers this — see // SEAM at the foot). */
export const referralsSection: { id: string; label: string; roles: Role[] } = {
  id: 'referrals',
  label: 'Invite Friends',
  roles: ['player'],
}

const nameOf = (id: string): string => getBook().members[id]?.name ?? id

const STATUS_LABEL: Record<ReferralStatus, string> = {
  pending: 'Pending',
  qualified: 'Qualified',
  rewarded: 'Rewarded',
}

function inviteLink(code: string): string {
  const origin =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'https://dimebag.bet'
  return `${origin}/join?ref=${code}`
}

export function ReferralSection({
  playerId,
  playerName,
}: {
  playerId: string
  playerName?: string
}) {
  useSyncExternalStore(subscribeReferrals, getReferralsVersion, getReferralsVersion)
  useSyncExternalStore(subscribeFollows, followsVersion, followsVersion)

  const config = getReferralConfig()

  if (!config.enabled) {
    return (
      <section className="ref">
        <header className="ref-head">
          <h1 className="ref-title">Invite Friends</h1>
        </header>
        <p className="ref-off">No referral program is running right now — check back soon.</p>
      </section>
    )
  }

  const reward = formatMoney(config.rewardCents)
  return (
    <section className="ref">
      <header className="ref-head">
        <h1 className="ref-title">Invite Friends</h1>
        <p className="ref-sub">
          Invite a friend{playerName ? `, ${playerName}` : ''} — when they place their first settled
          bet, you <strong>both</strong> get {reward}. Credits only, no cash value.
        </p>
      </header>

      <MyInvite playerId={playerId} reward={reward} />
      <FollowInvites playerId={playerId} />
      <MyReferrals playerId={playerId} />
      <RedeemCode playerId={playerId} />
    </section>
  )
}

/* -------------------------------- my invite -------------------------------- */

function MyInvite({ playerId, reward }: { playerId: string; reward: string }) {
  const [copied, setCopied] = useState(false)
  const code = personalCodeOf(playerId)

  const make = () => createCode(playerId)
  const copy = async () => {
    if (!code || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(inviteLink(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="ref-card">
      <h2 className="ref-h2">Your invite</h2>
      {code ? (
        <>
          <div className="ref-code-row">
            <code className="ref-code">{code}</code>
            <button className="ref-btn ref-btn-primary" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
          <p className="ref-link">{inviteLink(code)}</p>
          <p className="ref-fine">
            You and each friend get {reward} once they place a settled bet.
          </p>
        </>
      ) : (
        <button className="ref-btn ref-btn-primary" onClick={make}>
          Create my invite code
        </button>
      )}
    </div>
  )
}

/* ----------------------------- invite who you follow ----------------------- */

function FollowInvites({ playerId }: { playerId: string }) {
  const following = followingOf(playerId).filter((id) => id !== playerId)
  if (following.length === 0) return null
  const code = personalCodeOf(playerId)

  return (
    <div className="ref-card">
      <h2 className="ref-h2">People you follow</h2>
      <p className="ref-fine">Share your invite with people you already follow.</p>
      <ul className="ref-follow">
        {following.map((id) => (
          <li key={id} className="ref-follow-row">
            <span className="ref-follow-name">{nameOf(id)}</span>
            <CopyFor code={code} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function CopyFor({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!code || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(inviteLink(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* no-op */
    }
  }
  return (
    <button className="ref-btn ref-btn-sm" onClick={copy} disabled={!code}>
      {copied ? 'Copied ✓' : code ? 'Copy invite' : 'Create a code first'}
    </button>
  )
}

/* ------------------------------- my referrals ------------------------------ */

function MyReferrals({ playerId }: { playerId: string }) {
  const rows = referralsFor(playerId)
  if (rows.length === 0) return null
  const rewarded = rows.filter((r) => r.status === 'rewarded').length

  return (
    <div className="ref-card">
      <h2 className="ref-h2">Your referrals</h2>
      <p className="ref-fine">
        {rewarded} rewarded · {rows.length} total
      </p>
      <ul className="ref-list">
        {rows.map((r) => (
          <li key={`${r.code}-${r.refereeId}`} className="ref-list-row">
            <span>{r.refereeId ? nameOf(r.refereeId) : 'Open invite'}</span>
            <span className={`ref-badge is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------- redeem ----------------------------------- */

function RedeemCode({ playerId }: { playerId: string }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const redeem = () => {
    const res = claimReferral(code.trim(), playerId)
    setMsg({
      ok: res.ok,
      text: res.ok
        ? 'Invite redeemed — place a bet to unlock the reward.'
        : (res.reason ?? 'Could not redeem.'),
    })
    if (res.ok) setCode('')
  }

  return (
    <div className="ref-card">
      <h2 className="ref-h2">Got an invite?</h2>
      <p className="ref-fine">Enter a friend’s code to link up.</p>
      <div className="ref-redeem">
        <input
          className="ref-input"
          placeholder="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Invite code"
        />
        <button className="ref-btn" onClick={redeem} disabled={!code.trim()}>
          Redeem
        </button>
      </div>
      {msg && <p className={msg.ok ? 'ref-msg-ok' : 'ref-msg-err'}>{msg.text}</p>}
    </div>
  )
}

// SEAM (wiring pass): register the player section via the prop-aware registry in
// app/register-player-sections.tsx —
//   import { ReferralSection, referralsSection } from '../referrals/index.js'
//   registerPlayerSection({
//     key: referralsSection.id,
//     label: referralsSection.label,
//     roles: referralsSection.roles,
//     render: (ctx) => <ReferralSection playerId={ctx.player.id} playerName={ctx.player.name} />,
//   })
// and add 'referrals' to the player's allowedSections in auth/roles.ts. Also call
// armReferrals() once at app boot so invites qualify on the first settled wager.
