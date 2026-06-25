/* global React, Icon, Button, Badge, Card, CardHeader, CardTitle, CardContent, CardDescription, Tabs, Avatar, Progress, Switch, Stat, cx */
// Account surfaces: My Bets, Rewards (VIP), Leaderboard, Profile & responsible play.
const { useState: useAcc, useMemo: useMAcc } = React

const betProfit = (b) => (b.outcome === 'win' ? Math.round(b.stake * b.mult - b.stake) : -b.stake)
const vipColor = (name) => (window.PSA_DATA.VIP_TIERS.find((t) => t.name === name) || {}).color || 'var(--gold)'

/* ---------------- My Bets ---------------- */
function MyBets({ wallet }) {
  const D = window.PSA_DATA
  const [side, setSide] = useAcc('all')
  const shown = useMAcc(() => D.BETS.filter((b) => side === 'all' || b.side === side), [side])
  const stats = useMAcc(() => {
    const wins = shown.filter((b) => b.outcome === 'win')
    const wagered = shown.reduce((s, b) => s + b.stake, 0)
    const net = shown.reduce((s, b) => s + betProfit(b), 0)
    const best = Math.max(0, ...shown.map((b) => b.mult))
    const big = Math.max(0, ...wins.map(betProfit))
    return { bets: shown.length, wagered, net, winRate: shown.length ? Math.round((wins.length / shown.length) * 100) : 0, best, big, wins: wins.length, losses: shown.length - wins.length }
  }, [shown])

  const casino = D.BETS.filter((b) => b.side === 'casino')
  const sb = D.BETS.filter((b) => b.side === 'sportsbook')
  const sideNet = (arr) => arr.reduce((s, b) => s + betProfit(b), 0)

  return (
    <div className="screen narrow">
      <div className="figure-row">
        <Card className="fig-card"><span className="stat-label">Balance</span><span className="stat-value num">{D.fmt(wallet.avail)}</span><span className="fig-hint">What you can bet right now</span></Card>
        <Card className="fig-card"><span className="stat-label">This week</span><span className={cx('stat-value num', wallet.week > 0 ? 'up' : wallet.week < 0 ? 'down' : '')}>{wallet.week > 0 ? '▲ ' : wallet.week < 0 ? '▼ ' : ''}{D.fmt(Math.abs(wallet.week))}</span><span className="fig-hint">{wallet.week >= 0 ? 'Up — the book owes you' : 'Down — you owe the book'}</span></Card>
        <Card className="fig-card"><span className="stat-label">At risk</span><span className="stat-value num">{D.fmt(wallet.risk)}</span><span className="fig-hint">Stakes on open bets</span></Card>
        <Card className="fig-card"><span className="stat-label">Credit</span><span className="stat-value num">{D.fmt(20000)}</span><span className="fig-hint">How far you can run down</span></Card>
      </div>

      <div className="mb-sides">
        <Card className="side-card"><div className="side-top"><span className="side-name">Casino</span><span className="side-count num">{casino.length} bets</span></div><span className={cx('side-net num', sideNet(casino) >= 0 ? 'up' : 'down')}>{sideNet(casino) >= 0 ? '+' : '−'}{D.fmt(Math.abs(sideNet(casino)))}</span><span className="side-meta">Every game on the floor</span></Card>
        <Card className="side-card"><div className="side-top"><span className="side-name">Sportsbook</span><span className="side-count num">{sb.length} bets</span></div><span className={cx('side-net num', sideNet(sb) >= 0 ? 'up' : 'down')}>{sideNet(sb) >= 0 ? '+' : '−'}{D.fmt(Math.abs(sideNet(sb)))}</span><span className="side-meta">Singles, parlays & live</span></Card>
      </div>

      <div className="section-head"><h3 className="h-cond section-title">Statistics</h3><Tabs value={side} onChange={setSide} options={[{ value: 'all', label: 'All' }, { value: 'casino', label: 'Casino' }, { value: 'sportsbook', label: 'Sportsbook' }]} gold /></div>
      <Card><CardContent style={{ paddingTop: 20 }}><div className="stat-grid">
        <Stat label="Bets" value={stats.bets} />
        <Stat label="Wagered" value={D.fmt(stats.wagered)} />
        <Stat label="Net profit" value={(stats.net >= 0 ? '+' : '−') + D.fmt(Math.abs(stats.net)).replace('$', '$')} deltaTone={stats.net >= 0 ? 'up' : 'down'} />
        <Stat label="Win rate" value={stats.winRate + '%'} />
        <Stat label="Biggest win" value={stats.big > 0 ? '+' + D.fmt(stats.big) : '—'} />
        <Stat label="Best multiplier" value={stats.best > 1 ? stats.best.toFixed(2) + '×' : '—'} />
        <Stat label="Record" value={`${stats.wins}–${stats.losses}`} />
        <Stat label="Games" value={new Set(D.BETS.filter((b)=>b.side==='casino').map((b)=>b.game)).size} />
      </div></CardContent></Card>

      <div className="section-head"><h3 className="h-cond section-title">Bet history</h3></div>
      <Card><CardContent style={{ padding: 0 }}><div className="table-wrap"><table className="tbl">
        <thead><tr><th>Bet</th><th>When</th><th className="r">Stake</th><th className="r">Multiplier</th><th className="r">Profit</th><th className="r">Result</th></tr></thead>
        <tbody>
          {shown.map((b) => { const p = betProfit(b); return (
            <tr key={b.id}>
              <td><div className="mb-bet"><Badge variant={b.side === 'casino' ? 'secondary' : 'outline'}>{b.side === 'casino' ? 'Casino' : 'Book'}</Badge><span>{b.game}</span></div></td>
              <td className="mut">{b.when}</td>
              <td className="r num">{D.fmt(b.stake)}</td>
              <td className="r num">{b.mult > 0 ? b.mult.toFixed(2) + '×' : '—'}</td>
              <td className={cx('r num', p > 0 ? 'up' : 'down')}>{p > 0 ? '+' : '−'}{D.fmt(Math.abs(p))}</td>
              <td className="r"><Badge variant={b.outcome === 'win' ? 'success' : 'destructive'}>{b.outcome === 'win' ? 'Won' : 'Lost'}</Badge></td>
            </tr>
          )})}
        </tbody>
      </table></div></CardContent></Card>
    </div>
  )
}

