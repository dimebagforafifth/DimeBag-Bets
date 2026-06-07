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
  | 'chips' // a few clay chips stacked onto the felt (Blackjack split)
  | 'chipclack' // clay chips clacked/knocked together (Blackjack double)
  | 'reveal' // a safe reveal — laddered upward by `step`
  | 'select' // a UI pick (e.g. a Keno number)
  | 'draw' // a neutral draw blip
  | 'deal' // a card pitched onto the felt (Blackjack) — a paper fwip + landing tap
  | 'tick' // a rising climb cue (Crash) — pitched by `step`
  | 'roll' // a roll/launch whoosh (Dice/Limbo legacy)
  | 'unlock' // a key turning a lock — tumblers click, then the bolt clunks (Cases)
  | 'chest' // a treasure chest unlatching + creaking open with a little gold shimmer (Cases)
  | 'spin' // a wheel spinning down — ticks slow as it decelerates (Wheel/Cases); takes `durationMs`
  | 'roulette' // a roulette ball racing the rim then clattering into a pocket (Roulette); takes `durationMs`
  | 'dice' // a soft tumble of the dice settling (Dice)
  | 'diceroll' // three dice tumbling across the felt then settling (Sic Bo); takes `durationMs`
  | 'click' // a soft, satisfying mechanical click (Limbo launch)
  | 'win' // a win / cash out
  | 'lose' // a loss
  | 'boom' // an explosion (Mines bust, Crash)
  | 'car' // a car blasting past (Chicken Road) — a warm Doppler vroom
  | 'crash' // a car collision (Chicken Road) — metal crunch + glass tinkle
  | 'pump' // forcing air into the balloon (Pump) — tightens with `step`
  | 'pop' // a balloon bursting (Pump) — a sharp, real pop
  | 'coin' // a coin flicked into a spin (Coin Flip) — a light metallic ting

export interface PlayOptions {
  /** For laddered cues (Mines reveals, Crash ticks): higher = brighter pitch. */
  step?: number
  /** For the wheel 'spin' cue: how long the spin lasts, so the ticks slow to match. */
  durationMs?: number
}

const STORAGE_KEY = 'dimebag.sound'
const MASTER_GAIN = 0.32

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

/**
 * Guarantee the first in-game click makes sound. Browsers only let audio start
 * inside a user gesture, and a just-created AudioContext can momentarily be
 * 'suspended' — which would swallow the very first cue (a classic Safari/iOS
 * bug). So we prime (create + resume) the context on the first user interaction
 * anywhere: `pointerdown` fires before any React `onClick`, so by the time a
 * game runs its first `play()` the context is already running. Fires once.
 */
function primeOnFirstGesture(): void {
  if (typeof window === 'undefined') return
  const prime = () => {
    audio()
    window.removeEventListener('pointerdown', prime)
    window.removeEventListener('touchstart', prime)
    window.removeEventListener('keydown', prime)
  }
  window.addEventListener('pointerdown', prime, { passive: true })
  window.addEventListener('touchstart', prime, { passive: true })
  window.addEventListener('keydown', prime)
}
primeOnFirstGesture()

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

/** A filtered noise burst (for whooshes and explosions). With `attack`, the gain
 *  swells in from silence instead of starting at full — turning a percussive
 *  burst into a breathy gust (air rushing in, not a sharp transient). */
function noise(
  ac: AudioContext,
  out: GainNode,
  t0: number,
  o: { dur: number; gain: number; from: number; to: number; type?: BiquadFilterType; attack?: number },
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
  const atk = o.attack ?? 0
  if (atk > 0) {
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + atk) // swell in
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur) // then ease out
  } else {
    g.gain.setValueAtTime(o.gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  }
  src.connect(filter).connect(g).connect(out)
  src.start(t0)
  src.stop(t0 + o.dur + 0.02)
}

/**
 * A short, dry tactile "tap" — a filtered-noise transient with an optional faint
 * pitched body. This is the backbone of the *basic* UI feel: everyday actions
 * (picks, draws, the bet press, the climb tick) lean on this physical click
 * instead of musical tones, so the gamey character is reserved for wins/losses.
 */
