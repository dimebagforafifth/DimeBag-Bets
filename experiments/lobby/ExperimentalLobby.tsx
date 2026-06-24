/**
 * EXPERIMENTAL lobby redesign — a self-contained copy of the live homepage (app/App.tsx
 * `Lobby`) reimagined under the design-taste-frontend directives, built to A/B *font and
 * palette* against the shipped graphite-and-gold theme.
 *
 * Self-contained on purpose: it copies the small bits it needs (the game list + the line-art
 * glyphs) instead of importing from `app/`, so it carries no dependency on the live shell,
 * `core`, auth, or any store. Nothing here can affect the running product.
 *
 * Experiment dials (per the skill baseline): DESIGN_VARIANCE 8 (asymmetric split hero,
 * fractional grid), MOTION_INTENSITY 6 (CSS-only fluid motion + staggered reveals + a
 * cursor-tracked spotlight — no new animation dependency), VISUAL_DENSITY 4 (daily-app
 * spacing). One desaturated accent per palette; off-black bases, never pure black.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
} from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import './experimental.css'

// Register once at module load (per the gsap-react skill): useGSAP gives us automatic,
// scoped cleanup of every tween + ScrollTrigger this component creates; ScrollTrigger
// powers the on-scroll reveals + the featured parallax.
gsap.registerPlugin(useGSAP, ScrollTrigger)

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------------------------------------------------------------------------
   Palette + font studies — toggled live from the lab bar (data-attrs on <html>).
   These are the variables the user wants to experiment with.
   --------------------------------------------------------------------------- */
type Palette = { id: string; name: string; swatch: string; note: string }
const PALETTES: Palette[] = [
  { id: 'jade', name: 'Obsidian / Jade', swatch: '#46c08a', note: 'money-green, desaturated' },
  { id: 'ember', name: 'Carbon / Ember', swatch: '#e8704a', note: 'warm terracotta' },
  { id: 'ice', name: 'Slate / Ice', swatch: '#5aa6f0', note: 'electric blue' },
  { id: 'gold', name: 'Graphite / Gold', swatch: '#d6b14a', note: 'the live theme, refined' },
]
type ArtStyle = 'render' | 'glyph'
type FontStudy = { id: string; name: string; note: string }
const FONTS: FontStudy[] = [
  { id: 'grotesk', name: 'Clash Display · Satoshi', note: 'confident, sporting' },
  { id: 'editorial', name: 'Cabinet Grotesk · General Sans', note: 'editorial, premium' },
]

/* ---------------------------------------------------------------------------
   Content — curated game set (names + Stake-style one-liners), copied static so the
   page renders with zero app wiring. Organic, not filler.
   --------------------------------------------------------------------------- */
type Game = { key: string; name: string; tag: string }
const GAMES: Game[] = [
  {
    key: 'mines',
    name: 'Mines',
    tag: 'Uncover gems for a rising multiplier — one wrong tile ends it.',
  },
  { key: 'crash', name: 'Crash', tag: 'Ride the curve. Bank it before the rocket cuts out.' },
  { key: 'dice', name: 'Dice', tag: 'Slide your own odds, roll over or under, set the payout.' },
  {
    key: 'limbo',
    name: 'Limbo',
    tag: 'Pick a target and watch the bet climb past it — from 1.01× up.',
  },
  { key: 'plinko', name: 'Plinko', tag: 'Drop the ball through the pins. The edges pay the most.' },
  { key: 'keno', name: 'Keno', tag: 'Mark your spots, watch the draw, match your way up.' },
  { key: 'wheel', name: 'Wheel', tag: 'Set the risk, spin, land a multiplier.' },
  { key: 'hilo', name: 'Hi-Lo', tag: 'Call the next card higher or lower and ride the streak.' },
  {
    key: 'dragon-tower',
    name: 'Dragon Tower',
    tag: 'Climb row by row, dodging the hidden skulls.',
  },
  { key: 'pump', name: 'Pump', tag: 'Inflate for a bigger multiplier — bank it before it pops.' },
  { key: 'blackjack', name: 'Blackjack', tag: 'Beat the dealer to 21 without busting.' },
  { key: 'roulette', name: 'Roulette', tag: 'Chips down on the single-zero wheel.' },
]

