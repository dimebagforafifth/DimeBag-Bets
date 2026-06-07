// @vitest-environment happy-dom
/** Enabling/disabling a game from the manager panel flips the persisted setting and
 *  the row state — the lobby + play guard read the same flag. */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { GAMES } from './games.js'
import { GamesPanel } from './GamesPanel.js'
import { isGameEnabled, setGameEnabled } from './settings-store.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('GamesPanel', () => {
  it('toggles a game off and back on', () => {
    const g = GAMES[0]
    setGameEnabled(g.key, true) // start enabled

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<GamesPanel />))

    const row = [...host.querySelectorAll<HTMLButtonElement>('.gp-row')].find(
      (r) => r.querySelector('.gp-name')?.textContent === g.name,
    )!
    expect(row.querySelector('.gp-state')?.textContent).toBe('On')

    act(() => row.click())
    expect(isGameEnabled(g.key)).toBe(false)
    expect(row.querySelector('.gp-state')?.textContent).toBe('Off')

    act(() => row.click())
    expect(isGameEnabled(g.key)).toBe(true)

    act(() => root.unmount())
    host.remove()
  })
})
