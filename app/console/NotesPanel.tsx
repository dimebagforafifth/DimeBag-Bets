import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { membersByRole, setMemberProfile } from '../../org/index.js'
import { getBook, getBookVersion, mutateBook, subscribeBook } from '../book-store.js'
import { addTag, getTags, getTagsVersion, removeTag, subscribeTags } from './tags-store.js'

/**
 * Player CRM — free-text notes + quick tags per player (CLAUDE.md §4). Notes write to
 * the existing org `MemberProfile.notes` through its public setter; tags live in the
 * console's own overlay store. No money moves.
 */
export function NotesPanel() {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const tv = useSyncExternalStore(subscribeTags, getTagsVersion)

  const players = useMemo(() => membersByRole(getBook(), 'player'), [bv])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = players.find((p) => p.id === selectedId) ?? players[0] ?? null

  const [note, setNote] = useState('')
  const [tagDraft, setTagDraft] = useState('')

  // Re-sync the note draft when the selected player (or their saved note) changes.
  useEffect(() => {
    setNote(selected?.profile.notes ?? '')
  }, [selected?.id, bv]) // eslint-disable-line react-hooks/exhaustive-deps

  if (players.length === 0) {
    return (
      <div className="con-notes">
        <header className="con-notes-head">
          <h1 className="con-h1">Player notes &amp; tags</h1>
        </header>
        <p className="con-empty">No players yet.</p>
      </div>
    )
  }

  const saveNote = () => {
    if (!selected) return
    mutateBook((o) => setMemberProfile(o, selected.id, { notes: note }))
  }
  const tags = selected ? getTags(selected.id) : []
  void tv // tags version is the change signal for the chips below

  return (
    <div className="con-notes">
      <header className="con-notes-head">
        <h1 className="con-h1">Player notes &amp; tags</h1>
        <p className="con-sub">
          Keep operator context on each player — collection notes, VIP flags, anything.
        </p>
      </header>

      <div className="con-notes-grid">
        <ul className="con-notes-people" role="tablist" aria-label="Players">
          {players.map((p) => (
            <li key={p.id}>
              <button
                role="tab"
                aria-selected={p.id === selected?.id}
                className={`con-notes-person ${p.id === selected?.id ? 'is-on' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>

        {selected && (
          <section className="con-notes-editor" aria-label={`Notes for ${selected.name}`}>
            <h2 className="con-h2">{selected.name}</h2>

            <div className="con-tags" aria-label="Tags">
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
                placeholder="add tag…"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag(selected.id, tagDraft)
                    setTagDraft('')
                  }
                }}
              />
            </div>

            <textarea
              className="con-notes-text"
              rows={6}
              placeholder="Notes…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="con-notes-foot">
              <button
                className="con-btn con-btn-primary"
                onClick={saveNote}
                disabled={note === (selected.profile.notes ?? '')}
              >
                {note === (selected.profile.notes ?? '') ? 'Saved' : 'Save note'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
