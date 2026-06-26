import {
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react'
import { availableToWager, type Account } from '../core/index.js'
import {
  GAMES,
  GAME_CATEGORIES,
  findGame,
  type GameCategory,
  type GameDef,
  type GameProps,
} from './games.js'
// The sportsbook section renders the SGO contract-native book (app/book): it consumes
// the odds CONTRACT via the cache hook (mock until connectOddsCache flips it to the live
// Supabase cache) and places through `core`. The legacy `sportsbook/` module stays in the
// tree (its own tests pass) for futures/trading/cash-out to be harvested later.
import { BookView, connectOddsCache } from './book/index.js'
import { RewardsSection } from '../rewards/index.js'
import './rewards-accrual.js' // side effect: accrue rewards from real wagers
import { formatMoney } from '../games/shared/money.js'
import { WalletPill, Wordmark, ChipLogo, GameCard, BrandBadge } from '../components/brand/index.js'
import { Button } from '../components/ui/button.js'
import { useSoundEnabled, toggleSound } from '../sound/index.js'
import {
  Menu as DropMenu,
  MenuItem as DropItem,
  MenuButton as DropButton,
  MenuDivider as DropDivider,
  MenuHeader as DropHeader,
  type ClickEvent,
} from '@szhsin/react-menu'
import '@szhsin/react-menu/dist/core.css'
import {
  ChevronDown,
  Volume2,
  VolumeX,
  LogOut,
  Menu as HamburgerIcon,
  Search as SearchIcon,
  ShieldCheck,
  Play as PlayIcon,
  Dice5,
  Target,
  ListChecks,
  Layers,
  Trophy,
  Medal,
  Swords,
  Sparkles,
  MessagesSquare,
  Users,
  UserPlus,
  Receipt,
  Gift,
  Zap,
  Split as SplitIcon,
  User as UserIcon,
  SlidersHorizontal,
  LayoutDashboard,
  Circle,
  type LucideIcon,
} from 'lucide-react'
import './menu.css'
import { Console } from '../console/shell/index.js'
// The money-desk lane + member list are now first-class entries in REGISTRY itself
// (console/registry/index.ts), so the console mounts the whole feature set directly.
import { REGISTRY } from '../console/registry/index.js'
import { consoleFigures } from './console-figures.js'
import { registryForRole } from './console-access.js'
import { setViewer } from './viewer.js'
import { subscribeAgentPermissions, getAgentPermissionsVersion } from './agent-permissions.js'
import { getAnalyticsRecords } from '../manager/reporting/index.js'
import { rosterOf, type Role } from '../org/index.js'
import {
  getBook,
  getBookVersion,
  subscribeBook,
  getCurrentPlayer,
  getCurrentPlayerId,
  setCurrentPlayer,
  listPlayers,
} from './book-store.js'
import { Ledger } from './Ledger.js'
import { MyBets } from './MyBets.js'
import { GetPointsButton } from './points-requests/GetPointsButton.js'
import { AnnouncementsBanner } from './notifications/AnnouncementsBanner.js'
import { MessagesBell } from './notifications/MessagesBell.js'
import { useEconomyMode } from './economy-mode.js'
import { ActivityTicker } from './ActivityTicker.js'
import { setActiveGame } from './ledger-store.js'
import { ResponsiblePlayGate } from './ResponsiblePlayGate.js'
import './book-ledger.js' // side-effect: the durable, persisted transaction record subscribes to core
import './exposure.js' // side-effect: the live per-game open-exposure tracker subscribes to core
import { Leaderboard, VipBadge } from '../vip/ui/index.js'
// Player sections. The registry (app/player-sections) is the SINGLE render path: it drives the
// nav tabs, role-gating, AND the active body — `renderPlayerSection` injects the shell context
// (active player + account / viewer identity / demo flag / balance-refresh) into each section's
// typed `render`, so the shell no longer special-cases Community / Pick'em / Profile here.
// register-player-sections wires community + pickem and pulls in records (self-registers 'profile').
import './register-player-sections.js'
import {
  playerSectionFor,
  playerSectionsFor,
  renderPlayerSection,
  type PlayerSectionContext,
} from './player-sections.js'
import { subscribeEdge, getEdgeVersion, getRtp, hasOverride } from './edge-store.js'
import { isGameEnabled, subscribeSettings, getSettingsVersion } from './settings-store.js'
import {
  getFavourites,
  subscribeOnboarding,
  getOnboardingVersion,
} from './onboarding/onboarding-store.js'
import { houseConfigFor, nativeRtp } from './edge-config.js'
import {
  useAuth,
  memberForUser,
  allowedSections,
  canManage,
  defaultSection,
  type Section,
} from '../auth/index.js'
import '../auth/auth.css' // header identity menu styles (also used by the Login screen)

// The top-level sections (the `Section` type) and the role→section access rules live
// in auth/roles — one source of truth for both the visible nav and the render guard.
const NAV: { key: Section; label: string }[] = [
  { key: 'casino', label: 'Casino' },
  { key: 'sportsbook', label: 'Sportsbook' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'mybets', label: 'My Bets' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'management', label: 'Management' },
]

// The sidebar groups every reachable section under a labelled heading + a lucide icon —
// nothing is buried behind a "More" dropdown (the old top-nav model). This is a PRESENTATION
// map only: which group + glyph a section gets. The set of items still comes from `navTabs`
// (NAV + the player-section registry, intersected with allowedSections), so visibility +
// role-gating never drift. A section with no entry here falls into "More" (never dropped).
const GROUP_ORDER = ['Play', 'Compete', 'Social', 'You', 'Operate'] as const
const SECTION_META: Record<string, { group: string; Icon: LucideIcon }> = {
  casino: { group: 'Play', Icon: Dice5 },
  sportsbook: { group: 'Play', Icon: Target },
  pickem: { group: 'Compete', Icon: ListChecks },
  pools: { group: 'Compete', Icon: Layers },
  competitions: { group: 'Compete', Icon: Trophy },
  challenges: { group: 'Compete', Icon: Swords },
  gamification: { group: 'Compete', Icon: Sparkles },
  community: { group: 'Social', Icon: MessagesSquare },
  players: { group: 'Social', Icon: Users },
  referrals: { group: 'Social', Icon: UserPlus },
  mybets: { group: 'You', Icon: Receipt },
  rewards: { group: 'You', Icon: Gift },
  boosts: { group: 'You', Icon: Zap },
  splits: { group: 'You', Icon: SplitIcon },
  leaderboard: { group: 'You', Icon: Medal },
  profile: { group: 'You', Icon: UserIcon },
  limits: { group: 'You', Icon: SlidersHorizontal },
  management: { group: 'Operate', Icon: LayoutDashboard },
}

/**
 * The app shell (CLAUDE.md §5). It owns the one shared account — the single
 * balance every game reads/writes via `core` (§3) — and routes between the
 * Casino lobby and an individual game page. Games are fully separate (each in
 * its own module, mounted one at a time); the only thing they share is the
 * balance. At roll-up this is where auth and the wider casino/sportsbook nav
 * hang off the same account.
 */
export function App() {
  // Re-render whenever the shared book changes — a figure moved (play), a member
  // was edited (Management), or the active player switched. The org is mutated in
  // place, so we subscribe to a version counter, not the object identity.
  useSyncExternalStore(subscribeBook, getBookVersion)
  // Re-render when a manager changes a game's house edge, so the live game picks
  // up the new RTP (fed into its payout math via GameMount below).
  useSyncExternalStore(subscribeEdge, getEdgeVersion)
  // Re-render when a manager enables/disables a game, so the lobby + the active game
  // view reflect it immediately.
  useSyncExternalStore(subscribeSettings, getSettingsVersion)
  // The economy mode relabels the header wallet (balance mode has no weekly figure/credit).
  const economyMode = useEconomyMode()
  // A second, immediate re-render channel for mid-play moves that DON'T resolve a
  // wager (placing a bet holds `pending`) — games call this so the header updates.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  // Which top-level section is showing; within Casino, which game (null = lobby).
  const [section, setSection] = useState<Section>('casino')
  const [route, setRoute] = useState<string | null>(null)
  // The topbar "Search games…" box, lifted here so it can both drive the topbar input and
  // filter the lobby grid (it only shows on the casino lobby).
  const [search, setSearch] = useState('')
  // Mobile: the sidebar collapses to an off-canvas drawer; the topbar burger opens it and
  // the scrim closes it.
  const [mobileOpen, setMobileOpen] = useState(false)

  // The book + who we're playing as. Play (casino + sportsbook) wagers against
  // THIS player's core Account, so wins/losses move their figure and roll up the
  // tree (Agent → Sub-Agent → Manager). Null only if the book has no players.
  const book = getBook()
  const { user, signOut, isDemo } = useAuth()
  // Re-render when the player's onboarding favourites change, so the lobby re-orders
  // live; the picks the player made at onboarding surface first in the Arcade grid.
  const onboardingVersion = useSyncExternalStore(subscribeOnboarding, getOnboardingVersion)
  const lobbyFavourites = useMemo(
    () => new Set(getFavourites(user?.id)),
    [user?.id, onboardingVersion],
  )
  // Who's signed in → their book member → role → which sections they may reach. App
  // already subscribes to the book, so this re-resolves live if the member changes.
  const authMember = memberForUser(user?.id)
  const role = authMember?.role ?? 'player'
  const visibleSections = allowedSections(role)
  // If the selected section isn't allowed for this role, fall back to the role's
  // default — so a stale/forced section can never render forbidden content.
  const activeSection = visibleSections.includes(section) ? section : defaultSection(role)
  // A registry-driven player section (Profile / Community / Pick'em / …) for the active key,
  // role-gated and intersected with allowedSections so nav + render share one source of truth.
  // The hardcoded sections above (sportsbook, rewards, …) take precedence by key.
  const registrySection = playerSectionFor(role, activeSection)
  const activeRegistrySection =
    registrySection && visibleSections.includes(activeSection) ? registrySection : undefined
  // Audit/adjust entries carry the REAL signed-in identity, not a hardcoded 'operator'.
  const actor = user?.displayName ?? 'operator'

  // Role-based access. Tell the scope kit WHO is operating (so an agent's data is clamped
  // to their downline), and hand the console only the tiles this role may see: a manager
  // gets everything, an agent only the tiles the manager granted them.
  useEffect(() => {
    setViewer(authMember?.id ?? 'mgr', role)
  }, [authMember?.id, role])
  const permsVersion = useSyncExternalStore(subscribeAgentPermissions, getAgentPermissionsVersion)
  const consoleRegistry = useMemo(
    () => registryForRole(REGISTRY, role, authMember?.id ?? null),
    [role, authMember?.id, permsVersion],
  )

  const player = getCurrentPlayer() // an ACTIVE player, or null
  const account = player?.account ?? null
  // The shell state injected into a registry player section's `render` — null when there's no
  // active player to build it from (the section then shows the NoPlayer fallback).
  const sectionCtx: PlayerSectionContext | null =
    account && player
      ? {
          account,
          player: { id: player.id, name: player.name },
          viewerId: authMember?.id ?? player.id,
          role,
          isDemo,
          onBalanceChange: refresh,
        }
      : null
  const game = activeSection === 'casino' ? findGame(route) : null
  // A disabled game can't be played: it drops back to the lobby (which also hides it),
  // so it can't be reached even via a stale route. The enable/disable model lives in
  // app/settings-store; the lobby + this guard are the enforcement.
  const liveGame = game && isGameEnabled(game.key) ? game : null
  // Only active players can be played as; if there ARE players but none active,
  // the book is "all suspended" rather than empty.
  const activePlayers = listPlayers().filter((p) => p.active)
  const allSuspended = !player && listPlayers().length > 0

  // Flip the book's odds source to the live Supabase cache the feed-lane poller fills.
  // A no-op with no Supabase keys (the built-in mock stays), so this is safe to always
  // run; the disposer stops the refresh loop on unmount.
  useEffect(() => connectOddsCache(), [])

  // Esc closes the mobile nav drawer (restores the dismiss-without-navigating behaviour the
  // old @szhsin dropdown gave for free; the scrim only handles pointer dismiss).
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Tag new ledger entries with whatever's on screen, so each logged bet shows
  // which game (or the sportsbook) it came from.
  useEffect(() => {
    if (activeSection === 'sportsbook') setActiveGame('sportsbook', 'Sportsbook')
    else if (liveGame) setActiveGame(liveGame.key, liveGame.name)
    else setActiveGame('casino', 'Casino')
  }, [activeSection, liveGame])

  // Opening a game (or switching section) jumps back to the top, so the game lands
  // centred and in view — you can start playing from that section without scrolling
  // up from wherever the lobby grid was.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [activeSection, liveGame?.key])

  // A signed-in PLAYER plays as themselves: pin the current player to their own node
  // (and they get no player-switcher). Operators/agents keep the switcher for play-as.
  useEffect(() => {
    if (role === 'player' && authMember?.active && getCurrentPlayerId() !== authMember.id) {
      setCurrentPlayer(authMember.id)
    }
  }, [role, authMember?.id, authMember?.active])

  /** The Casino tab returns to the casino lobby. */
  function openCasino() {
    setSection('casino')
    setRoute(null)
  }

  /** The brand returns to this role's home section (Casino for players/operators, the
   *  console for agents). */
  function openHome() {
    setSection(defaultSection(role))
    setRoute(null)
  }

  // One ordered, role-gated tab list feeding both the inline nav and the dropdowns:
  // the hardcoded sections (NAV) first, then the registry-driven player sections, each
  // carrying its own activator so the header stays declarative.
  const navTabs: { key: string; label: string; onClick: () => void }[] = [
    ...NAV.filter((t) => visibleSections.includes(t.key)).map((t) => ({
      key: t.key as string,
      label: t.label,
      onClick: () => (t.key === 'casino' ? openCasino() : setSection(t.key)),
    })),
    ...playerSectionsFor(role)
      .filter((m) => visibleSections.includes(m.key as Section))
      .map((m) => ({
        key: m.key,
        label: m.label,
        onClick: () => setSection(m.key as Section),
      })),
  ]
  const currentLabel = navTabs.find((t) => t.key === activeSection)?.label ?? ''

  // Bucket the role-gated tabs into the sidebar's labelled groups. PRESENTATION ONLY: the
  // items still come from `navTabs` (NAV + the registry, intersected with allowedSections),
  // so what's visible can't drift from what's reachable. A tab with no SECTION_META entry
  // lands in a trailing "More" group, so a newly-registered section is surfaced rather than
  // silently dropped — nothing is ever buried (the old "More" dropdown is gone on desktop).
  // Management is pulled OUT of the grouped nav and pinned at the bottom as a distinct
  // console-entry CTA (operator gateway), so it never reads as just another player tab.
  const managementTab = navTabs.find((t) => t.key === 'management')
  const sideGroups = (() => {
    const byGroup = new Map<string, typeof navTabs>()
    for (const t of navTabs) {
      if (t.key === 'management') continue // pinned separately below the nav
      const group = SECTION_META[t.key]?.group ?? 'More'
      const list = byGroup.get(group)
      if (list) list.push(t)
      else byGroup.set(group, [t])
    }
    const known = GROUP_ORDER.filter((g) => byGroup.has(g))
    const extra = [...byGroup.keys()].filter((g) => !(GROUP_ORDER as readonly string[]).includes(g))
    return [...known, ...extra].map((group) => ({ group, items: byGroup.get(group)! }))
  })()

  // The operator console brings its OWN chrome (top bar + section grid + back control), so
  // when it's active it replaces the topbar+content area entirely (the sidebar persists, so
  // any other section is one click away — that IS the "back to app" affordance). Built lazily
  // so its figure aggregation only runs when the console is actually shown.
  const isConsole = activeSection === 'management' && canManage(role)
  // The topbar search only makes sense on the casino lobby — it filters the Arcade grid.
  const showSearch = activeSection === 'casino' && !liveGame
  // The page title leads the topbar: a game's name when one is open, else the section label.
  const pageTitle = liveGame ? liveGame.name : currentLabel

  const consoleBody = isConsole
    ? (() => {
        // An agent's figures strip is scoped to their downline (balance = their
        // subtree net; week/today + active count = their roster only).
        const roster =
          (role === 'agent' || role === 'subagent') && authMember
            ? rosterOf(book, authMember.id)
            : null
        const fig = consoleFigures(
          book,
          getAnalyticsRecords(),
          Date.now(),
          roster ? roster.filter((p) => p.active).length : activePlayers.length,
          roster ? { scopeId: authMember!.id, accountIds: new Set(roster.map((p) => p.id)) } : {},
        )
        return (
          <Console
            registry={consoleRegistry}
            brand="DimeBag-Bets"
            username={actor}
            onSignOut={signOut}
            balance={fig.balance}
            week={fig.week}
            weekTrend={fig.weekTrend}
            today={fig.today}
            todayTrend={fig.todayTrend}
            activeAccts={fig.activeAccts}
          />
        )
      })()
    : null

  return (
    <div className={`psa-shell${mobileOpen ? ' is-mobile-open' : ''}`}>
      <aside className="psa-sidebar">
        <button className="psa-brand" onClick={openHome} aria-label="PlayStadium.io — home">
          <ChipLogo size={30} className="psa-brand-mark" aria-hidden="true" />
          <span className="psa-brand-name">
            <Wordmark />
          </span>
        </button>
        {/* The whole reachable section set, in labelled groups — every section is one click
            away (no "More" dropdown). The list is `navTabs`, so it stays role-gated. */}
        <nav className="psa-nav" aria-label="Primary">
          {sideGroups.map(({ group, items }) => (
            <div className="psa-nav-group" key={group}>
              <div className="psa-nav-label">{group}</div>
              {items.map((t) => {
                const Icon = SECTION_META[t.key]?.Icon ?? Circle
                return (
                  <button
                    key={t.key}
                    className={`psa-nav-item${activeSection === t.key ? ' is-active' : ''}`}
                    aria-current={activeSection === t.key ? 'page' : undefined}
                    onClick={() => {
                      t.onClick()
                      setMobileOpen(false)
                    }}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        {/* The operator gateway: pinned below the nav, gold-bordered and visually distinct,
            so Management reads as the console entry rather than one more player tab. Only
            users who can actually manage see it. */}
        {managementTab && canManage(role) && (
          <button
            className={`psa-console-cta${activeSection === 'management' ? ' is-active' : ''}`}
            aria-current={activeSection === 'management' ? 'page' : undefined}
            onClick={() => {
              managementTab.onClick()
              setMobileOpen(false)
            }}
          >
            <LayoutDashboard size={18} strokeWidth={1.9} aria-hidden="true" />
            <span>{managementTab.label}</span>
          </button>
        )}
        <div className="psa-side-foot">
          <span className="sds-badge sds-badge--neutral psa-fair">
            <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
            Provably fair
          </span>
        </div>
      </aside>
      {/* the mobile drawer's tap-to-close backdrop (only painted when is-mobile-open) */}
      <div className="psa-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />

      <div className="psa-main">
        {isConsole ? (
          // The operator console brings its own chrome, but on tablet/phone the sidebar is an
          // off-canvas drawer whose only reveal control lives in the player topbar (not shown
          // here) — so a slim, mobile-only bar carries the burger + wordmark, keeping the
          // "back to the app" path reachable on small screens (it's display:none on desktop).
          <>
            <div className="psa-console-mobilebar">
              <button
                className="psa-burger"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <HamburgerIcon size={20} aria-hidden="true" />
              </button>
              <span className="psa-brand-name">
                <Wordmark />
              </span>
            </div>
            {consoleBody}
          </>
        ) : (
          <>
            <header className="psa-topbar">
              <button
                className="psa-burger"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <HamburgerIcon size={20} aria-hidden="true" />
              </button>
              <div className="psa-topbar-title">
                <span className="psa-topbar-eyebrow">
                  {canManage(role) ? 'Operator' : 'Player'}
                </span>
                <h1 className="psa-page-title">{pageTitle}</h1>
              </div>
              {/* Search only shows on the casino lobby (mirrors the artifact's showSearch);
                  the value is lifted to App and also fed into <Lobby> to filter the grid. */}
              {showSearch && (
                <div className="psa-topbar-search">
                  <SearchIcon size={16} className="psa-search-icon" aria-hidden="true" />
                  <input
                    type="search"
                    className="psa-search-input"
                    placeholder="Search games…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search games"
                  />
                </div>
              )}
              <div className="psa-topbar-right">
                {/* The balance + week standing read as ONE "wallet" unit — the brand
                    WalletPill. Lead with what a player reads as "how much I have": the
                    amount they can bet right now (availableToWager = credit + figure −
                    at-risk). The week's win/loss rides alongside as a plain up/down.
                    formatMoney is threaded through so a book's configured points
                    symbol / decimals / locale still applies. */}
                <WalletPill
                  className="app-figure"
                  label={economyMode === 'balance' ? 'Available' : 'Balance'}
                  balance={account ? formatMoney(availableToWager(account)) : '—'}
                  weekLabel={economyMode === 'balance' ? 'Wallet' : 'This week'}
                  weekCents={account ? account.balance : 0}
                  formatWeek={(cents) => formatMoney(Math.abs(cents))}
                  action={
                    player && account ? (
                      <GetPointsButton playerId={player.id} playerName={player.name} />
                    ) : undefined
                  }
                />
                {/* The player inbox bell — operator DMs + broadcasts reach the player here.
                    Shown whenever a player wallet is active (incl. an operator playing-as a
                    player), so the player-facing header is faithful in the demo too. */}
                {player && account && <MessagesBell playerId={player.id} />}
                {/* One avatar menu holds VIP tier + sound toggle + sign-out (declutters the bar). */}
                <AccountMenu
                  name={user?.displayName ?? 'Guest'}
                  role={role}
                  playerId={player && account ? player.id : null}
                  onSignOut={signOut}
                />
              </div>
            </header>

            <main className="psa-content">
              {/* Operator announcements reach the player here (the manager Communication
                  binding) — book-wide notices show above whatever section is active. */}
              <AnnouncementsBanner />
              {activeSection === 'leaderboard' ? (
                <Leaderboard
                  players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
                  currentPlayerId={getCurrentPlayerId()}
                />
              ) : activeSection === 'rewards' ? (
                account && player ? (
                  <RewardsSection
                    memberId={player.id}
                    playerName={player.name}
                    balanceCents={account.balance}
                    availableCents={availableToWager(account)}
                  />
                ) : (
                  <NoPlayer
                    onManage={() => setSection('management')}
                    allSuspended={allSuspended}
                    canManage={canManage(role)}
                  />
                )
              ) : activeSection === 'sportsbook' ? (
                account && player ? (
                  <ResponsiblePlayGate playerId={account.id}>
                    <BookView
                      account={account}
                      playerName={player.name}
                      role={role}
                      viewerId={authMember?.id ?? player.id}
                      isDemo={isDemo}
                      onBalanceChange={refresh}
                    />
                  </ResponsiblePlayGate>
                ) : (
                  <NoPlayer
                    onManage={() => setSection('management')}
                    allSuspended={allSuspended}
                    canManage={canManage(role)}
                  />
                )
              ) : activeSection === 'mybets' ? (
                account && player ? (
                  <MyBets account={account} player={player} />
                ) : (
                  <NoPlayer
                    onManage={() => setSection('management')}
                    allSuspended={allSuspended}
                    canManage={canManage(role)}
                  />
                )
              ) : activeRegistrySection ? (
                // ONE render path for every registry section. Prop-taking sections (Community,
                // Pick'em, …) get the shell context injected; a section that needs an active player
                // falls back to NoPlayer when there is none. Prop-less self-contained sections
                // (Profile) ignore the context and render regardless (their own empty state).
                renderPlayerSection(
                  activeRegistrySection,
                  sectionCtx,
                  <NoPlayer
                    onManage={() => setSection('management')}
                    allSuspended={allSuspended}
                    canManage={canManage(role)}
                  />,
                )
              ) : (
                <div className="casino-view">
                  {!account ? (
                    <NoPlayer
                      onManage={() => setSection('management')}
                      allSuspended={allSuspended}
                      canManage={canManage(role)}
                    />
                  ) : liveGame ? (
                    <div className="game-page">
                      <button className="crumb" onClick={() => setRoute(null)}>
                        ← Casino
                      </button>
                      {/* Each game's view is a lazy chunk (app/games.ts); show a light
                    placeholder while it loads on first open. The crumb + Ledger
                    stay outside the boundary so leaving is always instant. */}
                      <ResponsiblePlayGate playerId={account.id}>
                        <Suspense fallback={<GameLoading />}>
                          <GameMount game={liveGame} account={account} onBalanceChange={refresh} />
                        </Suspense>
                      </ResponsiblePlayGate>
                      {/* the ledger lives only inside a game — its own per-game history,
                    scoped to the player you're currently playing as. */}
                      <Ledger
                        gameKey={liveGame.key}
                        gameName={liveGame.name}
                        accountId={account.id}
                      />
                    </div>
                  ) : (
                    <Lobby
                      onPlay={setRoute}
                      favourites={lobbyFavourites}
                      search={search}
                      onBrowseAll={() => setSearch('')}
                      onSeeLeaderboard={() => setSection('leaderboard')}
                      playersOnline={activePlayers.length}
                    />
                  )}
                </div>
              )}
              <footer className="psa-footer">
                Play money — points for fun, no buy-in, no cash-out. PlayStadium.io
              </footer>
            </main>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Mounts a game with the manager's house-edge override applied. When a game has
 * an override set, its chosen RTP is converted to that game's REAL houseConfig
 * (app/edge-config.ts) and passed in — so payouts change and still settle through
 * core (§3). With no override, no config is passed and the game uses its native
 * edge (the "keep current edges" ship default). The single contained cast lets us
 * pass a per-game-shaped config through the shared GameProps boundary.
 */
/** Placeholder shown while a game's lazy chunk loads on first open. */
function GameLoading() {
  return (
    <div
      className="game-loading"
      aria-busy="true"
      style={{ padding: '4rem', textAlign: 'center', opacity: 0.55 }}
    >
      Loading…
    </div>
  )
}

function GameMount({
  game,
  account,
  onBalanceChange,
}: {
  game: GameDef
  account: Account
  onBalanceChange: () => void
}) {
  const overridden = !!game.supportsAdjustableEdge && hasOverride(game.key)
  const rtp = overridden ? getRtp(game.key, nativeRtp(game.key)) : null
  // Memoise so the config keeps a STABLE identity across unrelated App re-renders
  // (a bet, a balance move, a player switch). A fresh object each render would
  // thrash each game's paytable useMemo and re-fire config-keyed effects — e.g.
  // Cases resets its reel strip on a houseConfig change, which would wipe a shown
  // result between spins. rtp is a primitive, so the deps compare cleanly.
  const cfg = useMemo(() => (rtp == null ? null : houseConfigFor(game.key, rtp)), [game.key, rtp])
  const Comp = game.Component as ComponentType<GameProps & { houseConfig?: unknown }>
  return (
    <Comp
      account={account}
      onBalanceChange={onBalanceChange}
      {...(cfg ? { houseConfig: cfg } : {})}
    />
  )
}

/** Shown when there's no active player to play as — the book is empty, every player is
 *  suspended, or the signed-in user has no book node yet. The "Open Management" CTA is
 *  only offered to users who can actually manage (not a plain player). */
function NoPlayer({
  onManage,
  allSuspended,
  canManage = true,
}: {
  onManage: () => void
  allSuspended?: boolean
  canManage?: boolean
}) {
  return (
    <div className="no-player">
      <h2 className="no-player-title">
        {allSuspended
          ? 'All players are suspended'
          : canManage
            ? 'No player selected'
            : 'No account yet'}
      </h2>
      <p className="no-player-sub">
        {allSuspended
          ? 'Reactivate a player in Management to start playing again. Every bet moves that player’s figure and rolls up to their agent and the manager.'
          : canManage
            ? 'Add a player to your book, then pick who to play as. Every bet moves that player’s figure and rolls up to their agent and the manager.'
            : 'Your account isn’t set up for play yet — your agent will add you to the book. Every bet then moves your figure.'}
      </p>
      {canManage && (
        <button className="action action-bet no-player-cta" onClick={onManage}>
          Open Management
        </button>
      )}
    </div>
  )
}

/**
 * The single account control on the right of the bar: an avatar + name/role chip that
 * opens ONE dropdown holding everything that used to float loose beside it — the player's
 * VIP tier, the sound toggle, and sign-out. Folding three controls into one menu is the
 * main declutter on the right-hand side (CLAUDE.md §2). `@szhsin/react-menu` gives us the
 * accessible behaviour for free (ARIA roles, arrow-key nav, Esc, focus return, click-out).
 */
function AccountMenu({
  name,
  role,
  playerId,
  onSignOut,
}: {
  name: string
  role: Role
  playerId: string | null
  onSignOut: () => void | Promise<void>
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const soundOn = useSoundEnabled()
  return (
    <DropMenu
      transition
      align="end"
      gap={6}
      menuClassName="drop-menu account-menu"
      menuButton={
        <DropButton className="account-trigger" aria-label="Account menu">
          <span className="auth-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="auth-id">
            <span className="auth-id-name">{name}</span>
            <span className="auth-id-role">{role}</span>
          </span>
          <ChevronDown size={15} className="account-caret" aria-hidden="true" />
        </DropButton>
      }
    >
      {/* The VIP tier ladder rides at the top of the menu as a display-only header. */}
      {playerId && (
        <DropHeader className="account-vip">
          <VipBadge playerId={playerId} />
        </DropHeader>
      )}
      {/* The one mute control — toggles in place (keepOpen) so the menu doesn't close. */}
      <DropItem
        className="drop-item account-row"
        onClick={(e: ClickEvent) => {
          e.keepOpen = true
          toggleSound()
        }}
      >
        {soundOn ? (
          <Volume2 size={16} aria-hidden="true" />
        ) : (
          <VolumeX size={16} aria-hidden="true" />
        )}
        <span className="account-row-label">Sound</span>
        <span className="account-row-state">{soundOn ? 'On' : 'Off'}</span>
      </DropItem>
      <DropDivider />
      <DropItem className="drop-item account-row" onClick={() => void onSignOut()}>
        <LogOut size={16} aria-hidden="true" />
        <span className="account-row-label">Sign out</span>
      </DropItem>
    </DropMenu>
  )
}

/**
 * A one-line description for every game in the registry, shown under the name on
 * its lobby card. The instant games' descriptions are modelled on how Stake describes
 * each game on its own game page; the table/card/slots and house games get an equivalent
 * one-liner. There's an entry per game in GAME_CATALOG (games.ts) — keep them in
 * sync — and the lobby additionally falls back to a game's own `tagline`, so a
 * card can never render without a description even if this map ever drifts.
 * Order mirrors the registry so a missing game is easy to spot.
 */
const GAME_DESC: Record<string, string> = {
  // Instant games
  mines:
    'A fresh take on Minesweeper — uncover gems for a rising multiplier while dodging the hidden mines.',
  crash: 'Watch the multiplier climb and cash out before the rocket crashes.',
  dice: 'Roll over or under your number — slide to set your own odds and payout.',
  limbo: 'Pick a target multiplier and watch your bet climb — clear it to win, from 1.01× upward.',
  keno: 'Choose your numbers and watch the draw — the more you match, the more you win.',
  plinko: 'Drop a ball down the pin pyramid and ride it to a multiplier — the edges pay biggest.',
  wheel: 'Spin the wheel and land a multiplier — set your risk and the number of segments.',
  hilo: 'Call the next card higher or lower and ride the streak as your multiplier grows.',
  chickenroad:
    'Guide the chicken across lane after lane for a rising multiplier — cash out before it gets caught in traffic.',
  'dragon-tower': 'Climb the tower row by row, picking eggs and dodging the hidden skulls.',
  pump: 'Inflate the balloon for a bigger multiplier — bank it before it pops.',
  coinflip: 'Call heads or tails and ride the streak — every correct call grows your multiplier.',
  diamonds:
    'Reveal a hand of gems and get paid for matches — the more of a colour you hit, the bigger the multiplier.',
  cases: 'Open a case and win whatever multiplier it lands on — pick a higher risk for bigger rewards.',
  // Table
  roulette: 'Place your chips on the single-zero European wheel and watch the ball land.',
  sicbo: 'Bet on the roll of three dice — back totals, combos, or exact numbers before they tumble.',
  // Cards
  blackjack: 'Beat the dealer to 21 without going over.',
  baccarat: 'Back the Player or the Banker — whichever hand lands closest to nine takes it.',
  videopoker:
    'Jacks or Better — hold the cards you want, draw the rest, and get paid for the best poker hand.',
  threecardpoker: 'Make the strongest three-card hand and beat the dealer to win.',
  // Slots
  slots: 'Spin the reels and line up matching symbols across the paylines to win.',
}

/** Base-aware URL for a game's 3D icon PNG in /public/game-icons (the real product
 *  asset — never redrawn; the inline GameIcon SVG is only an on-error fallback). */
function gameIconUrl(key: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + '/game-icons/' + key + '.png'
}

/** The lobby grid filter: 'All', the 'Hot' trending pseudo-filter, or one game category. */
type LobbyFilter = 'All' | 'Hot' | GameCategory

/** The Casino hub: a "Stack your week." hero over the Arcade grid. One tap opens a
 *  game's page. `favourites` (from player onboarding) float to the front; the topbar
 *  `search` filters the grid by game name. The hero stats are wired to REAL counts only
 *  (enabled games, active players) — no invented "wagered today" precision. */
function Lobby({
  onPlay,
  favourites,
  search,
  onBrowseAll,
  onSeeLeaderboard,
  playersOnline,
}: {
  onPlay: (key: string) => void
  favourites: Set<string>
  search: string
  onBrowseAll: () => void
  onSeeLeaderboard: () => void
  playersOnline: number
}) {
  const enabled = GAMES.filter((g) => isGameEnabled(g.key))
  // The category / "Hot" filter (segmented control under the hero) composes with the
  // topbar name-search. 'All' shows everything, 'Hot' the trending games, the rest narrow
  // by type. Only categories with at least one enabled game get a pill (no empty buckets).
  const [filter, setFilter] = useState<LobbyFilter>('All')
  const availableCats = GAME_CATEGORIES.filter((c) => enabled.some((g) => g.category === c))
  const hasHot = enabled.some((g) => g.hot)
  // If the active filter's games all got disabled by a manager, fall back to 'All' so the
  // grid never strands the player on an empty filter.
  const activeFilter: LobbyFilter =
    filter === 'Hot'
      ? hasHot
        ? 'Hot'
        : 'All'
      : filter === 'All' || availableCats.includes(filter)
        ? filter
        : 'All'
  const filterPills: { key: LobbyFilter; label: string }[] = [
    { key: 'All', label: 'All' },
    ...(hasHot ? [{ key: 'Hot' as LobbyFilter, label: 'Hot' }] : []),
    ...availableCats.map((c) => ({ key: c as LobbyFilter, label: c })),
  ]
  // The topbar search filters by name; an empty query shows everything (so the default
  // lobby is the full collection).
  const q = search.trim().toLowerCase()
  const byName = q ? enabled.filter((g) => g.name.toLowerCase().includes(q)) : enabled
  const matched = byName.filter((g) =>
    activeFilter === 'All' ? true : activeFilter === 'Hot' ? !!g.hot : g.category === activeFilter,
  )
  // Stable partition: the player's pinned favourites first, everything else after,
  // each keeping the registry's original order.
  const ordered = [
    ...matched.filter((g) => favourites.has(g.key)),
    ...matched.filter((g) => !favourites.has(g.key)),
  ]
  // The hero's primary CTA opens Crash (the headline game) — or the first enabled game if a
  // manager has disabled it; hidden entirely if the whole casino is off.
  const featured = enabled.find((g) => g.key === 'crash') ?? enabled[0]
  return (
    <div className="lobby">
      {/* ---- hero: the post-login landing pitch ---- */}
      <section className="lobby-hero">
        <div className="lobby-hero-copy">
          <div className="lobby-hero-eyebrows">
            <BrandBadge variant="gold">{enabled.length} Games</BrandBadge>
            <BrandBadge variant="neutral">
              <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
              Provably fair
            </BrandBadge>
          </div>
          <h2 className="lobby-hero-title">Stack your week.</h2>
          <p className="lobby-hero-tag">
            One points balance across every game and the book. No buy-in, no cash-out — just the
            action.
          </p>
          <div className="lobby-hero-cta">
            {featured && (
              <Button variant="default" size="lg" onClick={() => onPlay(featured.key)}>
                <PlayIcon size={16} strokeWidth={2} aria-hidden="true" />
                Play {featured.name}
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={onBrowseAll}>
              Browse all
            </Button>
          </div>
          <div className="lobby-hero-stats">
            <div className="lobby-hero-stat">
              <span className="lobby-hero-stat-label">Games</span>
              <span className="lobby-hero-stat-value">{enabled.length}</span>
            </div>
            <span className="lobby-hero-sep" aria-hidden="true" />
            <div className="lobby-hero-stat">
              <span className="lobby-hero-stat-label">Players online</span>
              <span className="lobby-hero-stat-value">{playersOnline}</span>
            </div>
          </div>
        </div>
        <div className="lobby-hero-art" aria-hidden="true">
          <div className="lobby-hero-glow" />
          {featured && (
            <img
              src={gameIconUrl(featured.key)}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
        </div>
      </section>

      {/* the live wins strip — a quiet, read-only feed of recent bets across the
          book; renders nothing until there's activity, so a fresh book stays clean */}
      <ActivityTicker />

      {/* ---- Arcade collection ---- */}
      <div className="lobby-head">
        <span className="lobby-eyebrow">Provably fair</span>
        <div className="lobby-head-row">
          {/* h3: subordinate to the topbar's page <h1> and the hero's <h2> (one h1 per view) */}
          <h3 className="lobby-title">Arcade</h3>
          <span className="lobby-count">{ordered.length}</span>
        </div>
        {/* category / Hot filter — narrows the grid by type; composes with the topbar search */}
        <div className="lobby-filters" role="tablist" aria-label="Filter games">
          {filterPills.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={activeFilter === f.key}
              className={`lobby-filter${activeFilter === f.key ? ' is-active' : ''}${
                f.key === 'Hot' ? ' is-hot' : ''
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {ordered.length > 0 ? (
        <div className="lobby-grid">
          {ordered.map((g) => (
            // The brand GameCard (Claude Design system): the real 3D game-icon PNG over
            // a gold-tinted art zone, with the inline GameIcon SVG kept as a graceful
            // fallback. One graphite-and-gold system — gold is the only accent.
            <GameCard
              key={g.key}
              name={g.name}
              tag={GAME_DESC[g.key] ?? g.tagline}
              icon={gameIconUrl(g.key)}
              iconAlt={g.name}
              hot={g.hot}
              art={<GameIcon kind={g.key} />}
              onClick={() => onPlay(g.key)}
            />
          ))}
        </div>
      ) : (
        <p className="lobby-empty">
          {q ? `No games match “${search}”.` : 'No games in this filter.'}
        </p>
      )}

      {/* ---- promotions: one live card + marketing-art slots (real art TBD) ---- */}
      <div className="lobby-head lobby-head--promo">
        <h3 className="lobby-subtitle">Promotions</h3>
      </div>
      <div className="promo-row">
        <div className="promo-card promo-live">
          <div className="promo-text">
            <BrandBadge variant="gold">Weekly</BrandBadge>
            <h4 className="promo-title">Top the leaderboard</h4>
            <p className="promo-sub">
              The week’s biggest figures top the standings. Rack up the action to climb.
            </p>
            <Button variant="secondary" size="sm" onClick={onSeeLeaderboard}>
              See standings
            </Button>
          </div>
        </div>
        <div className="promo-ph">
          <span className="promo-ph-tag">Promo banner · 720×260</span>
        </div>
        <div className="promo-ph">
          <span className="promo-ph-tag">Promo banner · 720×260</span>
        </div>
      </div>
    </div>
  )
}

/**
 * A distinctive piece of art per game — drawn in the game's accent (currentColor)
 * so each card on the lobby reads as that game at a glance. Cut-out details use
 * --bg so they punch through to a dark "hole" on the tinted tile.
 */
function GameIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'crash':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {/* a rocket climbing, flame + fins */}
          <path
            d="M12 2c2.9 2.1 4.2 5 4.2 8 0 1.7-.4 3.2-1.1 4.5H8.9C8.2 13.2 7.8 11.7 7.8 10c0-3 1.3-5.9 4.2-8z"
            fill="currentColor"
          />
          <circle cx="12" cy="9" r="1.7" fill="var(--bg)" />
          <path d="M8.6 14 6 16.8l2.4.4z" fill="currentColor" opacity="0.6" />
          <path d="M15.4 14 18 16.8l-2.4.4z" fill="currentColor" opacity="0.6" />
          <path d="M10.4 16.2h3.2L12 21z" fill="currentColor" opacity="0.85" />
        </svg>
      )
    case 'dice':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="4.5"
            fill="currentColor"
            opacity="0.16"
          />
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <g fill="currentColor">
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="16" cy="8" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="8" cy="16" r="1.5" />
            <circle cx="16" cy="16" r="1.5" />
          </g>
        </svg>
      )
    case 'limbo':
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* a multiplier spiking to the moon */}
          <polyline points="3,18 8.5,13 12,15.5 19,7" />
          <polyline points="14,7 19,7 19,12" />
        </svg>
      )
    case 'keno':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="2.2" />
            <circle cx="17" cy="7" r="2.2" />
            <circle cx="12" cy="12" r="2.2" />
            <circle cx="7" cy="17" r="2.2" />
            <circle cx="17" cy="17" r="2.2" />
          </g>
          <g fill="currentColor">
            <circle cx="12" cy="7" r="2.7" />
            <circle cx="7" cy="12" r="2.7" />
            <circle cx="17" cy="12" r="2.7" />
            <circle cx="12" cy="17" r="2.7" />
          </g>
        </svg>
      )
    case 'plinko':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="3.6" r="2.1" fill="currentColor" />
          <g fill="currentColor" opacity="0.5">
            <circle cx="12" cy="9" r="1.3" />
            <circle cx="8" cy="13.5" r="1.3" />
            <circle cx="16" cy="13.5" r="1.3" />
            <circle cx="6" cy="18" r="1.3" />
            <circle cx="12" cy="18" r="1.3" />
            <circle cx="18" cy="18" r="1.3" />
          </g>
        </svg>
      )
    case 'wheel':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.2 14.2 5.4H9.8z" fill="currentColor" />
          <circle cx="12" cy="13" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <g stroke="currentColor" strokeWidth="1.3" opacity="0.75">
            <line x1="12" y1="4.8" x2="12" y2="21.2" />
            <line x1="3.8" y1="13" x2="20.2" y2="13" />
            <line x1="6.2" y1="7.2" x2="17.8" y2="18.8" />
            <line x1="17.8" y1="7.2" x2="6.2" y2="18.8" />
          </g>
          <circle cx="12" cy="13" r="1.7" fill="currentColor" />
        </svg>
      )
    case 'hilo':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="3.5" width="14" height="17" rx="2.6" fill="currentColor" opacity="0.16" />
          <rect
            x="5"
            y="3.5"
            width="14"
            height="17"
            rx="2.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M12 6 14.6 9.6H9.4z" fill="currentColor" />
          <path d="M12 18 9.4 14.4h5.2z" fill="currentColor" opacity="0.55" />
        </svg>
      )
    case 'chickenroad':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="10.5" cy="14.5" rx="6" ry="5.4" fill="currentColor" />
          <circle cx="15.8" cy="9" r="3.3" fill="currentColor" />
          <circle cx="14.8" cy="5.4" r="1.1" fill="currentColor" />
          <circle cx="17.1" cy="5.1" r="1.1" fill="currentColor" />
          <path d="M18.8 9 22 9.9 18.8 11z" fill="currentColor" opacity="0.7" />
          <circle cx="16.5" cy="8.6" r="0.7" fill="var(--bg)" />
          <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <line x1="8.5" y1="19.4" x2="8.5" y2="22" />
            <line x1="12.5" y1="19.4" x2="12.5" y2="22" />
          </g>
        </svg>
      )
    case 'dragon-tower':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 1.6c1.7 1.1 2 2.9 1.1 4.4-.3-.7-.8-1-1.4-1.1.4 1.1-.2 2-.9 2.4-.7-1-.7-3.6 1.2-5.7z"
            fill="currentColor"
          />
          <rect x="5" y="16" width="14" height="4" rx="1.2" fill="currentColor" />
          <rect x="6.5" y="11" width="11" height="4" rx="1.2" fill="currentColor" opacity="0.8" />
          <rect x="8" y="6.5" width="8" height="4" rx="1.2" fill="currentColor" opacity="0.6" />
        </svg>
      )
    case 'pump':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.5c4 0 6.5 3 6.5 6.4 0 3.7-3 7-6.5 7s-6.5-3.3-6.5-7C5.5 5.5 8 2.5 12 2.5z"
            fill="currentColor"
          />
          <path d="M11 15.7h2l-.5 2.3h-1z" fill="currentColor" />
          <ellipse cx="9.6" cy="8" rx="1.5" ry="2.2" fill="#fff" opacity="0.32" />
        </svg>
      )
    case 'roulette':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle
            cx="12"
            cy="12"
            r="4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            opacity="0.7"
          />
          <g stroke="currentColor" strokeWidth="1.2" opacity="0.7">
            <line x1="12" y1="3" x2="12" y2="7.2" />
            <line x1="12" y1="16.8" x2="12" y2="21" />
            <line x1="3" y1="12" x2="7.2" y2="12" />
            <line x1="16.8" y1="12" x2="21" y2="12" />
          </g>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="5.2" r="1.4" fill="currentColor" />
        </svg>
      )
    case 'blackjack':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="9.5"
            y="4"
            width="10.5"
            height="14.5"
            rx="2"
            fill="currentColor"
            opacity="0.4"
            transform="rotate(12 14.75 11.25)"
          />
          <rect x="5" y="5.5" width="10.5" height="14.5" rx="2" fill="currentColor" />
          <path
            d="M10.2 9c1.7 1.5 2.7 2.4 2.7 3.5 0 .9-.7 1.5-1.5 1.5-.5 0-.9-.2-1.2-.6-.3.4-.7.6-1.2.6-.8 0-1.5-.6-1.5-1.5 0-1.1 1-2 2.7-3.5z"
            fill="var(--bg)"
          />
          <path d="M9.9 13.6h.6l-.3 1.6z" fill="var(--bg)" />
        </svg>
      )
    default:
      // gem (mines)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5 21.5 9 12 21.5 2.5 9z" fill="currentColor" />
          <path d="M12 2.5 21.5 9 12 11.5 2.5 9z" fill="#fff" opacity="0.28" />
          <path d="M6.6 9h10.8L12 18.6z" fill="currentColor" opacity="0.45" />
        </svg>
      )
  }
}
