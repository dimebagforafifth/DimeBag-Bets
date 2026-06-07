/**
 * Outbound webhooks — push a message to Discord and/or Telegram (the "hooks" an
 * operator wires up). Modeled on sportsdata/httpFeed's injected-fetch pattern so
 * it's fully testable and has no hard dependency on the global fetch. Pure of any
 * store/UI.
 *
 * Note: these are client-side POSTs (this app has no backend). Discord webhook URLs
 * accept cross-origin POSTs; some Telegram setups may need a proxy for CORS — that's
 * a deployment detail, not a change here.
 */

export interface WebhookConfig {
  /** Discord webhook URL ('' = off). */
  discordUrl: string
  /** Telegram bot token ('' = off; needs telegramChatId too). */
  telegramToken: string
  /** Telegram chat id to post into. */
  telegramChatId: string
}

export const EMPTY_WEBHOOKS: WebhookConfig = { discordUrl: '', telegramToken: '', telegramChatId: '' }

export type Channel = 'discord' | 'telegram'

export interface DispatchResult {
  channel: Channel
  ok: boolean
  error?: string
}

/** Which channels are configured well enough to send. */
export function configuredChannels(cfg: WebhookConfig): Channel[] {
  const out: Channel[] = []
  if (cfg.discordUrl.trim()) out.push('discord')
  if (cfg.telegramToken.trim() && cfg.telegramChatId.trim()) out.push('telegram')
  return out
}

async function post(
  fetchImpl: typeof fetch,
  url: string,
  payload: unknown,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { ok: res.ok, status: res.status }
}

/**
 * Send `message` to every configured channel. Each channel resolves to its own
 * result (never throws — a failed/blocked POST is reported, not fatal), so one
 * dead webhook can't sink the others. `fetchImpl` is injectable for tests.
 */
export async function dispatch(
  cfg: WebhookConfig,
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchResult[]> {
  const jobs: Promise<DispatchResult>[] = []

  if (cfg.discordUrl.trim()) {
    jobs.push(
      post(fetchImpl, cfg.discordUrl, { content: message })
        .then((r) => ({ channel: 'discord' as const, ok: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` }))
        .catch((e) => ({ channel: 'discord' as const, ok: false, error: e instanceof Error ? e.message : String(e) })),
    )
  }
  if (cfg.telegramToken.trim() && cfg.telegramChatId.trim()) {
    const url = `https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`
    jobs.push(
      post(fetchImpl, url, { chat_id: cfg.telegramChatId, text: message })
        .then((r) => ({ channel: 'telegram' as const, ok: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` }))
        .catch((e) => ({ channel: 'telegram' as const, ok: false, error: e instanceof Error ? e.message : String(e) })),
    )
  }
  return Promise.all(jobs)
}

/** Render an announcement as the plain-text line sent to a webhook. */
export function announcementText(title: string, body: string): string {
  return title ? `**${title}**\n${body}` : body
}
