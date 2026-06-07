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
| Promotions | `import { PromotionsPage } from '../manager'` → `<PromotionsPage />` | **built** (bonuses: single / bulk / scheduled) |
| Loyalty & progression | `import { LoyaltyPage } from '../manager'` → `<LoyaltyPage />` | **built** (tier ladder over the VIP program) |
| Branding / white-label & Presentation | `import { BrandingPage } from '../manager'` → `<BrandingPage />` | **built** |
| Communication | `import { CommunicationPage } from '../manager'` → `<CommunicationPage />` | **built** (announcements + webhooks + in-app messages) |
| AI Manager Copilot | `import { CopilotPage } from '../manager'` → `<CopilotPage />` | **built** (advisory) |

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
  (`promoStore`). **Scheduled / recurring** sends are built too (`schedule-store` +
  a `runDue` runner; fires while a tab is open — backend cron for production).
  **Loyalty/progression** config is its own page (`manager/loyalty`) over the VIP
  program. **Referral** is the one piece blocked on an `org` schema field — see
  `BLOCKED-ON-ORG.md`.
- **Branding / white-label & Presentation** — *built*: one persisted per-book
  config (`manager/branding`: name, logo, accent, domain, money display, timezone).
  The store applies it on load + on change — runtime theming overrides the `--gem`
  accent token + the page title (`theme.ts`, no shared CSS edit), and the points
  symbol/format thread through `games/shared/presentation.ts` → `formatMoney`
  (defaults reproduce "$1,234.56" exactly, so nothing changes until configured).
  **Two shell bindings to wire** (the shell workstream): (1) `import` the config
  store at boot so branding applies from first paint; (2) bind the header
  brand/title and lobby tagline to `bookConfigStore.config()` (they're hardcoded in
  `App.tsx` today). Custom domain is stored for reference; DNS is a Vercel step.
  *Note:* this touched the shared `games/shared/money.ts` formatter (the only seam
  for an app-wide symbol) — additively, defaults preserved.
- **Communication** — *built (announcements + webhooks)*: `manager/communication`
  authors book-wide announcements (severity, expiry, active toggle), persisted in
  `commsStore`, and pushes them to Discord/Telegram via a testable injected-fetch
  `dispatch` (sportsdata pattern). **In-app messages** are built too
  (`messages-store`): a DM to one player or a `*` broadcast notification; the shell
  renders each inbox via `inboxFor`. **Shell bindings to wire:** render
  `activeAnnouncements(commsStore.announcements(), Date.now())` as a player banner,
  and `inboxFor(messagesStore.messages(), playerId)` as the player's inbox.
  *Blocked:* **off-platform** per-player DMs need a **contact field on org `Member`** —
  see `BLOCKED-ON-ORG.md`. Webhook POSTs are client-side; some setups may need a CORS
  proxy.
- **AI Manager Copilot** — *built (advisory)*: `manager/copilot` composes a
  READ-ONLY `buildSnapshot` from the reporting rollups + org read-models, and a pure
  `analyze(snapshot)` rules engine returns ranked, explained recommendations (risk /
  promotions / communication), each with a suggested next step the MANAGER performs.
  Advisory by construction — the engine has no write access and executes nothing.
  *Premium upgrade:* swap the rules engine for an LLM behind the same
  `analyze(snapshot) → Recommendation[]` interface (still advisory, still approved).

## Tests

`vitest run manager` — pure analytics + store factory are fully unit-tested; the
page has a render smoke test.
