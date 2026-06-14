/** Feature publishing: programs flip live + relay to Discord/Telegram on publish, schedules
 *  catch up when due, and every relay is logged. Webhook transport is reused from
 *  manager/communication; the sender (fetch) is injected so nothing hits the network. */
import { describe, it, expect, beforeEach } from 'vitest'
import { getRewardsConfig, resetRewardsConfig } from './economy.js'
import {
  programState,
  publishProgram,
  scheduleProgram,
  setProgramOff,
  runDueSchedules,
  getPublishLog,
  __resetPublishLog,
} from './publishing.js'
import { commsStore, EMPTY_WEBHOOKS } from '../manager/communication/index.js'

const NOW = 1_750_000_000_000
const DAY = 86_400_000

function mockFetch(result: { ok: boolean; status: number } | Error) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fn = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    if (result instanceof Error) throw result
    return result
  }) as unknown as typeof fetch
  return { fn, calls }
}

beforeEach(() => {
  resetRewardsConfig()
  __resetPublishLog()
  commsStore.setWebhooks({ ...EMPTY_WEBHOOKS })
})

describe('programState', () => {
  it('reflects live / scheduled / off', () => {
    expect(programState('promos')).toBe('live') // enabled by default
    setProgramOff('promos')
    expect(programState('promos')).toBe('off')
    scheduleProgram('promos', NOW + DAY)
    expect(programState('promos')).toBe('scheduled')
  })
})

describe('publishProgram', () => {
  it('flips the feature live, clears any schedule, relays to the webhook, and logs it', async () => {
    scheduleProgram('contests', NOW + DAY) // off + scheduled
    commsStore.setWebhooks({ discordUrl: 'https://discord/hook' })
    const { fn, calls } = mockFetch({ ok: true, status: 204 })

    const out = await publishProgram('contests', NOW, fn)

    // live now, schedule cleared
    expect(getRewardsConfig().enabled.contests).toBe(true)
    expect(getRewardsConfig().schedule.contests).toBeNull()
    // relayed to discord with the feature name in the message
    expect(out.status).toBe('sent')
    expect(out.channels).toEqual(['discord'])
    expect(calls[0].url).toBe('https://discord/hook')
    expect(String(calls[0].body.content)).toMatch(/Contests/)
    // logged
    expect(getPublishLog()[0]).toMatchObject({ key: 'contests', status: 'sent', channels: ['discord'] })
  })

  it('still publishes when no webhook is configured — logs a skip, no network call', async () => {
    const { fn, calls } = mockFetch({ ok: true, status: 200 })
    setProgramOff('daily')

    const out = await publishProgram('daily', NOW, fn)

    expect(out.status).toBe('skipped')
    expect(calls).toHaveLength(0)
    expect(getRewardsConfig().enabled.daily).toBe(true) // published regardless
    expect(getPublishLog()[0]).toMatchObject({ key: 'daily', status: 'skipped' })
  })

  it('reports a failed relay but still goes live', async () => {
    commsStore.setWebhooks({ discordUrl: 'https://d' })
    const { fn } = mockFetch({ ok: false, status: 500 })
    setProgramOff('missions')

    const out = await publishProgram('missions', NOW, fn)

    expect(out.status).toBe('failed')
    expect(getRewardsConfig().enabled.missions).toBe(true)
    expect(getPublishLog()[0]).toMatchObject({ key: 'missions', status: 'failed' })
  })
})

describe('runDueSchedules', () => {
  it('publishes only the schedules whose go-live has passed', async () => {
    setProgramOff('promos')
    setProgramOff('contests')
    scheduleProgram('promos', NOW - 1_000) // due
    scheduleProgram('contests', NOW + DAY) // future
    commsStore.setWebhooks({ discordUrl: 'https://d' })
    const { fn } = mockFetch({ ok: true, status: 204 })

    const published = await runDueSchedules(NOW, fn)

    expect(published).toEqual(['promos'])
    expect(programState('promos')).toBe('live')
    expect(programState('contests')).toBe('scheduled') // left alone
  })
})
