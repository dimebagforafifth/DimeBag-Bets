/** Reward announcements: publishing a feature / running a promo relays to Discord/Telegram
 *  (reusing manager/communication) and logs it. Sender is injected — no network in tests. */
import { describe, it, expect, beforeEach } from 'vitest'
import { announceFeature, announcePromo, relayTest, getPublishLog, __resetPublishLog } from './publishing.js'
import { commsStore, EMPTY_WEBHOOKS } from '../manager/communication/index.js'

const NOW = 1_750_000_000_000

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
  __resetPublishLog()
  commsStore.setWebhooks({ ...EMPTY_WEBHOOKS })
})

describe('announceFeature', () => {
  it('relays the feature name to the configured webhook and logs it', async () => {
    commsStore.setWebhooks({ discordUrl: 'https://discord/hook' })
    const { fn, calls } = mockFetch({ ok: true, status: 204 })
    const out = await announceFeature('Rakeback', NOW, fn)
    expect(out.status).toBe('sent')
    expect(out.channels).toEqual(['discord'])
    expect(String(calls[0].body.content)).toMatch(/Rakeback/)
    expect(getPublishLog()[0]).toMatchObject({ kind: 'feature', name: 'Rakeback', status: 'sent' })
  })
})

describe('announcePromo', () => {
  it('relays the promo name + detail', async () => {
    commsStore.setWebhooks({ telegramToken: 'TOK', telegramChatId: '42' })
    const { fn, calls } = mockFetch({ ok: true, status: 200 })
    const out = await announcePromo('25% Profit Boost', '25% profit boost on all bets up to $100.', NOW, fn)
    expect(out.status).toBe('sent')
    expect(calls[0].url).toBe('https://api.telegram.org/botTOK/sendMessage')
    expect(String(calls[0].body.text)).toMatch(/25% Profit Boost/)
    expect(getPublishLog()[0]).toMatchObject({ kind: 'promo', status: 'sent' })
  })
})

describe('no webhook configured', () => {
  it('skips (no network) but still logs the attempt', async () => {
    const { fn, calls } = mockFetch({ ok: true, status: 200 })
    const out = await announceFeature('Daily Sign-In Bonus', NOW, fn)
    expect(out.status).toBe('skipped')
    expect(calls).toHaveLength(0)
    expect(getPublishLog()[0]).toMatchObject({ status: 'skipped' })
  })
})

describe('relayTest', () => {
  it('sends a one-off test to verify the wiring', async () => {
    commsStore.setWebhooks({ discordUrl: 'https://d' })
    const { fn } = mockFetch({ ok: true, status: 204 })
    const out = await relayTest(NOW, fn)
    expect(out.status).toBe('sent')
    expect(getPublishLog()[0]).toMatchObject({ kind: 'test' })
  })
})
