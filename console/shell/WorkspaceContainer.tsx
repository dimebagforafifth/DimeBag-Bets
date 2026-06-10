/**
 * The workspace: a "← All apps" back control over the mounted feature body. The
 * shell owns this frame; the feature's Panel renders ONLY its own body inside it
 * (never a top bar / figures strip / page chrome) and is handed `onBack`.
 */

import type { ReactNode } from 'react'
import { BackIcon } from './icons.js'

export function WorkspaceContainer({
  title,
  onBack,
  children,
}: {
  /** Optional feature name shown beside the back control. */
  title?: string
  onBack: () => void
  /** The feature Panel body. */
  children: ReactNode
}) {
  return (
    <section className="c-workspace" aria-label={title ? `${title} workspace` : 'Workspace'}>
      <div className="c-workspace-head">
        <button type="button" className="c-back" onClick={onBack}>
          <BackIcon size={16} />
          All apps
        </button>
        {title && <span className="c-workspace-title">{title}</span>}
      </div>
      <div className="c-workspace-body">{children}</div>
    </section>
  )
}
