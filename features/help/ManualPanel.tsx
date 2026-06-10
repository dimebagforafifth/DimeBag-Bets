/**
 * Operator Manual — a Control-section app that explains how every part of the
 * management console works, in plain language. A table of contents on the left
 * switches between short, scannable chapters on the right; key terms carry the same
 * hover tooltips used across the console (one glossary, no drift). Pure docs — it
 * reads nothing and moves no money.
 */
import { useState, type ReactNode } from 'react'
import { PanelShell } from '../_desk/shared.js'
import { Term } from '../_desk/Tooltip.js'
import './help.css'

interface Chapter {
  id: string
  title: string
  body: ReactNode
}

const CHAPTERS: Chapter[] = [
  {
    id: 'overview',
    title: 'Overview',
    body: (
      <>
        <p className="mdsk-manual-lead">
          The management console is the operator’s back office for running the book. It’s a grid of
          single-purpose “apps” grouped into four sections. Open a tile to work in it; “All apps”
          returns to the grid.
        </p>
        <ul>
          <li>
            <strong>Operations</strong> — the day-to-day money: figures, exposure, the ledger, and
            settling the week.
          </li>
          <li>
            <strong>Players</strong> — accounts: look-ups, the cashier window, limits, VIP, notes.
          </li>
          <li>
            <strong>Catalog</strong> — what you offer: sportsbook lines, casino config, manual
            tickets, scores.
          </li>
          <li>
            <strong>Control</strong> — the book itself: analytics, roles &amp; access, settings,
            branding, and this manual.
          </li>
        </ul>
        <p>
          Everything is denominated in <strong>coins</strong> — a closed loop of points, never real
          money. A “$” is only how a figure is displayed.
        </p>
      </>
    ),
  },
  {
    id: 'money',
    title: 'The money model',
    body: (
      <>
        <p>
          Every player has one account on a shared credit system. Four numbers describe it:
        </p>
        <ul>
          <li>
            <Term id="figure">Figure</Term> (balance) — their running win/loss for the period. Up =
            the book owes them; down = they owe the book.
          </li>
          <li>
            <Term id="credit-limit">Credit limit</Term> — how far down they’re allowed to go.
          </li>
          <li>
            <Term id="pending">Pending</Term> — stake locked on bets not yet graded.
          </li>
          <li>
            <Term id="available">Available to wager</Term> — credit limit + figure − pending.
          </li>
        </ul>
        <p>
          Across all players, the <Term id="book-figure">book figure</Term> is the inverse of the
          sum of player figures — the book’s net for the period. The total at risk on open bets is{' '}
          <Term id="exposure">exposure</Term>.
        </p>
      </>
    ),
  },
  {
    id: 'lifecycle',
    title: 'Wager lifecycle',
    body: (
      <>
        <p>Every bet — casino or sportsbook — moves through the same three steps:</p>
        <ul>
          <li>
            <strong>Place</strong> — the stake is validated against available-to-wager and held in{' '}
            <Term id="pending">pending</Term>.
          </li>
          <li>
            <strong>Grade</strong> — when the result is known the bet is marked won, lost,{' '}
            <Term id="push">push</Term>, or <Term id="void">void</Term>.
          </li>
          <li>
            <strong>Adjust</strong> — the hold is released and the figure moves: a win adds the
            profit, a loss subtracts the stake, a push/void returns the stake (no change).
          </li>
        </ul>
        <p>
          This all runs through the shared core, so limits, locks, and the ledger always apply — no
          tool edits a balance directly.
        </p>
      </>
    ),
  },
  {
    id: 'weekly-sheet',
    title: 'Weekly Sheet',
    body: (
      <>
        <p>
          The by-day win/loss grid. Each row is a player; the day columns are that day’s realized
          net, and <strong>Weekly total</strong> is their live <Term id="figure">figure</Term>.
        </p>
        <ul>
          <li>
            The <strong>Settle</strong> column reads the direction to square up:{' '}
            <Term id="owed">Pay player</Term> (they’re up) or <Term id="owes">Collect</Term>{' '}
            (they’re down).
          </li>
          <li>Filter chips narrow to players with a balance, who owe, or who are owed.</li>
          <li>Sort by figure or by <Term id="exposure">exposure</Term>; export the sheet to CSV.</li>
          <li>
            <strong>Settle all…</strong> closes the whole book at once (see Settlement).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'cashier',
    title: 'Cashier',
    body: (
      <>
        <p>The coin window. Pull up a player, choose an action, and preview the result before committing:</p>
        <ul>
          <li>
            <Term id="grant">Grant</Term> adds coins; <Term id="deduct">Deduct</Term> removes them;{' '}
            <Term id="set">Set</Term> lands the figure on an exact amount.
          </li>
          <li>The live preview shows the figure the move would land on, before you commit.</li>
          <li>
            Stage several moves in a batch, eyeball the <Term id="net-to-book">net to the book</Term>
            , then confirm them together.
          </li>
          <li>Every move requires a reason and is recorded to the ledger and the audit trail.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'settlement',
    title: 'Settlement',
    body: (
      <>
        <p>The weekly close, end to end:</p>
        <ul>
          <li>
            <strong>Preview</strong> who’s up and who’s down, with the whole-book net.
          </li>
          <li>
            <strong>Lock</strong> the sheet — figures are frozen at review time so you settle exactly
            what you saw.
          </li>
          <li>
            <strong>Settle</strong> — a hard close records the sheet and resets every figure to zero;
            a <Term id="carryover">soft close</Term> records it but carries figures forward.
          </li>
          <li>
            Settling is refused while any bet is still pending — the{' '}
            <Term id="pending-guard">pending guard</Term>. Grade or void open bets first.
          </li>
          <li>Each close is archived to the settlement history, where you can mark it collected.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ledger',
    title: 'Ledger',
    body: (
      <>
        <p>
          The full, durable record of every coin movement — read-only and exportable. Four kinds of
          entry:
        </p>
        <ul>
          <li>
            <strong>resolve</strong> — a graded bet (carries the game/outcome and links to its
            wager).
          </li>
          <li>
            <strong>adjust</strong> — a cashier move (carries the operator and the reason).
          </li>
          <li>
            <strong>settle</strong> — a weekly close (links to its settlement record).
          </li>
          <li>
            <strong>place</strong> — reserved for stake holds.
          </li>
        </ul>
        <p>Filter by player, type, or date range, and export the filtered view to CSV or JSON.</p>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Roles',
    body: (
      <>
        <p>There are two roles:</p>
        <ul>
          <li>
            <strong>Manager</strong> — full access to this console: cashier, settlement, risk,
            catalog, and control.
          </li>
          <li>
            <strong>Player</strong> — the front-of-house app (casino + sportsbook) on the same shared
            balance. Players never see the console.
          </li>
        </ul>
        <p>Money actions are attributed to the signed-in operator for the audit trail.</p>
      </>
    ),
  },
  {
    id: 'tour',
    title: 'Tour of the tiles',
    body: (
      <>
        <p className="mdsk-manual-lead">Every app in the console, by section.</p>
        <h2 className="feat-h2">Operations</h2>
        <ul>
          <li><strong>Weekly Sheet / Weekly Figures</strong> — coins won/lost + the settle figure.</li>
          <li><strong>Settlement Run / Settle Period / Settlements</strong> — preview, close, and archive the week.</li>
          <li><strong>Ledger / Transactions</strong> — the full coin ledger.</li>
          <li><strong>Pending Bets</strong> — open tickets awaiting grade.</li>
          <li><strong>Live Activity</strong> — a real-time bet ticker.</li>
          <li><strong>Risk &amp; Exposure</strong> — hold, exposure, winners &amp; losers.</li>
          <li><strong>Alerts</strong> — exposure, big wins &amp; large positions.</li>
        </ul>
        <h2 className="feat-h2">Players</h2>
        <ul>
          <li><strong>Cashier Desk / Cashier</strong> — issue &amp; adjust coin balances.</li>
          <li><strong>Player Admin</strong> — look up accounts, standing, and play history.</li>
          <li><strong>Add Player</strong> — onboard a new account.</li>
          <li><strong>Limits</strong> — per-player wager caps.</li>
          <li><strong>VIP Program / Loyalty / Segments</strong> — tiers, rewards, and cohorts.</li>
          <li><strong>Messaging / Notes &amp; Tags / Promotions</strong> — outreach and CRM.</li>
        </ul>
        <h2 className="feat-h2">Catalog</h2>
        <ul>
          <li><strong>Sportsbook Lines</strong> — markets, odds, holds.</li>
          <li><strong>Casino Admin</strong> — game config &amp; RTP.</li>
          <li><strong>Manual Ticket</strong> — write a bet by hand.</li>
          <li><strong>Scores</strong> — results &amp; auto-grading.</li>
          <li><strong>Rewards</strong> — missions, wheel, XP.</li>
        </ul>
        <h2 className="feat-h2">Control</h2>
        <ul>
          <li><strong>Analytics</strong> — book health &amp; trends.</li>
          <li><strong>Roles &amp; Access / Sessions</strong> — permissions and login review.</li>
          <li><strong>Settings / Branding / Setup</strong> — tenant config, white-label, new-book wizard.</li>
          <li><strong>Copilot</strong> — advisory insights on your book.</li>
          <li><strong>Operator Manual</strong> — this guide.</li>
        </ul>
      </>
    ),
  },
]

export function ManualPanel({ onBack }: { onBack: () => void }) {
  const [active, setActive] = useState(CHAPTERS[0].id)
  const chapter = CHAPTERS.find((c) => c.id === active) ?? CHAPTERS[0]

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          How every part of the management console works — pick a chapter. Hover a dotted term for a
          quick definition.
        </p>
      </header>

      <div className="mdsk-manual">
        <nav className="mdsk-manual-toc" aria-label="Manual chapters">
          {CHAPTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === active ? 'is-on' : ''}
              aria-current={c.id === active ? 'true' : undefined}
              onClick={() => setActive(c.id)}
            >
              {c.title}
            </button>
          ))}
        </nav>
        <article className="mdsk-manual-body" aria-label={chapter.title}>
          <h2 className="feat-h2">{chapter.title}</h2>
          {chapter.body}
        </article>
      </div>
    </PanelShell>
  )
}
