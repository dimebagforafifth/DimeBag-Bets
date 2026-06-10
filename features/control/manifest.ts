/**
 * Control section manifests — the array Agent 1's shell imports to build the grid.
 * analytics + access ADAPT existing components; sessions + settings are NEW panels
 * (sessions is flagged: full login/device/IP history needs the auth backend).
 */
import { BarChart3, ShieldCheck, MonitorSmartphone, Settings2 } from 'lucide-react'
import type { FeatureManifest } from './types.js'
import { AnalyticsPanel } from './AnalyticsPanel.js'
import { AccessPanel } from './AccessPanel.js'
import { SessionsPanel } from './SessionsPanel.js'
import { SettingsPanel } from './SettingsPanel.js'

export const controlManifests: FeatureManifest[] = [
  {
    key: 'analytics',
    name: 'Analytics',
    hint: 'Book health & trends',
    section: 'control',
    icon: BarChart3,
    Panel: AnalyticsPanel,
  },
  {
    key: 'access',
    name: 'Roles & Access',
    hint: 'Manager roles & permissions',
    section: 'control',
    icon: ShieldCheck,
    Panel: AccessPanel,
  },
  {
    key: 'security',
    name: 'Sessions',
    hint: 'Logins, device & IP review',
    section: 'control',
    icon: MonitorSmartphone,
    Panel: SessionsPanel,
  },
  {
    key: 'settings',
    name: 'Settings',
    hint: 'Tenant configuration',
    section: 'control',
    icon: Settings2,
    Panel: SettingsPanel,
  },
]

export default controlManifests
