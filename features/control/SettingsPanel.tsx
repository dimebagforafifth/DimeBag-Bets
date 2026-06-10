/**
 * Settings — tenant configuration. NEW panel that wraps the existing book-settings
 * store (app/settings-store) with editable controls + the existing app/GamesPanel for
 * the game catalogue toggles. Writes go through the store's validated public setters;
 * it moves no money.
 *
 * Seam: per-tenant scoping. AuthUser.tenantId already exists; once the Supabase org
 * claim populates it, these settings are per-book automatically (the store keys on the
 * active tenant). Single-tenant demo today. // TODO(api)
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { toCents } from '../../games/shared/money.js'
import {
  getSettings,
  getSettingsVersion,
  setDefaultCreditLimit,
  setRiskCreditUtil,
  setRiskExposureCap,
  setSettlementPeriodDays,
  subscribeSettings,
} from '../../app/settings-store.js'
import { GamesPanel } from '../../app/GamesPanel.js'
import { PanelShell } from './shared.js'

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const v = useSyncExternalStore(subscribeSettings, getSettingsVersion)
  const s = useMemo(() => getSettings(), [v])
  const [error, setError] = useState<string | null>(null)

  const commit = (fn: () => void) => {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Tenant configuration — settlement, credit, risk alerts, and the game catalogue.
        </p>
      </header>

      {error && <p className="feat-empty feat-down">{error}</p>}

      {/* keyed by version so the fields resync if settings change elsewhere */}
      <section className="feat-card feat-grid" aria-label="Book settings" key={v}>
        <label className="feat-field">
          <span className="feat-label">Settlement cadence (days)</span>
          <input
            className="feat-input"
            type="number"
            min={1}
            step={1}
            defaultValue={s.settlementPeriodDays}
            onKeyDown={blurOnEnter}
            onBlur={(e) =>
              commit(() => setSettlementPeriodDays(Math.round(Number(e.target.value))))
            }
          />
        </label>

        <label className="feat-field">
          <span className="feat-label">Default credit line (coins)</span>
          <input
            className="feat-input"
            type="number"
            min={0}
            step={1}
            defaultValue={s.defaultCreditLimit / 100}
            onKeyDown={blurOnEnter}
            onBlur={(e) => commit(() => setDefaultCreditLimit(toCents(Number(e.target.value))))}
          />
        </label>

        <label className="feat-field">
          <span className="feat-label">Credit-use alert (%)</span>
          <input
            className="feat-input"
            type="number"
            min={1}
            max={100}
            step={1}
            defaultValue={Math.round(s.riskCreditUtil * 100)}
            onKeyDown={blurOnEnter}
            onBlur={(e) => commit(() => setRiskCreditUtil(Number(e.target.value) / 100))}
          />
        </label>

        <label className="feat-field">
          <span className="feat-label">Exposure alert cap (coins, blank = off)</span>
          <input
            className="feat-input"
            type="number"
            min={0}
            step={1}
            defaultValue={s.riskExposureCap == null ? '' : s.riskExposureCap / 100}
            onKeyDown={blurOnEnter}
            onBlur={(e) =>
              commit(() =>
                setRiskExposureCap(
                  e.target.value.trim() === '' ? null : toCents(Number(e.target.value)),
                ),
              )
            }
          />
        </label>
      </section>

      {/* The existing game catalogue toggles, themed by the shell wrapper. */}
      <GamesPanel />
    </PanelShell>
  )
}
