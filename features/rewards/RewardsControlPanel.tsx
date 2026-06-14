/**
 * Rewards — the manager's simple control: turn the player-facing features on/off (Rakeback,
 * Daily Sign-In Bonus, Free Spins, Promos), run Profit-Boost promos (DraftKings/Stake style —
 * "25% on all bets up to $100"), and announce any of it to Discord / Telegram. One panel,
 * manager only. Credits only — no cash.
 */
import { useState, useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  type RewardFeature,
  type ProfitBoost,
} from '../../rewards/economy.js'
import { fmt } from '../../rewards/data.js'
import {
  announceFeature,
  announcePromo,
  relayTest,
  getPublishLog,
  subscribePublishLog,
  getPublishLogVersion,
} from '../../rewards/publishing.js'
import { commsStore, configuredChannels } from '../../manager/communication/index.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

const FEATURES: { key: RewardFeature; label: string; hint: string }[] = [
  { key: 'rakeback', label: 'Rakeback', hint: 'A % of every wager back as credits' },
  { key: 'daily', label: 'Daily Sign-In Bonus', hint: 'Daily credits that grow with a streak' },
  { key: 'freeSpins', label: 'Free Spins', hint: 'Spins on the wheel that pay credits' },
  { key: 'promos', label: 'Promos / Profit Boosts', hint: 'Boost winnings on qualifying bets' },
]

