// @vitest-environment happy-dom
/**
 * Rewards admin + role coordination: a manager sees the full Rewards admin; an agent sees
 * NONE of it unless the manager grants the comp tile (and only that one); the comp tool is
 * data-scoped to an agent's downline; and nothing across the admin surfaces a cash-value path.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { REGISTRY } from '../../console/registry/index.js'
import { registryForRole } from '../../app/console-access.js'
import { setAgentTile, __resetAllAgentPermissions } from '../../app/agent-permissions.js'
import { setViewer } from '../../app/viewer.js'
import { rewardsAdminManifests } from './manifest.js'
import { CompPanel } from './CompPanel.js'
import { __resetRewardsPlayers } from './players.js'
import { resetRewardsConfig } from './economy.js'
import { __resetIssuance } from './comp.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const REWARDS_KEYS = rewardsAdminManifests.map((m) => m.key)

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}

beforeEach(() => {
  __resetAllAgentPermissions()
  __resetRewardsPlayers()
  resetRewardsConfig()
  __resetIssuance()
  setViewer('mgr', 'manager')
})

describe('rewards admin — role filtering', () => {
  it('a manager sees every rewards admin tile', () => {
    const keys = registryForRole(REGISTRY, 'manager', 'mgr').map((m) => m.key)
    for (const k of REWARDS_KEYS) expect(keys).toContain(k)
  })

  it('an agent sees NO rewards admin tiles by default', () => {
    const keys = registryForRole(REGISTRY, 'agent', 'a-e').map((m) => m.key)
    for (const k of REWARDS_KEYS) expect(keys).not.toContain(k)
  })

  it('granting rewards-comp shows the agent ONLY the Manual Comp tile', () => {
    setAgentTile('a-e', 'rewards-comp', true)
    const keys = registryForRole(REGISTRY, 'agent', 'a-e').map((m) => m.key)
    expect(keys).toContain('rewards-comp') // the comp tool
    expect(keys).not.toContain('tier-config') // never the global config
    expect(keys).not.toContain('rewards-economy')
    expect(keys).not.toContain('rewards-control')
  })

  it('a player sees nothing at all', () => {
    expect(registryForRole(REGISTRY, 'player', 'p-marco')).toEqual([])
  })
})

describe('rewards admin — panels mount (manager)', () => {
  it('every admin panel renders a body with no "coins" or cash-value language', () => {
    for (const m of rewardsAdminManifests) {
      const h = host()
      const root: Root = createRoot(h)
      const Panel = m.Panel
      act(() => root.render(<Panel onBack={() => {}} />))
      expect((h.textContent ?? '').length, m.key).toBeGreaterThan(0)
      // balance & credit only: never "coins", never a cash-out / withdrawal path ($ is the
      // app's money symbol and is allowed).
      expect(h.textContent ?? '', m.key).not.toMatch(/coin|cash[- ]?out|withdraw|real[- ]?money|cash value/i)
      act(() => root.unmount())
      h.remove()
    }
  })
})

describe('Manual Comp — agent scope', () => {
  it('an agent only sees their downline in the comp player picker', () => {
    setAgentTile('a-e', 'rewards-comp', true)
    setViewer('a-e', 'agent') // East Desk agent: downline = Marco, Lena
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<CompPanel onBack={() => {}} />))

    const options = [...h.querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toContain('Marco')
    expect(options).toContain('Lena')
    expect(options).not.toContain('Tariq') // West Desk — not in East Desk's downline
    // the allowance line is shown to a scoped agent
    expect(h.textContent).toMatch(/left this week/i)

    act(() => root.unmount())
    h.remove()
  })
})
