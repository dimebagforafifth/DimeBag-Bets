import { useSyncExternalStore } from 'react'
import { GAMES } from './games.js'
import { getSettingsVersion, isGameEnabled, setGameEnabled, subscribeSettings } from './settings-store.js'
import './games-panel.css'

/**
 * Enable / disable games for the book (CLAUDE.md §4). A disabled game drops out of the
 * casino lobby and can't be played (App's liveGame guard). The on/off state lives in
 * app/settings-store; this panel is the manager toggle. Moves no money.
 */
export function GamesPanel() {
  useSyncExternalStore(subscribeSettings, getSettingsVersion)
  const enabled = GAMES.filter((g) => isGameEnabled(g.key)).length
  return (
    <section className="games-panel">
      <div className="gp-head">
        <h2 className="gp-title">Games</h2>
        <p className="gp-sub">
          Turn games on or off for the book — {enabled}/{GAMES.length} enabled.
        </p>
      </div>
      <div className="gp-grid">
        {GAMES.map((g) => {
          const on = isGameEnabled(g.key)
          return (
            <button
              key={g.key}
              className={`gp-row ${on ? 'is-on' : 'is-off'}`}
              aria-pressed={on}
              onClick={() => setGameEnabled(g.key, !on)}
            >
              <span className="gp-name">{g.name}</span>
              <span className={`gp-state ${on ? 'is-on' : 'is-off'}`}>{on ? 'On' : 'Off'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
