/**
 * Shared "How to play" panel (CLAUDE.md §2, §4). A collapsible, plain-language
 * rundown of a game: how it works and how it pays. Every game renders one with
 * its own points — honest-by-default (§4), kept tidy behind a summary so it
 * never clutters the table. Styled to match the Fairness panel (app/theme.css).
 *
 * Each point is a short line; wrap the key phrase in <strong> to highlight it
 * (e.g. the payout). The last point of every game states the house edge.
 */

import type { ReactNode } from 'react'

interface RulesProps {
  /** Plain-language lines; each renders as one bullet. */
  points: ReactNode[]
  summary?: string
}

export function Rules({ points, summary = 'How to play' }: RulesProps) {
  return (
    <details className="rules">
      <summary>{summary}</summary>
      <ul className="rules-body">
        {points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </details>
  )
}
