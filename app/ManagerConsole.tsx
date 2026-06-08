import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Management } from '../org/ui/Management.js'
import type { Org, Role } from '../org/index.js'
import { VipPanel } from '../vip/ui/index.js'
import { useAuth, memberForUser } from '../auth/index.js'
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
import { Dashboard } from './console/Dashboard.js'
import { SetupWizard } from './console/SetupWizard.js'
import { PermissionsPanel } from './console/PermissionsPanel.js'
import { SegmentsPanel } from './console/SegmentsPanel.js'
import { AlertsPanel } from './console/AlertsPanel.js'
import { NotesPanel } from './console/NotesPanel.js'
import { OperatorConfigStub } from './console/OperatorConfigStub.js'
import { can, type Capability } from './console/permissions.js'
import {
  getGrants,
  getPermissionsVersion,
  subscribePermissions,
} from './console/permissions-store.js'
import './manager-console.css'
import './console/console.css'

/**
 * The manager console shell (CLAUDE.md §2, §4). It organizes every operator tool into
 * six SECTIONS (Dashboard · Daily ops · Players · Risk · Growth · Settings) with a
 * two-level nav and progressive disclosure (rarely-used tools sit behind a per-section
 * "Advanced" toggle), so the surface stays clean however many tools exist.
 *
 * Access is GRANULAR: every tool maps to a capability (app/console/permissions), and
 * the console only shows the sections/tools the current operator may use. The head
 * manager always sees everything and grants slices to sub-agents from the Permissions
 * tool. The operator is resolved from auth (read-only) and can be injected for tests.
 *
 * It owns layout + gating only; each tool reads its own store and money still flows
 * through core (§3). Auth gates *reaching* the console (auth/roles); this gates what's
 * usable inside it.
 */
export interface ManagerConsoleProps {
  org: Org
  onMutate: (fn: (org: Org) => void) => void
  currentPlayerId?: string | null
  onPlayAs?: (playerId: string) => void
  onSettleAll?: (carryover?: boolean) => void
  onAdjustFigure?: (memberId: string, delta: number, reason: string) => void
  players: { id: string; name: string }[]
  /** The operator using the console; resolved from auth when omitted. Lets the shell
   *  and tests inject a specific operator to exercise permission gating. */
  operator?: { id: string; role: Role }
}

type SectionKey = 'dashboard' | 'ops' | 'players' | 'risk' | 'growth' | 'settings'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ops', label: 'Daily ops' },
  { key: 'players', label: 'Players' },
  { key: 'risk', label: 'Risk' },
  { key: 'growth', label: 'Growth' },
  { key: 'settings', label: 'Settings' },
]

interface ToolDef {
  cap: Capability
  label: string
  section: SectionKey
  /** Hidden behind the section's "Advanced" toggle until revealed. */
  advanced?: boolean
  render: () => ReactNode
}

