/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One toolchain for the dev server (the app shell + game UIs) and the test
// runner (core + game logic). Vite resolves the `.js` import specifiers used by
// the pure modules to their `.ts` sources, so the same code runs in tests, the
// browser now, and a server later.
// GitHub Pages serves under the repo subpath, so the Pages build needs a base + its own outDir.
// Gate it behind PAGES_BUILD=1 so the dev server and the normal dist build are byte-for-byte
// unchanged (base '/', outDir 'dist'). The Pages build writes to its OWN gitignored dir
// (dist-pages) — the CI deploy workflow publishes that to the gh-pages branch, so build
// artifacts are never hand-committed into the tracked docs/ (which holds project markdown).
const pagesBuild = process.env.PAGES_BUILD === '1'

export default defineConfig({
  plugins: [react()],
  base: pagesBuild ? '/DimeBag-Bets/' : '/',
  build: {
    outDir: pagesBuild ? 'dist-pages' : 'dist',
    // Both outputs are gitignored, so always start clean.
    emptyOutDir: true,
    // dist: hidden sourcemaps (error de-minify, gitignored — never enter the repo). Pages: no maps
    // at all — the public demo doesn't need them (smaller; the source is public anyway).
    sourcemap: pagesBuild ? false : 'hidden',
    rollupOptions: {
      output: {
        // Split React into its own long-lived chunk: it changes only on a dep
        // upgrade, so returning players keep it cached across app deploys instead
        // of re-downloading it whenever app code changes.
        manualChunks: { vendor: ['react', 'react-dom'] },
      },
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
})
