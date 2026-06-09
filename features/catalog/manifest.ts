import type { ComponentType } from 'react'
import type { IconType } from './icon.js'
import { LineChart, Dice5, PenLine, ClipboardCheck, Gift } from './icon.js'
import { LinesPanel } from './LinesPanel.js'
import { CasinoAdminPanel } from './CasinoAdminPanel.js'
import { TicketWriterPanel } from './TicketWriterPanel.js'
import { ScoresPanel } from './ScoresPanel.js'
import { RewardsPanel } from './RewardsPanel.js'

/**
 * Local stand-in for the shared contract at console/registry/types.ts (Agent 1 owns it;
 * not in this worktree yet). Same field shape, so it unifies on merge. `icon` is an
 * IconType (lucide-shaped) — swap to real `lucide-react` icons when the dep lands.
 * // TODO(api)
 */
export interface FeatureManifest {
  key: string
  name: string
  hint: string
  section: 'operations' | 'players' | 'catalog' | 'control'
  icon: IconType
  Panel: ComponentType<{ onBack: () => void }>
}

/** The Catalog section tiles. lines/casino/rewards adapt existing components; ticketwriter
 *  + scores are new minimal panels (no prior component existed). */
export const catalogManifests: FeatureManifest[] = [
  {
    key: 'lines',
    name: 'Sportsbook Lines',
    hint: 'Markets, odds, holds',
    section: 'catalog',
    icon: LineChart,
    Panel: LinesPanel,
  },
  {
    key: 'casino',
    name: 'Casino Admin',
    hint: 'Game config & RTP',
    section: 'catalog',
    icon: Dice5,
    Panel: CasinoAdminPanel,
  },
  {
    key: 'ticketwriter',
    name: 'Manual Ticket',
    hint: 'Write a bet by hand',
    section: 'catalog',
    icon: PenLine,
    Panel: TicketWriterPanel,
  },
  {
    key: 'scores',
    name: 'Scores',
    hint: 'Results & auto-grading',
    section: 'catalog',
    icon: ClipboardCheck,
    Panel: ScoresPanel,
  },
  {
    key: 'gamification',
    name: 'Rewards',
    hint: 'Missions, wheel, XP',
    section: 'catalog',
    icon: Gift,
    Panel: RewardsPanel,
  },
]

export default catalogManifests