/* ---------------- Rewards ---------------- */
function Rewards({ me }) {
  const D = window.PSA_DATA
  const tiers = D.VIP_TIERS
  const idx = tiers.findIndex((t) => t.name === me.vip)
  const next = tiers[idx + 1]
  const wagered = 84000 // lifetime
  const pct = next ? Math.min(100, Math.round(((wagered - tiers[idx].need) / (next.need - tiers[idx].need)) * 100)) : 100
  return (
    <div className="screen narrow">
      <Card className="vip-card">
        <div className="vip-head">
          <div className="vip-tier"><Icon name="crown" size={26} style={{ color: vipColor(me.vip) }} /><div><span className="eyebrow">Your tier</span><span className="vip-name h-cond" style={{ color: vipColor(me.vip) }}>{me.vip}</span></div></div>
          <div className="vip-prog-meta"><span className="num">{D.fmt(wagered)}</span> wagered{next && <span className="mut"> · {D.fmt(next.need - wagered)} to {next.name}</span>}</div>
        </div>
        <Progress value={pct} />
        <div className="vip-ladder">
          {tiers.map((t, i) => (
            <div key={t.name} className={cx('vip-step', i <= idx && 'is-reached', i === idx && 'is-current')}>
              <span className="vip-dot" style={{ background: i <= idx ? t.color : 'var(--secondary)' }} />
              <span className="vip-step-name">{t.name}</span>
              <span className="vip-step-need num">{t.need ? '$' + (t.need/1000) + 'k' : '—'}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="section-head"><h3 className="h-cond section-title">Rewards</h3><span className="mut" style={{ fontSize: 13 }}>Earned from real wagers</span></div>
      <div className="reward-grid">
        {D.REWARDS.map((r) => (
          <Card key={r.id} className={cx('reward-card', `is-${r.state}`)}>
            <div className="reward-ic"><Icon name={r.icon} size={20} /></div>
            <div className="reward-body">
              <span className="reward-title">{r.title}</span>
              <span className="reward-sub">{r.sub}</span>
            </div>
            <div className="reward-foot">
              <span className="reward-val num">{r.value}</span>
              {r.state === 'ready' ? <Button variant="default" size="sm">Claim</Button>
                : r.state === 'accruing' ? <Badge variant="gold">Accruing</Badge>
                : <Badge variant="secondary"><Icon name="lock" size={12} />Locked</Badge>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Leaderboard ---------------- */
function Leaderboard() {
  const D = window.PSA_DATA
  const top = D.LEADERBOARD.slice(0, 3)
  const order = [top[1], top[0], top[2]] // silver, gold, bronze
  return (
    <div className="screen narrow">
      <Card className="lb-banner">
        <div><span className="eyebrow">Weekly leaderboard</span><h3 className="h-cond lb-banner-title">Most wagered wins the pool</h3><p className="mut" style={{ fontSize: 13 }}>Resets Sunday at midnight · {D.fmt(25000)} points up top</p></div>
        <Badge variant="gold"><Icon name="clock" size={12} />3d 14h left</Badge>
      </Card>
      <div className="podium">
        {order.map((p, i) => { const place = p.rank; return (
          <div key={p.name} className={cx('podium-col', `p${place}`)}>
            <Avatar name={p.name} size="lg" />
            <span className="podium-name">{p.name}</span>
            <Badge variant="outline" style={{ color: vipColor(p.vip) }}>{p.vip}</Badge>
            <div className={cx('podium-block', `r${place}`)}>
              <span className="podium-rank num">{place}</span>
              <span className="podium-amt num up">+{D.fmt(p.week)}</span>
            </div>
          </div>
        )})}
      </div>
      <Card><CardContent style={{ padding: 0 }}><div className="table-wrap"><table className="tbl">
        <thead><tr><th className="c">#</th><th>Player</th><th>Tier</th><th className="r">Wagered</th><th className="r">This week</th></tr></thead>
        <tbody>
          {D.LEADERBOARD.map((p) => (
            <tr key={p.name} className={cx(p.me && 'is-me')}>
              <td className="c num lb-rank">{p.rank}</td>
              <td><div className="mb-bet"><Avatar name={p.name} size="sm" /><span>{p.name}{p.me && <span className="lb-you"> · You</span>}</span></div></td>
              <td><span style={{ color: vipColor(p.vip), fontWeight: 600, fontSize: 12.5 }}>{p.vip}</span></td>
              <td className="r num">{D.fmt(p.wagered)}</td>
              <td className={cx('r num', p.week >= 0 ? 'up' : 'down')}>{p.week >= 0 ? '+' : '−'}{D.fmt(Math.abs(p.week))}</td>
            </tr>
          ))}
        </tbody>
      </table></div></CardContent></Card>
    </div>
  )
}

/* ---------------- Profile ---------------- */
function Profile({ me, wallet }) {
  const D = window.PSA_DATA
  const [reminder, setReminder] = useAcc(true)
  const [limit, setLimit] = useAcc(5000)
  return (
    <div className="screen narrow">
      <Card className="profile-head">
        <Avatar name={me.name} size="lg" />
        <div className="profile-id">
          <h3 className="h-cond profile-name">{me.name}</h3>
          <div className="profile-meta"><Badge variant="outline" style={{ color: vipColor(me.vip) }}><Icon name="crown" size={12} />{me.vip}</Badge><span className="mut">Member since 2024 · Agent: Eddie Cole</span></div>
        </div>
        <Button variant="secondary" size="sm"><Icon name="settings" size={15} />Edit</Button>
      </Card>

      <div className="stat-grid four">
        <Card className="mini-stat"><Stat label="Lifetime wagered" value={D.fmt(84000)} /></Card>
        <Card className="mini-stat"><Stat label="Net profit" value={'+' + D.fmt(4820)} deltaTone="up" delta="this week" /></Card>
        <Card className="mini-stat"><Stat label="Biggest win" value={'+' + D.fmt(2730)} /></Card>
        <Card className="mini-stat"><Stat label="Win rate" value="58%" /></Card>
      </div>

      <div className="two-col">
        <Card>
          <CardHeader><CardTitle>Responsible play</CardTitle><CardDescription>Set your own guardrails. Points are for fun — these keep it that way.</CardDescription></CardHeader>
          <CardContent>
            <div className="rp-row"><div><span className="rp-label">Weekly wager limit</span><span className="rp-sub num">{D.fmt(limit)}</span></div></div>
            <input type="range" className="slider" min={1000} max={25000} step={500} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            <div className="sep" style={{ margin: '16px 0' }} />
            <div className="rp-row"><div><span className="rp-label">Session reminders</span><span className="rp-sub">A nudge every hour of play</span></div><Switch checked={reminder} onChange={setReminder} /></div>
            <div className="rp-row"><div><span className="rp-label">Cool-off</span><span className="rp-sub">Pause play for a set time</span></div><div className="rp-cool">{['24h', '7d', '30d'].map((t) => <Button key={t} variant="outline" size="sm">{t}</Button>)}</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>
            <div className="kv"><span>Display name</span><span>{me.name}</span></div>
            <div className="kv"><span>Role</span><span style={{ textTransform: 'capitalize' }}>{me.role}</span></div>
            <div className="kv"><span>VIP tier</span><span style={{ color: vipColor(me.vip) }}>{me.vip}</span></div>
            <div className="kv"><span>Balance</span><span className="num">{D.fmt(wallet.avail)}</span></div>
            <div className="kv"><span>Credit line</span><span className="num">{D.fmt(20000)}</span></div>
            <div className="sep" style={{ margin: '14px 0' }} />
            <div className="profile-actions"><Button variant="outline" size="sm"><Icon name="volume-2" size={14} />Sound on</Button><Button variant="outline" size="sm"><Icon name="globe" size={14} />English</Button><Button variant="ghost" size="sm" className="down"><Icon name="log-out" size={14} />Sign out</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

Object.assign(window, { MyBets, Rewards, Leaderboard, Profile })
