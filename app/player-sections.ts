/**
 * Player-facing section registry — the seam that lets a feature module register a top-level
 * player section (Profile, Social, Pick'em, …) WITHOUT editing the app shell or nav.
 *
 * This is new, additive shared infrastructure (round 2): the round-2 lanes each register a
 * section from their own module; the WIRING PASS mounts the registry into App.tsx once
 * (render `playerSectionsFor(role)` as nav tabs + routes) and extends auth `allowedSections`.
 * Until then a registered section is fully built and unit-tested but not yet shown in nav.
 *
 * Registration is idempotent by key, so concurrent lanes registering into the same registry
 * never clash. The registry holds no money and reads nothing — it is a pure lookup.
 */

import type { ComponentType } from 'react'
import type { Role } from '../org/types.js'

export interface PlayerSectionManifest {
  /** Stable section key (kebab-case), e.g. 'profile'. */
  key: string
  /** Nav label. */
  label: string
  /** Roles that may see the section. */
  roles: Role[]
  /** The section component (rendered prop-less, like the other top-level sections). */
  Component: ComponentType
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

/** Test reset. */
export function __resetPlayerSections(): void {
  registry.clear()
}
