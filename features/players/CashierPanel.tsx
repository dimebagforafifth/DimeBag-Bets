import { useState, useSyncExternalStore } from 'react'
import { PlayerSearch } from '../org/ui/PlayerLookup.js'
import { AdjustFigure } from '../org/ui/Management.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { adjustFigure } from '../../app/manager-actions.js'
import './players.css'

/**
 * Cashier — issue & adjust dollar balances. Search a player, then the existing
 * `AdjustFigure` control posts a signed adjustment through `manager-actions.adjustFigure`
 * (records the audit + ledger). Money still moves only through core.grant/adjustBalance.
 */
export function CashierPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [id, setId] = useState<string | null>(null)
  const member = id ? org.members[id] : null

  return (
    <div className="feat">
      <PlayerSearch org={org} onSelect={setId} />
      {member && member.role === 'player' ? (
        <div className="feat-card">
          <h3 className="feat-h">{member.name}</h3>
          <AdjustFigure
            member={member}
            onAdjust={(memberId, delta, reason) => adjustFigure(memberId, delta, reason, 'cashier')}
          />
        </div>
      ) : (
        <p className="feat-empty">Search a player to issue or adjust dollars.</p>
      )}
    </div>
  )
}
