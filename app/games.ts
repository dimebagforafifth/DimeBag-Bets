/**
 * The games registry (CLAUDE.md §5) — the single list the casino hub and shell
 * render from. Each game is a self-contained module: it declares its own
 * identity (meta) and ships its own view (Component). They stay unaware of one
 * another and of the shell; the shell only composes them and owns the one
 * shared balance.
 *
 * Adding a game later is ONE entry here — the hub, routing, and shared balance
 * need no other changes. This is what lets a future "Casino" tab list every
 * game without touching any game's code.
 */

import { lazy, type ComponentType } from 'react'
import type { Account } from '../core/index.js'
import { minesMeta } from '../games/mines/index.js'
import { crashMeta } from '../games/crash/index.js'
import { diceMeta } from '../games/dice/index.js'
import { limboMeta } from '../games/limbo/index.js'
import { kenoMeta } from '../games/keno/index.js'
import { plinkoMeta } from '../games/plinko/index.js'
import { wheelMeta } from '../games/wheel/index.js'
import { hiloMeta } from '../games/hilo/index.js'
import { chickenRoadMeta } from '../games/chickenroad/index.js'
import { dragonTowerMeta } from '../games/dragon-tower/index.js'
import { pumpMeta } from '../games/pump/index.js'
import { rouletteMeta } from '../games/roulette/index.js'
import { blackjackMeta } from '../games/blackjack/index.js'
import { baccaratMeta } from '../games/baccarat/index.js'
import { coinFlipMeta } from '../games/coinflip/index.js'
import { diamondsMeta } from '../games/diamonds/index.js'
import { videoPokerMeta } from '../games/videopoker/index.js'
import { casesMeta } from '../games/cases/index.js'
import { sicBoMeta } from '../games/sicbo/index.js'
import { threeCardPokerMeta } from '../games/threecardpoker/index.js'
import { slotsMeta } from '../games/slots/index.js'

/** What every game view receives from the shell: the shared account + a signal
 *  to re-render the balance. (Games may also accept an optional per-game
 *  houseConfig, which the admin/manager layer can supply later.) */
export interface GameProps {
  account: Account
  onBalanceChange: () => void
}

/** The lobby filter buckets. 'Originals' are the Stake-style RNG games; the rest
 *  group the canonical casino games so a player can narrow the grid by type. */
export type GameCategory = 'Originals' | 'Table' | 'Cards' | 'Slots'

/** The category filter order shown in the lobby (an 'All' pill + a 'Hot' pseudo-
 *  filter are added by the lobby itself). */
export const GAME_CATEGORIES: GameCategory[] = ['Originals', 'Table', 'Cards', 'Slots']

export interface GameDef {
  key: string
  name: string
  tagline: string
  accent: string
  /** Which lobby filter bucket this game falls in (drives the category tabs). */
  category: GameCategory
  /** Trending flag — surfaces a "Hot" badge on the card and a "Hot" lobby filter. */
  hot?: boolean
  /** Whether a manager can tune this game's house edge via a single RTP (§4).
   *  True only for RNG house-banked games whose payouts derive from one edge
   *  value; false for structural/canonical or skill games where one RTP doesn't
   *  apply. Set on each game's meta so the classification is self-documenting. */
  supportsAdjustableEdge?: boolean
  /** The RTP range the manager control allows; defaults to the shared RTP_POLICY
   *  (games/shared/edge.ts) when omitted. */
  rtpBounds?: { min: number; max: number }
  Component: ComponentType<GameProps>
}

/** Lobby presentation metadata layered onto each game's `*Meta` at registry build:
 *  its filter category and whether it's currently "Hot". Modelled on the design
 *  system's per-game `cat`/`hot` flags (design-system/.../data.js). Games not listed
 *  default to the Originals bucket. */
const GAME_TAGS: Record<string, { category: GameCategory; hot?: boolean }> = {
  // Stake-style Originals
  crash: { category: 'Originals', hot: true },
  mines: { category: 'Originals', hot: true },
  plinko: { category: 'Originals', hot: true },
  dice: { category: 'Originals', hot: true },
  pump: { category: 'Originals', hot: true },
  limbo: { category: 'Originals' },
  wheel: { category: 'Originals' },
  keno: { category: 'Originals' },
  hilo: { category: 'Originals' },
  'dragon-tower': { category: 'Originals' },
  chickenroad: { category: 'Originals' },
  coinflip: { category: 'Originals' },
  diamonds: { category: 'Originals' },
  cases: { category: 'Originals' },
  // Table games
  roulette: { category: 'Table' },
  sicbo: { category: 'Table' },
  // Card games
  blackjack: { category: 'Cards' },
  baccarat: { category: 'Cards' },
  videopoker: { category: 'Cards' },
  threecardpoker: { category: 'Cards' },
  // Reels
  slots: { category: 'Slots' },
}

