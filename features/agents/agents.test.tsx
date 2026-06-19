// @vitest-environment happy-dom
/** The Agents tree renders the book hierarchy and opens an editor per member.
 *  Read/select only — no edits are committed, so the shared book isn't mutated. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getBook } from '../../app/book-store.js'
import { setActiveEconomyTenant, setEconomyPolicy, __resetEconomy } from '../../core/index.js'
import { __resetEconomyConfig } from '../../app/economy-config.js'
import { AgentsPanel, buildForest, flatten } from './AgentsPanel.js'
import { AgentAdminPanel } from './AgentAdminPanel.js'
import { AgentPerformancePanel } from './AgentPerformancePanel.js'
import { agentsManifests } from './manifest.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetEconomyConfig()
  __resetEconomy()
})

/** Flip the active book to the wallet economy money-neutrally (no migration) for label tests. */
function setBalanceMode() {
  setActiveEconomyTenant('default')
  setEconomyPolicy({ mode: 'balance', balanceFloorCents: 0 }, 'default')
}

const rows = () => [...host.querySelectorAll<HTMLButtonElement>('.agt-rowbtn')]
const rowByRole = (label: string) =>
  rows().find((b) => b.querySelector('.agt-badge')?.textContent === label)
const detail = () => host.querySelector('.agt-detail')?.textContent ?? ''

describe('Agents — hierarchy', () => {
  it('manifest targets Players with a non-colliding key', () => {
    expect(agentsManifests[0].key).toBe('agents')
    expect(agentsManifests[0].section).toBe('players')
  })

  it('buildForest roots at the manager and nests sub-agents → agents → players', () => {
    const org = getBook()
    const tree = buildForest(org)
    expect(tree.member.role).toBe('manager')
    expect(tree.children.length).toBeGreaterThan(0)
    const roles = new Set(flatten(tree, new Set()).map((n) => n.member.role))
    expect(roles.has('subagent')).toBe(true) // super-agents
    expect(roles.has('agent')).toBe(true)
    expect(roles.has('player')).toBe(true)
  })

  it('renders the tree with role badges and a figure per node', () => {
    act(() => root.render(<AgentsPanel onBack={() => {}} />))
    expect(rows().length).toBeGreaterThan(3)
    expect(rowByRole('Manager')).toBeTruthy()
    expect(rowByRole('Super-Agent')).toBeTruthy()
    expect(rowByRole('Player')).toBeTruthy()
  })

  it('offers an Add member section for player / agent / super-agent', () => {
    act(() => root.render(<AgentsPanel onBack={() => {}} />))
    const add = host.querySelector('.agt-add')
    expect(add?.textContent).toMatch(/Add member/)
    const roleOpts = [...(add?.querySelectorAll('select') ?? [])][0]
    const labels = [...(roleOpts?.querySelectorAll('option') ?? [])].map((o) => o.textContent)
    expect(labels).toEqual(['Super-Agent', 'Agent', 'Player'])
    // A player's eligible parents include super-agents and agents (org rule).
    expect(add?.querySelector('button')?.textContent).toMatch(/Add Player/)
  })

  it('shows player-only levers for a player, agent-level stats for an agent', () => {
    act(() => root.render(<AgentsPanel onBack={() => {}} />))

    // A player → max bet + betting lock controls.
    act(() => rowByRole('Player')!.click())
    expect(detail()).toMatch(/Max bet/)
    expect(detail()).toMatch(/Betting locked/)
    expect(detail()).toMatch(/Credit limit/)

    // A super-agent → downline stats, no per-head max bet.
    act(() => rowByRole('Super-Agent')!.click())
    expect(detail()).toMatch(/Players under/)
    expect(detail()).not.toMatch(/Max bet/)
  })
})

describe('Agent Admin + Performance', () => {
  it('manifest registers agent-admin + agent-performance under Players', () => {
    expect(agentsManifests.map((m) => m.key)).toEqual([
      'agents',
      'agent-admin',
      'agent-performance',
    ])
    expect(agentsManifests.every((m) => m.section === 'players')).toBe(true)
  })

  it('Agent Admin lists agents with editable allowance + commission and a status toggle', () => {
    act(() => root.render(<AgentAdminPanel onBack={() => {}} />))
    expect(host.querySelector('.agtbl')).toBeTruthy()
    expect(host.textContent).toMatch(/Allowance/)
    expect(host.textContent).toMatch(/Commission/)
    expect(host.querySelectorAll('.agtbl-input').length).toBeGreaterThan(0) // inline editors
    expect(host.querySelector('.agtbl-btn')?.textContent).toMatch(/Active|Suspended/)
  })

  it('Agent Admin in balance mode drops the credit-waterfall columns, keeps commission', () => {
    setBalanceMode()
    act(() => root.render(<AgentAdminPanel onBack={() => {}} />))
    const heads = [...host.querySelectorAll('thead th')].map((t) => t.textContent)
    // No credit-only field: the allowance (credit budget) + to-grant columns are gone.
    expect(heads).not.toContain('Allowance')
    expect(heads).not.toContain('To grant')
    // Commission, roster + the status toggle remain — they aren't credit-line concepts.
    expect(heads).toContain('Commission')
    expect(host.querySelector('.agtbl-btn')?.textContent).toMatch(/Active|Suspended/)
    // The header copy no longer pitches a "credit budget".
    expect(host.querySelector('.feat-sub')?.textContent).not.toMatch(/credit budget/)
  })

  it('Agent Performance ranks agents with Book W/L and a commission total', () => {
    act(() => root.render(<AgentPerformancePanel onBack={() => {}} />))
    expect(host.textContent).toMatch(/Book W\/L/)
    expect(host.querySelectorAll('.agtbl tbody tr').length).toBeGreaterThan(0)
    expect(host.querySelector('.agtbl-foot')?.textContent).toMatch(/Book total/)
  })
})
