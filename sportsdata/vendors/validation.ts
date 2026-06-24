import type { ApiEvent, ApiMarket, ApiScore } from '../types.js'
import type { OddsApiScoreEvent } from './theOddsApi.js'

const MARKET_KEYS = new Set(['h2h', 'spreads', 'totals'])
const STATUSES = new Set(['upcoming', 'live', 'final'])

function fail(label: string, path: string): never {
  throw new Error(`malformed ${label} payload at ${path}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown, label: string, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(label, path)
  return value
}

function optionalNumber(value: unknown, label: string, path: string): number | undefined {
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label, path)
  return value
}

function requiredNumber(value: unknown, label: string, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(label, path)
  return value
}

function optionalBoolean(value: unknown, label: string, path: string): boolean | undefined {
  if (value == null) return undefined
  if (typeof value !== 'boolean') fail(label, path)
  return value
}

function validateScores(value: unknown, label: string, path: string): ApiScore[] | null | undefined {
  if (value == null) return value
  if (!Array.isArray(value)) fail(label, path)
  return value.map((row, i) => {
    if (!isRecord(row)) fail(label, `${path}[${i}]`)
    return {
      name: stringField(row.name, label, `${path}[${i}].name`),
      score: requiredNumber(row.score, label, `${path}[${i}].score`),
    }
  })
}

function validateMarketKey(value: unknown, label: string, path: string): ApiMarket['key'] {
  if (typeof value !== 'string' || !MARKET_KEYS.has(value)) fail(label, path)
  return value as ApiMarket['key']
}

function validateApiEvent(value: unknown, label: string, path: string): ApiEvent {
  if (!isRecord(value)) fail(label, path)

  const status = value.status
  if (status != null && (typeof status !== 'string' || !STATUSES.has(status))) fail(label, `${path}.status`)

  if (!Array.isArray(value.bookmakers)) fail(label, `${path}.bookmakers`)
  const bookmakers = value.bookmakers.map((book, b) => {
    if (!isRecord(book)) fail(label, `${path}.bookmakers[${b}]`)
    if (!Array.isArray(book.markets)) fail(label, `${path}.bookmakers[${b}].markets`)
    const markets = book.markets as unknown[]
    return {
      key: stringField(book.key, label, `${path}.bookmakers[${b}].key`),
      markets: markets.map((market, m) => {
        if (!isRecord(market)) fail(label, `${path}.bookmakers[${b}].markets[${m}]`)
        if (!Array.isArray(market.outcomes)) fail(label, `${path}.bookmakers[${b}].markets[${m}].outcomes`)
        const outcomes = market.outcomes as unknown[]
        return {
          key: validateMarketKey(market.key, label, `${path}.bookmakers[${b}].markets[${m}].key`),
          outcomes: outcomes.map((outcome, o) => {
            if (!isRecord(outcome)) fail(label, `${path}.bookmakers[${b}].markets[${m}].outcomes[${o}]`)
            return {
              name: stringField(outcome.name, label, `${path}.bookmakers[${b}].markets[${m}].outcomes[${o}].name`),
              price: requiredNumber(outcome.price, label, `${path}.bookmakers[${b}].markets[${m}].outcomes[${o}].price`),
              point: optionalNumber(outcome.point, label, `${path}.bookmakers[${b}].markets[${m}].outcomes[${o}].point`),
            }
          }),
        }
      }),
    }
  })

  return {
    id: stringField(value.id, label, `${path}.id`),
    sport_key: value.sport_key == null ? undefined : stringField(value.sport_key, label, `${path}.sport_key`),
    sport_title: stringField(value.sport_title, label, `${path}.sport_title`),
    home_team: stringField(value.home_team, label, `${path}.home_team`),
    away_team: stringField(value.away_team, label, `${path}.away_team`),
    commence_time: stringField(value.commence_time, label, `${path}.commence_time`),
    status: status as ApiEvent['status'],
    completed: optionalBoolean(value.completed, label, `${path}.completed`),
    official: optionalBoolean(value.official, label, `${path}.official`),
    scores: validateScores(value.scores, label, `${path}.scores`),
    clock: value.clock == null ? undefined : stringField(value.clock, label, `${path}.clock`),
    progress: optionalNumber(value.progress, label, `${path}.progress`),
    bookmakers,
  }
}

export function validateApiEvents(value: unknown, label = 'odds'): ApiEvent[] {
  if (!Array.isArray(value)) fail(label, '$')
  return value.map((event, i) => validateApiEvent(event, label, `$[${i}]`))
}

export function validateOddsApiScoreEvents(value: unknown, label = 'scores'): OddsApiScoreEvent[] {
  if (!Array.isArray(value)) fail(label, '$')
  return value.map((event, i) => {
    const path = `$[${i}]`
    if (!isRecord(event)) fail(label, path)
    const scores = event.scores
    if (scores != null && !Array.isArray(scores)) fail(label, `${path}.scores`)
    const rows = scores as unknown[] | null | undefined
    return {
      id: stringField(event.id, label, `${path}.id`),
      completed: optionalBoolean(event.completed, label, `${path}.completed`),
      scores:
        rows == null
          ? rows
          : rows.map((row, s) => {
              if (!isRecord(row)) fail(label, `${path}.scores[${s}]`)
              const score = typeof row.score === 'string' ? Number(row.score) : row.score
              if (typeof score !== 'number' || !Number.isFinite(score)) fail(label, `${path}.scores[${s}].score`)
              return {
                name: stringField(row.name, label, `${path}.scores[${s}].name`),
                score,
              }
            }),
    }
  })
}