export function RewardsControlPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  useSyncExternalStore(subscribePublishLog, getPublishLogVersion)
  useSyncExternalStore(commsStore.subscribe, commsStore.version)
  const [flash, setFlash] = useState<string | null>(null)

  const l = getRewardsConfig().loyalty
  const webhooks = commsStore.webhooks()
  const channels = configuredChannels(webhooks)
  const log = getPublishLog()

  const setFeature = (key: RewardFeature, on: boolean) =>
    updateRewardsConfig({ loyalty: { ...getRewardsConfig().loyalty, features: { ...l.features, [key]: on } } })
  const setBoosts = (next: ProfitBoost[]) =>
    updateRewardsConfig({ loyalty: { ...getRewardsConfig().loyalty, boosts: next } })

  const flashOutcome = (what: string, status: string) =>
    setFlash(
      status === 'sent' ? `${what} — announced to ${channels.join(' + ')}.`
        : status === 'skipped' ? `${what}. (Add a webhook below to announce it.)`
          : `${what} — announce failed (see log).`,
    )

  // ── promo builder ──
  const [name, setName] = useState('25% Profit Boost')
  const [pct, setPct] = useState('25')
  const [cap, setCap] = useState('100')
  const createBoost = async () => {
    if (!name.trim()) return
    const b: ProfitBoost = {
      id: `boost-${name.trim().toLowerCase().replace(/\s+/g, '-')}-${l.boosts.length}`,
      name: name.trim(),
      boostPct: Number(pct) || 0,
      maxStake: Number(cap) || 0,
      active: true,
    }
    setBoosts([b, ...l.boosts])
    const out = await announcePromo(b.name, `${b.boostPct}% profit boost on all bets up to ${fmt(b.maxStake)}.`, Date.now())
    flashOutcome(`Promo "${b.name}" is live`, out.status)
  }
  const toggleBoost = (id: string) => setBoosts(l.boosts.map((b) => (b.id === id ? { ...b, active: !b.active } : b)))
  const removeBoost = (id: string) => setBoosts(l.boosts.filter((b) => b.id !== id))

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Turn rewards on/off, run profit-boost promos, and announce them to your Discord / Telegram.
          Everything is credits — no cash.
        </p>
      </header>

      {flash && <p className="feat-saved">{flash}</p>}

      {/* ── Features ── */}
      <section className="feat-card">
        <h3 className="feat-h2">Features</h3>
        <div className="rwa-list">
          {FEATURES.map((f) => {
            const on = l.features[f.key]
            return (
              <div className={`feat-card rwa-row ${on ? '' : 'is-off'}`} key={f.key}>
                <div className="rwa-row-main">
                  <span className="rwa-row-name">{f.label}</span>
                  <span className="feat-sub">{f.hint}</span>
                </div>
                <span className={`rwa-pub-pill is-${on ? 'live' : 'off'}`}>{on ? 'Live' : 'Off'}</span>
                <button className={`feat-btn ${on ? 'feat-btn-primary' : ''}`} onClick={() => setFeature(f.key, !on)}>
                  {on ? 'Turn off' : 'Turn on'}
                </button>
                <button
                  className="feat-btn"
                  onClick={async () => {
                    const out = await announceFeature(f.label, Date.now())
                    flashOutcome(`${f.label} is live`, out.status)
                  }}
                >
                  Announce
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Profit boosts ── */}
      <section className="feat-card">
        <h3 className="feat-h2">Profit boosts</h3>
        <p className="feat-sub">
          A profit boost adds a % to the profit on every winning bet, on up to the cap of stake —
          like “25% profit boost on all bets up to $100”.
        </p>
        <div className="rwa-promo-form">
          <label className="feat-field rwa-grow">
            <span>Name</span>
            <input className="feat-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="25% Profit Boost" />
          </label>
          <label className="feat-field rwa-pool">
            <span>Boost %</span>
            <input className="feat-input" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label className="feat-field rwa-pool">
            <span>Up to ($ stake)</span>
            <input className="feat-input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <button className="feat-btn feat-btn-primary" onClick={createBoost} disabled={!name.trim()}>
            Create &amp; announce
          </button>
        </div>

        <div className="rwa-list">
          {l.boosts.length === 0 && <p className="feat-empty">No profit boosts yet.</p>}
          {l.boosts.map((b) => (
            <section className={`feat-card rwa-row ${b.active ? '' : 'is-off'}`} key={b.id}>
              <div className="rwa-row-main">
                <span className="rwa-row-name">{b.name}</span>
                <span className="feat-sub">
                  +{b.boostPct}% on winning bets · up to {fmt(b.maxStake)} stake
                </span>
              </div>
              <span className={`rwa-pub-pill is-${b.active ? 'live' : 'off'}`}>{b.active ? 'Live' : 'Off'}</span>
              <button className={`feat-btn ${b.active ? 'feat-btn-primary' : ''}`} onClick={() => toggleBoost(b.id)}>
                {b.active ? 'Pause' : 'Run'}
              </button>
              <button className="feat-btn" onClick={() => removeBoost(b.id)} aria-label={`Remove ${b.name}`}>
                ✕
              </button>
            </section>
          ))}
        </div>
      </section>

      {/* ── Alerts ── */}
      <section className="feat-card">
        <div className="feat-head">
          <h3 className="feat-h2" style={{ margin: 0 }}>
            Alerts — Discord &amp; Telegram
          </h3>
          <span className="feat-sub" style={{ margin: 0 }}>
            {channels.length ? `Active: ${channels.join(' + ')}` : 'No channels configured yet'}
          </span>
        </div>
        <div className="rwa-wh-grid">
          <label className="feat-field rwa-grow">
            <span>Discord webhook URL</span>
            <input className="feat-input" placeholder="https://discord.com/api/webhooks/…" value={webhooks.discordUrl} onChange={(e) => commsStore.setWebhooks({ discordUrl: e.target.value })} />
          </label>
          <label className="feat-field">
            <span>Telegram bot token</span>
            <input className="feat-input" placeholder="123456:ABC-…" value={webhooks.telegramToken} onChange={(e) => commsStore.setWebhooks({ telegramToken: e.target.value })} />
          </label>
          <label className="feat-field">
            <span>Telegram chat ID</span>
            <input className="feat-input" placeholder="-1001234567890" value={webhooks.telegramChatId} onChange={(e) => commsStore.setWebhooks({ telegramChatId: e.target.value })} />
          </label>
        </div>
        <div className="feat-actions">
          <button
            className="feat-btn"
            onClick={async () => {
              const out = await relayTest(Date.now())
              setFlash(out.status === 'skipped' ? 'Add a Discord/Telegram webhook first.' : out.status === 'sent' ? `Test sent to ${out.channels.join(' + ')}.` : 'Test failed (see log).')
            }}
          >
            Send test alert
          </button>
        </div>
        {log.length > 0 && (
          <table className="rwa-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Status</th>
                <th>Channels</th>
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 8).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>{e.name}</td>
                  <td>
                    <span className={`rwa-pub-pill is-${e.status === 'sent' ? 'live' : e.status === 'skipped' ? 'off' : 'failed'}`}>{e.status}</span>
                  </td>
                  <td>{e.channels.length ? e.channels.join(' + ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </PanelShell>
  )
}
