# Game Asset Generation — Prompts & Pipeline

New premium game art generated via **Higgsfield MCP → Nano Banana 2 (2K)** and integrated into the games.
This file is the reproducible spec: reuse/extend any asset on ChatGPT, another Nano Banana host, or Higgsfield.

## Style system (use as a preamble on every prompt)

> `3D-rendered premium casino game icon: <SUBJECT>. Glossy material with crisp specular highlights and soft rim lighting, rich saturated color, tasteful gold accents, high detail, polished mobile-game art. Single centered object, isolated, no text, no ground shadow, plain flat light-gray studio background for clean cutout.`

- Anchors the existing icon set (`public/game-icons/*.png`): faceted green emerald, glossy blue rocket, gold-trim treasure chest, red balloon, gold-filigree cards.
- **Flat light-gray background** + "no ground shadow" → clean local cutout (see Pipeline).
- **Glow/FX** assets (flame trail, explosion) are generated on **pure black** instead, and keyed by luminance.
- Chips follow the **PlayStadium brand chip** (`public/brand/playstadium-chip-logo.png`): white edge segments + gold ring + clean center (the denomination number is a CSS overlay, so the center stays empty).

## Pipeline

1. `generate_image` (model `nano_banana_2`, `resolution: 2k`) — 2 credits each.
2. Download the `rawUrl`.
3. Local background removal (free, no credits) via `scratchpad/.../cut_bg.py`:
   - `flat` — flood-fills the connected background from the borders (interior highlights are never eaten).
   - `circle` — masks round subjects (chips/coins/ball/wheel) to a disc → pristine rim, restores white chip segments.
   - `glow` — alpha = luminance, for emissive FX generated on black.
4. Autocrop + resize (longest side 640) → place under `public/`.

## Asset prompts (SUBJECT clause per asset)

### Crash — `public/game-assets/crash/`
- **rocket.png** — `a single glossy cartoon rocket ship, bright cobalt-blue body with polished chrome-silver fins and nose trim, a round glass porthole, vivid orange-and-blue flame from the bottom thruster, pointing straight up`
- **trail.png** *(glow / black bg, 9:16)* — `a vertical rocket-exhaust flame plume, bright white-hot core at top fading through orange/red to a wispy smoke tail`
- **explosion.png** *(glow / black bg)* — `a dramatic fiery explosion burst, orange/yellow/white fireball with radiating sparks, debris, shockwave flares`

### Mines — `public/game-tiles/mines/`
- **gem.png** — `a classic brilliant-cut gemstone, three-quarter angle, flat top table + pavilion to a point, vivid emerald green, sparkle glints, gold rim accent`
- **bomb.png** — `a classic round cartoon bomb, glossy charcoal-black sphere, short braided fuse with a glowing spark, brass collar, floating, no shadow`
- **bomb-hit.png** — `a round cartoon bomb at detonation, charcoal sphere cracking with an orange-yellow blast, sparks and shards, bomb still visible`

### Diamonds — `public/game-tiles/diamonds/` (same gem prompt, swap color)
`gem-red` ruby red · `gem-orange` fiery orange · `gem-yellow` canary yellow · `gem-green` emerald green · `gem-cyan` aqua cyan · `gem-blue` sapphire blue · `gem-purple` amethyst purple · `gem-magenta` magenta pink. Order matches `GEM_COLORS` in DiamondsGame.tsx.

### Pump — `public/game-tiles/pump/`
- **balloon.png** — `a glossy candy-apple-red party balloon, taut inflated sphere, soft highlight, small knotted neck at bottom`
- **balloon-burst.png** — `a red party balloon at the instant it pops, torn shredded rubber fragments flying out`
- **pump-rig.png** *(3:4)* — `a classic air pump: dark steel cylinder, chrome plunger shaft, gold push handle, nozzle and base foot, side view`

### Cases — `public/game-assets/cases/`
- **chest-closed.png** — `a closed ornate treasure chest, dark wood planks, polished gold corner brackets/straps/lock, gem studs, three-quarter angle`
- **chest-open.png** — `an open ornate treasure chest, lid hinged up, golden light rays and sparkles bursting out, glowing treasure inside`

### Chips — `public/chips/` (brand-chip style, `1:1`, clean center)
> `a <BODY> clay chip with several evenly spaced bold creamy-white rectangular edge segments, a thin polished gold ring inside the rim, a clean inset flat center medallion, NO emblem/numbers/text`
- `white-1` ivory pearl-white (gold segments) · `red-5` casino red · `blue-10` slate blue · `green-25` casino green · `black-100` deep black (= brand chip) · `purple-500` royal purple · `gold-1k` metallic gold

### Casino — cards / coins / roulette
- **cards/card-back.png** *(3:4)* — `a playing-card back, ornate gold filigree over deep crimson-and-black, central gold diamond crest, double gold border`
- **coins/coin-heads.png** — `a thick gold coin, raised rim, embossed laurel-wreath crown emblem, no text`
- **coins/coin-tails.png** — `a thick gold coin, raised rim, embossed diamond-and-star emblem, no text`
- **roulette/wheel.png** — `a roulette bowl from straight above, dark-wood + chrome bowl, central gold cone hub, EMPTY track, NO numbers or pockets` *(numbers stay code-drawn for correct results)*
- **roulette/ball.png** — `a small glossy ivory-white sphere with one bright highlight` *(generate on a contrasting background, not light-gray)*

## Credits

Nano Banana 2 @ 2K = 2 credits/image. The full set (31 assets) with regenerations cost ~82 credits.
Background removal is done locally (free). The "365 Unlimited Nano Banana" plan perk is **web-only** and does not apply to MCP/API generations.
