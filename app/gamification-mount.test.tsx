// @vitest-environment happy-dom
/**
 * Wiring: gamification is reachable + renders on both surfaces the shell mounts —
 * the operator's real config page in the manager console (replacing the old
 * "coming soon" stub), and the player rewards hub in the casino lobby.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { ManagerConsole } from './ManagerConsole.js'
import { getBook, listPlayers } from './book-store.js'
import { __resetPermissions } from './console/permissions-store.js'
import { __resetGamification } from '../gamification/index.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
function mount(node: ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(node))
  roots.push({ root, host })
  return host
}
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
  __resetPermissions()
  __resetGamification()
})

describe('gamification is wired into both surfaces', () => {
  it('the manager console opens the real GamificationConfigPage (not the coming-soon stub)', () => {
    const host = mount(
      <ManagerConsole
        org={getBook()}
        onMutate={() => {}}
        players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
      />,
    )
    // Settings → reveal advanced tools → open the gamification tool.
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('.mc-section')]
        .find((b) => b.textContent === 'Settings')!
        .click(),
    )
    act(() => host.querySelector<HTMLButtonElement>('.mc-adv-toggle')!.click())
    const tool = [...host.querySelectorAll<HTMLButtonElement>('.mc-tools .mc-tab')].find(
      (b) => b.textContent === 'Tournaments & wheel',
    )
    expect(tool, 'gamification tool is reachable').toBeTruthy()
    act(() => tool!.click())

    expect(host.querySelector('.gamc-title')?.textContent).toMatch(/Gamification/)
    expect(host.querySelector('.con-stub'), 'old stub is gone').toBeNull()
    expect(host.textContent).not.toMatch(/Coming soon/)
  })

  it('the casino lobby renders the player rewards hub (GamificationPanel)', () => {
    const host = mount(<App />)
    // Default section is the casino lobby; the rewards hub mounts under the game grid.
    expect(host.querySelector('.gam-title')?.textContent).toMatch(/Rewards/)
  })
})
