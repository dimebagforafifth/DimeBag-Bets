// PlayStadium sportsbook — sample events. Decimal odds. One shared points balance.
window.PS_SPORTS = [
  { id: 'nba', label: 'NBA' }, { id: 'epl', label: 'Soccer' }, { id: 'nfl', label: 'NFL' },
  { id: 'mlb', label: 'MLB' }, { id: 'ufc', label: 'UFC' }, { id: 'nhl', label: 'NHL' },
]
window.PS_EVENTS = [
  { id: 'e1', sport: 'nba', league: 'NBA', time: 'LIVE', live: true, home: { name: 'Lakers' }, away: { name: 'Celtics' }, score: { home: 58, away: 61 },
    markets: [
      { heading: 'Spread', options: [{ id: 'e1-sh', label: 'LAL -3.5', price: '1.91' }, { id: 'e1-sa', label: 'BOS +3.5', price: '1.91', move: 'up' }] },
      { heading: 'Total', options: [{ id: 'e1-to', label: 'O 218.5', price: '1.87' }, { id: 'e1-tu', label: 'U 218.5', price: '1.95' }] },
      { heading: 'Money', options: [{ id: 'e1-mh', label: 'LAL', price: '1.74' }, { id: 'e1-ma', label: 'BOS', price: '2.10', move: 'down' }] },
    ] },
  { id: 'e2', sport: 'nba', league: 'NBA', time: '9:00 PM', home: { name: 'Warriors' }, away: { name: 'Nuggets' },
    markets: [
      { heading: 'Spread', options: [{ id: 'e2-sh', label: 'GSW -1.5', price: '1.95' }, { id: 'e2-sa', label: 'DEN +1.5', price: '1.87' }] },
      { heading: 'Total', options: [{ id: 'e2-to', label: 'O 232.5', price: '1.90' }, { id: 'e2-tu', label: 'U 232.5', price: '1.92' }] },
      { heading: 'Money', options: [{ id: 'e2-mh', label: 'GSW', price: '1.83' }, { id: 'e2-ma', label: 'DEN', price: '2.00' }] },
    ] },
  { id: 'e3', sport: 'epl', league: 'EPL', time: '11:30 AM', home: { name: 'Arsenal' }, away: { name: 'Chelsea' },
    markets: [
      { heading: '1X2', options: [{ id: 'e3-h', label: 'ARS', price: '1.55' }, { id: 'e3-d', label: 'Draw', price: '4.20' }, { id: 'e3-a', label: 'CHE', price: '5.50', move: 'down' }] },
    ] },
  { id: 'e4', sport: 'epl', league: 'LaLiga', time: '1:00 PM', home: { name: 'Madrid' }, away: { name: 'Sevilla' },
    markets: [
      { heading: '1X2', options: [{ id: 'e4-h', label: 'RMA', price: '1.40' }, { id: 'e4-d', label: 'Draw', price: '4.80' }, { id: 'e4-a', label: 'SEV', price: '7.50' }] },
    ] },
  { id: 'e5', sport: 'nfl', league: 'NFL', time: 'Sun 1:00 PM', home: { name: 'Chiefs' }, away: { name: 'Bills' },
    markets: [
      { heading: 'Spread', options: [{ id: 'e5-sh', label: 'KC -2.5', price: '1.91' }, { id: 'e5-sa', label: 'BUF +2.5', price: '1.91' }] },
      { heading: 'Total', options: [{ id: 'e5-to', label: 'O 48.5', price: '1.90' }, { id: 'e5-tu', label: 'U 48.5', price: '1.92' }] },
      { heading: 'Money', options: [{ id: 'e5-mh', label: 'KC', price: '1.65', move: 'up' }, { id: 'e5-ma', label: 'BUF', price: '2.30' }] },
    ] },
  { id: 'e6', sport: 'ufc', league: 'UFC 312', time: 'Sat 10:00 PM', home: { name: 'Adesanya' }, away: { name: 'Pereira' },
    markets: [
      { heading: 'Winner', options: [{ id: 'e6-h', label: 'ADE', price: '2.05' }, { id: 'e6-a', label: 'PER', price: '1.80' }] },
    ] },
]
