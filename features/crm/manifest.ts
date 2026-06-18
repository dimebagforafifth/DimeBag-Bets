/**
 * CRM / integrity / analytics console tiles. Four read-only back-office surfaces
 * (the white paper's moat): player CRM, integrity risk scoring, abuse watch, and
 * the operator analytics suite. Each plugs into the console registry's
 * FeatureManifest seam.
 */
import { Users, Fingerprint, ShieldAlert, BarChart3 } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { CrmSegmentsPanel } from './CrmSegmentsPanel.js'
import { IntegrityPanel } from './IntegrityPanel.js'
import { AbuseWatchPanel } from './AbuseWatchPanel.js'
import { AnalyticsPanel } from './AnalyticsPanel.js'

// SEAM: registry owner imports crmManifests into console/registry/index.ts (do NOT edit that file)
export const crmManifests: FeatureManifest[] = [
  {
    key: 'crm-segments',
    name: 'Player CRM',
    hint: 'Segments, lifecycle & churn',
    section: 'players',
    icon: Users,
    Panel: CrmSegmentsPanel,
  },
  {
    key: 'player-integrity',
    name: 'Integrity',
    hint: 'Sharp / CLV risk scoring',
    section: 'players',
    icon: Fingerprint,
    Panel: IntegrityPanel,
  },
  {
    key: 'abuse-watch',
    name: 'Abuse Watch',
    hint: 'Multi-account & collusion clusters',
    section: 'players',
    icon: ShieldAlert,
    Panel: AbuseWatchPanel,
  },
  {
    key: 'operator-analytics',
    name: 'Analytics',
    hint: 'Hold, SGP mix, retention',
    section: 'control',
    icon: BarChart3,
    Panel: AnalyticsPanel,
  },
]

export default crmManifests
