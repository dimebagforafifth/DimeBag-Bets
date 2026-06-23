import { useEffect, useState } from 'react'
import {
  addMember,
  availableCredit,
  bookFigure,
  bookPending,
  creditUtilization,
  directReports,
  downline,
  eligibleParents,
  getMember,
  playerCount,
  reassign,
  removeMember,
  renameMember,
  ROLE_TIER,
  setActive,
  setBettingLocked,
  setBookBettingLocked,
  setCreditLimit,
  setMaxPayout,
  setMaxWager,
  setMinWager,
  settleOrgWeek,
  settlementStatement,
  type Member,
  type Org,
  type Role,
  type Settlement,
} from '../index.js'
import { availableToWager } from '../../../core/index.js'
import { formatMoney, toCents, toSignedCents } from '../../../games/shared/money.js'
import { TradingDesk } from '../../../sportsbook/trading/ui/TradingDesk.js'
import { PlayerSearch, PlayerProfile } from './PlayerLookup.js'
import './management.css'

/**
 * The player-management console (CLAUDE.md §2, §5) — the operator's view of the
 * Manager → Sub-Agent → Agent → Player book. The manager sits on top with the
 * whole operation's figure; the tree below shows every member with their credit,
 * their own figure, and (for anyone with a downline) the book they're carrying.
 * The side panel is the manager's tooling to build the book: recruit sub-agents,
 * agents and players, then move them, re-credit them, or suspend them. All money
 * is the shared `core` figure; this view only arranges and reads it.
 */

const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  subagent: 'Sub-Agent',
  agent: 'Agent',
  player: 'Player',
}

/** A member at/over this much of their credit line is flagged as a risk. */
const RISK_AT = 0.8

/** A mutation runner: applies a change, surfaces any rule violation as an error.
 *  Every inline tool goes through this so a blocked move or a credit-waterfall
 *  breach shows a message instead of throwing. */
export type Run = (fn: () => void) => void

export interface ManagementProps {
  /** The shared book (owned by the app's book store — the same org play runs on). */
  org: Org
  /** Apply a mutation to the book, then persist + re-render. Throws propagate. */
  onMutate: (fn: (org: Org) => void) => void
  /** Who you're currently playing as — highlighted in the tree. */
  currentPlayerId?: string | null
  /** Switch the active player from the book (a manager convenience). */
  onPlayAs?: (playerId: string) => void
  /** Settle the whole book AND record it (history + audit ledger + period anchor),
   *  owned by the app. `carryover` records the standings without resetting figures.
   *  When omitted, settlement falls back to a plain (unrecorded) org settle. Throws
   *  propagate so the panel can surface a pending-bet block. */
  onSettleAll?: (carryover?: boolean) => void
  /** Adjust a member's figure (logged) — owned by the app (mutates the book + records
   *  an audited ledger entry with actor + reason). Throws on invalid input; surfaced
   *  in the console error banner. */
  onAdjustFigure?: (memberId: string, delta: number, reason: string) => void
}

