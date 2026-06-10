/**
 * Sessions — NEW panel (no existing component reviewed sign-ins). It reads the live
 * auth context (auth/useAuth) and shows the CURRENT session. Full login / device / IP
 * history needs the real auth backend, which isn't wired yet, so that section is a
 * clearly-flagged placeholder rather than fabricated data.
 *
 * // TODO(api): when Supabase Auth is live, list past sessions (device, IP, last seen,
 * revoke) from the auth adapter / session table instead of the placeholder below. The
 * demo adapter has no such log.
 */
import { useAuth } from '../../auth/index.js'
import { PanelShell } from './shared.js'

const STATUS_LABEL: Record<string, string> = {
  authenticated: 'Active',
  loading: 'Loading…',
  unauthenticated: 'Signed out',
}

export function SessionsPanel({ onBack }: { onBack: () => void }) {
  const auth = useAuth()
  const user = auth.user

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h1 className="feat-h1">Sessions</h1>
          <p className="feat-sub">Who&apos;s signed in to the console, and how.</p>
        </div>
        <span className="feat-flag">{auth.isDemo ? 'Demo auth' : 'Live auth'}</span>
      </header>

      <section className="feat-card" aria-label="Current session">
        <h2 className="feat-h2">Current session</h2>
        {user ? (
          <table className="feat-table">
            <tbody>
              <tr>
                <th>Operator</th>
                <td>{user.displayName}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>{user.email}</td>
              </tr>
              <tr>
                <th>Identity</th>
                <td>{user.id}</td>
              </tr>
              <tr>
                <th>Book</th>
                <td>{user.tenantId ?? 'Default (single-tenant demo)'}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>{STATUS_LABEL[auth.status] ?? auth.status}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="feat-empty">No active session.</p>
        )}
      </section>

      <section className="feat-card" aria-label="Login history">
        <div className="feat-head">
          <h2 className="feat-h2">Login history &amp; devices</h2>
          <span className="feat-flag">Needs backend</span>
        </div>
        <p className="feat-sub">
          Past sign-ins, device, IP, and remote revoke appear here once the auth backend (Supabase)
          is connected. The demo adapter keeps no session log.
        </p>
      </section>
    </PanelShell>
  )
}
