// @vitest-environment happy-dom
/**
 * Step 1B end-to-end: MyBets reads the DURABLE book ledger, so a resolved bet shows
 * up in the player's dashboard (and would survive a reload), proving the full wiring
 * core.resolve → book-ledger → toBetRows → MyBets render — the part unit tests don't
 * cover on their own.
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { placeWager, resolveWager } from '../core/index.js'
import { getCurrentPlayer } from './book-store.js'
import { MyBets } from './MyBets.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('MyBets reads the durable book ledger', () => {
  it('renders a durable resolved bet for the player (not just session state)', () => {
    const player = getCurrentPlayer()!
    // a real win graded through core — the durable book ledger captures it on resolve
    const w = placeWager(player.account, 1000)
    resolveWager(player.account, w, 'win', 2)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<MyBets account={player.account} player={player} />))

    // exactly one bet on record for this player, shown as a win
    const rows = host.querySelectorAll('.ledger-row:not(.ledger-row-head)')
    expect(rows.length).toBe(1)
    expect(host.textContent).toContain('Won')

    act(() => root.unmount())
    host.remove()
  })
})
