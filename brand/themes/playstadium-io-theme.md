# PlayStadium.io Theme

## Theme Name

PlayStadium Dark

## Intent

PlayStadium.io should feel like a sharp private betting floor inside a modern stadium: fast, confident, clean, and prize-focused without looking noisy or crypto-coded. The interface should stay dark and composed, with gold used as the one clear signal for brand, action, focus, and reward.

## Source Inputs

- Product name: PlayStadium.io
- Current source of truth: this document (`playstadium-io-theme.md`) and Claude Design's design system
- Current visual anchor: logo files in `brand/logos/originals/`
- Palette basis: logo-derived graphite, gold, silver, and white inlays
- Typography source: DJR testing package `DJR-Fonts-2026-06-24-caaf8a8-Testing.zip`
- Avoid: older placeholder repo branding, unapproved names, unapproved fonts, unapproved font changes, and loud sportsbook clutter

## Palette

### Core Colors

| Token | Hex | Role |
| --- | --- | --- |
| Stadium Black | `#101113` | App background, immersive page canvas |
| Club Graphite | `#161616` | Cards, panels, input surfaces |
| Rail Graphite | `#20201F` | Hovered surfaces, chips, elevated controls |
| Hairline | `#333332` | Borders, dividers, field outlines |
| Trophy Gold | `#F0BE4A` | Primary action, brand mark, focus, reward states |
| Flash Gold | `#F5C459` | Hover states, glints, live reward emphasis |
| Pressed Gold | `#C99528` | Active/pressed actions |
| Ice White | `#FCFCFB` | Primary text and logo inlay contrast |
| Silver Readout | `#C4C4C2` | Secondary text, subtle numeric labels |
| Smoke Label | `#919190` | Tertiary labels, disabled text |

### Semantic Colors

| Token | Hex | Role |
| --- | --- | --- |
| Win Green | `#34D399` | Positive figure, win confirmation, live status only |
| Pressed Green | `#25B87F` | Active win-state controls if needed |
| Loss Red | `#E0556E` | Negative figure, error, loss, stop |
| Pressed Red | `#CF4661` | Active destructive or stop controls |

## Color Rules

- Gold is the brand action color. Use it for primary CTAs, selected navigation, focus rings, rewards, and key multipliers.
- Green and red are semantic only. Do not use green as the brand accent.
- Keep the surface system nearly neutral. Depth should come from subtle value shifts, borders, and a light top sheen.
- Use gold glow sparingly around active rewards, focused tiles, and primary hover states.
- Avoid broad multicolor gradients, neon casino palettes, and beige/gold luxury tropes.

## Typography

### Font Selection

PlayStadium.io uses the DJR Slight Chance testing package supplied by the user. Do not use the existing repo fonts as brand direction.

| Use | Font |
| --- | --- |
| Display, brand moments, large game titles | `Slight Chance Web` |
| Numeric readouts, odds, balances, compact betting data | `Slight Chance Mono Web` |
| Body, UI labels, readable controls | `ECWCStandard Web` |

The package is currently a DJR testing license: 1 desktop workstation, 0 monthly unique web visitors, and 0 apps/e-books for testing purposes only. Treat these fonts as design-system/testing assets until the production web/app license is upgraded.

### Type Direction

- Display typography should feel custom, memorable, and game-native without overwhelming dense betting workflows.
- Body type should stay readable at sportsbook density.
- Numerics should use `Slight Chance Mono Web` wherever alignment, odds, balances, or multipliers matter.
- Avoid oversized marketing type inside tool surfaces.

## Shape And Layout

| Token | Value | Role |
| --- | --- | --- |
| Radius Small | `8px` | Buttons, inputs, chips |
| Radius Base | `12px` | Cards and panels |
| Radius Large | `18px` | Rare larger containers or popups |
| Content Max | `1200px` | App shell and game hub width |
| Base Gap | `16px` | Standard component spacing |

## Interaction

