import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Management } from '../org/ui/Management.js'
import type { Org } from '../org/index.js'
import { VipPanel } from '../vip/ui/index.js'
import { HouseEdgePanel } from './HouseEdgePanel.js'
import { GamesPanel } from './GamesPanel.js'
import { RiskPanel } from './RiskPanel.js'
import { SettlementHistory } from './SettlementHistory.js'
import { AuditPanel } from './AuditPanel.js'
import {
  ReportingPage,
  CopilotPage,
  PromotionsPage,
  LoyaltyPage,
  CommunicationPage,
  BrandingPage,
} from '../manager/index.js'
import './manager-console.css'

/**
 * The manager console (CLAUDE.md §2, §4) — an **app launcher**. One backdrop, the
 * operator tools laid out as square, purpose-coloured app tiles grouped into
 * sections (Operations · Catalog · Insight & Growth). Clicking a tile opens that
 * tool in a workspace with an "All tools" back control; the grid is the home.
 *
 * It owns layout only — each tool is self-contained and reads its own store, and
 * money still flows through core (§3). The per-app colour reflects the tool's
 * purpose; the tile body stays uniform so the grid reads clean, not jumbled.
 * (Auth/role-gating the console is handled by the App shell.)
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

type Tab =
  | 'book'
  | 'risk'
  | 'settlement'
  | 'games'
  | 'vip'
  | 'audit'
  | 'reporting'
  | 'copilot'
  | 'promotions'
  | 'loyalty'
  | 'communication'
  | 'branding'

// ── App-tile icons ─────────────────────────────────────────────────────────
// Minimal inline glyphs; the tile sets the colour via the `--app` custom prop so
// the icon is the one coloured element and the tile body stays uniform.
const Glyph = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)
const dot = { fill: 'currentColor', stroke: 'none' } as const
const IconUsers = () => (
  <Glyph>
    <circle cx="8.5" cy="9" r="3.2" />
    <path d="M2.8 19.5a5.7 5.7 0 0 1 11.4 0" />
    <path d="M16 6a3 3 0 0 1 0 6" />
    <path d="M17.5 13.6a5.6 5.6 0 0 1 3.7 5.9" />
  </Glyph>
)
const IconRisk = () => (
  <Glyph>
    <path d="M12 4 21 19.5H3z" />
    <path d="M12 10v4.2" />
    <path d="M12 17.2h.01" />
  </Glyph>
)
const IconScales = () => (
  <Glyph>
    <path d="M12 4.5v15" />
    <path d="M7 19.5h10" />
    <path d="M5 8h14" />
    <path d="M5 8l-2 4.6a3 3 0 0 0 4 0z" />
    <path d="M19 8l2 4.6a3 3 0 0 1-4 0z" />
  </Glyph>
)
const IconAudit = () => (
  <Glyph>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M8.5 8.5h7" />
    <path d="M8.5 12.5h7" />
    <path d="M8.5 16.5h4" />
  </Glyph>
)
const IconDice = () => (
  <Glyph>
    <rect x="4" y="4" width="16" height="16" rx="3.2" />
    <circle cx="9" cy="9" r="1.05" {...dot} />
    <circle cx="15" cy="9" r="1.05" {...dot} />
    <circle cx="12" cy="12" r="1.05" {...dot} />
    <circle cx="9" cy="15" r="1.05" {...dot} />
    <circle cx="15" cy="15" r="1.05" {...dot} />
  </Glyph>
)
const IconCrown = () => (
  <Glyph>
    <path d="M4 8l3.4 3L12 5l4.6 6L20 8l-1.4 10H5.4z" />
  </Glyph>
)
const IconTag = () => (
  <Glyph>
    <path d="M4 12.6 11.6 5H19v7.4L11.4 20z" />
    <circle cx="15.3" cy="8.7" r="1.25" {...dot} />
  </Glyph>
)
const IconHeart = () => (
  <Glyph>
    <path d="M12 20s-7-4.4-7-9.6A3.6 3.6 0 0 1 12 7.2 3.6 3.6 0 0 1 19 10.4C19 15.6 12 20 12 20z" />
  </Glyph>
)
const IconBars = () => (
  <Glyph>
    <path d="M5 20.5V11" />
    <path d="M12 20.5V4" />
    <path d="M19 20.5v-6.5" />
  </Glyph>
)
const IconSparkle = () => (
  <Glyph>
    <path d="M11 3.5l1.7 4.8L17.5 10l-4.8 1.7L11 16.5 9.3 11.7 4.5 10l4.8-1.7z" />
    <path d="M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </Glyph>
)
const IconChat = () => (
  <Glyph>
    <path d="M5 5.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9.5L5 19.5V6.5a1 1 0 0 1 1-1z" />
  </Glyph>
)
const IconDroplet = () => (
  <Glyph>
    <path d="M12 3.5s6 6.3 6 10.4a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5z" />
  </Glyph>
)

// ── The app grid ───────────────────────────────────────────────────────────
interface AppDef {
  key: Tab
  label: string
  /** Purpose colour — the one accent on an otherwise-uniform tile. */
  color: string
  icon: ReactNode
}
interface ConsoleSection {
  key: string
  label: string
  apps: AppDef[]
}

