/* global React, Icon, Button, Badge, LiveBadge, Card, CardHeader, CardTitle, CardContent, Tabs, Input, cx */
// Casino surfaces: the Originals lobby and an interactive game page (Mines showcase).
const { useState: useS, useMemo: useM } = React

const HERO_ART = '../../assets/game-icons/crash.png'

/* ---------------- Game tile ---------------- */
function GameTile({ g, onPlay }) {
  return (
    <button className="gc" onClick={() => onPlay(g.key)}>
      <span className="gc-art">
        <img src={g.icon} alt="" />
        {(g.hot || g.new) && <span className={cx('gc-flag', g.new && 'is-new')}>{g.new ? 'New' : 'Hot'}</span>}
      </span>
      <span className="gc-body">
        <span className="gc-name">{g.name}</span>
        {g.tag && <span className="gc-tag">{g.tag}</span>}
        <span className="gc-play">Play <Icon name="arrow-right" size={13} /></span>
      </span>
    </button>
  )
}

/* ---------------- Lobby ---------------- */
function CasinoLobby({ search, onPlay }) {
  const D = window.PSA_DATA
  const [cat, setCat] = useS('All')
  const games = useM(() => {
    const q = (search || '').trim().toLowerCase()
    return D.GAMES.filter((g) => (cat === 'All' || g.cat === cat) && (!q || g.name.toLowerCase().includes(q)))
  }, [cat, search])

  return (
    <div className="screen">
      {/* hero */}
      <section className="lobby-hero">
        <div className="lobby-hero-copy">
          <div className="lobby-hero-eyebrows">
            <Badge variant="gold"><Icon name="sparkles" size={12} />21 Originals</Badge>
            <Badge variant="outline"><Icon name="shield-check" size={12} />Provably fair</Badge>
          </div>
          <h2 className="lobby-hero-title wordmark">Stack your week.</h2>
          <p className="lobby-hero-tag">One points balance across every game and the book. No buy-in, no cash-out — just the action.</p>
          <div className="lobby-hero-cta">
            <Button variant="default" size="lg" onClick={() => onPlay('crash')}><Icon name="play" size={16} />Play Crash</Button>
            <Button variant="outline" size="lg" onClick={() => setCat('All')}>Browse all</Button>
          </div>
          <div className="lobby-hero-stats">
            <div className="stat"><span className="stat-label">Biggest win today</span><span className="stat-value up">{D.fmt(2730)}</span></div>
            <div className="sep-v" style={{ height: 34 }} />
            <div className="stat"><span className="stat-label">Players online</span><span className="stat-value num">1,284</span></div>
            <div className="sep-v" style={{ height: 34 }} />
            <div className="stat"><span className="stat-label">Wagered today</span><span className="stat-value num">$284k</span></div>
          </div>
        </div>
        <div className="lobby-hero-art">
          <div className="lobby-hero-glow" />
          <img src={HERO_ART} alt="" />
        </div>
      </section>

      {/* live wins ticker */}
      <div className="psa-ticker">
        <span className="psa-ticker-label"><Icon name="activity" size={14} />Live wins</span>
        <div className="psa-ticker-track">
          {[...D.ACTIVITY, ...D.ACTIVITY].map((a, i) => (
            <span className="psa-ticker-item" key={i}>
              <strong>{a.name}</strong> · {a.game} <span className="num up">{a.mult.toFixed(2)}×</span> <span className="num">{D.fmt(a.payout)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* originals */}
      <div className="section-head">
        <div className="section-head-l">
          <h3 className="h-cond section-title">Originals</h3>
          <span className="num section-count">{games.length}</span>
        </div>
        <Tabs value={cat} onChange={setCat} options={D.CATEGORIES} gold />
      </div>
      <div className="lobby-grid">
        {games.map((g) => <GameTile key={g.key} g={g} onPlay={onPlay} />)}
      </div>

      {/* promo strip — image slots for marketing art */}
      <div className="section-head" style={{ marginTop: 34 }}>
        <h3 className="h-cond section-title">Promotions</h3>
      </div>
      <div className="promo-row">
        <div className="promo-card promo-live">
          <div className="promo-text">
            <Badge variant="gold">Weekly</Badge>
            <h4 className="h-cond">Top the leaderboard</h4>
            <p>Most wagered this week splits a $25,000 points pool.</p>
            <Button variant="secondary" size="sm">See standings</Button>
          </div>
          <img src="../../assets/game-icons/wheel.png" alt="" className="promo-art" />
        </div>
        <div className="ph promo-ph"><span className="ph-tag">Promo banner · 720×260</span></div>
        <div className="ph promo-ph"><span className="ph-tag">Promo banner · 720×260</span></div>
      </div>
    </div>
  )
}

/* ---------------- Mines game ---------------- */
const TILES = 25
function freshMines(count) {
  const idx = new Set()
  while (idx.size < count) idx.add(Math.floor(Math.random() * TILES))
  return idx
}
function minesMultiplier(picks, mines) {
  // simplified fair multiplier with a 3% house edge
  let m = 1
  for (let i = 0; i < picks; i++) m *= (TILES - i) / (TILES - mines - i)
  return m * 0.97
}

function MinesGame({ wallet, onWallet }) {
  const D = window.PSA_DATA
  const [bet, setBet] = useS(100)
  const [mineCount, setMineCount] = useS(3)
  const [round, setRound] = useS(null) // { mines:Set, revealed:[], picks }
  const [result, setResult] = useS(null) // null | 'won' | 'lost'
  const [log, setLog] = useS([
    { id: 1, bet: 200, mult: 3.96, profit: 592, outcome: 'win' },
    { id: 2, bet: 150, mult: 0, profit: -150, outcome: 'loss' },
    { id: 3, bet: 80, mult: 1.32, profit: 26, outcome: 'win' },
  ])
  const active = round && !result
  const picks = round ? round.revealed.filter((r) => r.gem).length : 0
  const curMult = active ? minesMultiplier(picks, mineCount) : 0
  const nextMult = active ? minesMultiplier(picks + 1, mineCount) : minesMultiplier(1, mineCount)
  const cashProfit = Math.round(bet * curMult - bet)

  function start() {
    if (active) return
    setResult(null)
    setRound({ mines: freshMines(mineCount), revealed: [] })
  }
  function pick(i) {
    if (!active) return
    if (round.revealed.some((r) => r.i === i)) return
    if (round.mines.has(i)) {
      setRound((r) => ({ ...r, revealed: [...r.revealed, { i, gem: false }] }))
      setResult('lost')
      onWallet({ ...wallet, avail: wallet.avail - bet, week: wallet.week - bet })
      setLog((l) => [{ id: Date.now(), bet, mult: 0, profit: -bet, outcome: 'loss' }, ...l].slice(0, 8))
    } else {
      setRound((r) => ({ ...r, revealed: [...r.revealed, { i, gem: true }] }))
    }
  }
  function cashout() {
    if (!active || picks === 0) return
    const profit = Math.round(bet * curMult - bet)
    setResult('won')
    onWallet({ ...wallet, avail: wallet.avail + profit, week: wallet.week + profit })
    setLog((l) => [{ id: Date.now(), bet, mult: +curMult.toFixed(2), profit, outcome: 'win' }, ...l].slice(0, 8))
  }
  function tileState(i) {
    if (!round) return 'idle'
    const rev = round.revealed.find((r) => r.i === i)
    if (rev) return rev.gem ? 'gem' : 'mine'
    if (result) return round.mines.has(i) ? 'mine-faded' : 'idle-done'
    return 'idle'
  }

  return (
    <div className="game-layout">
      {/* control panel */}
      <Card className="game-panel">
        <div className="game-panel-inner">
          <div className="gp-field">
            <span className="label">Bet amount</span>
            <div className="gp-bet">
              <div className="gp-bet-input">
                <span className="gp-bet-$">$</span>
                <input className="input num" type="number" value={bet} min={1} disabled={active}
                  onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 0))} />
              </div>
              <Button variant="secondary" size="sm" disabled={active} onClick={() => setBet((b) => Math.max(1, Math.round(b / 2)))}>½</Button>
              <Button variant="secondary" size="sm" disabled={active} onClick={() => setBet((b) => b * 2)}>2×</Button>
            </div>
            <div className="gp-presets">
              {[50, 100, 250, 500].map((v) => (
                <button key={v} className={cx('chip-preset', bet === v && 'is-on')} disabled={active} onClick={() => setBet(v)}>{D.fmt(v)}</button>
              ))}
            </div>
          </div>

          <div className="gp-field">
            <span className="label">Mines</span>
            <div className="gp-mines">
              {[1, 3, 5, 10].map((m) => (
                <button key={m} className={cx('chip-preset', mineCount === m && 'is-on')} disabled={active} onClick={() => setMineCount(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="sep" />

          <div className="gp-readout">
            <div className="stat"><span className="stat-label">{active ? 'Current' : 'Next tile'}</span><span className="stat-value gold num">{(active ? curMult : nextMult).toFixed(2)}×</span></div>
            <div className="stat" style={{ textAlign: 'right' }}><span className="stat-label">Profit on cashout</span><span className={cx('stat-value num', cashProfit >= 0 ? 'up' : '')}>{D.fmt(Math.max(0, cashProfit))}</span></div>
          </div>

          {active ? (
            <Button variant="default" size="lg" block onClick={cashout} disabled={picks === 0}>
              Cash out {D.fmt(Math.round(bet * curMult))}
            </Button>
          ) : (
            <Button variant="default" size="lg" block onClick={start}><Icon name="gem" size={17} />Bet</Button>
          )}
          {result && (
            <div className={cx('gp-result', result === 'won' ? 'is-win' : 'is-loss')}>
              {result === 'won' ? `Cashed out ${curMult.toFixed(2)}× · +${D.fmt(cashProfit)}` : 'Hit a mine — round over'}
            </div>
          )}
        </div>
      </Card>

      {/* board */}
      <div className="game-stage">
        <div className="mines-grid" aria-disabled={!active}>
          {Array.from({ length: TILES }).map((_, i) => {
            const st = tileState(i)
            return (
              <button key={i} className={cx('mine-tile', `is-${st}`)} onClick={() => pick(i)} disabled={!active}>
                {st === 'gem' && <Icon name="gem" size={26} />}
                {(st === 'mine' || st === 'mine-faded') && <Icon name="bolt" size={26} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* per-game ledger */}
      <Card className="game-ledger">
        <CardHeader><CardTitle>Recent rounds</CardTitle></CardHeader>
        <CardContent style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Game</th><th className="r">Bet</th><th className="r">Multiplier</th><th className="r">Profit</th><th className="r">Result</th></tr></thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id}>
                    <td>Mines</td>
                    <td className="r num">{D.fmt(e.bet)}</td>
                    <td className="r num">{e.mult > 0 ? e.mult.toFixed(2) + '×' : '—'}</td>
                    <td className={cx('r num', e.profit > 0 ? 'up' : e.profit < 0 ? 'down' : '')}>{e.profit > 0 ? '+' : ''}{D.fmt(e.profit)}</td>
                    <td className="r"><Badge variant={e.outcome === 'win' ? 'success' : 'destructive'}>{e.outcome === 'win' ? 'Won' : 'Lost'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function GamePage({ gameKey, wallet, onWallet, onBack }) {
  const D = window.PSA_DATA
  const g = D.GAMES.find((x) => x.key === gameKey) || D.GAMES[0]
  const isMines = g.key === 'mines'
  return (
    <div className="screen">
      <button className="crumb" onClick={onBack}><Icon name="arrow-left" size={15} />Casino</button>
      <div className="game-id">
        <span className="game-id-art"><img src={g.icon} alt="" /></span>
        <div>
          <h2 className="h-cond game-id-name">{g.name}</h2>
          <p className="game-id-tag">{g.tag}</p>
        </div>
        <div className="game-id-meta">
          <Badge variant="outline"><Icon name="shield-check" size={12} />Provably fair</Badge>
          <Badge variant="secondary">RTP 97.0%</Badge>
        </div>
      </div>
      {isMines ? <MinesGame wallet={wallet} onWallet={onWallet} /> : (
        <div className="game-layout">
          <Card className="game-panel"><div className="game-panel-inner">
            <div className="gp-field"><span className="label">Bet amount</span>
              <div className="gp-bet-input"><span className="gp-bet-$">$</span><input className="input num" defaultValue={100} /></div>
            </div>
            <Button variant="default" size="lg" block><Icon name="play" size={16} />Bet</Button>
          </div></Card>
          <div className="game-stage game-stage-empty">
            <div className="ph" style={{ width: '100%', height: '100%' }}><span className="ph-tag">{g.name} game canvas</span></div>
          </div>
        </div>
      )}
    </div>
  )
}

Object.assign(window, { CasinoLobby, GamePage })
