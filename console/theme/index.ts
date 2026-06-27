/**
 * Console theme entry. Importing this applies the token stylesheet (theme.css);
 * everything inside a `.console` root then reads the CSS custom properties.
 *
 * `TOKENS` mirrors the Chip Gold & Carbon brand palette for code that needs the raw
 * values (charts, canvas, tests). app/theme.css remains the styling source of truth —
 * keep the two in step if the palette ever changes.
 */

import './theme.css'

export const TOKENS = {
  bg: '#101113',
  panel: '#161616',
  panel2: '#20201f',
  line: '#333332',
  gold: '#f0be4a',
  up: '#46c88a',
  down: '#e0556e',
} as const

export type TokenName = keyof typeof TOKENS
