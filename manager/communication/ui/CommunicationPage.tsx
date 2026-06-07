import { useMemo, useState, useSyncExternalStore } from 'react'
import type { Severity } from '../announcements.js'
import { commsStore } from '../comms-store.js'
import { announcementText, configuredChannels, dispatch } from '../webhooks.js'
import './communication.css'

const SEVERITIES: { id: Severity; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Good news' },
  { id: 'warning', label: 'Heads up' },
]
const TTLS: { label: string; ms: number }[] = [
  { label: 'No expiry', ms: 0 },
  { label: '1 hour', ms: 3_600_000 },
  { label: '1 day', ms: 86_400_000 },
  { label: '1 week', ms: 604_800_000 },
]

/**
 * Communication — author book-wide announcements (the player shell renders the
 * active ones; a binding noted in README) and push them to Discord/Telegram. Money
 * is never involved. Self-contained page mounted by the shell.
 */
export function CommunicationPage() {
  const v = useSyncExternalStore(commsStore.subscribe, commsStore.version)
  const announcements = useMemo(() => commsStore.announcements().slice(), [v])
  const webhooks = useMemo(() => commsStore.webhooks(), [v])
  const channels = configuredChannels(webhooks)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<Severity>('info')
  const [ttl, setTtl] = useState(0)
  const [alsoPush, setAlsoPush] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const fmtResults = (res: { channel: string; ok: boolean; error?: string }[]): string =>
    res.length ? res.map((r) => `${r.channel}: ${r.ok ? 'sent ✓' : r.error}`).join(' · ') : 'no channels configured'

  async function publish() {
    setStatus(null)
    try {
      commsStore.publish({ title, body, severity, ttlMs: ttl })
      const pushMsg = announcementText(title, body)
      setTitle('')
      setBody('')
      if (alsoPush && channels.length) {
        setSending(true)
        const res = await dispatch(webhooks, pushMsg)
        setStatus(`Published. Pushed — ${fmtResults(res)}.`)
      } else {
        setStatus('Published.')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  async function sendTest() {
    setSending(true)
    setStatus(null)
    try {
      const res = await dispatch(webhooks, 'Test message from your DimeBag book ✔')
      setStatus(`Test — ${fmtResults(res)}.`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mgr-comms">
      <header className="mgr-comms-head">
        <h1 className="mgr-comms-title">Communication</h1>
        <p className="mgr-comms-sub">Post announcements to your players and push them to Discord / Telegram.</p>
      </header>

      <section className="mgr-comms-card" aria-label="New announcement">
        <h2 className="mgr-h2">New announcement</h2>
        <input
          className="mgr-input"
          placeholder="Title (optional)"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="mgr-textarea"
          placeholder="Message to your players…"
          maxLength={500}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mgr-comms-row">
          <div className="mgr-toggle">
            {SEVERITIES.map((s) => (
              <button key={s.id} className={severity === s.id ? 'is-on' : ''} onClick={() => setSeverity(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <select className="mgr-select mgr-select-auto" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
            {TTLS.map((t) => (
              <option key={t.ms} value={t.ms}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* live banner preview */}
        {body.trim() && (
          <div className={`mgr-banner is-${severity}`} aria-label="Preview">
            {title && <strong>{title}</strong>}
            <span>{body}</span>
          </div>
        )}

        <div className="mgr-comms-foot">
          <label className={`mgr-check ${channels.length ? '' : 'is-off'}`}>
            <input
              type="checkbox"
              checked={alsoPush && channels.length > 0}
              disabled={channels.length === 0}
              onChange={(e) => setAlsoPush(e.target.checked)}
            />
            Also push to {channels.length ? channels.join(' + ') : 'webhooks (none configured)'}
          </label>
          <button className="mgr-send" onClick={publish} disabled={!body.trim() || sending}>
            Publish
          </button>
        </div>
        {status && <p className="mgr-comms-status">{status}</p>}
      </section>

      <section aria-label="Announcements">
        <h2 className="mgr-h2">Posted</h2>
        {announcements.length === 0 ? (
          <p className="mgr-comms-empty">No announcements yet.</p>
        ) : (
          <ul className="mgr-anns">
            {announcements.map((an) => (
              <li key={an.id} className={`mgr-ann ${an.active ? '' : 'is-inactive'}`}>
                <span className={`mgr-ann-dot is-${an.severity}`} aria-hidden="true" />
                <div className="mgr-ann-body">
                  {an.title && <strong>{an.title}</strong>}
                  <span>{an.body}</span>
                </div>
                <button className="mgr-mini" onClick={() => commsStore.setActive(an.id, !an.active)}>
                  {an.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mgr-comms-card" aria-label="Webhooks">
        <h2 className="mgr-h2">Discord &amp; Telegram</h2>
        <label className="mgr-field">
          <span className="mgr-label">Discord webhook URL</span>
          <input
            className="mgr-input"
            placeholder="https://discord.com/api/webhooks/…"
            value={webhooks.discordUrl}
            onChange={(e) => commsStore.setWebhooks({ discordUrl: e.target.value })}
          />
        </label>
        <div className="mgr-comms-row">
          <label className="mgr-field">
            <span className="mgr-label">Telegram bot token</span>
            <input
              className="mgr-input"
              placeholder="123456:ABC-…"
              value={webhooks.telegramToken}
              onChange={(e) => commsStore.setWebhooks({ telegramToken: e.target.value })}
            />
          </label>
          <label className="mgr-field">
            <span className="mgr-label">Telegram chat id</span>
            <input
              className="mgr-input"
              placeholder="-1001234567890"
              value={webhooks.telegramChatId}
              onChange={(e) => commsStore.setWebhooks({ telegramChatId: e.target.value })}
            />
          </label>
        </div>
        <div className="mgr-comms-foot">
          <span className="mgr-hint">{channels.length ? `Configured: ${channels.join(', ')}` : 'No channels configured yet.'}</span>
          <button className="mgr-mini" onClick={sendTest} disabled={!channels.length || sending}>
            Send test
          </button>
        </div>
      </section>
    </div>
  )
}
