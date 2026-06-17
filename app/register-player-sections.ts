/**
 * Round-2 wiring: register the player sections whose lanes ship a descriptor but do NOT
 * self-register, into the shared player-section registry (app/player-sections.ts) — RECONCILING
 * each lane's independently-designed descriptor shape to PlayerSectionManifest:
 *   - social  → `communitySection` uses { id, … }  → map id → key (roles already match).
 *   - pickem  → `pickemSectionMeta` uses { key, player: true, … } → map player flag → roles.
 * records/ already self-registers 'profile' on import; it's pulled in here so all three land
 * from this one side-effect module (App imports it once).
 *
 * Both Community and Pick'em take shell-injected props (account / viewer identity /
 * onBalanceChange), so the shell renders them via explicit clauses in App.tsx that pass those
 * props (mirroring the rewards/sportsbook cases). The registry entry drives the nav tab +
 * role-gating only; the Component cast adapts each prop-taking component into the registry's
 * prop-less Component slot — it is never rendered prop-less from the registry.
 */

import type { ComponentType } from 'react'
import { registerPlayerSection } from './player-sections.js'
import { communitySection } from '../social/index.js'
import { pickemSectionMeta } from '../pickem/index.js'
import '../records/index.js' // side-effect: records self-registers the 'profile' section

// A (social) — PlayerSectionDescriptor { id, label, roles, Component } → manifest { key, … }.
registerPlayerSection({
  key: communitySection.id,
  label: communitySection.label,
  roles: communitySection.roles,
  Component: communitySection.Component as ComponentType,
})

// C (pickem) — { key, label, player, Component } → manifest; player:true means player-only.
registerPlayerSection({
  key: pickemSectionMeta.key,
  label: pickemSectionMeta.label,
  roles: pickemSectionMeta.player ? ['player'] : [],
  Component: pickemSectionMeta.Component as ComponentType,
})
