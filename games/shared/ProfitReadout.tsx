import { formatMoney } from './money.js'
import { InfoDot } from './GlossaryTerm.js'

/**
 * A "Total profit" field for the cash-out games. It's the bet-amount field's twin
 * — same boxed "$" figure — but read-only: a static value the player can't select
 * or edit, relaying the full amount they'd collect by cashing out now (stake ×
 * multiplier). The running multiplier rides in the label, so the section shows
 * both the multiple and what it's worth.
 *
 * Render it directly under the Bet amount field, and ONLY while a profitable cash
 * out is actually on the table (a started round with multiplier > 1) — never before.
 */
export function ProfitReadout({ total, multiplier }: { total: number; multiplier: number }) {
  return (
    <label className="field profit-readout">
      <span className="field-label">
        <span>Total profit</span>
        <span className="profit-readout-mult">
          {multiplier.toFixed(2)}×<InfoDot id="multiplier" />
        </span>
      </span>
      <div className="field-bet">
        <span className="field-prefix">$</span>
        <span className="field-static">{formatMoney(total).replace('$', '')}</span>
      </div>
    </label>
  )
}
