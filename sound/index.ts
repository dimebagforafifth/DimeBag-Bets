/**
 * Public surface of the shared sound module (CLAUDE.md §5). Game UIs and the
 * shell import from here — never copy this logic. `play()` emits a cue; the
 * shell mounts <SoundToggle/> for the one mute control.
 */

export { play, isSoundEnabled, setSoundEnabled, toggleSound, subscribeSound } from './engine.js'
export type { SoundName, PlayOptions } from './engine.js'
export { SoundToggle, useSoundEnabled } from './SoundToggle.js'
