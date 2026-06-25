# DimeBag Brand

This folder is the home for DimeBag-Bets branding, identity notes, logo source files, prompts, mockups, and production-ready exports.

## Structure

- `logos/originals/` - source logo files exactly as imported or generated.
- `logos/exports/` - optimized app/web exports such as favicon, app icon, transparent PNG, and simplified SVG.
- `identity/` - brand guide notes: colors, typography, voice, spacing, usage rules, and lockups.
- `mockups/` - applied brand previews such as app splash screens, cards, social posts, and merch.
- `prompts/` - AI generation prompts and model notes worth keeping for future iterations.

## Current Logo Assets

| File | Type | Notes |
| --- | --- | --- |
| `logos/originals/dimebag-chip-logo.png` | PNG | 1728x2304 raster source. Good for visual reference and high-resolution previews. |
| `logos/originals/dimebag-chip-logo.svg` | SVG | Vector path export with 77 path elements. Best current source for cleanup and scalable web use. |
| `logos/originals/dimebag-chip-logo-embedded-png.svg` | SVG wrapper | Contains an embedded base64 PNG. Useful as a preservation copy, but not ideal as a production SVG. |

## Working Rules

- Keep `originals/` unchanged unless replacing a source file intentionally.
- Put cleaned, compressed, or resized outputs in `logos/exports/`.
- Prefer the true SVG source for icons, favicon work, and app UI.
- Use the PNG when raster fidelity matters or when an image tool cannot handle SVG correctly.
- Document future generation prompts in `prompts/` so the identity can be recreated or extended.
