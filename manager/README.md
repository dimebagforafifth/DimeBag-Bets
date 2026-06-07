# `manager/` — growth, configuration & insight layer

The operator-facing layer that sits **on top of** the book: reporting, promotions,
communication, branding/white-label, presentation settings, and an (advisory-only)
AI Copilot. It is one workstream, separate from the shell/nav and from the shared
data models.

## Hard rules (ownership boundaries)

- **Read the shared models; never redefine them.** `core/` (Account/Wager + money
  fns), `org/` (the agent↔player tree + credit/limit/lock/settlement helpers),
  `ledger/`, `persistence/`, `vip/` are all READ-ONLY here. Money moves **only**
  through `core` (and the future `core.grant()` for bonuses).
- **Don't touch the shell/nav.** `app/App.tsx` (the `Section` enum, routing,
  header) and `app/games.ts` belong to the shell workstream. This layer ships
  **self-contained page components**; the shell mounts them and owns the nav.
- **Persist through `persistence/`** under the shared `'dimebag'` namespace with a
  versioned `persistedDoc` — never a second storage path.

## Nav entries to add (for the shell workstream)

These pages are ready to mount under **Management**. Proposed: a sub-nav within the
`management` section (Book · Reporting · Promotions · …), or new `Section` values.

| Page | Import | Status |
|------|--------|--------|
| Reporting & analytics | `import { ReportingPage } from '../manager'` → `<ReportingPage />` | **built** |
| Promotions & loyalty | `import { PromotionsPage } from '../manager'` → `<PromotionsPage />` | **built** (bonuses; loyalty/referral/scheduling next) |
| Communication | `manager/communication` | planned |
| Branding / white-label | `manager/branding` | planned |
| Presentation settings | `manager/settings` | planned |
| AI Manager Copilot | `manager/copilot` | planned |

`ReportingPage` is propless — it reads the durable analytics store directly.

### One optional boot hook (full day-one capture)

`manager/reporting/capture.ts` self-wires on import (it begins mirroring the app
ledger the moment the manager layer loads, and backfills the recent on-screen
snapshot). For capture from the very first wager of a session, the shell may add a
single boot import:

```ts
import { initAnalyticsCapture } from '../manager/reporting/capture.js'
initAnalyticsCapture() // idempotent
```

## Phased plan (approved sequence: Foundations → Reporting first)

- **Reporting** — *built*: a durable, persisted analytics store mirroring the app
  ledger (`analytics-store.ts` + `capture.ts`), pure rollups (`analytics.ts`:
  turnover, per-game hold/GGR, engagement/retention/churn, date-range), and the
  read-only dashboard (`ui/ReportingPage.tsx`) with CSV export.
- **Promotions & loyalty** — *built (bonuses)*: `core.grant(account, cents, meta)`
  is the sanctioned credit primitive (replaces the raw `balance += cents`); it fires
  a dedicated `onGrant` channel (NOT `onWagerResolved`), so bonuses are recorded by
  analytics without polluting turnover/win-rate or VIP-wagered. `manager/promotions`
  drafts + validates (`planBonus`), credits each target through `grant` inside
  `book-store.mutateBook` (single player or a whole downline), and logs each campaign
  (`promoStore`). *Next*: scheduled/recurring sends, loyalty-rate config on `vip/`,
  and a referral program.
- **Branding / white-label & Presentation** — a persisted per-book config doc
  (name, logo, colors, custom domain, points symbol, number format, timezone) +
  a runtime theming seam; thread the points symbol/format into
  `games/shared/money.ts` rather than forking a formatter.
- **Communication** — book-wide announcements + in-app notifications (player
  identity via `org` `Member.id`); outbound Discord/Telegram webhooks modeled on
  the `sportsdata/` injected-fetch pattern. (Off-platform per-player DMs need a
  contact field the `org` workstream would add — flagged, not assumed.)
- **AI Manager Copilot** — compose a read-only book snapshot from the reporting
  rollups; advisory-only (returns recommendations, the manager approves any action).

## Tests

`vitest run manager` — pure analytics + store factory are fully unit-tested; the
page has a render smoke test.