function click(
  ac: AudioContext,
  out: GainNode,
  t0: number,
  o: {
    gain?: number
    /** Noise band — higher = crisper/brighter tap, lower = softer/woodier. */
    from?: number
    to?: number
    dur?: number
    /** Faint pitched thump under the tick, for weight (Hz). */
    body?: number
    bodyType?: OscillatorType
    bodyGain?: number
  },
): void {
  const dur = o.dur ?? 0.024
  noise(ac, out, t0, {
    dur,
    gain: o.gain ?? 0.12,
    from: o.from ?? 2600,
    to: o.to ?? 1400,
    type: 'bandpass',
  })
  if (o.body) {
    tone(ac, out, t0, {
      freq: o.body,
      dur: dur + 0.02,
      type: o.bodyType ?? 'sine',
      gain: o.bodyGain ?? 0.07,
      attack: 0.002,
    })
  }
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
    case 'deal': {
      // a card pitched off the shoe onto the felt: a quick paper "fwip" of
      // friction that swells then fades, followed by a soft low landing tap.
      noise(ac, out, t, { dur: 0.085, gain: 0.13, from: 1600, to: 3600, type: 'bandpass', attack: 0.025 })
      noise(ac, out, t + 0.05, { dur: 0.045, gain: 0.06, from: 520, to: 200, type: 'lowpass' })
      break
    }
    case 'bet': {
      // a soft, tactile "press" — a muted low thump with a faint click on top.
      // Reads as a cushioned physical button, not a snappy chirp.
      click(ac, out, t, { gain: 0.06, from: 1700, to: 1000 })
      tone(ac, out, t, { freq: 150, to: 118, dur: 0.11, type: 'sine', gain: 0.13, attack: 0.012 })
      break
    }
    case 'select': {
      // a dry tactile tick for a UI pick — crisp, brief, un-melodic.
      click(ac, out, t, { gain: 0.12, from: 2800, to: 1700, body: 520, bodyGain: 0.05 })
      break
    }
    case 'chips': {
      // clay poker chips placed/stacked: three short, dry "clacks" close together,
      // each a tight click + a dull woody body, lightly varied so it reads as chips
      // knocking onto a stack rather than one flat tap.
      const taps = [0, 0.052, 0.103]
      taps.forEach((dt, i) => {
        const at = t + dt
        click(ac, out, at, {
          gain: 0.06 - i * 0.009,
          from: 2700 + i * 220,
          to: 1300,
          dur: 0.011,
          body: 360 + i * 50,
          bodyGain: 0.03,
        })
        tone(ac, out, at, { freq: 520 - i * 26, to: 300, dur: 0.05, type: 'triangle', gain: 0.028, attack: 0.001 })
      })
      break
    }
    case 'chipclack': {
      // clay chips KNOCKED together — the casino sound of clacking two stacks of
      // chips against each other. A few clean, distinct, bright ceramic clacks: a
      // sharp strike + a short clay "tink" ring (two partials for a richer ring).
      // NOT a riffle/brrrip — you hear each clack land.
      const clacks = [0, 0.082, 0.156]
      clacks.forEach((dt, i) => {
        const at = t + dt
        const fade = 1 - i * 0.16
        // the strike — a sharp, bright transient (one chip hitting another)
        click(ac, out, at, {
          gain: 0.08 * fade,
          from: 3200 - i * 170,
          to: 1450,
          dur: 0.009,
          body: 400 + i * 24,
          bodyGain: 0.036,
        })
        // the clay/ceramic RING — the signature poker-chip "tink"; two partials ring
        // briefly so it reads unmistakably as a clay chip, not a wooden click
        tone(ac, out, at, { freq: 1980 - i * 95, to: 1280, dur: 0.06, type: 'triangle', gain: 0.036 * fade, attack: 0.001 })
        tone(ac, out, at, { freq: 2880 - i * 130, to: 1860, dur: 0.04, type: 'sine', gain: 0.022 * fade, attack: 0.001 })
      })
      break
    }
    case 'draw': {
      // a soft woody tap; the faint body shifts a hair by step so a run of draws
      // doesn't sound mechanical, but it stays neutral (no tune).
      const body = 230 + ((options.step ?? 0) % 4) * 16
      click(ac, out, t, { gain: 0.1, from: 1500, to: 850, body, bodyGain: 0.06 })
      break
    }
    case 'reveal': {
      // a gentle upward ladder — softer and woodier than a game jingle: a warm
      // sine pluck per safe pick, lightly laddered, with just a hint of a fifth
      // shimmering above. The tactile tick gives it attack without the sparkle.
      const step = Math.min(options.step ?? 1, 18)
      const base = 392 * Math.pow(2, (step - 1) / 12) // G4 root, climbs by semitone
      click(ac, out, t, { gain: 0.05, from: 3200, to: 1900, dur: 0.016 })
      tone(ac, out, t, { freq: base, dur: 0.13, type: 'sine', gain: 0.2, attack: 0.003 })
      tone(ac, out, t, { freq: base * 1.5, dur: 0.07, type: 'sine', gain: 0.045, delay: 0.012 })
      break
    }
    case 'tick': {
      // climbing cue — a faint tactile tick that brightens with the rung instead
      // of a square buzz; quiet enough to layer under the rising number.
      const step = Math.min(options.step ?? 0, 48)
      const cutoff = 1400 * Math.pow(1.03, step)
      click(ac, out, t, { gain: 0.05, from: cutoff, to: cutoff * 0.7, dur: 0.016 })
      break
    }
    case 'roll': {
      // a soft, airy whoosh rather than a sharp swipe — gentler noise and a
      // rounded rising body so launches feel smooth, not abrasive.
      noise(ac, out, t, { dur: 0.24, gain: 0.08, from: 1400, to: 380, type: 'bandpass' })
      tone(ac, out, t, { freq: 240, to: 500, dur: 0.2, type: 'sine', gain: 0.08, attack: 0.015 })
      break
    }
    case 'unlock': {
      // a key turning a lock: a brief metallic scrape, two tumbler clicks, then a
      // firm low clunk as the bolt throws — the latch springing before the spin.
      noise(ac, out, t, { dur: 0.05, gain: 0.05, from: 3200, to: 1800, type: 'bandpass' }) // key scrape
      click(ac, out, t + 0.06, { gain: 0.12, from: 3000, to: 1700, body: 600, bodyGain: 0.05 }) // tumbler 1
      click(ac, out, t + 0.14, { gain: 0.13, from: 2800, to: 1500, body: 520, bodyGain: 0.05 }) // tumbler 2
      // the bolt thrown — a solid woody/metal clunk
      tone(ac, out, t + 0.22, { freq: 240, to: 90, dur: 0.12, type: 'triangle', gain: 0.2, attack: 0.002 })
      tone(ac, out, t + 0.22, { freq: 90, to: 55, dur: 0.16, type: 'sine', gain: 0.15, attack: 0.003 })
      noise(ac, out, t + 0.22, { dur: 0.06, gain: 0.08, from: 1200, to: 300, type: 'lowpass' })
      break
    }
    case 'chest': {
      // the satisfying chest open: the latch springs (two bright clicks), the heavy
      // wooden lid creaks up (a low body swelling open), then a little gold shimmer —
      // a quick ascending sparkle of bell tones, like treasure catching the light.
      click(ac, out, t, { gain: 0.13, from: 3200, to: 1900, body: 640, bodyGain: 0.05 }) // latch click
      click(ac, out, t + 0.07, { gain: 0.14, from: 2900, to: 1500, body: 460, bodyGain: 0.05 }) // bolt releases
      // the lid creaking open — a soft low wooden swell + a breathy hinge
      tone(ac, out, t + 0.12, { freq: 150, to: 250, dur: 0.28, type: 'triangle', gain: 0.09, attack: 0.06 })
      noise(ac, out, t + 0.12, { dur: 0.24, gain: 0.05, from: 480, to: 1300, type: 'bandpass', attack: 0.09 })
      // a gold shimmer — bell tones climbing a major arpeggio (A5 D6 F#6 A6)
      const shimmer = [880, 1174.66, 1567.98, 2093]
      shimmer.forEach((f, i) =>
        tone(ac, out, t + 0.24 + i * 0.055, { freq: f, dur: 0.2, type: 'sine', gain: 0.06, attack: 0.004 }),
      )
      break
    }
    case 'spin': {
      // a wheel spinning down to a stop. Two layers, both scheduled across the whole
      // spin so they decelerate WITH the wheel: (1) a soft airy whir that dulls and
      // fades as it slows, and (2) a train of flapper "ticks" whose gaps GROW as the
      // wheel loses speed (gap = base ÷ velocity, velocity ~ (1−progress)^1.6), so the
      // ticking audibly slows to rest. `durationMs` matches the visual spin length.
      const dur = Math.max(0.3, (options.durationMs ?? 3000) / 1000)
      noise(ac, out, t, { dur, gain: 0.05, from: 1100, to: 170, type: 'lowpass', attack: 0.08 }) // the whir
      let elapsed = 0
      while (elapsed < dur) {
        const prog = elapsed / dur
        click(ac, out, t + elapsed, {
          gain: 0.04 + 0.025 * (1 - prog), // a touch louder while fast, mellowing as it slows
          from: 2500 - 800 * prog,
          to: 1500 - 500 * prog,
          dur: 0.013,
          body: 300 - 60 * prog,
          bodyGain: 0.022,
        })
        const velocity = Math.max(0.12, Math.pow(1 - prog, 1.6)) // floor keeps the final gaps sane
        elapsed += 0.05 / velocity // ~20 ticks/s at full speed → ~2.4/s as it stops
      }
      break
    }
    case 'roulette': {
      // a roulette BALL, made SATISFYING — warm and tactile, no buzzy sawtooth or
      // clanky metal. Two phases over `durationMs`:
      // (1) the ROLL: the ball circling the wooden rim — a soft airy whir easing
      //     DOWN, with a light crisp tick each time it passes a fret, the ticks
      //     decelerating smoothly to a saunter (the signature roulette slowdown);
      // (2) the SETTLE: it leaves the rim and bounces home through the pockets — a
      //     few ROUNDED wooden taps, each softer and closer than the last, finished
      //     by a low, satisfying plunk as it nestles into the pocket. Bounce timings
      //     span the ball's visual drop and land with it.
      const dur = Math.max(0.4, (options.durationMs ?? 4800) / 1000)
      const rollDur = dur * 0.68 // rides the rim ~⅔ of the spin, then drops
      const dropDur = dur - rollDur
      // JUST the ball — no whir, no wind. Only the light taps of the ball passing
      // the frets: a clean train of clicks, quick at first and decelerating to a
      // saunter, each a warm little tap. The slowdown is the whole sound.
      let elapsed = 0
      while (elapsed < rollDur) {
        const prog = elapsed / rollDur
        click(ac, out, t + elapsed, {
          gain: 0.024 + 0.01 * prog, // present from the off, a touch crisper as it slows
          from: 2400 - 600 * prog,
          to: 1400 - 320 * prog,
          dur: 0.008,
          body: 520 - 100 * prog, // warm woody body, not metallic
          bodyGain: 0.014,
        })
        const velocity = Math.max(0.12, Math.pow(1 - prog, 1.5))
        elapsed += 0.075 / velocity // ~13 taps/s at speed → distinct ball taps, not a whir
      }
      // the settle: rounded WOODEN bounces spread across the visual drop, decaying
      // and closing in — a warm triangle tap + a soft click edge (no metal ring).
      const bounces = [0, 0.22, 0.4, 0.55, 0.67, 0.77, 0.86]
      bounces.forEach((f, i) => {
        const at = t + rollDur + f * dropDur
        const g = 0.12 * Math.pow(0.76, i)
        tone(ac, out, at, { freq: 440 - i * 26, to: 250 - i * 14, dur: 0.06, type: 'triangle', gain: g, attack: 0.001 })
        noise(ac, out, at, { dur: 0.015, gain: g * 0.4, from: 2200, to: 700, type: 'bandpass' })
      })
      // the final plunk as it nestles into the pocket — lands with the visual settle
      const home = t + rollDur + dropDur * 0.98
      tone(ac, out, home, { freq: 190, to: 112, dur: 0.13, type: 'sine', gain: 0.09, attack: 0.004 })
      tone(ac, out, home, { freq: 360, to: 232, dur: 0.07, type: 'triangle', gain: 0.04, attack: 0.002 })
      break
    }
    case 'dice': {
      // a soft but satisfying tumble of the dice: a brief rolling skitter, then a
      // handful of woody taps as the die bounces and settles, each rounder and
      // quieter than the last. Richer and more present than a bare tap, yet still
      // gentle — a satisfying roll, never a punch.
      noise(ac, out, t, { dur: 0.14, gain: 0.05, from: 1200, to: 360, type: 'lowpass', attack: 0.02 }) // rolling skitter
      click(ac, out, t, { gain: 0.09, from: 1600, to: 700, body: 300, bodyGain: 0.06 })
      click(ac, out, t + 0.045, { gain: 0.078, from: 1420, to: 620, body: 258, bodyGain: 0.052 })
      click(ac, out, t + 0.095, { gain: 0.06, from: 1240, to: 560, body: 224, bodyGain: 0.045 })
      click(ac, out, t + 0.15, { gain: 0.045, from: 1080, to: 500, body: 198, bodyGain: 0.038 })
      click(ac, out, t + 0.205, { gain: 0.03, from: 940, to: 440, body: 176, bodyGain: 0.03 }) // settle
      break
    }
    case 'diceroll': {
      // three dice tumbling across the felt for the WHOLE roll, then coming to rest.
      // Over `durationMs`: (1) a continuous low rattle/skitter that dulls as the dice
      // slow; (2) a train of little woody knocks (dice clacking on the felt / each
      // other) whose gaps GROW as the tumble loses speed — like the 'spin'/'roulette'
      // decelerations; (3) a few rounded settling taps as they nestle to a stop. The
      // landing taps fall near the end so they coincide with the dice visually resting.
      const dur = Math.max(0.3, (options.durationMs ?? 900) / 1000)
      const rollDur = dur * 0.86
      noise(ac, out, t, { dur: rollDur, gain: 0.05, from: 1500, to: 360, type: 'lowpass', attack: 0.04 }) // the rattle bed
      let elapsed = 0
      while (elapsed < rollDur) {
        const prog = elapsed / rollDur
        click(ac, out, t + elapsed, {
          gain: 0.05 + 0.02 * (1 - prog), // a touch louder while fast, mellowing as it slows
          from: 2200 - 650 * prog,
          to: 1100 - 280 * prog,
          dur: 0.009,
          body: 320 - 80 * prog, // warm woody knock, not metallic
          bodyGain: 0.03,
        })
        const velocity = Math.max(0.14, Math.pow(1 - prog, 1.45))
        elapsed += 0.05 / velocity // ~20 knocks/s at speed → slowing to a saunter
      }
      // the dice settling — a few rounded taps closing in, each quieter than the last
      const settle = [0, 0.07, 0.13]
      settle.forEach((dt, i) => {
        const at = t + rollDur + dt
        const g = Math.pow(0.78, i)
        tone(ac, out, at, { freq: 360 - i * 28, to: 200 - i * 12, dur: 0.06, type: 'triangle', gain: 0.1 * g, attack: 0.001 })
        noise(ac, out, at, { dur: 0.018, gain: 0.045 * g, from: 1900, to: 600, type: 'bandpass' })
      })
      break
    }
    case 'click': {
      // a soft, satisfying "tock" — a rounded mechanical click, not a thump. A
      // brief muffled contact transient gives the attack, a quick pitched body
      // drops to make a pleasing woody pop, and a faint crisp tick sits on top
      // for definition. Kept gentle so it feels premium, never abrasive.
      noise(ac, out, t, { dur: 0.018, gain: 0.1, from: 2200, to: 900, type: 'bandpass' }) // contact
      noise(ac, out, t, { dur: 0.03, gain: 0.05, from: 700, to: 200, type: 'lowpass' }) // soft body
      tone(ac, out, t, { freq: 540, to: 300, dur: 0.05, type: 'sine', gain: 0.14, attack: 0.001 }) // woody pop
      tone(ac, out, t, { freq: 1300, dur: 0.016, type: 'sine', gain: 0.04, attack: 0.0008 }) // crisp tick
      break
    }
    case 'coin': {
      // a coin flicked off the thumb into a spin — a light, bright metallic "ting"
      // with a quick inharmonic shimmer above it and a soft body for a little
      // weight, then gone. Interactive and crisp, never a dramatic clang.
      noise(ac, out, t, { dur: 0.014, gain: 0.05, from: 4400, to: 2600, type: 'bandpass' }) // the flick
      tone(ac, out, t, { freq: 2040, dur: 0.16, type: 'triangle', gain: 0.07, attack: 0.001 }) // metallic ring
      tone(ac, out, t, { freq: 3160, dur: 0.1, type: 'triangle', gain: 0.028, attack: 0.001 }) // inharmonic shimmer
      tone(ac, out, t, { freq: 760, to: 560, dur: 0.06, type: 'sine', gain: 0.04, attack: 0.002 }) // a touch of body
      break
    }
    case 'win': {
      // a warm, rewarding major arpeggio: C5 E5 G5 C6. Soft sine tones with an
      // eased attack and a long, blooming ring — generous and celebratory, never
      // piercing. A quiet low C4 underneath gives it warmth and body so the win
      // feels satisfying rather than thin.
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) =>
        tone(ac, out, t, {
          freq: f,
          dur: 0.34,
          type: 'sine',
          gain: 0.16,
          delay: i * 0.075,
          attack: 0.025,
        }),
      )
      // soft warm root, an octave below, blooms under the arpeggio for body
      tone(ac, out, t, { freq: 261.63, dur: 0.5, type: 'sine', gain: 0.08, attack: 0.04 })
      break
    }
    case 'lose': {
      // understated and neutral — a soft "noted, next round" blip, NOT a sad descent.
      // The drama came from the downward melodic glide, so this stays almost flat in
      // pitch (a barely-there settle) and leans on a soft muffled body so it reads as
      // a gentle tactile cue rather than a letdown. Short, quiet, unemotional.
      tone(ac, out, t, { freq: 290, to: 274, dur: 0.16, type: 'sine', gain: 0.075, attack: 0.022 }) // soft mid note, barely settles
      tone(ac, out, t, { freq: 146, dur: 0.15, type: 'sine', gain: 0.04, attack: 0.028 }) // flat warm body
      noise(ac, out, t, { dur: 0.05, gain: 0.025, from: 600, to: 200, type: 'lowpass', attack: 0.01 }) // soft muffled puff
      break
    }
    case 'boom': {
      // a loss that lands like a pillow, not a punch. The old version had a sharp
      // sub-bass transient (fast attack, gain 0.4) that hit hard; this is a soft,
      // heavily muffled thud — slow attack removes the punch, the lowpass keeps it
      // warm and round, and a faint breath of noise gives it body without a crack.
      noise(ac, out, t, { dur: 0.3, gain: 0.07, from: 520, to: 90, type: 'lowpass' })
      tone(ac, out, t, { freq: 110, to: 62, dur: 0.4, type: 'sine', gain: 0.16, attack: 0.05 })
      tone(ac, out, t, { freq: 220, to: 140, dur: 0.3, type: 'sine', gain: 0.05, delay: 0.02, attack: 0.05 })
      break
    }
    case 'car': {
      // the bust — a car barrels down the lane and drives straight THROUGH. A
      // heavy engine roars in fast and Dopplers past (pitch up on approach, down
      // as it recedes) over an airy road rush, a brief tyre screech bites just
      // before contact, then a dull body-impact thud as it runs through. Rounded
      // tones keep it forceful but never piercing.
      noise(ac, out, t, { dur: 0.5, gain: 0.12, from: 1100, to: 220, type: 'lowpass', attack: 0.05 }) // air/road rush
      tone(ac, out, t, { freq: 130, to: 300, dur: 0.2, type: 'sawtooth', gain: 0.055, attack: 0.02 }) // engine grit, approaching
      tone(ac, out, t, { freq: 150, to: 330, dur: 0.2, type: 'triangle', gain: 0.11, attack: 0.02 }) // approach body
      tone(ac, out, t, { freq: 320, to: 120, dur: 0.32, type: 'triangle', gain: 0.1, delay: 0.2, attack: 0.01 }) // recede
      tone(ac, out, t, { freq: 58, to: 46, dur: 0.55, type: 'sine', gain: 0.1, attack: 0.03 }) // low engine rumble
      noise(ac, out, t + 0.03, { dur: 0.17, gain: 0.045, from: 3200, to: 2100, type: 'bandpass' }) // tyre screech
      tone(ac, out, t + 0.16, { freq: 96, to: 52, dur: 0.26, type: 'sine', gain: 0.15, attack: 0.004 }) // impact thud
      noise(ac, out, t + 0.16, { dur: 0.12, gain: 0.07, from: 700, to: 150, type: 'lowpass' }) // thud body
      break
    }
    case 'crash': {
      // a hard collision: a sharp metallic crunch transient, a heavy low impact
      // thud for weight, a brief mid clank/metal ring, and a scatter of glass
      // tinkle in the tail. Layered over the 'car' vroom it reads as a real smash.
      noise(ac, out, t, { dur: 0.16, gain: 0.34, from: 3400, to: 600, type: 'bandpass' }) // metal crunch
      noise(ac, out, t, { dur: 0.1, gain: 0.2, from: 1500, to: 260, type: 'lowpass' }) // crumple body
      tone(ac, out, t, { freq: 96, to: 50, dur: 0.36, type: 'sine', gain: 0.26, attack: 0.001 }) // heavy thud
      tone(ac, out, t, { freq: 230, to: 120, dur: 0.16, type: 'triangle', gain: 0.1, attack: 0.001 }) // mid clank
      tone(ac, out, t, { freq: 720, to: 520, dur: 0.12, type: 'square', gain: 0.045, delay: 0.012 }) // metal ring
      // glass tinkle — quick high chips scattering just after the impact
      noise(ac, out, t + 0.04, { dur: 0.03, gain: 0.06, from: 6200, to: 4400, type: 'bandpass' })
      tone(ac, out, t, { freq: 3300, dur: 0.05, type: 'sine', gain: 0.04, delay: 0.05 })
      tone(ac, out, t, { freq: 2600, dur: 0.05, type: 'sine', gain: 0.035, delay: 0.085 })
      tone(ac, out, t, { freq: 3900, dur: 0.04, type: 'sine', gain: 0.03, delay: 0.12 })
      break
    }
    case 'pump': {
      // air being pushed into the balloon: a breathy gust that SWELLS in (soft
      // attack) rather than snapping, with the low-pass opening upward as the air
      // rushes in and pressure builds — a satisfying "whoooomf," not a sharp pew.
      // A faint pitched body bends up underneath, like the rubber tightening, and
      // the whole thing rides higher the fuller the balloon gets (`step`).
      const step = Math.min(options.step ?? 0, 24)
      const tight = 1 + step * 0.05 // fuller balloon → tauter, higher in pitch
      // the body of the air — soft, round, opening from muffled to airy
      noise(ac, out, t, { dur: 0.34, gain: 0.16, from: 240 * tight, to: 820 * tight, type: 'lowpass', attack: 0.13 })
      // a wisp of higher "ffff" turbulence over it, also swelling in
      noise(ac, out, t, { dur: 0.3, gain: 0.035, from: 900 * tight, to: 1700 * tight, type: 'bandpass', attack: 0.1 })
      // the rubber stretching — a quiet pitched swell bending upward for body
      tone(ac, out, t, { freq: 130 * tight, to: 215 * tight, dur: 0.32, type: 'sine', gain: 0.06, attack: 0.09 })
      break
    }
    case 'pop': {
      // a literal, DEEP pop — like a cork or a finger popped out of a cheek. The
      // character is a round low body whose pitch snaps downward fast: that quick
      // glide is what makes the ear hear "pop" instead of a click. A sub thump
      // adds depth and a soft low puff of air rounds it off. No bright transient —
      // that high snap was the click.
      tone(ac, out, t, { freq: 220, to: 42, dur: 0.085, type: 'sine', gain: 0.46, attack: 0.003 }) // the deep pop body
      tone(ac, out, t, { freq: 108, to: 34, dur: 0.055, type: 'triangle', gain: 0.12, attack: 0.002 }) // a touch of edge so it speaks
      tone(ac, out, t, { freq: 60, to: 28, dur: 0.2, type: 'sine', gain: 0.26, attack: 0.002 }) // sub thump for depth
      noise(ac, out, t, { dur: 0.05, gain: 0.05, from: 340, to: 110, type: 'lowpass', attack: 0.005 }) // soft low air puff
      break
    }
  }
}

