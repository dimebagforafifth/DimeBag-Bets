/**
 * Local copy of the console feature contract. Agent 1 owns the canonical type at
 * console/registry/types.ts; until that lands in this worktree we declare it here with
 * the EXACT shape so it unifies on merge (the shell imports our manifest array).
 */
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface FeatureManifest {
  key: string
  name: string
  hint: string
  section: 'operations' | 'players' | 'catalog' | 'control'
  icon: LucideIcon
  /** Renders ONLY the feature body — no top bar / figures strip / page chrome. */
  Panel: ComponentType<{ onBack: () => void }>
}
