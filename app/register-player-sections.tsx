/**
 * Wiring: register the player sections whose lanes ship a descriptor but do NOT self-register,
 * into the shared player-section registry (app/player-sections.ts) — RECONCILING each lane's
 * independently-designed descriptor shape to PlayerSectionManifest:
 *   - social  → `communitySection` uses { id, … }  → map id → key (roles already match).
 *   - pickem  → `pickemSectionMeta` uses { key, player: true, … } → map player flag → roles.
 * records/ already self-registers 'profile' on import; it's pulled in here so all three land
 * from this one side-effect module (App imports it once).
 *
 * Community and Pick'em both need shell state (account / viewer identity / demo flag /
 * onBalanceChange). Round 4 made the registry PROP-AWARE: each registers a typed `render(ctx)`
 * that picks what it needs off the injected `PlayerSectionContext` and hands it to its own
 * component — so the shell renders them through the registry (the single render path) with NO
 * `as ComponentType` casts. Profile stays a prop-less `Component` (records/ registers it).
 */

import { registerPlayerSection } from './player-sections.js'
import { CommunitySection, communitySection } from '../social/index.js'
import { PickemSection, pickemSectionMeta } from '../pickem/index.js'
import { ChallengesSection, challengesSection } from '../p2p/index.js'
import { CompetitionsSection, competitionsSectionMeta } from '../events/index.js'
import { GamificationPanel } from '../gamification/ui/index.js'
import { PoolsSection, poolsSection } from '../pools/index.js'
import { LimitsActivitySection, responsiblePlaySection } from '../responsible-play/index.js'
import { ReferralSection, referralsSection } from '../referrals/index.js'
import { listPlayers } from './book-store.js'
import '../records/index.js' // side-effect: records self-registers the 'profile' section
import '../profile/index.js' // side-effect: profile/ self-registers the round-3 'players' hub section
import '../boosts/index.js' // side-effect: boosts/ self-registers the round-4 'boosts' section
import '../splits/index.js' // side-effect: splits/ self-registers the round-4 'splits' section

// A (social) — { id, label, roles, … } → manifest; render injects viewer identity + account.
registerPlayerSection({
  key: communitySection.id,
  label: communitySection.label,
  roles: communitySection.roles,
  render: (ctx) => (
    <CommunitySection
      viewerId={ctx.viewerId}
      viewerName={ctx.player.name}
      account={ctx.account}
      onBalanceChange={ctx.onBalanceChange}
    />
  ),
})

// C (pickem) — { key, label, player, … } → manifest; player:true means player-only.
registerPlayerSection({
  key: pickemSectionMeta.key,
  label: pickemSectionMeta.label,
  roles: pickemSectionMeta.player ? ['player'] : [],
  render: (ctx) => (
    <PickemSection
      account={ctx.account}
      playerName={ctx.player.name}
      isDemo={ctx.isDemo}
      onBalanceChange={ctx.onBalanceChange}
    />
  ),
})

// ── Round-4 sections ──────────────────────────────────────────────────────────
// B (p2p) — Challenges. PlayerSectionDescriptor { id, … } → manifest; render injects the
// viewer identity + account (P2P escrow/settle all move money through core).
registerPlayerSection({
  key: challengesSection.id,
  label: challengesSection.label,
  roles: challengesSection.roles,
  render: (ctx) => (
    <ChallengesSection
      viewerId={ctx.viewerId}
      viewerName={ctx.player.name}
      account={ctx.account}
      onBalanceChange={ctx.onBalanceChange}
      role={ctx.role}
    />
  ),
})

// C (events) — Competitions. { key, label, player, … } → manifest; player:true → player-only.
registerPlayerSection({
  key: competitionsSectionMeta.key,
  label: competitionsSectionMeta.label,
  roles: competitionsSectionMeta.player ? ['player'] : [],
  render: (ctx) => (
    <CompetitionsSection
      account={ctx.account}
      playerName={ctx.player.name}
      isDemo={ctx.isDemo}
      onBalanceChange={ctx.onBalanceChange}
    />
  ),
})

// Gamification hub — built but never mounted (D flagged the orphan). No lane descriptor, so it
// registers directly: level/XP, missions, achievements, daily wheel, tournaments. Labelled
// "Quests" (its own header says "Rewards", but that nav key is the loyalty section). Rewards
// pay out as free-play through core.grant. `players` lets tournament rows read as names.
registerPlayerSection({
  key: 'gamification',
  label: 'Quests',
  roles: ['player', 'manager'],
  render: (ctx) => (
    <GamificationPanel
      account={ctx.account}
      players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
      onBalanceChange={ctx.onBalanceChange}
    />
  ),
})

// ── Round-3 (Community & Contests) sections ─────────────────────────────────
// C (pools) — Pools & Leagues. PlayerSectionDescriptor { id, … } → manifest; render injects the
// viewer identity + account + role (pool escrow/prizes all move money through core).
registerPlayerSection({
  key: poolsSection.id,
  label: poolsSection.label,
  roles: poolsSection.roles,
  render: (ctx) => (
    <PoolsSection
      viewerId={ctx.viewerId}
      viewerName={ctx.player.name}
      account={ctx.account}
      onBalanceChange={ctx.onBalanceChange}
      role={ctx.role}
    />
  ),
})

// D (responsible-play) — Limits & Activity. { id, label, roles } → manifest; the section reads
// the active player's own ledger (read-only projection); enforcement lives in core.placeWager.
registerPlayerSection({
  key: responsiblePlaySection.id,
  label: responsiblePlaySection.label,
  roles: responsiblePlaySection.roles,
  render: (ctx) => <LimitsActivitySection playerId={ctx.player.id} playerName={ctx.player.name} />,
})

// B (profile) self-registers the 'players' hub on import ('../profile/index.js', above).

// ── Round-4 (Engagement) sections ───────────────────────────────────────────
// B (boosts) self-registers 'boosts' and C (splits) self-registers 'splits' on import (above).
// D (referrals) does NOT self-register — its descriptor { id, label, roles } is mounted here;
// render injects the active player's identity (rewards issue through core's existing grant path).
registerPlayerSection({
  key: referralsSection.id,
  label: referralsSection.label,
  roles: referralsSection.roles,
  render: (ctx) => <ReferralSection playerId={ctx.player.id} playerName={ctx.player.name} />,
})
