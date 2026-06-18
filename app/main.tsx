import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { AuthProvider, Login, useAuth } from '../auth/index.js'
import { installAlertTransport } from './alert-transport.js'
import './theme.css'

/**
 * The auth gate: no session → the Login screen; a session → the app. In demo mode the
 * provider bootstraps an operator session on first load, so the app is reachable with
 * no keys; once Supabase is wired + keyed, the same gate fronts real sign-in.
 */
function Root() {
  const { status } = useAuth()
  // Wire risk alerts (app/risk-controls onAlert) to the SMS/email transport. OFF BY DEFAULT:
  // with no relay endpoints provisioned it registers nothing and is byte-for-byte the no-
  // transport build; once provisioning supplies the endpoints it pages on a breach.
  useEffect(() => installAlertTransport(), [])
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
