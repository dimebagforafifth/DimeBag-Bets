import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { AuthProvider, Login, useAuth } from '../auth/index.js'
import { installAlertTransport } from './alert-transport.js'
import { armBonusEngine } from '../bonus/index.js'
import { setActiveEconomyTenant } from '../core/index.js'
import { getActiveTenant } from '../persistence/index.js'
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
  // Arm the bonus engine: every real wager (core `onWagerPlaced`) feeds `recordTurnover`, so
  // bonus playthrough clears from ACTUAL betting. Safe + off-by-default — arming only records
  // turnover, never grants; money grants happen solely via fireTrigger/expireDue → core.grant.
  useEffect(() => armBonusEngine(), [])
  // Point core's economy policy at the active tenant at boot (multi-tenant books). app/economy-config
  // already syncs core on import; this makes the tenant binding explicit so a balance-mode book's
  // policy is in force before the first wager. Off-by-default: with no config the tenant resolves to
  // the default credit policy, byte-identical to base.
  useEffect(() => setActiveEconomyTenant(getActiveTenant()), [])
  // fireTrigger HOOKS (documented seam — the engine never auto-grants on import). The points-only
  // demo has no safe real source for these lifecycle events, so each stays an explicit hook to
  // connect when its source is provisioned (every fire grants a rule's reward through core.grant):
  //   fireTrigger('signup',        { playerId })  // real new-player signup (demo bootstraps an operator)
  //   fireTrigger('deposit',       { playerId })  // n/a — points only, no real deposits
  //   fireTrigger('daily',         { targetId })  // a daily check-in / login-streak source
  //   fireTrigger('first-bet',     { playerId })  // a player's first ever wager (needs lifecycle state)
  //   fireTrigger('losing-streak', { playerId })  // N losses in a row — a retention nudge
  // 'first-bet'/'losing-streak' are derivable from core wager events, but auto-firing would grant
  // credit mid-play, which is an operator rule-config decision — hence explicit hooks, not a wire.
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
