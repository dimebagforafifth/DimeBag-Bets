/**
 * Composite subscription for the Profile v2 surfaces — fans the upstream read-only stores into
 * one `useSyncExternalStore` pair so a surface re-renders whenever the ledger, live bets, the
 * follow graph, privacy, or the community scope change. Importing this module also installs the
 * default records-backed projection source (side-effect). Holds no money, owns no state beyond a
 * derived version sum.
 */

import './projection-adapter.js' // side-effect: registers the default projection source
import { getRecordsVersion, subscribeRecords } from '../records/index.js'
import { getBetsVersion, subscribeBets } from '../app/book/bets-store.js'
import { followsVersion, subscribeFollows } from './follow-graph.js'
import { privacyVersion, subscribePrivacy } from './privacy.js'
import { communitySettingsVersion, subscribeCommunitySettings } from './community-settings.js'

/** Subscribe to every source a profile surface reads. Returns an unsubscribe. */
export function subscribeProfiles(listener: () => void): () => void {
  const offs = [
    subscribeRecords(listener),
    subscribeBets(listener),
    subscribeFollows(listener),
    subscribePrivacy(listener),
    subscribeCommunitySettings(listener),
  ]
  return () => {
    for (const off of offs) off()
  }
}

/** A monotonic snapshot for useSyncExternalStore (sum of the upstream version counters). */
export function profilesVersion(): number {
  return (
    getRecordsVersion() +
    getBetsVersion() +
    followsVersion() +
    privacyVersion() +
    communitySettingsVersion()
  )
}