export function Management({
  org,
  onMutate,
  currentPlayerId,
  onPlayAs,
  onSettleAll,
  onAdjustFigure,
}: ManagementProps) {
  const [error, setError] = useState<string | null>(null)
  const [settling, setSettling] = useState<Settlement[] | null>(null)
  const [view, setView] = useState<'book' | 'trading'>('book')
  // Which part of the book the manager is looking at. The whole book is the
  // manager (root); focusing an agent/sub-agent scopes the dashboard, tree and
  // report to just their sub-book. Falls back to the whole book if the focused
  // member was removed.
  const [focusRaw, setFocus] = useState<string>(org.managerId)
  // Which member's "Manage" drawer is open. A single id lifted up to here (not
  // per-row state) so it survives the whole-tree re-render that every onMutate
  // triggers — and so only one drawer is ever open, keeping the tree calm.
  const [openId, setOpenId] = useState<string | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  // The player whose profile is open via the lookup search (null = not looking).
  const [lookupId, setLookupId] = useState<string | null>(null)
  const trading = view === 'trading'
  const focusId = org.members[focusRaw] ? focusRaw : org.managerId
  const focus = getMember(org, focusId)
  const isWholeBook = focusId === org.managerId
  // Everyone in the focused scope: the member plus their whole downline.
  const scope = [focus, ...downline(org, focusId)]
  const toggleManage = (id: string) => setOpenId((cur) => (cur === id ? null : id))
  // The player whose profile is showing (null if none / removed).
  const lookupMember = lookupId && org.members[lookupId] ? getMember(org, lookupId) : null
  // Drop a dangling open-drawer / lookup id if that member was removed (the views
  // already fall back on their own; this just keeps the state tidy).
  useEffect(() => {
    if (openId && !org.members[openId]) setOpenId(null)
  }, [org, openId])
  useEffect(() => {
    if (lookupId && !org.members[lookupId]) setLookupId(null)
  }, [org, lookupId])

  const run: Run = (fn) => {
    try {
      onMutate(fn)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // A manager action that isn't a plain org mutation (it also records to the ledger),
  // surfaced through the same error banner as `run`. Undefined if the app didn't wire it.
  const adjust =
    onAdjustFigure &&
    ((memberId: string, delta: number, reason: string) => {
      try {
        onAdjustFigure(memberId, delta, reason)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })

  function applySettlement(carryover: boolean) {
    if (onSettleAll) {
      // app path: settle + persist the record + audit-log it + anchor the next period
      try {
        onSettleAll(carryover)
        setError(null)
        setSettling(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      return
    }
    // fallback: plain (unrecorded) settle — keep the preview open if it's blocked,
    // matching the app path (don't close the panel on a pending-bet error)
    try {
      onMutate((o) => settleOrgWeek(o, { carryover }))
      setError(null)
      setSettling(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={`org ${trading ? 'is-trading' : ''}`}>
      {!trading && <BuildPanel org={org} onMutate={onMutate} />}

      <section className="org-tree">
        {trading ? (
          <>
            <div className="org-modehead">
              <button className="org-toggle" onClick={() => setView('book')}>
                ← Back to the book
              </button>
              <span className="org-modehead-title">Trading desk</span>
            </div>
            <TradingDesk />
          </>
        ) : (
          <>
            <div className="org-modehead">
              {lookupMember ? (
                <button className="org-toggle" onClick={() => setLookupId(null)}>
                  ← Back to the book
                </button>
              ) : (
                <Breadcrumb org={org} focusId={focusId} onFocus={setFocus} />
              )}
              <div className="org-modehead-actions">
                <PlayerSearch org={org} onSelect={setLookupId} />
                {!lookupMember && (
                  <button
                    className={`org-help ${legendOpen ? 'is-on' : ''}`}
                    aria-expanded={legendOpen}
                    aria-controls="org-legend"
                    aria-label="What these figures mean"
                    title="What these figures mean"
                    onClick={() => setLegendOpen((o) => !o)}
                  >
                    ?
                  </button>
                )}
                {!lookupMember && (
                  <button className="org-toggle is-view" onClick={() => setView('trading')}>
                    Trading desk →
                  </button>
                )}
              </div>
            </div>

            {lookupMember ? (
              <>
                <PlayerProfile
                  org={org}
                  member={lookupMember}
                  currentPlayerId={currentPlayerId ?? null}
                  run={run}
                  onPlayAs={onPlayAs}
                />
                {error && <p className="org-banner">{error}</p>}
              </>
            ) : (
              <>
                {legendOpen && <Legend />}

                <ScopeSummary
                  org={org}
                  focus={focus}
                  scope={scope}
                  isWholeBook={isWholeBook}
                  run={run}
                  onSettle={() => setSettling(settlementStatement(org))}
                />

                {error && <p className="org-banner">{error}</p>}

                {settling && (
                  <SettlementPanel
                    statement={settling}
                    onApply={applySettlement}
                    onCancel={() => setSettling(null)}
                  />
                )}

                <TreeNode
                  org={org}
                  member={focus}
                  run={run}
                  currentPlayerId={currentPlayerId ?? null}
                  onPlayAs={onPlayAs}
                  onFocus={setFocus}
                  openId={openId}
                  onToggleManage={toggleManage}
                  onAdjust={adjust ?? undefined}
                />

                <details className="org-report-disclosure">
                  <summary className="org-report-summary">
                    Show flat report — sort by figure, risk &amp; book
                  </summary>
                  <ReportTable
                    org={org}
                    scope={scope}
                    currentPlayerId={currentPlayerId ?? null}
                    onPlayAs={onPlayAs}
                  />
                </details>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/* ----------------------------- settlement ------------------------------- */

function SettlementPanel({
  statement,
  onApply,
  onCancel,
}: {
  statement: Settlement[]
  onApply: (carryover: boolean) => void
  onCancel: () => void
}) {
  const [carryover, setCarryover] = useState(false)
  // Show the chain that actually settles up: sub-agents, agents, then players.
  const lines = statement
    .filter((s) => s.role !== 'manager')
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))
  const manager = statement.find((s) => s.role === 'manager')!

  return (
    <div className="org-settle">
      <div className="org-settle-head">
        <span className="org-settle-title">Weekly settlement preview</span>
        <span className="org-settle-net">
          Net to the book: <FigureText cents={manager.amount} strong />
        </span>
      </div>
      <p className="org-settle-note">
        Each member squares their book up to the level above. Applying rolls every figure up to the
        manager and resets all balances to zero for the new week.
      </p>
      <table className="org-players">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th className="org-num">Settles up</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((s) => (
            <tr key={s.memberId}>
              <td>{s.name}</td>
              <td>{ROLE_LABEL[s.role]}</td>
              <td className="org-num">
                <FigureText cents={s.amount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="org-settle-carry">
        <input
          type="checkbox"
          checked={carryover}
          onChange={(e) => setCarryover(e.target.checked)}
        />
        Carry figures forward — record the standings without resetting (a soft close)
      </label>
      <div className="org-settle-actions">
        <button className="org-toggle" onClick={onCancel}>
          Cancel
        </button>
        <button className="action action-bet org-settle-apply" onClick={() => onApply(carryover)}>
          {carryover ? 'Record & carry forward' : 'Apply & start new week'}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ the org tree ---------------------------- */

/** Children ordered by tier (sub-agents, then agents, then players), then name. */
function orderedChildren(org: Org, id: string): Member[] {
  return directReports(org, id).sort(
    (a, b) => ROLE_TIER[a.role] - ROLE_TIER[b.role] || a.name.localeCompare(b.name),
  )
}

function TreeNode({
  org,
  member,
  run,
  currentPlayerId,
  onPlayAs,
  onFocus,
  openId,
  onToggleManage,
  onAdjust,
}: {
  org: Org
  member: Member
  run: Run
  currentPlayerId: string | null
  onPlayAs?: (playerId: string) => void
  /** Drill the console into a sub-agent's/agent's sub-book. */
  onFocus?: (id: string) => void
  /** Which member's Manage drawer is open (single id, lifted to Management). */
  openId?: string | null
  onToggleManage?: (id: string) => void
  /** Adjust a member's figure (logged). Absent if the app didn't wire it. */
  onAdjust?: (memberId: string, delta: number, reason: string) => void
}) {
  const kids = orderedChildren(org, member.id)
  const hasDownline = kids.length > 0
  const isManager = member.role === 'manager'
  const isPlayer = member.role === 'player'
  const isCurrent = isPlayer && member.id === currentPlayerId
  const locked = isPlayer && !!member.account.bettingLocked
  const pctUsed = Math.round(creditUtilization(member) * 100)
  const atRisk = creditUtilization(member) >= RISK_AT
  const open = openId === member.id

  return (
    <div className={`org-node ${member.active ? '' : 'is-inactive'} ${open ? 'is-open' : ''}`}>
      <div className={`org-row is-${member.role} ${isCurrent ? 'is-current-player' : ''}`}>
        <span className={`org-badge is-${member.role}`}>{ROLE_LABEL[member.role]}</span>
        <span className="org-node-name">
          <NameCell org={org} member={member} run={run} />
          {isCurrent && <span className="org-playing-tag">playing</span>}
        </span>

        {/* the resting row carries ONE figure + at most ONE status chip */}
        <div className="org-row-figs">
          {hasDownline ? (
            <Field label={`Book · ${playerCount(org, member.id)}p`}>
              <FigureText cents={bookFigure(org, member.id)} strong />
            </Field>
          ) : (
            <Field label="Figure">
              <FigureText cents={member.account.balance} />
            </Field>
          )}
          {atRisk ? (
            <span
              className="org-risk"
              title={`Near credit limit — ${pctUsed}% used${locked ? ' · betting locked' : ''}`}
            >
              ⚠ {pctUsed}%{locked ? ' 🔒' : ''}
            </span>
          ) : locked ? (
            <span className="org-locked-tag" title="New bets blocked; open bets still settle">
              locked
            </span>
          ) : null}
        </div>

        {!isManager && (
          <button
            className="org-manage-toggle"
            aria-expanded={open}
            aria-controls={`org-manage-${member.id}`}
            onClick={() => onToggleManage?.(member.id)}
          >
            Manage {open ? '▴' : '▾'}
          </button>
        )}
      </div>

      {open && !isManager && (
        <ManagePanel
          org={org}
          member={member}
          run={run}
          onPlayAs={onPlayAs}
          onFocus={onFocus}
          onAdjust={onAdjust}
          isPlayer={isPlayer}
          hasDownline={hasDownline}
          isCurrent={isCurrent}
          locked={locked}
        />
      )}

      {hasDownline && (
        <div className="org-children">
          {kids.map((k) => (
            <TreeNode
              key={k.id}
              org={org}
              member={k}
              run={run}
              currentPlayerId={currentPlayerId}
              onPlayAs={onPlayAs}
              onFocus={onFocus}
              openId={openId}
              onToggleManage={onToggleManage}
              onAdjust={onAdjust}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The per-member "Manage" drawer — everything that used to crowd the row, grouped
 * by intent and opened on demand. Pure re-parenting of the existing controls
 * (CreditCell / MaxBetCell / MoveControl / the toggles); no new money logic. The
 * destructive actions (Suspend / Remove) get a lightweight two-tap confirm.
 */
function ManagePanel({
  org,
  member,
  run,
  onPlayAs,
  onFocus,
  onAdjust,
  isPlayer,
  hasDownline,
  isCurrent,
  locked,
}: {
  org: Org
  member: Member
  run: Run
  onPlayAs?: (playerId: string) => void
  onFocus?: (id: string) => void
  onAdjust?: (memberId: string, delta: number, reason: string) => void
  isPlayer: boolean
  hasDownline: boolean
  isCurrent: boolean
  locked: boolean
}) {
  // Two-tap confirm for the destructive actions. The drawer only renders while
  // open, so closing it unmounts this and clears any pending confirm.
  const [confirming, setConfirming] = useState<'suspend' | 'remove' | null>(null)
  // Also disarm the moment the operator does anything else to this member (edit
  // credit/max-bet, move, lock, rename, suspend) — so the second tap is always a
  // fresh, deliberate confirmation, never a stale lingering one. The org mutates
  // in place (stable `member` ref), so key the effect on the VALUES that change.
  useEffect(() => setConfirming(null), [
    member.account.balance,
    member.account.creditLimit,
    member.account.maxWager,
    member.name,
    member.parentId,
    member.active,
    member.account.bettingLocked,
  ])
  const canGrant = member.role !== 'player'

  return (
    <div className="org-manage" id={`org-manage-${member.id}`} role="region" aria-label="Manage member">
      <div className="org-manage-group">
        <span className="org-manage-label">Limits</span>
        <div className="org-manage-row">
          <CreditCell org={org} member={member} run={run} />
          {isPlayer && <MaxBetCell org={org} member={member} run={run} />}
          {isPlayer && <MinBetCell org={org} member={member} run={run} />}
          {isPlayer && <MaxPayoutCell org={org} member={member} run={run} />}
          {isPlayer && (
            <Field label="Balance">
              {/* What this player can still bet right now — their credit plus their
                  figure, less anything live. The same number the player sees. */}
              <span className="org-grant">{formatMoney(availableToWager(member.account))}</span>
            </Field>
          )}
          {canGrant && (
            <Field label="To grant">
              <span className="org-grant">{formatMoney(availableCredit(org, member.id))}</span>
            </Field>
          )}
        </div>
      </div>

      {isPlayer && onAdjust && <AdjustFigure member={member} onAdjust={onAdjust} />}

      <div className="org-manage-group">
        <span className="org-manage-label">Move</span>
        <div className="org-manage-row">
          <MoveControl org={org} member={member} run={run} />
        </div>
      </div>

      <div className="org-manage-group">
        <span className="org-manage-label">Status</span>
        <div className="org-manage-row">
          {isPlayer && onPlayAs && member.active && !isCurrent && (
            <button className="org-toggle is-play" onClick={() => onPlayAs(member.id)}>
              Play as
            </button>
          )}
          {!isPlayer && hasDownline && onFocus && (
            <button
              className="org-toggle is-view"
              title="Manage just this part of the book"
              onClick={() => onFocus(member.id)}
            >
              View book
            </button>
          )}
          {isPlayer && (
            <button
              className={`org-toggle ${locked ? 'is-locked' : ''}`}
              title={
                locked
                  ? 'Unlock — let this player place bets again'
                  : 'Lock — stop new bets (open bets still settle)'
              }
              onClick={() => run(() => setBettingLocked(org, member.id, !locked))}
            >
              {locked ? 'Unlock betting' : 'Lock betting'}
            </button>
          )}
          {member.active ? (
            <button
              className={`org-toggle ${confirming === 'suspend' ? 'is-confirm' : ''}`}
              title="Suspend — take them off the book (can’t be played as or recruited under)"
              onClick={() => {
                if (confirming === 'suspend') {
                  run(() => setActive(org, member.id, false))
                  setConfirming(null)
                } else setConfirming('suspend')
              }}
            >
              {confirming === 'suspend' ? 'Confirm suspend' : 'Suspend'}
            </button>
          ) : (
            <button
              className="org-toggle is-off"
              title="Activate — put them back on the book"
              onClick={() => run(() => setActive(org, member.id, true))}
            >
              Activate
            </button>
          )}
          <button
            className={`org-toggle is-remove ${confirming === 'remove' ? 'is-confirm' : ''}`}
            title="Remove from the book (must be settled, with no downline)"
            onClick={() => {
              if (confirming === 'remove') {
                run(() => removeMember(org, member.id))
                setConfirming(null)
              } else setConfirming('remove')
            }}
          >
            {confirming === 'remove' ? 'Confirm remove' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Inline, click-to-edit member name. Commits on Enter/blur; reverts if blank. */
function NameCell({ org, member, run }: { org: Org; member: Member; run: Run }) {
  const [draft, setDraft] = useState(member.name)
  useEffect(() => setDraft(member.name), [member.name])
  const commit = () => {
    const next = draft.trim()
    if (next && next !== member.name) run(() => renameMember(org, member.id, next))
    else setDraft(member.name)
  }
  return (
    <input
      className="org-name-input"
      value={draft}
      aria-label="Member name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(member.name)
      }}
    />
  )
}

/**
 * A dollar field that edits to a draft and only commits on blur/Enter — so a
 * multi-digit entry like "500" isn't briefly persisted as $5 then $50 (and an
 * empty/zero entry clears to null rather than flickering the value live). Mirrors
 * NameCell's pattern; shared by the credit and max-bet cells.
 */
function NumberCell({
  label,
  cents,
  placeholder,
  run,
  onCommit,
}: {
  label: string
  cents: number | null
  placeholder?: string
  run: Run
  onCommit: (centsOrNull: number | null) => void
}) {
  const text = (c: number | null) => (c != null ? String(c / 100) : '')
  const [draft, setDraft] = useState(text(cents))
  useEffect(() => setDraft(text(cents)), [cents])
  const commit = () => {
    const v = draft.trim()
    onCommit(v === '' || Number(v) === 0 ? null : toCents(Number(v)))
  }
  return (
    <Field label={label}>
      <span className="org-credit">
        <span className="org-credit-prefix">$</span>
        <input
          className="org-credit-input"
          type="number"
          min={0}
          step={50}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => run(commit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setDraft(text(cents))
          }}
        />
      </span>
    </Field>
  )
}

/** Post a manual figure adjustment — a re-credit, comp, or correction (players only).
 *  A reason is required and the move is logged to the audit trail via the durable
 *  ledger. The amount is signed dollars (negative = a debit), so it uses the
 *  sign-preserving `toSignedCents` (NOT the stake-oriented `toCents`, which clamps ≥ 0). */
export function AdjustFigure({
  member,
  onAdjust,
}: {
  member: Member
  onAdjust: (memberId: string, delta: number, reason: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const dollars = Number(amount)
  const valid =
    amount.trim() !== '' && Number.isFinite(dollars) && dollars !== 0 && reason.trim() !== ''
  function apply() {
    if (!valid) return
    onAdjust(member.id, toSignedCents(dollars), reason.trim())
    setAmount('')
    setReason('')
  }
  return (
    <div className="org-manage-group">
      <span className="org-manage-label">Adjust figure</span>
      <div className="org-adjust">
        <input
          className="org-adjust-amt"
          type="number"
          step={10}
          placeholder="±$ amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) apply()
          }}
        />
        <input
          className="org-adjust-reason"
          type="text"
          placeholder="Reason (logged)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) apply()
          }}
        />
        <button className="org-adjust-apply" disabled={!valid} onClick={apply}>
          Apply
        </button>
      </div>
      <span className="org-adjust-hint">A re-credit, comp, or correction — logged with its reason.</span>
    </div>
  )
}

/** Inline credit-limit editor — the lever the level above pulls. */
function CreditCell({ org, member, run }: { org: Org; member: Member; run: Run }) {
  return (
    <NumberCell
      label="Credit"
      cents={member.account.creditLimit}
      run={run}
      onCommit={(c) => setCreditLimit(org, member.id, c ?? 0)}
    />
  )
}

/** Inline per-head max-bet editor (players only). Empty / 0 clears the cap (∞). */
function MaxBetCell({ org, member, run }: { org: Org; member: Member; run: Run }) {
  return (
    <NumberCell
      label="Max bet"
      cents={member.account.maxWager ?? null}
      placeholder="∞"
      run={run}
      onCommit={(c) => setMaxWager(org, member.id, c)}
    />
  )
}

/** Inline per-head min-bet editor (players only). Empty / 0 clears the floor. */
function MinBetCell({ org, member, run }: { org: Org; member: Member; run: Run }) {
  return (
    <NumberCell
      label="Min bet"
      cents={member.account.minWager ?? null}
      placeholder="—"
      run={run}
      onCommit={(c) => setMinWager(org, member.id, c)}
    />
  )
}

/** Inline per-head max-payout editor (players only) — the most a win may profit.
 *  Empty / 0 clears the cap (∞). */
function MaxPayoutCell({ org, member, run }: { org: Org; member: Member; run: Run }) {
  return (
    <NumberCell
      label="Max payout"
      cents={member.account.maxPayout ?? null}
      placeholder="∞"
      run={run}
      onCommit={(c) => setMaxPayout(org, member.id, c)}
    />
  )
}

/** Move a member (and their downline) under a new, higher-tier parent. */
function MoveControl({ org, member, run }: { org: Org; member: Member; run: Run }) {
  const options = eligibleParents(org, member.role).filter((p) => p.id !== member.id)
  return (
    <label className="org-move">
      <span className="org-move-label">Under</span>
      <select
        className="org-move-select"
        value={member.parentId ?? ''}
        onChange={(e) => {
          const newParent = e.target.value
          run(() => reassign(org, member.id, newParent))
        }}
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/* -------------------------------- report -------------------------------- */

type SortKey = 'name' | 'figure' | 'book' | 'risk'

/** A flat, sortable book report — every member at a glance, ranked by figure
 *  (biggest winners/losers), risk, or book. The operator's "weekly figures" view
 *  alongside the tree. */
function ReportTable({
  org,
  scope,
  currentPlayerId,
  onPlayAs,
}: {
  org: Org
  /** Members in the focused scope (the member + downline); the report lists these. */
  scope: Member[]
  currentPlayerId: string | null
  onPlayAs?: (playerId: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'figure', dir: -1 })
  const rows = scope.filter((m) => m.role !== 'manager')

  const sorted = [...rows].sort((a, b) => {
    const d = sort.dir
    switch (sort.key) {
      case 'name':
        return d * a.name.localeCompare(b.name)
      case 'risk':
        return d * (creditUtilization(a) - creditUtilization(b))
      case 'book':
        return d * (bookFigure(org, a.id) - bookFigure(org, b.id))
      default:
        return d * (a.account.balance - b.account.balance)
    }
  })

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : '')
  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <button className="org-sort" onClick={() => toggle(k)}>
      {label}
      {arrow(k)}
    </button>
  )

  return (
    <div className="org-report">
      <table className="org-players org-report-table">
        <thead>
          <tr>
            <th>
              <SortTh k="name" label="Member" />
            </th>
            <th>Role</th>
            <th>Under</th>
            <th className="org-num">Credit</th>
            <th className="org-num">
              <SortTh k="figure" label="Figure" />
            </th>
            <th className="org-num">
              <SortTh k="book" label="Book" />
            </th>
            <th className="org-num">
              <SortTh k="risk" label="Risk" />
            </th>
            <th className="org-num">Max bet</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const util = creditUtilization(m)
            const hasKids = directReports(org, m.id).length > 0
            const isPlayer = m.role === 'player'
            const isCurrent = isPlayer && m.id === currentPlayerId
            return (
              <tr
                key={m.id}
                className={`${m.active ? '' : 'is-inactive'} ${isCurrent ? 'is-current-player' : ''}`}
              >
                <td>
                  {m.name}
                  {isCurrent && <span className="org-playing-tag">playing</span>}
                </td>
                <td>{ROLE_LABEL[m.role]}</td>
                <td className="org-report-under">
                  {m.parentId ? getMember(org, m.parentId).name : '—'}
                </td>
                <td className="org-num">{formatMoney(m.account.creditLimit)}</td>
                <td className="org-num">
                  <FigureText cents={m.account.balance} />
                </td>
                <td className="org-num">
                  {hasKids ? <FigureText cents={bookFigure(org, m.id)} strong /> : '—'}
                </td>
                <td className={`org-num ${util >= RISK_AT ? 'org-risk-cell' : ''}`}>
                  {m.account.creditLimit > 0 ? `${Math.round(util * 100)}%` : '—'}
                </td>
                <td className="org-num">
                  {isPlayer ? (m.account.maxWager != null ? formatMoney(m.account.maxWager) : '∞') : '—'}
                </td>
                <td>
                  {!m.active ? (
                    <span className="org-status is-suspended">Suspended</span>
                  ) : m.account.bettingLocked ? (
                    <span className="org-status is-locked">Locked</span>
                  ) : (
                    <span className="org-status is-ok">Open</span>
                  )}
                </td>
                <td className="org-num">
                  {isPlayer && onPlayAs && m.active && !isCurrent && (
                    <button className="org-toggle is-play" onClick={() => onPlayAs(m.id)}>
                      Play as
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------ build panel ----------------------------- */

const BUILDABLE: Role[] = ['subagent', 'agent', 'player']

function BuildPanel({
  org,
  onMutate,
}: {
  org: Org
  onMutate: (fn: (org: Org) => void) => void
}) {
  const [role, setRole] = useState<Role>('player')
  const [name, setName] = useState('')
  const [credit, setCredit] = useState(20_000) // cents ($200)
  const [parentId, setParentId] = useState(org.managerId)
  const [error, setError] = useState<string | null>(null)

  const parents = eligibleParents(org, role)
  // Keep the parent valid when the role changes (a sub-agent can only go under
  // the manager, etc.); fall back to the manager.
  const effectiveParent = parents.some((p) => p.id === parentId) ? parentId : org.managerId

  function onRole(next: Role) {
    setRole(next)
    const ps = eligibleParents(org, next)
    if (!ps.some((p) => p.id === parentId)) setParentId(org.managerId)
  }

  function add() {
    setError(null)
    const n = name.trim()
    if (!n) return setError(`Give the ${ROLE_LABEL[role].toLowerCase()} a name.`)
    try {
      onMutate((o) => addMember(o, role, effectiveParent, { name: n, creditLimit: credit }))
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="org-panel">
      <h3 className="org-panel-title">Build the book</h3>

      <div className="field">
        <span className="field-label">Add a…</span>
        <div className="org-roletabs">
          {BUILDABLE.map((r) => (
            <button
              key={r}
              className={`chip ${role === r ? 'is-on' : ''}`}
              onClick={() => onRole(r)}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="field-input"
          value={name}
          placeholder={`New ${ROLE_LABEL[role].toLowerCase()}`}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Under</span>
        <select
          className="field-input"
          value={effectiveParent}
          onChange={(e) => setParentId(e.target.value)}
        >
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({ROLE_LABEL[p.role].toLowerCase()})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Credit limit</span>
        <div className="field-bet">
          <span className="field-prefix">$</span>
          <input
            className="field-input"
            type="number"
            min={0}
            step={50}
            value={credit / 100}
            onChange={(e) => setCredit(toCents(Number(e.target.value)))}
          />
        </div>
      </label>

      <button className="action action-bet" onClick={add}>
        Add {ROLE_LABEL[role].toLowerCase()}
      </button>

      {error && <p className="org-error">{error}</p>}

      <p className="org-panel-note">
        Sub-agents sit under the manager, agents under sub-agents or the manager, and players under
        anyone above them.
      </p>
    </section>
  )
}

/* ------------------------- scope: breadcrumb + summary ------------------ */

/** Where in the book the manager is standing — Whole book › Sub-Agent › Agent.
 *  Each crumb refocuses the console there. Doubles as the section title. */
function Breadcrumb({
  org,
  focusId,
  onFocus,
}: {
  org: Org
  focusId: string
  onFocus: (id: string) => void
}) {
  const path: Member[] = []
  let cur: Member | undefined = org.members[focusId]
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? org.members[cur.parentId] : undefined
  }
  return (
    <nav className="org-crumbs" aria-label="Which part of the book">
      <span className="org-crumbs-label">Managing</span>
      {path.map((m, i) => {
        const last = i === path.length - 1
        const label = m.role === 'manager' ? 'Whole book' : m.name
        return (
          <span key={m.id} className="org-crumb-wrap">
            {i > 0 && <span className="org-crumb-sep">›</span>}
            {last ? (
              <span className="org-crumb is-current">{label}</span>
            ) : (
              <button className="org-crumb" onClick={() => onFocus(m.id)}>
                {label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/** The manager's dashboard for whatever part of the book is in focus: how many
 *  players, how many are locked, who's at risk, what's live on the table
 *  (exposure), and the book's figure — plus the levers that act on this scope. */
function ScopeSummary({
  org,
  focus,
  scope,
  isWholeBook,
  run,
  onSettle,
}: {
  org: Org
  focus: Member
  scope: Member[]
  isWholeBook: boolean
  run: Run
  onSettle: () => void
}) {
  const players = scope.filter((m) => m.role === 'player')
  const lockedCount = players.filter((p) => p.account.bettingLocked).length
  const exposure = bookPending(org, focus.id)
  const figure = bookFigure(org, focus.id)
  const allLocked = players.length > 0 && lockedCount === players.length

  // One headline figure (the book's standing) leads; Players and live Exposure
  // support it. Per-member risk/locked counts live on the rows themselves now,
  // so the dashboard stops restating them.
  return (
    <div className="org-summary">
      <div className="org-summary-headline">
        <span className="org-summary-headline-label">
          {isWholeBook ? 'Book figure' : `${focus.name}’s book`}
        </span>
        <FigureText cents={figure} strong />
      </div>
      <Stat label="Players" value={String(players.length)} />
      <Stat label="Exposure (live bets)" value={formatMoney(exposure)} />
      <div className="org-summary-actions">
        {players.length > 0 && (
          <button
            className={`org-toggle ${allLocked ? 'is-locked' : 'is-freeze'}`}
            title={
              allLocked
                ? 'Let every player in this book place bets again'
                : 'Stop every player in this book from placing new bets (open bets still settle)'
            }
            onClick={() => run(() => setBookBettingLocked(org, focus.id, !allLocked))}
          >
            {allLocked ? 'Unlock book' : 'Freeze book'}
          </button>
        )}
        {isWholeBook && (
          <button className="org-settle-btn" onClick={onSettle}>
            Weekly settlement →
          </button>
        )}
      </div>
    </div>
  )
}

/** Plain-language key to the figures/controls, so the console reads clearly to a
 *  sportsbook manager. Shown on demand from the header "?" button. */
function Legend() {
  return (
    <div className="org-legend" id="org-legend" role="region" aria-label="What these figures mean">
      <ul className="org-legend-list">
        <li>
          <strong>Figure</strong> — a member’s running win/loss this week.{' '}
          <span className="org-figure is-up">+</span> the book owes them;{' '}
          <span className="org-figure is-down">−</span> they owe the book.
        </li>
        <li>
          <strong>Book</strong> — a member’s figure plus everyone beneath them: what their whole
          sub-book is up or down.
        </li>
        <li>
          <strong>Credit</strong> — how far they can go down before they settle. <strong>To grant</strong>{' '}
          is what’s left for them to hand to their own people.
        </li>
        <li>
          <strong>Balance</strong> — what a player can still bet right now: their credit plus their
          figure, less anything live. The same number the player sees.
        </li>
        <li>
          <strong>Exposure</strong> — points live in ungraded bets right now (money on the table).
        </li>
        <li>
          <strong>Risk</strong> — how much of a credit line is already used; ⚠ flags anyone near it.
        </li>
        <li>
          <strong>Max bet</strong> caps a single wager. <strong>Lock</strong> stops a player’s new bets
          (open bets still settle); <strong>Suspend</strong> takes a member off the book entirely.
        </li>
      </ul>
    </div>
  )
}

/* -------------------------------- bits ---------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="org-field">
      <span className="org-field-label">{label}</span>
      {children}
    </div>
  )
}

function Stat({ label, value, figure }: { label: string; value?: string; figure?: number }) {
  return (
    <div className="org-stat">
      <span className="org-stat-label">{label}</span>
      {figure != null ? (
        <FigureText cents={figure} strong />
      ) : (
        <span className="org-stat-value">{value}</span>
      )}
    </div>
  )
}

/** A figure from the player's perspective: positive (book owes the player) reads
 *  green/up; negative (player owes the book) reads red/down. */
function FigureText({ cents, strong }: { cents: number; strong?: boolean }) {
  const cls = cents > 0 ? 'is-up' : cents < 0 ? 'is-down' : 'is-even'
  return (
    <span className={`org-figure ${cls} ${strong ? 'is-strong' : ''}`}>
      {cents > 0 ? '+' : ''}
      {formatMoney(cents)}
    </span>
  )
}
