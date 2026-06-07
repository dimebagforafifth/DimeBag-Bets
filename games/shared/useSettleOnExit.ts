import { useEffect, useRef } from 'react'

/**
 * Settle a game's OPEN wager if the player leaves mid-play.
 *
 * Most games resolve the instant you click (Plinko, Dice, Keno…): the stake moves
 * through `core` at commit and the animation is just for show, so navigating away
 * loses nothing. But an *interactive* game holds an open wager between actions —
 * a live Mines board, a Crash bet still riding, a dealt Blackjack hand — and that
 * stake sits in `account.pending` until the player cashes out, busts, or stands.
 * If the component unmounts first (they click "← Casino", switch section, or open
 * another game), that pending stake would be stranded forever.
 *
 * Pass a `settle` callback that resolves whatever is currently open — cash out at
 * the live value, take the loss, stand the hand — and a no-op when nothing is
 * open. It runs exactly once, on unmount. The callback is captured fresh on every
 * render via a ref, so on teardown it sees the LATEST game state (not a stale
 * mount-time closure) and settles correctly. Resolution goes through `core`, so
 * the figure updates and the ledger logs the result in the background, exactly as
 * if the round had finished on screen.
 */
export function useSettleOnExit(settle: () => void): void {
  const ref = useRef(settle)
  ref.current = settle
  useEffect(() => {
    return () => {
      try {
        ref.current()
      } catch {
        /* a teardown settle must never break unmount */
      }
    }
  }, [])
}
