// =============================================================================
// DimeBag-Bets — Pixel Beams
// Canonical WebGL1 (GLSL ES 1.0) fragment shader.
//
// A vivid, edge-to-edge color field rendered through a HALFTONE DOT SCREEN:
// a regular grid of dots whose size tracks an underlying brightness field.
// Broad soft beams + an optional corner glow sweep through that field, so the
// dots swell to a solid glow in the bright areas and shrink to fine texture in
// the dark areas. Inspired by Paper Design's "Pixel Beams".
//
// This file is the reference implementation. The same source is embedded in
// PixelBeams.tsx (React) and playground.html (interactive tuner). If you edit
// the math, sync all three.
//
// NOTE: WebGL1 has no max(int,int) — keep integer maths in float. Do not name a
// variable `dot` — it shadows the built-in dot() function.
// Every `u*` uniform below is a knob — see README.md for what each one does.
// =============================================================================

precision highp float;

// --- core ---
uniform vec2  uResolution;     // canvas pixel size
uniform float uTime;           // seconds
uniform float uSpeed;          // global animation speed multiplier

// --- palette ---
uniform vec3  uBackground;     // the base fill color (shows between/under dots)
uniform vec3  uColor0;         // beam / dot "light" palette
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform int   uColorCount;     // active palette colors (1..4)

// --- brightness field (what the halftone screens) ---
uniform float uAmbient;        // base brightness everywhere (0..1)
uniform float uGradient;       // linear brighten along the beam axis (0..1+)
uniform int   uBeamCount;      // number of broad beams (0..12)
uniform float uAngle;          // beam field rotation (radians)
uniform float uBeamWidthMin;   // narrowest beam (broad: 0.05..0.6)
uniform float uBeamWidthMax;   // widest beam
uniform float uBeamStrength;   // how much beams add to the field
uniform float uSpread;         // how far beams sit from center
uniform float uDrift;          // slow sideways sweep speed
uniform float uFlicker;        // length-wise shimmer frequency
uniform float uFlickerSpeed;   // shimmer travel speed
uniform float uGlow;           // corner/point glow strength (0 = off)
uniform float uGlowX;          // glow position (0..1)
uniform float uGlowY;
uniform float uColorMix;       // hue travel speed across the palette

// --- halftone screen ---
uniform float uPixelDensity;   // dot grid cells across the short axis
uniform float uRoundPixels;    // 1 = round dots, 0 = square dots
uniform float uDotMin;         // dot radius at zero field (base texture)
uniform float uDotScale;       // how fast dots grow with field
uniform float uDotMax;         // max dot radius (>0.5 => dots merge to solid)
uniform float uDotSoftness;    // dot edge softness

// --- tone / look ---
uniform float uIntensity;      // beam-color brightness
uniform float uContrast;       // field contrast (gamma on the field)
uniform float uGamma;          // output gamma
uniform float uBloom;          // fills the gaps in the brightest cores
uniform float uGrain;          // film grain amount
uniform float uVignette;       // edge darkening (0 = none)
uniform float uMix;            // master opacity vs background (0..1)

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

vec3 paletteColor(int i) {
    if (i <= 0) return uColor0;
    if (i == 1) return uColor1;
    if (i == 2) return uColor2;
    return uColor3;
}

// sample the active palette as a gradient, s in [0,1]
vec3 paletteMix(float s) {
    float fc = max(float(uColorCount), 1.0);
    if (fc < 1.5) return uColor0;
    float x = clamp(s, 0.0, 1.0) * (fc - 1.0);
    int idx = int(floor(x));
    float fr = fract(x);
    return mix(paletteColor(idx), paletteColor(idx + 1), fr);
}

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------

void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = frag / uResolution;
    float aspect = uResolution.x / uResolution.y;

    // centered, aspect-corrected coords
    vec2 c = uv - 0.5;
    c.x *= aspect;
    vec2 pr = rot(uAngle) * c;     // pr.x = across beams, pr.y = along beams

    float t = uTime * uSpeed;

    // --- build the brightness field ---
    float field = uAmbient;

    // linear gradient: one side of the beam axis brighter than the other
    field += uGradient * clamp(pr.y * 0.7 + 0.5, 0.0, 1.0);

    // broad soft beams
    float beamField = 0.0;
    const int MAX_BEAMS = 12;
    for (int i = 0; i < MAX_BEAMS; i++) {
        if (i >= uBeamCount) break;
        float fi = float(i);
        float r0 = hash11(fi + 1.0);
        float r1 = hash11(fi + 7.0);
        float r2 = hash11(fi + 13.0);

        float speed = 0.25 + r0 * 0.9;
        float width = mix(uBeamWidthMin, uBeamWidthMax, r1);
        float phase = r2 * 6.2831853;

        float pos = sin(t * speed * uDrift + phase) * uSpread + (r1 - 0.5) * uSpread;
        float dd = (pr.x - pos) / max(width, 1e-3);
        float band = exp(-dd * dd);
        band *= 0.7 + 0.3 * sin(pr.y * uFlicker + t * uFlickerSpeed * speed + phase);
        beamField += band;
    }
    field += beamField * uBeamStrength;

    // corner / point glow
    if (uGlow > 0.0) {
        vec2 gp = vec2(uGlowX, uGlowY) - 0.5;
        gp.x *= aspect;
        float gd = length(c - gp);
        field += uGlow * exp(-gd * gd * 3.0);
    }

    // contrast (gamma on the field), allow cores to exceed 1.0
    field = pow(clamp(field, 0.0, 4.0), uContrast);

    // --- pick the beam/dot color: travel across the palette over space + time ---
    float sel = fract(pr.y * 0.35 + pr.x * 0.25 + t * uColorMix);
    vec3 beamCol = paletteMix(sel) * uIntensity;

    // --- halftone dot screen ---
    vec2 grid = vec2(uPixelDensity * aspect, uPixelDensity);
    vec2 cellF = fract(uv * grid) - 0.5;
    float distToCenter = (uRoundPixels > 0.5)
        ? length(cellF)
        : max(abs(cellF.x), abs(cellF.y));
    float radius = clamp(uDotMin + field * uDotScale, 0.0, uDotMax);
    float coverage = smoothstep(radius, radius - uDotSoftness, distToCenter);

    // compose: dots of beam light over the base fill
    vec3 col = mix(uBackground, beamCol, coverage);

    // bloom: in the brightest cores (field > 1) flood the gaps too, so beams
    // read as a solid glow rather than separated dots
    col = mix(col, beamCol, clamp(field - 1.0, 0.0, 1.0) * uBloom);

    // vignette
    if (uVignette > 0.0) {
        vec2 vq = uv - 0.5;
        float v = 1.0 - dot(vq, vq) * uVignette * 2.5;
        col *= clamp(v, 0.0, 1.0);
    }

    // grain
    if (uGrain > 0.0) {
        float n = hash21(frag + fract(uTime) * 113.0) - 0.5;
        col += n * uGrain;
    }

    // gamma + master mix vs raw background
    col = pow(max(col, vec3(0.0)), vec3(1.0 / max(uGamma, 0.01)));
    col = mix(uBackground, col, clamp(uMix, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
}
