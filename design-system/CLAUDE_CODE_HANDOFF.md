# PlayStadium Design System — Claude Code Handoff

This zip is a **design system + interactive prototype** for **PlayStadium.io** (the
points-based casino + sportsbook whose product code lives in the `DimeBag-Bets` repo).
It was built in Anthropic's design tool against that repo for brand/visual context. It is
**design fidelity + clickable prototype**, not production code — everything runs on
client-side fakes. Your job is to port the visuals/flows onto the real app.

> Points are display-only — no real-money value, no buy-in, no cash-out. Keep that framing.

---

## What's in here

```
styles.css            ← single entry point; @imports the token + font layers
tokens/               ← colors, typography, fonts, spacing, elevation (CSS custom props)
assets/               ← self-hosted fonts, 21 3D game-icon PNGs, chip logo, favicon
components/           ← 9 React UI primitives (Button, Chip, Badge, GameCard, Stat,
                        WalletPill, OddsButton, EventRow, BetSlip) — each .jsx + .d.ts + .prompt.md
ui_kits/
  casino-lobby/       ← lobby recreation
  sportsbook/         ← sportsbook recreation
  playstadium-app/    ← THE BIG ONE: full app + console + auth/onboarding (see below)
templates/            ← copy-to-start .dc.html templates
guidelines/           ← foundation specimen cards
readme.md             ← the full design guide (READ THIS FIRST)
SKILL.md              ← Agent-Skills-compatible entry point
```

**Read `readme.md` first** — it has the content voice, visual foundations, iconography,
and the color/type system in full.

---

## The brand in one screen

- **Palette:** carbon canvas (`#101113`), warm-grey surface ramp, **one gold accent**
  (`#f0be4a`) for CTAs / focus / key figures / rewards. Gold is **never** a big fill.
  Green `#46c88a` up, red `#e0556e` down — the only non-gold hues.
- **Type:** *Slight Chance* (display/wordmark), *Slight Chance Mono* (**every numeral** —
  balances, odds, multipliers), Barlow Condensed (headings/eyebrows), Barlow (body).
  Uppercase tracked eyebrows. Radii 8/12/18px. Motion 130/180/280ms, gold focus ring.
- All values are CSS custom properties in `tokens/` — reach for the semantic aliases
  (`--surface-card`, `--text-body`, `--accent`, `--status-up`) so it re-themes cleanly.

---

## ui_kits/playstadium-app — the prototype to port

A no-build React app (CDN React + in-browser Babel) themed with a **shadcn/ui-style
component layer** (`theme.css` + `ui.jsx`) that maps shadcn's CSS variables
(`--background`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, …) onto the
PlayStadium tokens. Two entry points:

### `index.html` — the app
- **Player:** Casino lobby (21 Originals) → an interactive **Mines** game (stake, reveal,
  multiplier, cash out), **Sportsbook** + bet slip (singles/parlay), My Bets, Rewards/VIP,
  Leaderboard, Profile (+ responsible-play).
- **Operator console:** Dashboard, Players & agents, Risk & exposure, Settlement & ledger,
  Games & edge — mirrors the repo's 6-section console.

### `auth.html` — sign-in + onboarding (built to match `DimeBag-Bets/auth`)
- `Auth.jsx` — **username + password for everyone** (the repo's model), player/operator
  account-type pick on sign-up, inline + form validation, password reveal/strength, a
  Google button (with the "needs Supabase backend" note = `canUseOAuth=false` in demo),
  and the three demo logins (`operator`/`agent`/`marco`, pw `demo`).
- `OnboardingPlayer.jsx` — welcome → handle → agent/referral code → game interests →
  **responsible-play limits** (per-bet / session-loss / session-time — the real
  `PlayerLimits` fields, in cents) → **welcome free play** ($25.00, balanced preset) → done.
- `OnboardingManager.jsx` — the real **SetupWizard**: book basics → **house profile**
  (Conservative/Balanced/Aggressive with faithful RTP, credit-util, exposure cap, default
  credit line, settlement cadence + starter promos from `app/console/presets.ts`) → review
  → invite your desk (org hierarchy) → done.
- `AuthApp.jsx` orchestrates; a top-right "jump to" menu hits any flow directly. Sign-out
  in the app returns to `auth.html`; finishing a flow opens `index.html`.

---

## Wiring it into the real app (suggested order)

1. **Tokens → `app/theme.css`.** Copy the shadcn→brand variable mapping from
   `ui_kits/playstadium-app/theme.css` (the `.psa { --background: …; --primary: …; }`
   block) into the real Tailwind/shadcn theme so the existing `components/ui/*` inherit it.
   Pull raw values from `tokens/*.css`.
2. **Fonts.** Self-host the four faces in `assets/fonts/` and register the `@font-face`
   rules from `tokens/fonts.css`. **License gate (below) before any real traffic.**
3. **Auth screen → `auth/Login.tsx`.** Re-skin the existing `Login` with the PlayStadium
   markup/classes from `Auth.jsx` + `auth.css`. The fields, modes, demo logins, Google
   button, and verify-email state already line up with `useAuth()`.
4. **Player onboarding.** New post-sign-up flow. Wire the limits step to
   `app/responsible-play.ts` (`setLimits`), the interests to lobby personalisation, and the
   welcome free play to the Promotions/bonus grant path. Land on `defaultSection('player')`.
5. **Operator onboarding.** Map to `app/console/SetupWizard.tsx` + `presets.ts`
   (`applyPreset` / `completeSetup`); invite-desk → org member creation. Land on the console.
6. **Screens.** Use `index.html`'s kits as the visual target for casino/sportsbook/console;
   compose the real `components/ui/*`, don't re-implement primitives.

Everything visual is class-based CSS + plain JSX, so it ports to Tailwind/shadcn directly —
the class intentions map 1:1.

---

## Caveats (please read)

- **Font licensing — blocker for production.** *Slight Chance* / *Slight Chance Mono* are
  bundled under DJR's **Testing License** (1 desktop, 0 web visitors). A web/app license
  **must be bought from djr.com** before serving real users.
- **All fakes.** Outcomes are random client-side; no real auth, persistence, odds, or
  settlement. Field names, roles (`manager/subagent/agent/player`), copy, and config values
  were matched to the repo to make this port mechanical, not behavioural.
- **shadcn is recreated, not imported.** `theme.css`/`ui.jsx` are a no-build stand-in so the
  prototype runs anywhere. In the real app, keep your actual `shadcn/ui` + Radix and just
  adopt the variable mapping.
- **Two brand-doc deltas to confirm with the designer:** `brand/themes/playstadium-io-theme.md`
  lists **ECWCStandard** as the body/UI font (this system uses Barlow for body, ECWC for
  scoreboard moments) and **win-green `#34D399`** (this system uses `#46c88a`). Pick one.
- **Namespace:** components export under `window.PlayStadiumDesignSystem_e4e367` in the card
  HTML — irrelevant once ported to real imports.
```
```