export function ManagerConsole(props: ManagerConsoleProps) {
  // Re-render when grants change so a live permission edit takes effect immediately.
  const permV = useSyncExternalStore(subscribePermissions, getPermissionsVersion)
  const auth = useAuth()

  // Resolve the operator: explicit prop > the signed-in member > a manager fallback
  // (matches the auth module's no-provider fallback, so standalone renders get full
  // access exactly as before).
  const operator = useMemo<{ id: string; role: Role }>(() => {
    if (props.operator) return props.operator
    const m = memberForUser(auth.user?.id)
    return m ? { id: m.id, role: m.role } : { id: 'mgr', role: 'manager' }
  }, [props.operator, auth.user?.id])

  const grants = useMemo(() => getGrants(), [permV])
  const allowed = (cap: Capability) => can(operator, grants, cap)

  // The tool registry — built per render so the prop-bound tools (Players, VIP) stay
  // current. Order within a section is the display order.
  const TOOLS: ToolDef[] = [
    { cap: 'dashboard', label: 'Overview', section: 'dashboard', render: () => <Dashboard /> },

    // Daily ops
    { cap: 'settlement', label: 'Settlement', section: 'ops', render: () => <SettlementHistory /> },
    {
      cap: 'communication',
      label: 'Communication',
      section: 'ops',
      render: () => <CommunicationPage />,
    },

    // Players
    {
      cap: 'players',
      label: 'Players & agents',
      section: 'players',
      render: () => (
        <Management
          org={props.org}
          onMutate={props.onMutate}
          currentPlayerId={props.currentPlayerId}
          onPlayAs={props.onPlayAs}
          onSettleAll={props.onSettleAll}
          onAdjustFigure={props.onAdjustFigure}
        />
      ),
    },
    { cap: 'segments', label: 'Segments', section: 'players', render: () => <SegmentsPanel /> },
    { cap: 'notes', label: 'Notes & tags', section: 'players', render: () => <NotesPanel /> },
    {
      cap: 'vip',
      label: 'VIP',
      section: 'players',
      advanced: true,
      render: () => <VipPanel players={props.players} />,
    },
    {
      cap: 'loyalty',
      label: 'Loyalty',
      section: 'players',
      advanced: true,
      render: () => <LoyaltyPage />,
    },

    // Risk
    { cap: 'risk', label: 'Risk & exposure', section: 'risk', render: () => <RiskPanel /> },
    { cap: 'alerts', label: 'Alerts', section: 'risk', render: () => <AlertsPanel /> },
    {
      cap: 'audit',
      label: 'Audit log',
      section: 'risk',
      advanced: true,
      render: () => <AuditPanel />,
    },

    // Growth
    { cap: 'reporting', label: 'Reporting', section: 'growth', render: () => <ReportingPage /> },
    { cap: 'promotions', label: 'Promotions', section: 'growth', render: () => <PromotionsPage /> },
    {
      cap: 'copilot',
      label: 'Copilot',
      section: 'growth',
      advanced: true,
      render: () => <CopilotPage />,
    },

    // Settings
    { cap: 'setup', label: 'Setup', section: 'settings', render: () => <SetupWizard /> },
    {
      cap: 'games',
      label: 'Games & edge',
      section: 'settings',
      render: () => (
        <div className="mc-stack">
          <GamesPanel />
          <HouseEdgePanel />
        </div>
      ),
    },
    {
      cap: 'permissions',
      label: 'Permissions',
      section: 'settings',
      render: () => <PermissionsPanel />,
    },
    {
      cap: 'branding',
      label: 'Branding',
      section: 'settings',
      advanced: true,
      render: () => <BrandingPage />,
    },
    {
      cap: 'operators',
      label: 'Tournaments & wheel',
      section: 'settings',
      advanced: true,
      render: () => <OperatorConfigStub />,
    },
  ]

  const visibleTools = TOOLS.filter((t) => allowed(t.cap))
  const visibleSections = SECTIONS.filter((s) => visibleTools.some((t) => t.section === s.key))

  const [sectionState, setSectionState] = useState<SectionKey>('dashboard')
  const [toolState, setToolState] = useState<Capability | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Resolve the active section/tool against what's actually visible (so a permission
  // change can never strand the view on a now-hidden tool).
  const section = visibleSections.some((s) => s.key === sectionState)
    ? sectionState
    : (visibleSections[0]?.key ?? 'dashboard')
  const sectionTools = visibleTools.filter((t) => t.section === section)
  const activeTool =
    sectionTools.find((t) => t.cap === toolState) ??
    sectionTools.find((t) => !t.advanced) ??
    sectionTools[0] ??
    null
  const hasAdvanced = sectionTools.some((t) => t.advanced)
  const navTools = sectionTools.filter(
    (t) => !t.advanced || showAdvanced || t.cap === activeTool?.cap,
  )

  const selectSection = (key: SectionKey) => {
    setSectionState(key)
    const first =
      visibleTools.find((t) => t.section === key && !t.advanced) ??
      visibleTools.find((t) => t.section === key)
    setToolState(first?.cap ?? null)
  }

  if (visibleSections.length === 0) {
    return (
      <div className="mc">
        <p className="con-empty">
          You don&apos;t have access to any console tools. Ask your manager for permissions.
        </p>
      </div>
    )
  }

  return (
    <div className="mc">
      <nav className="mc-sections" role="tablist" aria-label="Console sections">
        {visibleSections.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={s.key === section}
            className={`mc-section ${s.key === section ? 'is-active' : ''}`}
            onClick={() => selectSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Second level: the tools in this section. A single tool needs no sub-nav. */}
      {(sectionTools.length > 1 || hasAdvanced) && (
        <nav className="mc-tools" role="tablist" aria-label={`${section} tools`}>
          {navTools.map((t) => (
            <button
              key={t.cap}
              role="tab"
              aria-selected={t.cap === activeTool?.cap}
              className={`mc-tab ${t.cap === activeTool?.cap ? 'is-active' : ''}`}
              onClick={() => setToolState(t.cap)}
            >
              {t.label}
            </button>
          ))}
          {hasAdvanced && (
            <button
              className="mc-adv-toggle"
              aria-pressed={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? 'Less' : 'Advanced'}
            </button>
          )}
        </nav>
      )}

      <div className="mc-body">{activeTool?.render()}</div>
    </div>
  )
}
