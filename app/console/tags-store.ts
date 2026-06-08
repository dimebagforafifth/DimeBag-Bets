/**
 * Player tags — short operator labels (e.g. "sharp", "VIP", "slow payer") kept per
 * member. Stored in the console's own persisted doc because the org `MemberProfile`
 * only carries free-text notes; tags are a console-side overlay and never touch the
 * org tree or money. Same external-store blueprint as the other app/* stores.
 */

import { createLocalStore, persistedDoc, type Doc } from '../../persistence/index.js'

export type TagMap = Record<string, string[]>

const store = createLocalStore({ namespace: 'dimebag' })
const DOC: Doc<TagMap> = persistedDoc<TagMap>(store, 'console.tags', { version: 1, initial: {} })

let tags: TagMap = DOC.load()
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeTags(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTagsVersion(): number {
  return version
}

export function getTags(memberId: string): string[] {
  return tags[memberId] ?? []
}

/** Add a tag (trimmed, de-duplicated, case-insensitive) to a member. */
export function addTag(memberId: string, tag: string): void {
  const clean = tag.trim()
  if (!clean) return
  const existing = tags[memberId] ?? []
  if (existing.some((t) => t.toLowerCase() === clean.toLowerCase())) return
  tags = { ...tags, [memberId]: [...existing, clean] }
  DOC.save(tags)
  notify()
}

/** Remove a tag from a member. */
export function removeTag(memberId: string, tag: string): void {
  const existing = tags[memberId]
  if (!existing) return
  tags = { ...tags, [memberId]: existing.filter((t) => t !== tag) }
  DOC.save(tags)
  notify()
}

/** Test/SSR helper: clear all tags. */
export function __resetTags(): void {
  tags = {}
  DOC.save(tags)
  notify()
}
