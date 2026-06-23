# DimeBag-Bets — Audit Runbook

A ready-to-run audit package for scanning this repo for security, cost, performance, legal, and launch-readiness issues. **Not yet run** — this is set up to be executed later.

## Contents
- [`checklist.md`](./checklist.md) — the master checklist, deduplicated and categorized. Source of truth for *what* gets checked.
- [`agent-tasks.md`](./agent-tasks.md) — one self-contained agent prompt per category, ready to dispatch.

## How to run later

1. Open Claude Code in the repo root (`DimeBag-Bets/`).
2. Open [`agent-tasks.md`](./agent-tasks.md). There are 5 tasks (Security, Cost, Performance, Legal, Launch).
3. For each task, dispatch a subagent with the **shared read-only instructions block** prepended to the task body. Example:
   > Spawn 5 agents, one per task in `docs/audit/agent-tasks.md`. Each is a read-only repo scan that reports `[PASS]/[FAIL]/[N/A]/[NEEDS REVIEW]` per item with `file:line` evidence, then a prioritized fix summary.
4. Tasks 1–3 and 5 are pure repo scans and can run in parallel. Task 4 (Legal) also needs the deployed site + legal docs (privacy policy / ToS).
5. Collect each agent's report into `docs/audit/results/<date>-<category>.md` (create the folder when you run).

## Scope notes for this repo
- Stack: Vite + TypeScript, Supabase backend, Vercel hosting, a `worker/` dir, and many feature modules (`billing/`, `auth/`, `ledger/`, `p2p/`, `trading/`, etc.).
- Supabase + Vercel are in play, so the Supabase cost/RLS items and Vercel bandwidth/SSR items are directly relevant.
- `provably-fair*` and `ledger/` are money-critical paths — prioritize Security Task findings there.
- Check `.env.example` vs committed `.env` history (Security Task item 3) given secrets are configured here.

## Status
- [ ] Security audit (Task 1)
- [ ] Cost audit (Task 2)
- [ ] Performance audit (Task 3)
- [ ] Legal & compliance audit (Task 4)
- [ ] Launch readiness audit (Task 5)

*Source material distilled from short-form vibe-coding security/perf/cost/legal content. See checklist for full provenance.*
