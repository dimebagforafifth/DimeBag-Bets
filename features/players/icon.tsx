/**
 * Lucide-style icon components for the Players manifests.
 *
 * NOTE: `lucide-react` isn't a dependency in this worktree yet, so we ship our own
 * lucide-shaped (24×24, stroke `currentColor`) icons named for their lucide
 * equivalents. They satisfy the FeatureManifest `icon` field and are a one-line swap
 * to real `lucide-react` imports once Agent 1 adds the dep. // TODO(api): swap to
 * `import { Users, UserPlus, ... } from 'lucide-react'`.
 */
import { forwardRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes, type SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }
export type IconType = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

function make(name: string, children: ReactNode): IconType {
  const Icon = forwardRef<SVGSVGElement, IconProps>(({ size = 18, ...rest }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  ))
  Icon.displayName = name
  return Icon
}

export const Users = make(
  'Users',
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>,
)

export const UserPlus = make(
  'UserPlus',
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="22" y1="11" x2="16" y2="11" />
  </>,
)

export const Coins = make(
  'Coins',
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </>,
)

export const SlidersHorizontal = make(
  'SlidersHorizontal',
  <>
    <line x1="21" x2="14" y1="4" y2="4" />
    <line x1="10" x2="3" y1="4" y2="4" />
    <line x1="21" x2="12" y1="12" y2="12" />
    <line x1="8" x2="3" y1="12" y2="12" />
    <line x1="21" x2="16" y1="20" y2="20" />
    <line x1="12" x2="3" y1="20" y2="20" />
    <line x1="14" x2="14" y1="2" y2="6" />
    <line x1="8" x2="8" y1="10" y2="14" />
    <line x1="16" x2="16" y1="18" y2="22" />
  </>,
)

export const TrendingUp = make(
  'TrendingUp',
  <>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </>,
)

export const MessageSquare = make(
  'MessageSquare',
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
)
