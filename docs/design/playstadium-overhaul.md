# PlayStadium design-system overhaul

The product UI/brand is now **PlayStadium.io — "Chip Gold & Carbon"**, integrated from
the [Claude Design system](https://claude.ai/design/p/e4e36760-36ac-44e1-ab2c-d6583f41c4cf)
(project `e4e36760-…`). This doc records what changed, where, and how to work with it.

> **Scope:** a *design* overhaul. Every feature, screen, route and backend wiring is
> unchanged — only the visual/brand layer moved (plus the explicitly-requested Login
> reskin and the new, additive onboarding flows). The GitHub Pages deployment is
> unchanged (`.github/workflows/deploy-pages.yml`, base `/DimeBag-Bets/`).

## 1. Foundations (the global re-skin)

The whole app re-themes from one token layer, so the casino, sportsbook, console and
every game shifted together.

- **`app/theme.css`** — the single source of truth. Aligned to the design system's
  exact values and the `.psa` shadcn→brand variable map (applied at `:root` so every
  `components/ui/*` inherits it):
  - Colours: one **gold** accent (`--gold #f0be4a`) on deep **carbon** (`--bg #101113`);
    green/red reserved for figure up/down + live. Added `--on-gold`, `--gold-deep`, the
    semantic aliases (`--surface-card`, `--text-body`, `--status-up`…), and the
    experimental **`[data-theme]` jade / ember / ice** accents (gold = the live default).
  - Type: the **PlayStadium stack** — `--font-head` Barlow Condensed, `--font-body`
    Barlow, `--font-label` Barlow Semi Condensed, `--font-display` **Slight Chance**
    (hero + wordmark), `--font-num` **Slight Chance Mono** (every numeral), `--font-scoreboard`
    ECWC. Full scale, weights, line-heights and tracking tokens.
  - Shape / elevation / motion: `--radius-pill`, `--space-8`, `--ease-spring`, and the
    existing `--elev-*` / `--sheen` / `--ring` ramp.
- **`app/tokens/fonts.css`** — self-hosts the four design fonts from `app/fonts/`
  (Barlow Condensed `.ttf`, Slight Chance / Slight Chance Mono / ECWC `.woff2`), referenced
  *relatively* so Vite fingerprints them and rewrites the URL with the deploy base path.
  Barlow + Barlow Semi Condensed load from Google Fonts.

## 2. Brand (PlayStadium.io)

- White-label default `name` → `PlayStadium.io` (`manager/branding/config.ts`), which
  drives `document.title`.
- `public/favicon.svg` (a gold poker-chip mark on carbon), `index.html` title/meta/og,
  and `public/site.webmanifest` rebranded.
- The pixel chip logo (`public/brand/playstadium-chip-logo.png`) + the **Wordmark**
  (`PlayStadium` + a gold `.` + `io`, in Slight Chance) appear in the header, Login and
  onboarding via the shared `components/brand` `<Wordmark/>` / `<ChipLogo/>`.

## 3. Brand components — `components/brand/`

The molecule layer, ported from the design system to typed TSX (it composes the
`components/ui` primitives — e.g. `BetSlip` uses the real `<Button/>`):

`Wordmark`, `ChipLogo`, `WalletPill`, `GameCard`, `Stat`, `BrandBadge`, `BrandChip`,
`OddsButton`, `EventRow`, `BetSlip`. Styling: `components/brand/brand.css`. Tests:
`components/brand/brand.test.tsx`. See `components/brand/README.md`.

## 4. Screens wired to brand components

- **Header** (`app/App.tsx`) — the figure is the brand `WalletPill` (balance +
  week up/down), threaded through `formatMoney` so a book's configured money display is
  preserved. Wordmark + chip logo replace the old text mark.
- **Casino lobby** (`app/App.tsx`) — tiles are the brand `GameCard` showing the **real
  3D game-icon PNGs** (`public/game-icons/*.png`, the design non-negotiable — never
  redrawn), with the inline SVG `GameIcon` kept as an on-error fallback. Onboarding
  **favourites** float to the front of the grid.
- **Sportsbook + console** — inherit the full brand via the token layer (fonts, gold-on-
  carbon, elevation, radii). The functional `app/book` slip/price components are kept
  intact (behaviour preserved); the brand `OddsButton`/`EventRow`/`BetSlip` are available
  for presentational reuse.

## 5. Login + onboarding

- **`auth/Login.tsx`** — re-skinned to the design's split-screen brand pane + form panel
  (`auth/auth.css`), keeping all `useAuth()` wiring: sign-in/up, Google OAuth (gated by
  `canUseOAuth`), demo logins (gated by `isDemo`), password reveal + strength, verify-email.
- **Player onboarding** (`app/onboarding/OnboardingPlayer.tsx`) — additive, skippable,
  one-time post-sign-up flow gated in `app/main.tsx` for fresh players. Wires:
  - Interests → `setFavourites()` → lobby personalisation.
  - Limits → `setLimits()` → real responsible-play guardrails.
  - Welcome free play → `fireTrigger('signup', { playerId })` (the documented bonus seam;
    `oncePerPlayer`, so claiming is idempotent).
  - Completion persists via `app/onboarding/onboarding-store.ts`; lands on the casino.
- **Operator onboarding** (`app/console/SetupWizard.tsx`) — re-skinned to the design's
  Profile → Review → Desk → Done flow. Keeps the real `applyPreset()` / `completeSetup()`
  wiring (house + risk config only — no money moves) and adds **invite-desk → real org
  member creation** (`addAgent` under the manager, through `mutateBook`). Lives in the
  console; re-runnable to re-baseline.

## 6. Where the design source lives

`design-system/` is a text mirror of the Claude Design project (tokens, components, UI
kits, guidelines) imported for reference — it is **not** built or typechecked (excluded
from `tsconfig.json`). The runtime never imports from it.

## 7. Caveats

- **Font licensing — action before real traffic.** *Slight Chance* + *Slight Chance Mono*
  ship under DJR's **Testing License** (desktop testing, 0 web visitors). Fine for this
  system + prototypes; **buy a web/app license from [djr.com](https://djr.com)** before
  serving real users. (Barlow / Barlow Condensed are OFL.)
- Alternate `[data-theme]` accents (jade/ember/ice) are experimental; **gold ("stadium")
  is the live default**.

## 8. Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (incl. components/brand + app/onboarding suites)
npm run build       # tsc + vite build
```
