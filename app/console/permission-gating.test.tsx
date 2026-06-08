// @vitest-environment happy-dom
/** Granular permission gating: an operator only sees the sections/tools their role
 *  (and any custom grant) allows. A limited operator can't reach restricted tools. */
import { describe, expect, it, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Role } from '../../org/index.js'
import { getBook, listPlayers } from '../book-store.js'
import { ManagerConsole } from '../ManagerConsole.js'
import { setGrant, __resetPermissions } from './permissions-store.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
  __resetPermissions()
})

function mount(operator: { id: string; role: Role }) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <ManagerConsole
        org={getBook()}
        onMutate={() => {}}
        players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
        operator={operator}
      />,
    ),
  )
  roots.push({ root, host })
  return host
}

const sections = (host: HTMLElement) =>
  [...host.querySelectorAll('.mc-section')].map((b) => b.textContent)

describe('console permission gating', () => {
  it('a manager sees every section, including Settings', () => {
    const host = mount({ id: 'mgr', role: 'manager' })
    expect(sections(host)).toEqual([
      'Dashboard',
      'Daily ops',
      'Players',
      'Risk',
      'Growth',
      'Settings',
    ])
  })

  it('a sub-agent cannot reach the Settings section (no games/branding/permissions/setup)', () => {
    const host = mount({ id: 's1', role: 'subagent' })
    const secs = sections(host)
    expect(secs).toContain('Risk') // sub-agents do get risk
    expect(secs).not.toContain('Settings') // …but never the admin tools
    // The Permissions / Branding tools are nowhere in the DOM.
    expect(host.textContent).not.toContain('Permissions')
    expect(host.querySelector('.mgr-brand-title')).toBeNull()
  })

  it('an agent sees only their front-line sections (no Risk, no Settings)', () => {
    const host = mount({ id: 'a1', role: 'agent' })
    const secs = sections(host)
    expect(secs).toEqual(expect.arrayContaining(['Dashboard', 'Players', 'Growth']))
    expect(secs).not.toContain('Risk')
    expect(secs).not.toContain('Settings')
  })

  it('a custom grant narrows an operator to exactly the granted tools', () => {
    setGrant('lim', ['dashboard']) // only the dashboard
    const host = mount({ id: 'lim', role: 'agent' })
    expect(sections(host)).toEqual(['Dashboard'])
    expect(host.textContent).not.toContain('Reporting')
  })

  it('admin-only tools can never be delegated, even if granted', () => {
    // Try to hand a sub-agent the Permissions + Setup tools.
    setGrant('s2', ['dashboard', 'permissions', 'setup'])
    const host = mount({ id: 's2', role: 'subagent' })
    // Dashboard came through; the admin tools were clamped away → no Settings section.
    expect(sections(host)).toEqual(['Dashboard'])
    expect(host.textContent).not.toContain('Permissions')
  })
})
