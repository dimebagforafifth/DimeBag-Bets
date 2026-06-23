import { GamificationConfigPage } from '../gamification/index.js'
import './catalog.css'

/**
 * Rewards — missions, wheel, XP. Adapts the existing gamification operator config page
 * (prize pools, schedules, win probabilities) as-is; rewards pay as free play through
 * core. Self-contained body.
 */
export function RewardsPanel() {
  return (
    <div className="feat">
      <GamificationConfigPage />
    </div>
  )
}
