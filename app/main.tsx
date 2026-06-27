import { StrictMode, useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import { installGlobalErrorReporting } from './error-report.js'
import { AuthProvider, Login, useAuth, memberForUser } from '../auth/index.js'
import { getBookVersion, subscribeBook } from './book-store.js'
import { OnboardingPlayer } from './onboarding/OnboardingPlayer.js'
import {
  isPlayerOnboarded,
  subscribeOnboarding,
  getOnboardingVersion,
} from './onboarding/onboarding-store.js'
import { installAlertTransport } from './alert-transport.js'
import { armBonusEngine } from '../bonus/index.js'
import { armBoostEngine } from '../boosts/index.js'
import { armReferrals } from '../referrals/index.js'
import { setActiveEconomyTenant } from '../core/index.js'
import { getActiveTenant } from '../persistence/index.js'
import { TooltipProvider } from '../components/ui/tooltip.js'
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
  // bonus playthrough clears from ACTUAL betting. The same arm path also auto-fires the
  // activity-keyed lifecycle triggers from real core events — `first-bet` on a player's first
  // wager, `daily` on their first wager of a UTC day, and `losing-streak` after N consecutive
  // losing settlements — each idempotent via a persisted per-player marker, each granting only
  // through the existing fireTrigger → core.grant path (never a second money path). Off-by-
  // default: with no matching enabled rule authored, a fire grants nothing.
  useEffect(() => armBonusEngine(), [])
  // Arm the boost engine (round 4 B): subscribes to core settlement so a winning, qualifying bet
  // gets its boost uplift granted via the bonus engine's grant path. Off-by-default — with no boost
  // rules authored it grants nothing; the BoostsPanel also arms it on mount (idempotent).
  useEffect(() => armBoostEngine(), [])
  // Arm referrals (round 4 D): subscribes to core settlement so a referee's first qualifying settled
  // wager pays both parties through core.grant. Off-by-default — the program ships disabled, so an
  // unconfigured book grants nothing; the referral panel also arms on mount.
  useEffect(() => armReferrals(), [])
  // Point core's economy policy at the active tenant at boot (multi-tenant books). app/economy-config
  // already syncs core on import; this makes the tenant binding explicit so a balance-mode book's
  // policy is in force before the first wager. Off-by-default: with no config the tenant resolves to
  // the default credit policy, byte-identical to base.
  useEffect(() => setActiveEconomyTenant(getActiveTenant()), [])
  // fireTrigger LIFECYCLE WIRING. The three activity-keyed triggers now fire AUTOMATICALLY from
  // real core events inside armBonusEngine() above (idempotent, marker-guarded):
  //   first-bet     → on a player's first-ever wager        (onWagerPlaced)
  //   daily         → on their first wager of a UTC day      (onWagerPlaced)
  //   losing-streak → after N consecutive losing settlements (onWagerResolved)
  // The remaining two stay explicit seams fired at their real source:
  //   signup  → fired by the onboarding flow on a fresh player (app/onboarding/OnboardingPlayer.tsx)
  //   deposit → n/a for a points-only book (no real deposits)
  if (status === 'loading') return null
  return status === 'authenticated' ? <AuthedApp /> : <Login />
}

/**
 * Gates the post-sign-up player onboarding (Claude Design flow) in front of the app.
 * Only FRESH PLAYERS see it — operators (manager / agent / sub-agent) go straight to
 * the app, where the console's own SetupWizard handles operator onboarding. The flow
 * is skippable and one-time: completing or skipping it persists, so it never re-shows.
 */
function AuthedApp() {
  const { user } = useAuth()
  // Re-resolve the member when the book changes, and re-render when onboarding completes.
  useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeOnboarding, getOnboardingVersion)
  const authMember = memberForUser(user?.id)
  const role = authMember?.role ?? 'player'

  if (role === 'player' && user && !isPlayerOnboarded(user.id)) {
    return (
      <OnboardingPlayer
        userId={user.id}
        playerId={authMember?.id ?? null}
        name={user.displayName}
        username={user.username}
        onDone={() => {
          /* completePlayerOnboarding() already fired the store notify above, which
             re-renders this gate into <App />. Nothing else to do. */
        }}
      />
    )
  }
  return <App />
}

// Capture uncaught errors + unhandled promise rejections app-wide and route them through the
// error-report seam (complements ErrorBoundary, which catches React render errors). The remote
// sink stays unset until a future Sentry-DSN wiring calls setErrorSink — until then this only
// buffers/console-logs. Safe no-op outside the browser.
installGlobalErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <TooltipProvider>
          <Root />
        </TooltipProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
