# DimeBag-Bets — Weekly Dependency Report

**Date:** 2026-06-22
**Repository scanned:** `dimebagforafifth/dimebag-bets` (the only repo connected to this session)

> ⚠️ **Email could not be sent.** The Gmail integration's token has **expired and needs re-authorization**, so the intended email to jdgiannis2@icloud.com / jdiannisii@gmail.com was not delivered. This file is the report. Re-auth Gmail and re-run, or copy this in manually.

---

## Summary

| Metric | Result |
|---|---|
| Security advisories | **1 — LOW** (esbuild, dev-only, fix available) |
| Outdated packages | **16** (8 major · 4 minor/patch · type-defs pinned to React 18 / Node 20) |
| Up to date | `@supabase/supabase-js` (2.108.2) |
| Production risk | **LOW** — no critical/high/moderate CVEs; the one advisory isn't in the prod bundle |

`npm audit` totals: **1 low · 0 moderate · 0 high · 0 critical.**

---

## 1. Security (priority) — LOW

**esbuild** (transitive, via Vite/Vitest — dev dependency)

- Advisory: [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) — arbitrary file read via the dev server on Windows
- CWE-22 (Path Traversal) · CVSS 3.1 = **2.5 (LOW)** · vulnerable range `>=0.27.3 <0.28.1`
- **Fix available:** `npm audit fix`
- **Impact:** dev-server-only **and** Windows-only; not shipped in the production build. Low urgency, one-line fix.

No critical, high, or moderate advisories.

---

## 2. Outdated — MAJOR (review breaking changes before bumping)

| Package | Current | Latest | Notes / breaking changes |
|---|---|---|---|
| react | 18.3.1 | 19.2.7 | React 19: removed `ReactDOM.render`/`hydrate` (use `createRoot`/`hydrateRoot`), string refs, legacy context, `defaultProps` on function components; new JSX transform expected. **Bump with @types.** Treat as a planned migration. |
| react-dom | 18.3.1 | 19.2.7 | Paired with `react`. |
| @types/react | 18.3.30 | 19.2.17 | Only go 19.x with React 19. Safe 18.x patch available: **18.3.31**. |
| @types/react-dom | 18.3.7 | 19.2.3 | Pair with React 19. |
| typescript | 5.9.3 | 6.0.3 | TS 6.0 may surface new/stricter errors. Run `npm run typecheck` on a branch first. |
| eslint | 9.39.4 | 10.5.0 | ESLint 10 drops legacy config; flat config already in use (`eslint.config.js`) so likely smooth. Bump with `@eslint/js`. |
| @eslint/js | 9.39.4 | 10.0.1 | Pair with `eslint` 10. |
| eslint-plugin-react-hooks | 5.2.0 | 7.1.1 | v6/v7 ship new recommended rules; expect new lint warnings. |
| eslint-config-prettier | 9.1.2 | 10.1.8 | v10 changed its flat-config export shape; minor config edit may be needed. |
| @vitejs/plugin-react | 4.7.0 | 6.0.2 | Requires a newer Vite major; coordinate with the Vite version. |
| @types/node | 20.19.41 | 26.0.0 | `engines.node = "20.x"` + `.nvmrc` = 20. **Stay on 20.x** (take 20.19.43). Don't jump to 26 unless the Node runtime moves too. |
| @noble/hashes | 1.8.0 | 2.2.0 | **Crypto lib** powering the provably-fair RNG (Mines/Crash seeds). v2 has API/packaging changes. No CVE, but verify seed logic thoroughly before/after. |

---

## 3. Outdated — MINOR / PATCH (low risk, safe to bump now)

| Package | Current | Latest | Type |
|---|---|---|---|
| lucide-react | 1.17.0 | 1.21.0 | minor (new icons, additive) |
| typescript-eslint | 8.60.1 | 8.62.0 | minor |
| happy-dom | 20.10.2 | 20.10.6 | patch |
| prettier | 3.8.3 | 3.8.4 | patch |

---

## 4. Up to date

- `@supabase/supabase-js` — 2.108.2 (= latest)

---

## Recommended action order

1. **Security first:** `npm audit fix` to patch esbuild (low, dev-only).
2. **Safe bumps now:** lucide-react, typescript-eslint, happy-dom, prettier; plus type-def patches `@types/react@18.3.31` and `@types/node@20.19.43` (stay within current majors).
3. **Plan separately** (own branch + tests): React 19 (react/react-dom/@types), TypeScript 6, ESLint 10 (eslint + @eslint/js + plugins), `@vitejs/plugin-react` 6, and `@noble/hashes` 2 (verify provably-fair seeds).

---

*Only one repository (`dimebagforafifth/dimebag-bets`) is connected to this session, so this report covers that repo only — a single Node/TypeScript + Vite project with one `package.json`. Generated automatically by the weekly dependency-check routine.*
