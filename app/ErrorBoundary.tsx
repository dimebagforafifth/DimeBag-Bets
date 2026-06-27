import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from './error-report.js'

/**
 * Catches any render/lifecycle error in the tree below it and shows a
 * recoverable fallback instead of a blank page. Without this, a single throw in
 * any game unmounts the whole SPA — and "the interface is the product"
 * (CLAUDE.md §2), so it should never just vanish. The book + every figure are
 * persisted as you play, so a reload picks up cleanly. Errors are logged for
 * debugging; a later backend phase would report them remotely.
 */
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('DimeBag-Bets hit an unexpected error:', error, info.componentStack)
    reportError(error, { componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="no-player" role="alert">
          <h2 className="no-player-title">Something went wrong</h2>
          <p className="no-player-sub">
            The screen hit an unexpected error. Your figure and book are safe — they’re
            saved as you play. Reload to pick up where you left off.
          </p>
          <button
            className="action action-bet no-player-cta"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