/* -------------------------- ambient traffic bed -------------------------- */
/**
 * A low, atmospheric city-street bed (used by Chicken Road). A faint, continuous
 * road rumble + wind sits far under everything, with the occasional car Doppler
 * past and a distant police siren drifting by. It is deliberately quiet —
 * realism, never a blaring loop. Start it when a round begins and stop it on
 * cash-out / bust / leaving the game. No-op when muted or without Web Audio.
 *
 * It connects through `master` like every cue, but unlike a one-shot it keeps
 * oscillators running, so the caller MUST stop it (and re-evaluate on mute).
 */
let traffic: { stop: () => void } | null = null

/** A single car Dopplering past: a soft low-passed road whoosh that swells in
 *  then recedes, with a gentle engine note bending up then down. Self-cleaning. */
function passingCar(ac: AudioContext, out: AudioNode, level: number): void {
  const t = ac.currentTime
  const bus = ac.createGain()
  bus.gain.value = level
  bus.connect(out)
  noise(ac, bus, t, { dur: 1.3, gain: 0.06, from: 360, to: 150, type: 'lowpass', attack: 0.45 }) // road rush
  tone(ac, bus, t, { freq: 70, to: 110, dur: 0.7, type: 'triangle', gain: 0.04, attack: 0.3 }) // approach
  tone(ac, bus, t, { freq: 110, to: 54, dur: 0.8, type: 'triangle', gain: 0.04, delay: 0.62, attack: 0.05 }) // recede
  bus.gain.setTargetAtTime(0.0001, t + 1.4, 0.2)
  setTimeout(() => bus.disconnect(), 2200)
}

