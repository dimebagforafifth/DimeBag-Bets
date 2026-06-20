// @vitest-environment happy-dom
/**
 * The splits surfaces mount on the live stores and read-only projections: the console tile
 * (empty + populated, Esc → onBack), the CLV-beat card (honest labels), and the player Splits
 * section (most-bet list over recorded bets). The manifest + section descriptors are the shapes
 * the registries expect. No money moves.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { __resetBets, recordBet, type BookBet } from '../../app/book/bets-store.js'
import type { SlipLeg } from '../../app/book/slip.js'
import { __resetCommunitySettings } from '../../profile/community-settings.js'
import { splitsManifests } from '../manifest.js'
import { splitsSection } from '../index.js'
import { SplitsConsolePanel } from './SplitsConsolePanel.js'
import { ClvBeatCard } from './ClvBeatCard.js'
import { SplitsSection } from './SplitsSection.js'
import { MarketSplitBar } from './MarketSplitBar.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}
function mount(node: React.ReactNode): { h: HTMLDivElement; root: Root } {
  const h = host()
  const root = createRoot(h)
  act(() => root.render(node))
  return { h, root }
}
function unmount(root: Root, h: HTMLElement) {
  act(() => root.unmount())
  h.remove()
}
function pressEscape() {
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
}

const leg = (marketId: string, side: string): SlipLeg => ({
  key: `${marketId}:${side}`,
  eventId: 'e1',
  eventLabel: 'Suns @ Lakers',
  leagueId: 'NBA',
  marketId,
  marketType: 'moneyline',
  marketPeriod: 'game',
  side,
  pick: side === 'home' ? 'Lakers' : 'Suns',
  price: { american: -110, decimal: 1.91 },
  sport: 'BASKETBALL',
  trueProb: 0.55,
})
const bet = (id: string, accountId: string, marketId: string, side: string): BookBet => ({
  id,
  accountId,
  playerName: accountId,
  placedBy: accountId,
  mode: 'single',
  legs: [leg(marketId, side)],
  stakeCents: 1_000,
  decimal: 1.91,
  status: 'open',
  placedAt: 0,
})

beforeEach(() => {
  __resetBets()
  __resetCommunitySettings()
})
afterEach(() => {
  __resetBets()
  __resetCommunitySettings()
})

describe('manifest + section descriptors', () => {
  it('exposes one console tile under players', () => {
    expect(splitsManifests).toHaveLength(1)
    expect(splitsManifests[0].key).toBe('betting-splits')
    expect(splitsManifests[0].section).toBe('players')
  })

  it('exposes the player Splits section descriptor', () => {
    expect(splitsSection.key).toBe('splits')
    expect(splitsSection.roles).toContain('player')
    expect(typeof splitsSection.render).toBe('function')
  })
})

describe('SplitsConsolePanel', () => {
  it('shows the empty state with no action and wires Escape → onBack', () => {
    let backs = 0
    const { h, root } = mount(<SplitsConsolePanel onBack={() => (backs += 1)} />)
    expect(h.textContent).toContain('Betting Splits')
    expect(h.textContent).toContain('No recorded action yet')
    pressEscape()
    expect(backs).toBe(1)
    unmount(root, h)
  })

  it('lists a market once action is recorded', () => {
    recordBet(bet('b1', 'p-marco', 'm1', 'home'))
    recordBet(bet('b2', 'p-lena', 'm1', 'away'))
    const { h, root } = mount(<SplitsConsolePanel onBack={() => {}} />)
    expect(h.textContent).toContain('Suns @ Lakers')
    expect(h.textContent).toContain('Most-bet markets')
    unmount(root, h)
  })
})

describe('ClvBeatCard', () => {
  it('renders both honestly-labelled signals', () => {
    const { h, root } = mount(<ClvBeatCard accountId="p-marco" now={1_750_000_000_000} />)
    expect(h.textContent).toContain('Beats the close (CLV)')
    expect(h.textContent).toContain('Value vs price taken')
    unmount(root, h)
  })
})

describe('SplitsSection', () => {
  it('renders the most-bet list over recorded bets', () => {
    recordBet(bet('b1', 'p-marco', 'm1', 'home'))
    const { h, root } = mount(<SplitsSection viewerId="mgr" playerId="p-marco" role="manager" />)
    expect(h.textContent).toContain('Betting Splits')
    expect(h.textContent).toContain('Most-bet markets')
    expect(h.textContent).toContain('Suns @ Lakers')
    unmount(root, h)
  })

  it('shows an empty state with no action', () => {
    const { h, root } = mount(<SplitsSection viewerId="p-dana" playerId="p-dana" role="player" />)
    expect(h.textContent).toContain('No action')
    unmount(root, h)
  })
})

describe('MarketSplitBar (the inline book-view SEAM)', () => {
  it('renders the per-side lean for a market with action', () => {
    recordBet(bet('b1', 'p-marco', 'm9', 'home'))
    recordBet(bet('b2', 'p-lena', 'm9', 'home'))
    recordBet(bet('b3', 'p-dana', 'm9', 'away'))
    const { h, root } = mount(<MarketSplitBar marketId="m9" viewerId="mgr" scope="global" />)
    expect(h.textContent).toContain('bets')
    expect(h.textContent).toContain('handle')
    // 2 home / 1 away → 67% / 33% bets, displayed integers sum to 100
    expect(h.textContent).toContain('67% bets')
    expect(h.textContent).toContain('33% bets')
    unmount(root, h)
  })

  it('shows a quiet empty state for a market with no action', () => {
    const { h, root } = mount(<MarketSplitBar marketId="nope" viewerId="mgr" scope="global" />)
    expect(h.textContent).toContain('No action yet')
    unmount(root, h)
  })
})