/* A believable live-drops feed (organic handles + messy numbers — no John Doe, no 99.99%). */
type Drop = { who: string; game: string; mult: string; amount: string }
const DROPS: Drop[] = [
  { who: 'm_orozco', game: 'Crash', mult: '14.7×', amount: '$1,284.50' },
  { who: 'quietstorm', game: 'Mines', mult: '6.2×', amount: '$472.10' },
  { who: 'devon.k', game: 'Limbo', mult: '21.0×', amount: '$3,140.00' },
  { who: 'late_tilt', game: 'Plinko', mult: '3.4×', amount: '$118.75' },
  { who: 'rin__', game: 'Dragon Tower', mult: '9.1×', amount: '$905.20' },
  { who: 'big_country', game: 'Dice', mult: '2.8×', amount: '$64.40' },
]

export function ExperimentalLobby() {
  const [palette, setPalette] = useState('jade')
  const [font, setFont] = useState('grotesk')
  const [art, setArt] = useState<ArtStyle>('render')
  const [query, setQuery] = useState('')
  const [dropsLoading, setDropsLoading] = useState(true)
  // One scope for every GSAP selector below, so tweens are confined to this component
  // and useGSAP can revert them all on unmount (gsap-react skill: always pass a scope).
  const rootRef = useRef<HTMLDivElement>(null)

  // Drive the studies off <html> data-attrs so the whole CSS cascade re-themes at once.
  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = palette
    el.dataset.font = font
  }, [palette, font])

  // Simulate the live feed loading once, to exercise a real skeleton → loaded state
  // (design directive: never ship only the happy/static state). Cleaned up on unmount.
  useEffect(() => {
    const id = window.setTimeout(() => setDropsLoading(false), 900)
    return () => window.clearTimeout(id)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GAMES
    return GAMES.filter((g) => g.name.toLowerCase().includes(q))
  }, [query])

  const featured = GAMES[0] // Mines leads the floor

  // GSAP — entrance choreography + the featured parallax. Runs once; useGSAP reverts it
  // all on unmount. Selectors are scoped to rootRef so nothing outside this component is
  // touched. Honour reduced-motion by skipping entirely (elements keep their resting state).
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.7 } })
      tl.from('.exp-eyebrow', { y: 18, opacity: 0 })
        .from('.exp-hero-title', { y: 24, opacity: 0 }, '-=0.45')
        .from('.exp-hero-sub', { y: 16, opacity: 0 }, '-=0.5')
        // clearProps: 'transform' hands the buttons back to CSS after the reveal, so their
        // :active push (a CSS transform) isn't blocked by a leftover inline transform.
        .from(
          '.exp-hero-cta > *',
          { y: 14, opacity: 0, stagger: 0.08, clearProps: 'transform' },
          '-=0.45',
        )
        .from(
          '.exp-stats > div',
          { y: 14, opacity: 0, stagger: 0.08, clearProps: 'transform' },
          '-=0.4',
        )
        .from('.exp-featured', { y: 28, opacity: 0, scale: 0.985, duration: 0.85 }, '-=0.85')

      // The featured glyph drifts up a touch as the hero scrolls away — scrubbed parallax.
      gsap.to('.exp-featured-art', {
        yPercent: -16,
        ease: 'none',
        scrollTrigger: { trigger: '.exp-hero', start: 'top top', end: 'bottom top', scrub: true },
      })
    },
    { scope: rootRef },
  )

  // The floor reveals on scroll. ScrollTrigger.batch coordinates one staggered fade per
  // wave of cards entering the viewport (a clean alternative to IntersectionObserver). We
  // animate opacity only — never transform — so the cards' CSS hover-lift stays intact.
  // revertOnUpdate + the filtered.length dep re-batches cleanly whenever the search filters
  // the grid (old triggers killed, inline styles reverted, then re-created for the new set).
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const cards = gsap.utils.toArray<HTMLElement>('.exp-card')
      if (!cards.length) return
      gsap.set(cards, { opacity: 0 })
      ScrollTrigger.batch(cards, {
        start: 'top 92%',
        onEnter: (els) =>
          gsap.to(els, {
            opacity: 1,
            duration: 0.5,
            ease: 'power2.out',
            stagger: 0.06,
            overwrite: true,
          }),
      })
    },
    { scope: rootRef, dependencies: [filtered.length], revertOnUpdate: true },
  )

  return (
    <div className="exp" ref={rootRef}>
      <LabBar
        palette={palette}
        font={font}
        art={art}
        onPalette={setPalette}
        onFont={setFont}
        onArt={setArt}
      />

      <header className="exp-top">
        <a className="exp-brand" href="#">
          DimeBag<span className="exp-brand-dot">·</span>Bets
        </a>
        <nav className="exp-nav" aria-label="Primary">
          <a className="exp-nav-link is-on" href="#">
            Casino
          </a>
          <a className="exp-nav-link" href="#">
            Sportsbook
          </a>
          <a className="exp-nav-link" href="#">
            My Bets
          </a>
        </nav>
        <div className="exp-wallet">
          <span className="exp-wallet-label">Balance</span>
          <span className="exp-wallet-value">$8,420</span>
        </div>
      </header>

      <main className="exp-main">
        {/* HERO — asymmetric split (anti-center bias): claim on the left, a live featured
            game spotlight on the right. Collapses to one column on phones. */}
        <section className="exp-hero">
          <div className="exp-hero-copy">
            <span className="exp-eyebrow">Provably fair · points only</span>
            <h1 className="exp-hero-title">
              The floor is <span className="exp-hero-accent">open</span>.
            </h1>
            <p className="exp-hero-sub">
              Twelve originals on one balance. No buy-in, no cash-out — just the bet, clean and
              fast.
            </p>
            <div className="exp-hero-cta">
              <button className="exp-btn exp-btn-primary">Take a seat</button>
              <button className="exp-btn exp-btn-ghost">How it plays</button>
            </div>
            <dl className="exp-stats">
              <div>
                <dt>Originals</dt>
                <dd>12</dd>
              </div>
              <div>
                <dt>House edge</dt>
                <dd>1.2%</dd>
              </div>
              <div>
                <dt>Settled tonight</dt>
                <dd>$47.2k</dd>
              </div>
            </dl>
          </div>

          <SpotlightCard className="exp-featured">
            <span className="exp-featured-flag">Featured</span>
            <span className="exp-featured-art">
              <GameIcon kind={featured.key} variant={art} />
            </span>
            <div className="exp-featured-body">
              <h2 className="exp-featured-name">{featured.name}</h2>
              <p className="exp-featured-tag">{featured.tag}</p>
              <button className="exp-btn exp-btn-primary exp-featured-play">
                Play {featured.name}
              </button>
            </div>
          </SpotlightCard>
        </section>

        {/* LIVE DROPS — a real loading→loaded state, skeletons matched to the row size. */}
        <section className="exp-drops" aria-label="Live drops">
          <div className="exp-section-head">
            <h3 className="exp-section-title">Live drops</h3>
            <span className="exp-section-meta">updated continuously</span>
          </div>
          <div className="exp-drops-rail">
            {dropsLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div className="exp-drop is-skeleton" key={i} style={{ '--i': i } as CSSVars}>
                    <span className="exp-skel exp-skel-dot" />
                    <span className="exp-skel exp-skel-line" />
                    <span className="exp-skel exp-skel-line short" />
                  </div>
                ))
              : DROPS.map((d, i) => (
                  <div className="exp-drop" key={d.who} style={{ '--i': i } as CSSVars}>
                    <span className="exp-drop-avatar" aria-hidden="true">
                      {d.who.charAt(0).toUpperCase()}
                    </span>
                    <div className="exp-drop-meta">
                      <span className="exp-drop-who">{d.who}</span>
                      <span className="exp-drop-game">{d.game}</span>
                    </div>
                    <div className="exp-drop-win">
                      <span className="exp-drop-mult">{d.mult}</span>
                      <span className="exp-drop-amount">{d.amount}</span>
                    </div>
                  </div>
                ))}
          </div>
        </section>

        {/* THE FLOOR — the game grid (the heart of the live page), now a spotlight-hover,
            staggered-reveal gallery. Includes a search with a composed empty state. */}
        <section className="exp-floor">
          <div className="exp-section-head">
            <h3 className="exp-section-title">The floor</h3>
            <label className="exp-search">
              <SearchGlyph />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a game"
                aria-label="Find a game"
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="exp-empty">
              <EmptyGlyph />
              <p className="exp-empty-title">Nothing called “{query}”.</p>
              <p className="exp-empty-sub">
                Try a shorter word, or clear the search to see all twelve.
              </p>
              <button className="exp-btn exp-btn-ghost" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            <div className="exp-grid">
              {filtered.map((g, i) => (
                <SpotlightCard className="exp-card" key={g.key} style={{ '--i': i } as CSSVars}>
                  <span className="exp-card-art">
                    <GameIcon kind={g.key} variant={art} />
                  </span>
                  <span className="exp-card-body">
                    <span className="exp-card-name">{g.name}</span>
                    <span className="exp-card-tag">{g.tag}</span>
                    <span className="exp-card-play">Play</span>
                  </span>
                </SpotlightCard>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="exp-foot">
        <span>Play money — dollars for fun, no buy-in, no cash-out.</span>
        <span className="exp-foot-tag">Experimental redesign · not the live UI</span>
      </footer>
    </div>
  )
}

/* CSS custom props passed via inline style need a typed shape. */
type CSSVars = CSSProperties & Record<string, string | number>

/* ---------------------------------------------------------------------------
   The lab bar — the only non-product chrome. Lets the user flip palette + font live.
   --------------------------------------------------------------------------- */
const ART_STYLES: { id: ArtStyle; name: string; note: string }[] = [
  { id: 'render', name: '3D Render', note: 'Higgsfield nano-banana-2 art' },
  { id: 'glyph', name: 'Line Glyph', note: 'original SVG line-art' },
]

function LabBar({
  palette,
  font,
  art,
  onPalette,
  onFont,
  onArt,
}: {
  palette: string
  font: string
  art: ArtStyle
  onPalette: (id: string) => void
  onFont: (id: string) => void
  onArt: (id: ArtStyle) => void
}) {
  return (
    <div className="exp-lab">
      <span className="exp-lab-badge">Experiment</span>
      <div className="exp-lab-group" role="group" aria-label="Palette">
        <span className="exp-lab-label">Palette</span>
        {PALETTES.map((p) => (
          <button
            key={p.id}
            className={`exp-lab-chip ${palette === p.id ? 'is-on' : ''}`}
            onClick={() => onPalette(p.id)}
            title={p.note}
          >
            <span className="exp-lab-swatch" style={{ background: p.swatch }} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="exp-lab-group" role="group" aria-label="Type">
        <span className="exp-lab-label">Type</span>
        {FONTS.map((f) => (
          <button
            key={f.id}
            className={`exp-lab-chip ${font === f.id ? 'is-on' : ''}`}
            onClick={() => onFont(f.id)}
            title={f.note}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="exp-lab-group" role="group" aria-label="Art">
        <span className="exp-lab-label">Art</span>
        {ART_STYLES.map((a) => (
          <button
            key={a.id}
            className={`exp-lab-chip ${art === a.id ? 'is-on' : ''}`}
            onClick={() => onArt(a.id)}
            title={a.note}
          >
            {a.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Spotlight card — a cursor-tracked radial highlight + a press-to-push tactile state.
   The pointer position is written straight to CSS custom properties (no React state,
   so continuous mouse movement never triggers a re-render — per the perf guardrail).
   --------------------------------------------------------------------------- */
function SpotlightCard({
  className = '',
  style,
  children,
}: {
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  }
  return (
    <div className={`exp-spot ${className}`} style={style} onPointerMove={onMove}>
      <span className="exp-spot-glow" aria-hidden="true" />
      {children}
    </div>
  )
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function EmptyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3.5 9.5h17M8 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/* ---------------------------------------------------------------------------
   Game glyphs — copied verbatim from the live lobby's GameIcon so the study reads as
   the same product. Pure SVG, no dependency. currentColor inherits the palette accent;
   cut-outs use --bg to punch through to the card surface.
   --------------------------------------------------------------------------- */
function GameIcon({ kind, variant }: { kind: string; variant: ArtStyle }) {
  // 'render' shows the Higgsfield 3D PNG art (in /public/game-icons); 'glyph' keeps the
  // original line-art SVG so the two can be A/B'd from the lab bar before we commit the
  // renders to the live demo.
  if (variant === 'render') {
    return (
      <img
        className="exp-art-img"
        src={`/game-icons/${kind}.png`}
        alt=""
        aria-hidden="true"
        loading="lazy"
      />
    )
  }
  switch (kind) {
    case 'crash':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2c2.9 2.1 4.2 5 4.2 8 0 1.7-.4 3.2-1.1 4.5H8.9C8.2 13.2 7.8 11.7 7.8 10c0-3 1.3-5.9 4.2-8z"
            fill="currentColor"
          />
          <circle cx="12" cy="9" r="1.7" fill="var(--bg)" />
          <path d="M8.6 14 6 16.8l2.4.4z" fill="currentColor" opacity="0.6" />
          <path d="M15.4 14 18 16.8l-2.4.4z" fill="currentColor" opacity="0.6" />
          <path d="M10.4 16.2h3.2L12 21z" fill="currentColor" opacity="0.85" />
        </svg>
      )
    case 'dice':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="4.5"
            fill="currentColor"
            opacity="0.16"
          />
          <rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <g fill="currentColor">
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="16" cy="8" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="8" cy="16" r="1.5" />
            <circle cx="16" cy="16" r="1.5" />
          </g>
        </svg>
      )
    case 'limbo':
      return (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3,18 8.5,13 12,15.5 19,7" />
          <polyline points="14,7 19,7 19,12" />
        </svg>
      )
    case 'keno':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="2.2" />
            <circle cx="17" cy="7" r="2.2" />
            <circle cx="12" cy="12" r="2.2" />
            <circle cx="7" cy="17" r="2.2" />
            <circle cx="17" cy="17" r="2.2" />
          </g>
          <g fill="currentColor">
            <circle cx="12" cy="7" r="2.7" />
            <circle cx="7" cy="12" r="2.7" />
            <circle cx="17" cy="12" r="2.7" />
            <circle cx="12" cy="17" r="2.7" />
          </g>
        </svg>
      )
    case 'plinko':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="3.6" r="2.1" fill="currentColor" />
          <g fill="currentColor" opacity="0.5">
            <circle cx="12" cy="9" r="1.3" />
            <circle cx="8" cy="13.5" r="1.3" />
            <circle cx="16" cy="13.5" r="1.3" />
            <circle cx="6" cy="18" r="1.3" />
            <circle cx="12" cy="18" r="1.3" />
            <circle cx="18" cy="18" r="1.3" />
          </g>
        </svg>
      )
    case 'wheel':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.2 14.2 5.4H9.8z" fill="currentColor" />
          <circle cx="12" cy="13" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <g stroke="currentColor" strokeWidth="1.3" opacity="0.75">
            <line x1="12" y1="4.8" x2="12" y2="21.2" />
            <line x1="3.8" y1="13" x2="20.2" y2="13" />
            <line x1="6.2" y1="7.2" x2="17.8" y2="18.8" />
            <line x1="17.8" y1="7.2" x2="6.2" y2="18.8" />
          </g>
          <circle cx="12" cy="13" r="1.7" fill="currentColor" />
        </svg>
      )
    case 'hilo':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="3.5" width="14" height="17" rx="2.6" fill="currentColor" opacity="0.16" />
          <rect
            x="5"
            y="3.5"
            width="14"
            height="17"
            rx="2.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M12 6 14.6 9.6H9.4z" fill="currentColor" />
          <path d="M12 18 9.4 14.4h5.2z" fill="currentColor" opacity="0.55" />
        </svg>
      )
    case 'dragon-tower':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 1.6c1.7 1.1 2 2.9 1.1 4.4-.3-.7-.8-1-1.4-1.1.4 1.1-.2 2-.9 2.4-.7-1-.7-3.6 1.2-5.7z"
            fill="currentColor"
          />
          <rect x="5" y="16" width="14" height="4" rx="1.2" fill="currentColor" />
          <rect x="6.5" y="11" width="11" height="4" rx="1.2" fill="currentColor" opacity="0.8" />
          <rect x="8" y="6.5" width="8" height="4" rx="1.2" fill="currentColor" opacity="0.6" />
        </svg>
      )
    case 'pump':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.5c4 0 6.5 3 6.5 6.4 0 3.7-3 7-6.5 7s-6.5-3.3-6.5-7C5.5 5.5 8 2.5 12 2.5z"
            fill="currentColor"
          />
          <path d="M11 15.7h2l-.5 2.3h-1z" fill="currentColor" />
          <ellipse cx="9.6" cy="8" rx="1.5" ry="2.2" fill="#fff" opacity="0.32" />
        </svg>
      )
    case 'roulette':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle
            cx="12"
            cy="12"
            r="4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            opacity="0.7"
          />
          <g stroke="currentColor" strokeWidth="1.2" opacity="0.7">
            <line x1="12" y1="3" x2="12" y2="7.2" />
            <line x1="12" y1="16.8" x2="12" y2="21" />
            <line x1="3" y1="12" x2="7.2" y2="12" />
            <line x1="16.8" y1="12" x2="21" y2="12" />
          </g>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="5.2" r="1.4" fill="currentColor" />
        </svg>
      )
    case 'blackjack':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="9.5"
            y="4"
            width="10.5"
            height="14.5"
            rx="2"
            fill="currentColor"
            opacity="0.4"
            transform="rotate(12 14.75 11.25)"
          />
          <rect x="5" y="5.5" width="10.5" height="14.5" rx="2" fill="currentColor" />
          <path
            d="M10.2 9c1.7 1.5 2.7 2.4 2.7 3.5 0 .9-.7 1.5-1.5 1.5-.5 0-.9-.2-1.2-.6-.3.4-.7.6-1.2.6-.8 0-1.5-.6-1.5-1.5 0-1.1 1-2 2.7-3.5z"
            fill="var(--bg)"
          />
          <path d="M9.9 13.6h.6l-.3 1.6z" fill="var(--bg)" />
        </svg>
      )
    default:
      // gem (mines)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5 21.5 9 12 21.5 2.5 9z" fill="currentColor" />
          <path d="M12 2.5 21.5 9 12 11.5 2.5 9z" fill="#fff" opacity="0.28" />
          <path d="M6.6 9h10.8L12 18.6z" fill="currentColor" opacity="0.45" />
        </svg>
      )
  }
}
