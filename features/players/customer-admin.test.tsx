// @vitest-environment happy-dom
/** Customer Admin — the player grid: inline + bulk credit edit, move-between-agents,
 *  status, and login STATUS + reset (never a plaintext password). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getBook } from '../../app/book-store.js'
import { toCents } from '../../games/shared/money.js'
import { setActiveEconomyTenant, setEconomyPolicy, __resetEconomy } from '../../core/index.js'
import { __resetEconomyConfig } from '../../app/economy-config.js'
import { credentialStatus, __resetDemoAuth, __resetCredentialRequests } from '../../auth/index.js'
import { CustomerAdminPanel } from './CustomerAdminPanel.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}
function setValue(el: HTMLInputElement | HTMLSelectElement, v: string) {
  const proto = Object.getPrototypeOf(el)
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}
function btn(h: HTMLElement, text: string): HTMLButtonElement {
  const b = [...h.querySelectorAll<HTMLButtonElement>('button')].find(
    (x) => x.textContent?.trim() === text,
  )
  if (!b) throw new Error(`no button "${text}"`)
  return b
}
function mount(): { h: HTMLDivElement; root: Root } {
  const h = host()
  const root = createRoot(h)
  act(() => root.render(<CustomerAdminPanel onBack={() => {}} />))
  return { h, root }
}

/** Flip the active book to the wallet economy money-neutrally (no migration, no money moved) —
 *  enough for the UI to relabel. Reset in afterEach so credit-mode tests stay on the default. */
function setBalanceMode() {
  setActiveEconomyTenant('default')
  setEconomyPolicy({ mode: 'balance', balanceFloorCents: 0 }, 'default')
}

beforeEach(() => {
  __resetDemoAuth()
  __resetCredentialRequests()
})
afterEach(() => {
  __resetEconomyConfig()
  __resetEconomy()
})

describe('Customer Admin grid', () => {
  it('lists players and shows a redacted login status — never a password field', () => {
    const { h, root } = mount()
    expect(h.textContent).toContain('Marco')
    expect(h.textContent).toContain('Lena')
    // Login column is status-only.
    expect(h.textContent).toContain('Login set') // Marco has a seeded login
    expect(h.textContent).toContain('No login') // Lena has none
    // Hard rule: a password is NEVER rendered.
    expect(h.querySelector('input[type="password"]')).toBeNull()
    expect(h.textContent).not.toContain('demo') // the demo password constant
    act(() => root.unmount())
    h.remove()
  })

  it('bulk-sets a credit line across the selection through org.setCreditLimit', () => {
    const { h, root } = mount()
    act(() => h.querySelector<HTMLInputElement>('input[aria-label="Select Marco"]')!.click())
    const credit = h.querySelector<HTMLInputElement>('input[aria-label="Bulk credit amount"]')!
    act(() => setValue(credit, '1000'))
    act(() => btn(h, 'Set credit').click())
    expect(getBook().members['p-marco'].account.creditLimit).toBe(toCents(1000))
    act(() => root.unmount())
    h.remove()
  })

  it('moves a player to another agent through org.reassign', () => {
    const { h, root } = mount()
    const move = h.querySelector<HTMLSelectElement>('select[aria-label="Agent for Lena"]')!
    act(() => setValue(move, 'a-w')) // West Desk
    expect(getBook().members['p-lena'].parentId).toBe('a-w')
    act(() => root.unmount())
    h.remove()
  })

  it('locks an account through org.setActive', () => {
    const { h, root } = mount()
    const row = [...h.querySelectorAll('tr')].find((r) => r.textContent?.includes('Tariq'))!
    const status = [...row.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.className.includes('custadm-status'),
    )!
    expect(status.textContent).toBe('Active')
    act(() => status.click())
    expect(getBook().members['p-tariq'].active).toBe(false)
    act(() => root.unmount())
    h.remove()
  })

  it('sends a password reset for a member with a login (status only, no password)', async () => {
    const { h, root } = mount()
    const row = [...h.querySelectorAll('tr')].find((r) => r.textContent?.includes('Marco'))!
    const reset = [...row.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Send reset',
    )!
    expect(reset.disabled).toBe(false)
    await act(async () => {
      reset.click()
    })
    expect(credentialStatus('p-marco').resetPendingAt).not.toBeNull()
    expect(h.textContent).toContain('Reset sent')
    act(() => root.unmount())
    h.remove()
  })
})

describe('Customer Admin — economy mode framing', () => {
  it('credit mode (default) shows the credit-line column + figure framing', () => {
    const { h, root } = mount()
    const heads = [...h.querySelectorAll('thead th')].map((t) => t.textContent)
    expect(heads).toContain('Credit')
    expect(heads).toContain('Figure')
    expect(h.querySelector('.feat-sub')?.textContent).toMatch(/Edit a credit line/)
    act(() => root.unmount())
    h.remove()
  })

  it('balance mode hides the credit line + bulk-credit lever and reads the standing as a balance', () => {
    setBalanceMode()
    const { h, root } = mount()
    const heads = [...h.querySelectorAll('thead th')].map((t) => t.textContent)
    // No credit-only field: the credit-limit column is gone; the figure reads as a wallet balance.
    expect(heads).not.toContain('Credit')
    expect(heads).not.toContain('Figure')
    expect(heads).toContain('Balance')
    // The bulk-credit lever is a credit-only control — select a row, it must not appear.
    act(() => h.querySelector<HTMLInputElement>('input[aria-label="Select Marco"]')!.click())
    expect(h.querySelector('input[aria-label="Bulk credit amount"]')).toBeNull()
    expect(h.querySelector('.feat-sub')?.textContent).not.toMatch(/credit line/)
    act(() => root.unmount())
    h.remove()
  })
})
