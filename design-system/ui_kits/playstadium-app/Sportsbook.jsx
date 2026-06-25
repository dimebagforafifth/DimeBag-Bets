/* global React, Icon, Button, Badge, LiveBadge, Card, Tabs, Input, Dialog, cx */
// Sportsbook: league rail, event board with tappable odds, and a docked bet slip
// (single / parlay) that debits the shared points balance.
const { useState: useSB, useMemo: useMSB } = React

const toDecimal = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a))
const oddsNum = (s) => Number(String(s).replace(/[^-\d.]/g, ''))

function OddsButton({ main, odds, selected, onClick }) {
  return (
    <button className={cx('odds', selected && 'is-on')} onClick={onClick}>
      {odds != null ? (
        <React.Fragment><span className="odds-line">{main}</span><span className="odds-price num">{odds}</span></React.Fragment>
      ) : (
        <span className="odds-price num solo">{main}</span>
      )}
    </button>
  )
}

function EventCard({ ev, has, toggle }) {
  const D = window.PSA_DATA
  const colKey = (ci) => (ci === 0 ? ['a', 'ao'] : ci === 1 ? ['b', 'bo'] : ['c', null])
  const mk = ev.markets
  return (
    <Card className="ev-card">
      <div className="ev-top">
        <div className="ev-top-l">
          <Badge variant="secondary">{ev.league}</Badge>
          {ev.live ? <LiveBadge>{ev.clock}</LiveBadge> : <span className="ev-time"><Icon name="clock" size={13} />{ev.time}</span>}
        </div>
        <button className="ev-more">+ markets</button>
      </div>
      <div className="ev-body">
        <div className="ev-match">
          {[ev.away, ev.home].map((t, ti) => (
            <div className="ev-team" key={ti}>
              <span className="ev-team-name">{t.name}</span>
              {t.score != null && <span className="ev-team-score num">{t.score}</span>}
            </div>
          ))}
        </div>
        <div className="ev-markets" style={{ '--cols': mk.cols.length }}>
          {mk.cols.map((c) => <div className="ev-col-head" key={c}>{c}</div>)}
          {mk.type === '1x2'
            ? mk.cols.map((c, ci) => {
                const field = ['a', 'b', 'c'][ci]
                const val = mk.rows[0][field]
                const id = `${ev.id}:${c}`
                return <OddsButton key={c} main={val} selected={has(id)} onClick={() => toggle({ id, event: `${ev.away.name} v ${ev.home.name}`, pick: `${c==='1'?ev.away.name:c==='2'?ev.home.name:'Draw'}`, odds: val })} />
              })
            : mk.cols.map((c, ci) => {
                const [mf, of] = colKey(ci)
                return mk.rows.map((row, ri) => {
                  const main = row[mf]; const odd = of ? row[of] : null
                  if (main == null) return <span key={c+ri} />
                  const id = `${ev.id}:${c}:${ri}`
                  const pick = of ? `${row.label} ${main}` : `${row.label} ML`
                  return <OddsButton key={c+ri} main={main} odds={odd} selected={has(id)} onClick={() => toggle({ id, event: `${ev.away.name} v ${ev.home.name}`, pick, odds: odd || main })} />
                })
              })}
        </div>
      </div>
    </Card>
  )
}

