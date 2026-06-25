/* global React, Icon, Button, Badge, Card, CardHeader, CardTitle, CardContent, CardDescription, Tabs, Avatar, Progress, Switch, Stat, SearchInput, cx */
// Operator console: Dashboard (figures + feature registry), Players & agents, Risk &
// exposure, Settlement & ledger, Games & edge. Mirrors the repo's 6-section console.
const { useState: useC } = React

const TREND7 = [42, 55, 38, 61, 49, 72, 80]

const FEATURES = [
  { sec: 'Daily ops', items: [
    { key: 'settlement', label: 'Settlement', icon: 'wallet', sub: 'Weekly run', nav: 'settlement' },
    { key: 'communication', label: 'Communication', icon: 'megaphone', sub: '3 templates' },
  ] },
  { sec: 'Players', items: [
    { key: 'players', label: 'Players & agents', icon: 'users', sub: '8 players · 2 agents', nav: 'players' },
    { key: 'segments', label: 'Segments', icon: 'filter', sub: '4 segments' },
    { key: 'notes', label: 'Notes & tags', icon: 'hash', sub: '12 tags' },
    { key: 'vip', label: 'VIP', icon: 'crown', sub: '5 tiers' },
  ] },
  { sec: 'Risk', items: [
    { key: 'risk', label: 'Risk & exposure', icon: 'shield', sub: '$36.7k open', nav: 'risk' },
    { key: 'alerts', label: 'Alerts', icon: 'bell', sub: '2 active' },
    { key: 'audit', label: 'Audit log', icon: 'receipt', sub: 'Today' },
  ] },
  { sec: 'Growth', items: [
    { key: 'reporting', label: 'Reporting', icon: 'bar-chart', sub: 'Weekly P&L' },
    { key: 'promotions', label: 'Promotions', icon: 'sparkles', sub: '1 live' },
    { key: 'copilot', label: 'Copilot', icon: 'bolt', sub: 'Beta' },
  ] },
  { sec: 'Settings', items: [
    { key: 'games', label: 'Games & edge', icon: 'sliders', sub: '21 games', nav: 'games' },
    { key: 'permissions', label: 'Permissions', icon: 'lock', sub: 'Role-gated' },
    { key: 'branding', label: 'Branding', icon: 'flag', sub: 'Theme' },
  ] },
]

function FiguresStrip() {
  const D = window.PSA_DATA, f = D.CONSOLE_FIGURES
  return (
    <div className="figs-strip">
      <Card className="fig-big"><Stat label="Book balance" value={D.fmt(f.balance)} /><span className="fig-hint">Net player figures</span></Card>
      <Card className="fig-big"><Stat label="This week" value={'+' + D.fmt(f.week)} delta="vs last $11.2k" deltaTone="up" /></Card>
      <Card className="fig-big"><Stat label="Today" value={'+' + D.fmt(f.today)} delta="12 settled" deltaTone="up" /></Card>
      <Card className="fig-big"><Stat label="Active accounts" value={f.active} delta="of 8" /></Card>
    </div>
  )
}

