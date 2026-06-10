/**
 * Lucide-style icons for the Catalog manifests. `lucide-react` isn't a dependency in
 * this worktree yet, so these are lucide-shaped stand-ins named for their equivalents —
 * a one-line swap to real `lucide-react` imports once the dep lands. // TODO(api)
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

export const LineChart = make(
  'LineChart',
  <>
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </>,
)

export const Dice5 = make(
  'Dice5',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M16 8h.01" />
    <path d="M8 8h.01" />
    <path d="M8 16h.01" />
    <path d="M16 16h.01" />
    <path d="M12 12h.01" />
  </>,
)

export const PenLine = make(
  'PenLine',
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
)

export const ClipboardCheck = make(
  'ClipboardCheck',
  <>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </>,
)

export const Gift = make(
  'Gift',
  <>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
  </>,
)
