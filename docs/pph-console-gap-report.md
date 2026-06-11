# DimeBag-Bets — PPH Operator Console Gap Report (agent model)

_Audit of the console against the pay-per-head back-office checklist, with a first-class agent-scoping lens. Recovered from a 7-agent parallel audit (6 panel auditors). Role model: Manager → Master Agent (subagent) → Agent → Player._

## Headline

- **Depth:** 16 deep · 27 thin · 2 stub (of 45 modules).
- **Agent-scoping:** **26 none · 9 partial · 1 full · 9 n/a.** The 4-tier tree + credit-waterfall (allowance) exist, but almost nothing filters *by* agent — that's the dominant gap.
- **Absent entirely:** commission % / split, Agent Performance, Analysis/CLV, IP Tracker, per-agent Collections, a true open-bet Bet Ticker.

## Build order (highest operator value first)

| # | Action | Effort | Item | Why |
|---|--------|--------|------|-----|
| 1 | build/scope | L | Agent model foundation | Add `commissionPct` to Member (agents/masters) + org helpers: agentOf(player), rosterOf(agent), agentPerformance(W/L, roster, net, commission), settleAgentSubtree. Everything else scopes off these. |
| 2 | deepen | M | Add-Customer → full flow | Role selector Player/Agent/Master + parent picker (eligibleParents) + credit/allowance + commission% for agents. Replaces the stub that only adds players under the manager. |
| 3 | build | M | Agent Admin panel | List masters/agents; create/suspend/activate; set allowance (budget) + commission%; edit. New Players-section tile. |
| 4 | build | M | Agent Performance panel | Per-agent W/L, roster size, weekly trend, commission earned — ranks AGENTS (today nothing does). |
| 5 | scope | L | Agent scope selector + retrofit | Reusable 'view as / filter by agent' control (manager→any subtree; agent-role viewer locked to own roster). Retrofit weekly-figures, figures, cashier-desk, pending, players, risk, alerts, performance, transactions-log. |
| 6 | deepen | L | Weekly Figures: per-agent rollups + day-of-week + settle + export | Group players under their agent with subtotals; 7 day-of-week columns; per-agent settle-to-zero; CSV. |
| 7 | deepen | L | Customer Admin (players) | Inline + bulk column credit/limit edit, status, move-player-between-agents, segment, password status+reset (never plaintext). |
| 8 | deepen | M | Cashier: agent-scoped + allowance-aware | Keep cashier-desk (batch); scope its search by agent; debit the agent allowance/waterfall; signed-in actor. Retire the redundant single-move cashier. |
| 9 | deepen | M | Pending: per-ticket drill + risk/to-win + per-agent | One row per open wager with risk vs to-win liability; group/rollup by agent. |
| 10 | build | M | Bet Ticker (live OPEN bets) | A true newest-first open-wager feed (today live-activity shows only settled bets). |
| 11 | build | L | Analysis / CLV | Per-player closing-line value: beat-line count, avg price, total bets, sharpness flags. |
| 12 | build | M | IP Tracker / web access log | Login/access log with shared-IP collusion flags (today: stub). |
| 13 | build | M | Collections | Who owes / is owed, grouped by agent, settle-to-zero. |
| 14 | deepen | L | Game Admin + Lines | Per-market enable/circle/limit/suspend, period-level, per-player circling, per-agent vig. |
| 15 | deepen | M | Messaging by agent/segment | Compose/broadcast scoped to an agent's roster or a segment. |
| 16 | build | M | Rules | Trading/grading config (holds, grading, period rules). |
| 17 | fix | S | Coins-only cleanup | Strip '$' currency from vip / segments / promotions / gamification. |
| 18 | deepen | M | Commission in settlement | Net agent commission % into the weekly-figures roll-up at settle. |

## Panel audit (what we have)

