import { LineChart, ListTree, Dice5, PenLine, ClipboardCheck, Gavel, Gift } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { LinesPanel } from './LinesPanel.js'
import { GameAdminPanel } from './GameAdminPanel.js'
import { CasinoAdminPanel } from './CasinoAdminPanel.js'
import { TicketWriterPanel } from './TicketWriterPanel.js'
import { ScoresPanel } from './ScoresPanel.js'
import { RulesPanel } from './RulesPanel.js'
import { RewardsPanel } from './RewardsPanel.js'

/** The Catalog section tiles. lines/casino/rewards adapt existing components; game-admin,
 *  ticketwriter, scores + rules are purpose-built console panels (game-admin manages the
 *  sportsbook slate over the book overlay; rules holds trading/grading config). */
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
    key: 'game-admin',
    name: 'Game Admin',
    hint: 'Per-game markets, lines & limits',
    section: 'catalog',
    icon: ListTree,
    Panel: GameAdminPanel,
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
    key: 'rules',
    name: 'Rules',
    hint: 'Trading & grading config',
    section: 'catalog',
    icon: Gavel,
    Panel: RulesPanel,
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
