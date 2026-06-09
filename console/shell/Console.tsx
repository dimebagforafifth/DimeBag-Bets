/**
 * The console orchestrator — the top-level chrome the whole app grid lives in.
 * Persistent top bar + figures strip; below them either the section grid (home)
 * or the workspace mounting the active feature's Panel. Drives off the registry
 * (empty in phase 1 → graceful empty state) and is fully prop-driven, so it has
 * no hardcoded brand, username, or figures.
 */

import { useMemo, useState } from 'react'
import '../theme/index.js' // tokens
import { groupBySection, findFeature, REGISTRY } from '../registry/index.js'
import type { FeatureManifest } from '../registry/types.js'
import { TopBar } from './TopBar.js'
import { FiguresStrip, type Trend } from './FiguresStrip.js'
import { SectionGrid } from './SectionGrid.js'
import { WorkspaceContainer } from './WorkspaceContainer.js'
import './console.css'

export interface ConsoleProps {
  /** Feature manifests to render. Defaults to the (phase-1 empty) registry; the
   *  phase-2 integrator passes the merged set (or populates REGISTRY). */
  registry?: FeatureManifest[]
  /** Top bar. */
  brand?: string
  username?: string
  onSignOut?: () => void
  /** Figures strip (display-ready strings). */
  balance?: string
  week?: string
  weekTrend?: Trend
  today?: string
  todayTrend?: Trend
  activeAccts?: number | string
}

export function Console({
  registry = REGISTRY,
  brand,
  username,
  onSignOut,
  balance,
  week,
  weekTrend,
  today,
  todayTrend,
  activeAccts,
}: ConsoleProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Filter by the search box (name/hint), then group into the four sections.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? registry.filter((m) => `${m.name} ${m.hint}`.toLowerCase().includes(q))
      : registry
    return groupBySection(matched)
  }, [registry, query])

  const active = findFeature(registry, activeKey)
  const goHome = () => setActiveKey(null)

  return (
    <div className="console">
      <TopBar
        brand={brand}
        username={username}
        search={query}
        onSearch={setQuery}
        onHome={goHome}
        onSignOut={onSignOut}
      />
      <main className="console-main">
        <FiguresStrip
          balance={balance}
          week={week}
          weekTrend={weekTrend}
          today={today}
          todayTrend={todayTrend}
          activeAccts={activeAccts}
        />
        {active ? (
          <WorkspaceContainer title={active.name} onBack={goHome}>
            <active.Panel onBack={goHome} />
          </WorkspaceContainer>
        ) : (
          <SectionGrid groups={groups} onOpen={setActiveKey} />
        )}
      </main>
    </div>
  )
}
