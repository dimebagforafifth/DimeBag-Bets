/**
 * DimeBag-Bets sound engine — synthesized audio cues via the Web Audio API.
 *
 * Why synthesis (not audio files): it matches the project ethos (our own crypto
 * RNG instead of a paid service, §6) — zero assets to source or license, no new
 * dependencies, a few KB of code, and it stays on-brand with the clean,
 * lightweight UI (§2). This is the one shared sound module — a sibling to
 * `core/`, imported by every game UI the same way games already import `core`.
 * No game keeps its own audio, just as no module keeps its own points (§3).
 *
 * Browser autoplay rules block audio until a user gesture, so the AudioContext
 * is created lazily on the first `play()` (always reached from a click) and
 * resumed if the tab has suspended it. The mute preference persists to
 * localStorage and defaults to on.
 */

export type SoundName =
  | 'bet' // a wager is placed
  | 'reveal' // a safe reveal — laddered upward by `step`
  | 'select' // a UI pick (e.g. a Keno number)
  | 'draw' // a neutral draw blip
  | 'tick' // a rising climb cue (Crash) — pitched by `step`
  | 'roll' // a roll/launch whoosh (Dice, Limbo)
  | 'win' // a win / cash out
  | 'lose' // a loss
  | 'boom' // an explosion (Mines bust, Crash)

export interface PlayOptions {
  /** For laddered cues (Mines reveals, Crash ticks): higher = brighter pitch. */
  step?: number
}

const STORAGE_KEY = 'dimebag.sound'
const MASTER_GAIN = 0.5

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = loadEnabled()
const listeners = new Set<() => void>()

function loadEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Lazily create (and resume) the shared AudioContext. Returns null if the
 *  browser has no Web Audio support or we're not in one. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/* ----------------------------- mute state ------------------------------ */

export function isSoundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(next: boolean): void {
  enabled = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    /* private mode / no storage — keep the in-memory preference */
  }
  if (next) audio() // warm up while we're still inside the toggle's click gesture
  listeners.forEach((l) => l())
}

export function toggleSound(): void {
  setSoundEnabled(!enabled)
}

/** Subscribe to mute changes (used by the React toggle via useSyncExternalStore). */
export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* ------------------------------ synthesis ------------------------------ */

interface ToneSpec {
  freq: number
  /** Slide to this frequency over the tone's duration. */
  to?: number
  dur: number
  type?: OscillatorType
  gain?: number
  /** Start this many seconds after the trigger (for arpeggios). */
  delay?: number
  attack?: number
}

/** One enveloped oscillator. Exponential ramps never reach 0, so we floor at a
 *  near-silent value and start/end there to avoid clicks. */
function tone(ac: AudioContext, out: GainNode, t0: number, s: ToneSpec): void {
  const start = t0 + (s.delay ?? 0)
  const end = start + s.dur
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = s.type ?? 'sine'
  osc.frequency.setValueAtTime(s.freq, start)
  if (s.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.to), end)
  const peak = s.gain ?? 0.3
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + (s.attack ?? 0.006))
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(g).connect(out)
  osc.start(start)
  osc.stop(end + 0.02)
}

/** A filtered noise burst (for whooshes and explosions). */
function noise(
  ac: AudioContext,
  out: GainNode,
  t0: number,
  o: { dur: number; gain: number; from: number; to: number; type?: BiquadFilterType },
): void {
  const len = Math.max(1, Math.floor(ac.sampleRate * o.dur))
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = o.type ?? 'lowpass'
  filter.frequency.setValueAtTime(o.from, t0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(o.gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(filter).connect(g).connect(out)
  src.start(t0)
  src.stop(t0 + o.dur + 0.02)
}

/**
 * Play a cue. No-op when muted or when Web Audio is unavailable. Safe to call
 * from any event handler / animation frame — overlapping calls just layer.
 */
export function play(name: SoundName, options: PlayOptions = {}): void {
  if (!enabled) return
  const ac = audio()
  if (!ac || !master) return
  const t = ac.currentTime
  const out = master

  switch (name) {
    case 'bet': {
      // a soft, confident "place" — short downward chirp over a low body.
      tone(ac, out, t, { freq: 320, to: 180, dur: 0.12, type: 'triangle', gain: 0.3 })
      tone(ac, out, t, { freq: 130, dur: 0.1, type: 'sine', gain: 0.22 })
      break
    }
    case 'select': {
      tone(ac, out, t, { freq: 680, dur: 0.05, type: 'triangle', gain: 0.18 })
      break
    }
    case 'draw': {
      const base = 360 + ((options.step ?? 0) % 6) * 38
      tone(ac, out, t, { freq: base, dur: 0.06, type: 'square', gain: 0.12 })
      break
    }
    case 'reveal': {
      // ascending ladder — each safe pick a touch higher, with a sparkle octave.
      const step = Math.min(options.step ?? 1, 18)
      const base = 440 * Math.pow(2, (step - 1) / 12)
      tone(ac, out, t, { freq: base, dur: 0.13, type: 'triangle', gain: 0.26 })
      tone(ac, out, t, { freq: base * 2, dur: 0.09, type: 'sine', gain: 0.1, delay: 0.006 })
      break
    }
    case 'tick': {
      // climbing cue — pitch rises with the multiplier rung; kept quiet to layer.
      const step = Math.min(options.step ?? 0, 48)
      tone(ac, out, t, { freq: 300 * Math.pow(1.04, step), dur: 0.04, type: 'square', gain: 0.07 })
      break
    }
    case 'roll': {
      noise(ac, out, t, { dur: 0.22, gain: 0.16, from: 1800, to: 400, type: 'bandpass' })
      tone(ac, out, t, { freq: 240, to: 520, dur: 0.2, type: 'triangle', gain: 0.12 })
      break
    }
    case 'win': {
      // bright major arpeggio: C5 E5 G5 C6.
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) =>
        tone(ac, out, t, { freq: f, dur: 0.18, type: 'triangle', gain: 0.24, delay: i * 0.075 }),
      )
      break
    }
    case 'lose': {
      tone(ac, out, t, { freq: 300, to: 150, dur: 0.32, type: 'sawtooth', gain: 0.18 })
      tone(ac, out, t, { freq: 150, to: 90, dur: 0.34, type: 'sine', gain: 0.16, delay: 0.04 })
      break
    }
    case 'boom': {
      noise(ac, out, t, { dur: 0.4, gain: 0.4, from: 1200, to: 60, type: 'lowpass' })
      tone(ac, out, t, { freq: 120, to: 40, dur: 0.42, type: 'sine', gain: 0.4 })
      break
    }
  }
}
