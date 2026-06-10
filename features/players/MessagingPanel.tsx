import { useMemo, useState, useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { membersByRole } from '../../org/index.js'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import { ALL_PLAYERS, type PlayerMessage } from '../../manager/communication/messages.js'
import { messagesStore } from '../../manager/communication/messages-store.js'
import {
  analyticsVersion,
  getAnalyticsRecords,
  perPlayerActivity,
  subscribeAnalytics,
} from '../../manager/reporting/index.js'
import { getPlayerVip, getVipConfig, getVipVersion, subscribeVip } from '../../app/vip-store.js'
import { rankFor } from '../../vip/index.js'
import { classify, SEGMENT_LABEL, type Segment } from '../../app/console/segments.js'
import './players.css'
import './messaging.css'

/**
 * Messaging — operator → player in-app messaging console (CLAUDE.md §4 "honest by
 * default"; players, not money). A purpose-built UI over the existing pure
 * `messagesStore` (manager/communication): compose a direct message to one player,
 * a broadcast to everyone, or a segment blast; review what's been Sent; and a
 * placeholder Inbox for the not-yet-modelled player→operator channel.
 *
 * Carries NO money — messaging never touches a figure — so nothing here renders a
 * coin amount or routes through core. Reactive over the messages store (sent list)
 * and the book/reporting/VIP stores (player roster + live segment membership).
 */

type Tab = 'compose' | 'sent' | 'inbox'
type TargetKind = 'everyone' | 'player' | 'segment'

const SEGMENT_ORDER: Segment[] = ['new', 'casual', 'vip', 'dormant']

interface SegmentSets {
  /** Player ids per segment, derived from the live reporting + VIP feed. */
  members: Record<Segment, { id: string; name: string }[]>
}

export function MessagingPanel({ onBack }: { onBack: () => void }) {
  void onBack // the shell owns the back affordance; this panel renders its body only

  const bookV = useSyncExternalStore(subscribeBook, getBookVersion)
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  const vv = useSyncExternalStore(subscribeVip, getVipVersion)
  const msgV = useSyncExternalStore(messagesStore.subscribe, messagesStore.version)

  const org = getBook()
  const players = useMemo(() => membersByRole(org, 'player'), [org, bookV])
  const sent = useMemo(() => messagesStore.messages(), [msgV])

  // Live segment membership, resolved exactly like the Segments panel (reporting
  // activity + the VIP program) so a "segment blast" goes to the segment's real
  // player set rather than a faked-out group.
  const segments = useMemo<SegmentSets>(() => {
    const now = Date.now()
    const config = getVipConfig()
    const acts = perPlayerActivity(getAnalyticsRecords())
    const members: Record<Segment, { id: string; name: string }[]> = {
      new: [],
      casual: [],
      vip: [],
      dormant: [],
    }
    for (const a of acts) {
      const member = org.members[a.accountId]
      if (!member || member.role !== 'player') continue
      const isVip = rankFor(getPlayerVip(a.accountId).wagered, config).id !== 'none'
      members[classify(a, now, isVip)].push({ id: member.id, name: member.name })
    }
    return { members }
    // av/vv/bookV are the change signals for the underlying feeds.
  }, [org, av, vv, bookV])

  const [tab, setTab] = useState<Tab>('compose')

  return (
    <div className="feat">
      <nav className="msg-tabs" aria-label="Messaging sections">
        <Tab id="compose" tab={tab} setTab={setTab} label="Compose" />
        <Tab id="sent" tab={tab} setTab={setTab} label="Sent" count={sent.length} />
        <Tab id="inbox" tab={tab} setTab={setTab} label="Inbox" />
      </nav>

      {tab === 'compose' && <Compose players={players} segments={segments} />}
      {tab === 'sent' && <Sent messages={sent} />}
      {tab === 'inbox' && <Inbox />}
    </div>
  )
}

function Tab({
  id,
  tab,
  setTab,
  label,
  count,
}: {
  id: Tab
  tab: Tab
  setTab: (t: Tab) => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      className={`msg-tab ${tab === id ? 'is-on' : ''}`}
      aria-pressed={tab === id}
      onClick={() => setTab(id)}
    >
      {label}
      {count !== undefined && count > 0 && <span className="msg-tab-count">{count}</span>}
    </button>
  )
}

/* ------------------------------- compose -------------------------------- */

function Compose({
  players,
  segments,
}: {
  players: { id: string; name: string }[]
  segments: SegmentSets
}) {
  const org = getBook()
  const [kind, setKind] = useState<TargetKind>('everyone')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [segment, setSegment] = useState<Segment>('vip')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const player = playerId ? org.members[playerId] : null
  const segPlayers = segments.members[segment]

  function pick(next: TargetKind) {
    setKind(next)
    setOk(null)
    setErr(null)
  }

  function send() {
    setOk(null)
    setErr(null)
    try {
      if (kind === 'everyone') {
        messagesStore.send(ALL_PLAYERS, 'All players', title, body)
        setOk('Sent to all players.')
      } else if (kind === 'player') {
        if (!player || player.role !== 'player') {
          setErr('Choose a player to message.')
          return
        }
        messagesStore.send(player.id, player.name, title, body)
        setOk(`Sent to ${player.name}.`)
      } else {
        // SEAM: segment targeting currently fans the blast out to each member of the
        // live segment as an individual DM (resolved from reporting + VIP). When a
        // shared segments store lands, this could send one addressable segment
        // message instead of N DMs — // SEAM: messagesStore.sendToSegment(segmentId).
        if (segPlayers.length === 0) {
          setErr(`No players are in the ${SEGMENT_LABEL[segment]} segment yet.`)
          return
        }
        // send() throws on empty body — guard once up front so we don't send a
        // partial blast (some DMs out, then a throw mid-loop).
        if (!body.trim()) {
          messagesStore.send(segPlayers[0].id, segPlayers[0].name, title, body) // throws
          return
        }
        for (const p of segPlayers) messagesStore.send(p.id, p.name, title, body)
        setOk(
          `Sent to ${segPlayers.length} ${SEGMENT_LABEL[segment]} player${segPlayers.length === 1 ? '' : 's'}.`,
        )
      }
      setTitle('')
      setBody('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="feat-form">
      <div className="feat-field">
        <span>Send to</span>
        <div className="msg-targets" role="group" aria-label="Recipient">
          <button
            type="button"
            className={`msg-target ${kind === 'everyone' ? 'is-on' : ''}`}
            onClick={() => pick('everyone')}
          >
            Everyone
          </button>
          <button
            type="button"
            className={`msg-target ${kind === 'player' ? 'is-on' : ''}`}
            onClick={() => pick('player')}
          >
            A player
          </button>
          <button
            type="button"
            className={`msg-target ${kind === 'segment' ? 'is-on' : ''}`}
            onClick={() => pick('segment')}
          >
            A segment
          </button>
        </div>
      </div>

      {kind === 'everyone' && (
        <p className="msg-recip">
          Broadcast to <strong>all {players.length} players</strong> — shows in every player's inbox.
        </p>
      )}

      {kind === 'player' && (
        <div className="msg-search-wrap">
          <PlayerSearch org={org} onSelect={(id) => setPlayerId(id)} />
          <p className="msg-recip">
            {player && player.role === 'player' ? (
              <>
                Messaging <strong>{player.name}</strong>.
              </>
            ) : (
              'Search and pick one player.'
            )}
          </p>
        </div>
      )}

      {kind === 'segment' && (
        <div className="msg-select">
          <div className="msg-seg-pills" role="group" aria-label="Segment">
            {SEGMENT_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`msg-target ${segment === s ? 'is-on' : ''}`}
                onClick={() => setSegment(s)}
              >
                {SEGMENT_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="msg-recip">
            <strong>
              {segPlayers.length} player{segPlayers.length === 1 ? '' : 's'}
            </strong>{' '}
            in {SEGMENT_LABEL[segment]} — each gets a direct message.
          </p>
        </div>
      )}

      <label className="feat-field">
        <span>Subject (optional)</span>
        <input
          className="feat-input"
          placeholder="Subject"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="feat-field">
        <span>Message</span>
        <textarea
          className="msg-textarea"
          placeholder="Write your message to your players…"
          maxLength={500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      <div className="feat-actions">
        <button
          type="button"
          className="feat-btn is-primary"
          onClick={send}
          disabled={!body.trim()}
        >
          Send
        </button>
      </div>
      {ok && <p className="feat-ok">{ok}</p>}
      {err && <p className="feat-err">{err}</p>}
    </div>
  )
}

/* --------------------------------- sent --------------------------------- */

function Sent({ messages }: { messages: PlayerMessage[] }) {
  // SEAM: persistent delete needs messagesStore.remove(id) — the store has no delete
  // and it isn't this panel's module to edit. For now "Delete" hides the row locally
  // (this session only); it reappears on reload until the store grows a remove.
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  const shown = messages.filter((m) => !dismissed.has(m.id))
  if (shown.length === 0) {
    return (
      <p className="feat-empty">
        {messages.length === 0
          ? 'No messages sent yet. Compose one to reach your players.'
          : 'All sent messages are dismissed.'}
      </p>
    )
  }

  return (
    <ul className="msg-list" aria-label="Sent messages">
      {shown.map((m) => (
        <li key={m.id} className="msg-item">
          <div className="msg-item-body">
            <span className="msg-item-to">→ {m.recipientName}</span>
            {m.title && <div className="msg-item-title">{m.title}</div>}
            <div className="msg-item-preview">{m.body}</div>
          </div>
          <div className="msg-item-meta">
            <time className="msg-item-time" dateTime={new Date(m.time).toISOString()}>
              {formatWhen(m.time)}
            </time>
            <button
              type="button"
              className="msg-del"
              aria-label={`Delete message to ${m.recipientName}`}
              onClick={() => setDismissed((prev) => new Set(prev).add(m.id))}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------- inbox --------------------------------- */

function Inbox() {
  // SEAM: an operator inbox (player replies / support threads) is not yet modeled —
  // there's no player→operator channel in messagesStore. Render an honest empty
  // state rather than fabricating inbound messages.
  return (
    <div className="feat-card">
      <h3 className="feat-h">No inbound messages</h3>
      <p className="feat-empty">
        Players can't yet reply to the operator — there's no player → operator channel.
        When replies and support threads are modeled, they'll land here.
      </p>
    </div>
  )
}

/* ------------------------------- helpers -------------------------------- */

/** Relative time for recent sends, falling back to an absolute date for older ones. */
function formatWhen(time: number): string {
  const diff = Date.now() - time
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.round(hr / 24)
  if (days < 7) return `${days}d ago`
  return new Date(time).toLocaleDateString()
}
