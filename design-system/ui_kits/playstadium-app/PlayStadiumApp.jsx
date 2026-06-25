/* global React, ReactDOM, Shell, CasinoLobby, GamePage, Sportsbook, MyBets, Rewards, Leaderboard, Profile, ConsoleDashboard, PlayersScreen, RiskScreen, SettlementScreen, GamesEdgeScreen, Icon, cx */
const { useState: useApp, useEffect: useAppEffect } = React

const TITLES = {
  casino: 'Casino', sportsbook: 'Sportsbook', mybets: 'My Bets', rewards: 'Rewards',
  leaderboard: 'Leaderboard', profile: 'Profile',
  dashboard: 'Management', players: 'Players & agents', risk: 'Risk & exposure',
  settlement: 'Settlement & ledger', games: 'Games & edge',
}

function Toast({ msg }) {
  if (!msg) return null
  return <div className="psa-toast"><Icon name="check" size={16} />{msg}</div>
}

function PlayStadiumApp() {
  const D = window.PSA_DATA
  const [area, setArea] = useApp('player')
  const [route, setRoute] = useApp('casino')
  const [gameKey, setGameKey] = useApp(null)
  const [search, setSearch] = useApp('')
  const [soundOn, setSoundOn] = useApp(true)
  const [toast, setToast] = useApp('')
  const [wallet, setWallet] = useApp({ avail: D.ME.avail, week: D.ME.week, risk: D.ME.risk })

  useAppEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) }, [toast])

  const navigate = (key) => { setRoute(key); if (key === 'casino') setGameKey(null) }
  const enterConsole = () => { setArea('console'); setRoute('dashboard') }
  const exitConsole = () => { setArea('player'); setRoute('casino'); setGameKey(null) }
  const showToast = (m) => setToast(m)

  const title = gameKey && route === 'casino' ? (D.GAMES.find((g) => g.key === gameKey)?.name || 'Casino') : TITLES[route] || ''
  const showSearch = area === 'player' && route === 'casino' && !gameKey

  let screen = null
  if (area === 'console') {
    screen = route === 'players' ? <PlayersScreen />
      : route === 'risk' ? <RiskScreen />
      : route === 'settlement' ? <SettlementScreen />
      : route === 'games' ? <GamesEdgeScreen />
      : <ConsoleDashboard onNavigate={navigate} />
  } else if (route === 'casino') {
    screen = gameKey
      ? <GamePage gameKey={gameKey} wallet={wallet} onWallet={setWallet} onBack={() => setGameKey(null)} />
      : <CasinoLobby search={search} onPlay={(k) => { setGameKey(k); window.scrollTo(0, 0) }} />
  } else if (route === 'sportsbook') {
    screen = <Sportsbook wallet={wallet} onWallet={setWallet} onToast={showToast} />
  } else if (route === 'mybets') screen = <MyBets wallet={wallet} />
  else if (route === 'rewards') screen = <Rewards me={D.ME} />
  else if (route === 'leaderboard') screen = <Leaderboard />
  else if (route === 'profile') screen = <Profile me={D.ME} wallet={wallet} />

  return (
    <React.Fragment>
      <Shell
        area={area} active={route} title={title}
        search={showSearch ? search : null} onSearch={setSearch}
        onNavigate={navigate} onEnterConsole={enterConsole} onExitConsole={exitConsole}
        wallet={wallet} me={D.ME} soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)}
        onSignOut={() => { window.location.href = 'auth.html' }}
      >
        {screen}
      </Shell>
      <Toast msg={toast} />
    </React.Fragment>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<PlayStadiumApp />)
