import React from 'react'

const CSS = `
.sds-gamecard {
  position: relative; display: flex; flex-direction: column; text-align: left;
  width: 100%; height: 100%; padding: 0; border-radius: var(--radius); background: var(--surface);
  border: 1px solid var(--line); cursor: pointer; overflow: hidden;
  box-shadow: var(--elev-1), var(--sheen);
  transition: transform var(--dur) var(--ease-out), border-color var(--dur) ease, box-shadow var(--dur-slow) var(--ease-out);
}
.sds-gamecard:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); box-shadow: var(--elev-2), var(--elev-gold), var(--sheen); }
.sds-gamecard:active { transform: translateY(-1px); }
.sds-gamecard:focus-visible { outline: none; box-shadow: var(--ring); }
.sds-gamecard__art {
  position: relative; flex: 0 0 116px; min-height: 116px; display: flex; align-items: center; justify-content: center;
  border-bottom: 1px solid var(--line); overflow: hidden;
  background: radial-gradient(125% 100% at 50% 0%, color-mix(in srgb, var(--gold) 28%, var(--surface-2)) 0%, var(--surface-2) 72%);
}
.sds-gamecard__art img { position: relative; width: 78px; height: 78px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.45)); transition: transform var(--dur-slow) var(--ease-out); }
.sds-gamecard:hover .sds-gamecard__art img { transform: scale(1.06); }
.sds-gamecard__body { flex: 1 1 0%; min-height: 0; display: flex; flex-direction: column; gap: 4px; padding: 13px 14px 14px; overflow: hidden; }
.sds-gamecard__name { font-family: var(--font-head); font-size: 17px; font-weight: 600; letter-spacing: 0.2px; color: #fff; }
.sds-gamecard__tag { font-size: 12.5px; color: var(--muted); line-height: 1.35; }
.sds-gamecard__play { margin-top: auto; padding-top: 10px; font-size: 12.5px; font-weight: 700; color: var(--gold); opacity: 0; transform: translateX(-4px); transition: opacity var(--dur) ease, transform var(--dur) ease; }
.sds-gamecard:hover .sds-gamecard__play { opacity: 1; transform: translateX(0); }
`
if (typeof document !== 'undefined' && !document.getElementById('sds-gamecard-css')) {
  const s = document.createElement('style')
  s.id = 'sds-gamecard-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * A lobby game tile: the 3D icon over a gold-tinted gradient, name, one-line tag,
 * and a "Play →" that slides in on hover. Pass `icon` (an <img> src) or `children`.
 */
export function GameCard({ name, tag, icon, iconAlt = '', className = '', ...rest }) {
  return (
    <button type="button" className={['sds-gamecard', className].filter(Boolean).join(' ')} {...rest}>
      <span className="sds-gamecard__art">{icon ? <img src={icon} alt={iconAlt} /> : null}</span>
      <span className="sds-gamecard__body">
        <span className="sds-gamecard__name">{name}</span>
        {tag ? <span className="sds-gamecard__tag">{tag}</span> : null}
        <span className="sds-gamecard__play">Play →</span>
      </span>
    </button>
  )
}
