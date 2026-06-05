/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One toolchain for the dev server (the app shell + game UIs) and the test
// runner (core + game logic). Vite resolves the `.js` import specifiers used by
// the pure modules to their `.ts` sources, so the same code runs in tests, the
// browser now, and a server later.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
})
