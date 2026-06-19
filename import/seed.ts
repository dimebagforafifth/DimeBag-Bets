/**
 * Demo seed — a realistic "legacy book export" so the import surface renders fully populated
 * and the whole flow (upload → map → validate → commit) is clickable in the no-keys demo. The
 * seed is just IMPORT RECORDS (raw rows + a saved template); it creates no members and moves no
 * money on load. The operator drives validate/commit themselves, which is when members appear.
 *
 * The sample deliberately exercises the interesting cases: two-level agent paths (sub-agent /
 * agent), a flat one-level agent, a house-direct player (no agent), positive AND negative
 * opening figures, a duplicate (skipped), a missing name (error), and a too-deep path (error).
 */

import { DEFAULT_MAPPING_OPTIONS, type MappingTemplate } from './types.js'

export interface SeedSource {
  sourceLabel: string
  createdBy: string
  csv: string
}

/** A messy-but-typical agent export: mixed agent depths, accounting-negative figures, dupes. */
const ACME_CSV = `Player Name,Agent,Credit Limit,Balance,Phone,Email
Marco Reyes,North / East Desk,"$2,000",-450,555-0101,marco@example.com
Lena Park,North / East Desk,1500,320,555-0102,lena@example.com
Priya Shah,North / West Desk,1000,0,555-0103,priya@example.com
Dana Cole,South,2500,"1,200",555-0104,dana@example.com
Marco Reyes,North / East Desk,2000,-450,555-0101,marco@example.com
Otis Vance,,500,(75),555-0105,otis@example.com
,South,1000,0,555-0106,noname@example.com
Sam Ito,A / B / C,800,0,555-0107,sam@example.com`

/** A second, cleaner source (a single flat sheet of house-direct players). */
const RIVERSIDE_CSV = `name,creditline,figure,nickname
Jules Tran,1200,250,jules
Kit Bauer,750,-90,kitb
Robin Diaz,3000,0,rdiaz`

export const SEED_SOURCES: SeedSource[] = [
  { sourceLabel: 'Acme Book — May export.csv', createdBy: 'operator', csv: ACME_CSV },
  { sourceLabel: 'Riverside sheet.csv', createdBy: 'operator', csv: RIVERSIDE_CSV },
]

/** A saved mapping template, so re-importing the same vendor format is one tap. */
export const SEED_TEMPLATES: MappingTemplate[] = [
  {
    id: 'tpl-agent-standard',
    name: 'Standard agent export',
    columnMap: {
      name: 'Player Name',
      agent: 'Agent',
      creditLimit: 'Credit Limit',
      startingBalance: 'Balance',
      phone: 'Phone',
      email: 'Email',
    },
    options: DEFAULT_MAPPING_OPTIONS,
  },
]