/** A police siren a few blocks away — a soft two-tone wail through a lowpass that
 *  swells as it nears and fades as it passes. Kept quiet; it's distant. */
function distantSiren(ac: AudioContext, out: AudioNode): void {
  const t = ac.currentTime
  const g = ac.createGain()
  g.gain.value = 0.0001
  g.connect(out)
  g.gain.setTargetAtTime(0.05, t, 0.7) // approaches
  g.gain.setTargetAtTime(0.0001, t + 1.9, 0.6) // recedes
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1700 // muffled — it's blocks away
  lp.connect(g)
  const osc = ac.createOscillator()
  osc.type = 'triangle'
  const dur = 3.0
  const cyc = 0.62
  osc.frequency.setValueAtTime(740, t)
  let tt = t
  let hi = true
  while (tt < t + dur) {
    osc.frequency.linearRampToValueAtTime(hi ? 940 : 720, tt + cyc) // the wail
    hi = !hi
    tt += cyc
  }
  osc.connect(lp)
  osc.start(t)
  osc.stop(t + dur + 0.1)
  setTimeout(() => g.disconnect(), (dur + 1) * 1000)
}

/** A distant ice cream van jingle — a soft, lilting music-box phrase that swells
 *  in and fades as it passes. Quiet and brief, so it charms rather than annoys. */
