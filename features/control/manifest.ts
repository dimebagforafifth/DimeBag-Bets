/**
 * Control section manifests — the array Agent 1's shell imports to build the grid.
 * analytics + access ADAPT existing components; sessions + settings are NEW panels
 * (sessions is flagged: full login/device/IP history needs the auth backend).
 */
import {
  BarChart3,
  ShieldCheck,
  MonitorSmartphone,
  Settings2,
  Palette,
  Sparkles,
  Wand2,
  ScrollText,
} from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { AnalyticsPanel } from './AnalyticsPanel.js'
import { AccessPanel } from './AccessPanel.js'
import { SessionsPanel } from './SessionsPanel.js'
import { SettingsPanel } from './SettingsPanel.js'
import { RulesPanel } from './RulesPanel.js'
import { BrandingFeaturePanel } from './BrandingFeaturePanel.js'
import { CopilotFeaturePanel } from './CopilotFeaturePanel.js'
import { SetupFeaturePanel } from './SetupFeaturePanel.js'

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
  {
    key: 'rules',
    name: 'Rules',
    hint: 'House rules, grading & settlement policy',
    section: 'control',
    icon: ScrollText,
    Panel: RulesPanel,
  },
  // Ported from the old manager console:
  {
    key: 'branding',
    name: 'Branding',
    hint: 'White-label name, logo & accent',
    section: 'control',
    icon: Palette,
    Panel: BrandingFeaturePanel,
  },
  {
    key: 'copilot',
    name: 'Copilot',
    hint: 'Advisory insights on your book',
    section: 'control',
    icon: Sparkles,
    Panel: CopilotFeaturePanel,
  },
  {
    key: 'setup',
    name: 'Setup',
    hint: 'New-book wizard & house presets',
    section: 'control',
    icon: Wand2,
    Panel: SetupFeaturePanel,
  },
]

export default controlManifests
