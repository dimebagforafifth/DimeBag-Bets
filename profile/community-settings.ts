/**
 * Community settings consumed by discovery — chiefly the leaderboard SCOPE: rank players across
 * the whole tenant (`global`) or only within the viewer's own downline (`downline`). A read-only
 * preference; it changes no money and no projection, only which candidates a list ranks over.
 *
 * // SEAM (Lane D / wiring): Lane D owns the operator's Community Settings. The default here is a
 * local persisted preference so the scope toggle works now; the wiring pass calls
 * `setCommunitySettingsSource(laneD)` to read the operator's setting instead.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'

/** Leaderboard scope: the whole tenant, or only the viewer's downline. */
export type DiscoveryScope = 'global' | 'downline'

export interface CommunitySettings {
  /** Default scope the discovery leaderboard opens at. */
  defaultScope: DiscoveryScope
  /** Whether players may switch the scope in-surface (operator may pin it). */
  allowScopeToggle: boolean
}

const DEFAULT_SETTINGS: CommunitySettings = {
  defaultScope: 'global',
  allowScopeToggle: true,
}

export interface CommunitySettingsSource {
  get(): CommunitySettings
}

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<CommunitySettings> = persistedDoc<CommunitySettings>(
  store,
  'profile.community-settings',
  {
    version: 1,
    initial: DEFAULT_SETTINGS,
  },
)

let settings: CommunitySettings = DOC.load()
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(settings)
  version += 1
  for (const l of listeners) l()
}

const localSource: CommunitySettingsSource = { get: () => settings }
let source: CommunitySettingsSource = localSource

/** Repoint the read side (// SEAM: wiring → Lane D's Community Settings). */
export function setCommunitySettingsSource(s: CommunitySettingsSource): void {
  source = s
}
export function resetCommunitySettingsSource(): void {
  source = localSource
}

export function subscribeCommunitySettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function communitySettingsVersion(): number {
  return version
}

/** The effective community settings. */
export function communitySettings(): CommunitySettings {
  return source.get()
}

/** Operator preference write (local default). */
export function setDefaultScope(scope: DiscoveryScope): void {
  settings = { ...settings, defaultScope: scope }
  notify()
}
export function setAllowScopeToggle(allow: boolean): void {
  settings = { ...settings, allowScopeToggle: allow }
  notify()
}

export function __resetCommunitySettings(): void {
  settings = { ...DEFAULT_SETTINGS }
  source = localSource
  notify()
}
