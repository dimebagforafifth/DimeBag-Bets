import { useMemo, useState, useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../../app/book-store.js'
import { membersByRole } from '../../../org/index.js'
import type { Severity } from '../announcements.js'
import { commsStore } from '../comms-store.js'
import { ALL_PLAYERS } from '../messages.js'
import { messagesStore } from '../messages-store.js'
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

  const bookV = useSyncExternalStore(subscribeBook, getBookVersion)
  const players = useMemo(() => membersByRole(getBook(), 'player'), [bookV])
  const msgV = useSyncExternalStore(messagesStore.subscribe, messagesStore.version)
  const sentMessages = useMemo(() => messagesStore.messages().slice(), [msgV])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<Severity>('info')
  const [ttl, setTtl] = useState(0)
  const [alsoPush, setAlsoPush] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // direct-message / notification composer
  const [msgTarget, setMsgTarget] = useState(ALL_PLAYERS)
  const [msgTitle, setMsgTitle] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [msgStatus, setMsgStatus] = useState<string | null>(null)

  function sendMessage() {
    setMsgStatus(null)
    try {
      const name =
        msgTarget === ALL_PLAYERS
          ? 'All players'
          : (getBook().members[msgTarget]?.name ?? msgTarget)
      messagesStore.send(msgTarget, name, msgTitle, msgBody)
      setMsgBody('')
      setMsgTitle('')
      setMsgStatus(`Sent to ${name}.`)
    } catch (e) {
      setMsgStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const fmtResults = (res: { channel: string; ok: boolean; error?: string }[]): string =>
    res.length
      ? res.map((r) => `${r.channel}: ${r.ok ? 'sent ✓' : r.error}`).join(' · ')
      : 'no channels configured'

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
      const res = await dispatch(webhooks, 'Test message from your PlayStadium book ✔')
      setStatus(`Test — ${fmtResults(res)}.`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mgr-comms">
      <header className="mgr-comms-head">
        <h1 className="mgr-comms-title">Communication</h1>
        <p className="mgr-comms-sub">
          Post announcements to your players and push them to Discord / Telegram.
        </p>
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
              <button
                key={s.id}
                className={severity === s.id ? 'is-on' : ''}
                onClick={() => setSeverity(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            className="mgr-select mgr-select-auto"
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value))}
          >
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
                <button
                  className="mgr-mini"
                  onClick={() => commsStore.setActive(an.id, !an.active)}
                >
                  {an.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mgr-comms-card" aria-label="Message a player">
        <h2 className="mgr-h2">Message a player</h2>
        <p className="mgr-hint">
          A direct in-app message to one player, or a notification to everyone. Players see it in
          their inbox.
        </p>
        <div className="mgr-comms-row">
          <select
            className="mgr-select"
            value={msgTarget}
            onChange={(e) => setMsgTarget(e.target.value)}
          >
            <option value={ALL_PLAYERS}>All players (notification)</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="mgr-input"
            placeholder="Subject (optional)"
            maxLength={80}
            value={msgTitle}
            onChange={(e) => setMsgTitle(e.target.value)}
          />
        </div>
        <textarea
          className="mgr-textarea"
          placeholder="Message…"
          maxLength={500}
          rows={2}
          value={msgBody}
          onChange={(e) => setMsgBody(e.target.value)}
        />
        <div className="mgr-comms-foot">
          {msgStatus && <span className="mgr-comms-status">{msgStatus}</span>}
          <button className="mgr-send" onClick={sendMessage} disabled={!msgBody.trim()}>
            Send message
          </button>
        </div>
        {sentMessages.length > 0 && (
          <ul className="mgr-anns">
            {sentMessages.slice(0, 8).map((mm) => (
              <li key={mm.id} className="mgr-ann">
                <span className="mgr-ann-dot is-success" aria-hidden="true" />
                <div className="mgr-ann-body">
                  {mm.title && <strong>{mm.title}</strong>}
                  <span>{mm.body}</span>
                </div>
                <span className="mgr-hint">→ {mm.recipientName}</span>
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
          <span className="mgr-hint">
            {channels.length ? `Configured: ${channels.join(', ')}` : 'No channels configured yet.'}
          </span>
          <button className="mgr-mini" onClick={sendTest} disabled={!channels.length || sending}>
            Send test
          </button>
        </div>
      </section>
    </div>
  )
}
