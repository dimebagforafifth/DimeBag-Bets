/** The console tile manifest is well-formed and ready for the wiring pass to mount. */

import { describe, expect, it } from 'vitest'
import { billingManifests } from './manifest.js'
import { BillingPanel } from './BillingPanel.js'

describe('billing console manifest', () => {
  it('ships one ready-to-mount Operations tile pointing at BillingPanel', () => {
    expect(billingManifests).toHaveLength(1)
    const m = billingManifests[0]
    expect(m.key).toBe('billing-invoices')
    expect(m.name).toBe('Billing & Invoices')
    expect(m.section).toBe('operations')
    expect(m.Panel).toBe(BillingPanel)
    expect(m.icon).toBeTruthy()
    expect(m.hint.length).toBeGreaterThan(0)
  })
})
