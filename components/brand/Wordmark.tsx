import type { HTMLAttributes, ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import './brand.css'

/** Base-aware URL for a file in /public (respects the GitHub Pages base path). */
function publicUrl(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
}

export interface WordmarkProps extends HTMLAttributes<HTMLSpanElement> {
  /** Render as a different tag (e.g. a heading) while keeping the wordmark styling. */
  as?: 'span' | 'h1' | 'div'
}

/**
 * The PlayStadium.io hero mark — "PlayStadium" + a gold "." + "io", set in the
 * hand-drawn Slight Chance display face. One source of truth for the wordmark
 * across the header, login, console and onboarding.
 */
export function Wordmark({ as: Tag = 'span', className, ...rest }: WordmarkProps) {
  return (
    <Tag className={cn('ps-wordmark', className)} {...rest}>
      PlayStadium<span className="ps-wordmark__dot">.</span>io
    </Tag>
  )
}

export interface ChipLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Rendered height in px (the pixel chip stays crisp via image-rendering: pixelated). */
  size?: number
}

/**
 * The pixel poker-chip brand mark, served from /public/brand and kept crisp with
 * image-rendering: pixelated. Pair it with <Wordmark /> for the full lockup.
 */
export function ChipLogo({ size = 28, className, alt = 'PlayStadium.io', style, ...rest }: ChipLogoProps) {
  return (
    <img
      src={publicUrl('brand/playstadium-chip-logo.png')}
      alt={alt}
      width={size}
      height={size}
      className={cn('ps-chip', className)}
      style={{ height: size, width: size, ...style }}
      {...rest}
    />
  )
}
