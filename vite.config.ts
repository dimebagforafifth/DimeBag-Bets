/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One toolchain for the dev server (the app shell + game UIs) and the test
// runner (core + game logic). Vite resolves the `.js` import specifiers used by
// the pure modules to their `.ts` sources, so the same code runs in tests, the
// browser now, and a server later.
// GitHub Pages serves under the repo subpath, so the Pages build needs a base + a docs/ outDir.
// Gate it behind PAGES_BUILD=1 so the dev server and the normal dist build are byte-for-byte
// unchanged (base '/', outDir 'dist', hidden maps).
const pagesBuild = process.env.PAGES_BUILD === '1'

export default defineConfig({
  plugins: [react()],
  base: pagesBuild ? '/DimeBag-Bets/' : '/',
  build: {
    outDir: pagesBuild ? 'docs' : 'dist',
    // The Pages build writes INTO the tracked docs/ (which holds the project markdown), so never
    // wipe it; the gitignored dist build empties as usual.
    emptyOutDir: !pagesBuild,
    // dist: hidden sourcemaps (error de-minify, gitignored — never enter the repo). Pages: no maps
    // at all — the demo is committed to a public repo, so skip them (smaller; the source is public
    // anyway, so nothing extra leaks).
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
