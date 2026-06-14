/**
 * Feature Publishing — the operator decides which reward features are live, schedules when
 * each goes live, and publishes them. Publishing flips a feature on for players AND relays an
 * alert to the operator's Discord / Telegram (the webhook layer is shared with Communication,
 * so one config drives both). A delivery log shows what went out. Manager only.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  getRewardsConfig,
  PROGRAM_KEYS,
  type ProgramKey,
} from '../../rewards/economy.js'
import {
  PROGRAM_META,
  programState,
  publishProgram,
  scheduleProgram,
  setProgramOff,
  runDueSchedules,
  relayTest,
  getPublishLog,
  subscribePublishLog,
  getPublishLogVersion,
} from '../../rewards/publishing.js'
import { commsStore, configuredChannels } from '../../manager/communication/index.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

const STATE_LABEL = { live: 'Live', scheduled: 'Scheduled', off: 'Off' } as const

export function PublishingPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  useSyncExternalStore(subscribePublishLog, getPublishLogVersion)
  useSyncExternalStore(commsStore.subscribe, commsStore.version)
  const [flash, setFlash] = useState<string | null>(null)

  // Catch up any schedules whose go-live time has already passed (idempotent).
  useEffect(() => {
    void runDueSchedules(Date.now())
  }, [])

  const webhooks = commsStore.webhooks()
  const channels = configuredChannels(webhooks)
  const log = getPublishLog()

  const sendTest = async () => {
    const out = await relayTest(Date.now())
    setFlash(
      out.status === 'skipped'
        ? 'No channels configured — add a Discord webhook or Telegram token below first.'
        : out.status === 'sent'
          ? `Test alert sent to ${out.channels.join(' + ')}.`
          : 'Test alert failed — check the URL/token (see log).',
    )
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Decide which reward features are live, schedule when each goes live, and publish on your
          terms. Publishing a feature turns it on for players and posts an alert to your Discord /
          Telegram.
        </p>
      </header>

      {flash && <p className="feat-saved">{flash}</p>}

      <section className="feat-card">
        <h3 className="feat-h2">Reward features</h3>
        <div className="rwa-list">
          {PROGRAM_KEYS.map((k) => (
            <FeatureRow key={k} programKey={k} onFlash={setFlash} />
          ))}
        </div>
      </section>

      <section className="feat-card">
        <div className="feat-head">
          <h3 className="feat-h2" style={{ margin: 0 }}>
            Alerts — Discord &amp; Telegram
          </h3>
          <span className="feat-sub" style={{ margin: 0 }}>
            {channels.length ? `Active: ${channels.join(' + ')}` : 'No channels configured yet'}
          </span>
        </div>
        <p className="feat-sub">
          When a reward feature is published, an alert is relayed to the channels you wire up here.
          The same config powers the Communication page.
        </p>
        <div className="rwa-wh-grid">
          <label className="feat-field rwa-grow">
            <span>Discord webhook URL</span>
            <input
              className="feat-input"
              placeholder="https://discord.com/api/webhooks/…"
              value={webhooks.discordUrl}
              onChange={(e) => commsStore.setWebhooks({ discordUrl: e.target.value })}
            />
          </label>
          <label className="feat-field">
            <span>Telegram bot token</span>
            <input
              className="feat-input"
              placeholder="123456:ABC-…"
              value={webhooks.telegramToken}
              onChange={(e) => commsStore.setWebhooks({ telegramToken: e.target.value })}
            />
          </label>
          <label className="feat-field">
            <span>Telegram chat ID</span>
            <input
              className="feat-input"
              placeholder="-1001234567890"
              value={webhooks.telegramChatId}
              onChange={(e) => commsStore.setWebhooks({ telegramChatId: e.target.value })}
            />
          </label>
        </div>
        <div className="feat-actions">
          <button className="feat-btn" onClick={sendTest}>
            Send test alert
          </button>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Recent alerts</h3>
        {log.length === 0 ? (
          <p className="feat-empty">Nothing published yet — publish a feature above to relay an alert.</p>
        ) : (
          <table className="rwa-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Feature</th>
                <th>Status</th>
                <th>Channels</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>{e.name}</td>
                  <td>
                    <span className={`rwa-pub-pill is-${e.status === 'sent' ? 'live' : e.status === 'skipped' ? 'off' : 'failed'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>{e.channels.length ? e.channels.join(' + ') : '—'}</td>
                  <td className="rwa-pub-detail">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </PanelShell>
  )
}

function FeatureRow({ programKey, onFlash }: { programKey: ProgramKey; onFlash: (m: string) => void }) {
  const [dt, setDt] = useState('')
  const state = programState(programKey)
  const meta = PROGRAM_META[programKey]
  const scheduledAt = getRewardsConfig().schedule[programKey]

  const publishNow = async () => {
    const out = await publishProgram(programKey, Date.now())
    onFlash(
      out.status === 'sent'
        ? `${meta.name} published — relayed to ${out.channels.join(' + ')}.`
        : out.status === 'skipped'
          ? `${meta.name} published. Add a Discord/Telegram webhook below to relay alerts.`
          : out.status === 'partial'
            ? `${meta.name} published — some channels failed (see the alerts log).`
            : `${meta.name} published — relay failed (see the alerts log).`,
    )
  }

  const schedule = () => {
    const ms = new Date(dt).getTime()
    if (!Number.isFinite(ms)) return
    scheduleProgram(programKey, ms)
    onFlash(`${meta.name} scheduled for ${new Date(ms).toLocaleString()}.`)
    setDt('')
  }

  return (
    <div className={`rwa-row rwa-pub-row ${state === 'off' ? 'is-off' : ''}`}>
      <div className="rwa-row-main">
        <span className="rwa-row-name">{meta.name}</span>
        <span className="feat-sub" style={{ margin: 0 }}>
          {meta.blurb}
        </span>
        {state === 'scheduled' && scheduledAt != null && (
          <span className="rwa-pub-when">Goes live {new Date(scheduledAt).toLocaleString()}</span>
        )}
      </div>

      <span className={`rwa-pub-pill is-${state}`}>{STATE_LABEL[state]}</span>

      <div className="rwa-pub-actions">
        {state !== 'live' && (
          <>
            <input
              className="feat-input rwa-pub-dt"
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              aria-label={`Schedule ${meta.name} go-live`}
            />
            <button className="feat-btn" onClick={schedule} disabled={!dt}>
              Schedule
            </button>
          </>
        )}
        {state === 'live' && (
          <button
            className="feat-btn"
            onClick={() => {
              setProgramOff(programKey)
              onFlash(`${meta.name} turned off.`)
            }}
          >
            Turn off
          </button>
        )}
        {state === 'scheduled' && (
          <button
            className="feat-btn"
            onClick={() => {
              setProgramOff(programKey)
              onFlash(`${meta.name} schedule cancelled.`)
            }}
          >
            Cancel
          </button>
        )}
        <button className="feat-btn feat-btn-primary" onClick={publishNow}>
          Publish now
        </button>
      </div>
    </div>
  )
}
