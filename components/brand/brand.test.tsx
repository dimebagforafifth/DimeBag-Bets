// @vitest-environment happy-dom
/**
 * The PlayStadium brand molecules: prop-driven, token-themed, and composing the
 * real ui primitives. These tests pin the behaviour that screens rely on — the
 * wallet trend arrow/colour, odds selection state, the bet-slip parlay math and
 * empty state, badge/chip variants, and the wordmark.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  Wordmark,
  ChipLogo,
  BrandBadge,
  BrandChip,
  Stat,
  WalletPill,
  GameCard,
  OddsButton,
  EventRow,
  BetSlip,
  type BetSelection,
} from './index'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
const render = (node: React.ReactNode) => act(() => root.render(node))
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())

describe('Wordmark + ChipLogo', () => {
  it('renders the PlayStadium.io wordmark with a gold dot', () => {
    render(<Wordmark />)
    const mark = host.querySelector('.ps-wordmark')
    expect(mark?.textContent).toBe('PlayStadium.io')
    expect(mark?.querySelector('.ps-wordmark__dot')?.textContent).toBe('.')
  })
  it('renders the chip logo as a pixelated image with the base-aware src', () => {
    render(<ChipLogo size={40} />)
    const img = host.querySelector('img.ps-chip') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toContain('brand/playstadium-chip-logo.png')
    expect(img.getAttribute('alt')).toBe('PlayStadium.io')
  })
})

describe('WalletPill', () => {
  it('shows an up arrow + green tone when the week is positive', () => {
    render(<WalletPill balance="$8,420" weekCents={2400} />)
    const week = host.querySelectorAll('.sds-wallet__value')[1]
    expect(week.classList.contains('is-up')).toBe(true)
    expect(week.textContent).toContain('▲')
    expect(week.textContent).toContain('$24.00')
  })
  it('shows a down arrow + red tone when the week is negative', () => {
    render(<WalletPill balance="$8,420" weekCents={-320} />)
    const week = host.querySelectorAll('.sds-wallet__value')[1]
    expect(week.classList.contains('is-down')).toBe(true)
    expect(week.textContent).toContain('▼')
  })
  it('reads "Even" with the even tone at zero', () => {
    render(<WalletPill balance="$8,420" weekCents={0} />)
    const week = host.querySelectorAll('.sds-wallet__value')[1]
    expect(week.classList.contains('is-even')).toBe(true)
    expect(week.textContent).toBe('Even')
  })
})

describe('Badge + Chip', () => {
  it('applies the requested badge variant', () => {
    render(<BrandBadge variant="live">Live</BrandBadge>)
    const b = host.querySelector('.sds-badge')
    expect(b?.classList.contains('sds-badge--live')).toBe(true)
    expect(b?.textContent).toBe('Live')
  })
  it('reflects active state via aria-pressed and fires onClick', () => {
    let hits = 0
    render(
      <BrandChip active onClick={() => (hits += 1)}>
        2×
      </BrandChip>,
    )
    const chip = host.querySelector('.sds-chip') as HTMLButtonElement
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.getAttribute('type')).toBe('button')
    click(chip)
    expect(hits).toBe(1)
  })
})

describe('Stat', () => {
  it('paints the value gold when hot', () => {
    render(<Stat label="Multiplier" value="2.40×" hot />)
    expect(host.querySelector('.sds-stat__value')?.classList.contains('is-hot')).toBe(true)
    expect(host.querySelector('.sds-stat__label')?.textContent).toBe('Multiplier')
  })
})

describe('GameCard', () => {
  it('renders the 3D icon, name, tag and the Play affordance', () => {
    render(<GameCard name="Mines" tag="Find the gems" icon="/game-icons/mines.png" iconAlt="Mines" />)
    expect(host.querySelector('.sds-gamecard__name')?.textContent).toBe('Mines')
    expect(host.querySelector('.sds-gamecard__tag')?.textContent).toBe('Find the gems')
    const img = host.querySelector('.sds-gamecard__art img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/game-icons/mines.png')
    expect(host.querySelector('.sds-gamecard__play')?.textContent).toBe('Play →')
  })
})

describe('OddsButton', () => {
  it('marks selection via aria-pressed and renders a drift arrow', () => {
    render(<OddsButton label="Lakers" price="-110" selected move="up" />)
    const btn = host.querySelector('.sds-odds') as HTMLButtonElement
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.sds-odds__price')?.textContent).toBe('-110')
    expect(host.querySelector('.sds-odds__move')?.textContent).toBe('▲')
  })
  it('fires onPick through EventRow market columns', () => {
    let picked = ''
    render(
      <EventRow
        league="NBA"
        time="7:30 PM"
        home={{ name: 'Lakers', sport: 'NBA' }}
        away="Celtics"
        markets={[
          {
            heading: 'ML',
            options: [
              { id: 'lal', label: 'LAL', price: '-110' },
              { id: 'bos', label: 'BOS', price: '+120' },
            ],
          },
        ]}
        onPick={(o) => (picked = o.id)}
      />,
    )
    const odds = host.querySelectorAll('.sds-odds')
    expect(odds).toHaveLength(2)
    click(odds[1])
    expect(picked).toBe('bos')
  })
})

describe('BetSlip', () => {
  const legs: BetSelection[] = [
    { id: 'a', pick: 'Lakers -3.5', event: 'LAL @ BOS', price: 2.0 },
    { id: 'b', pick: 'Over 220.5', event: 'LAL @ BOS', price: 1.5 },
  ]
  it('shows the empty state with no selections', () => {
    render(<BetSlip selections={[]} />)
    expect(host.querySelector('.sds-slip__empty')).not.toBeNull()
    expect(host.querySelector('.sds-slip__count')).toBeNull()
  })
  it('computes parlay return = stake × combined odds', () => {
    render(<BetSlip selections={legs} stake={100} mode="parlay" />)
    // combined = 2.0 * 1.5 = 3.00 → return = 100 * 3 = 300
    const ret = host.querySelector('.sds-slip__row--return .v')
    expect(ret?.textContent).toBe('300 pts')
    expect(host.querySelector('.sds-slip__count')?.textContent).toBe('2')
  })
  it('computes singles return = sum of stake × each odds', () => {
    render(<BetSlip selections={legs} stake={100} mode="single" />)
    // 100*2.0 + 100*1.5 = 350
    expect(host.querySelector('.sds-slip__row--return .v')?.textContent).toBe('350 pts')
  })
  it('fires onPlace via the composed ui Button', () => {
    let placed = 0
    render(<BetSlip selections={legs} stake={50} onPlace={() => (placed += 1)} />)
    const place = [...host.querySelectorAll('button')].find((b) =>
      /Place bet/.test(b.textContent ?? ''),
    )
    click(place)
    expect(placed).toBe(1)
  })
  it('removes a selection', () => {
    let removed = ''
    render(<BetSlip selections={legs} onRemove={(s) => (removed = s.id)} />)
    click(host.querySelector('.sds-pick__x'))
    expect(removed).toBe('a')
  })
})
