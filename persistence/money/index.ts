/**
 * The server-authoritative money path — public surface + env-aware selector
 * (CLAUDE.md §3). `createMoneyService` returns the Supabase RPC service when keys are
 * present and the in-process `core` service otherwise, both behind one async
 * `MoneyService` interface. The shell adopts it by routing its place/grade/adjust/
 * settle/grant calls through the returned service instead of calling `core` directly.
 */

import { getSupabaseEnv, type EnvSource } from '../supabase/env.js'
import type { FetchLike } from '../supabase/kv-transport.js'
import { createLocalMoneyService } from './local-service.js'
import { createSupabaseMoneyService } from './supabase-service.js'
import type { AccountSource, MoneyService } from './types.js'

export type {
  MoneyService,
  MoneyServiceResult,
  PlacedResult,
  AccountSource,
} from './types.js'
export { createLocalMoneyService, type LocalMoneyServiceOpts } from './local-service.js'
export { createSupabaseMoneyService, type SupabaseMoneyServiceOpts } from './supabase-service.js'
export {
  RPC,
  rowToAccount,
  accountToRow,
  rowToWager,
  wagerToRow,
  type AccountRow,
  type WagerRow,
  type RpcEnvelope,
} from './rpc.js'

export interface CreateMoneyServiceOpts {
  /** Account source for the LOCAL fallback (ignored when Supabase is active). */
  localSource: AccountSource
  /** Signed-in user's access token, forwarded to the Supabase service (RLS). */
  accessToken?: string
  /** Injectable fetch for the Supabase service (tests); defaults to global fetch. */
  fetchImpl?: FetchLike
  /** Injectable env (tests); defaults to the ambient environment. */
  envSource?: EnvSource
}

/**
 * Pick the money service for the current environment: server-authoritative
 * (Supabase RPC) when keys are set, in-process (`core`) otherwise.
 */
export function createMoneyService(opts: CreateMoneyServiceOpts): MoneyService {
  const env = getSupabaseEnv(opts.envSource)
  if (env) {
    return createSupabaseMoneyService({
      env,
      accessToken: opts.accessToken,
      fetchImpl: opts.fetchImpl,
    })
  }
  return createLocalMoneyService(opts.localSource)
}
