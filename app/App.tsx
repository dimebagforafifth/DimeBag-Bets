import {
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
} from 'react'
import { availableToWager, grant, type Account } from '../core/index.js'
import { GAMES, findGame, type GameDef, type GameProps } from './games.js'
import { Sportsbook } from '../sportsbook/ui/Sportsbook.js'
import { createMockFeed, createStore, type SportsbookStore } from '../sportsbook/index.js'
import { formatMoney } from '../games/shared/money.js'
import { SoundToggle } from '../sound/index.js'
import { Console } from '../console/shell/index.js'
// LOCAL PREVIEW SHIM (uncommitted): merge the money-desk lane's manifests into the
// registry so the four new tiles render. The committed coexist plan leaves these to
// the registry owner (console/registry/index.ts) — this does NOT edit that file.
import { REGISTRY } from '../console/registry/index.js'
import { weeklySheetManifests } from '../features/figures/manifest.js'
import { cashierDeskManifests } from '../features/cashier/manifest.js'
import { ledgerManifests } from '../features/transactions/manifest.js'
import { settlementRunManifests } from '../features/settlements/manifest.js'
import { operatorManualManifests } from '../features/help/manifest.js'
import { agentsManifests } from '../features/agents/manifest.js'
const PREVIEW_REGISTRY = [
  ...REGISTRY,
  ...weeklySheetManifests,
  ...cashierDeskManifests,
  ...ledgerManifests,
  ...settlementRunManifests,
  ...operatorManualManifests,
  ...agentsManifests,
]
import { consoleFigures } from './console-figures.js'
import { getAnalyticsRecords } from '../manager/reporting/index.js'
import type { Member, Role } from '../org/index.js'
import {
  getBook,
  getBookVersion,
  subscribeBook,
  getCurrentPlayer,
  getCurrentPlayerId,
  setCurrentPlayer,
  listPlayers,
  mutateBook,
} from './book-store.js'
import { Ledger } from './Ledger.js'
import { MyBets } from './MyBets.js'
import { setActiveGame } from './ledger-store.js'
import { ResponsiblePlayGate } from './ResponsiblePlayGate.js'
import { ResponsiblePlayPanel } from './ResponsiblePlayPanel.js'
import './book-ledger.js' // side-effect: the durable, persisted transaction record subscribes to core
import './exposure.js' // side-effect: the live per-game open-exposure tracker subscribes to core
import { Leaderboard, VipBadge } from '../vip/ui/index.js'
import { subscribeEdge, getEdgeVersion, getRtp, hasOverride } from './edge-store.js'
import { isGameEnabled, subscribeSettings, getSettingsVersion } from './settings-store.js'
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
  { key: 'mybets', label: 'My Bets' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'management', label: 'Management' },
]

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
  // A second, immediate re-render channel for mid-play moves that DON'T resolve a
  // wager (placing a bet holds `pending`) — games call this so the header updates.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  // Which top-level section is showing; within Casino, which game (null = lobby).
  const [section, setSection] = useState<Section>('casino')
  const [route, setRoute] = useState<string | null>(null)

  // The book + who we're playing as. Play (casino + sportsbook) wagers against
  // THIS player's core Account, so wins/losses move their figure and roll up the
  // tree (Agent → Sub-Agent → Manager). Null only if the book has no players.
  const book = getBook()
  const { user, signOut } = useAuth()
  // Who's signed in → their book member → role → which sections they may reach. App
  // already subscribes to the book, so this re-resolves live if the member changes.
  const authMember = memberForUser(user?.id)
  const role = authMember?.role ?? 'player'
  const visibleSections = allowedSections(role)
  // If the selected section isn't allowed for this role, fall back to the role's
  // default — so a stale/forced section can never render forbidden content.
  const activeSection = visibleSections.includes(section) ? section : defaultSection(role)
  // Audit/adjust entries carry the REAL signed-in identity, not a hardcoded 'operator'.
  const actor = user?.displayName ?? 'operator'

  const player = getCurrentPlayer() // an ACTIVE player, or null
  const account = player?.account ?? null
  const game = activeSection === 'casino' ? findGame(route) : null
  // A disabled game can't be played: it drops back to the lobby (which also hides it),
  // so it can't be reached even via a stale route. The enable/disable model lives in
  // app/settings-store; the lobby + this guard are the enforcement.
  const liveGame = game && isGameEnabled(game.key) ? game : null
  // Only active players can be played as; if there ARE players but none active,
  // the book is "all suspended" rather than empty.
  const activePlayers = listPlayers().filter((p) => p.active)
  const allSuspended = !player && listPlayers().length > 0

  // The active player's sportsbook store (its own live feed), created lazily when
  // the sportsbook is opened, settling bets against THAT player's figure.
  const storesRef = useRef<Map<string, SportsbookStore>>(new Map())
  function sbStoreFor(p: Member): SportsbookStore {
    let store = storesRef.current.get(p.id)
    if (!store) {
      store = createStore(p.account, { feed: createMockFeed(), onBalanceChange: refresh })
      storesRef.current.set(p.id, store)
    }
    return store
  }
  // Only the ACTIVE player's feed should run. Each store owns a 5s feed timer, so
  // when you switch who you're playing as, tear down every other player's store —
  // otherwise their timers accumulate (settling off-screen) until App unmounts.
  useEffect(() => {
    const id = player?.id
    for (const [pid, s] of storesRef.current) {
      if (pid !== id) {
        s.destroy()
        storesRef.current.delete(pid)
      }
    }
  }, [player?.id])
  // Tear down everything on unmount.
  useEffect(() => {
    const stores = storesRef.current
    return () => {
      for (const s of stores.values()) s.destroy()
      stores.clear()
    }
  }, [])

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="brand" onClick={openHome}>
            DimeBag<span className="brand-dot">·</span>Bets
          </button>
          <nav className="nav">
            {NAV.filter((t) => visibleSections.includes(t.key)).map((t) => (
              <button
                key={t.key}
                className={`nav-tab ${activeSection === t.key ? 'is-on' : ''}`}
                onClick={() => (t.key === 'casino' ? openCasino() : setSection(t.key))}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="header-right">
          {/* The "playing as" switcher is an operator-only tool — a player IS their
              own node, so they don't get it. */}
          {player && role === 'manager' && (
            <PlayerSwitcher current={player} players={activePlayers} onSwitch={setCurrentPlayer} />
          )}
          <div className="figure">
            {/* Lead with what a player actually reads as "how much I have" — the
                amount they can bet right now (availableToWager = credit + figure −
                at-risk). The week's win/loss standing rides alongside as a plain
                up/down, not signed jargon. */}
            <div className="figure-block is-primary">
              <span className="figure-label">Balance</span>
              <span className="figure-value">
                {account ? formatMoney(availableToWager(account)) : '—'}
              </span>
            </div>
            <div className="figure-block">
              <span className="figure-label">This week</span>
              {account ? (
                <WeekFigure cents={account.balance} />
              ) : (
                <span className="figure-value">—</span>
              )}
            </div>
          </div>
          {player && account && (
            <VipBadge
              playerId={player.id}
              playerName={player.name}
              onRedeem={(cents) =>
                // Credit free play through core's sanctioned grant() — NOT a raw
                // balance poke — so it's validated and fires a GrantEvent the
                // operator's bonus analytics record (manager/reporting).
                cents > 0 && mutateBook(() => grant(account, cents, { promo: 'vip-freeplay' }))
              }
            />
          )}
          <SoundToggle />
          {/* In Management the Console's own TopBar owns operator identity + sign-out,
              so we drop the app header's AuthMenu there to avoid a duplicate control. */}
          {activeSection !== 'management' && (
            <AuthMenu name={user?.displayName ?? 'Guest'} role={role} onSignOut={signOut} />
          )}
        </div>
      </header>

      <main className={`app-main${activeSection === 'management' ? ' is-console' : ''}`}>
        {activeSection === 'management' && canManage(role) ? (
          (() => {
            const fig = consoleFigures(
              book,
              getAnalyticsRecords(),
              Date.now(),
              activePlayers.length,
            )
            return (
              <Console
                registry={PREVIEW_REGISTRY}
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
        ) : activeSection === 'leaderboard' ? (
          <Leaderboard
            players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
            currentPlayerId={getCurrentPlayerId()}
          />
        ) : activeSection === 'sportsbook' ? (
          account && player ? (
            <ResponsiblePlayGate playerId={account.id}>
              <Sportsbook account={account} store={sbStoreFor(player)} />
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
                <Ledger gameKey={liveGame.key} gameName={liveGame.name} accountId={account.id} />
              </div>
            ) : (
              <Lobby onPlay={setRoute} playerId={account.id} />
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        Points only — no real-money value, no buy-in, no cash-out.
      </footer>
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

/** Header control to choose which player in the book you're playing as. Lists
 *  only ACTIVE players (a suspended player can't take action). Every casino +
 *  sportsbook bet routes to this player's figure. */
function PlayerSwitcher({
  current,
  players,
  onSwitch,
}: {
  current: Member
  players: Member[]
  onSwitch: (id: string) => void
}) {
  return (
    <label className="player-switch" title="Who you're playing as — bets move this player's figure">
      <span className="player-switch-label">Playing as</span>
      <select
        className="player-switch-select"
        value={current.id}
        onChange={(e) => onSwitch(e.target.value)}
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The player's running win/loss for the week (core `balance`, the "figure")
 *  shown plainly under the headline Balance: ▲ up (the book owes you), ▼ down
 *  (you owe the book), or even. formatMoney already signs negatives, so we feed
 *  it the absolute value and carry the direction in the arrow + colour. */
function WeekFigure({ cents }: { cents: number }) {
  const tone = cents > 0 ? 'is-up' : cents < 0 ? 'is-down' : 'is-even'
  const arrow = cents > 0 ? '▲ ' : cents < 0 ? '▼ ' : ''
  return (
    <span className={`figure-value ${tone}`}>
      {cents === 0 ? 'Even' : `${arrow}${formatMoney(Math.abs(cents))}`}
    </span>
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

/** The signed-in identity + a sign-out — the real session, replacing the app's old
 *  implicit "operator". */
function AuthMenu({
  name,
  role,
  onSignOut,
}: {
  name: string
  role: Role
  onSignOut: () => void | Promise<void>
}) {
  return (
    <div className="auth-menu">
      <span className="auth-id">
        <span className="auth-id-name">{name}</span>
        <span className="auth-id-role">{role}</span>
      </span>
      <button className="auth-signout" onClick={() => void onSignOut()} title="Sign out">
        Sign out
      </button>
    </div>
  )
}

/**
 * Short descriptions modelled on how Stake describes each game on its own game
 * page. Only games Stake actually carries get one; anything else (e.g. Chicken
 * Road, which isn't a Stake Original) is intentionally omitted, so its card just
 * shows the art + name.
 */
const STAKE_DESC: Record<string, string> = {
  mines:
    'A fresh take on Minesweeper — uncover gems for a rising multiplier while dodging the hidden mines.',
  crash: 'Watch the multiplier climb and cash out before the rocket crashes.',
  dice: 'Roll over or under your number — slide to set your own odds and payout.',
  limbo: 'Pick a target multiplier and watch your bet climb — clear it to win, from 1.01× upward.',
  keno: 'Choose your numbers and watch the draw — the more you match, the more you win.',
  plinko: 'Drop a ball down the pin pyramid and ride it to a multiplier — the edges pay biggest.',
  wheel: 'Spin the wheel and land a multiplier — set your risk and the number of segments.',
  hilo: 'Call the next card higher or lower and ride the streak as your multiplier grows.',
  'dragon-tower': 'Climb the tower row by row, picking eggs and dodging the hidden skulls.',
  pump: 'Inflate the balloon for a bigger multiplier — bank it before it pops.',
  blackjack: 'Beat the dealer to 21 without going over.',
  roulette: 'Place your chips on the single-zero European wheel and watch the ball land.',
}

/** The Casino hub: every registered game as a card. One tap opens its page. */
function Lobby({ onPlay, playerId }: { onPlay: (key: string) => void; playerId: string }) {
  return (
    <div className="lobby">
      <div className="lobby-head">
        <h1 className="lobby-title">Casino</h1>
      </div>
      <div className="lobby-grid">
        {GAMES.filter((g) => isGameEnabled(g.key)).map((g) => (
          <button
            key={g.key}
            className="game-card"
            style={{ '--accent': g.accent } as CSSProperties}
            onClick={() => onPlay(g.key)}
          >
            <span className="card-art">
              <GameIcon kind={g.key} />
            </span>
            <span className="card-body">
              <span className="card-name">{g.name}</span>
              {STAKE_DESC[g.key] && <span className="card-tag">{STAKE_DESC[g.key]}</span>}
              <span className="card-play">Play →</span>
            </span>
          </button>
        ))}
      </div>
      <ResponsiblePlayPanel playerId={playerId} />
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
