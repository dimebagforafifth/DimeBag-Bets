/**
 * Column mapping — turn raw CSV cells into the canonical `MappedPlayer`, and GUESS the
 * mapping from the source headers so the common case is one tap (near-zero friction).
 *
 * Money cells are parsed leniently (currency symbols, thousands separators, and accounting
 * parentheses for negatives are all tolerated) into integer cents — credit lines clamp to
 * ≥ 0, opening figures keep their sign. No money MOVES here; this is pure transformation.
 */

import { toCents, toSignedCents } from '../games/shared/money.js'
import type { MemberProfile } from '../org/index.js'
import {
  DEFAULT_MAPPING_OPTIONS,
  type CanonicalField,
  type ColumnMap,
  type MappedPlayer,
  type MappingOptions,
} from './types.js'

/** Canonical fields + the header substrings that hint at them (lowercased, matched loosely).
 *  Order matters: earlier fields win a header so 'credit limit' maps to creditLimit, not name. */
const FIELD_HINTS: { field: CanonicalField; hints: string[] }[] = [
  { field: 'creditLimit', hints: ['credit', 'limit', 'creditline', 'credit line', 'line'] },
  {
    field: 'startingBalance',
    hints: ['balance', 'figure', 'standing', 'owed', 'opening', 'pnl', 'net'],
  },
  {
    field: 'externalId',
    hints: ['external', 'player id', 'playerid', 'account id', 'accountid', 'ref', 'source id'],
  },
  {
    field: 'agent',
    hints: ['agent', 'sub-agent', 'subagent', 'master', 'sheet', 'office', 'shop'],
  },
  { field: 'nickname', hints: ['nickname', 'alias', 'handle', 'username', 'login', 'user'] },
  { field: 'email', hints: ['email', 'e-mail', 'mail'] },
  { field: 'phone', hints: ['phone', 'mobile', 'cell', 'tel', 'contact'] },
  { field: 'notes', hints: ['note', 'comment', 'remark', 'memo'] },
  { field: 'name', hints: ['name', 'player', 'customer', 'client', 'full name', 'fullname'] },
]

const norm = (s: string): string => s.trim().toLowerCase()

/**
 * Guess a column map from the source headers. Each canonical field claims the first header
 * that matches one of its hints (exact match preferred over substring), and a header is used
 * once. Returns only the fields it could place — the operator confirms/edits in the UI.
 */
export function autoDetectMapping(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const taken = new Set<string>()
  const score = (header: string, hints: string[]): number => {
    const h = norm(header)
    if (!h) return 0
    if (hints.some((hint) => h === hint)) return 2 // exact header == hint
    if (hints.some((hint) => h.includes(hint))) return 1 // hint is a substring
    return 0
  }
  for (const { field, hints } of FIELD_HINTS) {
    let best: { header: string; score: number } | null = null
    for (const header of headers) {
      if (taken.has(header)) continue
      const s = score(header, hints)
      if (s > 0 && (!best || s > best.score)) best = { header, score: s }
    }
    if (best) {
      map[field] = best.header
      taken.add(best.header)
    }
  }
  return map
}

/** Lenient money parse → integer cents. `$1,200.50` → 120050; `(200)` → -20000; '' → 0.
 *  `signed: false` clamps to ≥ 0 (a credit line is never negative). */
export function parseAmountCents(raw: string, opts: { signed: boolean; dollars: boolean }): number {
  let s = raw.trim()
  if (!s) return 0
  let negative = false
  // Accounting parentheses denote a negative, e.g. '(200)'.
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  // A letter means it isn't a clean money value (e.g. '1e3', 'USD 50', 'n/a') — reject it as 0
  // rather than silently corrupting it (stripping the 'e' from '1e3' would otherwise read 13).
  if (/[a-z]/i.test(s)) return 0
  // Strip currency symbols, thousands separators, spaces; keep digits + decimal point.
  s = s.replace(/[^0-9.]/g, '')
  // A second decimal point makes it malformed (e.g. '1.2.3'); Number() would already NaN it,
  // but reject explicitly so the intent is clear.
  if (!s || s === '.' || (s.match(/\./g)?.length ?? 0) > 1) return 0
  const value = Number(s) // a non-negative magnitude
  if (!Number.isFinite(value)) return 0
  const signed = negative ? -value : value
  if (!opts.signed) return opts.dollars ? toCents(value) : Math.max(0, Math.round(value))
  return opts.dollars ? toSignedCents(signed) : Math.round(signed)
}

/** Read a mapped cell from a raw row (empty string if the field isn't mapped/present). */
function cell(row: Record<string, string>, map: ColumnMap, field: CanonicalField): string {
  const header = map[field]
  if (!header) return ''
  return (row[header] ?? '').trim()
}

/** Split an agent cell into a path, trimming empties (so 'North /' → ['North']). */
export function splitAgentPath(raw: string, delimiter: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Apply a column map to one raw row → the canonical MappedPlayer (pure; no validation). */
export function applyMapping(
  row: Record<string, string>,
  map: ColumnMap,
  options: MappingOptions = DEFAULT_MAPPING_OPTIONS,
): MappedPlayer {
  const profile: MemberProfile = {}
  const nickname = cell(row, map, 'nickname')
  const email = cell(row, map, 'email')
  const phone = cell(row, map, 'phone')
  const notes = cell(row, map, 'notes')
  if (nickname) profile.nickname = nickname
  if (email) profile.email = email
  if (phone) profile.phone = phone
  if (notes) profile.notes = notes

  const externalId = cell(row, map, 'externalId')

  return {
    name: cell(row, map, 'name'),
    agentPath: splitAgentPath(cell(row, map, 'agent'), options.agentDelimiter),
    creditLimitCents: parseAmountCents(cell(row, map, 'creditLimit'), {
      signed: false,
      dollars: options.amountsInDollars,
    }),
    startingBalanceCents: parseAmountCents(cell(row, map, 'startingBalance'), {
      signed: true,
      dollars: options.amountsInDollars,
    }),
    profile,
    ...(externalId ? { externalId } : {}),
  }
}
