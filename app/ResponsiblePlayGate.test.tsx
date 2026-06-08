// @vitest-environment happy-dom
/**
 * The gate really blocks play: within limits it shows the play surface; once the
 * player is in a "take a break" cooldown it replaces it with the break screen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ResponsiblePlayGate } from './ResponsiblePlayGate.js'
import { setLimits, startCooldown, resetSession } from './responsible-play.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PID = 'gate-test-player'
let host: HTMLElement
let root: Root
beforeEach(() => {
  resetSession(PID)
  setLimits(PID, { cooldownUntil: undefined, sessionLossLimit: undefined, sessionMinutes: undefined, perBetMax: undefined })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const Play = () => <div className="play-surface">PLAY</div>

describe('ResponsiblePlayGate', () => {
  it('shows the play surface when within limits', () => {
    act(() => root.render(<ResponsiblePlayGate playerId={PID}><Play /></ResponsiblePlayGate>))
    expect(host.querySelector('.play-surface')).not.toBeNull()
    expect(host.querySelector('.rp-break')).toBeNull()
  })

  it('replaces play with a break screen during a cooldown', () => {
    startCooldown(PID, 60 * 60_000) // an hour from now
    act(() => root.render(<ResponsiblePlayGate playerId={PID}><Play /></ResponsiblePlayGate>))
    expect(host.querySelector('.play-surface')).toBeNull() // play is blocked
    const breakScreen = host.querySelector('.rp-break')
    expect(breakScreen).not.toBeNull()
    expect(breakScreen?.textContent).toMatch(/break/i)
    expect(host.querySelector('.rp-break-until')?.textContent).toMatch(/reopens in/i)
  })
})