function BetSlip({ sels, setSels, wallet, onWallet, onPlaced }) {
  const D = window.PSA_DATA
  const [mode, setMode] = useSB('single')
  const [stake, setStake] = useSB(50)
  const remove = (id) => setSels((s) => s.filter((x) => x.id !== id))
  const dec = sels.map((s) => toDecimal(oddsNum(s.odds)))
  const parlayDec = dec.reduce((a, b) => a * b, 1)
  const potential = sels.length === 0 ? 0
    : mode === 'parlay' ? stake * parlayDec
    : sels.reduce((sum, s) => sum + stake * toDecimal(oddsNum(s.odds)), 0)
  const totalStake = mode === 'parlay' ? stake : stake * sels.length
  const canPlace = sels.length > 0 && stake > 0 && totalStake <= wallet.avail
  function place() {
    if (!canPlace) return
    onWallet({ ...wallet, avail: wallet.avail - totalStake, risk: wallet.risk + totalStake })
    setSels([])
    onPlaced(`Bet placed · ${D.fmt(totalStake)} stake`)
  }
  return (
    <div className="slip">
      <div className="slip-head">
        <span className="h-cond slip-title">Bet slip</span>
        {sels.length > 0 && <Badge variant="gold">{sels.length}</Badge>}
        {sels.length > 0 && <button className="slip-clear" onClick={() => setSels([])}>Clear</button>}
      </div>
      {sels.length > 1 && (
        <Tabs className="slip-tabs" value={mode} onChange={setMode} options={[{ value: 'single', label: 'Singles' }, { value: 'parlay', label: `Parlay ${parlayDec.toFixed(2)}×` }]} gold />
      )}
      {sels.length === 0 ? (
        <div className="slip-empty">
          <Icon name="ticket" size={26} />
          <p>Tap any odds to add a pick.</p>
        </div>
      ) : (
        <div className="slip-list scroll-y">
          {sels.map((s) => (
            <div className="slip-pick" key={s.id}>
              <div className="slip-pick-main">
                <span className="slip-pick-name">{s.pick}</span>
                <span className="slip-pick-ev">{s.event}</span>
              </div>
              <span className="slip-pick-odds num">{s.odds}</span>
              <button className="slip-x" onClick={() => remove(s.id)}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {sels.length > 0 && (
        <div className="slip-foot">
          <div className="slip-stake">
            <span className="label">{mode === 'parlay' ? 'Parlay stake' : 'Stake (each)'}</span>
            <div className="gp-bet-input"><span className="gp-bet-$">$</span><input className="input num" type="number" value={stake} min={1} onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))} /></div>
          </div>
          <div className="slip-summary">
            <div className="slip-row"><span>Total stake</span><span className="num">{D.fmt(totalStake)}</span></div>
            <div className="slip-row slip-row-pot"><span>Potential payout</span><span className="num gold">{D.fmt(potential)}</span></div>
          </div>
          <Button variant="default" size="lg" block disabled={!canPlace} onClick={place}>
            {totalStake > wallet.avail ? 'Not enough points' : 'Place bet'}
          </Button>
        </div>
      )}
    </div>
  )
}

function Sportsbook({ wallet, onWallet, onToast }) {
  const D = window.PSA_DATA
  const [league, setLeague] = useSB('all')
  const [sels, setSels] = useSB([])
  const [slipOpen, setSlipOpen] = useSB(false)
  const events = useMSB(() => D.EVENTS.filter((e) => league === 'all' || e.sport === league), [league])
  const has = (id) => sels.some((s) => s.id === id)
  const toggle = (sel) => setSels((s) => (s.some((x) => x.id === sel.id) ? s.filter((x) => x.id !== sel.id) : [...s, sel]))

  return (
    <div className="screen sb-screen">
      <div className="sb-main">
        <div className="sb-rail">
          {D.SPORTS.map((s) => (
            <button key={s.key} className={cx('rail-chip', league === s.key && 'is-on')} onClick={() => setLeague(s.key)}>{s.label}</button>
          ))}
        </div>
        <div className="sb-board">
          {events.map((ev) => <EventCard key={ev.id} ev={ev} has={has} toggle={toggle} />)}
        </div>
      </div>
      <aside className="sb-slip-dock">
        <BetSlip sels={sels} setSels={setSels} wallet={wallet} onWallet={onWallet} onPlaced={onToast} />
      </aside>

      {/* mobile slip */}
      {sels.length > 0 && (
        <button className="slip-fab" onClick={() => setSlipOpen(true)}><Icon name="ticket" size={18} />Bet slip · {sels.length}</button>
      )}
      <Dialog open={slipOpen} onClose={() => setSlipOpen(false)} sheet>
        <div className="sheet-head"><span className="h-cond" style={{ fontSize: 18 }}>Bet slip</span><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSlipOpen(false)}><Icon name="x" size={18} /></button></div>
        <div className="sheet-body scroll-y"><BetSlip sels={sels} setSels={setSels} wallet={wallet} onWallet={onWallet} onPlaced={(m) => { onToast(m); setSlipOpen(false) }} /></div>
      </Dialog>
    </div>
  )
}

window.Sportsbook = Sportsbook