- Motion should be short and purposeful: hover lifts, focus rings, score/reward feedback.
- Standard duration: `180ms`; fast duration: `130ms`; slow emphasis: `280ms`.
- Use `cubic-bezier(0.2, 0.7, 0.3, 1)` for entry and hover.
- Respect reduced motion preferences.

## UI Personality

PlayStadium Dark should feel:

- Fast, not frantic
- Premium, not precious
- Sports-native, not corporate SaaS
- Game-ready, not arcade cluttered
- Clear enough for repeat betting workflows

## Components

### React Component System

Use the repo's shadcn/ui-style React component layer as the working PlayStadium UI kit. It is based on Radix primitives, Tailwind-compatible styling, and the local `cn()` helper in `lib/utils.ts`.

Current local component inventory:

| Component | File | Use |
| --- | --- | --- |
| Button | `components/ui/button.tsx` | Primary, secondary, ghost, destructive, and icon actions |
| Dialog | `components/ui/dialog.tsx` | Modal decisions, confirmations, focused setup flows |
| Sheet | `components/ui/sheet.tsx` | Mobile menus, side panels, bet slips, filters |
| Select | `components/ui/select.tsx` | Compact option picking for odds, markets, filters, settings |
| Slider | `components/ui/slider.tsx` | Stake sizing, risk controls, numeric tuning |
| Switch | `components/ui/switch.tsx` | Binary settings and on/off preferences |
| Tabs | `components/ui/tabs.tsx` | View switching inside dense surfaces |
| Table | `components/ui/table.tsx` | Structured sportsbook, ledger, history, and admin data |
| Tooltip | `components/ui/tooltip.tsx` | Icon button labels, dense control hints, unfamiliar actions |

Component direction:

- Prefer these React components over one-off controls when building PlayStadium UI.
- Keep variants mapped to the PlayStadium token system in `app/theme.css`.
- Buttons should use icons where the action is familiar; text buttons are for clear commands.
- Sheets are preferred for bet slips and mobile panels; dialogs are for decisions that interrupt the flow.
- Tables should stay dense, scannable, and operational rather than decorative.
- New components should follow the same shadcn/Radix pattern and live in `components/ui`.
- Do not introduce a second competing component library without user approval.

### Primary Button

- Background: Trophy Gold
- Text: Stadium Black
- Hover: Flash Gold with a restrained gold shadow
- Active: Pressed Gold

### Cards And Tiles

- Background: Club Graphite
- Border: Hairline
- Hover: 2 to 3px lift, gold-tinted border, soft gold lift
- Art areas may use radial graphite-to-gold tinting, but should not become full gold blocks.

### Navigation

- Inactive: Silver Readout
- Active: Ice White text with a small Trophy Gold indicator
- Avoid large pill tabs that dominate the header.

### Figures And Balances

- Available-to-wager and positive reward emphasis can use gold.
- Weekly standing uses green, red, or muted silver depending on direction.
- Numbers should use tabular alignment.

## Suggested CSS Variables

```css
:root {
  --ps-bg: #101113;
  --ps-surface: #161616;
  --ps-surface-2: #20201f;
  --ps-line: #333332;
  --ps-text: #fcfcfb;
  --ps-muted: #c4c4c2;
  --ps-faint: #919190;
  --ps-gold: #f0be4a;
  --ps-gold-bright: #f5c459;
  --ps-gold-press: #c99528;
  --ps-green: #34d399;
  --ps-green-press: #25b87f;
  --ps-red: #e0556e;
  --ps-red-press: #cf4661;
  --ps-radius-sm: 8px;
  --ps-radius: 12px;
  --ps-radius-lg: 18px;
  --ps-gap: 16px;
  --ps-content-max: 1200px;
  --ps-font-display: 'Slight Chance Web';
  --ps-font-body: 'ECWCStandard Web';
  --ps-font-num: 'Slight Chance Mono Web';
}
```

## Review Questions

- Should PlayStadium.io lean more sportsbook-sharp, casino-playful, or balanced between the two?
- Should gold remain the only brand accent, or should a second non-semantic accent be explored for future campaigns?
- Should `Slight Chance Web` be used only for brand/display moments, or should it also appear in smaller game-card titles?
