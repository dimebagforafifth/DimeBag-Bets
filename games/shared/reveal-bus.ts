/**
 * A tiny "the on-screen reveal just finished" notification bus.
 *
 * Core resolves a wager the instant the math is decided, but a game then animates
 * the outcome (the ball falls, the dealer draws, the wheel spins). The ledger
 * must not reveal the result before the player sees it — yet it shouldn't have to
 * GUESS how long each animation takes either. A fixed guess is wrong for a
 * *variable* reveal: Plinko's ball fall scales with the row count, so any single
 * number is too long for a short board (a felt delay) and risky for a tall one.
 *
 * So a game calls `signalReveal(accountId)` the exact moment its reveal finishes
 * — the ball lands, the dealer settles, the player cashes out — and the ledger
 * releases that bet's entry right then (plus one tiny, imperceptible beat). Games
 * stay independent of the ledger: they only announce "the result is now on
 * screen." The ledger keeps a per-game worst-case timer as a SAFETY fallback, so
 * an entry is never lost even if a signal never arrives (e.g. you navigate away
 * mid-animation).
 */
type RevealListener = (accountId: string) => void

const listeners = new Set<RevealListener>()

/** Subscribe to reveal-complete signals. Returns an unsubscribe fn. */
export function onReveal(listener: RevealListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A game announces that the visible reveal for `accountId`'s most recently
 *  resolved bet has finished — the result is now on screen. */
export function signalReveal(accountId: string): void {
  for (const l of listeners) {
    try {
      l(accountId)
    } catch {
      /* a listener must never break a game */
    }
  }
}

/* ----------------------------- resolving lock ----------------------------- */
/**
 * Whether an account has a bet that has RESOLVED but whose result isn't fully on
 * screen / in the ledger yet. The ledger feeds this: it calls beginResolving when
 * a bet resolves and endResolving when that entry is released (a reveal signal or
 * the safety fallback). Games read it via useResolving to keep the Play/Bet button
 * disabled until the round is truly over — so you can't start the next bet while
 * the last result (a loss you haven't seen yet) is still playing out.
 */
const resolving = new Map<string, number>()
const resolvingListeners = new Set<() => void>()

function notifyResolving(): void {
  resolvingListeners.forEach((l) => l())
}

/** The ledger: a bet for `accountId` just resolved and is awaiting its reveal. */
export function beginResolving(accountId: string): void {
  resolving.set(accountId, (resolving.get(accountId) ?? 0) + 1)
  notifyResolving()
}

/** The ledger: that bet's result is now revealed/logged — release the lock. */
export function endResolving(accountId: string): void {
  const next = (resolving.get(accountId) ?? 0) - 1
  if (next > 0) resolving.set(accountId, next)
  else resolving.delete(accountId)
  notifyResolving()
}

/** True while any of `accountId`'s resolved bets are still revealing. */
export function isResolving(accountId: string): boolean {
  return (resolving.get(accountId) ?? 0) > 0
}

export function subscribeResolving(listener: () => void): () => void {
  resolvingListeners.add(listener)
  return () => {
    resolvingListeners.delete(listener)
  }
}
