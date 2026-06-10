/**
 * Tiny deterministic PRNG used to synthesize demo data (sessions, CLV history,
 * pending tickets) that is STABLE per player across reloads and test runs — so the
 * panels and their tests read identical rows every time. Not security-grade; it only
 * has to be repeatable. // TODO(api): all callers are demo seeds behind a real-feed seam.
 */

/** FNV-1a string hash → uint32 seed. */
export function hashId(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — a fast, well-distributed 32-bit PRNG. Returns a fn yielding [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded generator keyed by a string (e.g. a player id). */
export function rngFor(key: string): () => number {
  return mulberry32(hashId(key))
}

/** Pick a deterministic element from a list using a [0,1) draw. */
export function pick<T>(list: readonly T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))]
}
