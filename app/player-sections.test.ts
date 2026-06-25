import { beforeEach, describe, expect, it } from 'vitest'
import { createElement, isValidElement, type ReactElement } from 'react'
import type { Account } from '../core/index.js'
import { ALL_SECTIONS } from '../auth/index.js'
import {
  __resetPlayerSections,
  getPlayerSections,
  playerSectionFor,
  playerSectionsFor,
  registerPlayerSection,
  renderPlayerSection,
  type PlayerSectionContext,
  type PlayerSectionManifest,
} from './player-sections.js'

const Dummy = () => null
const manifest = (key: string, roles: PlayerSectionManifest['roles']): PlayerSectionManifest => ({
  key,
  label: key,
  roles,
  Component: Dummy,
})

const ctx = (): PlayerSectionContext => ({
  account: { id: 'p1', creditLimit: 100_000, balance: 0, pending: 0 } as Account,
  player: { id: 'p1', name: 'Marco' },
  viewerId: 'op-1',
  role: 'player',
  isDemo: true,
  onBalanceChange: () => {},
})

beforeEach(() => __resetPlayerSections())

describe('player-section registry — register from a module without editing the shell', () => {
  it('registers and lists sections', () => {
    registerPlayerSection(manifest('profile', ['player', 'manager']))
    expect(getPlayerSections().map((m) => m.key)).toEqual(['profile'])
  })

  it('is idempotent by key — concurrent lanes registering never duplicate', () => {
    registerPlayerSection(manifest('profile', ['player']))
    registerPlayerSection(manifest('profile', ['player', 'manager'])) // re-register replaces
    const all = getPlayerSections()
    expect(all).toHaveLength(1)
    expect(all[0].roles).toContain('manager')
  })

  it('filters by role', () => {
    registerPlayerSection(manifest('profile', ['player', 'manager']))
    registerPlayerSection(manifest('staff-only', ['manager']))
    expect(playerSectionsFor('player').map((m) => m.key)).toEqual(['profile'])
    expect(
      playerSectionsFor('manager')
        .map((m) => m.key)
        .sort(),
    ).toEqual(['profile', 'staff-only'])
  })
})

describe('prop-aware render path — the registry is the single render path (round 4)', () => {
  it('a render-based section gets the shell context injected; no player → fallback', () => {
    let injected: PlayerSectionContext | null = null
    const Body = (_p: { who: string }) => null
    registerPlayerSection({
      key: 'community',
      label: 'Community',
      roles: ['player'],
      render: (c) => {
        injected = c
        return createElement(Body, { who: c.player.name })
      },
    })
    const m = playerSectionFor('player', 'community')!
    const c = ctx()
    const out = renderPlayerSection(m, c, 'FALLBACK')
    expect(injected).toBe(c) // the exact shell context was injected — no casts, fully typed
    expect(isValidElement(out)).toBe(true)
    // Without an active player the shell passes null → the section shows the fallback.
    expect(renderPlayerSection(m, null, 'FALLBACK')).toBe('FALLBACK')
  })

  it('a prop-less Component section renders regardless of context (self-contained, e.g. Profile)', () => {
    const Profile = () => null
    registerPlayerSection({
      key: 'profile',
      label: 'Profile',
      roles: ['player', 'manager'],
      Component: Profile,
    })
    const m = playerSectionFor('manager', 'profile')!
    // ctx is null (no active player) yet it still renders the component, not the fallback.
    const out = renderPlayerSection(m, null, 'FALLBACK') as ReactElement
    expect(isValidElement(out)).toBe(true)
    expect(out.type).toBe(Profile)
  })

  it('the three real sections register through the prop-aware registry (no ComponentType casts)', async () => {
    __resetPlayerSections()
    await import('./register-player-sections.js') // wires community + pickem; pulls in records(profile)
    const community = playerSectionFor('player', 'community')
    const pickem = playerSectionFor('player', 'pickem')
    const profile = playerSectionFor('player', 'profile')
    // Prop-taking sections register a typed render adapter; the self-contained one a Component.
    expect(community?.render).toBeTypeOf('function')
    expect(pickem?.render).toBeTypeOf('function')
    expect(profile?.Component).toBeTypeOf('function')
    // Behaviour preserved: Profile renders with no player, Community/Pick'em fall back.
    expect(renderPlayerSection(profile!, null, 'FB')).not.toBe('FB')
    expect(renderPlayerSection(community!, null, 'FB')).toBe('FB')
    expect(renderPlayerSection(pickem!, null, 'FB')).toBe('FB')
    // …and with a context each adapter forwards the SAME shell props the old explicit App.tsx
    // clauses passed (viewerId = operating id, viewerName/playerName = player name, the live
    // account, the refresh callback) — proving the passthrough, not just that an element exists.
    const c = ctx()
    const communityEl = renderPlayerSection(community!, c, 'FB') as ReactElement
    expect(isValidElement(communityEl)).toBe(true)
    expect(communityEl.props).toMatchObject({
      viewerId: c.viewerId,
      viewerName: c.player.name,
      account: c.account,
      onBalanceChange: c.onBalanceChange,
    })
    const pickemEl = renderPlayerSection(pickem!, c, 'FB') as ReactElement
    expect(isValidElement(pickemEl)).toBe(true)
    expect(pickemEl.props).toMatchObject({
      account: c.account,
      playerName: c.player.name,
      isDemo: c.isDemo,
      onBalanceChange: c.onBalanceChange,
    })

    // DRIFT GUARD: every registered key must be a valid auth Section, else App.tsx silently
    // drops its nav tab (visibleSections.includes(key as Section) is false). Fails loudly if a
    // lane registers a section without adding its key to auth/roles ALL_SECTIONS.
    for (const m of getPlayerSections()) expect(ALL_SECTIONS).toContain(m.key)
    // The dynamic import pulls in the community/pickem/records module graph; its transform
    // brushes vitest's 5s default under full-suite load, causing a timeout flake. Give it room.
  }, 20000)
})

describe('records module self-registers its Profile section', () => {
  it('importing records/ registers a "profile" section visible to players', async () => {
    __resetPlayerSections()
    const { profileSectionManifest } = await import('../records/index.js')
    // The import side-effect registered it; re-assert the manifest is the Profile section.
    expect(profileSectionManifest.key).toBe('profile')
    expect(profileSectionManifest.roles).toContain('player')
    // Register explicitly too (idempotent) and confirm it lands.
    registerPlayerSection(profileSectionManifest)
    expect(playerSectionsFor('player').map((m) => m.key)).toContain('profile')
  })
})
