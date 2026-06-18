/**
 * Competitions (operator console) — the creator surface. Spin up a branded contest from a
 * themed template (pick the metric, window, prize pool, eligibility), then manage the
 * lifecycle: CLOSE collects entry fees through `core`, PAY OUT grants prizes through `core`.
 * Read-only over the standings; every credit moves through core. Consumes the console tokens
 * (the .feat-* shell classes) — no per-feature palette.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { PanelShell } from '../../features/_desk/shared.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import {
  createCompetition,
  closeCompetition,
  payCompetition,
  getCompetitions,
  subscribeCompetitions,
  getCompetitionsVersion,
  statusOf,
  leaderboard,
  projectedPool,
  entriesFor,
  formatMetricValue,
  METRIC_META,
  eligiblePlayers,
  type Competition,
  type CompetitionStatus,
  type Eligibility,
  type MetricType,
} from '../../events/index.js'
import { TEMPLATES, TEMPLATE_ORDER, type DraftTemplate } from '../authoring.js'
import type { CompetitionTheme } from '../../events/types.js'
import './creator.css'

const DAY = 86_400_000
const METRICS: MetricType[] = [
  'wagered',
  'net_profit',
  'biggest_multiplier',
  'parlay_hits',
  'win_streak',
]
const ELIGIBILITY: { value: string; label: string; elig: Eligibility }[] = [
  { value: 'all', label: 'All players', elig: { kind: 'all' } },
  { value: 'vip_gold', label: 'VIP gold and up', elig: { kind: 'vip_min', minRank: 'gold' } },
  { value: 'vip_silver', label: 'VIP silver and up', elig: { kind: 'vip_min', minRank: 'silver' } },
]

const STATUS_LABEL: Record<CompetitionStatus, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  ended: 'Awaiting close',
  closed: 'Closed',
  paid: 'Paid',
}

export function CompetitionsConsolePanel({ onBack }: { onBack: () => void }) {
  // Subscribe for re-renders; the list is cheap to re-derive each render.
  useSyncExternalStore(subscribeCompetitions, getCompetitionsVersion)
  const comps = [...getCompetitions()].sort((a, b) => b.startsAt - a.startsAt)
  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Run branded contests off real play. Author a race or tournament, then close + pay it out —
          entry fees and prizes move only through the audited core.
        </p>
      </header>
      <CreateForm />
      <ManageList comps={comps} />
    </PanelShell>
  )
}

function CreateForm() {
  const [theme, setTheme] = useState<CompetitionTheme>('weekly_race')
  const [t, setT] = useState<DraftTemplate>(TEMPLATES.weekly_race)
  const [name, setName] = useState(TEMPLATES.weekly_race.name)
  const [metric, setMetric] = useState<MetricType>(TEMPLATES.weekly_race.metric)
  const [feeDollars, setFeeDollars] = useState(String(TEMPLATES.weekly_race.entryFeeCents / 100))
  const [poolDollars, setPoolDollars] = useState(
    String(TEMPLATES.weekly_race.guaranteedCents / 100),
  )
  const [days, setDays] = useState(String(TEMPLATES.weekly_race.durationDays))
  const [eligKey, setEligKey] = useState('all')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pickTemplate = (next: CompetitionTheme) => {
    const tpl = TEMPLATES[next]
    setTheme(next)
    setT(tpl)
    setName(tpl.name)
    setMetric(tpl.metric)
    setFeeDollars(String(tpl.entryFeeCents / 100))
    setPoolDollars(String(tpl.guaranteedCents / 100))
    setDays(String(tpl.durationDays))
  }

  const eligible = useMemo(() => {
    const e = ELIGIBILITY.find((x) => x.value === eligKey)?.elig ?? { kind: 'all' as const }
    return eligiblePlayers(e).length
  }, [eligKey])

  const create = () => {
    setMsg(null)
    setError(null)
    try {
      const now = Date.now()
      const elig = ELIGIBILITY.find((x) => x.value === eligKey)?.elig ?? { kind: 'all' }
      createCompetition({
        name,
        theme,
        metric,
        startsAt: now,
        endsAt: now + (Number(days) || 1) * DAY,
        entryFeeCents: toCents(Number(feeDollars) || 0),
        guaranteedCents: toCents(Number(poolDollars) || 0),
        payoutSplit: t.payoutSplit,
        eligibility: elig,
        createdBy: 'operator',
        blurb: t.blurb,
      })
      setMsg(`Created “${name}”.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="feat-card" aria-label="Create competition">
      <h3 className="feat-h2">New competition</h3>
      <div className="feat-actions" role="group" aria-label="Template">
        {TEMPLATE_ORDER.map((th) => (
          <button
            key={th}
            type="button"
            className={`feat-btn${theme === th ? ' is-active' : ''}`}
            aria-pressed={theme === th}
            onClick={() => pickTemplate(th)}
          >
            {TEMPLATES[th].name}
          </button>
        ))}
      </div>

      <div className="feat-grid">
        <label className="feat-field">
          <span className="feat-label">Name</span>
          <input className="feat-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="feat-field">
          <span className="feat-label">Ranked by</span>
          <select
            className="feat-input"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricType)}
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_META[m].label}
              </option>
            ))}
          </select>
        </label>
        <label className="feat-field">
          <span className="feat-label">Entry fee (dollars)</span>
          <input
            className="feat-input"
            type="number"
            min={0}
            step="0.01"
            value={feeDollars}
            onChange={(e) => setFeeDollars(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Guaranteed pool (dollars)</span>
          <input
            className="feat-input"
            type="number"
            min={0}
            step="0.01"
            value={poolDollars}
            onChange={(e) => setPoolDollars(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Runs for (days)</span>
          <input
            className="feat-input"
            type="number"
            min={1}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Eligibility ({eligible} players)</span>
          <select
            className="feat-input"
            value={eligKey}
            onChange={(e) => setEligKey(e.target.value)}
          >
            {ELIGIBILITY.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="feat-actions">
        <button type="button" className="feat-btn feat-btn-primary" onClick={create}>
          Create competition
        </button>
      </div>
      {error && <p className="feat-empty feat-down">{error}</p>}
      {msg && <p className="feat-saved">{msg}</p>}
    </section>
  )
}

function ManageList({ comps }: { comps: Competition[] }) {
  const now = Date.now()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const close = (id: string) => {
    setError(null)
    setMsg(null)
    try {
      closeCompetition(id, Date.now())
      setMsg('Entries collected — ready to pay out.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const pay = (id: string) => {
    setError(null)
    setMsg(null)
    try {
      const payouts = payCompetition(id, Date.now())
      const total = payouts.reduce((s, p) => s + p.prizeCents, 0)
      setMsg(`Paid ${formatMoney(total)} across ${payouts.length} winners.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="feat-card" aria-label="Manage competitions">
      <h3 className="feat-h2">Running competitions</h3>
      {error && <p className="feat-empty feat-down">{error}</p>}
      {msg && <p className="feat-saved">{msg}</p>}
      {comps.length === 0 ? (
        <p className="feat-sub">None yet — author one above.</p>
      ) : (
        <ul className="feat-list">
          {comps.map((c) => {
            const status = statusOf(c, now)
            const board = leaderboard(c, now).slice(0, 3)
            return (
              <li key={c.id} className="comp-admin-row">
                <div>
                  <strong>{c.name}</strong>{' '}
                  <span className="feat-label">{STATUS_LABEL[status]}</span>
                  <div className="feat-sub">
                    {METRIC_META[c.metric].label} · pool {formatMoney(projectedPool(c))} ·{' '}
                    {entriesFor(c.id).length} entered
                  </div>
                  {board.length > 0 && (
                    <div className="feat-sub">
                      {board
                        .map(
                          (s) => `#${s.rank} ${s.name} (${formatMetricValue(c.metric, s.value)})`,
                        )
                        .join('  ·  ')}
                    </div>
                  )}
                </div>
                <div className="feat-actions">
                  {c.demo ? (
                    <span className="feat-label">Demo</span>
                  ) : status === 'ended' ? (
                    // closeable only once the window has ended (a contest can't settle early)
                    <button type="button" className="feat-btn" onClick={() => close(c.id)}>
                      Close
                    </button>
                  ) : c.settlement === 'closed' ? (
                    <button
                      type="button"
                      className="feat-btn feat-btn-primary"
                      onClick={() => pay(c.id)}
                    >
                      Pay out
                    </button>
                  ) : c.settlement === 'paid' ? (
                    <span className="feat-label">Paid</span>
                  ) : (
                    <span className="feat-label">{STATUS_LABEL[status]}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
