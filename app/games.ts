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

import type { ComponentType } from 'react'
import type { Account } from '../core/index.js'
import { minesMeta } from '../games/mines/index.js'
import { MinesGame } from '../games/mines/ui/MinesGame.js'
import { crashMeta } from '../games/crash/index.js'
import { CrashGame } from '../games/crash/ui/CrashGame.js'
import { diceMeta } from '../games/dice/index.js'
import { DiceGame } from '../games/dice/ui/DiceGame.js'
import { limboMeta } from '../games/limbo/index.js'
import { LimboGame } from '../games/limbo/ui/LimboGame.js'
import { kenoMeta } from '../games/keno/index.js'
import { KenoGame } from '../games/keno/ui/KenoGame.js'
import { plinkoMeta } from '../games/plinko/index.js'
import { PlinkoGame } from '../games/plinko/ui/PlinkoGame.js'
import { wheelMeta } from '../games/wheel/index.js'
import { WheelGame } from '../games/wheel/ui/WheelGame.js'
import { hiloMeta } from '../games/hilo/index.js'
import { HiloGame } from '../games/hilo/ui/HiloGame.js'
import { chickenRoadMeta } from '../games/chickenroad/index.js'
import { ChickenRoadGame } from '../games/chickenroad/ui/ChickenRoadGame.js'
import { dragonTowerMeta } from '../games/dragon-tower/index.js'
import { DragonTowerGame } from '../games/dragon-tower/ui/DragonTowerGame.js'
import { pumpMeta } from '../games/pump/index.js'
import { PumpGame } from '../games/pump/ui/PumpGame.js'
import { rouletteMeta } from '../games/roulette/index.js'
import { RouletteGame } from '../games/roulette/ui/RouletteGame.js'
import { blackjackMeta } from '../games/blackjack/index.js'
import { BlackjackGame } from '../games/blackjack/ui/BlackjackGame.js'
import { baccaratMeta } from '../games/baccarat/index.js'
import { BaccaratGame } from '../games/baccarat/ui/BaccaratGame.js'
import { coinFlipMeta } from '../games/coinflip/index.js'
import { CoinFlipGame } from '../games/coinflip/ui/CoinFlipGame.js'
import { diamondsMeta } from '../games/diamonds/index.js'
import { DiamondsGame } from '../games/diamonds/ui/DiamondsGame.js'
import { videoPokerMeta } from '../games/videopoker/index.js'
import { VideoPokerGame } from '../games/videopoker/ui/VideoPokerGame.js'
import { casesMeta } from '../games/cases/index.js'
import { CasesGame } from '../games/cases/ui/CasesGame.js'
import { sicBoMeta } from '../games/sicbo/index.js'
import { SicBoGame } from '../games/sicbo/ui/SicBoGame.js'
import { threeCardPokerMeta } from '../games/threecardpoker/index.js'
import { ThreeCardPokerGame } from '../games/threecardpoker/ui/ThreeCardPokerGame.js'

/** What every game view receives from the shell: the shared account + a signal
 *  to re-render the balance. (Games may also accept an optional per-game
 *  houseConfig, which the admin/manager layer can supply later.) */
export interface GameProps {
  account: Account
  onBalanceChange: () => void
}

export interface GameDef {
  key: string
  name: string
  tagline: string
  accent: string
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

export const GAMES: GameDef[] = [
  { ...minesMeta, Component: MinesGame },
  { ...crashMeta, Component: CrashGame },
  { ...diceMeta, Component: DiceGame },
  { ...limboMeta, Component: LimboGame },
  { ...kenoMeta, Component: KenoGame },
  { ...plinkoMeta, Component: PlinkoGame },
  { ...wheelMeta, Component: WheelGame },
  { ...hiloMeta, Component: HiloGame },
  { ...chickenRoadMeta, Component: ChickenRoadGame },
  { ...dragonTowerMeta, Component: DragonTowerGame },
  { ...pumpMeta, Component: PumpGame },
  { ...rouletteMeta, Component: RouletteGame },
  { ...blackjackMeta, Component: BlackjackGame },
  { ...baccaratMeta, Component: BaccaratGame },
  { ...coinFlipMeta, Component: CoinFlipGame },
  { ...diamondsMeta, Component: DiamondsGame },
  { ...videoPokerMeta, Component: VideoPokerGame },
  { ...casesMeta, Component: CasesGame },
  { ...sicBoMeta, Component: SicBoGame },
  { ...threeCardPokerMeta, Component: ThreeCardPokerGame },
]

/** Look up a game by its key (used for routing to a game page). */
export function findGame(key: string | null): GameDef | null {
  return key == null ? null : GAMES.find((g) => g.key === key) ?? null
}
