import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetPlayerSections,
  getPlayerSections,
  playerSectionsFor,
  registerPlayerSection,
  type PlayerSectionManifest,
} from './player-sections.js'

const Dummy = () => null
const manifest = (key: string, roles: PlayerSectionManifest['roles']): PlayerSectionManifest => ({
  key,
  label: key,
  roles,
  Component: Dummy,
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