/**
 * Lazy-load a game's view so each game UI ships as its OWN chunk, fetched only
 * when the player opens that game — instead of bundling all 21 game UIs (the bulk
 * of the app) into the initial download. The shell stays small; a game's code
 * (and its CSS) arrives on first open and is cached thereafter. The lobby cards
 * use the static `*Meta` above, so the hub renders with no game chunk loaded.
 */
function lazyView(load: () => Promise<{ default: ComponentType<GameProps> }>): ComponentType<GameProps> {
  return lazy(load) as unknown as ComponentType<GameProps>
}

/** The raw catalog: each game's static `*Meta` + its lazy view, before the lobby
 *  category/hot tags are merged in (see GAMES below). */
const GAME_CATALOG: Omit<GameDef, 'category' | 'hot'>[] = [
  { ...minesMeta, Component: lazyView(() => import('../games/mines/ui/MinesGame.js').then((m) => ({ default: m.MinesGame }))) },
  { ...crashMeta, Component: lazyView(() => import('../games/crash/ui/CrashGame.js').then((m) => ({ default: m.CrashGame }))) },
  { ...diceMeta, Component: lazyView(() => import('../games/dice/ui/DiceGame.js').then((m) => ({ default: m.DiceGame }))) },
  { ...limboMeta, Component: lazyView(() => import('../games/limbo/ui/LimboGame.js').then((m) => ({ default: m.LimboGame }))) },
  { ...kenoMeta, Component: lazyView(() => import('../games/keno/ui/KenoGame.js').then((m) => ({ default: m.KenoGame }))) },
  { ...plinkoMeta, Component: lazyView(() => import('../games/plinko/ui/PlinkoGame.js').then((m) => ({ default: m.PlinkoGame }))) },
  { ...wheelMeta, Component: lazyView(() => import('../games/wheel/ui/WheelGame.js').then((m) => ({ default: m.WheelGame }))) },
  { ...hiloMeta, Component: lazyView(() => import('../games/hilo/ui/HiloGame.js').then((m) => ({ default: m.HiloGame }))) },
  { ...chickenRoadMeta, Component: lazyView(() => import('../games/chickenroad/ui/ChickenRoadGame.js').then((m) => ({ default: m.ChickenRoadGame }))) },
  { ...dragonTowerMeta, Component: lazyView(() => import('../games/dragon-tower/ui/DragonTowerGame.js').then((m) => ({ default: m.DragonTowerGame }))) },
  { ...pumpMeta, Component: lazyView(() => import('../games/pump/ui/PumpGame.js').then((m) => ({ default: m.PumpGame }))) },
  { ...rouletteMeta, Component: lazyView(() => import('../games/roulette/ui/RouletteGame.js').then((m) => ({ default: m.RouletteGame }))) },
  { ...blackjackMeta, Component: lazyView(() => import('../games/blackjack/ui/BlackjackGame.js').then((m) => ({ default: m.BlackjackGame }))) },
  { ...baccaratMeta, Component: lazyView(() => import('../games/baccarat/ui/BaccaratGame.js').then((m) => ({ default: m.BaccaratGame }))) },
  { ...coinFlipMeta, Component: lazyView(() => import('../games/coinflip/ui/CoinFlipGame.js').then((m) => ({ default: m.CoinFlipGame }))) },
  { ...diamondsMeta, Component: lazyView(() => import('../games/diamonds/ui/DiamondsGame.js').then((m) => ({ default: m.DiamondsGame }))) },
  { ...videoPokerMeta, Component: lazyView(() => import('../games/videopoker/ui/VideoPokerGame.js').then((m) => ({ default: m.VideoPokerGame }))) },
  { ...casesMeta, Component: lazyView(() => import('../games/cases/ui/CasesGame.js').then((m) => ({ default: m.CasesGame }))) },
  { ...sicBoMeta, Component: lazyView(() => import('../games/sicbo/ui/SicBoGame.js').then((m) => ({ default: m.SicBoGame }))) },
  { ...threeCardPokerMeta, Component: lazyView(() => import('../games/threecardpoker/ui/ThreeCardPokerGame.js').then((m) => ({ default: m.ThreeCardPokerGame }))) },
  { ...slotsMeta, Component: lazyView(() => import('../games/slots/ui/SlotsGame.js').then((m) => ({ default: m.SlotsGame }))) },
]

/** The games registry the lobby + shell render from: the catalog with its lobby
 *  category/hot tags merged in (unlisted games default to the Originals bucket). */
export const GAMES: GameDef[] = GAME_CATALOG.map((g) => ({
  ...g,
  category: GAME_TAGS[g.key]?.category ?? 'Originals',
  hot: GAME_TAGS[g.key]?.hot ?? false,
}))

/** Look up a game by its key (used for routing to a game page). */
export function findGame(key: string | null): GameDef | null {
  return key == null ? null : GAMES.find((g) => g.key === key) ?? null
}
