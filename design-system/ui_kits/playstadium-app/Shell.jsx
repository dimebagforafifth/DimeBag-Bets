/* global React, Icon, Button, Avatar, Badge, Dropdown, MenuItem, MenuLabel, MenuSep, Switch, Separator, SearchInput, cx */
// The app shell: shadcn-style left sidebar (swaps between the player app and the
// operator console), a topbar with the live wallet + account menu, and the scrolling
// content area. Pure chrome — App.jsx owns routing state and renders the active screen.
const { useState: useStateShell } = React

const LOGO = '../../assets/logo/playstadium-logo-trim.png'

const PLAYER_NAV = [
  { group: 'Play', items: [
    { key: 'casino', label: 'Casino', icon: 'dice' },
    { key: 'sportsbook', label: 'Sportsbook', icon: 'target' },
  ] },
  { group: 'Account', items: [
    { key: 'mybets', label: 'My Bets', icon: 'receipt' },
    { key: 'rewards', label: 'Rewards', icon: 'gift' },
    { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
    { key: 'profile', label: 'Profile', icon: 'user' },
  ] },
]
const CONSOLE_NAV = [
  { group: 'Operate', items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { key: 'players', label: 'Players & agents', icon: 'users' },
    { key: 'risk', label: 'Risk & exposure', icon: 'shield' },
    { key: 'settlement', label: 'Settlement & ledger', icon: 'wallet' },
    { key: 'games', label: 'Games & edge', icon: 'sliders' },
  ] },
]

function Brand({ onClick }) {
  return (
    <button className="psa-brand" onClick={onClick}>
      <img src={LOGO} alt="" className="psa-brand-mark" />
      <span className="psa-brand-name wordmark">PlayStadium<span className="psa-brand-dot">.io</span></span>
    </button>
  )
}

function SideNav({ nav, active, onNavigate }) {
  return (
    <nav className="psa-nav scroll-y">
      {nav.map((g) => (
        <div className="psa-nav-group" key={g.group}>
          <div className="psa-nav-label">{g.group}</div>
          {g.items.map((it) => (
            <button key={it.key} className={cx('psa-nav-item', active === it.key && 'is-active')} onClick={() => onNavigate(it.key)}>
              <Icon name={it.icon} size={18} />
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Wallet({ wallet }) {
  const { fmt, fmtSigned } = window.PSA_DATA
  const up = wallet.week > 0, down = wallet.week < 0
  return (
    <div className="psa-wallet">
      <div className="psa-wallet-block">
        <span className="psa-wallet-label">Balance</span>
        <span className="psa-wallet-value num">{fmt(wallet.avail)}</span>
      </div>
      <div className="sep-v" style={{ height: 28 }} />
      <div className="psa-wallet-block">
        <span className="psa-wallet-label">This week</span>
        <span className={cx('psa-wallet-value num', up && 'up', down && 'down')}>
          {wallet.week === 0 ? 'Even' : (up ? '▲ ' : '▼ ') + fmtSigned(wallet.week).replace(/^[+−]/, '')}
        </span>
      </div>
      <Button variant="default" size="sm" className="psa-wallet-deposit"><Icon name="plus" size={15} />Get points</Button>
    </div>
  )
}

function AccountMenu({ me, soundOn, onToggleSound, area, onEnterConsole, onSignOut }) {
  const tierColor = (window.PSA_DATA.VIP_TIERS.find((t) => t.name === me.vip) || {}).color || 'var(--gold)'
  return (
    <Dropdown align="end" width={236} trigger={
      <button className="psa-acct">
        <Avatar name={me.name} />
        <span className="psa-acct-id">
          <span className="psa-acct-name">{me.name}</span>
          <span className="psa-acct-role">{me.role}</span>
        </span>
        <Icon name="chevron-down" size={15} />
      </button>
    }>
      <div className="psa-acct-vip">
        <Icon name="crown" size={16} style={{ color: tierColor }} />
        <span style={{ fontWeight: 700 }}>{me.vip} tier</span>
        <span className="right num" style={{ marginLeft: 'auto', color: 'var(--muted-foreground)' }}>VIP</span>
      </div>
      <MenuSep />
      <button className="menu-item" onClick={onToggleSound} onMouseDown={(e) => e.preventDefault()}>
        <Icon name={soundOn ? 'volume-2' : 'volume-x'} size={16} />
        <span>Sound</span>
        <span className="right">{soundOn ? 'On' : 'Off'}</span>
      </button>
      <MenuItem icon="user">Profile & limits</MenuItem>
      {area !== 'console' && <MenuItem icon="dashboard" onClick={onEnterConsole}>Management console</MenuItem>}
      <MenuSep />
      <MenuItem icon="log-out" onClick={onSignOut}>Sign out</MenuItem>
    </Dropdown>
  )
}

function Shell({ area, active, title, search, onSearch, onNavigate, onEnterConsole, onExitConsole, wallet, me, soundOn, onToggleSound, onSignOut, children }) {
  const [mobileOpen, setMobileOpen] = useStateShell(false)
  const isConsole = area === 'console'
  const nav = isConsole ? CONSOLE_NAV : PLAYER_NAV
  return (
    <div className={cx('psa-shell', mobileOpen && 'is-mobile-open')}>
      <aside className="psa-sidebar">
        <Brand onClick={() => onNavigate(isConsole ? 'dashboard' : 'casino')} />
        {isConsole && (
          <button className="psa-back" onClick={onExitConsole}><Icon name="arrow-left" size={16} />Back to app</button>
        )}
        <SideNav nav={nav} active={active} onNavigate={(k) => { onNavigate(k); setMobileOpen(false) }} />
        {!isConsole && (
          <button className="psa-console-cta" onClick={onEnterConsole}>
            <Icon name="dashboard" size={18} />
            <span>Management console</span>
            <Icon name="chevron-right" size={15} style={{ marginLeft: 'auto' }} />
          </button>
        )}
        <div className="psa-side-foot">
          <Badge variant="outline"><Icon name="shield-check" size={12} />Provably fair</Badge>
        </div>
      </aside>
      <div className="psa-scrim" onClick={() => setMobileOpen(false)} />

      <div className="psa-main">
        <header className="psa-topbar">
          <button className="btn btn-ghost btn-icon psa-burger" onClick={() => setMobileOpen(true)}><Icon name="menu" size={20} /></button>
          <div className="psa-topbar-title">
            <span className="eyebrow">{isConsole ? 'Operator' : 'Player'}</span>
            <h1 className="h-cond psa-page-title">{title}</h1>
          </div>
          {search != null && (
            <div className="psa-topbar-search">
              <SearchInput placeholder="Search games…" value={search} onChange={(e) => onSearch(e.target.value)} />
            </div>
          )}
          <div className="psa-topbar-right">
            <Wallet wallet={wallet} />
            <AccountMenu me={me} soundOn={soundOn} onToggleSound={onToggleSound} area={area} onEnterConsole={onEnterConsole} onSignOut={onSignOut} />
          </div>
        </header>

        <main className="psa-content scroll-y">
          {children}
          <footer className="psa-footer">Play money — points for fun, no buy-in, no cash-out. PlayStadium.io</footer>
        </main>
      </div>
    </div>
  )
}

window.Shell = Shell
