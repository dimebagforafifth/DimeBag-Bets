import { describe, it, expect } from 'vitest'
import { announcementText, configuredChannels, dispatch, EMPTY_WEBHOOKS, type WebhookConfig } from './webhooks.js'

function mockFetch(result: { ok: boolean; status: number } | Error) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fn = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) })
    if (result instanceof Error) throw result
    return result
  }) as unknown as typeof fetch
  return { fn, calls }
}

const cfg = (o: Partial<WebhookConfig> = {}): WebhookConfig => ({ ...EMPTY_WEBHOOKS, ...o })

describe('configuredChannels', () => {
  it('lists only fully-configured channels', () => {
    expect(configuredChannels(cfg())).toEqual([])
    expect(configuredChannels(cfg({ discordUrl: 'https://d' }))).toEqual(['discord'])
    expect(configuredChannels(cfg({ telegramToken: 't' }))).toEqual([]) // needs chat id too
    expect(configuredChannels(cfg({ telegramToken: 't', telegramChatId: '42' }))).toEqual(['telegram'])
  })
})

describe('dispatch', () => {
  it('posts to Discord with { content }', async () => {
    const { fn, calls } = mockFetch({ ok: true, status: 204 })
    const res = await dispatch(cfg({ discordUrl: 'https://discord/hook' }), 'hi', fn)
    expect(res).toEqual([{ channel: 'discord', ok: true, error: undefined }])
    expect(calls[0]).toEqual({ url: 'https://discord/hook', body: { content: 'hi' } })
  })

  it('posts to Telegram sendMessage with { chat_id, text }', async () => {
    const { fn, calls } = mockFetch({ ok: true, status: 200 })
    await dispatch(cfg({ telegramToken: 'TOK', telegramChatId: '42' }), 'yo', fn)
    expect(calls[0].url).toBe('https://api.telegram.org/botTOK/sendMessage')
    expect(calls[0].body).toEqual({ chat_id: '42', text: 'yo' })
  })

  it('reports an HTTP failure without throwing', async () => {
    const { fn } = mockFetch({ ok: false, status: 404 })
    const res = await dispatch(cfg({ discordUrl: 'https://d' }), 'm', fn)
    expect(res[0]).toMatchObject({ channel: 'discord', ok: false, error: 'HTTP 404' })
  })

  it('reports a network error per channel', async () => {
    const { fn } = mockFetch(new Error('offline'))
    const res = await dispatch(cfg({ discordUrl: 'https://d' }), 'm', fn)
    expect(res[0]).toMatchObject({ ok: false, error: 'offline' })
  })

  it('sends to nothing when unconfigured', async () => {
    const { fn, calls } = mockFetch({ ok: true, status: 200 })
    expect(await dispatch(cfg(), 'm', fn)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('announcementText', () => {
  it('bolds the title above the body, or just the body', () => {
    expect(announcementText('Heads up', 'Maintenance at 9pm')).toBe('**Heads up**\nMaintenance at 9pm')
    expect(announcementText('', 'Just this')).toBe('Just this')
  })
})
