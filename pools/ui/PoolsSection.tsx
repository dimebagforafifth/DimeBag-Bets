/**
 * Pools & Leagues — the player surface: browse joinable pools, create one, make picks (entry
 * fee holds through core), and watch the read-only standings. Money moves ONLY through the store
 * (core place/grant); amounts render via formatMoney. Mounted via the prop-aware section registry.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft } from 'lucide-react'
import { availableToWager, type Account } from '../../core/index.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import {
  createPool,
  enterPool,
  entriesForAccount,
  entriesForPool,
  poolsVersion,
  subscribePools,
  visiblePools,
} from '../store.js'
import { getPoolsPolicy } from '../policy.js'
import { formatFor } from '../formats/index.js'
import { poolStandings } from '../standings.js'
import type { PoolConfig, PoolPicks } from '../formats/types.js'
import type { Pool, PoolKind } from '../types.js'
import './pools.css'

interface PoolsProps {
  viewerId: string
  viewerName: string
  account: Account
  onBalanceChange?: () => void
  role?: string
}

const DAY = 86_400_000
const KIND_LABEL: Record<string, string> = {
  pickem: "Pick'em",
  confidence: 'Confidence',
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
}
const projectedPot = (p: Pool, entrants: number): number =>
  p.guaranteedCents + p.entryCents * entrants
const defaultSplit = (kind: PoolKind): number[] => {
  if (kind === 'survivor') return [1]
  if (kind === 'squares') return [0.2, 0.2, 0.2, 0.4]
  return [0.6, 0.3, 0.1]
}

export function PoolsSection({ viewerId, viewerName, account, onBalanceChange }: PoolsProps) {
  useSyncExternalStore(subscribePools, poolsVersion)
  const [tab, setTab] = useState<'browse' | 'mine' | 'create'>('browse')
  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const pools = visiblePools(viewerId)
  const open = openId ? pools.find((p) => p.id === openId) : undefined

  const refresh = (msg?: string): void => {
    if (msg) setFlash(msg)
    onBalanceChange?.()
  }

  if (open) {
    return (
      <div className="pool">
        <button type="button" className="pool-back" onClick={() => setOpenId(null)}>
          <ArrowLeft size={14} /> All pools
        </button>
        <PoolDetail
          pool={open}
          viewerId={viewerId}
          viewerName={viewerName}
          account={account}
          onJoined={() => refresh('You’re in — good luck.')}
        />
      </div>
    )
  }

  return (
    <div className="pool">
      <header className="pool-top">
        <div>
          <h1 className="pool-h1">Pools &amp; Leagues</h1>
          <p className="pool-sub">
            Pick’em, survivor, bracket, squares — winner-take-the-pot, no house edge beyond the
            rake.
          </p>
        </div>
      </header>

      {flash && <p className="pool-flash">{flash}</p>}

      <div className="pool-tabs">
        {(['browse', 'mine', 'create'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`pool-tab${tab === t ? ' is-on' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'browse' ? 'Browse' : t === 'mine' ? 'My pools' : 'Create'}
          </button>
        ))}
      </div>

      {tab === 'browse' && <BrowseList pools={pools} onOpen={setOpenId} />}
      {tab === 'mine' && <MyPools pools={pools} accountId={account.id} onOpen={setOpenId} />}
      {tab === 'create' && (
        <CreateWizard
          viewerId={viewerId}
          viewerName={viewerName}
          role="player"
          onCreated={(id) => {
            setTab('browse')
            setOpenId(id)
            refresh('Pool created.')
          }}
        />
      )}
    </div>
  )
}

function StatusPill({ pool }: { pool: Pool }) {
  return <span className={`pool-pill is-${pool.lifecycle}`}>{pool.lifecycle}</span>
}

function BrowseList({ pools, onOpen }: { pools: Pool[]; onOpen: (id: string) => void }) {
  if (pools.length === 0) return <p className="pool-empty">No pools yet — create the first one.</p>
  return (
    <div className="pool-list">
      {pools.map((p) => (
        <button
          key={p.id}
          type="button"
          className="pool-card"
          style={{ textAlign: 'left', cursor: 'pointer' }}
          onClick={() => onOpen(p.id)}
        >
          <div className="pool-card-top">
            <div>
              <div className="pool-name">{p.name}</div>
              <div className="pool-kind">{KIND_LABEL[p.kind] ?? p.kind}</div>
            </div>
            <StatusPill pool={p} />
          </div>
          <div className="pool-chips">
            <span className="pool-chip">
              Entry {p.entryCents === 0 ? 'Free' : formatMoney(p.entryCents)}
            </span>
            <span className="pool-chip">
              Pot {formatMoney(projectedPot(p, entriesForPool(p.id).length))}
            </span>
            <span className="pool-chip">{entriesForPool(p.id).length} in</span>
            <span className="pool-chip">{p.privacy}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function MyPools({
  pools,
  accountId,
  onOpen,
}: {
  pools: Pool[]
  accountId: string
  onOpen: (id: string) => void
}) {
  const mineIds = new Set(entriesForAccount(accountId).map((e) => e.poolId))
  const mine = pools.filter((p) => mineIds.has(p.id))
  if (mine.length === 0) return <p className="pool-empty">You haven’t joined any pools yet.</p>
  return <BrowseList pools={mine} onOpen={onOpen} />
}

/* ----------------------------- pool detail ----------------------------- */

