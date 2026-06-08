/**
 * Public surface of the auth module. The app shell imports the provider + hook, the
 * login screen, the role/route helpers, and the user→member link from here.
 */

export { AuthProvider, useAuth } from './AuthProvider.js'
export { Login } from './Login.js'
export { memberForUser, accountForUser, accountIdForUser } from './accountLink.js'
export {
  allowedSections,
  canReach,
  canManage,
  defaultSection,
  ALL_SECTIONS,
  type Section,
} from './roles.js'
export { supabaseAuthReady } from './config.js'
export type { AuthUser, Session, AuthStatus, AuthAdapter, AuthContextValue } from './types.js'

// Demo adapter helpers (the working path until Supabase is wired; tests reset state).
export { DEMO_OPERATOR_EMAIL, __resetDemoAuth } from './demoAdapter.js'
