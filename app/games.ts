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
  Component: ComponentType<GameProps>
}

export const GAMES: GameDef[] = [
  { ...minesMeta, Component: MinesGame },
  { ...crashMeta, Component: CrashGame },
  { ...diceMeta, Component: DiceGame },
  { ...limboMeta, Component: LimboGame },
  { ...kenoMeta, Component: KenoGame },
]

/** Look up a game by its key (used for routing to a game page). */
export function findGame(key: string | null): GameDef | null {
  return key == null ? null : GAMES.find((g) => g.key === key) ?? null
}
