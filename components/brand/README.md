# PlayStadium brand components

The **molecule layer** of the "Chip Gold & Carbon" design system, ported from the
[Claude Design system](https://claude.ai/design/p/e4e36760-36ac-44e1-ab2c-d6583f41c4cf)
(PlayStadium Design System) to typed TSX. These sit one level above the shadcn/ui
primitives in `components/ui`: they hang off the global brand tokens in
`app/theme.css` and **compose** the primitives (e.g. `BetSlip` uses the real
`<Button />`). Reach for these in screens — never re-implement a primitive.

## Foundations they assume

All visuals come from the tokens defined in `app/theme.css` (imported once via
`app/main.tsx`). Nothing here hardcodes a colour or font — retune a token and every
brand component (and the jade / ember / ice `[data-theme]` accents) re-themes.

- Colours: `--gold` (the one accent), `--bg`/`--surface`/`--surface-2`, `--green`/`--red`.
- Type: `--font-head` (Barlow Condensed), `--font-body` (Barlow), `--font-label`
  (Barlow Semi Condensed), `--font-display` (Slight Chance), `--font-num`
  (Slight Chance Mono — every numeral).
- Shape/elevation/motion: `--radius*`, `--elev-*`, `--sheen`, `--ring`, `--dur*`, `--ease-*`.

## Components

| Export | Purpose | Notes |
| --- | --- | --- |
| `Wordmark` | The `PlayStadium.io` hero mark | Slight Chance, gold `.io` dot |
| `ChipLogo` | The pixel poker-chip mark | `image-rendering: pixelated`, base-aware `/public` src |
| `WalletPill` | Header balance + week up/down | `weekCents` drives arrow + colour |
| `GameCard` | Lobby game tile | Pass `icon` = the 3D PNG (never redraw) |
| `Stat` | Labelled mono figure | `hot` paints it gold |
| `BrandBadge` | Status pill | `variant`: `gold \| solid \| live \| neutral` |
| `BrandChip` | Selectable token | `active` → gold-gem highlight |
| `OddsButton` | One tappable odds cell | `selected` → the one gold hit; `move` → ▲/▼ |
| `EventRow` | Sportsbook event row | `markets[]` of `OddsButton` columns |
| `BetSlip` | Points bet slip | Single/Parlay math; composes `ui/Button` |

`Badge` and `Chip` are exported as `BrandBadge` / `BrandChip` to keep them distinct
from any future shadcn primitives of the same name.

## Usage

```tsx
import { WalletPill, GameCard, BetSlip } from '@/components/brand'

<WalletPill balance="$12,480" weekCents={2400} />
<GameCard name="Mines" tag="Find the gems" icon={`${import.meta.env.BASE_URL}game-icons/mines.png`} />
```

## Design non-negotiables (enforced here)

- One **gold** accent on deep **carbon**; gold is never a large fill.
- Every numeral in `--font-num` (Slight Chance Mono). Up = green, down = red.
- Use the real `public/game-icons/*.png` 3D icons — never redraw them.
- Points, not money: "figure", "stake", "week" — dollar formatting is cosmetic.

## Tests

`brand.test.tsx` (vitest + happy-dom) pins the behaviour screens depend on: the
wallet trend arrow/colour, odds selection state, the bet-slip parlay/singles math
and empty state, badge/chip variants, and the wordmark. Run `npm test`.
