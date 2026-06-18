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
import '../records/index.js' // side-effect: records self-registers the 'profile' section

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
