// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { ProfileSection } from './ui/ProfileSection.js'
import { __resetRecords } from './store.js'

afterEach(() => __resetRecords())

describe('ProfileSection renders', () => {
  it('mounts and shows a verified record populated from seeded data', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => {
      root.render(<ProfileSection />)
    })
    const html = host.innerHTML
    expect(html).toContain('Verified record')
    expect(html).toContain('Lifetime') // the period toggle rendered
    expect(html).toMatch(/Net|ROI/) // the headline stat grid rendered
    act(() => {
      root.unmount()
    })
  })
})
