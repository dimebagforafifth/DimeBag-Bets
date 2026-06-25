/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// One toolchain for the dev server (the app shell + game UIs) and the test
// runner (core + game logic). Vite resolves the `.js` import specifiers used by
// the pure modules to their `.ts` sources, so the same code runs in tests, the
// browser now, and a server later.
// The GitHub Pages demo is built separately by .github/workflows/deploy-pages.yml
// (CLI flags --base/--outDir into a gitignored dist-pages/, then pushed to the
// gh-pages branch), so this config only describes the normal dist build.

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  build: {
    outDir: 'dist',
    // dist: hidden sourcemaps (error de-minify, gitignored — never enter the repo).
    sourcemap: 'hidden',
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
