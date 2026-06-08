import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Set the active tenant (book) from the session BEFORE App pulls in the module-singleton
// stores — ordering matters (see boot-tenant.ts). No session/tenantId → the default book.
import './boot-tenant.js'
import { App } from './App.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { AuthProvider, Login, useAuth } from '../auth/index.js'
import './theme.css'

/**
 * The auth gate: no session → the Login screen; a session → the app. In demo mode the
 * provider bootstraps an operator session on first load, so the app is reachable with
 * no keys; once Supabase is wired + keyed, the same gate fronts real sign-in.
 */
function Root() {
  const { status } = useAuth()
  if (status === 'loading') return null
  return status === 'authenticated' ? <App /> : <Login />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
