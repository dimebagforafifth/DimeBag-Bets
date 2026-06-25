/* global React */
// Stadium app header: wordmark (Slight Chance), section nav, search, and the
// live WalletPill from the design system.
const { WalletPill } = window.PlayStadiumDesignSystem_e4e367

function StadiumHeader({ section, onSection, balance, weekCents }) {
  const tabs = ['Lobby', 'Originals', 'Live', 'Races']
  return (
    <header className="sl-header">
      <div className="sl-header__inner">
        <div className="sl-brand">
          <img className="sl-brand__mark" src="../../assets/logo/playstadium-chip-logo.png" alt="PlayStadium.io" />
          <span className="sl-brand__name">PlayStadium</span>
        </div>
        <nav className="sl-nav">
          {tabs.map((t) => (
            <button
              key={t}
              className={'sl-nav__tab' + (section === t ? ' is-active' : '')}
              onClick={() => onSection(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="sl-header__right">
          <label className="sl-search">
            <span className="sl-search__icon" aria-hidden="true">⌕</span>
            <input placeholder="Search 21 originals" />
          </label>
          <WalletPill balance={balance} weekCents={weekCents} />
        </div>
      </div>
    </header>
  )
}

window.StadiumHeader = StadiumHeader
