/**
 * Agent-tree reconstruction + player creation — the heart of the import.
 *
 * PURE over a passed `Org`: it mutates the org it's given through the real org/ functions
 * (addSubAgent / addAgent / addPlayer), so the same code drives the dry-run (on a CLONE, for
 * validation) and the real commit (on the live book). It never touches a balance — opening
 * figures are applied separately by the commit wrapper through the audited core path — and it
 * is PER-ROW RESILIENT: a row that can't be created (credit waterfall, bad path) is marked
 * `error`/`skipped` and the build continues, so a bad row never aborts the whole import.
 *
 * Tree model (the org is manager → sub-agent → agent → player):
 *   agentPath []        → player sits directly under the manager (house-direct)
 *   agentPath [A]       → AGENT 'A' under the manager, player under 'A'
 *   agentPath [S, A]    → SUB-AGENT 'S' under the manager, AGENT 'A' under 'S', player under 'A'
 *   agentPath deeper    → error (the org has no tier below 'agent' except players)
 *
 * Credit: rows are de-duplicated FIRST (within-file dups + players already in the org are
 * dropped), then a NEWLY created agent/sub-agent is sized to exactly cover the credit lines of
 * the players it actually gets — never inflated by skipped rows — and the manager must have the
 * headroom for the new top-level nodes. An EXISTING agent is reused and topped up only by the
 * shortfall its new players need, and only as far as its parent allows; a player whose line
 * still won't fit is reported as an error to fix + re-run.
 */

import {
  addAgent,
  addPlayer,
  addSubAgent,
  availableCredit,
  directReports,
  setCreditLimit,
  setMemberProfile,
  type Member,
  type Org,
  type Role,
} from '../org/index.js'
import type { MappedPlayer, RowResult } from './types.js'

export interface RowInput {
  rowId: string
  mapped: MappedPlayer
}

export interface RowOutcome {
  rowId: string
  result: RowResult
  errorReason?: string
  playerId?: string
}

export interface CreatedPlayer {
  rowId: string
  playerId: string
  startingBalanceCents: number
}

export interface BuildResult {
  outcomes: RowOutcome[]
  createdAgentCount: number
  createdPlayers: CreatedPlayer[]
}

const lc = (s: string): string => s.trim().toLowerCase()
const MAX_DEPTH = 2 // sub-agent + agent; deeper has no org tier

/** An agent/sub-agent node the import needs (resolved or to-create). */
interface Node {
  key: string // canonical 'north/east' path key
  name: string
  role: Extract<Role, 'agent' | 'subagent'>
  parentKey: string | null // parent node key, or null = under the manager
  creditCents: number // roll-up of the subtree's player credit lines
  id: string | null // resolved/created member id
  createdHere: boolean // true only when this run minted it (vs reused an existing agent)
  failed: boolean
}

/** Find an existing child of `parentId` with this role + name (case-insensitive). */
function findChild(org: Org, parentId: string, role: Role, name: string): Member | null {
  return (
    directReports(org, parentId).find((m) => m.role === role && lc(m.name) === lc(name)) ?? null
  )
}

/** Plan the agent nodes for a set of valid rows: keys, roles, parents, and the credit
 *  roll-up each node needs. Returns nodes root-first (a parent always precedes its child). */
function planNodes(rows: RowInput[]): {
  nodes: Map<string, Node>
  rowParentKey: Map<string, string | null>
} {
  const nodes = new Map<string, Node>()
  const rowParentKey = new Map<string, string | null>()
  for (const { rowId, mapped } of rows) {
    const path = mapped.agentPath
    let parentKey: string | null = null
    for (let i = 0; i < path.length; i++) {
      const role: Node['role'] = path.length === 2 && i === 0 ? 'subagent' : 'agent'
      const key = path
        .slice(0, i + 1)
        .map(lc)
        .join('/')
      const existing = nodes.get(key)
      if (existing) {
        existing.creditCents += mapped.creditLimitCents
      } else {
        nodes.set(key, {
          key,
          name: path[i],
          role,
          parentKey,
          creditCents: mapped.creditLimitCents,
          id: null,
          createdHere: false,
          failed: false,
        })
      }
      parentKey = key
    }
    rowParentKey.set(rowId, parentKey) // leaf node key, or null = under the manager
  }
  return { nodes, rowParentKey }
}

/** Create (or resolve) one node on the given org. Sets node.id / node.createdHere / node.failed. */
function realiseNode(org: Org, node: Node, nodes: Map<string, Node>): void {
  const parentId = node.parentKey ? nodes.get(node.parentKey)?.id : org.managerId
  if (!parentId) {
    node.failed = true // parent node failed to create → this can't attach
    return
  }
  const existing = findChild(org, parentId, node.role, node.name)
  if (existing) {
    node.id = existing.id // reuse the existing agent/sub-agent…
    // …and top it up so the newly-imported players fit under it: an agent sized exactly to its
    // current roster has no headroom, so without this every added player would hit the credit
    // waterfall. We raise its line only by the shortfall, and only as far as the parent allows
    // (setCreditLimit enforces the parent's headroom); if it can't grow, the players that don't
    // fit are reported as errors row-by-row rather than failing the whole import.
    const shortfall = node.creditCents - availableCredit(org, existing.id)
    if (shortfall > 0) {
      try {
        setCreditLimit(org, existing.id, existing.account.creditLimit + shortfall)
      } catch {
        /* parent has no headroom to grow this agent — affected players will error below */
      }
    }
    return
  }
  try {
    const opts = { name: node.name, creditLimit: node.creditCents }
    const made = node.role === 'subagent' ? addSubAgent(org, opts) : addAgent(org, parentId, opts)
    node.id = made.id
    node.createdHere = true
  } catch {
    node.failed = true
  }
}

