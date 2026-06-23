/**
 * Creator authoring — the "your operators are your streamers" surface. Helpers an operator
 * (or, later, a top player) uses to spin up a branded contest: themed templates that prefill
 * a sensible metric / window / prize split, which the operator then tweaks. The actual create
 * + validation + eligibility reads live in the events engine (read-only over org / VIP); this
 * module is the authoring ergonomics on top. No money moves here.
 */

import type { CreateCompetitionInput } from '../events/index.js'
import type { CompetitionTheme, MetricType } from '../events/types.js'

const DAY = 86_400_000

/** A themed starting point — name, metric, length, pool, and split — the operator can tune. */
export interface DraftTemplate {
  theme: CompetitionTheme
  name: string
  metric: MetricType
  durationDays: number
  entryFeeCents: number
  guaranteedCents: number
  payoutSplit: number[]
  blurb: string
}

/** The preset contests a creator can start from. Branded framing + a house-safe prize split. */
export const TEMPLATES: Record<CompetitionTheme, DraftTemplate> = {
  weekly_race: {
    theme: 'weekly_race',
    name: 'Weekly Action Race',
    metric: 'wagered',
    durationDays: 7,
    entryFeeCents: 0,
    guaranteedCents: 50_000,
    payoutSplit: [0.5, 0.3, 0.2],
    blurb: 'Most credits in play this week takes the top of the board.',
  },
  monthly_tournament: {
    theme: 'monthly_tournament',
    name: 'Monthly Profit Tournament',
    metric: 'net_profit',
    durationDays: 30,
    entryFeeCents: 2_500,
    guaranteedCents: 100_000,
    payoutSplit: [0.5, 0.25, 0.15, 0.1],
    blurb: 'Climb the monthly ladder — biggest net winner runs the table.',
  },
  seasonal: {
    theme: 'seasonal',
    name: 'Season Highlight Chase',
    metric: 'biggest_multiplier',
    durationDays: 60,
    entryFeeCents: 0,
    guaranteedCents: 250_000,
    payoutSplit: [0.6, 0.25, 0.15],
    blurb: 'One huge hit can win it — biggest multiplier of the season.',
  },
  holiday: {
    theme: 'holiday',
    name: 'Holiday Parlay Bash',
    metric: 'parlay_hits',
    durationDays: 14,
    entryFeeCents: 0,
    guaranteedCents: 75_000,
    payoutSplit: [0.5, 0.3, 0.2],
    blurb: 'Stack winning parlays for the holiday haul.',
  },
  custom: {
    theme: 'custom',
    name: 'Custom Contest',
    metric: 'wagered',
    durationDays: 7,
    entryFeeCents: 0,
    guaranteedCents: 0,
    payoutSplit: [1],
    blurb: '',
  },
}

export const TEMPLATE_ORDER: CompetitionTheme[] = [
  'weekly_race',
  'monthly_tournament',
  'seasonal',
  'holiday',
  'custom',
]

/** Build a ready-to-edit create input from a template, opening at `now`. */
export function draftFromTemplate(
  theme: CompetitionTheme,
  createdBy: string,
  now: number,
): CreateCompetitionInput {
  const t = TEMPLATES[theme]
  return {
    name: t.name,
    theme: t.theme,
    metric: t.metric,
    startsAt: now,
    endsAt: now + t.durationDays * DAY,
    entryFeeCents: t.entryFeeCents,
    guaranteedCents: t.guaranteedCents,
    payoutSplit: [...t.payoutSplit],
    eligibility: { kind: 'all' },
    createdBy,
    blurb: t.blurb,
  }
}
