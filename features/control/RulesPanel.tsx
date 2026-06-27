import { PanelShell } from './shared.js'

/**
 * Rules — the house rules / grading & settlement policy, shown plainly in-app
 * (CLAUDE.md §2.4 "honest by default" + §4). This is the operator-facing reference for
 * how bets are accepted, when a game counts, how pushes/voids/parlays grade, the limits,
 * and how the figure squares up weekly — the same policy a player is entitled to see,
 * not buried. Where a rule is a LIVE lever (caps, suspensions, the credit line), it
 * points at the console tool that sets it. No money moves here; pure reference.
 */

interface RuleSection {
  title: string
  body: string
  points: string[]
}

const SECTIONS: RuleSection[] = [
  {
    title: 'Bet acceptance',
    body: 'A bet locks at the odds and line shown when it is confirmed.',
    points: [
      'Line moves after acceptance do not change a confirmed bet.',
      'If the line moves mid-placement, the ticket is re-offered to re-confirm.',
      'Obvious (“palpable”) errors — clearly wrong prices or lines — may be voided or re-settled at the correct price.',
    ],
  },
  {
    title: 'Official games',
    body: 'A sportsbook bet only stands once the game goes far enough to be official; otherwise it voids and the stake is returned.',
    points: [
      'NFL: full game. NBA: 43 of 48 minutes.',
      'MLB: an official game (5 innings / 4½ if home leads) for moneyline; full 9 (8½) for run line and totals.',
      'NHL & soccer: full regulation.',
    ],
  },
  {
    title: 'Pushes',
    body: 'An exact tie on a spread or total returns the stake — no win, no loss.',
    points: [
      'Half-point lines cannot push.',
      'A push leg drops out of a parlay, which re-prices on the remaining legs.',
    ],
  },
  {
    title: 'Voids & cancellations',
    body: 'Affected bets void and the stake is returned when the event does not properly take place.',
    points: [
      'Postponed and not replayed within the week.',
      'Abandoned before becoming official.',
      'A player non-starter voids that player’s props.',
    ],
  },
  {
    title: 'Parlays',
    body: 'Every leg must win; a single losing leg loses the parlay.',
    points: [
      'A void or push leg drops out and the parlay re-prices on the rest — down to a straight bet if only one remains.',
      'Maximum parlay price is about 299-to-1.',
      'Related contingencies cannot be combined on one parlay.',
    ],
  },
  {
    title: 'Live betting',
    body: 'In-play bets carry a short acceptance delay.',
    points: [
      'If a scoring event lands while a bet is pending, it may be rejected or re-offered at new odds.',
      'A bet confirmed before the event stands.',
    ],
  },
  {
    title: 'Limits & max payout',
    body: 'Per-bet and per-market limits apply, and a maximum payout caps a single ticket.',
    points: [
      'Stakes above a market’s limit may be scaled back.',
      'The credit limit is the hard cap on how far an account can be down.',
      'Set per-player caps in Limits, market limits & suspensions in Sportsbook Lines, and the credit line in Customer Admin.',
    ],
  },
  {
    title: 'Settlement & disputes',
    body: 'Bets grade from official results as soon as they are available and reflect immediately in the figure.',
    points: [
      'Accounts square up weekly — negatives pay in, positives get paid, then every figure resets to zero.',
      'Official results are the source of truth; settlement may pause pending documentation.',
      'Run the weekly close from Settle Period; review the collect/pay split in Collections.',
    ],
  },
]

export function RulesPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <h1 className="feat-h1">House rules</h1>
        <p className="feat-sub">
          How bets are accepted and graded, when a game counts, the limits, and how the figure
          squares up each week. Shown plainly — the same policy a player is entitled to see. Where a
          rule is a live lever, it names the tool that sets it.
        </p>
      </header>

      <div className="feat-grid">
        {SECTIONS.map((s) => (
          <section key={s.title} className="feat-card" aria-label={s.title}>
            <h2 className="feat-h2">{s.title}</h2>
            <p className="feat-sub">{s.body}</p>
            <ul className="feat-list">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="feat-sub">
        These are PlayStadium house rules, modelled on what major regulated books publish. Points
        are for play only — no buy-in and no cash-out — so a figure is a running standing, never
        real money.
      </p>
    </PanelShell>
  )
}