function iceCreamJingle(ac: AudioContext, out: AudioNode): void {
  const t = ac.currentTime
  const bus = ac.createGain()
  bus.gain.value = 0.0001
  bus.connect(out)
  bus.gain.setTargetAtTime(0.8, t, 0.5) // drifts near
  // a gentle major phrase (C E G E G A G E) in music-box bell tones
  const melody = [523.25, 659.25, 783.99, 659.25, 783.99, 880.0, 783.99, 659.25]
  const stepDur = 0.26
  melody.forEach((f, i) => {
    const at = i * stepDur
    tone(ac, bus, t, { freq: f, dur: 0.22, type: 'triangle', gain: 0.05, delay: at, attack: 0.004 }) // bell body
    tone(ac, bus, t, { freq: f * 2, dur: 0.12, type: 'sine', gain: 0.016, delay: at, attack: 0.004 }) // octave shimmer
  })
  const span = melody.length * stepDur
  bus.gain.setTargetAtTime(0.0001, t + span * 0.7, 0.5) // fades as it rolls away
  setTimeout(() => bus.disconnect(), (span + 1.5) * 1000)
}

/** Start the ambient street bed (idempotent). Quiet road rumble + wind plus
 *  occasional passing cars, a distant siren, and the odd ice cream van jingle
 *  scheduled at irregular gaps. */
