/**
 * PanelShell — the only chrome a feature panel adds: it applies the shell's
 * charcoal/gold theme (by re-mapping CSS tokens on `.feat-panel`) and wires
 * Escape → onBack. It deliberately renders NO top bar / figures strip — the shell
 * owns that. Adapters wrap an existing component; new panels render their body here.
 */
import { useEffect, type ReactNode } from 'react'
import './shared.css'

export function PanelShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return <div className="feat-panel">{children}</div>
}
