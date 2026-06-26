/**
 * Streak label — the one place that turns a (count, kind) streak into display text.
 *
 * The naive `${kind}${n === 1 ? '' : 's'}` pattern produced the "2 losss" defect:
 * appending 's' to the stem "loss" yields "losss". Pluralize on a clean stem so a
 * loss streak reads "2 losses" and a win streak reads "2 wins".
 */

export type StreakKind = 'win' | 'loss' | 'none'

/** e.g. (3,'win') → "3 wins", (1,'loss') → "1 loss", (2,'loss') → "2 losses", none/0 → "—". */
export function streakLabel(current: number, kind: StreakKind): string {
  if (kind === 'none' || current <= 0) return '—'
  if (kind === 'win') return `${current} ${current === 1 ? 'win' : 'wins'}`
  return `${current} ${current === 1 ? 'loss' : 'losses'}`
}
