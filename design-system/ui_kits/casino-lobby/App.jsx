/* global React, StadiumHeader, FeaturedHero, OriginalsGrid, GameDrawer */
// Stadium casino lobby — interactive demo. Click a tile (or "Take a seat") to
// open the bet drawer; placing a bet settles points into the wallet.

function StadiumLobby() {
  const games = window.STADIUM_GAMES
  const [section, setSection] = React.useState('Lobby')
  const [active, setActive] = React.useState(null) // game in drawer
  const [balanceCents, setBalanceCents] = React.useState(842000)
  const [weekCents, setWeekCents] = React.useState(31200)

  const featured = games.filter((g) => g.featured)
  const hot = games.filter((g) => g.hot)

  const fmt = (c) => '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })

  const settle = (deltaCents) => {
    setBalanceCents((b) => Math.max(0, b + deltaCents))
    setWeekCents((w) => w + deltaCents)
  }

  return (
    <div className="sl-app">
      <StadiumHeader
        section={section}
        onSection={setSection}
        balance={fmt(balanceCents)}
        weekCents={weekCents}
      />
      <main className="sl-main">
        <FeaturedHero game={featured[0]} onPlay={setActive} />
        {hot.length > 0 && <OriginalsGrid title="Hot right now" games={hot} onPlay={setActive} />}
        <OriginalsGrid title="All 21 originals" games={games} onPlay={setActive} />
      </main>
      <footer className="sl-foot">
        <span>PlayStadium plays in points — play-money, never cash.</span>
        <span>Provably fair · 21 originals</span>
      </footer>
      <GameDrawer game={active} onClose={() => setActive(null)} onSettle={settle} />
    </div>
  )
}

window.StadiumLobby = StadiumLobby
