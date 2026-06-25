import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

export interface GameCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Game name (Barlow Condensed headline). */
  name: string
  /** One-line description / stake tag. */
  tag?: string
  /** Source for the 3D game-icon PNG (the real product asset — never redrawn). */
  icon?: string
  iconAlt?: string
  /** Optional custom art (used when no `icon` is given). */
  art?: ReactNode
}

/**
 * A casino-lobby game tile: the 3D icon over a gold-tinted gradient, name, one-line
 * tag, and a "Play →" that slides in on hover. Pass `icon` (the 3D PNG src) and,
 * optionally, `art` as a fallback rendered if the PNG is missing / fails to load.
 */
export function GameCard({
  name,
  tag,
  icon,
  iconAlt = '',
  art,
  className,
  type = 'button',
  ...rest
}: GameCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImg = Boolean(icon) && !imgFailed
  return (
    <button type={type} className={cn('sds-gamecard', className)} {...rest}>
      <span className="sds-gamecard__art">
        {showImg ? (
          <img src={icon} alt={iconAlt} onError={() => setImgFailed(true)} />
        ) : (
          art
        )}
      </span>
      <span className="sds-gamecard__body">
        <span className="sds-gamecard__name">{name}</span>
        {tag ? <span className="sds-gamecard__tag">{tag}</span> : null}
        <span className="sds-gamecard__play">Play →</span>
      </span>
    </button>
  )
}
