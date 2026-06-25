/* global React */
// PlayStadium sportsbook screen — nav/header with shared points balance, a league
// rail, the event list (EventRow), and the docked BetSlip. Composes design-system
// components from the bundle.
const { EventRow, BetSlip, WalletPill, Badge } = window.PlayStadiumDesignSystem_e4e367

function SportsbookApp() {
  const sports = window.PS_SPORTS
  const events = window.PS_EVENTS
  const [sport, setSport] = React.useState('nba')
  const [sel, setSel] = React.useState([])
  const [stake, setStake] = React.useState(100)
  const [mode, setMode] = React.useState('parlay')
  const [balanceCents, setBalanceCents] = React.useState(842000)
  const [weekCents] = React.useState(31200)
  const [toast, setToast] = React.useState(null)

  const shown = events.filter((e) => e.sport === sport)
  const ids = sel.map((s) => s.id)
  const labelOf = (e) => `${e.home.name} vs ${e.away.name} · ${e.league}`

  const pick = (o, ev, event) => {
    setSel((cur) => cur.find((x) => x.id === o.id)
      ? cur.filter((x) => x.id !== o.id)
      : [...cur, { id: o.id, pick: `${o.label}`, event: labelOf(event), price: Number(o.price) }])
  }
  const place = () => {
    setBalanceCents((b) => Math.max(0, b - stake * 100))
    setToast(`Bet placed · ${stake.toLocaleString()} pts`)
    setSel([])
    setTimeout(() => setToast(null), 2600)
  }
  const fmt = (c) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div className="sb-app">
      <header className="sb-header">
        <div className="sb-header__inner">
          <a className="sb-brand" href="../casino-lobby/index.html">
            <img src="../../assets/logo/playstadium-chip-logo.png" alt="PlayStadium.io" />
            <span>PlayStadium</span>
          </a>
          <nav className="sb-nav">
            <a href="../casino-lobby/index.html">Casino</a>
            <a className="is-active" href="#">Sportsbook</a>
            <a href="#">My bets</a>
          </nav>
          <div className="sb-header__right">
            <WalletPill balance={fmt(balanceCents)} weekCents={weekCents} />
          </div>
        </div>
      </header>

      <div className="sb-rail">
        {sports.map((s) => (
          <button key={s.id} className={'sb-rail__btn' + (sport === s.id ? ' is-active' : '')} onClick={() => setSport(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="sb-body">
        <main className="sb-list">
          <div className="sb-list__head">
            <h1>{sports.find((s) => s.id === sport)?.label} <span>· today</span></h1>
            <span className="sb-list__count">{shown.length} events</span>
          </div>
          <div className="sb-rows">
            {shown.map((e) => (
              <EventRow key={e.id} league={e.league} time={e.time} live={e.live} home={e.home} away={e.away} score={e.score}
                markets={e.markets} selectedId={ids.find((id) => e.markets.some((m) => m.options.some((o) => o.id === id)))}
                onPick={(o) => pick(o, e.markets, e)} />
            ))}
          </div>
        </main>
        <div className="sb-slip">
          <BetSlip selections={sel} stake={stake} mode={mode} onStakeChange={setStake} onModeChange={setMode}
            onRemove={(s) => setSel((cur) => cur.filter((x) => x.id !== s.id))} onPlace={place} />
        </div>
      </div>

      {toast ? <div className="sb-toast"><Badge variant="live">Won't settle — demo</Badge> {toast}</div> : null}
    </div>
  )
}

window.SportsbookApp = SportsbookApp
