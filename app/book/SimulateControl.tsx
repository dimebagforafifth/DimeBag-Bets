/**
 * Demo/dev control to simulate BETTING activity — place sample bets across players,
 * then advance them through to settlement, so the full bet → live activity → figures
 * → settlement flow runs without waiting on a real game. Shown only in demo mode
 * (no Supabase keys). Everything it does routes through the real money path.
 */

import { useState } from 'react'
import { placeSampleBets, settleOpenBets, type SimulateResult } from './simulate.js'

export function SimulateControl({ now, onChange }: { now: () => number; onChange: () => void }) {
  const [note, setNote] = useState<string | null>(null)

  function place() {
    const placed = placeSampleBets(now())
    setNote(
      placed.length
        ? `Placed ${placed.length} sample bet${placed.length > 1 ? 's' : ''}.`
        : 'No bets placed (insufficient credit).',
    )
    onChange()
  }
  function settle(result: SimulateResult) {
    const n = settleOpenBets(now(), result)
    setNote(n ? `Settled ${n} bet${n > 1 ? 's' : ''} (${result}).` : 'No open bets to settle.')
    onChange()
  }

  return (
    <div className="bk-sim">
      <h3 className="bk-sim-h">Simulate betting</h3>
      <p className="bk-sim-sub">
        Drive the full bet → activity → figures → settlement flow without a live game.
      </p>
      <div className="bk-sim-row">
        <button type="button" className="bk-sim-btn is-primary" onClick={place}>
          Place sample bets
        </button>
        <button type="button" className="bk-sim-btn" onClick={() => settle('win')}>
          Settle: win
        </button>
        <button type="button" className="bk-sim-btn" onClick={() => settle('mixed')}>
          Settle: mixed
        </button>
        <button type="button" className="bk-sim-btn" onClick={() => settle('loss')}>
          Settle: loss
        </button>
      </div>
      {note && (
        <p className="bk-sim-sub" style={{ marginTop: 8, marginBottom: 0 }}>
          {note}
        </p>
      )}
    </div>
  )
}
