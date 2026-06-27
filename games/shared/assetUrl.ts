// Base-path-aware URL for static assets served from /public.
//
// The GitHub Pages demo is built with a non-root `--base` (see
// .github/workflows/deploy-pages.yml → `vite build --base=/DimeBag-Bets/`), so a
// hard-coded root-absolute asset path like `/game-assets/crash/rocket.png` 404s
// on that subpath and renders as a broken image. Prefixing with BASE_URL keeps
// the URL correct under any base (root on Vercel/dev, subpath on Pages). This
// mirrors the convention already used in ChickenRoadGame.tsx.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function assetUrl(path: string): string {
  return BASE + (path.startsWith('/') ? path : '/' + path)
}
