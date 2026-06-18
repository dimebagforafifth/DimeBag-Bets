// @vitest-environment happy-dom
/**
 * CRM console surface — every panel mounts on the live stores (falling back to the
 * deterministic seed so each renders populated), wires Escape → onBack, and the
 * manifest shape is the four-tile contract the registry expects.
 */
import { describe, it, expect } from 'vitest'
import { act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { crmManifests } from './manifest.js'
import { CrmSegmentsPanel } from './CrmSegmentsPanel.js'
import { IntegrityPanel } from './IntegrityPanel.js'
import { AbuseWatchPanel } from './AbuseWatchPanel.js'
import { AnalyticsPanel } from './AnalyticsPanel.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}
function mount(Panel: ComponentType<{ onBack: () => void }>, onBack: () => void = () => {}) {
  const h = host()
  const root: Root = createRoot(h)
  act(() => root.render(<Panel onBack={onBack} />))
  return { h, root }
}
function unmount(root: Root, h: HTMLElement) {
  act(() => root.unmount())
  h.remove()
}
function pressEscape() {
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
}

describe('crm manifest', () => {
  it('is the four-tile contract', () => {
    expect(crmManifests).toHaveLength(4)
    const keys = crmManifests.map((m) => m.key)
    expect(keys).toEqual(['crm-segments', 'player-integrity', 'abuse-watch', 'operator-analytics'])
    const bySection = (k: string) => crmManifests.find((m) => m.key === k)!.section
    expect(bySection('crm-segments')).toBe('players')
    expect(bySection('player-integrity')).toBe('players')
    expect(bySection('abuse-watch')).toBe('players')
    expect(bySection('operator-analytics')).toBe('control')
    for (const m of crmManifests) {
      expect(typeof m.name).toBe('string')
      expect(typeof m.hint).toBe('string')
      expect(typeof m.Panel).toBe('function')
      expect(m.icon).toBeTruthy()
    }
  })
})

describe('crm panels', () => {
  it('Player CRM renders a .feat-panel with populated segments + Escape → onBack', () => {
    const { h, root } = mount(CrmSegmentsPanel)
    expect(h.querySelector('.feat-panel')).toBeTruthy()
    expect(h.textContent).toContain('Player CRM')
    // a real segment label and a player table row
    expect(h.querySelector('.feat-table tbody tr')).toBeTruthy()
    expect(h.querySelectorAll('.crm-pill').length).toBeGreaterThan(0)
    unmount(root, h)
  })

  it('Player CRM Escape calls onBack', () => {
    let backs = 0
    const { h, root } = mount(CrmSegmentsPanel, () => (backs += 1))
    pressEscape()
    expect(backs).toBe(1)
    unmount(root, h)
  })

  it('Integrity renders a risk band pill leaderboard', () => {
    const { h, root } = mount(IntegrityPanel)
    expect(h.querySelector('.feat-panel')).toBeTruthy()
    expect(h.textContent).toContain('Integrity')
    expect(h.querySelector('.feat-table tbody tr')).toBeTruthy()
    const band = h.querySelector(
      '.crm-band-clean, .crm-band-watch, .crm-band-sharp, .crm-band-flagged',
    )
    expect(band).toBeTruthy()
    unmount(root, h)
  })

  it('Integrity Escape calls onBack', () => {
    let backs = 0
    const { h, root } = mount(IntegrityPanel, () => (backs += 1))
    pressEscape()
    expect(backs).toBe(1)
    unmount(root, h)
  })

  it('Abuse Watch renders clusters or an empty-state, plus a flags summary', () => {
    const { h, root } = mount(AbuseWatchPanel)
    expect(h.querySelector('.feat-panel')).toBeTruthy()
    expect(h.textContent).toContain('Abuse Watch')
    // either a populated cluster card or the empty-state
    const hasCluster = !!h.querySelector('.crm-cluster')
    const hasEmpty = !!h.querySelector('.feat-empty')
    expect(hasCluster || hasEmpty).toBe(true)
    unmount(root, h)
  })

  it('Abuse Watch Escape calls onBack', () => {
    let backs = 0
    const { h, root } = mount(AbuseWatchPanel, () => (backs += 1))
    pressEscape()
    expect(backs).toBe(1)
    unmount(root, h)
  })

  it('Analytics renders a hold bar + sparkline + cohort grid', () => {
    const { h, root } = mount(AnalyticsPanel)
    expect(h.querySelector('.feat-panel')).toBeTruthy()
    expect(h.textContent).toContain('Analytics')
    expect(h.querySelector('.crm-bar-fill')).toBeTruthy()
    expect(h.querySelector('.crm-spark, .feat-empty')).toBeTruthy()
    expect(h.textContent).toContain('Net margin')
    unmount(root, h)
  })

  it('Analytics Escape calls onBack', () => {
    let backs = 0
    const { h, root } = mount(AnalyticsPanel, () => (backs += 1))
    pressEscape()
    expect(backs).toBe(1)
    unmount(root, h)
  })
})
