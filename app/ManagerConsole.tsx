import { useState } from 'react'
import { Management } from '../org/ui/Management.js'
import type { Org } from '../org/index.js'
import { VipPanel } from '../vip/ui/index.js'
import { HouseEdgePanel } from './HouseEdgePanel.js'
import { GamesPanel } from './GamesPanel.js'
import { RiskPanel } from './RiskPanel.js'
import { SettlementHistory } from './SettlementHistory.js'
import { AuditPanel } from './AuditPanel.js'
import './manager-console.css'

/**
 * The manager console shell (CLAUDE.md §2, §4) — one container with a sub-nav that
 * organizes the operator panels into sections instead of one long inline scroll. The
 * "Book" tab is the org console (players/agents/settlement/risk-flags + the sportsbook
 * Lines via its trading toggle); the rest are the durable-record + config panels this
 * backbone added. It owns layout only; each panel reads its own store and money still
 * flows through core (§3). (Auth/role-gating the console is deferred to the auth phase.)
 */
export interface ManagerConsoleProps {
  org: Org
  onMutate: (fn: (org: Org) => void) => void
  currentPlayerId?: string | null
  onPlayAs?: (playerId: string) => void
  onSettleAll?: (carryover?: boolean) => void
  onAdjustFigure?: (memberId: string, delta: number, reason: string) => void
  players: { id: string; name: string }[]
}

type Tab = 'book' | 'risk' | 'settlement' | 'games' | 'vip' | 'audit'
const TABS: { key: Tab; label: string }[] = [
  { key: 'book', label: 'Players & Agents' },
  { key: 'risk', label: 'Risk' },
  { key: 'settlement', label: 'Settlement' },
  { key: 'games', label: 'Games & Edge' },
  { key: 'vip', label: 'VIP' },
  { key: 'audit', label: 'Audit' },
]

export function ManagerConsole(props: ManagerConsoleProps) {
  const [tab, setTab] = useState<Tab>('book')
  return (
    <div className="mc">
      <nav className="mc-nav" role="tablist" aria-label="Manager sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`mc-tab ${tab === t.key ? 'is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mc-body">
        {tab === 'book' && (
          <Management
            org={props.org}
            onMutate={props.onMutate}
            currentPlayerId={props.currentPlayerId}
            onPlayAs={props.onPlayAs}
            onSettleAll={props.onSettleAll}
            onAdjustFigure={props.onAdjustFigure}
          />
        )}
        {tab === 'risk' && <RiskPanel />}
        {tab === 'settlement' && <SettlementHistory />}
        {tab === 'games' && (
          <div className="mc-stack">
            <GamesPanel />
            <HouseEdgePanel />
          </div>
        )}
        {tab === 'vip' && <VipPanel players={props.players} />}
        {tab === 'audit' && <AuditPanel />}
      </div>
    </div>
  )
}
