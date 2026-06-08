import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { probabilities } from '../wheel.js'
import {
  getConfig,
  getGamificationVersion,
  setAchievement,
  setMission,
  setTournament,
  setWheelCooldownHours,
  setWheelEnabled,
  setWheelSegment,
  subscribeGamification,
} from '../store.js'
import './gamification-config.css'

/**
 * Operator config for gamification (CLAUDE.md §4) — set prize pools, schedules, and win
 * probabilities for missions, achievements, the daily wheel, and tournaments. Built
 * standalone like the other manager pages: it reads the live config and edits it through
 * the engine's guarded setters; it moves no money and adds no model. The shell mounts it.
 */
export function GamificationConfigPage() {
  useSyncExternalStore(subscribeGamification, getGamificationVersion) // re-render on config change
  const config = getConfig()
  const [tab, setTab] = useState<'missions' | 'achievements' | 'wheel' | 'tournaments'>('missions')
  const [error, setError] = useState<string | null>(null)
  const guard = (fn: () => void) => {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const wheelProbs = Object.fromEntries(probabilities(config.wheel.segments).map((x) => [x.id, x.p]))

  const TABS = [
    { key: 'missions', label: 'Missions' },
    { key: 'achievements', label: 'Achievements' },
    { key: 'wheel', label: 'Reward wheel' },
    { key: 'tournaments', label: 'Tournaments' },
  ] as const

  return (
    <div className="gamc">
      <header className="gamc-head">
        <h1 className="gamc-title">Gamification</h1>
        <p className="gamc-sub">Tune missions, badges, the daily wheel, and tournaments. Rewards pay as free play.</p>
      </header>

      <nav className="gamc-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`gamc-tab ${tab === t.key ? 'is-on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="gamc-error">{error}</p>}

      {tab === 'missions' && (
        <table className="gamc-table">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Cadence</th>
              <th>On</th>
              <th>Target</th>
              <th>Reward $</th>
              <th>XP</th>
            </tr>
          </thead>
          <tbody>
            {config.missions.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.title}</strong>
                  <span className="gamc-metric"> · {m.metric}</span>
                </td>
                <td>{m.cadence}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => guard(() => setMission(m.id, { enabled: e.target.checked }))}
                  />
                </td>
                <td>
                  <EditNum value={m.target} kind="int" onCommit={(n) => guard(() => setMission(m.id, { target: n }))} />
                </td>
                <td>
                  <EditNum value={m.rewardCents} kind="cents" onCommit={(n) => guard(() => setMission(m.id, { rewardCents: n }))} />
                </td>
                <td>
                  <EditNum value={m.xp} kind="int" onCommit={(n) => guard(() => setMission(m.id, { xp: n }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'achievements' && (
        <table className="gamc-table">
          <thead>
            <tr>
              <th>Badge</th>
              <th>On</th>
              <th>Threshold</th>
              <th>Reward $</th>
              <th>XP</th>
            </tr>
          </thead>
          <tbody>
            {config.achievements.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="gamc-glyph">{a.badge}</span> <strong>{a.title}</strong>
                  <span className="gamc-metric"> · {a.metric}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => guard(() => setAchievement(a.id, { enabled: e.target.checked }))}
                  />
                </td>
                <td>
                  <EditNum value={a.threshold} kind="int" onCommit={(n) => guard(() => setAchievement(a.id, { threshold: n }))} />
                </td>
                <td>
                  <EditNum value={a.rewardCents} kind="cents" onCommit={(n) => guard(() => setAchievement(a.id, { rewardCents: n }))} />
                </td>
                <td>
                  <EditNum value={a.xp} kind="int" onCommit={(n) => guard(() => setAchievement(a.id, { xp: n }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'wheel' && (
        <div className="gamc-wheel">
          <div className="gamc-wheel-controls">
            <label className="gamc-inline">
              <input
                type="checkbox"
                checked={config.wheel.enabled}
                onChange={(e) => guard(() => setWheelEnabled(e.target.checked))}
              />
              Wheel enabled
            </label>
            <label className="gamc-inline">
              Spin cooldown (hours)
              <EditNum value={config.wheel.cooldownHours} kind="float" onCommit={(n) => guard(() => setWheelCooldownHours(n))} />
            </label>
          </div>
          <table className="gamc-table">
            <thead>
              <tr>
                <th>Prize</th>
                <th>Reward $</th>
                <th>Weight</th>
                <th>Win chance</th>
              </tr>
            </thead>
            <tbody>
              {config.wheel.segments.map((s) => (
                <tr key={s.id}>
                  <td>
                    <EditStr value={s.label} onCommit={(label) => guard(() => setWheelSegment(s.id, { label }))} />
                  </td>
                  <td>
                    <EditNum value={s.rewardCents} kind="cents" onCommit={(n) => guard(() => setWheelSegment(s.id, { rewardCents: n }))} />
                  </td>
                  <td>
                    <EditNum value={s.weight} kind="float" onCommit={(n) => guard(() => setWheelSegment(s.id, { weight: n }))} />
                  </td>
                  <td className="gamc-prob">{((wheelProbs[s.id] ?? 0) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tournaments' && (
        <table className="gamc-table">
          <thead>
            <tr>
              <th>Tournament</th>
              <th>On</th>
              <th>Ranks by</th>
              <th>Prize pool $</th>
              <th>Split</th>
            </tr>
          </thead>
          <tbody>
            {config.tournaments.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => guard(() => setTournament(t.id, { enabled: e.target.checked }))}
                  />
                </td>
                <td>{t.metric}</td>
                <td>
                  <EditNum value={t.prizePoolCents} kind="cents" onCommit={(n) => guard(() => setTournament(t.id, { prizePoolCents: n }))} />
                </td>
                <td className="gamc-split">{t.payoutPct.map((p) => `${Math.round(p * 100)}%`).join(' / ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** A small number editor: shows dollars for `cents`, commits on blur/Enter. */
function EditNum({
  value,
  onCommit,
  kind = 'int',
}: {
  value: number
  onCommit: (n: number) => void
  kind?: 'cents' | 'int' | 'float'
}) {
  const shown = kind === 'cents' ? String(value / 100) : String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])
  function commit() {
    const n = Number(draft)
    if (!Number.isFinite(n)) return setDraft(shown)
    onCommit(kind === 'cents' ? Math.round(n * 100) : kind === 'int' ? Math.round(n) : n)
  }
  return (
    <input
      className="gamc-num"
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** A small text editor, commits on blur/Enter. */
function EditStr({ value, onCommit }: { value: string; onCommit: (s: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      className="gamc-text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
