/**
 * Network-boundary validation for the odds/scores feed, built on zod.
 *
 * The vendor response is untrusted input crossing into pricing/grading, so it is PARSED here
 * before anything downstream sees it: zod strips unknown fields and rejects the values that
 * would otherwise propagate `NaN`/`undefined` into a price or score (a non-numeric `price`, a
 * `score` string that doesn't parse, an empty team name). Score strings the vendor sends (e.g.
 * `"58"`) are coerced to finite numbers at this boundary.
 *
 * Two entry styles:
 *   - `validateApiEvents` / `validateOddsApiScoreEvents` THROW `malformed <label> payload at
 *     <path>` on the first bad field — the strict contract `theOddsApiProvider` relies on.
 *   - `apiEventsSchema` / `oddsApiScoreEventsSchema` (+ `formatZodIssue`) are the raw schemas for
 *     callers that prefer `safeParse` and want to warn-and-continue instead of throwing (see
 *     `theOddsApi.ts`).
 */

import { z } from 'zod'
import type { ApiEvent } from '../types.js'
import type { OddsApiScoreEvent } from './theOddsApi.js'

// ── Field primitives (mirror the previous hand-rolled guards exactly) ────────────────────────

/** Non-empty (after trim) string; the original VALUE is preserved (not trimmed). */
const nonEmptyString = z
  .string()
  .refine((s) => s.trim() !== '', { message: 'expected a non-empty string' })

/** A real, finite number — rejects `NaN` and `±Infinity` so they can't reach pricing. */
const finiteNumber = z
  .number()
  .refine((n) => Number.isFinite(n), { message: 'expected a finite number' })

/** Optional non-empty string: absent / null → undefined; empty string is rejected. */
const optionalNonEmptyString = z.preprocess(
  (v) => (v == null ? undefined : v),
  nonEmptyString.optional(),
)

/** Optional finite number: absent / null → undefined. */
const optionalFiniteNumber = z.preprocess(
  (v) => (v == null ? undefined : v),
  finiteNumber.optional(),
)

/** Optional boolean: absent / null → undefined. */
const optionalBoolean = z.preprocess((v) => (v == null ? undefined : v), z.boolean().optional())

/** Optional lifecycle status: absent / null → undefined; otherwise one of the three. */
const optionalStatus = z.preprocess(
  (v) => (v == null ? undefined : v),
  z.enum(['upcoming', 'live', 'final']).optional(),
)

/** A score that the vendor may send as a string (`"58"`) — coerced to a finite number. */
const coercedScore = z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), finiteNumber)

// ── Event schemas (unknown keys are stripped by zod's default object parsing) ────────────────

const apiOutcomeSchema = z.object({
  name: nonEmptyString,
  price: finiteNumber,
  point: optionalFiniteNumber,
})

const apiMarketSchema = z.object({
  key: z.enum(['h2h', 'spreads', 'totals']),
  outcomes: z.array(apiOutcomeSchema),
})

const apiBookmakerSchema = z.object({
  key: nonEmptyString,
  markets: z.array(apiMarketSchema),
})

const apiScoreSchema = z.object({
  name: nonEmptyString,
  score: finiteNumber,
})

const apiEventSchema = z.object({
  id: nonEmptyString,
  sport_key: optionalNonEmptyString,
  sport_title: nonEmptyString,
  home_team: nonEmptyString,
  away_team: nonEmptyString,
  commence_time: nonEmptyString,
  status: optionalStatus,
  completed: optionalBoolean,
  official: optionalBoolean,
  scores: z.array(apiScoreSchema).nullish(),
  clock: optionalNonEmptyString,
  progress: optionalFiniteNumber,
  bookmakers: z.array(apiBookmakerSchema),
})

const scoreRowSchema = z.object({
  name: nonEmptyString,
  score: coercedScore,
})

const oddsApiScoreEventSchema = z.object({
  id: nonEmptyString,
  completed: optionalBoolean,
  scores: z.array(scoreRowSchema).nullish(),
})

/** The slate-level schemas (an array of each). */
export const apiEventsSchema = z.array(apiEventSchema)
export const oddsApiScoreEventsSchema = z.array(oddsApiScoreEventSchema)

// ── Issue formatting (preserves the legacy `$[0].bookmakers[0]...` path style) ───────────────

/** Render a zod issue path as the `$[0].bookmakers[0].markets[0].outcomes[0].price` style. */
function pathString(path: ReadonlyArray<PropertyKey>): string {
  let out = '$'
  for (const seg of path) out += typeof seg === 'number' ? `[${seg}]` : `.${String(seg)}`
  return out
}

/** The location + message of the first issue, e.g. `$[0].bookmakers[0].markets[0].key: ...`. */
export function formatZodIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'unknown validation error'
  return `${pathString(issue.path)}: ${issue.message}`
}

// ── Strict (throwing) validators — the contract theOddsApiProvider depends on ────────────────

export function validateApiEvents(value: unknown, label = 'odds'): ApiEvent[] {
  const result = apiEventsSchema.safeParse(value)
  if (!result.success) {
    throw new Error(`malformed ${label} payload at ${pathString(result.error.issues[0]?.path ?? [])}`)
  }
  return result.data
}

export function validateOddsApiScoreEvents(value: unknown, label = 'scores'): OddsApiScoreEvent[] {
  const result = oddsApiScoreEventsSchema.safeParse(value)
  if (!result.success) {
    throw new Error(`malformed ${label} payload at ${pathString(result.error.issues[0]?.path ?? [])}`)
  }
  return result.data
}
