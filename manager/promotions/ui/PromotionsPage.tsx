import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../../app/book-store.js'
import { NumberInput } from '../../../games/shared/NumberInput.js'
import { formatMoney, toCents } from '../../../games/shared/money.js'
import type { Role } from '../../../org/index.js'
import { planBonus, type BonusType } from '../promotions.js'
import { sendBonus } from '../send.js'
import { promoStore } from '../promo-store.js'
import { scheduleStore } from '../schedule-store.js'
import { startScheduleRunner } from '../schedule-runner.js'
import type { Recurrence } from '../schedule.js'
import './promotions.css'

const ROLE_LABEL: Record<Role, string> = {
  manager: 'Whole book',
  subagent: 'Sub-agent',
  agent: 'Agent',
  player: 'Player',
}
const ROLE_ORDER: Record<Role, number> = { manager: 0, subagent: 1, agent: 2, player: 3 }

/**
 * Promotions — grant free-play / point bonuses to one player or a whole downline.
 * Credits flow through `core.grant` (see send.ts); this page only drafts + logs.
 * Self-contained; the shell mounts it under Management.
 */
export function PromotionsPage() {
  const bookV = useSyncExternalStore(subscribeBook, getBookVersion)
  const org = useMemo(() => getBook(), [bookV])
  const promoV = useSyncExternalStore(promoStore.subscribe, promoStore.version)
  const campaigns = useMemo(() => promoStore.campaigns().slice(), [promoV])

  const targets = useMemo(
    () =>
      Object.values(org.members).sort(
        (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
      ),
    [org, bookV],
  )

  const [targetId, setTargetId] = useState(org.managerId)
  const [cents, setCents] = useState(5000) // $50.00
  const [type, setType] = useState<BonusType>('bonus')
  const [note, setNote] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [whenStr, setWhenStr] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('once')

  // Keep the schedule runner ticking while this page is open (the shell can also
  // boot it; startScheduleRunner is idempotent).
  useEffect(() => startScheduleRunner(), [])

  const schedV = useSyncExternalStore(scheduleStore.subscribe, scheduleStore.version)
  const upcoming = useMemo(() => scheduleStore.schedules().filter((s) => s.active), [schedV])

  // A live preview of who'd be credited (and the total), or why it can't send.
  const { plan, planError } = useMemo(() => {
    try {
      return { plan: planBonus(org, { targetId, cents, type }), planError: null as string | null }
    } catch (e) {
      return { plan: null, planError: e instanceof Error ? e.message : String(e) }
    }
  }, [org, targetId, cents, type])

  const kind = type === 'freeplay' ? 'free play' : 'bonus'

  function submit() {
    setResult(null)
    setError(null)
    try {
      const draft = { targetId, cents, type, note: note.trim() || undefined }
      if (mode === 'schedule') {
        const fireAt = whenStr ? new Date(whenStr).getTime() : NaN
        if (!Number.isFinite(fireAt)) throw new Error('pick a date & time to schedule')
        if (fireAt < Date.now()) throw new Error('schedule a time in the future')
        scheduleStore.add(draft, fireAt, recurrence)
        setResult(
          `Scheduled ${formatMoney(cents)} ${kind} ${recurrence === 'once' ? 'for' : 'starting'} ${new Date(
            fireAt,
          ).toLocaleString()}${recurrence === 'once' ? '' : ` · repeats ${recurrence}`}.`,
        )
      } else {
        const r = sendBonus(draft)
        setResult(
          `Sent ${formatMoney(r.perPlayer)} ${kind} to ${r.players} player${r.players === 1 ? '' : 's'} — ${formatMoney(
            r.total,
          )} total.`,
        )
      }
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mgr-promo">
      <header className="mgr-promo-head">
        <h1 className="mgr-promo-title">Promotions</h1>
        <p className="mgr-promo-sub">
          Grant free play or point bonuses to one player or a whole downline. Credits post to each
          player's figure instantly.
        </p>
      </header>

      <section className="mgr-promo-card" aria-label="Send a bonus">
        <div className="mgr-field">
          <label className="mgr-label" htmlFor="promo-target">
            Send to
          </label>
          <select
            id="promo-target"
            className="mgr-select"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {targets.map((m) => (
              <option key={m.id} value={m.id}>
                {ROLE_LABEL[m.role]} · {m.name}
                {m.role !== 'player' ? ' (downline)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="mgr-row">
          <div className="mgr-field">
            <span className="mgr-label">Amount each</span>
            <div className="mgr-amount">
              <span className="mgr-amount-prefix">$</span>
              <NumberInput
                className="mgr-amount-input"
                value={cents / 100}
                min={0.01}
                onCommit={(d) => setCents(Math.max(1, toCents(d ?? 0)))}
              />
            </div>
          </div>

          <div className="mgr-field">
            <span className="mgr-label">Type</span>
            <div className="mgr-toggle">
              <button className={type === 'bonus' ? 'is-on' : ''} onClick={() => setType('bonus')}>
                Point bonus
              </button>
              <button className={type === 'freeplay' ? 'is-on' : ''} onClick={() => setType('freeplay')}>
                Free play
              </button>
            </div>
          </div>
        </div>

        <div className="mgr-field">
          <label className="mgr-label" htmlFor="promo-note">
            Note <span className="mgr-dim">(optional)</span>
          </label>
          <input
            id="promo-note"
            className="mgr-input"
            value={note}
            maxLength={60}
            placeholder="e.g. Welcome bonus"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="mgr-field">
          <span className="mgr-label">When</span>
          <div className="mgr-toggle">
            <button className={mode === 'now' ? 'is-on' : ''} onClick={() => setMode('now')}>
              Send now
            </button>
            <button className={mode === 'schedule' ? 'is-on' : ''} onClick={() => setMode('schedule')}>
              Schedule
            </button>
          </div>
        </div>
        {mode === 'schedule' && (
          <div className="mgr-row">
            <div className="mgr-field">
              <span className="mgr-label">Date &amp; time</span>
              <input
                type="datetime-local"
                className="mgr-input"
                value={whenStr}
                onChange={(e) => setWhenStr(e.target.value)}
              />
            </div>
            <div className="mgr-field">
              <span className="mgr-label">Repeat</span>
              <select
                className="mgr-select"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        )}

        <div className="mgr-promo-foot">
          <p className="mgr-plan">
            {planError ? (
              <span className="mgr-plan-err">{planError}</span>
            ) : plan ? (
              <>
                <strong>{plan.players.length}</strong> player{plan.players.length === 1 ? '' : 's'} ·{' '}
                <strong>{formatMoney(plan.perPlayer)}</strong> each ·{' '}
                <strong>{formatMoney(plan.total)}</strong> total
              </>
            ) : null}
          </p>
          <button className="mgr-send" onClick={submit} disabled={!plan}>
            {mode === 'schedule' ? 'Schedule' : 'Send bonus'}
          </button>
        </div>

        {result && <p className="mgr-result is-ok">{result}</p>}
        {error && <p className="mgr-result is-err">{error}</p>}
      </section>

      {upcoming.length > 0 && (
        <section aria-label="Scheduled bonuses">
          <h2 className="mgr-h2">Scheduled</h2>
          <table className="mgr-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Type</th>
                <th className="num">Each</th>
                <th>Repeat</th>
                <th>Next fire</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {upcoming.map((s) => (
                <tr key={s.id}>
                  <td>{org.members[s.draft.targetId]?.name ?? s.draft.targetId}</td>
                  <td>{s.draft.type === 'freeplay' ? 'Free play' : 'Bonus'}</td>
                  <td className="num">{formatMoney(s.draft.cents)}</td>
                  <td>{s.recurrence}</td>
                  <td className="mgr-dim">{new Date(s.fireAt).toLocaleString()}</td>
                  <td className="num">
                    <button className="mgr-mini" onClick={() => scheduleStore.cancel(s.id)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-label="Sent campaigns">
        <h2 className="mgr-h2">Recent bonuses</h2>
        {campaigns.length === 0 ? (
          <p className="mgr-promo-empty">No bonuses sent yet.</p>
        ) : (
          <table className="mgr-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Type</th>
                <th>Note</th>
                <th className="num">Each</th>
                <th className="num">Players</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.targetName}</td>
                  <td>{c.type === 'freeplay' ? 'Free play' : 'Bonus'}</td>
                  <td className="mgr-dim">{c.note ?? '—'}</td>
                  <td className="num">{formatMoney(c.perPlayer)}</td>
                  <td className="num">{c.players}</td>
                  <td className="num">{formatMoney(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
