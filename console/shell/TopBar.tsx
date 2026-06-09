/**
 * The console top bar: home · brand · search · username · sign-out. Fully prop-
 * driven — no hardcoded brand, username, or numbers anywhere. On mobile the search
 * drops to its own full-width row beneath the bar.
 */

import { HomeIcon, SearchIcon, SignOutIcon } from './icons.js'

export interface TopBarProps {
  /** Brand/wordmark shown at the left. */
  brand?: string
  /** Signed-in operator's name. */
  username?: string
  /** Controlled search value + handler (optional). */
  search?: string
  onSearch?: (value: string) => void
  /** Return to the app grid. */
  onHome?: () => void
  onSignOut?: () => void
}

export function TopBar({
  brand = 'Console',
  username = 'Operator',
  search,
  onSearch,
  onHome,
  onSignOut,
}: TopBarProps) {
  return (
    <header className="c-topbar">
      <div className="c-topbar-left">
        <button className="c-iconbtn" onClick={onHome} aria-label="All apps" title="All apps">
          <HomeIcon />
        </button>
        <span className="c-brand">{brand}</span>
      </div>

      <label className="c-search">
        <SearchIcon size={16} />
        <input
          type="search"
          className="c-search-input"
          placeholder="Search apps…"
          value={search ?? ''}
          onChange={(e) => onSearch?.(e.target.value)}
          aria-label="Search apps"
        />
      </label>

      <div className="c-topbar-right">
        <span className="c-user" title={username}>
          {username}
        </span>
        <button className="c-iconbtn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <SignOutIcon />
        </button>
      </div>
    </header>
  )
}