function ConsoleDashboard({ onNavigate }) {
  const D = window.PSA_DATA
  return (
    <div className="screen">
      <FiguresStrip />
      <div className="dash-grid">
        <Card className="dash-chart">
          <CardHeader><CardTitle>Handle · last 7 days</CardTitle><CardDescription>Total points wagered across casino + book</CardDescription></CardHeader>
          <CardContent>
            <div className="bars">
              {TREND7.map((v, i) => <div key={i} className="bar-col"><div className="bar" style={{ height: v + '%' }} /><span className="bar-x">{['M','T','W','T','F','S','S'][i]}</span></div>)}
            </div>
          </CardContent>
        </Card>
        <Card className="dash-feed">
          <CardHeader><CardTitle>Live activity</CardTitle></CardHeader>
          <CardContent style={{ padding: 0 }}>
            <div className="feed-list">
              {D.LEDGER.slice(0, 6).map((t) => (
                <div className="feed-item" key={t.id}>
                  <Avatar name={t.player} size="sm" />
                  <div className="feed-main"><span className="feed-name">{t.player}</span><span className="feed-sub">{t.type} · {t.detail}</span></div>
                  <span className={cx('feed-amt num', t.amount >= 0 ? 'up' : 'down')}>{t.amount >= 0 ? '+' : '−'}{D.fmt(Math.abs(t.amount))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="section-head"><h3 className="h-cond section-title">Console</h3><span className="mut" style={{ fontSize: 13 }}>Role-gated operator tools</span></div>
      {FEATURES.map((grp) => (
        <div className="feat-group" key={grp.sec}>
          <div className="feat-sec eyebrow">{grp.sec}</div>
          <div className="feat-grid">
            {grp.items.map((it) => (
              <button key={it.key} className={cx('feat-tile', !it.nav && 'is-soft')} onClick={() => it.nav && onNavigate(it.nav)}>
                <span className="feat-ic"><Icon name={it.icon} size={18} /></span>
                <span className="feat-text"><span className="feat-label">{it.label}</span><span className="feat-sub">{it.sub}</span></span>
                {it.nav && <Icon name="chevron-right" size={15} className="feat-go" />}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PlayersScreen() {
  const D = window.PSA_DATA
  const [q, setQ] = useC('')
  const players = D.PLAYERS.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="screen">
      <div className="agent-row">
        {D.AGENTS.map((a) => (
          <Card key={a.id} className="agent-card">
            <Avatar name={a.name} />
            <div className="agent-id"><span className="agent-name">{a.name}</span><span className="agent-sub">{a.players} players · agent</span></div>
            <div className="agent-fig"><span className="stat-label">Week</span><span className="num up">+{D.fmt(a.week)}</span></div>
          </Card>
        ))}
        <Card className="agent-card agent-add"><Button variant="secondary"><Icon name="plus" size={16} />Add agent</Button></Card>
      </div>

      <div className="section-head">
        <h3 className="h-cond section-title">Players</h3>
        <div className="section-tools"><SearchInput placeholder="Find player…" value={q} onChange={(e) => setQ(e.target.value)} /><Button variant="default" size="sm"><Icon name="plus" size={15} />Add player</Button></div>
      </div>
      <Card><CardContent style={{ padding: 0 }}><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Player</th><th>Agent</th><th>Tier</th><th className="r">This week</th><th className="r">Balance</th><th className="r">At risk</th><th>Status</th><th className="r"></th></tr></thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td><div className="mb-bet"><Avatar name={p.name} size="sm" /><span>{p.name}</span></div></td>
              <td className="mut">{p.agent}</td>
              <td><span style={{ color: window.PSA_DATA.VIP_TIERS.find((t)=>t.name===p.vip)?.color, fontWeight: 600, fontSize: 12.5 }}>{p.vip}</span></td>
              <td className={cx('r num', p.week >= 0 ? 'up' : 'down')}>{p.week >= 0 ? '+' : '−'}{D.fmt(Math.abs(p.week))}</td>
              <td className="r num">{D.fmt(p.avail)}</td>
              <td className="r num mut">{D.fmt(p.risk)}</td>
              <td><Badge variant={p.status === 'active' ? 'success' : 'destructive'}>{p.status === 'active' ? 'Active' : 'Suspended'}</Badge></td>
              <td className="r"><button className="btn btn-ghost btn-icon btn-sm"><Icon name="more-horizontal" size={16} /></button></td>
            </tr>
          ))}
        </tbody>
      </table></div></CardContent></Card>
    </div>
  )
}

function RiskScreen() {
  const D = window.PSA_DATA
  const total = D.EXPOSURE.reduce((s, e) => s + e.open, 0)
  return (
    <div className="screen">
      <div className="figs-strip">
        <Card className="fig-big"><Stat label="Open exposure" value={D.fmt(total)} /><span className="fig-hint">Across all live markets</span></Card>
        <Card className="fig-big"><Stat label="Largest position" value={D.fmt(11200)} delta="Eagles ML" deltaTone="down" /></Card>
        <Card className="fig-big"><Stat label="Alerts" value="2" delta="Near cap" deltaTone="down" /></Card>
        <Card className="fig-big"><Stat label="Avg hold" value="4.6%" delta="7-day" deltaTone="up" /></Card>
      </div>
      <div className="section-head"><h3 className="h-cond section-title">Exposure</h3><Tabs value="open" onChange={() => {}} options={[{ value: 'open', label: 'Open' }, { value: 'settled', label: 'Settled' }]} gold /></div>
      <Card><CardContent style={{ padding: 0 }}><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Event</th><th>Market</th><th>Side</th><th className="r">Open</th><th style={{ width: 180 }}>Vs cap</th></tr></thead>
        <tbody>
          {D.EXPOSURE.map((e) => { const pct = Math.round((e.open / e.max) * 100); return (
            <tr key={e.id}>
              <td><span style={{ fontWeight: 600 }}>{e.event}</span></td>
              <td className="mut">{e.market}</td>
              <td>{e.side}</td>
              <td className="r num">{D.fmt(e.open)}</td>
              <td><div className="cap-cell"><div className={cx('cap-bar', `is-${e.tone}`)}><span style={{ width: pct + '%' }} /></div><span className="num cap-pct">{pct}%</span></div></td>
            </tr>
          )})}
        </tbody>
      </table></div></CardContent></Card>
    </div>
  )
}

function SettlementScreen() {
  const D = window.PSA_DATA
  const [tab, setTab] = useC('ledger')
  return (
    <div className="screen">
      <div className="settle-banner-row">
        <Card className="settle-banner">
          <div><span className="eyebrow">Weekly settlement</span><h3 className="h-cond" style={{ fontSize: 20, marginTop: 2 }}>Week 26 · closes Sunday</h3><p className="mut" style={{ fontSize: 13 }}>8 accounts · net {D.fmt(14430)} to the book</p></div>
          <Button variant="default"><Icon name="wallet" size={16} />Run settlement</Button>
        </Card>
      </div>
      <div className="section-head"><h3 className="h-cond section-title">Money desk</h3><Tabs value={tab} onChange={setTab} options={[{ value: 'ledger', label: 'Ledger' }, { value: 'settlements', label: 'Settlements' }]} gold /></div>
      {tab === 'ledger' ? (
        <Card><CardContent style={{ padding: 0 }}><div className="table-wrap"><table className="tbl">
          <thead><tr><th>Time</th><th>Player</th><th>Type</th><th>Detail</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {D.LEDGER.map((t) => (
              <tr key={t.id}>
                <td className="num mut">{t.when}</td>
                <td><div className="mb-bet"><Avatar name={t.player} size="sm" /><span>{t.player}</span></div></td>
                <td><Badge variant={t.type === 'Settle' ? 'success' : t.type === 'Adjust' ? 'gold' : 'secondary'}>{t.type}</Badge></td>
                <td className="mut">{t.detail}</td>
                <td className={cx('r num', t.amount >= 0 ? 'up' : 'down')}>{t.amount >= 0 ? '+' : '−'}{D.fmt(Math.abs(t.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table></div></CardContent></Card>
      ) : (
        <Card><CardContent style={{ paddingTop: 18 }}>
          <div className="settle-list">
            {[26, 25, 24, 23].map((w) => (
              <div className="settle-item" key={w}>
                <div><span style={{ fontWeight: 600 }}>Week {w}</span><span className="mut" style={{ display: 'block', fontSize: 12.5 }}>8 accounts settled</span></div>
                <span className={cx('num', w % 2 ? 'up' : 'down')}>{w % 2 ? '+' : '−'}{D.fmt(8000 + w * 200)}</span>
                <Badge variant="secondary">Closed</Badge>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  )
}

function GamesEdgeScreen() {
  const D = window.PSA_DATA
  const [games, setGames] = useC(() => D.GAMES.map((g) => ({ key: g.key, name: g.name, icon: g.icon, on: true, rtp: 97 - (g.cat === 'Table' ? 1.5 : 0) })))
  const toggle = (k) => setGames((gs) => gs.map((g) => (g.key === k ? { ...g, on: !g.on } : g)))
  return (
    <div className="screen">
      <div className="figs-strip">
        <Card className="fig-big"><Stat label="Games live" value={games.filter((g) => g.on).length} delta={`of ${games.length}`} /></Card>
        <Card className="fig-big"><Stat label="Avg house edge" value="3.0%" /><span className="fig-hint">Across enabled games</span></Card>
        <Card className="fig-big"><Stat label="Overrides" value="0" delta="Native edges" /></Card>
      </div>
      <div className="section-head"><h3 className="h-cond section-title">Games & edge</h3><span className="mut" style={{ fontSize: 13 }}>Toggle availability · set RTP</span></div>
      <Card><CardContent style={{ padding: 0 }}><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Game</th><th>Category</th><th className="r">RTP</th><th style={{ width: 200 }}>House edge</th><th className="c">Live</th></tr></thead>
        <tbody>
          {games.map((g, i) => (
            <tr key={g.key}>
              <td><div className="mb-bet"><span className="ge-ic"><img src={g.icon} alt="" /></span><span>{g.name}</span></div></td>
              <td className="mut">{D.GAMES[i].cat}</td>
              <td className="r num">{g.rtp.toFixed(1)}%</td>
              <td><div className="cap-cell"><div className="cap-bar is-low"><span style={{ width: ((100 - g.rtp) / 6) * 100 + '%' }} /></div><span className="num cap-pct">{(100 - g.rtp).toFixed(1)}%</span></div></td>
              <td className="c"><div style={{ display: 'inline-flex' }}><Switch checked={g.on} onChange={() => toggle(g.key)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table></div></CardContent></Card>
    </div>
  )
}

Object.assign(window, { ConsoleDashboard, PlayersScreen, RiskScreen, SettlementScreen, GamesEdgeScreen })
