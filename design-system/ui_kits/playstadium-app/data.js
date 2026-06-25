/* PlayStadium — mock data for the UI kit. Points only (shown with $ for familiarity,
   no cash value). Game art = the real 3D PNGs in ../../assets/game-icons/. */
(function () {
  const ART = '../../assets/game-icons/'

  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US')
  const fmtSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US')
  const mult = (m) => m.toFixed(2) + '×'

  // 21 Originals — key matches the PNG filename in assets/game-icons/
  const GAMES = [
    { key: 'mines', name: 'Mines', cat: 'Originals', hot: true, tag: 'Uncover gems for a rising multiplier while dodging the hidden mines.' },
    { key: 'crash', name: 'Crash', cat: 'Originals', hot: true, tag: 'Watch the multiplier climb and cash out before the rocket crashes.' },
    { key: 'plinko', name: 'Plinko', cat: 'Originals', hot: true, tag: 'Drop a ball down the pins and ride it to a multiplier — the edges pay biggest.' },
    { key: 'dice', name: 'Dice', cat: 'Originals', tag: 'Roll over or under your number — slide to set your own odds and payout.' },
    { key: 'limbo', name: 'Limbo', cat: 'Originals', hot: true, tag: 'Pick a target multiplier and watch your bet climb — clear it to win.' },
    { key: 'keno', name: 'Keno', cat: 'Originals', tag: 'Choose your numbers and watch the draw — the more you match, the more you win.' },
    { key: 'wheel', name: 'Wheel', cat: 'Originals', tag: 'Spin the wheel and land a multiplier — set your risk and segments.' },
    { key: 'hilo', name: 'Hilo', cat: 'Cards', tag: 'Call the next card higher or lower and ride the streak.' },
    { key: 'dragon-tower', name: 'Dragon Tower', cat: 'Originals', tag: 'Climb the tower row by row, dodging the hidden skulls.' },
    { key: 'pump', name: 'Pump', cat: 'Originals', hot: true, tag: 'Inflate the balloon for a bigger multiplier — bank it before it pops.' },
    { key: 'coinflip', name: 'Coinflip', cat: 'Originals', tag: 'Heads or tails — double or nothing, the simplest edge on the floor.' },
    { key: 'diamonds', name: 'Diamonds', cat: 'Originals', tag: 'Match the gems you draw for a poker-style multiplier payout.' },
    { key: 'cases', name: 'Cases', cat: 'Originals', tag: 'Open a case and spin the reel for a hidden multiplier.' },
    { key: 'chickenroad', name: 'Chicken Road', cat: 'Originals', new: true, tag: 'Cross lane by lane for a climbing multiplier — don\u2019t get caught.' },
    { key: 'blackjack', name: 'Blackjack', cat: 'Table', tag: 'Beat the dealer to 21 without going over.' },
    { key: 'roulette', name: 'Roulette', cat: 'Table', tag: 'Place your chips on the single-zero European wheel.' },
    { key: 'baccarat', name: 'Baccarat', cat: 'Table', tag: 'Bet player, banker or tie on the classic table game.' },
    { key: 'sicbo', name: 'Sic Bo', cat: 'Table', tag: 'Three dice, dozens of bets — call the roll.' },
    { key: 'threecardpoker', name: 'Three Card Poker', cat: 'Cards', tag: 'Make your best three-card hand against the dealer.' },
    { key: 'videopoker', name: 'Video Poker', cat: 'Cards', new: true, tag: 'Jacks or better — hold, draw and hit the royal.' },
    { key: 'slots', name: 'Slots', cat: 'Slots', tag: 'Spin the reels for lines, scatters and free spins.' },
  ].map((g) => ({ ...g, icon: ART + g.key + '.png' }))

  const CATEGORIES = ['All', 'Originals', 'Table', 'Cards', 'Slots']

  // Sportsbook
  const SPORTS = [
    { key: 'all', label: 'All' }, { key: 'nba', label: 'NBA' }, { key: 'nfl', label: 'NFL' },
    { key: 'soccer', label: 'Soccer' }, { key: 'mlb', label: 'MLB' }, { key: 'nhl', label: 'NHL' }, { key: 'ufc', label: 'UFC' },
  ]
  const EVENTS = [
    { id: 'e1', league: 'NBA', sport: 'nba', live: true, clock: 'Q3 · 4:12', away: { name: 'Celtics', score: 71 }, home: { name: 'Lakers', score: 68 },
      markets: { type: '3way', cols: ['Spread', 'Total', 'Money'], rows: [
        { label: 'Celtics', a: '-3.5', ao: '-110', b: 'o 224.5', bo: '-105', c: '-145' },
        { label: 'Lakers', a: '+3.5', ao: '-110', b: 'u 224.5', bo: '-115', c: '+124' }] } },
    { id: 'e2', league: 'NBA', sport: 'nba', time: 'Tomorrow · 7:30 PM', away: { name: 'Warriors' }, home: { name: 'Nuggets' },
      markets: { type: '3way', cols: ['Spread', 'Total', 'Money'], rows: [
        { label: 'Warriors', a: '+5.5', ao: '-108', b: 'o 232.5', bo: '-110', c: '+182' },
        { label: 'Nuggets', a: '-5.5', ao: '-112', b: 'u 232.5', bo: '-110', c: '-220' }] } },
    { id: 'e3', league: 'NFL', sport: 'nfl', time: 'Sun · 1:00 PM', away: { name: 'Eagles' }, home: { name: 'Cowboys' },
      markets: { type: '3way', cols: ['Spread', 'Total', 'Money'], rows: [
        { label: 'Eagles', a: '-2.5', ao: '-110', b: 'o 47.5', bo: '-110', c: '-135' },
        { label: 'Cowboys', a: '+2.5', ao: '-110', b: 'u 47.5', bo: '-110', c: '+114' }] } },
    { id: 'e4', league: 'Soccer', sport: 'soccer', live: true, clock: "67'", away: { name: 'Arsenal', score: 1 }, home: { name: 'Chelsea', score: 1 },
      markets: { type: '1x2', cols: ['1', 'X', '2'], rows: [
        { label: 'Match result', a: '+165', b: '+205', c: '+170' }] } },
    { id: 'e5', league: 'NHL', sport: 'nhl', time: 'Today · 9:00 PM', away: { name: 'Oilers' }, home: { name: 'Knights' },
      markets: { type: '3way', cols: ['Puck', 'Total', 'Money'], rows: [
        { label: 'Oilers', a: '+1.5', ao: '-180', b: 'o 6.5', bo: '+100', c: '+128' },
        { label: 'Knights', a: '-1.5', ao: '+150', b: 'u 6.5', bo: '-120', c: '-152' }] } },
    { id: 'e6', league: 'MLB', sport: 'mlb', time: 'Today · 8:05 PM', away: { name: 'Dodgers' }, home: { name: 'Padres' },
      markets: { type: '3way', cols: ['Run', 'Total', 'Money'], rows: [
        { label: 'Dodgers', a: '-1.5', ao: '+128', b: 'o 8.5', bo: '-105', c: '-138' },
        { label: 'Padres', a: '+1.5', ao: '-150', b: 'u 8.5', bo: '-115', c: '+118' }] } },
    { id: 'e7', league: 'UFC', sport: 'ufc', time: 'Sat · 10:00 PM', away: { name: 'Adesanya' }, home: { name: 'Pereira' },
      markets: { type: 'ml', cols: ['Money'], rows: [
        { label: 'Adesanya', c: '+135' }, { label: 'Pereira', c: '-155' }] } },
  ]

  // Org roster (hierarchy)
  const PLAYERS = [
    { id: 'p1', name: 'Marcus Vane', role: 'player', agent: 'Eddie Cole', week: 4820, avail: 12400, risk: 600, status: 'active', vip: 'Gold' },
    { id: 'p2', name: 'Sloane Reyes', role: 'player', agent: 'Eddie Cole', week: -1240, avail: 3800, risk: 250, status: 'active', vip: 'Silver' },
    { id: 'p3', name: 'Theo Park', role: 'player', agent: 'Nadia Frost', week: 9680, avail: 22100, risk: 1500, status: 'active', vip: 'Platinum' },
    { id: 'p4', name: 'Junie Hart', role: 'player', agent: 'Nadia Frost', week: -3200, avail: 900, risk: 0, status: 'active', vip: 'Bronze' },
    { id: 'p5', name: 'Dario Quinn', role: 'player', agent: 'Eddie Cole', week: 1450, avail: 7600, risk: 400, status: 'active', vip: 'Silver' },
    { id: 'p6', name: 'Wes Calloway', role: 'player', agent: 'Nadia Frost', week: -560, avail: 5200, risk: 120, status: 'suspended', vip: 'Bronze' },
    { id: 'p7', name: 'Indra Bose', role: 'player', agent: 'Eddie Cole', week: 12300, avail: 31000, risk: 2200, status: 'active', vip: 'Diamond' },
    { id: 'p8', name: 'Cleo March', role: 'player', agent: 'Nadia Frost', week: 740, avail: 4100, risk: 80, status: 'active', vip: 'Gold' },
  ]
  const AGENTS = [
    { id: 'a1', name: 'Eddie Cole', role: 'agent', players: 4, week: 7470, status: 'active' },
    { id: 'a2', name: 'Nadia Frost', role: 'agent', players: 4, week: 6960, status: 'active' },
  ]

  // The signed-in player (the wallet in the header)
  const ME = { id: 'p1', name: 'Marcus Vane', vip: 'Gold', avail: 12400, week: 4820, risk: 600, role: 'player' }

  // My Bets feed (casino + sportsbook)
  const BETS = [
    { id: 'b1', game: 'Mines', side: 'casino', stake: 200, mult: 3.96, outcome: 'win', when: '2m ago' },
    { id: 'b2', game: 'Lakers ML', side: 'sportsbook', stake: 500, mult: 0, outcome: 'loss', when: '14m ago' },
    { id: 'b3', game: 'Crash', side: 'casino', stake: 150, mult: 12.4, outcome: 'win', when: '31m ago' },
    { id: 'b4', game: 'Celtics −3.5', side: 'sportsbook', stake: 300, mult: 1.91, outcome: 'win', when: '1h ago' },
    { id: 'b5', game: 'Plinko', side: 'casino', stake: 100, mult: 0, outcome: 'loss', when: '1h ago' },
    { id: 'b6', game: 'Limbo', side: 'casino', stake: 80, mult: 2.0, outcome: 'win', when: '2h ago' },
    { id: 'b7', game: 'Parlay (3)', side: 'sportsbook', stake: 250, mult: 0, outcome: 'loss', when: '3h ago' },
    { id: 'b8', game: 'Dice', side: 'casino', stake: 120, mult: 1.98, outcome: 'win', when: '4h ago' },
    { id: 'b9', game: 'Pump', side: 'casino', stake: 60, mult: 0, outcome: 'loss', when: '5h ago' },
    { id: 'b10', game: 'Roulette', side: 'casino', stake: 200, mult: 2.0, outcome: 'win', when: '6h ago' },
    { id: 'b11', game: 'Warriors +5.5', side: 'sportsbook', stake: 400, mult: 1.92, outcome: 'win', when: 'Yesterday' },
    { id: 'b12', game: 'Wheel', side: 'casino', stake: 90, mult: 0, outcome: 'loss', when: 'Yesterday' },
  ]

  // Leaderboard (weekly)
  const LEADERBOARD = [
    { rank: 1, name: 'Indra Bose', vip: 'Diamond', week: 12300, wagered: 84000 },
    { rank: 2, name: 'Theo Park', vip: 'Platinum', week: 9680, wagered: 61200 },
    { rank: 3, name: 'Marcus Vane', vip: 'Gold', week: 4820, wagered: 39400, me: true },
    { rank: 4, name: 'Dario Quinn', vip: 'Silver', week: 1450, wagered: 18600 },
    { rank: 5, name: 'Cleo March', vip: 'Gold', week: 740, wagered: 14200 },
    { rank: 6, name: 'Wes Calloway', vip: 'Bronze', week: -560, wagered: 9800 },
    { rank: 7, name: 'Sloane Reyes', vip: 'Silver', week: -1240, wagered: 22300 },
    { rank: 8, name: 'Junie Hart', vip: 'Bronze', week: -3200, wagered: 12700 },
  ]

  // VIP / rewards
  const VIP_TIERS = [
    { name: 'Bronze', need: 0, color: '#b08d57' },
    { name: 'Silver', need: 25000, color: '#c4c4c2' },
    { name: 'Gold', need: 75000, color: '#f0be4a' },
    { name: 'Platinum', need: 200000, color: '#9fd8e8' },
    { name: 'Diamond', need: 500000, color: '#7ea2ff' },
  ]
  const REWARDS = [
    { id: 'r1', title: 'Weekly bonus', sub: 'Claim every Monday', value: '$500', state: 'ready', icon: 'gift' },
    { id: 'r2', title: 'Rakeback', sub: '5% of house edge, daily', value: '$128', state: 'accruing', icon: 'percent' },
    { id: 'r3', title: 'Reload boost', sub: 'Next 3 deposits +10%', value: '+10%', state: 'locked', icon: 'zap' },
    { id: 'r4', title: 'Level-up chest', sub: 'Unlocks at Platinum', value: '$2,500', state: 'locked', icon: 'sparkles' },
  ]

  // Risk / exposure (operator)
  const EXPOSURE = [
    { id: 'x1', event: 'Lakers v Celtics', market: 'Spread', side: 'Lakers +3.5', open: 8400, max: 12000, tone: 'mid' },
    { id: 'x2', event: 'Cowboys v Eagles', market: 'Money', side: 'Eagles ML', open: 11200, max: 12000, tone: 'high' },
    { id: 'x3', event: 'Casino · Crash', market: 'Originals', side: 'House', open: 3200, max: 15000, tone: 'low' },
    { id: 'x4', event: 'Nuggets v Warriors', market: 'Total', side: 'Over 232.5', open: 6100, max: 12000, tone: 'mid' },
    { id: 'x5', event: 'Padres v Dodgers', market: 'Run line', side: 'Dodgers -1.5', open: 2400, max: 10000, tone: 'low' },
    { id: 'x6', event: 'Casino · Mines', market: 'Originals', side: 'House', open: 5400, max: 15000, tone: 'mid' },
  ]

  // Ledger / cashier transactions
  const LEDGER = [
    { id: 't1', when: '09:42', player: 'Marcus Vane', type: 'Settle', detail: 'Mines · win', amount: 592 },
    { id: 't2', when: '09:40', player: 'Sloane Reyes', type: 'Wager', detail: 'Lakers ML', amount: -500 },
    { id: 't3', when: '09:31', player: 'Theo Park', type: 'Settle', detail: 'Crash · win', amount: 1860 },
    { id: 't4', when: '09:18', player: 'Indra Bose', type: 'Adjust', detail: 'Credit increase', amount: 5000 },
    { id: 't5', when: '09:02', player: 'Junie Hart', type: 'Wager', detail: 'Parlay (3)', amount: -250 },
    { id: 't6', when: '08:55', player: 'Dario Quinn', type: 'Settle', detail: 'Roulette · win', amount: 400 },
    { id: 't7', when: '08:47', player: 'Cleo March', type: 'Wager', detail: 'Dice', amount: -120 },
    { id: 't8', when: '08:30', player: 'Wes Calloway', type: 'Settle', detail: 'Plinko · loss', amount: -100 },
  ]

  // Live activity ticker (lobby)
  const ACTIVITY = [
    { name: 'Indra B.', game: 'Crash', mult: 18.2, payout: 2730 },
    { name: 'Theo P.', game: 'Mines', mult: 9.1, payout: 1820 },
    { name: 'Cleo M.', game: 'Limbo', mult: 4.0, payout: 360 },
    { name: 'Dario Q.', game: 'Plinko', mult: 6.5, payout: 975 },
    { name: 'Marcus V.', game: 'Dice', mult: 1.98, payout: 238 },
  ]

  const CONSOLE_FIGURES = { balance: 102400, week: 14430, weekTone: 'up', today: 3260, todayTone: 'up', active: 7 }

  window.PSA_DATA = {
    fmt, fmtSigned, mult,
    GAMES, CATEGORIES, SPORTS, EVENTS, PLAYERS, AGENTS, ME, BETS, LEADERBOARD,
    VIP_TIERS, REWARDS, EXPOSURE, LEDGER, ACTIVITY, CONSOLE_FIGURES,
  }
})()
