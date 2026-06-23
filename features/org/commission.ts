/**
 * Agent commission models — how a sub-agent/agent gets PAID for the action they bring.
 *
 * The book runs all the risk against players; agents earn a cut of how their roster runs.
 * Three canonical Pay-Per-Head models, modelled on what real PPH shops offer:
 *
 *   • SPLIT        — the agent takes `pct%` of the player figure, win OR lose. When the
 *                    roster loses (book wins), the agent earns; when the roster wins (book
 *                    loses), the agent SHARES the loss (commission goes negative). A true
 *                    partnership split.
 *   • PROFIT SHARE — the agent takes `pct%` of net player LOSSES only; nothing on a losing
 *                    (for the book) week. No downside for the agent. (This is the legacy
 *                    `commissionPct` behaviour.)
 *   • REDLINE      — "make-up": a losing week (book loses to the roster) banks a negative
 *                    carryover the agent must clear before earning again. The agent earns
 *                    `pct%` only of what's left AFTER the red figure is paid back.
 *
 * All math is in integer CENTS and is PURE — nothing here moves money. `org.settleOrgWeek`
 * calls it at the weekly square-up and (for redline) persists the updated carryover. The
 * "roster net" passed in is always from the BOOK's point of view: positive = the book (and
 * so the agent) won off the roster this week; negative = the roster beat the book.
 */

export type CommissionModel = 'split' | 'profit_share' | 'redline'

/** An agent's / master agent's commission arrangement. Players and the manager carry none. */
export interface CommissionConfig {
  model: CommissionModel
  /** Percent (0–100) of the relevant base the agent keeps. */
  pct: number
  /**
   * REDLINE only: the running red-figure carryover in CENTS, ≤ 0 (0 = clean slate, more
   * negative = deeper in the red). `settleOrgWeek` advances it each week. Ignored by the
   * other two models.
   */
  carryoverCents?: number
}

/** The result of grading one agent-week under their model. Pure — the caller applies it. */
export interface CommissionResult {
  model: CommissionModel
  /** Commission earned in cents. NEGATIVE only under SPLIT, when the roster beat the book. */
  commissionCents: number
  /** The carryover AFTER this week (REDLINE advances it; the others pass it through, ≤ 0). */
  carryoverCents: number
  /** The roster net used, book POV (positive = book won off the roster), in cents. */
  rosterNetCents: number
}

const clampPct = (pct: number): number => Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0))

/**
 * Grade one agent-week. `rosterNetCents` is the book's net off this agent's roster
 * (positive = the roster lost, the book won). Returns the commission earned and, for
 * REDLINE, the advanced carryover. Pure: no member or account is touched here.
 */
export function computeCommission(
  config: CommissionConfig,
  rosterNetCents: number,
): CommissionResult {
  const pct = clampPct(config.pct)
  const prior = Math.min(0, Math.round(config.carryoverCents ?? 0)) // red is never positive
  const net = Math.round(rosterNetCents)

  switch (config.model) {
    case 'split':
      // Partnership: a flat cut of the figure, either direction.
      return {
        model: 'split',
        commissionCents: Math.round((net * pct) / 100),
        carryoverCents: 0,
        rosterNetCents: net,
      }

    case 'profit_share':
      // The book's win off the roster only; nothing when the roster is up.
      return {
        model: 'profit_share',
        commissionCents: Math.round((Math.max(0, net) * pct) / 100),
        carryoverCents: 0,
        rosterNetCents: net,
      }

    case 'redline': {
      // Make-up: clear the red figure first, then earn pct% of what's left.
      const running = prior + net
      if (running <= 0) {
        return {
          model: 'redline',
          commissionCents: 0,
          carryoverCents: running,
          rosterNetCents: net,
        }
      }
      return {
        model: 'redline',
        commissionCents: Math.round((running * pct) / 100),
        carryoverCents: 0, // the red cleared; profit taken, slate reset
        rosterNetCents: net,
      }
    }
  }
}

/** Human label for a model (UI + statements). */
export function commissionModelLabel(model: CommissionModel): string {
  switch (model) {
    case 'split':
      return 'Split'
    case 'profit_share':
      return 'Profit share'
    case 'redline':
      return 'Redline (make-up)'
  }
}

/** Type guard for a model string (validating UI / persisted input). */
export function isCommissionModel(value: unknown): value is CommissionModel {
  return value === 'split' || value === 'profit_share' || value === 'redline'
}
