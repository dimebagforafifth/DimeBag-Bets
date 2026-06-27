// Side-effect module: register the chip background images as base-path-aware
// CSS custom properties on :root.
//
// The poker-chip CSS in baccarat / roulette / sicbo / three-card poker paints
// chips via `background: var(--chip-<name>)`. CSS `url()` cannot read BASE_URL,
// so a literal `url(/chips/white-1.png)` would 404 on the GitHub Pages subpath
// build. Importing this module (for its side effect) sets each `--chip-<name>`
// to a base-correct url once, so the CSS resolves under any base.
import { assetUrl } from './assetUrl.js'

const CHIP_NAMES = ['white-1', 'red-5', 'blue-10', 'green-25', 'black-100', 'purple-500', 'gold-1k']

if (typeof document !== 'undefined') {
  const root = document.documentElement.style
  for (const name of CHIP_NAMES) {
    root.setProperty(`--chip-${name}`, `url("${assetUrl(`/chips/${name}.png`)}")`)
  }
}