function PoolDetail({
  pool,
  viewerId,
  viewerName,
  account,
  onJoined,
}: {
  pool: Pool
  viewerId: string
  viewerName: string
  account: Account
  onJoined: () => void
}) {
  const entries = entriesForPool(pool.id)
  const standings = useMemo(() => poolStandings(pool, entries), [pool, entries])
  const entered = entries.some((e) => e.accountId === viewerId)
  const canJoin = pool.lifecycle === 'open' && !pool.demo && !entered

  return (
    <>
      <div className="pool-card-top">
        <div>
          <div className="pool-name">{pool.name}</div>
          <div className="pool-kind">{KIND_LABEL[pool.kind] ?? pool.kind}</div>
        </div>
        <StatusPill pool={pool} />
      </div>
      <div className="pool-chips">
        <span className="pool-chip">
          Entry {pool.entryCents === 0 ? 'Free' : formatMoney(pool.entryCents)}
        </span>
        <span className="pool-chip">
          Pot {formatMoney(pool.prizePoolCents ?? projectedPot(pool, entries.length))}
        </span>
        <span className="pool-chip">{entries.length} entrants</span>
        {pool.rakeBps > 0 && (
          <span className="pool-chip">Rake {(pool.rakeBps / 100).toFixed(1)}%</span>
        )}
      </div>

      {canJoin && (
        <JoinForm
          pool={pool}
          viewerId={viewerId}
          viewerName={viewerName}
          account={account}
          onJoined={onJoined}
        />
      )}

      {standings.length > 0 && (
        <table className="pool-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Score</th>
              {pool.payouts && <th className="num">Prize</th>}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const prize = pool.payouts?.find((p) => p.accountId === s.accountId)?.prizeCents
              return (
                <tr
                  key={s.accountId}
                  className={s.accountId === viewerId ? 'pool-mine' : undefined}
                >
                  <td>{s.rank}</td>
                  <td>
                    {s.name}
                    {s.note ? ` · ${s.note}` : ''}
                  </td>
                  <td className="num">{s.points}</td>
                  {pool.payouts && <td className="num">{prize ? formatMoney(prize) : '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {standings.length === 0 && <p className="pool-empty">No entrants yet.</p>}
    </>
  )
}

/* ------------------------------ join form ------------------------------ */

function JoinForm({
  pool,
  viewerId,
  viewerName,
  account,
  onJoined,
}: {
  pool: Pool
  viewerId: string
  viewerName: string
  account: Account
  onJoined: () => void
}) {
  const [picks, setPicks] = useState<PoolPicks>(() => emptyPicks(pool))
  const [err, setErr] = useState<string | null>(null)
  const affordable = pool.entryCents <= availableToWager(account)

  const join = (): void => {
    try {
      enterPool({ poolId: pool.id, account, playerName: viewerName, picks, now: Date.now() })
      setErr(null)
      onJoined()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not enter')
    }
  }

  return (
    <div className="pool-form">
      <PicksEditor pool={pool} value={picks} onChange={setPicks} viewerId={viewerId} />
      {!affordable && <p className="pool-warn">Entry fee exceeds your available credit.</p>}
      {err && <p className="pool-warn">{err}</p>}
      <div className="pool-actions">
        <button type="button" className="pool-btn" onClick={join} disabled={!affordable}>
          {pool.entryCents === 0 ? 'Join free' : `Join · ${formatMoney(pool.entryCents)}`}
        </button>
      </div>
    </div>
  )
}

function emptyPicks(pool: Pool): PoolPicks {
  switch (pool.kind) {
    case 'pickem':
      return { kind: 'pickem', selections: {} }
    case 'confidence':
      return { kind: 'confidence', selections: {}, confidence: {} }
    case 'survivor':
      return { kind: 'survivor', selections: {} }
    case 'bracket':
      return { kind: 'bracket', winners: {} }
    case 'squares':
      return { kind: 'squares', squares: [] }
    default:
      return { kind: 'pickem', selections: {} }
  }
}

function PicksEditor({
  pool,
  value,
  onChange,
}: {
  pool: Pool
  value: PoolPicks
  onChange: (p: PoolPicks) => void
  viewerId: string
}) {
  const config = pool.config

  if (
    (config.kind === 'pickem' || config.kind === 'confidence') &&
    (value.kind === 'pickem' || value.kind === 'confidence')
  ) {
    const isConf = config.kind === 'confidence'
    const sel = value.selections
    const conf = value.kind === 'confidence' ? value.confidence : {}
    return (
      <div>
        {config.games.map((g) => (
          <div key={g.id} className="pool-pick-row">
            <span className="pool-pick-label">{g.label}</span>
            {g.options.map((o) => (
              <button
                key={o}
                type="button"
                className={`pool-opt${sel[g.id] === o ? ' is-on' : ''}`}
                onClick={() =>
                  onChange({ ...value, selections: { ...sel, [g.id]: o } } as PoolPicks)
                }
              >
                {o}
              </button>
            ))}
            {isConf && (
              <input
                className="pool-conf"
                type="number"
                min={1}
                max={config.games.length}
                value={conf[g.id] ?? ''}
                placeholder="rank"
                onChange={(e) =>
                  onChange({
                    ...value,
                    confidence: { ...conf, [g.id]: Number(e.target.value) },
                  } as PoolPicks)
                }
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  if (config.kind === 'survivor' && value.kind === 'survivor') {
    const rounds = Array.from({ length: config.rounds }, (_, i) => i)
    const used = new Set(Object.values(value.selections))
    return (
      <div>
        {rounds.map((r) => (
          <div key={r} className="pool-pick-row">
            <span className="pool-pick-label">Round {r + 1}</span>
            <select
              value={value.selections[r] ?? ''}
              onChange={(e) =>
                onChange({ ...value, selections: { ...value.selections, [r]: e.target.value } })
              }
            >
              <option value="">— pick —</option>
              {config.teams.map((t) => (
                <option key={t} value={t} disabled={used.has(t) && value.selections[r] !== t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    )
  }

  if (config.kind === 'bracket' && value.kind === 'bracket') {
    return (
      <div>
        {config.matchups.map((m) => (
          <div key={m.id} className="pool-pick-row">
            <span className="pool-pick-label">
              {m.teamA} vs {m.teamB}
            </span>
            {[m.teamA, m.teamB].map((t) => (
              <button
                key={t}
                type="button"
                className={`pool-opt${value.winners[m.id] === t ? ' is-on' : ''}`}
                onClick={() => onChange({ ...value, winners: { ...value.winners, [m.id]: t } })}
              >
                {t}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (config.kind === 'squares' && value.kind === 'squares') {
    const sq = value.squares[0] ?? { row: 0, col: 0 }
    return (
      <div className="pool-row">
        <label className="pool-field">
          <span>Home digit (0–9)</span>
          <input
            type="number"
            min={0}
            max={9}
            value={sq.row}
            onChange={(e) =>
              onChange({ kind: 'squares', squares: [{ row: Number(e.target.value), col: sq.col }] })
            }
          />
        </label>
        <label className="pool-field">
          <span>Away digit (0–9)</span>
          <input
            type="number"
            min={0}
            max={9}
            value={sq.col}
            onChange={(e) =>
              onChange({ kind: 'squares', squares: [{ row: sq.row, col: Number(e.target.value) }] })
            }
          />
        </label>
      </div>
    )
  }

  return null
}

/* ---------------------------- create wizard ---------------------------- */

export function CreateWizard({
  viewerId,
  viewerName,
  role,
  onCreated,
}: {
  viewerId: string
  viewerName: string
  role: 'player' | 'operator'
  onCreated: (id: string) => void
}) {
  const policy = getPoolsPolicy()
  const allowed =
    role === 'operator'
      ? (['pickem', 'confidence', 'survivor', 'bracket', 'squares'] as PoolKind[])
      : policy.allowedFormats
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PoolKind>(allowed[0] ?? 'pickem')
  const [entry, setEntry] = useState('5')
  const [privacy, setPrivacy] = useState<'public' | 'invite' | 'friends'>('public')
  const [days, setDays] = useState('1')
  const [err, setErr] = useState<string | null>(null)

  const create = (): void => {
    try {
      const config: PoolConfig = formatFor(kind).defaultConfig()
      const split =
        kind === 'squares' && config.kind === 'squares' ? config.periodWeights : defaultSplit(kind)
      const pool = createPool({
        creatorId: viewerId,
        creatorName: viewerName,
        creatorIsOperator: role === 'operator',
        name,
        kind,
        scope: 'event',
        privacy,
        entryCents: toCents(Number(entry)),
        maxEntries: null,
        minEntries: 2,
        guaranteedCents: 0,
        prizeStructure: split,
        config,
        lockAt: Date.now() + Math.max(0, Number(days)) * DAY,
        now: Date.now(),
      })
      setErr(null)
      onCreated(pool.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create')
    }
  }

  if (role === 'player' && !policy.allowPlayerPools) {
    return (
      <p className="pool-empty">Player-created pools are currently disabled by the operator.</p>
    )
  }

  return (
    <div className="pool-form">
      <label className="pool-field">
        <span>Pool name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sunday Pick’em"
        />
      </label>
      <div className="pool-row">
        <label className="pool-field">
          <span>Format</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as PoolKind)}>
            {allowed.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label className="pool-field">
          <span>Entry ($, 0 = free)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
        </label>
      </div>
      <div className="pool-row">
        <label className="pool-field">
          <span>Privacy</span>
          <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
            <option value="public">Public</option>
            <option value="friends">Friends</option>
            <option value="invite">Invite only</option>
          </select>
        </label>
        <label className="pool-field">
          <span>Locks in (days)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
      </div>
      {err && <p className="pool-warn">{err}</p>}
      <div className="pool-actions">
        <button type="button" className="pool-btn" onClick={create} disabled={!name.trim()}>
          Create pool
        </button>
      </div>
    </div>
  )
}
