// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { membersByRole } from '../../org/index.js'
import { getBook } from '../../app/book-store.js'
import { WeeklySheetPanel } from './WeeklySheetPanel.js'
import weeklySheetManifests from './manifest.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
})

function mount(onBack: () => void = () => {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<WeeklySheetPanel onBack={onBack} />))
  roots.push({ root, host })
  return host
}

const clickByText = (host: HTMLElement, re: RegExp) =>
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => re.test(b.textContent ?? ''))!
      .click(),
  )

describe('Weekly Sheet manifest', () => {
  it('exports the figures tile with the full contract shape', () => {
    expect(weeklySheetManifests.map((m) => m.key)).toEqual(['figures'])
    const m = weeklySheetManifests[0]
    expect(m.name).toBe('Weekly Sheet')
    expect(m.section).toBe('operations')
    expect(m.icon).toBeTruthy()
    expect(typeof m.Panel).toBe('function')
  })
})

describe('Weekly Sheet panel', () => {
  it('renders a themed body with the KPI strip and the by-day table', () => {
    const host = mount()
    expect(host.querySelector('.feat-panel')).toBeTruthy()
    expect(host.textContent).toContain('Book figure')
    expect(host.textContent).toContain('Players up')
    expect(host.textContent).toContain('Total exposure')
    // The seeded players render in the table.
    expect(host.querySelector('table.feat-table')).toBeTruthy()
    const players = membersByRole(getBook(), 'player')
    expect(players.length).toBeGreaterThan(0)
    expect(host.textContent).toContain(players[0].name)
    // Seven day columns + Player + Weekly total + Settle = 10 headers.
    const headers = host.querySelectorAll('thead th')
    expect(headers.length).toBe(10)
  })

  it('the Owes chip narrows to negative-figure players (or shows empty state)', () => {
    const host = mount()
    const owesPlayers = membersByRole(getBook(), 'player').filter((p) => p.account.balance < 0)
    const owedPlayer = membersByRole(getBook(), 'player').find((p) => p.account.balance > 0)

    clickByText(host, /^Owes$/)

    if (owesPlayers.length === 0) {
      expect(host.textContent).toContain('No players match this filter')
    } else {
      // every visible body row is a negative-figure player; a known positive one is gone
      for (const p of owesPlayers) expect(host.textContent).toContain(p.name)
      if (owedPlayer) {
        const rowNames = [...host.querySelectorAll('tbody tr td:first-child')].map(
          (td) => td.textContent,
        )
        expect(rowNames).not.toContain(owedPlayer.name)
      }
    }
  })

  it('renders an Export CSV button (and never auto-settles)', () => {
    const host = mount()
    const exportBtn = [...host.querySelectorAll('button')].find((b) =>
      /Export CSV/.test(b.textContent ?? ''),
    )
    expect(exportBtn).toBeTruthy()
    // The bulk-settle trigger exists but is left UN-clicked (would mutate the book).
    const settleBtn = [...host.querySelectorAll('button')].find((b) =>
      /Settle all/.test(b.textContent ?? ''),
    )
    expect(settleBtn).toBeTruthy()
  })

  it('the Settle all… trigger opens a confirm row (without confirming)', () => {
    const host = mount()
    clickByText(host, /Settle all/)
    expect(host.textContent).toMatch(/Confirm\?/)
    // Cancel out — we never click "Yes, settle now".
    clickByText(host, /Cancel/)
    expect(host.textContent).not.toMatch(/Confirm\?/)
  })
})
