import React from 'react'
import { OddsButton } from './OddsButton.jsx'

const CSS = `
.sds-event {
  display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
  padding: 14px 16px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); transition: border-color var(--dur) ease;
}
.sds-event:hover { border-color: color-mix(in srgb, var(--line) 60%, var(--gold)); }
.sds-event__meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sds-event__league { font-family: var(--font-label); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); }
.sds-event__time { font-family: var(--font-num); font-size: 11px; color: var(--muted); margin-left: auto; }
.sds-event__live { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--green); }
.sds-event__live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 28%, transparent); }
.sds-event__teams { display: flex; flex-direction: column; gap: 4px; }
.sds-event__team { display: flex; align-items: baseline; gap: 8px; }
.sds-event__name { font-family: var(--font-head); font-size: 17px; font-weight: 600; color: var(--text); letter-spacing: 0.2px; }
.sds-event__score { font-family: var(--font-num); font-weight: 700; font-size: 15px; color: var(--gold-bright); margin-left: auto; }
.sds-event__markets { display: flex; gap: 8px; }
.sds-event__markets .sds-event__col { display: flex; flex-direction: column; gap: 4px; }
.sds-event__collabel { font-family: var(--font-label); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); text-align: center; }
@media (max-width: 560px) {
  .sds-event { grid-template-columns: 1fr; }
  .sds-event__markets { justify-content: stretch; }
  .sds-event__markets .sds-event__col { flex: 1; }
}
`
if (typeof document !== 'undefined' && !document.getElementById('sds-event-css')) {
  const s = document.createElement('style')
  s.id = 'sds-event-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * A sportsbook event row: league + start time (or LIVE + score), the two
 * competitors, and a set of market columns each holding tappable OddsButtons.
 * `markets` = [{ heading, options: [{ id, label, price, move }] }]. `selectedId`
 * marks the chosen pick; `onPick(option, market)` fires on tap.
 */
export function EventRow({ league, time, live = false, home, away, score, markets = [], selectedId, onPick, className = '', ...rest }) {
  return (
    <div className={['sds-event', className].filter(Boolean).join(' ')} {...rest}>
      <div>
        <div className="sds-event__meta">
          {live ? <span className="sds-event__live">Live</span> : <span className="sds-event__league">{league}</span>}
          {!live && league ? <span className="sds-event__league" style={{ color: 'var(--muted)' }}>{home?.sport}</span> : null}
          <span className="sds-event__time">{time}</span>
        </div>
        <div className="sds-event__teams">
          <div className="sds-event__team">
            <span className="sds-event__name">{home?.name ?? home}</span>
            {score ? <span className="sds-event__score">{score.home}</span> : null}
          </div>
          <div className="sds-event__team">
            <span className="sds-event__name">{away?.name ?? away}</span>
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
                onClick={() => onPick && onPick(o, m)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
