# PlayStadium / DimeBag-Bets Handoff

## Goal

Continue the PlayStadium.io UI/UX and brand-system work inside the DimeBag-Bets repo without relying on stale placeholder branding. The user is actively building a Claude Design design system and wants this repo to stay aligned with that work.

## How To Use This With Both Claude Accounts

Give both Claude accounts this file first, then ask them to read the linked repo files before making design or product assumptions. The goal is that both accounts share the same baseline:

- Current brand/UI source of truth is this handoff, `brand/themes/playstadium-io-theme.md`, and the Claude Design design system when it lands.
- Older repo branding is placeholder unless the user confirms it.
- New design work should be committed locally and pushed to GitHub so the cofounder and both Claude accounts can see the same current state.
- If one Claude account makes a design-system change, have it write the decision into the repo before the other account continues.

## Current Source Of Truth

- Treat the user's direction from the current week as authoritative over older repo branding notes.
- Current working product/brand name: `PlayStadium.io`.
- The theme source of truth is now `brand/themes/playstadium-io-theme.md` plus Claude Design's upcoming design system.
- Do not pull old names, colors, fonts, identity, or design choices from older repo docs unless the user explicitly confirms them.
- The product remains points-based and non-real-money: avoid cash-out, deposits, KYC, real-money gambling, or separate sportsbook/casino balance language.

## Current Progress

- Added PlayStadium brand/theme documentation at `brand/themes/playstadium-io-theme.md`.
- Added shadcn/ui-style component tooling:
  - `components.json`
  - `components/ui/*`
  - `lib/utils.ts`
  - Tailwind v4 via `@tailwindcss/vite`
  - `@/*` path alias in `tsconfig.json` and `vite.config.ts`
- Updated `app/main.tsx` to wrap the app in `TooltipProvider`.
- Updated `app/theme.css` with Tailwind/shadcn CSS variable aliases mapped into the existing theme tokens.
- Added/kept PlayStadium-related brand assets under `brand/`, including logos.
- Added generic fairness resolver work:
  - `games/shared/resolvers.ts`
  - `games/shared/fair.ts`
  - `api/fairness.ts`
  - `games/shared/resolvers.test.ts`
- PR #22 was merged into `main` with the brand/theme work, design tooling, fairness resolver work, and CI fix.

## Fonts And Brand Notes

- The user said the fonts are from:
  `C:\Users\jdgia\Downloads\DJR-Fonts-2026-06-24-caaf8a8-Testing.zip`
- Font package contents observed:
  - `Slight Chance Web`
  - `Slight Chance Mono Web`
  - `ECWCStandard Web`
- License state: testing only, not production web/app use. Confirm licensing before shipping publicly.
- Do not substitute older font suggestions from the repo or earlier placeholder docs.

## What Worked

- Use the user's current session direction as the brand/UX authority.
- Keep brand docs in the repo and push to GitHub so the cofounder can see them.
- shadcn/ui is a good fit because it is free, composable, Radix-based, and works well with Tailwind/custom tokens.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` are the useful local verification gates.
- On this Windows/Codex setup, `npm run build` may fail inside the sandbox while loading `vite.config.ts`; rerun escalated/outside sandbox to verify the real build.

## What Didn't Work

- Do not leave user-facing work only on a conflicted PR branch. The user specifically called this out.
- Before calling work visible or ready, verify the PR branch is mergeable against `main`.
- `gh auth status` currently reports the local GitHub CLI token as invalid, so use the GitHub plugin/MCP for PR metadata unless the user reauthenticates `gh`.
- Local ignored build output (`dist/`, `dist-pages/`) can interfere with lint if not ignored in ESLint. `eslint.config.js` now ignores `dist-pages/**`.

## Recent CI / GitHub State

- PR #22 was originally conflicted, then fixed by merging `origin/main` into `docs/audit-setup`.
- Conflict files were:
  - `core/core.test.ts`
  - `core/index.ts`
  - `experiments/lobby/ExperimentalLobby.tsx`
- The branch became clean and PR #22 was merged into `main`.
- The failing coverage test was:
  `scripts/tsconfig-coverage.test.ts`
- Fix applied:
  - Added `components` to `tsconfig.json` `include`
  - Added `dist-pages/**` to `eslint.config.js` ignores
- Local verification after the fix:
  - `npm run typecheck` passed
  - `npm run lint` passed with warnings only
  - `npm test` passed: 367 files, 2649 tests
  - `npm run build` passed when rerun outside the sandbox

## Current Local Caution

At the time this handoff was written, the local worktree had an unrelated uncommitted edit:

- `experiments/lobby/ExperimentalLobby.tsx`

Do not revert or overwrite it without asking; it was intentionally left out of the CI fix commit.
(The `brand/pixel-beams/` experiment referenced by the earlier version of this note has since been removed from the repo.)

## Next Steps

1. Pull or sync `main` before continuing design work, since PR #22 has been merged.
2. Wait for or import the Claude Design design system when the user adds it to the repo.
3. Use `brand/themes/playstadium-io-theme.md` and the Claude Design design system as the styling source of truth.
4. Continue building UI with the new component library, but keep DimeBag's points-only/non-real-money model intact.
5. Before opening or pushing future PRs, verify mergeability against `main` and avoid conflicted branches.
6. Confirm DJR font licensing before any public deploy using those font files.
