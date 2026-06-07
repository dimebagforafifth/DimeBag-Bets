import { describe, it, expect } from 'vitest'
import { activeAnnouncements, type Announcement } from './announcements.js'

const a = (o: Partial<Announcement>): Announcement => ({
  id: 1,
  time: 0,
  title: 'T',
  body: 'B',
  severity: 'info',
  active: true,
  expiresAt: 0,
  ...o,
})

describe('activeAnnouncements', () => {
  it('keeps active, non-expired messages', () => {
    const now = 1000
    const list = [
      a({ id: 1, active: true, expiresAt: 0 }), // no expiry
      a({ id: 2, active: true, expiresAt: 2000 }), // future
      a({ id: 3, active: true, expiresAt: 500 }), // expired
      a({ id: 4, active: false, expiresAt: 0 }), // switched off
    ]
    expect(activeAnnouncements(list, now).map((x) => x.id)).toEqual([1, 2])
  })
})
