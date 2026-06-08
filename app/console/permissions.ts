/**
 * Console permissions — a GRANULAR capability layer on top of the existing org roles
 * (CLAUDE.md §4, §5). The auth/roles module decides who reaches the management
 * *section* at all (`canManage`); this decides which TOOLS inside the console an
 * operator may use. It consumes the org `Role` read-only and never forks it.
 *
 * Model:
 *  - Every console tool maps to one `Capability`.
 *  - Each role has a sensible DEFAULT capability set (`ROLE_BASE`).
 *  - The head **manager** always holds every capability and can't be locked out.
 *  - The manager may GRANT a custom slice to any sub-agent/agent (a per-member
 *    allow-list that replaces that member's role default). Grants are clamped to the
 *    role ceiling so a delegated operator can never be handed the admin-only tools
 *    (`MANAGER_ONLY`) — no privilege escalation.
 *
 * Pure + dependency-free so it's trivially testable; the persisted grant map lives in
 * permissions-store.ts.
 */

import type { Role } from '../../org/index.js'

/** One capability per console tool. */
export type Capability =
  | 'dashboard'
  | 'players'
  | 'vip'
  | 'loyalty'
  | 'segments'
  | 'notes'
  | 'risk'
  | 'alerts'
  | 'settlement'
  | 'audit'
  | 'reporting'
  | 'promotions'
  | 'copilot'
  | 'communication'
  | 'games'
  | 'branding'
  | 'operators'
  | 'permissions'
  | 'setup'

/** Canonical order — also the order tools render in. */
export const ALL_CAPABILITIES: Capability[] = [
  'dashboard',
  'players',
  'vip',
  'loyalty',
  'segments',
  'notes',
  'risk',
  'alerts',
  'settlement',
  'audit',
  'reporting',
  'promotions',
  'copilot',
  'communication',
  'games',
  'branding',
  'operators',
  'permissions',
  'setup',
]

export const CAPABILITY_LABEL: Record<Capability, string> = {
  dashboard: 'Dashboard',
  players: 'Players & agents',
  vip: 'VIP program',
  loyalty: 'Loyalty ladder',
  segments: 'Player segments',
  notes: 'Player notes & tags',
  risk: 'Risk & exposure',
  alerts: 'Operator alerts',
  settlement: 'Settlement',
  audit: 'Audit log',
  reporting: 'Reporting',
  promotions: 'Promotions',
  copilot: 'Copilot',
  communication: 'Communication',
  games: 'Games & house edge',
  branding: 'Branding',
  operators: 'Tournaments & wheel',
  permissions: 'Permissions',
  setup: 'Setup wizard',
}

/**
 * Admin-only capabilities — the meta tools that control the book's configuration and
 * who-can-do-what. These are NEVER delegable: only a manager ever holds them, and a
 * manager can't grant them to a sub-agent. This is the anti-escalation backstop.
 */
export const MANAGER_ONLY: Capability[] = ['permissions', 'setup']

/** Default capability set per role (the baseline before any custom grant). */
export const ROLE_BASE: Record<Role, Capability[]> = {
  manager: [...ALL_CAPABILITIES],
  // A sub-agent runs day-to-day operations across the book, minus the book-config
  // admin tools (games/branding/operators) and the meta tools (permissions/setup).
  subagent: [
    'dashboard',
    'players',
    'vip',
    'loyalty',
    'segments',
    'notes',
    'risk',
    'alerts',
    'settlement',
    'reporting',
    'promotions',
    'copilot',
    'communication',
  ],
  // A front-line agent manages their own players, runs promos, and reads reports.
  agent: ['dashboard', 'players', 'segments', 'notes', 'reporting', 'promotions', 'communication'],
  // Players never reach the console at all (auth/roles gates the section); empty here
  // so the model is total.
  player: [],
}

/** The capabilities a role is ALLOWED to hold — everything for a manager, everything
 *  but the admin-only tools for anyone else. Grants are clamped to this. */
export function roleCeiling(role: Role): Capability[] {
  if (role === 'manager') return [...ALL_CAPABILITIES]
  return ALL_CAPABILITIES.filter((c) => !MANAGER_ONLY.includes(c))
}

/** A per-member custom allow-list (memberId → capabilities). Absent ⇒ role default. */
export type PermissionGrants = Record<string, Capability[]>

/** Order + de-duplicate a capability list by the canonical order. */
function canonical(caps: Iterable<Capability>): Capability[] {
  const set = new Set(caps)
  return ALL_CAPABILITIES.filter((c) => set.has(c))
}

/**
 * The capabilities a member effectively has, after role default, any custom grant,
 * and the role ceiling:
 *  - a manager always has everything (can't be demoted out of their own console),
 *  - otherwise: the custom grant if one exists, else the role default — then clamped
 *    to the role ceiling (drops any admin-only / out-of-tier capability).
 */
export function effectiveCaps(
  member: { id: string; role: Role },
  grants: PermissionGrants,
): Capability[] {
  if (member.role === 'manager') return [...ALL_CAPABILITIES]
  const ceiling = new Set(roleCeiling(member.role))
  const base = grants[member.id] ?? ROLE_BASE[member.role]
  return canonical(base.filter((c) => ceiling.has(c)))
}

/** Whether a member may use a given tool. */
export function can(
  member: { id: string; role: Role },
  grants: PermissionGrants,
  cap: Capability,
): boolean {
  if (member.role === 'manager') return true
  return effectiveCaps(member, grants).includes(cap)
}

/** Whether this member is on their role default (no custom grant saved). */
export function isRoleDefault(memberId: string, grants: PermissionGrants): boolean {
  return !(memberId in grants)
}
