/**
 * Player-facing section registry — the seam that lets a feature module register a top-level
 * player section (Profile, Social, Pick'em, …) WITHOUT editing the app shell or nav.
 *
 * This is additive shared infrastructure: each lane registers a section from its own module;
 * the shell mounts the registry once (App.tsx renders `playerSectionsFor(role)` as nav tabs and
 * `renderPlayerSection` as the active body) and intersects with auth `allowedSections`.
 *
 * PROP-AWARE (round 4): most player sections need shell state — the active player + account,
 * the operating identity, the demo flag, a balance-change callback. Rather than cast a
 * prop-taking component into a prop-less slot (the round-2 stopgap), a manifest declares HOW to
 * render itself given the shell `PlayerSectionContext`: a self-contained section sets a prop-less
 * `Component`; a section that needs shell state sets `render(ctx)` and picks what it needs from
 * the injected context — fully type-checked, no `as ComponentType` casts. New lanes registering
 * arbitrary sections (Challenges, Competitions, …) just read different fields off the context.
 *
 * Registration is idempotent by key, so concurrent lanes registering into the same registry
 * never clash. The registry holds no money and reads nothing — it is a pure lookup.
 */

import { createElement, type ComponentType, type ReactNode } from 'react'
import type { Account } from '../core/index.js'
import type { Role } from '../features/org/types.js'

/**
 * The shell state a player section can ask for. The shell builds this once — from the active
 * player + their shared `core` account, the operating identity, the demo flag, and the
 * balance-refresh callback — and injects it into a section's `render`. It carries no money path:
 * `account` is the read model and `onBalanceChange` is just a re-render nudge; sections still
 * move money only through `core`, exactly as the explicit App.tsx clauses did before.
 */
export interface PlayerSectionContext {
  /** The active player's shared-balance account (the one every feature wagers against). */
  account: Account
  /** The active (played-as) player. */
  player: { id: string; name: string }
  /** The operating identity — an operator viewing-as a player keeps their own id (for
   *  authored-content attribution); a real player session falls back to the player id. */
  viewerId: string
  /** The viewer's role (so a section can tailor itself to player vs operator). */
  role: Role
  /** Demo session flag (no real keys), threaded through to sections that surface it. */
  isDemo: boolean
  /** Nudge the shell to re-read the figure after a section moves money through `core`. */
  onBalanceChange: () => void
}

interface PlayerSectionBase {
  /** Stable section key (kebab-case), e.g. 'profile'. */
  key: string
  /** Nav label. */
  label: string
  /** Roles that may see the section. */
  roles: Role[]
}

/**
 * A player-facing section. Provide EXACTLY ONE renderer:
 *  - `Component`: a self-contained, prop-less body (reads its own stores, renders for any role,
 *    needs no active player). Profile is the canonical case.
 *  - `render(ctx)`: a body that needs shell state; the shell injects the `PlayerSectionContext`
 *    and shows its no-player fallback when there is no active player to build one from.
 */
export type PlayerSectionManifest = PlayerSectionBase & {
  Component?: ComponentType
  render?: (ctx: PlayerSectionContext) => ReactNode
}

const registry = new Map<string, PlayerSectionManifest>()

/** Register (or replace, by key) a player-facing section. Safe to call from a module file. */
export function registerPlayerSection(manifest: PlayerSectionManifest): void {
  registry.set(manifest.key, manifest)
}

/** All registered sections, in registration order. */
export function getPlayerSections(): PlayerSectionManifest[] {
  return [...registry.values()]
}

/** Registered sections visible to a given role. */
export function playerSectionsFor(role: Role): PlayerSectionManifest[] {
  return getPlayerSections().filter((m) => m.roles.includes(role))
}

/** The section a role may see under a given key, or undefined (the single render lookup). */
export function playerSectionFor(role: Role, key: string): PlayerSectionManifest | undefined {
  return playerSectionsFor(role).find((m) => m.key === key)
}

/**
 * Render a section's body — THE single render path the shell uses. A `render`-based section
 * needs the context, so without an active player (`ctx == null`) it shows `fallback`; a
 * prop-less `Component` section renders regardless (it handles its own empty state). A manifest
 * with neither renderer contributes nothing (it still drives the nav tab + role-gating).
 */
export function renderPlayerSection(
  manifest: PlayerSectionManifest,
  ctx: PlayerSectionContext | null,
  fallback: ReactNode,
): ReactNode {
  if (manifest.render) return ctx ? manifest.render(ctx) : fallback
  if (manifest.Component) return createElement(manifest.Component)
  return null
}

/** Test reset. */
export function __resetPlayerSections(): void {
  registry.clear()
}
