import { useEffect, useState, useSyncExternalStore } from 'react'
import { setMemberProfile } from '../../org/index.js'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import { getBook, getBookVersion, mutateBook, subscribeBook } from '../book-store.js'
import { addTag, getTags, getTagsVersion, removeTag, subscribeTags } from './tags-store.js'
import './console.css'

/**
 * Player CRM — free-text notes + quick tags per player (CLAUDE.md §4). Search a player
 * (progressive type-ahead), then one clean box holds their tags and notes. Notes write
 * to the org `MemberProfile.notes` through its public setter; tags live in the console's
 * own overlay store. No money moves.
 */
export function NotesPanel() {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const tv = useSyncExternalStore(subscribeTags, getTagsVersion)
  const org = getBook()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    selectedId && org.members[selectedId]?.role === 'player' ? org.members[selectedId] : null

  const [note, setNote] = useState('')
  const [tagDraft, setTagDraft] = useState('')

  // Re-sync the note draft when the selected player (or their saved note) changes.
  useEffect(() => {
    setNote(selected?.profile.notes ?? '')
  }, [selectedId, bv]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = () => {
    if (!selected) return
    mutateBook((o) => setMemberProfile(o, selected.id, { notes: note }))
  }
  const tags = selected ? getTags(selected.id) : []
  void tv // tags version is the change signal for the chips below
  const dirty = selected ? note !== (selected.profile.notes ?? '') : false

  const commitTag = () => {
    if (!selected || !tagDraft.trim()) return
    addTag(selected.id, tagDraft.trim())
    setTagDraft('')
  }

  return (
    <div className="con-notes">
      <header className="con-notes-head">
        <h1 className="con-h1">Player notes &amp; tags</h1>
        <p className="con-sub">
          Search a player, then keep operator context on them — quick tags and free-text notes.
        </p>
      </header>

      <PlayerSearch org={org} onSelect={setSelectedId} />

      {selected ? (
        <section className="con-card con-notes-box" aria-label={`Notes for ${selected.name}`}>
          <div className="con-notes-box-head">
            <h2 className="con-h2">{selected.name}</h2>
            <button className="con-notes-change" onClick={() => setSelectedId(null)}>
              Change player
            </button>
          </div>

          <div className="con-notes-field">
            <span className="con-notes-flabel">Tags</span>
            <div className="con-tags">
              {tags.map((t) => (
                <span key={t} className="con-tag-chip">
                  {t}
                  <button aria-label={`Remove ${t}`} onClick={() => removeTag(selected.id, t)}>
                    ×
                  </button>
                </span>
              ))}
              <input
                className="con-tag-input"
                placeholder={tags.length ? 'add tag…' : 'add a tag…'}
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitTag()}
                onBlur={commitTag}
              />
            </div>
          </div>

          <div className="con-notes-field">
            <span className="con-notes-flabel">Notes</span>
            <textarea
              className="con-notes-text"
              rows={6}
              placeholder="Collection notes, VIP flags, anything…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="con-notes-foot">
            <button className="con-btn con-btn-primary" onClick={saveNote} disabled={!dirty}>
              {dirty ? 'Save note' : 'Saved'}
            </button>
          </div>
        </section>
      ) : (
        <p className="con-empty">Search a player above to add tags and notes.</p>
      )}
    </div>
  )
}
