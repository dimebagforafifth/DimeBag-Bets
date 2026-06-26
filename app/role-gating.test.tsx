// @vitest-environment happy-dom
/**
 * Route role-gating at the app shell: a player sees only the play tabs (never
 * Management); the operator sees the management console. The guard lives in App from
 * outside the console (auth/roles), so a player can't reach it even via a stale route.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { AuthProvider } from '../auth/index.js'
import { createDemoAdapter, __resetDemoAuth } from '../auth/demoAdapter.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function mountApp() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )
  })
  await act(async () => {}) // flush getSession()
  await act(async () => {}) // flush the role re-render
  return { host, root }
}

/** Flush act() repeatedly until `pred` holds — used to settle the lazy operator console
 *  (App lazy-loads `Console`, so its tiles arrive a Suspense boundary later than the shell). */
async function flushUntil(pred: () => boolean, tries = 50) {
  for (let i = 0; i < tries && !pred(); i++) {
    // setTimeout (a macrotask) gives the lazy chunk's dynamic import real time to resolve;
    // a bare microtask flush isn't enough for React.lazy in jsdom/happy-dom.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
}

// Every reachable section is a first-class item in the persistent left sidebar (the
// "More" dropdown is gone). The grouped nav holds the player sections; Management is
// pulled out and pinned at the bottom as the gold console-entry CTA — so the full set a
// role can reach = the grouped nav items PLUS the console CTA. Each carries a text label.
const navLabels = (host: HTMLElement) =>
  [...host.querySelectorAll('.psa-nav-item, .psa-console-cta')].map((t) =>
    (t.textContent ?? '').trim(),
  )

describe('route role-gating', () => {
  beforeEach(() => __resetDemoAuth())

  it('a player sees the play tabs but NOT Management', async () => {
    await createDemoAdapter().signIn('marco', 'demo') // persist a player session
    const { host, root } = await mountApp()
    const labels = navLabels(host)
    expect(labels).toContain('Casino')
    expect(labels).toContain('My Bets')
    expect(labels).not.toContain('Management')
    expect(host.textContent).not.toContain('Players & Agents') // console not rendered
    act(() => root.unmount())
    host.remove()
  })

  it('the operator (manager) sees Management', async () => {
    const { host, root } = await mountApp() // demo bootstraps the operator session
    expect(navLabels(host)).toContain('Management')
    act(() => root.unmount())
    host.remove()
  })

  it('an agent sees Management but only their granted tiles (scoped console)', async () => {
    await createDemoAdapter().signIn('agent', 'demo') // East Desk agent session
    const { host, root } = await mountApp()
    expect(navLabels(host)).toContain('Management')
    // The console is a lazy chunk — settle its Suspense boundary before reading tiles.
    await flushUntil(() => (host.textContent ?? '').includes('Customer Admin'))
    // granted-by-default agent tiles show…
    expect(host.textContent).toContain('Customer Admin')
    expect(host.textContent).toContain('Collections')
    // …but manager-only tiles never do
    expect(host.textContent).not.toContain('Branding')
    expect(host.textContent).not.toContain('Sportsbook Lines')
    expect(host.textContent).not.toContain('Roles & Access')
    act(() => root.unmount())
    host.remove()
  })
})
