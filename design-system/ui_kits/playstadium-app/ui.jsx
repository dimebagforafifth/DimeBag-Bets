/* global React */
// shadcn/ui-style primitives, brand-themed via theme.css. Minimal, self-contained
// (no Radix/Tailwind) — same component vocabulary and class structure shadcn uses.
const { useState, useRef, useEffect, useCallback } = React

const cx = (...a) => a.filter(Boolean).join(' ')

/* ---------------- Button ---------------- */
function Button({ variant = 'default', size, block, icon, className = '', children, ...rest }) {
  return (
    <button className={cx('btn', `btn-${variant}`, size && `btn-${size}`, icon && 'btn-icon', block && 'btn-block', className)} {...rest}>
      {children}
    </button>
  )
}

/* ---------------- Card ---------------- */
const Card = ({ className = '', children, ...r }) => <div className={cx('card', className)} {...r}>{children}</div>
const CardHeader = ({ className = '', children, ...r }) => <div className={cx('card-header', className)} {...r}>{children}</div>
const CardTitle = ({ className = '', children, ...r }) => <div className={cx('card-title', className)} {...r}>{children}</div>
const CardDescription = ({ className = '', children, ...r }) => <div className={cx('card-desc', className)} {...r}>{children}</div>
const CardContent = ({ className = '', children, ...r }) => <div className={cx('card-content', className)} {...r}>{children}</div>
const CardFooter = ({ className = '', children, ...r }) => <div className={cx('card-footer', className)} {...r}>{children}</div>

/* ---------------- Badge ---------------- */
function Badge({ variant = 'secondary', className = '', children, ...rest }) {
  return <span className={cx('badge', `badge-${variant}`, className)} {...rest}>{children}</span>
}
const LiveBadge = ({ children = 'Live' }) => (
  <span className="badge badge-live"><span className="dot" />{children}</span>
)

/* ---------------- Tabs (controlled) ---------------- */
function Tabs({ value, onChange, options, gold, className = '' }) {
  return (
    <div className={cx('tabs-list', className)} role="tablist">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return (
          <button key={v} role="tab" className={cx('tabs-trigger', gold && 'is-gold')} data-active={value === v} onClick={() => onChange(v)}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Input / Field ---------------- */
const Input = ({ className = '', ...r }) => <input className={cx('input', className)} {...r} />
const Field = ({ label, children }) => (
  <label className="field">{label && <span className="label">{label}</span>}{children}</label>
)
function SearchInput({ className = '', ...r }) {
  return (
    <div className={cx('search', className)}>
      <Icon name="search" size={16} />
      <input className="input" {...r} />
    </div>
  )
}

/* ---------------- Avatar ---------------- */
function Avatar({ name = '', src, size = '', className = '' }) {
  const initial = (name.trim()[0] || '?').toUpperCase()
  return <span className={cx('avatar', size, className)}>{src ? <img src={src} alt={name} /> : initial}</span>
}

/* ---------------- Progress / Switch / Separator ---------------- */
const Progress = ({ value = 0, className = '' }) => (
  <div className={cx('progress', className)}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
)
const Switch = ({ checked, onChange }) => (
  <button type="button" className="switch" data-on={!!checked} onClick={() => onChange && onChange(!checked)} role="switch" aria-checked={!!checked}><span /></button>
)
const Separator = ({ vertical, className = '' }) => <div className={cx(vertical ? 'sep-v' : 'sep', className)} />

/* ---------------- Stat tile ---------------- */
function Stat({ label, value, delta, deltaTone, className = '' }) {
  return (
    <div className={cx('stat', className)}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {delta != null && (
        <span className={cx('stat-delta', deltaTone === 'up' && 'up', deltaTone === 'down' && 'down')}>
          {deltaTone && <Icon name={deltaTone === 'up' ? 'trending-up' : 'trending-down'} size={13} />}
          {delta}
        </span>
      )}
    </div>
  )
}

/* ---------------- Placeholder (image slot) ---------------- */
const Placeholder = ({ label = 'Image', className = '', style }) => (
  <div className={cx('ph', className)} style={style}><span className="ph-tag">{label}</span></div>
)

/* ---------------- Dropdown menu ---------------- */
function Dropdown({ trigger, children, align = 'start', menuClassName = '', width }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])
  const pos = align === 'end' ? { right: 0 } : { left: 0 }
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex' }}>{trigger}</div>
      {open && (
        <div className={cx('menu', menuClassName)} style={{ top: 'calc(100% + 6px)', minWidth: width, ...pos }} onClick={(e) => { if (e.target.closest('.menu-item')) setOpen(false) }}>
          {children}
        </div>
      )}
    </div>
  )
}
function MenuItem({ icon, active, right, children, ...rest }) {
  return (
    <button className="menu-item" data-active={!!active} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
      {right != null && <span className="right">{right}</span>}
    </button>
  )
}
const MenuLabel = ({ children }) => <div className="menu-label">{children}</div>
const MenuSep = () => <div className="menu-sep" />

/* ---------------- Dialog / Sheet ---------------- */
function Dialog({ open, onClose, children, sheet }) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e) => { if (e.key === 'Escape') onClose && onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])
  if (!open) return null
  return (
    <React.Fragment>
      <div className="overlay" onClick={onClose} />
      <div className={sheet ? 'sheet' : 'dialog'} role="dialog" aria-modal="true">{children}</div>
    </React.Fragment>
  )
}

/* ---------------- Tooltip ---------------- */
const Tooltip = ({ label, children }) => (
  <span className="tip">{children}<span className="tip-body">{label}</span></span>
)

Object.assign(window, {
  cx, Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Badge, LiveBadge, Tabs, Input, Field, SearchInput, Avatar, Progress, Switch, Separator,
  Stat, Placeholder, Dropdown, MenuItem, MenuLabel, MenuSep, Dialog, Tooltip,
})
