// @vitest-environment happy-dom
/** The provider restores a session on mount and drives signed-in/out state. */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider, useAuth } from './AuthProvider.js'
import { __resetDemoAuth } from './demoAdapter.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe() {
  const { status, user, signOut } = useAuth()
  return (
    <div>
      <span className="s">{status}</span>
      <span className="u">{user?.id ?? '-'}</span>
      <button className="out" onClick={() => void signOut()}>
        out
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => __resetDemoAuth())

  it('bootstraps an authenticated operator session in demo mode, then signs out', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })
    await act(async () => {}) // flush the async getSession()

    expect(host.querySelector('.s')?.textContent).toBe('authenticated')
    expect(host.querySelector('.u')?.textContent).toBe('mgr')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.out')!.click()
    })
    expect(host.querySelector('.s')?.textContent).toBe('unauthenticated')

    act(() => root.unmount())
    host.remove()
  })
})
