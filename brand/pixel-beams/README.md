# Pixel Beams

An animated **pixel-beam** background for DimeBag-Bets — a vivid color field
rendered through a **halftone dot screen** (a grid of dots whose size tracks an
underlying brightness field), with broad soft **beams** and a **corner glow**
sweeping through it. In the bright areas the dots swell into a solid glow; in the
dark areas they shrink to fine texture. Modeled after Paper Design's
[Pixel Beams](https://shaders.com/collection/pixel-beams), rebuilt from scratch
so we own the source and can tune every knob.

Good for hero sections, loading/splash screens, login backdrops, big-win
celebration overlays, and animated social/OG art.

## Files

| File | What it is |
| --- | --- |
| `playground.html` | **Open this first.** Self-contained live tuner — double-click it, drag sliders, pick presets, randomize, then **Copy config** or **Save PNG**. No build step, no internet. |
| `PixelBeams.tsx` | Drop-in React component (zero deps, raw WebGL). Paste the playground config into its props. |
| `pixel-beams.frag.glsl` | Canonical fragment shader (reference). The same source is embedded in the other two files — if you edit the math, sync all three. |

## Quick start (in the app)

```tsx
import { PixelBeams, PIXEL_BEAM_PRESETS } from "@/brand/pixel-beams/PixelBeams";

// use a brand preset
<div style={{ position: "absolute", inset: 0 }}>
  <PixelBeams {...PIXEL_BEAM_PRESETS["Money Green"]} />
</div>

// or hand-tune individual knobs (anything you omit falls back to defaults)
<PixelBeams beamCount={12} colorCount={4} color0="#25f08a" speed={1.2} />
```

Respect reduced motion:

```tsx
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
<PixelBeams {...config} paused={reduce} />
```

## Presets

Mirror Paper's six Pixel Beams, brand-tinted:
`Money Green` (default) · `Ember Burst` · `Teal Noir` · `Magenta Flux` ·
`Indigo` · `Crimson`. Available in both the playground dropdown and
`PIXEL_BEAM_PRESETS` in the component.

## Every knob

### Brightness field (what the halftone screens)
| Prop | Range | Effect |
| --- | --- | --- |
| `ambient` | 0–1 | Base brightness everywhere — raise it to make dots appear across the whole frame. |
| `gradient` | 0–2 | Linear brighten along the beam axis (one side lighter). |
| `beamCount` | 0–12 | Number of broad soft beams. 0 = none (flat field + glow only). |
| `angle` | -π–π | Rotation of the beam field / gradient (radians). |
| `beamWidthMin` | 0.02–0.6 | Narrowest beam (broad — these are wide bands, not lasers). |
| `beamWidthMax` | 0.05–1.0 | Widest beam; beams get random widths in this range. |
| `beamStrength` | 0–1.5 | How much the beams add to the field. |
| `spread` | 0–1.2 | How far beams sit from center. |

### Glow
| Prop | Range | Effect |
| --- | --- | --- |
| `glow` | 0–2 | Corner/point glow strength (0 = off). Drives the "burst from a corner" look. |
| `glowX` / `glowY` | 0–1 | Glow position (0,0 = bottom-left, 1,1 = top-right). |

### Animation
| Prop | Range | Effect |
| --- | --- | --- |
| `speed` | 0–4 | Global animation speed multiplier. |
| `drift` | 0–3 | How fast beams sweep side to side (keep low — these move slowly). |
| `flicker` | 0–40 | Length-wise shimmer frequency along each beam. |
| `flickerSpeed` | 0–6 | How fast that shimmer travels. |
| `colorMix` | -0.3–0.3 | Speed the dot color travels across the palette over space + time. |

### Palette
| Prop | Effect |
| --- | --- |
| `background` | The base fill color shown between/under the dots (hex). Usually the dominant color. |
| `color0`–`color3` | The beam/dot "light" colors (hex), sampled as a gradient. |
| `colorCount` | 1–4 | How many palette colors are active. |

### Halftone screen
| Prop | Range | Effect |
| --- | --- | --- |
| `pixelDensity` | 8–240 | Dot grid cells across the short axis (higher = finer dots). |
| `roundPixels` | 0 / 1 | 1 = round dots (classic halftone), 0 = square dots. |
| `dotMin` | 0–0.4 | Dot radius where the field is zero (base texture, even in dark areas). |
| `dotScale` | 0–1.2 | How fast dots grow with the field. |
| `dotMax` | 0.1–0.8 | Max dot radius. Above ~0.5 dots touch and merge into a solid glow. |
| `dotSoftness` | 0.005–0.4 | Dot edge softness. |

### Look
| Prop | Range | Effect |
| --- | --- | --- |
| `intensity` | 0–3 | Brightness of the beam/dot color. |
| `contrast` | 0.3–3 | Field contrast (gamma on the brightness field — higher = punchier beams). |
| `bloom` | 0–2 | Floods the gaps in the brightest cores so beams read as solid glow, not separated dots. |
| `gamma` | 0.3–3 | Output gamma. |
| `grain` | 0–0.3 | Film-grain noise. |
| `vignette` | 0–2 | Edge darkening (0 = none). |
| `mix` | 0–1 | Master blend between raw background (0) and full effect (1). |

### Component-only props
| Prop | Default | Effect |
| --- | --- | --- |
| `paused` | `false` | Freeze animation (wire to `prefers-reduced-motion`). |
| `maxDpr` | `2` | Cap device-pixel-ratio for perf on hi-DPI screens. |
| `className` / `style` | — | Standard styling passthrough on the `<canvas>`. |

## Notes

- WebGL1 / GLSL ES 1.0 for maximum browser support. Falls back to an empty
  canvas if WebGL is unavailable.
- The component reads its props every frame, so live-editing config (e.g. from
  a settings panel) updates instantly without remounting.
- The shader renders a single full-screen triangle — cheap, no geometry.