const SECTIONS: ConsoleSection[] = [
  {
    key: 'operations',
    label: 'Operations',
    apps: [
      { key: 'book', label: 'Players & Agents', color: '#5a8dee', icon: <IconUsers /> },
      { key: 'risk', label: 'Risk', color: '#ed7a5f', icon: <IconRisk /> },
      { key: 'settlement', label: 'Settlement', color: '#3dd6a0', icon: <IconScales /> },
      { key: 'audit', label: 'Audit', color: '#8b9bb4', icon: <IconAudit /> },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    apps: [
      { key: 'games', label: 'Games & Edge', color: '#b07cf0', icon: <IconDice /> },
      { key: 'vip', label: 'VIP', color: '#e0b341', icon: <IconCrown /> },
      { key: 'promotions', label: 'Promotions', color: '#f2789b', icon: <IconTag /> },
      { key: 'loyalty', label: 'Loyalty', color: '#ee9d52', icon: <IconHeart /> },
    ],
  },
  {
    key: 'growth',
    label: 'Insight & Growth',
    apps: [
      { key: 'reporting', label: 'Reporting', color: '#46c2cf', icon: <IconBars /> },
      { key: 'copilot', label: 'Copilot', color: '#7c83f0', icon: <IconSparkle /> },
      { key: 'communication', label: 'Communication', color: '#56b6e6', icon: <IconChat /> },
      { key: 'branding', label: 'Branding', color: '#c77dd6', icon: <IconDroplet /> },
    ],
  },
]

const APPS: AppDef[] = SECTIONS.flatMap((s) => s.apps)
const appVar = (color: string) => ({ '--app': color }) as CSSProperties

/** The body for an open tool — each is self-contained and reads its own store. */
function renderPanel(tab: Tab, props: ManagerConsoleProps): ReactNode {
  switch (tab) {
    case 'book':
      return (
        <Management
          org={props.org}
          onMutate={props.onMutate}
          currentPlayerId={props.currentPlayerId}
          onPlayAs={props.onPlayAs}
          onSettleAll={props.onSettleAll}
          onAdjustFigure={props.onAdjustFigure}
        />
      )
    case 'risk':
      return <RiskPanel />
    case 'settlement':
      return <SettlementHistory />
    case 'games':
      return (
        <div className="mc-stack">
          <GamesPanel />
          <HouseEdgePanel />
        </div>
      )
    case 'vip':
      return <VipPanel players={props.players} />
    case 'audit':
      return <AuditPanel />
    case 'reporting':
      return <ReportingPage />
    case 'copilot':
      return <CopilotPage />
    case 'promotions':
      return <PromotionsPage />
    case 'loyalty':
      return <LoyaltyPage />
    case 'communication':
      return <CommunicationPage />
    case 'branding':
      return <BrandingPage />
  }
}

export function ManagerConsole(props: ManagerConsoleProps) {
  const [open, setOpen] = useState<Tab | null>(null)
  const active = open ? (APPS.find((a) => a.key === open) ?? null) : null

  // A tool is open → its workspace, on the same backdrop, with a back control.
  if (active) {
    return (
      <div className="mc">
        <div className="mc-workspace">
          <button className="mc-back" onClick={() => setOpen(null)}>
            ← All tools
          </button>
          <div className="mc-workspace-head">
            <span className="mc-app-icon" style={appVar(active.color)}>
              {active.icon}
            </span>
            <h2 className="mc-workspace-title">{active.label}</h2>
          </div>
          <div className="mc-body">{renderPanel(active.key, props)}</div>
        </div>
      </div>
    )
  }

  // Home → the app grid.
  return (
    <div className="mc">
      <div className="mc-home">
        {SECTIONS.map((sec) => (
          <section className="mc-section" key={sec.key}>
            <div className="mc-section-head">{sec.label}</div>
            <div className="mc-grid">
              {sec.apps.map((a) => (
                <button
                  key={a.key}
                  className="mc-app"
                  style={appVar(a.color)}
                  onClick={() => setOpen(a.key)}
                >
                  <span className="mc-app-icon">{a.icon}</span>
                  <span className="mc-app-name">{a.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
