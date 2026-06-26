import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './skeleton.css'

/**
 * Skeleton-loading primitives for the "Chip Gold & Carbon" system. A skeleton is a
 * content-shaped placeholder shown while a chunk/data load is in flight — never a
 * spinner-on-blank and never a layout-shifting flash (the placeholder reserves the
 * real element's footprint). The shimmer is a single gold-tinted sweep over a carbon
 * surface; it collapses to a static block under `prefers-reduced-motion`.
 *
 * Accessibility: the shimmer blocks are decorative (`aria-hidden`). Wrap a whole
 * loading view in <SkeletonRegion> so assistive tech hears one "Loading…" status
 * instead of a wall of empty boxes. See app/skeletons/* for section-shaped archetypes
 * built from these, and CLAUDE.md ("Skeleton loaders") for the convention.
 */

type Dim = number | string
const dim = (v: Dim | undefined): string | undefined =>
  v == null ? undefined : typeof v === 'number' ? `${v}px` : v

export interface SkeletonProps {
  /** Width — number (px) or any CSS length (e.g. '60%'). Defaults to 100%. */
  width?: Dim
  /** Height — number (px) or any CSS length. Defaults to 1em. */
  height?: Dim
  /** Border radius — number (px) or CSS length. Defaults to the brand --radius-sm. */
  radius?: Dim
  /** Render a circle (avatars, icon chips); uses `height` for both axes. */
  circle?: boolean
  className?: string
  style?: CSSProperties
}

/** One shimmer block. Compose these into a content-shaped skeleton. */
export function Skeleton({ width, height, radius, circle, className, style }: SkeletonProps) {
  const size = dim(height)
  return (
    <span
      aria-hidden="true"
      className={cn('sk', className)}
      style={{
        width: circle ? size : dim(width),
        height: size,
        borderRadius: circle ? '50%' : dim(radius),
        ...style,
      }}
    />
  )
}

export interface SkeletonTextProps {
  /** Number of text lines. */
  lines?: number
  /** Line height (px). */
  lineHeight?: number
  /** Gap between lines (px). */
  gap?: number
  /** Width of the LAST line (the others are full width) — gives a natural ragged edge. */
  lastWidth?: Dim
  className?: string
}

/** A paragraph of shimmer lines; the last line is short for a natural ragged edge. */
export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  gap = 8,
  lastWidth = '55%',
  className,
}: SkeletonTextProps) {
  return (
    <span className={cn('sk-text', className)} style={{ gap }} aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </span>
  )
}

/** A circular shimmer (avatar / icon chip). */
export function SkeletonCircle({
  size = 40,
  className,
  style,
}: {
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return <Skeleton circle height={size} className={className} style={style} />
}

export interface SkeletonRegionProps {
  /** Accessible label announced while loading, e.g. "Loading your bets". */
  label?: string
  className?: string
  children: ReactNode
}

/**
 * Wraps a whole loading view. Marks it `aria-busy` + `role="status"` and carries a
 * visually-hidden label, so assistive tech announces ONE "Loading…" instead of every
 * shimmer block. Every section-shaped skeleton (app/skeletons/*) returns one of these.
 */
export function SkeletonRegion({ label = 'Loading', className, children }: SkeletonRegionProps) {
  return (
    <div className={cn('sk-region', className)} role="status" aria-busy="true" aria-live="polite">
      <span className="sk-sr">{label}…</span>
      {children}
    </div>
  )
}
