/**
 * Live Activity — ADAPTS the existing app/ActivityTicker (real-time bet ticker over
 * the session ledger feed). We strip nothing from it (it's already body-only) and add
 * an empty state, since the ticker renders null with no activity.
 */
import { useSyncExternalStore } from 'react'
import { ActivityTicker } from '../../app/ActivityTicker.js'
import { getLedger, subscribeLedger } from '../../app/ledger-store.js'
import { PanelShell } from './shared.js'

export function LiveActivityPanel({ onBack }: { onBack: () => void }) {
  const feed = useSyncExternalStore(subscribeLedger, getLedger, getLedger)
  return (
    <PanelShell onBack={onBack}>
      <h1 className="feat-h1">Live Activity</h1>
      {feed.length === 0 ? (
        <p className="feat-empty">
          No betting activity yet — bets appear here the moment they settle.
        </p>
      ) : (
        <ActivityTicker limit={50} />
      )}
    </PanelShell>
  )
}
