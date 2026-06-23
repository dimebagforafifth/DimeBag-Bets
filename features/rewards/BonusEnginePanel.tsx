/**
 * Bonus Engine — the no-code operator console for the bonus rules engine (CLAUDE.md §4).
 *
 * The operator COMPOSES a bonus as data (trigger · reward · eligibility · playthrough ·
 * expiry · max-win cap), turns it on/off, fires it, and watches playthrough clear per
 * player. Every credit move runs through the engine → core (grant / clawback); this panel
 * only edits rule DATA and reads grant state. Manager only. Balance/credits, never cash.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney, toCents } from '../../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { getRewardsConfig } from './economy.js'
import {
  getBonusRules,
  getBonusRulesVersion,
  subscribeBonusRules,
  getBonusGrants,
  getBonusGrantsVersion,
  subscribeBonusGrants,
  setBonusRuleEnabled,
  upsertBonusRule,
  fireTrigger,
  seedBonusDemo,
  armBonusEngine,
  type BonusRule,
  type BonusTrigger,
  type RewardKind,
  type PlayerSegment,
  type BonusGrant,
} from '../bonus/index.js'
import { PanelShell } from '../_desk/shared.js'
import './bonus-admin.css'

const TRIGGERS: { value: BonusTrigger; label: string }[] = [
  { value: 'signup', label: 'Signup' },
  { value: 'deposit', label: 'Top-up' },
  { value: 'first-bet', label: 'First bet' },
  { value: 'losing-streak', label: 'Losing streak' },
  { value: 'daily', label: 'Daily' },
  { value: 'manual', label: 'Manual' },
]
const KINDS: { value: RewardKind; label: string }[] = [
  { value: 'credit', label: 'Credit grant' },
  { value: 'match', label: 'Deposit match' },
  { value: 'rakeback', label: 'Rakeback' },
  { value: 'profit-boost', label: 'Profit boost' },
  { value: 'free-spins', label: 'Free spins' },
]
const SEGMENTS: PlayerSegment[] = ['new', 'casual', 'winning', 'vip', 'at-risk']
const DAY = 86_400_000

// Demo context for "Run trigger" so any reward kind produces a grant the operator can see
// flow through core (a real wiring connects these to live deposit/loss amounts).
const DEMO_CTX = { amountCents: 100_000, lossesCents: 50_000, refStakeCents: 10_000 }

function rewardSummary(r: BonusRule['reward']): string {
  switch (r.kind) {
    case 'credit':
      return `${formatMoney(r.valueCents ?? 0)} credit`
    case 'match':
      return `${r.pct ?? 0}% match`
    case 'rakeback':
      return `${r.pct ?? 0}% rakeback`
    case 'profit-boost':
      return `+${r.pct ?? 0}% profit boost`
    case 'free-spins':
      return `${r.spins ?? 0} free spins`
  }
}

export function BonusEnginePanel({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    seedBonusDemo(Date.now())
    const off = armBonusEngine()
    return off
  }, [])

  useSyncExternalStore(subscribeBonusRules, getBonusRulesVersion)
  useSyncExternalStore(subscribeBonusGrants, getBonusGrantsVersion)
  useSyncExternalStore(subscribeBook, getBookVersion)

  const rules = getBonusRules()
  const grants = getBonusGrants()
  const book = getBook()
  const tierIds = getRewardsConfig().tiers.map((t) => t.id)

  const active = grants.filter((g) => g.status === 'active')
  const outstanding = active.reduce((s, g) => s + g.grantedCents, 0)
  const cleared = grants.filter((g) => g.status === 'cleared').length
  const liveRules = rules.filter((r) => r.enabled).length

  function patch(rule: BonusRule, p: Partial<BonusRule>): void {
    upsertBonusRule({ ...rule, ...p })
  }
  function patchReward(rule: BonusRule, p: Partial<BonusRule['reward']>): void {
    upsertBonusRule({ ...rule, reward: { ...rule.reward, ...p } })
  }
  function toggleIn<T>(list: T[] | undefined, value: T): T[] {
    const cur = list ?? []
    return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
  }

  function addRule(): void {
    upsertBonusRule({
      id: `rule-${Date.now()}`,
      name: 'New bonus',
      enabled: false,
      trigger: 'manual',
      reward: { kind: 'credit', valueCents: 100_00 },
      eligibility: {},
      playthroughX: 1,
      expiryMs: 7 * DAY,
      maxWinCents: 1_000_00,
    })
  }

  const [fired, setFired] = useState<string | null>(null)
  function run(rule: BonusRule): void {
    const res = fireTrigger(rule.trigger, { ...DEMO_CTX, now: Date.now() })
    setFired(`${rule.name}: granted ${res.granted.length}, skipped ${res.skipped}`)
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <h2 className="feat-h">Bonus Engine</h2>
        <p className="feat-sub">
          Compose a bonus with no code — a trigger, a reward, who's eligible, a playthrough
          requirement, an expiry and a max-win cap. Every credit moves through core: granted on
          fire, cleared by wagering, clawed back on expiry. All balance, never cash.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Bonus engine">
        <div className="feat-kpi">
          <span className="feat-label">Live rules</span>
          <strong>{liveRules}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Active grants</span>
          <strong>{active.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Bonus credit outstanding</span>
          <strong>{formatMoney(outstanding)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Cleared</span>
          <strong>{cleared}</strong>
        </div>
      </section>

      <section className="feat-card">
        <div className="bn-cardhead">
          <h3 className="feat-h">Bonus rules</h3>
          <button className="feat-btn" onClick={addRule}>
            + New bonus
          </button>
        </div>
        {fired && <p className="feat-saved">{fired}</p>}
        <div className="bn-rules">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              tierIds={tierIds}
              onName={(name) => patch(rule, { name })}
              onEnable={(on) => setBonusRuleEnabled(rule.id, on)}
              onTrigger={(trigger) => patch(rule, { trigger })}
              onKind={(kind) => patchReward(rule, { kind })}
              onReward={(p) => patchReward(rule, p)}
              onPlaythrough={(playthroughX) => patch(rule, { playthroughX })}
              onExpiryDays={(d) => patch(rule, { expiryMs: d * DAY })}
              onMaxWin={(maxWinCents) => patch(rule, { maxWinCents })}
              onSegment={(s) => patch(rule, { eligibility: { ...rule.eligibility, segments: toggleIn(rule.eligibility.segments, s) } })}
              onTier={(t) => patch(rule, { eligibility: { ...rule.eligibility, tiers: toggleIn(rule.eligibility.tiers, t) } })}
              onRun={() => run(rule)}
            />
          ))}
        </div>
      </section>

      <PlaythroughTracker grants={grants} book={book} />
    </PanelShell>
  )
}

function RuleCard({
  rule,
  tierIds,
  onName,
  onEnable,
  onTrigger,
  onKind,
  onReward,
  onPlaythrough,
  onExpiryDays,
  onMaxWin,
  onSegment,
  onTier,
  onRun,
}: {
  rule: BonusRule
  tierIds: string[]
  onName: (v: string) => void
  onEnable: (v: boolean) => void
  onTrigger: (v: BonusTrigger) => void
  onKind: (v: RewardKind) => void
  onReward: (p: Partial<BonusRule['reward']>) => void
  onPlaythrough: (v: number) => void
  onExpiryDays: (v: number) => void
  onMaxWin: (v: number | null) => void
  onSegment: (s: PlayerSegment) => void
  onTier: (t: string) => void
  onRun: () => void
}) {
  const r = rule.reward
  const pctKind = r.kind === 'match' || r.kind === 'rakeback' || r.kind === 'profit-boost'
  return (
    <div className={`bn-rule ${rule.enabled ? 'is-on' : ''}`}>
      <div className="bn-rule-top">
        <input
          className="feat-input bn-name"
          value={rule.name}
          aria-label="bonus name"
          onChange={(e) => onName(e.target.value)}
        />
        <span className="feat-flag">{rewardSummary(r)}</span>
        <label className="feat-check bn-switch">
          <input type="checkbox" checked={rule.enabled} onChange={(e) => onEnable(e.target.checked)} />
          {rule.enabled ? 'Live' : 'Off'}
        </label>
      </div>

      <div className="bn-grid">
        <label className="feat-field">
          <span className="feat-label">Trigger</span>
          <select className="feat-input" value={rule.trigger} onChange={(e) => onTrigger(e.target.value as BonusTrigger)}>
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="feat-field">
          <span className="feat-label">Reward</span>
          <select className="feat-input" value={r.kind} onChange={(e) => onKind(e.target.value as RewardKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {r.kind === 'credit' && (
          <NumField label="Amount ($)" value={(r.valueCents ?? 0) / 100} onCommit={(n) => onReward({ valueCents: toCents(n) })} />
        )}
        {pctKind && <NumField label="Percent (%)" value={r.pct ?? 0} onCommit={(n) => onReward({ pct: n })} />}
        {r.kind === 'free-spins' && <NumField label="Spins" value={r.spins ?? 0} onCommit={(n) => onReward({ spins: Math.round(n) })} />}
        <NumField label="Playthrough (×)" value={rule.playthroughX} onCommit={onPlaythrough} />
        <NumField label="Expiry (days)" value={Math.round(rule.expiryMs / DAY)} onCommit={(n) => onExpiryDays(Math.max(1, Math.round(n)))} />
        <NumField
          label="Max-win cap ($)"
          value={rule.maxWinCents == null ? 0 : rule.maxWinCents / 100}
          hint="0 = uncapped"
          onCommit={(n) => onMaxWin(n <= 0 ? null : toCents(n))}
        />
      </div>

      <div className="bn-elig">
        <span className="feat-label">Eligible segments</span>
        <div className="bn-chips">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              type="button"
              className={`bn-chip ${rule.eligibility.segments?.includes(s) ? 'is-on' : ''}`}
              onClick={() => onSegment(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="feat-label">Eligible tiers</span>
        <div className="bn-chips">
          {tierIds.map((t) => (
            <button
              key={t}
              type="button"
              className={`bn-chip ${rule.eligibility.tiers?.includes(t) ? 'is-on' : ''}`}
              onClick={() => onTier(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="bn-elignote">
          {rule.eligibility.segments?.length || rule.eligibility.tiers?.length ? '' : 'No filter — every active player qualifies.'}
        </p>
      </div>

      <div className="feat-actions">
        <button className="feat-btn bn-run" onClick={onRun} disabled={!rule.enabled}>
          Run trigger
        </button>
        <span className="bn-meta">
          Clears at {rule.playthroughX}× turnover · expires in {Math.round(rule.expiryMs / DAY)}d
        </span>
      </div>
    </div>
  )
}

function PlaythroughTracker({ grants, book }: { grants: BonusGrant[]; book: ReturnType<typeof getBook> }) {
  const active = useMemo(() => grants.filter((g) => g.status === 'active'), [grants])
  const recent = useMemo(
    () => grants.filter((g) => g.status !== 'active').slice(0, 8),
    [grants],
  )
  const nameOf = (g: BonusGrant) => book.members[g.playerId]?.name ?? g.playerName

  return (
    <section className="feat-card">
      <h3 className="feat-h">Playthrough — clearing per player</h3>
      {active.length === 0 ? (
        <p className="feat-empty">No bonuses mid-playthrough.</p>
      ) : (
        <div className="bn-track">
          {active.map((g) => {
            const pct = g.requiredTurnoverCents > 0 ? Math.min(1, g.turnoverCents / g.requiredTurnoverCents) : 1
            return (
              <div key={g.id} className="bn-trow">
                <div className="bn-tmain">
                  <span className="bn-tname">{nameOf(g)}</span>
                  <span className="bn-tnote">
                    {g.ruleName} · {formatMoney(g.grantedCents)} bonus
                  </span>
                </div>
                <div className="bn-bar">
                  <div className="bn-bar-fill" style={{ width: `${pct * 100}%` }} />
                </div>
                <span className="bn-tpct">
                  {formatMoney(g.turnoverCents)} / {formatMoney(g.requiredTurnoverCents)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {recent.length > 0 && (
        <table className="rwa-table bn-log">
          <thead>
            <tr>
              <th>Player</th>
              <th>Bonus</th>
              <th className="num">Credit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((g) => (
              <tr key={g.id}>
                <td>{nameOf(g)}</td>
                <td>{g.ruleName}</td>
                <td className="num">{g.grantedCents > 0 ? formatMoney(g.grantedCents) : g.spins ? `${g.spins} spins` : '—'}</td>
                <td>
                  <span className={`bn-status is-${g.status}`}>{g.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function NumField({
  label,
  value,
  onCommit,
  hint,
}: {
  label: string
  value: number
  onCommit: (n: number) => void
  hint?: string
}) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  function commit(): void {
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) onCommit(n)
    else setV(String(value))
  }
  return (
    <label className="feat-field">
      <span className="feat-label">{label}</span>
      <input
        className="feat-input"
        type="number"
        value={v}
        aria-label={label}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {hint && <span className="bn-hint">{hint}</span>}
    </label>
  )
}
