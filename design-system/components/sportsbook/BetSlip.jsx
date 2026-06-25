import React from 'react'
import { Button } from '../buttons/Button.jsx'

const CSS = `
.sds-slip { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--elev-2); width: 320px; max-width: 100%; }
.sds-slip__head { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.sds-slip__title { font-family: var(--font-head); text-transform: uppercase; letter-spacing: var(--tracking-caps); font-size: 17px; font-weight: 700; color: var(--text); }
.sds-slip__count { font-family: var(--font-num); font-size: 11px; font-weight: 700; color: var(--on-gold); background: var(--gold); border-radius: var(--radius-pill); min-width: 20px; height: 20px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; }
.sds-slip__mode { margin-left: auto; display: flex; gap: 2px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 2px; }
.sds-slip__mode button { font-family: var(--font-label); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: none; border: 0; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.sds-slip__mode button.on { color: var(--on-gold); background: var(--gold); }

.sds-slip__list { display: flex; flex-direction: column; gap: 8px; padding: 12px; max-height: 320px; overflow-y: auto; }
.sds-slip__empty { padding: 36px 16px; text-align: center; color: var(--faint); font-size: 13px; }
.sds-pick { position: relative; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 34px 10px 12px; }
.sds-pick__pick { font-family: var(--font-head); font-size: 14px; font-weight: 600; color: var(--text); }
.sds-pick__event { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.sds-pick__price { position: absolute; top: 10px; right: 30px; font-family: var(--font-num); font-weight: 700; font-size: 13px; color: var(--gold-bright); }
.sds-pick__x { position: absolute; top: 8px; right: 8px; width: 18px; height: 18px; border: 0; background: none; color: var(--faint); cursor: pointer; font-size: 13px; line-height: 1; border-radius: 4px; }
.sds-pick__x:hover { color: var(--red); }

.sds-slip__foot { border-top: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.sds-slip__stake { display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0 12px; height: 44px; }
.sds-slip__stake:focus-within { border-color: var(--gold); }
.sds-slip__stake label { font-family: var(--font-label); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); }
.sds-slip__stake input { flex: 1; min-width: 0; background: none; border: 0; outline: none; text-align: right; font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px; color: var(--text); }
.sds-slip__stake .unit { font-family: var(--font-num); font-size: 12px; color: var(--muted); }
.sds-slip__rows { display: flex; flex-direction: column; gap: 5px; }
.sds-slip__row { display: flex; justify-content: space-between; font-size: 12.5px; }
.sds-slip__row .k { color: var(--muted); }
.sds-slip__row .v { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text); }
.sds-slip__row--return .k { color: var(--text); font-weight: 600; }
.sds-slip__row--return .v { color: var(--gold-bright); font-size: 16px; }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-slip-css')) {
  const s = document.createElement('style')
  s.id = 'sds-slip-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * The bet slip surface. Lists selections (each with a remove ✕), takes a points
 * stake, and shows combined odds + potential return live. Toggle Single / Parlay.
 * `selections` = [{ id, pick, event, price }] where price is decimal odds.
 */
export function BetSlip({ selections = [], stake = 100, mode = 'parlay', onStakeChange, onRemove, onModeChange, onPlace, className = '', ...rest }) {
  const combined = selections.reduce((acc, s) => acc * (Number(s.price) || 1), 1)
  const ret = mode === 'parlay'
    ? stake * combined
    : selections.reduce((acc, s) => acc + stake * (Number(s.price) || 1), 0)
  const fmt = (n) => Math.round(n).toLocaleString('en-US')

  return (
    <aside className={['sds-slip', className].filter(Boolean).join(' ')} {...rest}>
      <div className="sds-slip__head">
        <span className="sds-slip__title">Bet slip</span>
        {selections.length > 0 ? <span className="sds-slip__count">{selections.length}</span> : null}
        {selections.length > 1 ? (
          <div className="sds-slip__mode">
            <button className={mode === 'single' ? 'on' : ''} onClick={() => onModeChange && onModeChange('single')}>Singles</button>
            <button className={mode === 'parlay' ? 'on' : ''} onClick={() => onModeChange && onModeChange('parlay')}>Parlay</button>
          </div>
        ) : null}
      </div>

      {selections.length === 0 ? (
        <div className="sds-slip__empty">Tap any odds to add a pick.<br />Casino &amp; sportsbook share one balance.</div>
      ) : (
        <>
          <div className="sds-slip__list">
            {selections.map((s) => (
              <div className="sds-pick" key={s.id}>
                <button className="sds-pick__x" onClick={() => onRemove && onRemove(s)} aria-label="Remove">✕</button>
                <div className="sds-pick__pick">{s.pick}</div>
                <div className="sds-pick__event">{s.event}</div>
                <div className="sds-pick__price">{Number(s.price).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="sds-slip__foot">
            <div className="sds-slip__stake">
              <label htmlFor="sds-stake">Stake</label>
              <input
                id="sds-stake"
                type="number"
                value={stake}
                onChange={(e) => onStakeChange && onStakeChange(Number(e.target.value))}
              />
              <span className="unit">pts</span>
            </div>
            <div className="sds-slip__rows">
              <div className="sds-slip__row"><span className="k">{mode === 'parlay' ? 'Combined odds' : 'Selections'}</span><span className="v">{mode === 'parlay' ? combined.toFixed(2) : selections.length}</span></div>
              <div className="sds-slip__row sds-slip__row--return"><span className="k">Potential return</span><span className="v">{fmt(ret)} pts</span></div>
            </div>
            <Button variant="primary" size="lg" block onClick={() => onPlace && onPlace()}>
              Place bet · {fmt(stake)} pts
            </Button>
          </div>
        </>
      )}
    </aside>
  )
}