/**
 * Reconstruct the tree and create the players on `org`. Returns per-row outcomes (the import
 * result), the count of agents/sub-agents created, and the created players (with their opening
 * figures) so the caller can seed balances through the audited core path.
 */
export function buildTree(org: Org, rows: RowInput[]): BuildResult {
  const outcomes: RowOutcome[] = []
  const rowOrder = new Map(rows.map((r, i) => [r.rowId, i]))
  const valid: RowInput[] = []

  // 1. Row-level validation independent of the org (name + path depth).
  for (const row of rows) {
    if (!row.mapped.name.trim()) {
      outcomes.push({ rowId: row.rowId, result: 'error', errorReason: 'missing player name' })
    } else if (row.mapped.agentPath.length > MAX_DEPTH) {
      outcomes.push({
        rowId: row.rowId,
        result: 'error',
        errorReason: `agent path too deep (max ${MAX_DEPTH}: sub-agent / agent)`,
      })
    } else {
      valid.push(row)
    }
  }

  // 2. Dedup BEFORE planning credit, so an agent is sized to the players it actually gets —
  //    not inflated by rows that will be skipped. Two passes (both read-only over the org):
  //    within-file dups (same name under the same agent PATH) and players that already exist
  //    under an already-existing parent. Skipped rows never contribute to the credit roll-up.
  const seenInFile = new Set<string>() // `${pathKey}|${nameLower}` already taken this batch
  const survivors: RowInput[] = []
  for (const row of valid) {
    const pathKey = row.mapped.agentPath.map(lc).join('/') // '' = house-direct (under manager)
    const dedupKey = `${pathKey}|${lc(row.mapped.name)}`
    if (seenInFile.has(dedupKey)) {
      outcomes.push({ rowId: row.rowId, result: 'skipped', errorReason: 'duplicate in file' })
      continue
    }
    seenInFile.add(dedupKey)
    const existingParentId = resolveExistingParentId(org, row.mapped.agentPath)
    if (existingParentId && findChild(org, existingParentId, 'player', row.mapped.name)) {
      outcomes.push({ rowId: row.rowId, result: 'skipped', errorReason: 'player already exists' })
      continue
    }
    survivors.push(row)
  }

  // 3. Plan + create the agent tree from the SURVIVORS (root-first; a parent is realised
  //    before its child), so credit roll-ups + top-ups reflect the real roster.
  const { nodes, rowParentKey } = planNodes(survivors)
  for (const node of nodes.values()) realiseNode(org, node, nodes)
  const createdAgentCount = [...nodes.values()].filter((n) => n.createdHere).length

  // 4. Create the surviving players under their resolved parent.
  const createdPlayers: CreatedPlayer[] = []
  for (const row of survivors) {
    const leafKey = rowParentKey.get(row.rowId) ?? null
    const parentId = leafKey ? nodes.get(leafKey)?.id : org.managerId
    if (!parentId) {
      outcomes.push({
        rowId: row.rowId,
        result: 'error',
        errorReason: 'agent could not be created (insufficient credit upstream)',
      })
      continue
    }
    try {
      const player = addPlayer(org, parentId, {
        name: row.mapped.name,
        creditLimit: row.mapped.creditLimitCents,
      })
      if (Object.keys(row.mapped.profile).length > 0) {
        setMemberProfile(org, player.id, row.mapped.profile)
      }
      outcomes.push({ rowId: row.rowId, result: 'created', playerId: player.id })
      createdPlayers.push({
        rowId: row.rowId,
        playerId: player.id,
        startingBalanceCents: row.mapped.startingBalanceCents,
      })
    } catch (err) {
      outcomes.push({
        rowId: row.rowId,
        result: 'error',
        errorReason: err instanceof Error ? humaniseError(err.message) : 'could not create player',
      })
    }
  }

  // Outcomes are produced across passes (validation → dedup → creation); return them in the
  // original row order so callers that zip rows to outcomes read top-to-bottom as uploaded.
  outcomes.sort((a, b) => (rowOrder.get(a.rowId) ?? 0) - (rowOrder.get(b.rowId) ?? 0))
  return { outcomes, createdAgentCount, createdPlayers }
}

/** Resolve the existing member id at the END of an agent path, or null if any segment is not
 *  yet in the org (a new sub-tree → there can be no pre-existing players under it). An empty
 *  path resolves to the manager (house-direct players are checked against the manager's roster). */
function resolveExistingParentId(org: Org, agentPath: string[]): string | null {
  let parentId = org.managerId
  for (let i = 0; i < agentPath.length; i++) {
    const role: Node['role'] = agentPath.length === 2 && i === 0 ? 'subagent' : 'agent'
    const child = findChild(org, parentId, role, agentPath[i])
    if (!child) return null
    parentId = child.id
  }
  return parentId
}

/** Turn a raw org error into a player-row reason. */
function humaniseError(msg: string): string {
  if (/credit/i.test(msg)) return 'credit line exceeds the agent’s available credit'
  if (/inactive/i.test(msg)) return 'parent agent is inactive'
  return msg
}
