import { useSyncExternalStore } from 'react'
import { isSoundEnabled, subscribeSound, toggleSound } from './engine.js'
import './sound.css'

/** Subscribe a component to the shared mute state. */
export function useSoundEnabled(): boolean {
  // server snapshot is `true` (matches the default), though this app is client-only.
  return useSyncExternalStore(subscribeSound, isSoundEnabled, () => true)
}

/** The header speaker button — the single, honest control for all game audio. */
export function SoundToggle() {
  const on = useSoundEnabled()
  return (
    <button
      className={`sound-toggle ${on ? 'is-on' : ''}`}
      onClick={toggleSound}
      aria-pressed={on}
      aria-label={on ? 'Mute sounds' : 'Unmute sounds'}
      title={on ? 'Sound on' : 'Sound off'}
    >
      {on ? <SpeakerOn /> : <SpeakerOff />}
    </button>
  )
}

function SpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 9.5l5 5M21 9.5l-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
