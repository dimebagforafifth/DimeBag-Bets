// @vitest-environment happy-dom
/**
 * Branding, mounted in the manager console, actually RE-THEMES the running app.
 *
 * The page edits a draft and previews it live; on Save it commits through the
 * book-config store, which (a) overrides the theme's accent token `--gem` on
 * :root and (b) hydrates the shared money-display singleton that `formatMoney`
 * reads. This drives that whole path from the mounted Branding tab and asserts
 * both effects land app-wide — not just inside the page's own preview.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook, listPlayers } from './book-store.js'
import { ManagerConsole } from './ManagerConsole.js'
import { formatMoney } from '../games/shared/money.js'
import { resetMoneyDisplay } from '../games/shared/presentation.js'
import { bookConfigStore } from '../manager/branding/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Set a controlled input's value the way React's onChange expects. */
function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Branding re-themes the app (mounted in ManagerConsole)', () => {
  let host: HTMLElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    // Restore the shared singletons/token so this test can't leak into others.
    bookConfigStore.reset()
    resetMoneyDisplay()
  })

  it('Save applies the accent CSS token + money formatter app-wide', () => {
    act(() =>
      root.render(
        <ManagerConsole
          org={getBook()}
          onMutate={() => {}}
          players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
        />,
      ),
    )

    // Open the Branding tool from its app tile.
    const brandTab = [...host.querySelectorAll<HTMLButtonElement>('.mc-app')].find(
      (t) => t.textContent === 'Branding',
    )!
    act(() => brandTab.click())
    expect(host.querySelector('.mgr-brand-title')?.textContent).toMatch(/Branding/i)

    // Defaults before any change: theme accent is unset, money is the $ default.
    expect(document.documentElement.style.getPropertyValue('--gem')).toBe('')
    expect(formatMoney(123456)).toBe('$1,234.56')

    // Change the accent colour and the points symbol in the draft.
    const accentInput = host.querySelector<HTMLInputElement>('.mgr-accent input[type="color"]')!
    act(() => setValue(accentInput, '#ff0000'))
    const symbolInput = host.querySelector<HTMLInputElement>('.mgr-input-short')!
    act(() => setValue(symbolInput, '¢'))

    // Nothing app-wide changes until Save (it's a live *draft* preview).
    expect(document.documentElement.style.getPropertyValue('--gem')).toBe('')
    expect(formatMoney(123456)).toBe('$1,234.56')

    // Save & apply.
    const save = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      /Save & apply/.test(b.textContent ?? ''),
    )!
    expect(save.disabled).toBe(false)
    act(() => save.click())

    // Now both effects are live app-wide: the CSS token on :root and the singleton
    // that formatMoney reads everywhere else in the app.
    expect(document.documentElement.style.getPropertyValue('--gem')).toBe('#ff0000')
    expect(formatMoney(123456)).toBe('¢1,234.56')
  })
})
