// @vitest-environment happy-dom
/**
 * Disabling a game hides it from the casino lobby (and App's liveGame guard then makes
 * it unplayable). Verifies the settings flag → lobby filter wiring end to end.
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { GAMES } from './games.js'
import { setGameEnabled } from './settings-store.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('enable/disable games — lobby', () => {
  it('hides a disabled game from the lobby and shows it again when re-enabled', () => {
    const g = GAMES[0]
    setGameEnabled(g.key, true)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<App />))

    // Lobby tiles are the brand GameCard now — names live in .sds-gamecard__name.
    const names = () => [...host.querySelectorAll('.sds-gamecard__name')].map((n) => n.textContent)
    expect(names()).toContain(g.name)

    act(() => setGameEnabled(g.key, false)) // App subscribes to settings → re-renders
    expect(names()).not.toContain(g.name)

    act(() => setGameEnabled(g.key, true))
    expect(names()).toContain(g.name)

    act(() => root.unmount())
    host.remove()
  })
})
