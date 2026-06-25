import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { OddsButton } from './OddsButton'
import './brand.css'

export interface OddsOption {
  id: string
  label?: ReactNode
  price: ReactNode
  move?: 'up' | 'down'
}
export interface Market {
  heading?: string
  options: OddsOption[]
}
export interface Competitor {
  name: string
  sport?: string
}
export interface EventRowProps extends HTMLAttributes<HTMLDivElement> {
  league?: string
  time?: string
  live?: boolean
  home: Competitor | string
  away: Competitor | string
  score?: { home: ReactNode; away: ReactNode }
  markets?: Market[]
  selectedId?: string
  onPick?: (option: OddsOption, market: Market) => void
}

function nameOf(c: Competitor | string): ReactNode {
  return typeof c === 'string' ? c : c.name
}

/**
 * A sportsbook event row: league + start time (or LIVE + score), the two
 * competitors, and a set of market columns each holding tappable OddsButtons.
 */
export function EventRow({
  league,
  time,
  live = false,
  home,
  away,
  score,
  markets = [],
  selectedId,
  onPick,
  className,
  ...rest
}: EventRowProps) {
  const homeSport = typeof home === 'object' ? home.sport : undefined
  return (
    <div className={cn('sds-event', className)} {...rest}>
      <div>
        <div className="sds-event__meta">
          {live ? (
            <span className="sds-event__live">Live</span>
          ) : (
            <span className="sds-event__league">{league}</span>
          )}
          {!live && league && homeSport ? (
            <span className="sds-event__league" style={{ color: 'var(--muted)' }}>
              {homeSport}
            </span>
          ) : null}
          {time ? <span className="sds-event__time">{time}</span> : null}
        </div>
        <div className="sds-event__teams">
          <div className="sds-event__team">
            <span className="sds-event__name">{nameOf(home)}</span>
            {score ? <span className="sds-event__score">{score.home}</span> : null}
          </div>
          <div className="sds-event__team">
            <span className="sds-event__name">{nameOf(away)}</span>
            {score ? <span className="sds-event__score">{score.away}</span> : null}
          </div>
        </div>
      </div>
      <div className="sds-event__markets">
        {markets.map((m, i) => (
          <div className="sds-event__col" key={m.heading || i}>
            {m.heading ? <span className="sds-event__collabel">{m.heading}</span> : null}
            {m.options.map((o) => (
              <OddsButton
                key={o.id}
                label={o.label}
                price={o.price}
                move={o.move}
                selected={selectedId === o.id}
                onClick={() => onPick?.(o, m)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
