// @vitest-environment happy-dom
/** The setup wizard applies a preset's house + risk config through the public setters
 *  (no money moves) and records that setup ran. */
import { describe, expect, it, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getRtp, resetRtp } from '../edge-store.js'
import { nativeRtp } from '../edge-config.js'
import { bpsToRtp, clampEdgeBps, rtpToBps } from '../game-edge-config.js'
import {
  getSettings,
  setDefaultCreditLimit,
  setRiskCreditUtil,
  setRiskExposureCap,
  setSettlementPeriodDays,
} from '../settings-store.js'
import { SetupWizard } from './SetupWizard.js'
import { adjustableGameKeys, PRESETS } from './presets.js'
import { getSetup, __resetSetup } from './setup-store.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: ReturnType<typeof createRoot>
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  // Restore config singletons so this file can't leak into others.
  adjustableGameKeys().forEach((k) => resetRtp(k))
  setRiskCreditUtil(0.8)
  setRiskExposureCap(null)
  setDefaultCreditLimit(20_000)
  setSettlementPeriodDays(7)
  __resetSetup()
})

const byText = (text: string | RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''),
  )!

describe('SetupWizard applies presets', () => {
  it('applying Aggressive sets RTP, risk thresholds, credit, and cadence', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(<SetupWizard />))

    // Step 1: choose Aggressive (a radio card in the preset grid).
    const aggressive = [...host.querySelectorAll<HTMLButtonElement>('.con-preset')].find(
      (b) => b.querySelector('.con-preset-name')?.textContent === 'Aggressive',
    )!
    act(() => aggressive.click())
    // Step 2: review.
    act(() => byText(/Review/).click())
    // Step 3: apply.
    act(() => byText(/Apply/).click())

    const p = PRESETS.aggressive
    // House edge applied to every adjustable game (real payout math via the edge store). The
    // preset RTP is now clamped into each game's PER-GAME edge band (PART 2): most games take
    // 0.95 as-is, but a high-floor game (e.g. keno, min 15% edge) settles at its band floor.
    for (const key of adjustableGameKeys()) {
      const expected = bpsToRtp(clampEdgeBps(key, rtpToBps(p.rtp)))
      expect(getRtp(key, nativeRtp(key))).toBe(expected)
    }
    // Risk + operational settings applied.
    const s = getSettings()
    expect(s.riskCreditUtil).toBe(p.creditUtil) // 0.9
    expect(s.riskExposureCap).toBe(p.exposureCap) // null (off)
    expect(s.defaultCreditLimit).toBe(p.defaultCreditLimit) // 50_000
    expect(s.settlementPeriodDays).toBe(p.settlementPeriodDays) // 14

    // Setup recorded; the done step shows.
    expect(getSetup().completed).toBe(true)
    expect(getSetup().preset).toBe('aggressive')
    expect(host.textContent).toContain('applied')
  })
})
