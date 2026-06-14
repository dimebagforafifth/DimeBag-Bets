/**
 * Contests sub-view — time-boxed races for a BALANCE prize pool, with live standings and the
 * player's own position. Prizes are balance only; nothing here is cash or withdrawable.
 */
import { boardRows, boardValue, BOARDS, fmt, type RewardsApi } from './data.js'
import type { Contest } from './economy.js'

const METRIC_LABEL: Record<Contest['metric'], string> = {
  profit: 'Most won',
  volume: 'Most wagered',
  streak: 'Longest win streak',
  clv: 'Best closing-line value',
}
const STATUS_LABEL: Record<Contest['status'], string> = {
  running: 'Live now',
  scheduled: 'Upcoming',
  settled: 'Finished',
}

export function ContestsView({ api }: { api: RewardsApi }) {
  return (
    <>
      <h2 className="rw-h2" style={{ margin: 0 }}>
        Contests &amp; races
      </h2>
      <p className="rw-sub">
        Compete over a set window for a balance prize pool. Standings are live; top finishers split
        the pool.
      </p>

      {api.contests.length === 0 ? (
        <p className="rw-empty">No contests scheduled right now.</p>
      ) : (
        <div className="rw-contest-list">
          {api.contests.map((c) => {
            const def = BOARDS.find((b) => b.id === c.metric)!
            const rows = c.status === 'running' ? boardRows(c.metric, 'weekly', 'global', api.playerName) : []
            const you = rows.find((r) => r.isYou)
            return (
              <article className="rw-card rw-contest" key={c.id}>
                <div className="rw-head">
                  <div>
                    <span className="rw-tile-name">{c.name}</span>
                    <span className="rw-row-desc">{METRIC_LABEL[c.metric]}</span>
                  </div>
                  <span className={`rw-pill rw-status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                </div>

                <div className="rw-contest-prizes">
                  <div className="rw-kpi">
                    <span className="rw-label">Prize pool</span>
                    <strong className="rw-coins">{fmt(c.prizePool)}</strong>
                  </div>
                  <div className="rw-prize-places">
                    {c.prizes.slice(0, 5).map((p, i) => (
                      <span key={i} className="rw-prize">
                        <b>{i + 1}.</b> {fmt(p)}
                      </span>
                    ))}
                  </div>
                </div>

                {c.status === 'running' && (
                  <>
                    {you && (
                      <p className="rw-you-rank">
                        You’re <strong>#{you.rank}</strong> · {boardValue(def, you.value)}
                        {you.prize > 0 && <span className="rw-in-money"> · in the money ({fmt(you.prize)})</span>}
                      </p>
                    )}
                    <table className="rw-board-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Player</th>
                          <th className="rw-num">{def.name}</th>
                          <th className="rw-num">Prize</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((r) => (
                          <tr key={r.rank} className={r.isYou ? 'is-you' : ''}>
                            <td>{r.rank}</td>
                            <td>{r.name}</td>
                            <td className="rw-num">{boardValue(def, r.value)}</td>
                            <td className="rw-num">{r.prize > 0 ? fmt(r.prize) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