| Module | Depth | Agent scope | What it does / top gap |
|--------|-------|-------------|------------------------|
| org-model (org/org.ts) | DEEP | full | Implements the 4-tier Manager/Sub-Agent/Agent/Player tree with tier-rule placeme — _gap:_ no commission% field or split-on-weekly-figures logic anywhere on a Member or in settleOrgWeek |
| access | DEEP | n/a | Manager-only granular permissions editor: lists sub-agents and agents, and toggl — _gap:_ capability map covers tools only, not data scope — granting an agent 'players' or 'reporting' does NOT restrict them to their own downline (the panels themselve |
| setup | DEEP | n/a | New-manager onboarding wizard wrapping SetupWizard: pick a conservative/balanced — _gap:_ presets configure house/risk/credit only — no agent-hierarchy bootstrap (no seeding of master-agent/agent tiers, allowances, or commission% defaults) |
| lines | DEEP | n/a | Adapts the sportsbook TradingDesk: live line/vig/suspend management that writes  — _gap:_ lines are book-wide by design (one slate for all players) — but there is no per-agent or per-player line/limit override (no per-agent vig markup, no agent-level |
| scores | DEEP | n/a | Live results board over the sportsbook slate where the operator can enter/correc — _gap:_ grading is inherently book-wide (a final settles every player's bet) so player-scoping is n/a, but there is no per-agent settlement preview/report of what a gra |
| org-index (org/index.ts) | DEEP | n/a | Public barrel re-exporting the org types and every org operation (tree build/rea — _gap:_ nothing new — it only surfaces what org.ts implements, so it omits commission / per-agent-performance exports because those functions don't exist |
| cashier-desk | DEEP | none | The coin window: pull up a player, choose Grant/Deduct/Set, preview the landing  — _gap:_ no agent scope/filter — PlayerSearch is book-wide; can't restrict a cashier or agent to their own downline, and there's no per-agent net rollup, only net-to-boo |
| risk | DEEP | none | Adapts app/RiskPanel: book-wide realized hold (overall + per game), live exposur — _gap:_ no agent filter or per-agent hold/exposure rollup — exposure is bookPending(org, managerId) and winners/losers come from membersByRole(org,'player') across the  |
| alerts | DEEP | none | Adapts app/console/AlertsPanel: a read-only watchlist of credit-near-limit playe — _gap:_ no agent scope/filter — buildOperatorAlerts walks membersByRole(org,'player') for the whole book and totalOpenExposure() for the whole book |
| Book store / current-player + settlement recor | DEEP | none | Owns the one shared persisted Org (seeded as a real 4-tier demo book), tracks wh — _gap:_ no concept of a logged-in operator/agent identity — only a 'current PLAYER'; there is no current-agent/role to scope views by |
| Manager actions / audit + figure adjust (app/m | DEEP | none | Wraps book mutations with an audit trail: auditedMutate snapshots auditable memb — _gap:_ audit actor is a hardcoded 'operator' string, not a real authenticated agent identity — so the trail can't attribute by agent or scope by who did it |
| promotions | DEEP | partial | Draft and send (now or on a daily/weekly schedule) free-play or point bonuses to — _gap:_ no 'act as / view as agent' scope — the Send-to dropdown lists every member in the whole book (manager, every sub-agent, every agent, every player), so an agent |
| settlements-run | DEEP | partial | End-to-end weekly close on one screen: live preview of every MEMBER's figure wit — _gap:_ no agent FILTER/scoping — shows all members book-wide; a master agent/agent cannot run a settle scoped to just their downline |
| transactions-log | DEEP | partial | The full durable book ledger (book-ledger): every place/resolve/settle/adjust mo — _gap:_ no agent filter — can filter by a single player but not by an agent/master to see their whole downline's ledger |
| Management console — tree + Add-Customer (org/ | DEEP | partial | Operator console over the Manager→Sub-Agent→Agent→Player book: BuildPanel recrui — _gap:_ scoping is a manager-initiated focus/drill-down, NOT an enforced per-logged-in-agent view — a master agent/agent has no identity here and can always reach manag |
| Customer Admin (per-player levers, in Manageme | DEEP | partial | Per-player inline editing of credit limit, max bet, min bet, max payout, betting — _gap:_ no bulk / multi-row column edit (every edit is one member at a time) |
| gamification | THIN | n/a | Tabbed operator config for missions, achievements, the daily reward wheel (with  — _gap:_ config is a single global ruleset with no per-agent variation (a master agent cannot run a different mission/wheel for their downline) — acceptable if gamificat |
| settings | THIN | n/a | Tenant/book configuration editor wrapping settings-store: settlement cadence (da — _gap:_ single-tenant only — tenantId scoping is a TODO; the store is one global doc, so multi-book/multi-tenant config isn't real yet |
| casino | THIN | n/a | Stacks app/GamesPanel (enable/disable each casino game book-wide) and app/HouseE — _gap:_ per-GAME enable/disable only — no per-market, period-level, or per-bet-type controls |
| org-types (org/types.ts) | THIN | n/a | Defines Role ('manager'\|'subagent'\|'agent'\|'player'), Member (id/role/name/paren — _gap:_ no commission rate / split field on Member |
| vip | THIN | none | Manager-only VIP program console: toggle leaderboard release and auto-grant, inl — _gap:_ no agent filter — the grant player dropdown is fed listPlayers() across the whole book, so an agent/master cannot see only their own players |
| segments | THIN | none | Read-only player segmentation (VIP / New / Casual / Dormant) derived from the re — _gap:_ no agent filter — iterates every member with role 'player' in the whole book (org.members), so a master/agent cannot scope to their own roster |
| notes | THIN | none | Per-player CRM: search any player, then edit free-text notes (persisted to org M — _gap:_ no agent filter — PlayerSearch runs over the entire org, so any operator can open any player's notes regardless of agent ownership |
| messaging | THIN | none | Operator communication hub: author book-wide announcements (severity + TTL, with — _gap:_ no compose-by-agent or compose-by-segment — the DM dropdown is membersByRole(book,'player') across the entire book plus an 'All players' broadcast; there is no  |
| players | THIN | none | A player-lookup admin panel: type-ahead search any player in the book, then view — _gap:_ no agent filter / scope selector — PlayerSearch lists every player.role==='player' book-wide, so a master agent or agent would see all players, not just their d |
| cashier | THIN | none | Search a player and post one signed coin adjustment to their figure via the shar — _gap:_ no agent filter on the player search — book-wide, an agent could adjust anyone |
| limits | THIN | none | Search a player, then set or clear their per-player max-bet and min-bet caps via — _gap:_ no agent filter on search — book-wide; no per-agent default-limit template or downline rollup |
| performance | THIN | none | Shows top and bottom movers — the up-to-8 players with the highest and lowest cu — _gap:_ explicitly NOT downline reporting (comment says so) — no per-agent W/L, no agent roster size, no weekly trend, no commission earned |
| weekly-figures | THIN | none | Lists every PLAYER's running figure (core account.balance) with up/down counts a — _gap:_ no per-AGENT or per-master rollup (filters membersByRole='player' only — agents/sub-agents never appear) |
| figures | THIN | none | The deep weekly sheet: per-player coins won/lost broken out into 7 day-of-week c — _gap:_ no per-AGENT rollup row (player-only; no agent/master/manager subtotals — a core PPH weekly-figures requirement) |
| settlements | THIN | none | Read-only archive of past squared-up periods (SettlementHistory): each record sh — _gap:_ no per-agent collections view (who owes/is owed grouped by agent — collection is a single book-wide collected flag per period) |
| settle | THIN | none | The settle ACTION tile: shows due/cadence/next-due status and squares up the WHO — _gap:_ no per-agent or per-player settle (whole-book only — there is no partial/scoped settle path) |
| transactions | THIN | none | Thin adapter over app/Ledger rendered UNSCOPED: a session feed of resolved bets  — _gap:_ session-only ledger-store data (not the durable book ledger) — clears on reload and has a Clear button, unsuitable as the operator transaction history |
| analytics | THIN | none | Renders the manager ReportingPage: read-only book-wide rollups (turnover, house  — _gap:_ no per-agent rollup or per-master-agent rollup (no W/L by agent, no roster size, no weekly trend, no commission earned) |
| copilot | THIN | none | Advisory-only manager assistant wrapping CopilotPage: builds a read-only book sn — _gap:_ snapshot is hardcoded to org.managerId (bookFigure, creditUtilization, playerCount all at the root) — no per-agent or per-master-agent snapshot, so a master age |
| pending | THIN | none | Shows total coins at risk in ungraded bets, broken out by game (from the exposur — _gap:_ no per-agent rollup (no master-agent/agent column or grouping of pending) |
| live-activity | THIN | none | Renders the existing ActivityTicker — a newest-first live feed of recently settl — _gap:_ no agent filter/scope — the ticker iterates all members for names and shows every book bet |
| ticketwriter | THIN | none | Manual ticket entry: search a player, enter stake + multiplier, then write it op — _gap:_ player search (PlayerSearch) spans ALL players book-wide with no agent filter — an agent could write tickets for any player, not just their downline |
| Agents hierarchy panel (features/agents/Agents | THIN | none | Renders the whole book as a collapsible manager-rooted tree, lets you Add a Play — _gap:_ no agent-view scoping — always renders from book.managerId, so a master agent/agent cannot be restricted to their own sub-book |
| Weekly Figures / Settlement (Management Settle | THIN | partial | Previews each non-manager member's book figure as what they 'settle up' to the l — _gap:_ no day-of-week columns (Mon..Sun) — a single net figure per member, not the per-day grid PPH expects |
| Flat book report / Weekly Figures table (Manag | THIN | partial | A flat, sortable report of every member in the focused scope with columns for cr — _gap:_ no day-of-week columns and no carry/balance — it's a current-standing snapshot, not a weekly grid |
| Risk & exposure read (Management ScopeSummary  | THIN | partial | Per-scope dashboard showing the book figure, player count, live exposure (sum of — _gap:_ no per-market / per-game exposure breakdown (exposure is just summed pending, no biggest-positions-by-event) |
| Player lookup (Management PlayerSearch / Playe | THIN | partial | A header search that opens a single player's profile (imported from ./PlayerLook — _gap:_ PlayerLookup.tsx not in the provided set — can't confirm its depth; from usage it's profile + play-as only |
| add-player | STUB | none | Onboards a single new account by name + credit line and inserts it under the boo — _gap:_ hardcodes parentId = org.managerId — every account lands directly under the manager, so there is no way to add a player under a specific agent/master agent |
| security | STUB | none | Shows the current signed-in operator's session (name, email, identity id, book/t — _gap:_ no login history, device list, IP capture, or remote session revoke (explicitly stubbed pending Supabase auth) |

---

## Final status — PPH agent back-office build (2026-06-11)

Built and verified this phase (suite 192 files / 1299 tests green; tsc + lint clean):

- **Agent model foundation** — `commissionPct` on Member; org helpers `agentOf` / `rosterOf` / `agentPlayerNet` / `agentCommission` / `agentPerformance` / `allAgents` / `setCommissionPct`.
- **Add Customer** — onboard Player / Agent / Master Agent under an eligible parent (fixed the old "everything lands under the manager" stub).
- **Agent Admin** + **Agent Performance** — allowance, commission, suspend; per-agent W/L, roster, exposure, commission.
- **Agent scoping kit** (`features/_desk/scope`) wired into Pending, Player Performance, Limits, Ticketwriter, Player Admin, Cashier Desk, Notes, and the Weekly Sheet.
- **Weekly Sheet** — per-agent rollup grouping + scope + agent column in CSV.
- **Customer Admin** — the player grid: inline + bulk credit edit, status (active/lock), move-between-agents, and login **status + reset only** (never a plaintext password; auth stays in Supabase via `auth/credentials`).
- **Collections** — per-agent collect / pay worklist + commission, scoped drill-down.
- **Rules** — house rules / grading & settlement policy, shown plainly (Control section).
- **Dollars** terminology throughout (no coins/points framing).

Already present (verified, not rebuilt):

- **Bet Ticker** → `live-activity` (real-time ticker over the ledger feed).
- **Game Admin / Lines** → `LinesPanel` mounts the deep **TradingDesk** (per-market suspend/pull, vig presets, line moves, devig, exposure, props).

Deferred by decision (2026-06-11):

- **Commission at settlement** → **reported figure, not a points movement.** It's a closed-loop, no-cash-out model, so commission is squared operator↔agent in the real world; the weekly points close still resets every figure to zero. Surfaced in Agent Performance + Collections. (No change to core `settleOrgWeek`.)
- **Analysis/CLV + IP Tracker** → **skipped until the data feed lands** (Phase 3 odds-close history / auth-backend IP capture). The Sessions tile already reserves the IP seam. Not built as placeholders to avoid hollow/fabricated panels (CLAUDE.md "honest by default").
