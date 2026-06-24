/**
 * EXPERIMENTAL — standalone entry for the lobby redesign study.
 *
 * This is intentionally ISOLATED from the live app: it has its own HTML entry and mounts
 * its own component, importing nothing from `app/`. Vite serves it in dev only (the
 * production build's single input is the root index.html), so it never ships and never
 * touches the live shell, shared `core`, auth, or stores. View it at:
 *   http://localhost:5173/experiments/lobby/index.html
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ExperimentalLobby } from './ExperimentalLobby.js'

createRoot(document.getElementById('exp-root')!).render(
  <StrictMode>
    <ExperimentalLobby />
  </StrictMode>,
)
