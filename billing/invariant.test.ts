/**
 * THE HARD INVARIANT: no billing_* operation EVER calls placeWager / placeWagers / resolveWager /
 * resolveAtMultiplier / grant / settleWeek / adjustBalance (the core money mutators) or the
 * app-layer audited mover adjustFigure — billing is FIAT and must never touch the player figure.
 *
 * The load-bearing proof is STATIC: billing imports NOTHING from `core/` and names none of the
 * mutators. That is airtight — you cannot call a function you never import and never reference,
 * regardless of which code paths a runtime test happens to exercise (a runtime spy on an ESM
 * namespace would also miss core-internal self-calls). A runtime exercise of the whole billing
 * surface backs it up: every public operation runs to completion holding only fiat.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setViewer } from '../app/viewer.js'
import {
  __resetBilling,
  __seedBilling,
  generatePeriod,
  issuePeriod,
  markPeriodPaid,
  previewPeriod,
  updateBillingConfig,
  waivePeriod,
} from './store.js'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Every core figure/pending writer + the audited app-layer mover. Billing references NONE. */
const FORBIDDEN = [
  'placeWager',
  'placeWagers',
  'resolveWager',
  'resolveAtMultiplier',
  'grant',
  'settleWeek',
  'adjustBalance',
  'adjustFigure',
]

function billingSources(): { file: string; src: string }[] {
  return readdirSync(HERE)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .map((file) => ({ file, src: readFileSync(join(HERE, file), 'utf8') }))
}

/** Drop comments so the identifier scan only sees CODE (prose may legitimately mention them). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('billing FIAT invariant — billing never touches the credit core', () => {
  it('no billing source imports from core/', () => {
    for (const { file, src } of billingSources()) {
      const importsCore = /from\s+['"][^'"]*\/core(\/[^'"]*)?\.js['"]/.test(src)
      expect(importsCore, `${file} must not import from core/`).toBe(false)
    }
  })

  it('no billing source references a money-mutating function', () => {
    for (const { file, src } of billingSources()) {
      const code = stripComments(src)
      for (const name of FORBIDDEN) {
        expect(new RegExp(`\\b${name}\\b`).test(code), `${file} references ${name}`).toBe(false)
      }
    }
  })

  it('running every billing operation completes (holding only fiat — no core money path)', () => {
    setViewer('mgr', 'manager')
    __resetBilling()
    updateBillingConfig({ baseRateCentsPerHead: 700, cryptoDiscountBps: 500 })
    previewPeriod({ weekStart: 1, weekEnd: 2, now: 3 })
    const inv = generatePeriod({ weekStart: 1, weekEnd: 2, now: 3 })
    issuePeriod(inv.id, 4)
    markPeriodPaid(inv.id, 5)
    const inv2 = generatePeriod({ weekStart: 10, weekEnd: 11, now: 12 })
    waivePeriod(inv2.id, 13)
    __seedBilling(100)
    expect(inv.id).toMatch(/^inv-/)
  })
})

beforeEach(() => {
  setViewer('mgr', 'manager')
  __resetBilling()
})
afterEach(() => {
  setViewer('mgr', 'manager')
})