export function startTraffic(): void {
  if (!enabled) return
  const ac = audio()
  if (!ac || !master) return
  if (traffic) return
  const now = ac.currentTime

  const bed = ac.createGain()
  bed.gain.value = 0.0001
  bed.connect(master)
  bed.gain.setTargetAtTime(1, now, 0.8) // gentle fade-in

  // continuous low road rumble — two detuned saws through a heavy lowpass
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 180
  const rumble = ac.createGain()
  rumble.gain.value = 0.05
  lp.connect(rumble).connect(bed)
  const oscA = ac.createOscillator()
  oscA.type = 'sawtooth'
  oscA.frequency.value = 46
  const oscB = ac.createOscillator()
  oscB.type = 'sawtooth'
  oscB.frequency.value = 52
  oscA.connect(lp)
  oscB.connect(lp)
  oscA.start(now)
  oscB.start(now)

  // faint wind / road hiss — looping noise through a bandpass
  const len = Math.floor(ac.sampleRate * 2)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const wind = ac.createBufferSource()
  wind.buffer = buf
  wind.loop = true
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 500
  bp.Q.value = 0.6
  const windGain = ac.createGain()
  windGain.gain.value = 0.015
  wind.connect(bp).connect(windGain).connect(bed)
  wind.start(now)

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = () => {
    if (stopped) return
    const cur = audio()
    if (cur && enabled) {
      const r = Math.random()
      if (r < 0.08) iceCreamJingle(cur, bed) // occasional ice cream van
      else if (r < 0.26) distantSiren(cur, bed)
      else passingCar(cur, bed, 0.5 + Math.random() * 0.5)
    }
    timer = setTimeout(tick, 2400 + Math.random() * 4200) // irregular gaps
  }
  timer = setTimeout(tick, 1200 + Math.random() * 1600)

  traffic = {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      const tt = ac.currentTime
      bed.gain.setTargetAtTime(0.0001, tt, 0.2) // fade out
      const off = tt + 0.8
      try {
        oscA.stop(off)
        oscB.stop(off)
        wind.stop(off)
      } catch {
        /* already stopped */
      }
      setTimeout(() => bed.disconnect(), 1100)
    },
  }
}

/** Stop the ambient street bed (no-op if not running). */
export function stopTraffic(): void {
  if (!traffic) return
  traffic.stop()
  traffic = null
}
