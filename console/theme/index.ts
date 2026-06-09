/**
 * Console theme entry. Importing this applies the token stylesheet (theme.css);
 * everything inside a `.console` root then reads the CSS custom properties.
 *
 * `TOKENS` mirrors the spec colours for code that needs the raw values (charts,
 * canvas, tests). theme.css remains the styling source of truth — keep the two in
 * step if the palette ever changes.
 */

import './theme.css'

export const TOKENS = {
  bg: '#14171C',
  panel: '#1B1F26',
  panel2: '#20252E',
  line: '#2A2F39',
  gold: '#D6B14A',
  up: '#5BB98B',
  down: '#D27068',
} as const

export type TokenName = keyof typeof TOKENS
