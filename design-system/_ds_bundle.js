/* @ds-bundle: {"format":3,"namespace":"PlayStadiumDesignSystem_e4e367","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"Chip","sourcePath":"components/buttons/Chip.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"GameCard","sourcePath":"components/data/GameCard.jsx"},{"name":"Stat","sourcePath":"components/data/Stat.jsx"},{"name":"WalletPill","sourcePath":"components/data/WalletPill.jsx"},{"name":"BetSlip","sourcePath":"components/sportsbook/BetSlip.jsx"},{"name":"EventRow","sourcePath":"components/sportsbook/EventRow.jsx"},{"name":"OddsButton","sourcePath":"components/sportsbook/OddsButton.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"78cc86cd29a8","components/buttons/Chip.jsx":"61527537d6f2","components/data/Badge.jsx":"97c77a3c287f","components/data/GameCard.jsx":"5fd58e48f547","components/data/Stat.jsx":"c97e1f62b27a","components/data/WalletPill.jsx":"8161e2d5379f","components/sportsbook/BetSlip.jsx":"cd9fe771a383","components/sportsbook/EventRow.jsx":"6bed1bd304da","components/sportsbook/OddsButton.jsx":"bddb6a8e118d","ui_kits/casino-lobby/App.jsx":"6e4bb4a2849f","ui_kits/casino-lobby/GameDrawer.jsx":"b88d3f3b0f47","ui_kits/casino-lobby/Header.jsx":"affaeee1755e","ui_kits/casino-lobby/Lobby.jsx":"9e49cf099f1b","ui_kits/casino-lobby/games.js":"1cdccac1e44b","ui_kits/playstadium-app/AccountScreens.jsx":"6b93f292a04f","ui_kits/playstadium-app/Auth.jsx":"ec48828de475","ui_kits/playstadium-app/AuthApp.jsx":"cf374455722b","ui_kits/playstadium-app/CasinoScreens.jsx":"216b0ffa89ed","ui_kits/playstadium-app/ConsoleScreens.jsx":"e2ab34ee0de7","ui_kits/playstadium-app/OnboardingManager.jsx":"429dae073b49","ui_kits/playstadium-app/OnboardingPlayer.jsx":"8b0b7a26ba88","ui_kits/playstadium-app/PlayStadiumApp.jsx":"df55910cd976","ui_kits/playstadium-app/Shell.jsx":"743d6c9983bb","ui_kits/playstadium-app/Sportsbook.jsx":"8cc855c44981","ui_kits/playstadium-app/data.js":"231b8ff79338","ui_kits/playstadium-app/icons.jsx":"e8f0a3f3c493","ui_kits/playstadium-app/ui.jsx":"2235537c15c2","ui_kits/sportsbook/SportsbookApp.jsx":"c3dca419aa08","ui_kits/sportsbook/events.js":"8d76805138bc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PlayStadiumDesignSystem_e4e367 = window.PlayStadiumDesignSystem_e4e367 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Self-contained: inject the component's CSS once per page load. Styling hangs off
// the global Stadium tokens (styles.css), so the button re-themes with the system.
const CSS = `
.sds-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-body); font-weight: 700; letter-spacing: 0.2px;
  border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
  white-space: nowrap; text-decoration: none;
  transition: background var(--dur) ease, border-color var(--dur) ease,
    box-shadow var(--dur) ease, transform 0.05s ease, color var(--dur) ease;
}
.sds-btn:active:not(:disabled) { transform: translateY(1px); }
.sds-btn:disabled { opacity: 0.5; cursor: default; }
.sds-btn:focus-visible { outline: none; box-shadow: var(--ring); }

/* sizes */
.sds-btn--sm { padding: 8px 14px; font-size: var(--text-sm); }
.sds-btn--md { padding: 12px 20px; font-size: var(--text-md); }
.sds-btn--lg { padding: 14px 26px; font-size: var(--text-lg); }

/* the one confident gold CTA */
.sds-btn--primary { background: var(--gold); color: var(--on-gold); }
.sds-btn--primary:hover:not(:disabled) { background: var(--gold-bright); box-shadow: var(--elev-gold); }

/* quiet ghost — graphite surface, hairline border */
.sds-btn--ghost { background: var(--surface-2); color: var(--text); border-color: var(--line); }
.sds-btn--ghost:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); background: var(--surface); }

/* text-only */
.sds-btn--text { background: transparent; color: var(--muted); }
.sds-btn--text:hover:not(:disabled) { color: var(--text); }

/* destructive / stop */
.sds-btn--danger { background: var(--red); color: #fff; }
.sds-btn--danger:hover:not(:disabled) { background: var(--red-press); }

.sds-btn--block { width: 100%; }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-button-css')) {
  const s = document.createElement('style');
  s.id = 'sds-button-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * The Stadium button. One confident gold primary, a quiet ghost, a text variant
 * and a destructive "stop". Renders as <a> when `href` is given.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  href,
  className = '',
  ...rest
}) {
  const cls = ['sds-btn', `sds-btn--${variant}`, `sds-btn--${size}`, block ? 'sds-btn--block' : '', className].filter(Boolean).join(' ');
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    href: href
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.sds-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-num); font-variant-numeric: tabular-nums;
  background: var(--surface-2); border: 1px solid var(--line); color: var(--muted);
  border-radius: var(--radius-sm); padding: 5px 10px; font-size: var(--text-xs);
  cursor: pointer; transition: color var(--dur) ease, border-color var(--dur) ease, background var(--dur) ease;
}
.sds-chip:hover:not(:disabled) { color: var(--text); }
.sds-chip[aria-pressed="true"], .sds-chip.is-on {
  color: var(--gem); border-color: rgba(var(--gem-glow), 0.4);
  background: color-mix(in srgb, var(--gem) 8%, var(--surface-2));
}
.sds-chip:disabled { opacity: 0.5; cursor: default; }
.sds-chip:focus-visible { outline: none; box-shadow: var(--ring); }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-chip-css')) {
  const s = document.createElement('style');
  s.id = 'sds-chip-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * A small selectable token — bet presets (½, 2×, Max), quick filters. Gold-gem
 * highlight when `active`.
 */
function Chip({
  children,
  active = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ['sds-chip', className].filter(Boolean).join(' '),
    "aria-pressed": active
  }, rest), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Chip.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.sds-badge { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-label); font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 3px 9px; border-radius: var(--radius-pill); border: 1px solid transparent; }
.sds-badge--gold { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 40%, transparent); background: color-mix(in srgb, var(--gold) 10%, transparent); }
.sds-badge--solid { color: var(--on-gold); background: var(--gold); }
.sds-badge--live { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }
.sds-badge--live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 30%, transparent); }
.sds-badge--neutral { color: var(--muted); border-color: var(--line); background: var(--surface-2); }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-badge-css')) {
  const s = document.createElement('style');
  s.id = 'sds-badge-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** A small status pill — Featured, Live, Provably fair, etc. */
function Badge({
  children,
  variant = 'gold',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['sds-badge', `sds-badge--${variant}`, className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/GameCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-gamecard-css')) {
  const s = document.createElement('style');
  s.id = 'sds-gamecard-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * A lobby game tile: the 3D icon over a gold-tinted gradient, name, one-line tag,
 * and a "Play →" that slides in on hover. Pass `icon` (an <img> src) or `children`.
 */
function GameCard({
  name,
  tag,
  icon,
  iconAlt = '',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ['sds-gamecard', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "sds-gamecard__art"
  }, icon ? /*#__PURE__*/React.createElement("img", {
    src: icon,
    alt: iconAlt
  }) : null), /*#__PURE__*/React.createElement("span", {
    className: "sds-gamecard__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sds-gamecard__name"
  }, name), tag ? /*#__PURE__*/React.createElement("span", {
    className: "sds-gamecard__tag"
  }, tag) : null, /*#__PURE__*/React.createElement("span", {
    className: "sds-gamecard__play"
  }, "Play \u2192")));
}
Object.assign(__ds_scope, { GameCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/GameCard.jsx", error: String((e && e.message) || e) }); }

// components/data/Stat.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.sds-stat { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 12px; }
.sds-stat__label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
.sds-stat__value { display: block; margin-top: 2px; font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 800; font-size: 18px; letter-spacing: -0.01em; color: var(--text); }
.sds-stat__value.is-hot { color: var(--gem); }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-stat-css')) {
  const s = document.createElement('style');
  s.id = 'sds-stat-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** A compact readout box — a labelled figure. `hot` paints the value gold (a live multiplier / treasure). */
function Stat({
  label,
  value,
  hot = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['sds-stat', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "sds-stat__label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: `sds-stat__value ${hot ? 'is-hot' : ''}`
  }, value));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Stat.jsx", error: String((e && e.message) || e) }); }

// components/data/WalletPill.jsx
try { (() => {
const CSS = `
.sds-wallet { display: inline-flex; align-items: stretch; gap: 14px; padding: 6px 14px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--sheen); }
.sds-wallet__block { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.sds-wallet__block + .sds-wallet__block { padding-left: 14px; border-left: 1px solid var(--line); }
.sds-wallet__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--faint); }
.sds-wallet__value { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; color: var(--text); letter-spacing: -0.01em; }
.sds-wallet__block--primary .sds-wallet__value { font-size: 16px; color: var(--gold-bright); }
.sds-wallet__value.is-up { color: var(--green); }
.sds-wallet__value.is-down { color: var(--red); }
.sds-wallet__value.is-even { color: var(--muted); font-weight: 600; }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-wallet-css')) {
  const s = document.createElement('style');
  s.id = 'sds-wallet-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * The header "wallet" unit: the headline balance a player can bet right now, with
 * their week win/loss standing alongside as a plain up/down. `weekCents` drives the
 * arrow + colour automatically.
 */
function WalletPill({
  balance,
  label = 'Available',
  weekLabel = 'This week',
  weekCents
}) {
  const tone = weekCents > 0 ? 'is-up' : weekCents < 0 ? 'is-down' : 'is-even';
  const arrow = weekCents > 0 ? '▲ ' : weekCents < 0 ? '▼ ' : '';
  const fmt = c => '$' + Math.abs(c / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "sds-wallet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sds-wallet__block sds-wallet__block--primary"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sds-wallet__label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "sds-wallet__value"
  }, balance)), /*#__PURE__*/React.createElement("div", {
    className: "sds-wallet__block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sds-wallet__label"
  }, weekLabel), /*#__PURE__*/React.createElement("span", {
    className: `sds-wallet__value ${tone}`
  }, weekCents === 0 ? 'Even' : `${arrow}${fmt(weekCents)}`)));
}
Object.assign(__ds_scope, { WalletPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/WalletPill.jsx", error: String((e && e.message) || e) }); }

// components/sportsbook/BetSlip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.sds-slip { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--elev-2); width: 320px; max-width: 100%; }
.sds-slip__head { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.sds-slip__title { font-family: var(--font-head); text-transform: uppercase; letter-spacing: var(--tracking-caps); font-size: 17px; font-weight: 700; color: var(--text); }
.sds-slip__count { font-family: var(--font-num); font-size: 11px; font-weight: 700; color: var(--on-gold); background: var(--gold); border-radius: var(--radius-pill); min-width: 20px; height: 20px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; }
.sds-slip__mode { margin-left: auto; display: flex; gap: 2px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 2px; }
.sds-slip__mode button { font-family: var(--font-label); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: none; border: 0; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.sds-slip__mode button.on { color: var(--on-gold); background: var(--gold); }

.sds-slip__list { display: flex; flex-direction: column; gap: 8px; padding: 12px; max-height: 320px; overflow-y: auto; }
.sds-slip__empty { padding: 36px 16px; text-align: center; color: var(--faint); font-size: 13px; }
.sds-pick { position: relative; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 34px 10px 12px; }
.sds-pick__pick { font-family: var(--font-head); font-size: 14px; font-weight: 600; color: var(--text); }
.sds-pick__event { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
.sds-pick__price { position: absolute; top: 10px; right: 30px; font-family: var(--font-num); font-weight: 700; font-size: 13px; color: var(--gold-bright); }
.sds-pick__x { position: absolute; top: 8px; right: 8px; width: 18px; height: 18px; border: 0; background: none; color: var(--faint); cursor: pointer; font-size: 13px; line-height: 1; border-radius: 4px; }
.sds-pick__x:hover { color: var(--red); }

.sds-slip__foot { border-top: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.sds-slip__stake { display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0 12px; height: 44px; }
.sds-slip__stake:focus-within { border-color: var(--gold); }
.sds-slip__stake label { font-family: var(--font-label); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); }
.sds-slip__stake input { flex: 1; min-width: 0; background: none; border: 0; outline: none; text-align: right; font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 16px; color: var(--text); }
.sds-slip__stake .unit { font-family: var(--font-num); font-size: 12px; color: var(--muted); }
.sds-slip__rows { display: flex; flex-direction: column; gap: 5px; }
.sds-slip__row { display: flex; justify-content: space-between; font-size: 12.5px; }
.sds-slip__row .k { color: var(--muted); }
.sds-slip__row .v { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text); }
.sds-slip__row--return .k { color: var(--text); font-weight: 600; }
.sds-slip__row--return .v { color: var(--gold-bright); font-size: 16px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-slip-css')) {
  const s = document.createElement('style');
  s.id = 'sds-slip-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * The bet slip surface. Lists selections (each with a remove ✕), takes a points
 * stake, and shows combined odds + potential return live. Toggle Single / Parlay.
 * `selections` = [{ id, pick, event, price }] where price is decimal odds.
 */
function BetSlip({
  selections = [],
  stake = 100,
  mode = 'parlay',
  onStakeChange,
  onRemove,
  onModeChange,
  onPlace,
  className = '',
  ...rest
}) {
  const combined = selections.reduce((acc, s) => acc * (Number(s.price) || 1), 1);
  const ret = mode === 'parlay' ? stake * combined : selections.reduce((acc, s) => acc + stake * (Number(s.price) || 1), 0);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  return /*#__PURE__*/React.createElement("aside", _extends({
    className: ['sds-slip', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sds-slip__title"
  }, "Bet slip"), selections.length > 0 ? /*#__PURE__*/React.createElement("span", {
    className: "sds-slip__count"
  }, selections.length) : null, selections.length > 1 ? /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__mode"
  }, /*#__PURE__*/React.createElement("button", {
    className: mode === 'single' ? 'on' : '',
    onClick: () => onModeChange && onModeChange('single')
  }, "Singles"), /*#__PURE__*/React.createElement("button", {
    className: mode === 'parlay' ? 'on' : '',
    onClick: () => onModeChange && onModeChange('parlay')
  }, "Parlay")) : null), selections.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__empty"
  }, "Tap any odds to add a pick.", /*#__PURE__*/React.createElement("br", null), "Casino & sportsbook share one balance.") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__list"
  }, selections.map(s => /*#__PURE__*/React.createElement("div", {
    className: "sds-pick",
    key: s.id
  }, /*#__PURE__*/React.createElement("button", {
    className: "sds-pick__x",
    onClick: () => onRemove && onRemove(s),
    "aria-label": "Remove"
  }, "\u2715"), /*#__PURE__*/React.createElement("div", {
    className: "sds-pick__pick"
  }, s.pick), /*#__PURE__*/React.createElement("div", {
    className: "sds-pick__event"
  }, s.event), /*#__PURE__*/React.createElement("div", {
    className: "sds-pick__price"
  }, Number(s.price).toFixed(2))))), /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__stake"
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: "sds-stake"
  }, "Stake"), /*#__PURE__*/React.createElement("input", {
    id: "sds-stake",
    type: "number",
    value: stake,
    onChange: e => onStakeChange && onStakeChange(Number(e.target.value))
  }), /*#__PURE__*/React.createElement("span", {
    className: "unit"
  }, "pts")), /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__rows"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, mode === 'parlay' ? 'Combined odds' : 'Selections'), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, mode === 'parlay' ? combined.toFixed(2) : selections.length)), /*#__PURE__*/React.createElement("div", {
    className: "sds-slip__row sds-slip__row--return"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Potential return"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, fmt(ret), " pts"))), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    size: "lg",
    block: true,
    onClick: () => onPlace && onPlace()
  }, "Place bet \xB7 ", fmt(stake), " pts"))));
}
Object.assign(__ds_scope, { BetSlip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sportsbook/BetSlip.jsx", error: String((e && e.message) || e) }); }

// components/sportsbook/OddsButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.sds-odds {
  display: flex; flex-direction: column; align-items: stretch; justify-content: center;
  gap: 2px; min-width: 64px; padding: 8px 10px; cursor: pointer;
  font-family: var(--font-body); background: var(--surface-2);
  border: 1px solid var(--line); border-radius: var(--radius-sm);
  transition: border-color var(--dur) ease, background var(--dur) ease, transform 0.05s ease;
}
.sds-odds:hover:not(:disabled) { border-color: color-mix(in srgb, var(--gold) 50%, var(--line)); }
.sds-odds:active:not(:disabled) { transform: translateY(1px); }
.sds-odds:focus-visible { outline: none; box-shadow: var(--ring); }
.sds-odds:disabled { opacity: 0.45; cursor: default; }
.sds-odds__label { font-size: 11px; color: var(--muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sds-odds__price { font-family: var(--font-num); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 15px; color: var(--text); text-align: center; }
.sds-odds__move { font-size: 10px; text-align: center; height: 10px; line-height: 10px; }
.sds-odds__move.up { color: var(--green); }
.sds-odds__move.down { color: var(--red); }

/* selected — the one gold hit */
.sds-odds[aria-pressed="true"] {
  background: color-mix(in srgb, var(--gold) 14%, var(--surface-2));
  border-color: var(--gold);
}
.sds-odds[aria-pressed="true"] .sds-odds__price { color: var(--gold-bright); }
.sds-odds[aria-pressed="true"] .sds-odds__label { color: var(--gold); }
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-odds-css')) {
  const s = document.createElement('style');
  s.id = 'sds-odds-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * A single tappable odds cell for the sportsbook: a market label over a price.
 * Selected = the one gold hit. `move` shows a tiny ▲/▼ when a price drifts.
 */
function OddsButton({
  label,
  price,
  selected = false,
  move,
  disabled = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: ['sds-odds', className].filter(Boolean).join(' '),
    "aria-pressed": selected,
    disabled: disabled
  }, rest), label ? /*#__PURE__*/React.createElement("span", {
    className: "sds-odds__label"
  }, label) : null, /*#__PURE__*/React.createElement("span", {
    className: "sds-odds__price"
  }, price), /*#__PURE__*/React.createElement("span", {
    className: `sds-odds__move ${move || ''}`
  }, move === 'up' ? '▲' : move === 'down' ? '▼' : ''));
}
Object.assign(__ds_scope, { OddsButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sportsbook/OddsButton.jsx", error: String((e && e.message) || e) }); }

// components/sportsbook/EventRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.sds-event {
  display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
  padding: 14px 16px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); transition: border-color var(--dur) ease;
}
.sds-event:hover { border-color: color-mix(in srgb, var(--line) 60%, var(--gold)); }
.sds-event__meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sds-event__league { font-family: var(--font-label); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); }
.sds-event__time { font-family: var(--font-num); font-size: 11px; color: var(--muted); margin-left: auto; }
.sds-event__live { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-label); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--green); }
.sds-event__live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 28%, transparent); }
.sds-event__teams { display: flex; flex-direction: column; gap: 4px; }
.sds-event__team { display: flex; align-items: baseline; gap: 8px; }
.sds-event__name { font-family: var(--font-head); font-size: 17px; font-weight: 600; color: var(--text); letter-spacing: 0.2px; }
.sds-event__score { font-family: var(--font-num); font-weight: 700; font-size: 15px; color: var(--gold-bright); margin-left: auto; }
.sds-event__markets { display: flex; gap: 8px; }
.sds-event__markets .sds-event__col { display: flex; flex-direction: column; gap: 4px; }
.sds-event__collabel { font-family: var(--font-label); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); text-align: center; }
@media (max-width: 560px) {
  .sds-event { grid-template-columns: 1fr; }
  .sds-event__markets { justify-content: stretch; }
  .sds-event__markets .sds-event__col { flex: 1; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('sds-event-css')) {
  const s = document.createElement('style');
  s.id = 'sds-event-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * A sportsbook event row: league + start time (or LIVE + score), the two
 * competitors, and a set of market columns each holding tappable OddsButtons.
 * `markets` = [{ heading, options: [{ id, label, price, move }] }]. `selectedId`
 * marks the chosen pick; `onPick(option, market)` fires on tap.
 */
function EventRow({
  league,
  time,
  live = false,
  home,
  away,
  score,
  markets = [],
  selectedId,
  onPick,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['sds-event', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sds-event__meta"
  }, live ? /*#__PURE__*/React.createElement("span", {
    className: "sds-event__live"
  }, "Live") : /*#__PURE__*/React.createElement("span", {
    className: "sds-event__league"
  }, league), !live && league ? /*#__PURE__*/React.createElement("span", {
    className: "sds-event__league",
    style: {
      color: 'var(--muted)'
    }
  }, home?.sport) : null, /*#__PURE__*/React.createElement("span", {
    className: "sds-event__time"
  }, time)), /*#__PURE__*/React.createElement("div", {
    className: "sds-event__teams"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sds-event__team"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sds-event__name"
  }, home?.name ?? home), score ? /*#__PURE__*/React.createElement("span", {
    className: "sds-event__score"
  }, score.home) : null), /*#__PURE__*/React.createElement("div", {
    className: "sds-event__team"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sds-event__name"
  }, away?.name ?? away), score ? /*#__PURE__*/React.createElement("span", {
    className: "sds-event__score"
  }, score.away) : null))), /*#__PURE__*/React.createElement("div", {
    className: "sds-event__markets"
  }, markets.map((m, i) => /*#__PURE__*/React.createElement("div", {
    className: "sds-event__col",
    key: m.heading || i
  }, m.heading ? /*#__PURE__*/React.createElement("span", {
    className: "sds-event__collabel"
  }, m.heading) : null, m.options.map(o => /*#__PURE__*/React.createElement(__ds_scope.OddsButton, {
    key: o.id,
    label: o.label,
    price: o.price,
    move: o.move,
    selected: selectedId === o.id,
    onClick: () => onPick && onPick(o, m)
  }))))));
}
Object.assign(__ds_scope, { EventRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/sportsbook/EventRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/casino-lobby/App.jsx
try { (() => {
/* global React, StadiumHeader, FeaturedHero, OriginalsGrid, GameDrawer */
// Stadium casino lobby — interactive demo. Click a tile (or "Take a seat") to
// open the bet drawer; placing a bet settles points into the wallet.

function StadiumLobby() {
  const games = window.STADIUM_GAMES;
  const [section, setSection] = React.useState('Lobby');
  const [active, setActive] = React.useState(null); // game in drawer
  const [balanceCents, setBalanceCents] = React.useState(842000);
  const [weekCents, setWeekCents] = React.useState(31200);
  const featured = games.filter(g => g.featured);
  const hot = games.filter(g => g.hot);
  const fmt = c => '$' + (c / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0
  });
  const settle = deltaCents => {
    setBalanceCents(b => Math.max(0, b + deltaCents));
    setWeekCents(w => w + deltaCents);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "sl-app"
  }, /*#__PURE__*/React.createElement(StadiumHeader, {
    section: section,
    onSection: setSection,
    balance: fmt(balanceCents),
    weekCents: weekCents
  }), /*#__PURE__*/React.createElement("main", {
    className: "sl-main"
  }, /*#__PURE__*/React.createElement(FeaturedHero, {
    game: featured[0],
    onPlay: setActive
  }), hot.length > 0 && /*#__PURE__*/React.createElement(OriginalsGrid, {
    title: "Hot right now",
    games: hot,
    onPlay: setActive
  }), /*#__PURE__*/React.createElement(OriginalsGrid, {
    title: "All 21 originals",
    games: games,
    onPlay: setActive
  })), /*#__PURE__*/React.createElement("footer", {
    className: "sl-foot"
  }, /*#__PURE__*/React.createElement("span", null, "PlayStadium plays in points \u2014 play-money, never cash."), /*#__PURE__*/React.createElement("span", null, "Provably fair \xB7 21 originals")), /*#__PURE__*/React.createElement(GameDrawer, {
    game: active,
    onClose: () => setActive(null),
    onSettle: settle
  }));
}
window.StadiumLobby = StadiumLobby;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/casino-lobby/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/casino-lobby/GameDrawer.jsx
try { (() => {
/* global React */
// The bet drawer that slides in when a game is opened. A faked but believable
// bet flow: set amount with Chips, place a bet, see a settled result update the
// wallet. Composes Button, Chip, Stat from the design system.
const {
  Button,
  Chip,
  Stat,
  Badge
} = window.PlayStadiumDesignSystem_e4e367;
function GameDrawer({
  game,
  onClose,
  onSettle
}) {
  const [amount, setAmount] = React.useState(50);
  const [phase, setPhase] = React.useState('idle'); // idle | rolling | won | lost
  const [result, setResult] = React.useState(null);
  React.useEffect(() => {
    setPhase('idle');
    setResult(null);
  }, [game && game.id]);
  if (!game) return null;
  const presets = [10, 50, 100, 250];
  const place = () => {
    setPhase('rolling');
    setTimeout(() => {
      const win = Math.random() > 0.5;
      const mult = win ? +(1 + Math.random() * 9).toFixed(2) : 0;
      const delta = win ? Math.round(amount * (mult - 1)) : -amount;
      setResult({
        win,
        mult,
        delta
      });
      setPhase(win ? 'won' : 'lost');
      onSettle(delta * 100); // cents
    }, 1100);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "sl-scrim",
    onClick: onClose
  }), /*#__PURE__*/React.createElement("aside", {
    className: "sl-drawer",
    role: "dialog",
    "aria-label": game.name
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-drawer__head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-drawer__id"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sl-drawer__icon"
  }, /*#__PURE__*/React.createElement("img", {
    src: game.icon,
    alt: ""
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "sl-drawer__name"
  }, game.name), /*#__PURE__*/React.createElement(Badge, {
    variant: "gold"
  }, "Provably fair"))), /*#__PURE__*/React.createElement("button", {
    className: "sl-drawer__close",
    onClick: onClose,
    "aria-label": "Close"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: 'sl-stage sl-stage--' + phase
  }, phase === 'idle' && /*#__PURE__*/React.createElement("span", {
    className: "sl-stage__hint"
  }, "Set your stake and place a bet"), phase === 'rolling' && /*#__PURE__*/React.createElement("span", {
    className: "sl-stage__roll"
  }, "Rolling\u2026"), phase === 'won' && /*#__PURE__*/React.createElement("div", {
    className: "sl-stage__out sl-stage__out--win"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sl-stage__mult"
  }, result.mult, "\xD7"), /*#__PURE__*/React.createElement("span", {
    className: "sl-stage__delta"
  }, "+", result.delta, " pts")), phase === 'lost' && /*#__PURE__*/React.createElement("div", {
    className: "sl-stage__out sl-stage__out--loss"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sl-stage__mult"
  }, "0\xD7"), /*#__PURE__*/React.createElement("span", {
    className: "sl-stage__delta"
  }, result.delta, " pts"))), /*#__PURE__*/React.createElement("div", {
    className: "sl-bet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-bet__label"
  }, "Bet amount"), /*#__PURE__*/React.createElement("div", {
    className: "sl-bet__amount"
  }, amount.toLocaleString(), " pts"), /*#__PURE__*/React.createElement("div", {
    className: "sl-bet__presets"
  }, presets.map(p => /*#__PURE__*/React.createElement(Chip, {
    key: p,
    active: amount === p,
    onClick: () => setAmount(p)
  }, p)), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setAmount(a => Math.round(a / 2) || 1)
  }, "\xBD"), /*#__PURE__*/React.createElement(Chip, {
    onClick: () => setAmount(a => a * 2)
  }, "2\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "sl-bet__stats"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "On win (max)",
    value: '+' + (amount * 9).toLocaleString(),
    hot: true
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "House edge",
    value: "1.0%"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: phase === 'rolling' ? 'ghost' : 'primary',
    size: "lg",
    block: true,
    disabled: phase === 'rolling',
    onClick: place
  }, phase === 'rolling' ? 'Rolling…' : phase === 'idle' ? 'Place bet' : 'Bet again'))));
}
window.GameDrawer = GameDrawer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/casino-lobby/GameDrawer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/casino-lobby/Header.jsx
try { (() => {
/* global React */
// Stadium app header: wordmark (Slight Chance), section nav, search, and the
// live WalletPill from the design system.
const {
  WalletPill
} = window.PlayStadiumDesignSystem_e4e367;
function StadiumHeader({
  section,
  onSection,
  balance,
  weekCents
}) {
  const tabs = ['Lobby', 'Originals', 'Live', 'Races'];
  return /*#__PURE__*/React.createElement("header", {
    className: "sl-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-header__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-brand"
  }, /*#__PURE__*/React.createElement("img", {
    className: "sl-brand__mark",
    src: "../../assets/logo/playstadium-chip-logo.png",
    alt: "PlayStadium.io"
  }), /*#__PURE__*/React.createElement("span", {
    className: "sl-brand__name"
  }, "PlayStadium")), /*#__PURE__*/React.createElement("nav", {
    className: "sl-nav"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: 'sl-nav__tab' + (section === t ? ' is-active' : ''),
    onClick: () => onSection(t)
  }, t))), /*#__PURE__*/React.createElement("div", {
    className: "sl-header__right"
  }, /*#__PURE__*/React.createElement("label", {
    className: "sl-search"
  }, /*#__PURE__*/React.createElement("span", {
    className: "sl-search__icon",
    "aria-hidden": "true"
  }, "\u2315"), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search 21 originals"
  })), /*#__PURE__*/React.createElement(WalletPill, {
    balance: balance,
    weekCents: weekCents
  }))));
}
window.StadiumHeader = StadiumHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/casino-lobby/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/casino-lobby/Lobby.jsx
try { (() => {
/* global React */
// The lobby body: a featured hero strip + the full Originals grid of GameCards.
const {
  GameCard,
  Badge,
  Button,
  Stat
} = window.PlayStadiumDesignSystem_e4e367;
function FeaturedHero({
  game,
  onPlay
}) {
  if (!game) return null;
  return /*#__PURE__*/React.createElement("section", {
    className: "sl-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-hero__copy"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-hero__eyebrow"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "solid"
  }, "Featured tonight"), /*#__PURE__*/React.createElement(Badge, {
    variant: "live"
  }, "2,481 playing")), /*#__PURE__*/React.createElement("h1", {
    className: "sl-hero__title"
  }, game.name), /*#__PURE__*/React.createElement("p", {
    className: "sl-hero__tag"
  }, game.tag), /*#__PURE__*/React.createElement("div", {
    className: "sl-hero__stats"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Top win tonight",
    value: "312\xD7",
    hot: true
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "House edge",
    value: "1.0%"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Provably fair",
    value: "Yes"
  })), /*#__PURE__*/React.createElement("div", {
    className: "sl-hero__cta"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: () => onPlay(game)
  }, "Take a seat"), /*#__PURE__*/React.createElement(Button, {
    variant: "text"
  }, "How it plays \u2192"))), /*#__PURE__*/React.createElement("div", {
    className: "sl-hero__art"
  }, /*#__PURE__*/React.createElement("img", {
    src: game.icon,
    alt: game.name
  })));
}
function OriginalsGrid({
  title,
  games,
  onPlay
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "sl-section"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-section__head"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "sl-section__title"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "sl-section__count"
  }, games.length, " games")), /*#__PURE__*/React.createElement("div", {
    className: "sl-grid"
  }, games.map(g => /*#__PURE__*/React.createElement(GameCard, {
    key: g.id,
    name: g.name,
    tag: g.tag,
    icon: g.icon,
    iconAlt: g.name,
    onClick: () => onPlay(g)
  }))));
}
window.FeaturedHero = FeaturedHero;
window.OriginalsGrid = OriginalsGrid;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/casino-lobby/Lobby.jsx", error: String((e && e.message) || e) }); }

// ui_kits/casino-lobby/games.js
try { (() => {
// Stadium lobby — the 21 Originals. Icons live in /assets/game-icons.
const ICON = '../../assets/game-icons/';
window.STADIUM_GAMES = [{
  id: 'crash',
  name: 'Crash',
  tag: 'Ride the curve. Bank it before it cuts out.',
  icon: ICON + 'crash.png',
  featured: true,
  hot: true
}, {
  id: 'mines',
  name: 'Mines',
  tag: 'Uncover gems for a rising multiplier.',
  icon: ICON + 'mines.png',
  featured: true,
  hot: true
}, {
  id: 'plinko',
  name: 'Plinko',
  tag: 'Drop the ball. Watch it find its multiplier.',
  icon: ICON + 'plinko.png',
  featured: true
}, {
  id: 'dice',
  name: 'Dice',
  tag: 'Roll over or under. Set your own edge.',
  icon: ICON + 'dice.png',
  hot: true
}, {
  id: 'limbo',
  name: 'Limbo',
  tag: 'Pick a target. Beat it for the payout.',
  icon: ICON + 'limbo.png'
}, {
  id: 'wheel',
  name: 'Wheel',
  tag: 'Spin the wheel. Land a multiplier.',
  icon: ICON + 'wheel.png'
}, {
  id: 'keno',
  name: 'Keno',
  tag: 'Mark your spots. Match the draw.',
  icon: ICON + 'keno.png'
}, {
  id: 'hilo',
  name: 'Hi-Lo',
  tag: 'Higher or lower — stack the streak.',
  icon: ICON + 'hilo.png'
}, {
  id: 'dragon-tower',
  name: 'Dragon Tower',
  tag: 'Climb the tower. Dodge the dragons.',
  icon: ICON + 'dragon-tower.png'
}, {
  id: 'pump',
  name: 'Pump',
  tag: 'Pump it up. Cash out before it pops.',
  icon: ICON + 'pump.png',
  hot: true
}, {
  id: 'chickenroad',
  name: 'Chicken Road',
  tag: 'Cross the road. Bank each step.',
  icon: ICON + 'chickenroad.png'
}, {
  id: 'coinflip',
  name: 'Coin Flip',
  tag: 'Heads or tails. Double or nothing.',
  icon: ICON + 'coinflip.png'
}, {
  id: 'diamonds',
  name: 'Diamonds',
  tag: 'Match the gems. Hit the combo.',
  icon: ICON + 'diamonds.png'
}, {
  id: 'cases',
  name: 'Cases',
  tag: 'Open the case. Reveal the reward.',
  icon: ICON + 'cases.png'
}, {
  id: 'blackjack',
  name: 'Blackjack',
  tag: 'Hit 21. Beat the dealer.',
  icon: ICON + 'blackjack.png'
}, {
  id: 'roulette',
  name: 'Roulette',
  tag: 'Pick your number. Let it ride.',
  icon: ICON + 'roulette.png'
}, {
  id: 'baccarat',
  name: 'Baccarat',
  tag: 'Player or banker — call the winner.',
  icon: ICON + 'baccarat.png'
}, {
  id: 'sicbo',
  name: 'Sic Bo',
  tag: 'Three dice. Call the total.',
  icon: ICON + 'sicbo.png'
}, {
  id: 'slots',
  name: 'Slots',
  tag: 'Spin the reels. Line up the gold.',
  icon: ICON + 'slots.png'
}, {
  id: 'threecardpoker',
  name: 'Three Card Poker',
  tag: 'Three cards. Beat the house hand.',
  icon: ICON + 'threecardpoker.png'
}, {
  id: 'videopoker',
  name: 'Video Poker',
  tag: 'Hold, draw, and build your hand.',
  icon: ICON + 'videopoker.png'
}];
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/casino-lobby/games.js", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/AccountScreens.jsx
try { (() => {
/* global React, Icon, Button, Badge, Card, CardHeader, CardTitle, CardContent, CardDescription, Tabs, Avatar, Progress, Switch, Stat, cx */
// Account surfaces: My Bets, Rewards (VIP), Leaderboard, Profile & responsible play.
const {
  useState: useAcc,
  useMemo: useMAcc
} = React;
const betProfit = b => b.outcome === 'win' ? Math.round(b.stake * b.mult - b.stake) : -b.stake;
const vipColor = name => (window.PSA_DATA.VIP_TIERS.find(t => t.name === name) || {}).color || 'var(--gold)';

/* ---------------- My Bets ---------------- */
function MyBets({
  wallet
}) {
  const D = window.PSA_DATA;
  const [side, setSide] = useAcc('all');
  const shown = useMAcc(() => D.BETS.filter(b => side === 'all' || b.side === side), [side]);
  const stats = useMAcc(() => {
    const wins = shown.filter(b => b.outcome === 'win');
    const wagered = shown.reduce((s, b) => s + b.stake, 0);
    const net = shown.reduce((s, b) => s + betProfit(b), 0);
    const best = Math.max(0, ...shown.map(b => b.mult));
    const big = Math.max(0, ...wins.map(betProfit));
    return {
      bets: shown.length,
      wagered,
      net,
      winRate: shown.length ? Math.round(wins.length / shown.length * 100) : 0,
      best,
      big,
      wins: wins.length,
      losses: shown.length - wins.length
    };
  }, [shown]);
  const casino = D.BETS.filter(b => b.side === 'casino');
  const sb = D.BETS.filter(b => b.side === 'sportsbook');
  const sideNet = arr => arr.reduce((s, b) => s + betProfit(b), 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "screen narrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "figure-row"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "fig-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Balance"), /*#__PURE__*/React.createElement("span", {
    className: "stat-value num"
  }, D.fmt(wallet.avail)), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, "What you can bet right now")), /*#__PURE__*/React.createElement(Card, {
    className: "fig-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "This week"), /*#__PURE__*/React.createElement("span", {
    className: cx('stat-value num', wallet.week > 0 ? 'up' : wallet.week < 0 ? 'down' : '')
  }, wallet.week > 0 ? '▲ ' : wallet.week < 0 ? '▼ ' : '', D.fmt(Math.abs(wallet.week))), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, wallet.week >= 0 ? 'Up — the book owes you' : 'Down — you owe the book')), /*#__PURE__*/React.createElement(Card, {
    className: "fig-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "At risk"), /*#__PURE__*/React.createElement("span", {
    className: "stat-value num"
  }, D.fmt(wallet.risk)), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, "Stakes on open bets")), /*#__PURE__*/React.createElement(Card, {
    className: "fig-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Credit"), /*#__PURE__*/React.createElement("span", {
    className: "stat-value num"
  }, D.fmt(20000)), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, "How far you can run down"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-sides"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "side-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "side-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "side-name"
  }, "Casino"), /*#__PURE__*/React.createElement("span", {
    className: "side-count num"
  }, casino.length, " bets")), /*#__PURE__*/React.createElement("span", {
    className: cx('side-net num', sideNet(casino) >= 0 ? 'up' : 'down')
  }, sideNet(casino) >= 0 ? '+' : '−', D.fmt(Math.abs(sideNet(casino)))), /*#__PURE__*/React.createElement("span", {
    className: "side-meta"
  }, "Every game on the floor")), /*#__PURE__*/React.createElement(Card, {
    className: "side-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "side-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "side-name"
  }, "Sportsbook"), /*#__PURE__*/React.createElement("span", {
    className: "side-count num"
  }, sb.length, " bets")), /*#__PURE__*/React.createElement("span", {
    className: cx('side-net num', sideNet(sb) >= 0 ? 'up' : 'down')
  }, sideNet(sb) >= 0 ? '+' : '−', D.fmt(Math.abs(sideNet(sb)))), /*#__PURE__*/React.createElement("span", {
    className: "side-meta"
  }, "Singles, parlays & live"))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Statistics"), /*#__PURE__*/React.createElement(Tabs, {
    value: side,
    onChange: setSide,
    options: [{
      value: 'all',
      label: 'All'
    }, {
      value: 'casino',
      label: 'Casino'
    }, {
      value: 'sportsbook',
      label: 'Sportsbook'
    }],
    gold: true
  })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      paddingTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-grid"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Bets",
    value: stats.bets
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Wagered",
    value: D.fmt(stats.wagered)
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Net profit",
    value: (stats.net >= 0 ? '+' : '−') + D.fmt(Math.abs(stats.net)).replace('$', '$'),
    deltaTone: stats.net >= 0 ? 'up' : 'down'
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Win rate",
    value: stats.winRate + '%'
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Biggest win",
    value: stats.big > 0 ? '+' + D.fmt(stats.big) : '—'
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Best multiplier",
    value: stats.best > 1 ? stats.best.toFixed(2) + '×' : '—'
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Record",
    value: `${stats.wins}–${stats.losses}`
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Games",
    value: new Set(D.BETS.filter(b => b.side === 'casino').map(b => b.game)).size
  })))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Bet history")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Bet"), /*#__PURE__*/React.createElement("th", null, "When"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Stake"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Multiplier"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Profit"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Result"))), /*#__PURE__*/React.createElement("tbody", null, shown.map(b => {
    const p = betProfit(b);
    return /*#__PURE__*/React.createElement("tr", {
      key: b.id
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "mb-bet"
    }, /*#__PURE__*/React.createElement(Badge, {
      variant: b.side === 'casino' ? 'secondary' : 'outline'
    }, b.side === 'casino' ? 'Casino' : 'Book'), /*#__PURE__*/React.createElement("span", null, b.game))), /*#__PURE__*/React.createElement("td", {
      className: "mut"
    }, b.when), /*#__PURE__*/React.createElement("td", {
      className: "r num"
    }, D.fmt(b.stake)), /*#__PURE__*/React.createElement("td", {
      className: "r num"
    }, b.mult > 0 ? b.mult.toFixed(2) + '×' : '—'), /*#__PURE__*/React.createElement("td", {
      className: cx('r num', p > 0 ? 'up' : 'down')
    }, p > 0 ? '+' : '−', D.fmt(Math.abs(p))), /*#__PURE__*/React.createElement("td", {
      className: "r"
    }, /*#__PURE__*/React.createElement(Badge, {
      variant: b.outcome === 'win' ? 'success' : 'destructive'
    }, b.outcome === 'win' ? 'Won' : 'Lost')));
  })))))));
}

/* ---------------- Rewards ---------------- */
function Rewards({
  me
}) {
  const D = window.PSA_DATA;
  const tiers = D.VIP_TIERS;
  const idx = tiers.findIndex(t => t.name === me.vip);
  const next = tiers[idx + 1];
  const wagered = 84000; // lifetime
  const pct = next ? Math.min(100, Math.round((wagered - tiers[idx].need) / (next.need - tiers[idx].need) * 100)) : 100;
  return /*#__PURE__*/React.createElement("div", {
    className: "screen narrow"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "vip-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vip-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vip-tier"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "crown",
    size: 26,
    style: {
      color: vipColor(me.vip)
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Your tier"), /*#__PURE__*/React.createElement("span", {
    className: "vip-name h-cond",
    style: {
      color: vipColor(me.vip)
    }
  }, me.vip))), /*#__PURE__*/React.createElement("div", {
    className: "vip-prog-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, D.fmt(wagered)), " wagered", next && /*#__PURE__*/React.createElement("span", {
    className: "mut"
  }, " \xB7 ", D.fmt(next.need - wagered), " to ", next.name))), /*#__PURE__*/React.createElement(Progress, {
    value: pct
  }), /*#__PURE__*/React.createElement("div", {
    className: "vip-ladder"
  }, tiers.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: t.name,
    className: cx('vip-step', i <= idx && 'is-reached', i === idx && 'is-current')
  }, /*#__PURE__*/React.createElement("span", {
    className: "vip-dot",
    style: {
      background: i <= idx ? t.color : 'var(--secondary)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "vip-step-name"
  }, t.name), /*#__PURE__*/React.createElement("span", {
    className: "vip-step-need num"
  }, t.need ? '$' + t.need / 1000 + 'k' : '—'))))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Rewards"), /*#__PURE__*/React.createElement("span", {
    className: "mut",
    style: {
      fontSize: 13
    }
  }, "Earned from real wagers")), /*#__PURE__*/React.createElement("div", {
    className: "reward-grid"
  }, D.REWARDS.map(r => /*#__PURE__*/React.createElement(Card, {
    key: r.id,
    className: cx('reward-card', `is-${r.state}`)
  }, /*#__PURE__*/React.createElement("div", {
    className: "reward-ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: r.icon,
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    className: "reward-body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "reward-title"
  }, r.title), /*#__PURE__*/React.createElement("span", {
    className: "reward-sub"
  }, r.sub)), /*#__PURE__*/React.createElement("div", {
    className: "reward-foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "reward-val num"
  }, r.value), r.state === 'ready' ? /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "sm"
  }, "Claim") : r.state === 'accruing' ? /*#__PURE__*/React.createElement(Badge, {
    variant: "gold"
  }, "Accruing") : /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 12
  }), "Locked"))))));
}

/* ---------------- Leaderboard ---------------- */
function Leaderboard() {
  const D = window.PSA_DATA;
  const top = D.LEADERBOARD.slice(0, 3);
  const order = [top[1], top[0], top[2]]; // silver, gold, bronze
  return /*#__PURE__*/React.createElement("div", {
    className: "screen narrow"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "lb-banner"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Weekly leaderboard"), /*#__PURE__*/React.createElement("h3", {
    className: "h-cond lb-banner-title"
  }, "Most wagered wins the pool"), /*#__PURE__*/React.createElement("p", {
    className: "mut",
    style: {
      fontSize: 13
    }
  }, "Resets Sunday at midnight \xB7 ", D.fmt(25000), " points up top")), /*#__PURE__*/React.createElement(Badge, {
    variant: "gold"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 12
  }), "3d 14h left")), /*#__PURE__*/React.createElement("div", {
    className: "podium"
  }, order.map((p, i) => {
    const place = p.rank;
    return /*#__PURE__*/React.createElement("div", {
      key: p.name,
      className: cx('podium-col', `p${place}`)
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: p.name,
      size: "lg"
    }), /*#__PURE__*/React.createElement("span", {
      className: "podium-name"
    }, p.name), /*#__PURE__*/React.createElement(Badge, {
      variant: "outline",
      style: {
        color: vipColor(p.vip)
      }
    }, p.vip), /*#__PURE__*/React.createElement("div", {
      className: cx('podium-block', `r${place}`)
    }, /*#__PURE__*/React.createElement("span", {
      className: "podium-rank num"
    }, place), /*#__PURE__*/React.createElement("span", {
      className: "podium-amt num up"
    }, "+", D.fmt(p.week))));
  })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "c"
  }, "#"), /*#__PURE__*/React.createElement("th", null, "Player"), /*#__PURE__*/React.createElement("th", null, "Tier"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Wagered"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "This week"))), /*#__PURE__*/React.createElement("tbody", null, D.LEADERBOARD.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.name,
    className: cx(p.me && 'is-me')
  }, /*#__PURE__*/React.createElement("td", {
    className: "c num lb-rank"
  }, p.rank), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-bet"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: p.name,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", null, p.name, p.me && /*#__PURE__*/React.createElement("span", {
    className: "lb-you"
  }, " \xB7 You")))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: vipColor(p.vip),
      fontWeight: 600,
      fontSize: 12.5
    }
  }, p.vip)), /*#__PURE__*/React.createElement("td", {
    className: "r num"
  }, D.fmt(p.wagered)), /*#__PURE__*/React.createElement("td", {
    className: cx('r num', p.week >= 0 ? 'up' : 'down')
  }, p.week >= 0 ? '+' : '−', D.fmt(Math.abs(p.week)))))))))));
}

/* ---------------- Profile ---------------- */
function Profile({
  me,
  wallet
}) {
  const D = window.PSA_DATA;
  const [reminder, setReminder] = useAcc(true);
  const [limit, setLimit] = useAcc(5000);
  return /*#__PURE__*/React.createElement("div", {
    className: "screen narrow"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "profile-head"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: me.name,
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "profile-id"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond profile-name"
  }, me.name), /*#__PURE__*/React.createElement("div", {
    className: "profile-meta"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "outline",
    style: {
      color: vipColor(me.vip)
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "crown",
    size: 12
  }), me.vip), /*#__PURE__*/React.createElement("span", {
    className: "mut"
  }, "Member since 2024 \xB7 Agent: Eddie Cole"))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    size: 15
  }), "Edit")), /*#__PURE__*/React.createElement("div", {
    className: "stat-grid four"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "mini-stat"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Lifetime wagered",
    value: D.fmt(84000)
  })), /*#__PURE__*/React.createElement(Card, {
    className: "mini-stat"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Net profit",
    value: '+' + D.fmt(4820),
    deltaTone: "up",
    delta: "this week"
  })), /*#__PURE__*/React.createElement(Card, {
    className: "mini-stat"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Biggest win",
    value: '+' + D.fmt(2730)
  })), /*#__PURE__*/React.createElement(Card, {
    className: "mini-stat"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Win rate",
    value: "58%"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "two-col"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Responsible play"), /*#__PURE__*/React.createElement(CardDescription, null, "Set your own guardrails. Points are for fun \u2014 these keep it that way.")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "rp-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rp-label"
  }, "Weekly wager limit"), /*#__PURE__*/React.createElement("span", {
    className: "rp-sub num"
  }, D.fmt(limit)))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "slider",
    min: 1000,
    max: 25000,
    step: 500,
    value: limit,
    onChange: e => setLimit(Number(e.target.value))
  }), /*#__PURE__*/React.createElement("div", {
    className: "sep",
    style: {
      margin: '16px 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "rp-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rp-label"
  }, "Session reminders"), /*#__PURE__*/React.createElement("span", {
    className: "rp-sub"
  }, "A nudge every hour of play")), /*#__PURE__*/React.createElement(Switch, {
    checked: reminder,
    onChange: setReminder
  })), /*#__PURE__*/React.createElement("div", {
    className: "rp-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "rp-label"
  }, "Cool-off"), /*#__PURE__*/React.createElement("span", {
    className: "rp-sub"
  }, "Pause play for a set time")), /*#__PURE__*/React.createElement("div", {
    className: "rp-cool"
  }, ['24h', '7d', '30d'].map(t => /*#__PURE__*/React.createElement(Button, {
    key: t,
    variant: "outline",
    size: "sm"
  }, t)))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Account")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", null, "Display name"), /*#__PURE__*/React.createElement("span", null, me.name)), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", null, "Role"), /*#__PURE__*/React.createElement("span", {
    style: {
      textTransform: 'capitalize'
    }
  }, me.role)), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", null, "VIP tier"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: vipColor(me.vip)
    }
  }, me.vip)), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", null, "Balance"), /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, D.fmt(wallet.avail))), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", null, "Credit line"), /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, D.fmt(20000))), /*#__PURE__*/React.createElement("div", {
    className: "sep",
    style: {
      margin: '14px 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "profile-actions"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "volume-2",
    size: 14
  }), "Sound on"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "globe",
    size: 14
  }), "English"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    className: "down"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "log-out",
    size: 14
  }), "Sign out"))))));
}
Object.assign(window, {
  MyBets,
  Rewards,
  Leaderboard,
  Profile
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/AccountScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/Auth.jsx
try { (() => {
/* global React, Icon, Button, Badge, Switch, cx */
// Login / create-account — mirrors DimeBag-Bets auth module: username + password for
// everyone, roles (manager/agent/player), Google OAuth (real backend only), demo
// logins (operator/agent/marco · pw "demo"), and the verify-email state. Styled
// PlayStadium. onResult({mode,role,name,username}) hands control back to the flow.
const {
  useState: useAuthState,
  useMemo: useAuthMemo
} = React;
const LOGO_A = '../../assets/logo/playstadium-chip-logo.png';
const RESERVED = {
  operator: {
    role: 'manager',
    name: 'Operator'
  },
  agent: {
    role: 'agent',
    name: 'East Desk Agent'
  },
  marco: {
    role: 'player',
    name: 'Marco'
  }
};
const norm = u => u.trim().toLowerCase();
function pwScore(p) {
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
function Auth({
  onResult,
  initialMode = 'in',
  initialType = 'player'
}) {
  const [mode, setMode] = useAuthState(initialMode); // 'in' | 'up'
  const [type, setType] = useAuthState(initialType); // 'player' | 'operator'
  const [displayName, setDisplayName] = useAuthState('');
  const [username, setUsername] = useAuthState('');
  const [password, setPassword] = useAuthState('');
  const [reveal, setReveal] = useAuthState(false);
  const [touched, setTouched] = useAuthState({});
  const [formErr, setFormErr] = useAuthState(null);
  const [oauthNote, setOauthNote] = useAuthState(false);
  const [busy, setBusy] = useAuthState(false);
  const [verifyEmail, setVerifyEmail] = useAuthState(null);
  const uErr = useAuthMemo(() => {
    const u = norm(username);
    if (!u) return 'Username is required';
    if (u.length < 3) return 'At least 3 characters';
    if (!/^[a-z0-9_]+$/.test(u)) return 'Letters, numbers and _ only';
    return null;
  }, [username]);
  const pErr = useAuthMemo(() => {
    if (!password) return 'Password is required';
    if (mode === 'up' && password.length < 6) return 'At least 6 characters';
    return null;
  }, [password, mode]);
  const nErr = mode === 'up' && !displayName.trim() ? 'Tell us what to call you' : null;
  const score = pwScore(password);
  function fail(msg) {
    setFormErr(msg);
    setBusy(false);
  }
  function submit(e) {
    e.preventDefault();
    setTouched({
      displayName: true,
      username: true,
      password: true
    });
    setFormErr(null);
    if (uErr || pErr || nErr) return;
    setBusy(true);
    // simulate the adapter round-trip
    setTimeout(() => {
      const u = norm(username);
      if (mode === 'in') {
        const seed = RESERVED[u];
        if (!seed || password !== 'demo') return fail('Invalid username or password');
        setBusy(false);
        onResult({
          mode: 'in',
          role: seed.role,
          name: seed.name,
          username: u,
          isNew: false
        });
      } else {
        if (RESERVED[u]) return fail('That username is already taken');
        setBusy(false);
        const role = type === 'operator' ? 'manager' : 'player';
        onResult({
          mode: 'up',
          role,
          name: displayName.trim() || u,
          username: u,
          isNew: true
        });
      }
    }, 460);
  }
  function quickDemo(u) {
    const seed = RESERVED[u];
    onResult({
      mode: 'in',
      role: seed.role,
      name: seed.name,
      username: u,
      isNew: false
    });
  }
  if (verifyEmail) {
    return /*#__PURE__*/React.createElement("div", {
      className: "auth-panel"
    }, /*#__PURE__*/React.createElement(MobileBrand, null), /*#__PURE__*/React.createElement("div", {
      className: "auth-center-state"
    }, /*#__PURE__*/React.createElement("div", {
      className: "auth-state-ic"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "bell",
      size: 28
    })), /*#__PURE__*/React.createElement("h1", {
      className: "auth-title"
    }, "Check your email"), /*#__PURE__*/React.createElement("p", {
      className: "auth-sub"
    }, "We sent a confirmation link to ", /*#__PURE__*/React.createElement("strong", {
      style: {
        color: 'var(--text)'
      }
    }, verifyEmail), ". Click it to verify your account, then sign in."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 22
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "outline",
      block: true,
      onClick: () => {
        setVerifyEmail(null);
        setMode('in');
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "arrow-left",
      size: 16
    }), "Back to sign in"))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "auth-panel"
  }, /*#__PURE__*/React.createElement(MobileBrand, null), /*#__PURE__*/React.createElement("div", {
    className: "auth-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-kicker"
  }, mode === 'in' ? 'Welcome back' : 'Join the stadium'), /*#__PURE__*/React.createElement("h1", {
    className: "auth-title"
  }, mode === 'in' ? 'Sign in' : 'Create your account'), /*#__PURE__*/React.createElement("p", {
    className: "auth-sub"
  }, "Points only \u2014 no real-money value, no buy-in, no cash-out.")), /*#__PURE__*/React.createElement("form", {
    className: "auth-form",
    onSubmit: submit,
    noValidate: true
  }, mode === 'up' && /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "I'm signing up as"), /*#__PURE__*/React.createElement("div", {
    className: "ob-typeseg"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cx('ob-type', type === 'player' && 'is-on'),
    onClick: () => setType('player')
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dice",
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    className: "ob-type-t"
  }, "Player"), /*#__PURE__*/React.createElement("span", {
    className: "ob-type-d"
  }, "Play the casino & sportsbook for points.")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cx('ob-type', type === 'operator' && 'is-on'),
    onClick: () => setType('operator')
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dashboard",
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    className: "ob-type-t"
  }, "Operator"), /*#__PURE__*/React.createElement("span", {
    className: "ob-type-d"
  }, "Run a book \u2014 players, risk & settlement.")))), mode === 'up' && /*#__PURE__*/React.createElement(Field, {
    label: "Display name",
    error: touched.displayName && nErr
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: displayName,
    placeholder: "What we'll call you",
    onChange: e => setDisplayName(e.target.value),
    onBlur: () => setTouched(t => ({
      ...t,
      displayName: true
    })),
    autoComplete: "name"
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Username",
    error: touched.username && uErr
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: username,
    placeholder: "yourhandle",
    autoCapitalize: "none",
    autoCorrect: "off",
    spellCheck: false,
    onChange: e => setUsername(e.target.value),
    onBlur: () => setTouched(t => ({
      ...t,
      username: true
    })),
    autoComplete: "username"
  }))), /*#__PURE__*/React.createElement(Field, {
    label: mode === 'in' ? 'Password' : 'Create a password',
    error: touched.password && pErr,
    hint: mode === 'in' ? /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "auth-link",
      onClick: e => {
        e.preventDefault();
      }
    }, "Forgot?") : null
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input has-suffix",
    type: reveal ? 'text' : 'password',
    value: password,
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    onChange: e => setPassword(e.target.value),
    onBlur: () => setTouched(t => ({
      ...t,
      password: true
    })),
    autoComplete: mode === 'in' ? 'current-password' : 'new-password'
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "auth-reveal",
    onClick: () => setReveal(r => !r)
  }, reveal ? 'Hide' : 'Show')), mode === 'up' && password.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: cx('auth-strength', `s${score}`, score <= 1 && 'weak')
  }, /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", null))), formErr && /*#__PURE__*/React.createElement("div", {
    className: "auth-formerr"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 16
  }), formErr), /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    block: true,
    disabled: busy,
    type: "submit"
  }, busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'), /*#__PURE__*/React.createElement("div", {
    className: "auth-or"
  }, /*#__PURE__*/React.createElement("span", null, "or")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "auth-oauth",
    onClick: () => setOauthNote(true)
  }, /*#__PURE__*/React.createElement(GoogleG, null), "Continue with Google"), oauthNote && /*#__PURE__*/React.createElement("p", {
    className: "auth-hint-text",
    style: {
      textAlign: 'center'
    }
  }, "Google sign-in activates with the Supabase backend \u2014 demo mode uses username + password.")), /*#__PURE__*/React.createElement("p", {
    className: "auth-switch"
  }, mode === 'in' ? "New here? " : 'Have an account? ', /*#__PURE__*/React.createElement("button", {
    className: "auth-link",
    onClick: () => {
      setFormErr(null);
      setMode(m => m === 'in' ? 'up' : 'in');
    }
  }, mode === 'in' ? 'Create an account' : 'Sign in')), mode === 'in' && /*#__PURE__*/React.createElement("div", {
    className: "auth-demo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-demo-title"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bolt",
    size: 12
  }), "Demo logins \xB7 password ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--font-num)'
    }
  }, "demo")), /*#__PURE__*/React.createElement("div", {
    className: "auth-demo-grid"
  }, /*#__PURE__*/React.createElement("button", {
    className: "auth-demo-btn",
    onClick: () => quickDemo('operator')
  }, /*#__PURE__*/React.createElement("span", {
    className: "auth-demo-role"
  }, "Manager"), /*#__PURE__*/React.createElement("span", {
    className: "auth-demo-name"
  }, "operator")), /*#__PURE__*/React.createElement("button", {
    className: "auth-demo-btn",
    onClick: () => quickDemo('agent')
  }, /*#__PURE__*/React.createElement("span", {
    className: "auth-demo-role"
  }, "Agent"), /*#__PURE__*/React.createElement("span", {
    className: "auth-demo-name"
  }, "agent")), /*#__PURE__*/React.createElement("button", {
    className: "auth-demo-btn",
    onClick: () => quickDemo('marco')
  }, /*#__PURE__*/React.createElement("span", {
    className: "auth-demo-role"
  }, "Player"), /*#__PURE__*/React.createElement("span", {
    className: "auth-demo-name"
  }, "marco")))), /*#__PURE__*/React.createElement("p", {
    className: "auth-foot-note"
  }, "By continuing you agree this is a points-only social game. Must be 18+. Play for fun."));
}
function Field({
  label,
  error,
  hint,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-field-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, label), hint), children, error && /*#__PURE__*/React.createElement("span", {
    className: "auth-err-text"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 12
  }), error));
}
function MobileBrand() {
  return /*#__PURE__*/React.createElement("div", {
    className: "auth-mobile-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: LOGO_A,
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "nm"
  }, "PlayStadium", /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }, ".io")));
}
function GoogleG() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    fill: "#4285F4",
    d: "M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#34A853",
    d: "M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#FBBC05",
    d: "M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
  }), /*#__PURE__*/React.createElement("path", {
    fill: "#EA4335",
    d: "M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
  }));
}
window.Auth = Auth;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/Auth.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/AuthApp.jsx
try { (() => {
/* global React, ReactDOM, Auth, OnboardingPlayer, OnboardingManager, Icon, cx */
// Auth + onboarding orchestrator. Constant split-screen brand pane (left) + a right
// panel that swaps Login ↔ player/operator onboarding. Sign-in (existing account)
// goes straight to the app; sign-up routes into the matching onboarding, which ends
// by opening the app. A prototype jump-menu lets reviewers hit any flow directly.
const {
  useState: useFlow
} = React;
const LOGO = '../../assets/logo/playstadium-chip-logo.png';
const APP_URL = 'index.html';
const BRAND_COPY = {
  auth: {
    eyebrow: 'PlayStadium.io',
    head: 'Stack your week.',
    sub: 'One points balance across 21 casino Originals and the sportsbook. No buy-in, no cash-out — just the action.'
  },
  player: {
    eyebrow: 'Player setup',
    head: 'Welcome to the floor.',
    sub: "A few quick steps to personalise your lobby and set your limits. Then your figure's ready to play."
  },
  manager: {
    eyebrow: 'Operator setup',
    head: 'Set up your book.',
    sub: 'Pick a house profile, build your desk, and go live. Everything settles under one tenant you control.'
  }
};
function BrandPane({
  phase
}) {
  const c = BRAND_COPY[phase] || BRAND_COPY.auth;
  return /*#__PURE__*/React.createElement("aside", {
    className: "auth-brandpane"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: LOGO,
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "auth-brand-name"
  }, "PlayStadium", /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }, ".io"))), /*#__PURE__*/React.createElement("div", {
    className: "auth-brand-mid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-brand-eyebrow"
  }, c.eyebrow), /*#__PURE__*/React.createElement("h2", {
    className: "auth-brand-head"
  }, c.head), /*#__PURE__*/React.createElement("p", {
    className: "auth-brand-sub"
  }, c.sub)), /*#__PURE__*/React.createElement("div", {
    className: "auth-brand-feats"
  }, /*#__PURE__*/React.createElement(Feat, {
    icon: "sparkles",
    t: "21 Originals + a full sportsbook"
  }), /*#__PURE__*/React.createElement(Feat, {
    icon: "shield-check",
    t: "Provably fair, points-only play"
  }), /*#__PURE__*/React.createElement(Feat, {
    icon: "trophy",
    t: "Weekly leaderboards & VIP tiers"
  })), /*#__PURE__*/React.createElement("div", {
    className: "auth-brand-foot"
  }, "Points only \u2014 no real-money value. Must be 18+. Play for fun."));
}
function Feat({
  icon,
  t
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "auth-feat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), t);
}
function AuthApp() {
  const [phase, setPhase] = useFlow('auth'); // 'auth' | 'player' | 'manager'
  const [authMode, setAuthMode] = useFlow('in');
  const [authType, setAuthType] = useFlow('player');
  const [session, setSession] = useFlow({
    name: '',
    username: ''
  });
  const [jumpKey, setJumpKey] = useFlow(0); // forces Auth remount when jump menu seeds it

  const launch = () => {
    window.location.href = APP_URL;
  };
  function onAuthResult(r) {
    setSession({
      name: r.name,
      username: r.username,
      role: r.role
    });
    if (r.mode === 'in') {
      launch();
      return;
    } // existing account → straight into the app
    setPhase(r.role === 'manager' ? 'manager' : 'player'); // new account → onboarding
  }
  function jump(v) {
    if (v === 'signin') {
      setPhase('auth');
      setAuthMode('in');
      setJumpKey(k => k + 1);
    } else if (v === 'signup-player') {
      setPhase('auth');
      setAuthMode('up');
      setAuthType('player');
      setJumpKey(k => k + 1);
    } else if (v === 'signup-operator') {
      setPhase('auth');
      setAuthMode('up');
      setAuthType('operator');
      setJumpKey(k => k + 1);
    } else if (v === 'onboard-player') {
      setSession({
        name: 'Marco',
        username: 'marco',
        role: 'player'
      });
      setPhase('player');
    } else if (v === 'onboard-manager') {
      setSession({
        name: 'Operator',
        username: 'operator',
        role: 'manager'
      });
      setPhase('manager');
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "auth-root"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-wrap"
  }, /*#__PURE__*/React.createElement(BrandPane, {
    phase: phase
  }), /*#__PURE__*/React.createElement("div", {
    className: "auth-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-proto"
  }, /*#__PURE__*/React.createElement("span", {
    className: "auth-proto-label"
  }, "Prototype \xB7 jump to"), /*#__PURE__*/React.createElement("select", {
    value: "",
    onChange: e => {
      jump(e.target.value);
      e.target.value = '';
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "Choose a flow\u2026"), /*#__PURE__*/React.createElement("option", {
    value: "signin"
  }, "Sign in"), /*#__PURE__*/React.createElement("option", {
    value: "signup-player"
  }, "Player sign-up"), /*#__PURE__*/React.createElement("option", {
    value: "signup-operator"
  }, "Operator sign-up"), /*#__PURE__*/React.createElement("option", {
    value: "onboard-player"
  }, "Player onboarding"), /*#__PURE__*/React.createElement("option", {
    value: "onboard-manager"
  }, "Operator setup"))), /*#__PURE__*/React.createElement("div", {
    key: `${phase}-${jumpKey}`,
    style: {
      width: '100%',
      display: 'flex',
      justifyContent: 'center'
    }
  }, phase === 'auth' && /*#__PURE__*/React.createElement(Auth, {
    key: jumpKey,
    onResult: onAuthResult,
    initialMode: authMode,
    initialType: authType
  }), phase === 'player' && /*#__PURE__*/React.createElement(OnboardingPlayer, {
    name: session.name,
    username: session.username,
    onDone: launch
  }), phase === 'manager' && /*#__PURE__*/React.createElement(OnboardingManager, {
    name: session.name,
    username: session.username,
    onDone: launch
  })))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(AuthApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/AuthApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/CasinoScreens.jsx
try { (() => {
/* global React, Icon, Button, Badge, LiveBadge, Card, CardHeader, CardTitle, CardContent, Tabs, Input, cx */
// Casino surfaces: the Originals lobby and an interactive game page (Mines showcase).
const {
  useState: useS,
  useMemo: useM
} = React;
const HERO_ART = '../../assets/game-icons/crash.png';

/* ---------------- Game tile ---------------- */
function GameTile({
  g,
  onPlay
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "gc",
    onClick: () => onPlay(g.key)
  }, /*#__PURE__*/React.createElement("span", {
    className: "gc-art"
  }, /*#__PURE__*/React.createElement("img", {
    src: g.icon,
    alt: ""
  }), (g.hot || g.new) && /*#__PURE__*/React.createElement("span", {
    className: cx('gc-flag', g.new && 'is-new')
  }, g.new ? 'New' : 'Hot')), /*#__PURE__*/React.createElement("span", {
    className: "gc-body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "gc-name"
  }, g.name), g.tag && /*#__PURE__*/React.createElement("span", {
    className: "gc-tag"
  }, g.tag), /*#__PURE__*/React.createElement("span", {
    className: "gc-play"
  }, "Play ", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 13
  }))));
}

/* ---------------- Lobby ---------------- */
function CasinoLobby({
  search,
  onPlay
}) {
  const D = window.PSA_DATA;
  const [cat, setCat] = useS('All');
  const games = useM(() => {
    const q = (search || '').trim().toLowerCase();
    return D.GAMES.filter(g => (cat === 'All' || g.cat === cat) && (!q || g.name.toLowerCase().includes(q)));
  }, [cat, search]);
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement("section", {
    className: "lobby-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lobby-hero-copy"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lobby-hero-eyebrows"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "gold"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), "21 Originals"), /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 12
  }), "Provably fair")), /*#__PURE__*/React.createElement("h2", {
    className: "lobby-hero-title wordmark"
  }, "Stack your week."), /*#__PURE__*/React.createElement("p", {
    className: "lobby-hero-tag"
  }, "One points balance across every game and the book. No buy-in, no cash-out \u2014 just the action."), /*#__PURE__*/React.createElement("div", {
    className: "lobby-hero-cta"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    onClick: () => onPlay('crash')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 16
  }), "Play Crash"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    onClick: () => setCat('All')
  }, "Browse all")), /*#__PURE__*/React.createElement("div", {
    className: "lobby-hero-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Biggest win today"), /*#__PURE__*/React.createElement("span", {
    className: "stat-value up"
  }, D.fmt(2730))), /*#__PURE__*/React.createElement("div", {
    className: "sep-v",
    style: {
      height: 34
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Players online"), /*#__PURE__*/React.createElement("span", {
    className: "stat-value num"
  }, "1,284")), /*#__PURE__*/React.createElement("div", {
    className: "sep-v",
    style: {
      height: 34
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Wagered today"), /*#__PURE__*/React.createElement("span", {
    className: "stat-value num"
  }, "$284k")))), /*#__PURE__*/React.createElement("div", {
    className: "lobby-hero-art"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lobby-hero-glow"
  }), /*#__PURE__*/React.createElement("img", {
    src: HERO_ART,
    alt: ""
  }))), /*#__PURE__*/React.createElement("div", {
    className: "psa-ticker"
  }, /*#__PURE__*/React.createElement("span", {
    className: "psa-ticker-label"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "activity",
    size: 14
  }), "Live wins"), /*#__PURE__*/React.createElement("div", {
    className: "psa-ticker-track"
  }, [...D.ACTIVITY, ...D.ACTIVITY].map((a, i) => /*#__PURE__*/React.createElement("span", {
    className: "psa-ticker-item",
    key: i
  }, /*#__PURE__*/React.createElement("strong", null, a.name), " \xB7 ", a.game, " ", /*#__PURE__*/React.createElement("span", {
    className: "num up"
  }, a.mult.toFixed(2), "\xD7"), " ", /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, D.fmt(a.payout)))))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-head-l"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Originals"), /*#__PURE__*/React.createElement("span", {
    className: "num section-count"
  }, games.length)), /*#__PURE__*/React.createElement(Tabs, {
    value: cat,
    onChange: setCat,
    options: D.CATEGORIES,
    gold: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "lobby-grid"
  }, games.map(g => /*#__PURE__*/React.createElement(GameTile, {
    key: g.key,
    g: g,
    onPlay: onPlay
  }))), /*#__PURE__*/React.createElement("div", {
    className: "section-head",
    style: {
      marginTop: 34
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Promotions")), /*#__PURE__*/React.createElement("div", {
    className: "promo-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "promo-card promo-live"
  }, /*#__PURE__*/React.createElement("div", {
    className: "promo-text"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "gold"
  }, "Weekly"), /*#__PURE__*/React.createElement("h4", {
    className: "h-cond"
  }, "Top the leaderboard"), /*#__PURE__*/React.createElement("p", null, "Most wagered this week splits a $25,000 points pool."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "See standings")), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/game-icons/wheel.png",
    alt: "",
    className: "promo-art"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ph promo-ph"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ph-tag"
  }, "Promo banner \xB7 720\xD7260")), /*#__PURE__*/React.createElement("div", {
    className: "ph promo-ph"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ph-tag"
  }, "Promo banner \xB7 720\xD7260"))));
}

/* ---------------- Mines game ---------------- */
const TILES = 25;
function freshMines(count) {
  const idx = new Set();
  while (idx.size < count) idx.add(Math.floor(Math.random() * TILES));
  return idx;
}
function minesMultiplier(picks, mines) {
  // simplified fair multiplier with a 3% house edge
  let m = 1;
  for (let i = 0; i < picks; i++) m *= (TILES - i) / (TILES - mines - i);
  return m * 0.97;
}
function MinesGame({
  wallet,
  onWallet
}) {
  const D = window.PSA_DATA;
  const [bet, setBet] = useS(100);
  const [mineCount, setMineCount] = useS(3);
  const [round, setRound] = useS(null); // { mines:Set, revealed:[], picks }
  const [result, setResult] = useS(null); // null | 'won' | 'lost'
  const [log, setLog] = useS([{
    id: 1,
    bet: 200,
    mult: 3.96,
    profit: 592,
    outcome: 'win'
  }, {
    id: 2,
    bet: 150,
    mult: 0,
    profit: -150,
    outcome: 'loss'
  }, {
    id: 3,
    bet: 80,
    mult: 1.32,
    profit: 26,
    outcome: 'win'
  }]);
  const active = round && !result;
  const picks = round ? round.revealed.filter(r => r.gem).length : 0;
  const curMult = active ? minesMultiplier(picks, mineCount) : 0;
  const nextMult = active ? minesMultiplier(picks + 1, mineCount) : minesMultiplier(1, mineCount);
  const cashProfit = Math.round(bet * curMult - bet);
  function start() {
    if (active) return;
    setResult(null);
    setRound({
      mines: freshMines(mineCount),
      revealed: []
    });
  }
  function pick(i) {
    if (!active) return;
    if (round.revealed.some(r => r.i === i)) return;
    if (round.mines.has(i)) {
      setRound(r => ({
        ...r,
        revealed: [...r.revealed, {
          i,
          gem: false
        }]
      }));
      setResult('lost');
      onWallet({
        ...wallet,
        avail: wallet.avail - bet,
        week: wallet.week - bet
      });
      setLog(l => [{
        id: Date.now(),
        bet,
        mult: 0,
        profit: -bet,
        outcome: 'loss'
      }, ...l].slice(0, 8));
    } else {
      setRound(r => ({
        ...r,
        revealed: [...r.revealed, {
          i,
          gem: true
        }]
      }));
    }
  }
  function cashout() {
    if (!active || picks === 0) return;
    const profit = Math.round(bet * curMult - bet);
    setResult('won');
    onWallet({
      ...wallet,
      avail: wallet.avail + profit,
      week: wallet.week + profit
    });
    setLog(l => [{
      id: Date.now(),
      bet,
      mult: +curMult.toFixed(2),
      profit,
      outcome: 'win'
    }, ...l].slice(0, 8));
  }
  function tileState(i) {
    if (!round) return 'idle';
    const rev = round.revealed.find(r => r.i === i);
    if (rev) return rev.gem ? 'gem' : 'mine';
    if (result) return round.mines.has(i) ? 'mine-faded' : 'idle-done';
    return 'idle';
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "game-layout"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "game-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "game-panel-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gp-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Bet amount"), /*#__PURE__*/React.createElement("div", {
    className: "gp-bet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gp-bet-input"
  }, /*#__PURE__*/React.createElement("span", {
    className: "gp-bet-$"
  }, "$"), /*#__PURE__*/React.createElement("input", {
    className: "input num",
    type: "number",
    value: bet,
    min: 1,
    disabled: active,
    onChange: e => setBet(Math.max(1, Number(e.target.value) || 0))
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    disabled: active,
    onClick: () => setBet(b => Math.max(1, Math.round(b / 2)))
  }, "\xBD"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    disabled: active,
    onClick: () => setBet(b => b * 2)
  }, "2\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "gp-presets"
  }, [50, 100, 250, 500].map(v => /*#__PURE__*/React.createElement("button", {
    key: v,
    className: cx('chip-preset', bet === v && 'is-on'),
    disabled: active,
    onClick: () => setBet(v)
  }, D.fmt(v))))), /*#__PURE__*/React.createElement("div", {
    className: "gp-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Mines"), /*#__PURE__*/React.createElement("div", {
    className: "gp-mines"
  }, [1, 3, 5, 10].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    className: cx('chip-preset', mineCount === m && 'is-on'),
    disabled: active,
    onClick: () => setMineCount(m)
  }, m)))), /*#__PURE__*/React.createElement("div", {
    className: "sep"
  }), /*#__PURE__*/React.createElement("div", {
    className: "gp-readout"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, active ? 'Current' : 'Next tile'), /*#__PURE__*/React.createElement("span", {
    className: "stat-value gold num"
  }, (active ? curMult : nextMult).toFixed(2), "\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "stat",
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Profit on cashout"), /*#__PURE__*/React.createElement("span", {
    className: cx('stat-value num', cashProfit >= 0 ? 'up' : '')
  }, D.fmt(Math.max(0, cashProfit))))), active ? /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    block: true,
    onClick: cashout,
    disabled: picks === 0
  }, "Cash out ", D.fmt(Math.round(bet * curMult))) : /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    block: true,
    onClick: start
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gem",
    size: 17
  }), "Bet"), result && /*#__PURE__*/React.createElement("div", {
    className: cx('gp-result', result === 'won' ? 'is-win' : 'is-loss')
  }, result === 'won' ? `Cashed out ${curMult.toFixed(2)}× · +${D.fmt(cashProfit)}` : 'Hit a mine — round over'))), /*#__PURE__*/React.createElement("div", {
    className: "game-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mines-grid",
    "aria-disabled": !active
  }, Array.from({
    length: TILES
  }).map((_, i) => {
    const st = tileState(i);
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      className: cx('mine-tile', `is-${st}`),
      onClick: () => pick(i),
      disabled: !active
    }, st === 'gem' && /*#__PURE__*/React.createElement(Icon, {
      name: "gem",
      size: 26
    }), (st === 'mine' || st === 'mine-faded') && /*#__PURE__*/React.createElement(Icon, {
      name: "bolt",
      size: 26
    }));
  }))), /*#__PURE__*/React.createElement(Card, {
    className: "game-ledger"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Recent rounds")), /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Game"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Bet"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Multiplier"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Profit"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Result"))), /*#__PURE__*/React.createElement("tbody", null, log.map(e => /*#__PURE__*/React.createElement("tr", {
    key: e.id
  }, /*#__PURE__*/React.createElement("td", null, "Mines"), /*#__PURE__*/React.createElement("td", {
    className: "r num"
  }, D.fmt(e.bet)), /*#__PURE__*/React.createElement("td", {
    className: "r num"
  }, e.mult > 0 ? e.mult.toFixed(2) + '×' : '—'), /*#__PURE__*/React.createElement("td", {
    className: cx('r num', e.profit > 0 ? 'up' : e.profit < 0 ? 'down' : '')
  }, e.profit > 0 ? '+' : '', D.fmt(e.profit)), /*#__PURE__*/React.createElement("td", {
    className: "r"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: e.outcome === 'win' ? 'success' : 'destructive'
  }, e.outcome === 'win' ? 'Won' : 'Lost'))))))))));
}
function GamePage({
  gameKey,
  wallet,
  onWallet,
  onBack
}) {
  const D = window.PSA_DATA;
  const g = D.GAMES.find(x => x.key === gameKey) || D.GAMES[0];
  const isMines = g.key === 'mines';
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement("button", {
    className: "crumb",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 15
  }), "Casino"), /*#__PURE__*/React.createElement("div", {
    className: "game-id"
  }, /*#__PURE__*/React.createElement("span", {
    className: "game-id-art"
  }, /*#__PURE__*/React.createElement("img", {
    src: g.icon,
    alt: ""
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "h-cond game-id-name"
  }, g.name), /*#__PURE__*/React.createElement("p", {
    className: "game-id-tag"
  }, g.tag)), /*#__PURE__*/React.createElement("div", {
    className: "game-id-meta"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 12
  }), "Provably fair"), /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary"
  }, "RTP 97.0%"))), isMines ? /*#__PURE__*/React.createElement(MinesGame, {
    wallet: wallet,
    onWallet: onWallet
  }) : /*#__PURE__*/React.createElement("div", {
    className: "game-layout"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "game-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "game-panel-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "gp-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Bet amount"), /*#__PURE__*/React.createElement("div", {
    className: "gp-bet-input"
  }, /*#__PURE__*/React.createElement("span", {
    className: "gp-bet-$"
  }, "$"), /*#__PURE__*/React.createElement("input", {
    className: "input num",
    defaultValue: 100
  }))), /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    block: true
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 16
  }), "Bet"))), /*#__PURE__*/React.createElement("div", {
    className: "game-stage game-stage-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph",
    style: {
      width: '100%',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ph-tag"
  }, g.name, " game canvas")))));
}
Object.assign(window, {
  CasinoLobby,
  GamePage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/CasinoScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/ConsoleScreens.jsx
try { (() => {
/* global React, Icon, Button, Badge, Card, CardHeader, CardTitle, CardContent, CardDescription, Tabs, Avatar, Progress, Switch, Stat, SearchInput, cx */
// Operator console: Dashboard (figures + feature registry), Players & agents, Risk &
// exposure, Settlement & ledger, Games & edge. Mirrors the repo's 6-section console.
const {
  useState: useC
} = React;
const TREND7 = [42, 55, 38, 61, 49, 72, 80];
const FEATURES = [{
  sec: 'Daily ops',
  items: [{
    key: 'settlement',
    label: 'Settlement',
    icon: 'wallet',
    sub: 'Weekly run',
    nav: 'settlement'
  }, {
    key: 'communication',
    label: 'Communication',
    icon: 'megaphone',
    sub: '3 templates'
  }]
}, {
  sec: 'Players',
  items: [{
    key: 'players',
    label: 'Players & agents',
    icon: 'users',
    sub: '8 players · 2 agents',
    nav: 'players'
  }, {
    key: 'segments',
    label: 'Segments',
    icon: 'filter',
    sub: '4 segments'
  }, {
    key: 'notes',
    label: 'Notes & tags',
    icon: 'hash',
    sub: '12 tags'
  }, {
    key: 'vip',
    label: 'VIP',
    icon: 'crown',
    sub: '5 tiers'
  }]
}, {
  sec: 'Risk',
  items: [{
    key: 'risk',
    label: 'Risk & exposure',
    icon: 'shield',
    sub: '$36.7k open',
    nav: 'risk'
  }, {
    key: 'alerts',
    label: 'Alerts',
    icon: 'bell',
    sub: '2 active'
  }, {
    key: 'audit',
    label: 'Audit log',
    icon: 'receipt',
    sub: 'Today'
  }]
}, {
  sec: 'Growth',
  items: [{
    key: 'reporting',
    label: 'Reporting',
    icon: 'bar-chart',
    sub: 'Weekly P&L'
  }, {
    key: 'promotions',
    label: 'Promotions',
    icon: 'sparkles',
    sub: '1 live'
  }, {
    key: 'copilot',
    label: 'Copilot',
    icon: 'bolt',
    sub: 'Beta'
  }]
}, {
  sec: 'Settings',
  items: [{
    key: 'games',
    label: 'Games & edge',
    icon: 'sliders',
    sub: '21 games',
    nav: 'games'
  }, {
    key: 'permissions',
    label: 'Permissions',
    icon: 'lock',
    sub: 'Role-gated'
  }, {
    key: 'branding',
    label: 'Branding',
    icon: 'flag',
    sub: 'Theme'
  }]
}];
function FiguresStrip() {
  const D = window.PSA_DATA,
    f = D.CONSOLE_FIGURES;
  return /*#__PURE__*/React.createElement("div", {
    className: "figs-strip"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Book balance",
    value: D.fmt(f.balance)
  }), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, "Net player figures")), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "This week",
    value: '+' + D.fmt(f.week),
    delta: "vs last $11.2k",
    deltaTone: "up"
  })), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Today",
    value: '+' + D.fmt(f.today),
    delta: "12 settled",
    deltaTone: "up"
  })), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Active accounts",
    value: f.active,
    delta: "of 8"
  })));
}
function ConsoleDashboard({
  onNavigate
}) {
  const D = window.PSA_DATA;
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement(FiguresStrip, null), /*#__PURE__*/React.createElement("div", {
    className: "dash-grid"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "dash-chart"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Handle \xB7 last 7 days"), /*#__PURE__*/React.createElement(CardDescription, null, "Total points wagered across casino + book")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "bars"
  }, TREND7.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "bar-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar",
    style: {
      height: v + '%'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "bar-x"
  }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i])))))), /*#__PURE__*/React.createElement(Card, {
    className: "dash-feed"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Live activity")), /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "feed-list"
  }, D.LEDGER.slice(0, 6).map(t => /*#__PURE__*/React.createElement("div", {
    className: "feed-item",
    key: t.id
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: t.player,
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    className: "feed-main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "feed-name"
  }, t.player), /*#__PURE__*/React.createElement("span", {
    className: "feed-sub"
  }, t.type, " \xB7 ", t.detail)), /*#__PURE__*/React.createElement("span", {
    className: cx('feed-amt num', t.amount >= 0 ? 'up' : 'down')
  }, t.amount >= 0 ? '+' : '−', D.fmt(Math.abs(t.amount))))))))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Console"), /*#__PURE__*/React.createElement("span", {
    className: "mut",
    style: {
      fontSize: 13
    }
  }, "Role-gated operator tools")), FEATURES.map(grp => /*#__PURE__*/React.createElement("div", {
    className: "feat-group",
    key: grp.sec
  }, /*#__PURE__*/React.createElement("div", {
    className: "feat-sec eyebrow"
  }, grp.sec), /*#__PURE__*/React.createElement("div", {
    className: "feat-grid"
  }, grp.items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.key,
    className: cx('feat-tile', !it.nav && 'is-soft'),
    onClick: () => it.nav && onNavigate(it.nav)
  }, /*#__PURE__*/React.createElement("span", {
    className: "feat-ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    className: "feat-text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "feat-label"
  }, it.label), /*#__PURE__*/React.createElement("span", {
    className: "feat-sub"
  }, it.sub)), it.nav && /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15,
    className: "feat-go"
  })))))));
}
function PlayersScreen() {
  const D = window.PSA_DATA;
  const [q, setQ] = useC('');
  const players = D.PLAYERS.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "agent-row"
  }, D.AGENTS.map(a => /*#__PURE__*/React.createElement(Card, {
    key: a.id,
    className: "agent-card"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: a.name
  }), /*#__PURE__*/React.createElement("div", {
    className: "agent-id"
  }, /*#__PURE__*/React.createElement("span", {
    className: "agent-name"
  }, a.name), /*#__PURE__*/React.createElement("span", {
    className: "agent-sub"
  }, a.players, " players \xB7 agent")), /*#__PURE__*/React.createElement("div", {
    className: "agent-fig"
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, "Week"), /*#__PURE__*/React.createElement("span", {
    className: "num up"
  }, "+", D.fmt(a.week))))), /*#__PURE__*/React.createElement(Card, {
    className: "agent-card agent-add"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }), "Add agent"))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Players"), /*#__PURE__*/React.createElement("div", {
    className: "section-tools"
  }, /*#__PURE__*/React.createElement(SearchInput, {
    placeholder: "Find player\u2026",
    value: q,
    onChange: e => setQ(e.target.value)
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 15
  }), "Add player"))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Player"), /*#__PURE__*/React.createElement("th", null, "Agent"), /*#__PURE__*/React.createElement("th", null, "Tier"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "This week"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Balance"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "At risk"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }))), /*#__PURE__*/React.createElement("tbody", null, players.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-bet"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: p.name,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", null, p.name))), /*#__PURE__*/React.createElement("td", {
    className: "mut"
  }, p.agent), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: window.PSA_DATA.VIP_TIERS.find(t => t.name === p.vip)?.color,
      fontWeight: 600,
      fontSize: 12.5
    }
  }, p.vip)), /*#__PURE__*/React.createElement("td", {
    className: cx('r num', p.week >= 0 ? 'up' : 'down')
  }, p.week >= 0 ? '+' : '−', D.fmt(Math.abs(p.week))), /*#__PURE__*/React.createElement("td", {
    className: "r num"
  }, D.fmt(p.avail)), /*#__PURE__*/React.createElement("td", {
    className: "r num mut"
  }, D.fmt(p.risk)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    variant: p.status === 'active' ? 'success' : 'destructive'
  }, p.status === 'active' ? 'Active' : 'Suspended')), /*#__PURE__*/React.createElement("td", {
    className: "r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-icon btn-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more-horizontal",
    size: 16
  })))))))))));
}
function RiskScreen() {
  const D = window.PSA_DATA;
  const total = D.EXPOSURE.reduce((s, e) => s + e.open, 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "figs-strip"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Open exposure",
    value: D.fmt(total)
  }), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, "Across all live markets")), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Largest position",
    value: D.fmt(11200),
    delta: "Eagles ML",
    deltaTone: "down"
  })), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Alerts",
    value: "2",
    delta: "Near cap",
    deltaTone: "down"
  })), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Avg hold",
    value: "4.6%",
    delta: "7-day",
    deltaTone: "up"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Exposure"), /*#__PURE__*/React.createElement(Tabs, {
    value: "open",
    onChange: () => {},
    options: [{
      value: 'open',
      label: 'Open'
    }, {
      value: 'settled',
      label: 'Settled'
    }],
    gold: true
  })), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Event"), /*#__PURE__*/React.createElement("th", null, "Market"), /*#__PURE__*/React.createElement("th", null, "Side"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Open"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 180
    }
  }, "Vs cap"))), /*#__PURE__*/React.createElement("tbody", null, D.EXPOSURE.map(e => {
    const pct = Math.round(e.open / e.max * 100);
    return /*#__PURE__*/React.createElement("tr", {
      key: e.id
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, e.event)), /*#__PURE__*/React.createElement("td", {
      className: "mut"
    }, e.market), /*#__PURE__*/React.createElement("td", null, e.side), /*#__PURE__*/React.createElement("td", {
      className: "r num"
    }, D.fmt(e.open)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "cap-cell"
    }, /*#__PURE__*/React.createElement("div", {
      className: cx('cap-bar', `is-${e.tone}`)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: pct + '%'
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "num cap-pct"
    }, pct, "%"))));
  })))))));
}
function SettlementScreen() {
  const D = window.PSA_DATA;
  const [tab, setTab] = useC('ledger');
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "settle-banner-row"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "settle-banner"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "Weekly settlement"), /*#__PURE__*/React.createElement("h3", {
    className: "h-cond",
    style: {
      fontSize: 20,
      marginTop: 2
    }
  }, "Week 26 \xB7 closes Sunday"), /*#__PURE__*/React.createElement("p", {
    className: "mut",
    style: {
      fontSize: 13
    }
  }, "8 accounts \xB7 net ", D.fmt(14430), " to the book")), /*#__PURE__*/React.createElement(Button, {
    variant: "default"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "wallet",
    size: 16
  }), "Run settlement"))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Money desk"), /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    options: [{
      value: 'ledger',
      label: 'Ledger'
    }, {
      value: 'settlements',
      label: 'Settlements'
    }],
    gold: true
  })), tab === 'ledger' ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Time"), /*#__PURE__*/React.createElement("th", null, "Player"), /*#__PURE__*/React.createElement("th", null, "Type"), /*#__PURE__*/React.createElement("th", null, "Detail"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "Amount"))), /*#__PURE__*/React.createElement("tbody", null, D.LEDGER.map(t => /*#__PURE__*/React.createElement("tr", {
    key: t.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "num mut"
  }, t.when), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-bet"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: t.player,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", null, t.player))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    variant: t.type === 'Settle' ? 'success' : t.type === 'Adjust' ? 'gold' : 'secondary'
  }, t.type)), /*#__PURE__*/React.createElement("td", {
    className: "mut"
  }, t.detail), /*#__PURE__*/React.createElement("td", {
    className: cx('r num', t.amount >= 0 ? 'up' : 'down')
  }, t.amount >= 0 ? '+' : '−', D.fmt(Math.abs(t.amount)))))))))) : /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      paddingTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "settle-list"
  }, [26, 25, 24, 23].map(w => /*#__PURE__*/React.createElement("div", {
    className: "settle-item",
    key: w
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, "Week ", w), /*#__PURE__*/React.createElement("span", {
    className: "mut",
    style: {
      display: 'block',
      fontSize: 12.5
    }
  }, "8 accounts settled")), /*#__PURE__*/React.createElement("span", {
    className: cx('num', w % 2 ? 'up' : 'down')
  }, w % 2 ? '+' : '−', D.fmt(8000 + w * 200)), /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary"
  }, "Closed")))))));
}
function GamesEdgeScreen() {
  const D = window.PSA_DATA;
  const [games, setGames] = useC(() => D.GAMES.map(g => ({
    key: g.key,
    name: g.name,
    icon: g.icon,
    on: true,
    rtp: 97 - (g.cat === 'Table' ? 1.5 : 0)
  })));
  const toggle = k => setGames(gs => gs.map(g => g.key === k ? {
    ...g,
    on: !g.on
  } : g));
  return /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "figs-strip"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Games live",
    value: games.filter(g => g.on).length,
    delta: `of ${games.length}`
  })), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Avg house edge",
    value: "3.0%"
  }), /*#__PURE__*/React.createElement("span", {
    className: "fig-hint"
  }, "Across enabled games")), /*#__PURE__*/React.createElement(Card, {
    className: "fig-big"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Overrides",
    value: "0",
    delta: "Native edges"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "section-head"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "h-cond section-title"
  }, "Games & edge"), /*#__PURE__*/React.createElement("span", {
    className: "mut",
    style: {
      fontSize: 13
    }
  }, "Toggle availability \xB7 set RTP")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Game"), /*#__PURE__*/React.createElement("th", null, "Category"), /*#__PURE__*/React.createElement("th", {
    className: "r"
  }, "RTP"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 200
    }
  }, "House edge"), /*#__PURE__*/React.createElement("th", {
    className: "c"
  }, "Live"))), /*#__PURE__*/React.createElement("tbody", null, games.map((g, i) => /*#__PURE__*/React.createElement("tr", {
    key: g.key
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-bet"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ge-ic"
  }, /*#__PURE__*/React.createElement("img", {
    src: g.icon,
    alt: ""
  })), /*#__PURE__*/React.createElement("span", null, g.name))), /*#__PURE__*/React.createElement("td", {
    className: "mut"
  }, D.GAMES[i].cat), /*#__PURE__*/React.createElement("td", {
    className: "r num"
  }, g.rtp.toFixed(1), "%"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cap-cell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cap-bar is-low"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: (100 - g.rtp) / 6 * 100 + '%'
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "num cap-pct"
  }, (100 - g.rtp).toFixed(1), "%"))), /*#__PURE__*/React.createElement("td", {
    className: "c"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: g.on,
    onChange: () => toggle(g.key)
  })))))))))));
}
Object.assign(window, {
  ConsoleDashboard,
  PlayersScreen,
  RiskScreen,
  SettlementScreen,
  GamesEdgeScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/ConsoleScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/OnboardingManager.jsx
try { (() => {
/* global React, Icon, Button, Badge, cx */
// Operator (manager) onboarding — the real SetupWizard, PlayStadium-styled. Book
// basics → house profile (Conservative/Balanced/Aggressive presets, faithful RTP +
// risk + starter promos from app/console/presets.ts) → review → invite your desk
// (org hierarchy) → done. onDone() opens the console. Fully interactive.
const {
  useState: useMOState
} = React;
const mFmtCents = c => '$' + (c / 100).toLocaleString('en-US', {
  minimumFractionDigits: c % 100 ? 2 : 0,
  maximumFractionDigits: 2
});
const mPct = n => `${Math.round(n * 100)}%`;
const PRESETS = [{
  key: 'conservative',
  label: 'Conservative',
  blurb: 'Small edge, tight credit, early alerts. Protect the book; grow slowly.',
  rtp: 0.99,
  creditUtil: 0.7,
  exposureCap: 50000,
  defaultCreditLimit: 10000,
  settlementPeriodDays: 7,
  promos: [{
    name: 'Welcome free play',
    type: 'freeplay',
    cents: 1000
  }, {
    name: 'Weekly reload',
    type: 'bonus',
    cents: 500
  }]
}, {
  key: 'balanced',
  label: 'Balanced',
  blurb: 'A standard hold with moderate credit and alerts. The sensible default.',
  rtp: 0.97,
  creditUtil: 0.8,
  exposureCap: 200000,
  defaultCreditLimit: 20000,
  settlementPeriodDays: 7,
  promos: [{
    name: 'Welcome free play',
    type: 'freeplay',
    cents: 2500
  }, {
    name: 'Weekly reload',
    type: 'bonus',
    cents: 1000
  }, {
    name: 'Win-back',
    type: 'freeplay',
    cents: 1500
  }]
}, {
  key: 'aggressive',
  label: 'Aggressive',
  blurb: 'Max edge, loose credit, late alerts. Push growth; carry more risk.',
  rtp: 0.95,
  creditUtil: 0.9,
  exposureCap: null,
  defaultCreditLimit: 50000,
  settlementPeriodDays: 14,
  promos: [{
    name: 'Welcome free play',
    type: 'freeplay',
    cents: 5000
  }, {
    name: 'Weekly reload',
    type: 'bonus',
    cents: 2500
  }, {
    name: 'Win-back',
    type: 'freeplay',
    cents: 2500
  }, {
    name: 'VIP boost',
    type: 'bonus',
    cents: 10000
  }]
}];
function OnboardingManager({
  name,
  username,
  onDone
}) {
  const [step, setStep] = useMOState(0);
  const [book, setBook] = useMOState('');
  const [operator, setOperator] = useMOState(name || '');
  const [presetKey, setPresetKey] = useMOState('balanced');
  const [desk, setDesk] = useMOState([]);
  const [agentName, setAgentName] = useMOState('');
  const [agentUser, setAgentUser] = useMOState('');
  const STEPS = ['Book', 'Profile', 'Review', 'Desk', 'Done'];
  const last = STEPS.length - 1;
  const pct = Math.round(step / last * 100);
  const preset = PRESETS.find(p => p.key === presetKey);
  const next = () => setStep(s => Math.min(last, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));
  const bookErr = step === 0 && !book.trim() ? 'Give your book a name' : null;
  const addAgent = () => {
    if (!agentName.trim()) return;
    setDesk(d => [...d, {
      id: Date.now(),
      name: agentName.trim(),
      username: agentUser.trim() || agentName.trim().toLowerCase().replace(/\s+/g, '')
    }]);
    setAgentName('');
    setAgentUser('');
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ob-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-progress"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-progress-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ob-step-count"
  }, /*#__PURE__*/React.createElement("b", null, step + 1), " / ", STEPS.length, " \xB7 ", STEPS[step]), step === 3 && /*#__PURE__*/React.createElement("button", {
    className: "ob-skip",
    onClick: next
  }, "Skip for now")), /*#__PURE__*/React.createElement("div", {
    className: "ob-bar"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: `${Math.max(8, pct)}%`
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ob-step",
    key: step
  }, step === 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Welcome, operator"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Name your book"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "This is your tenant \u2014 the whole pyramid of agents and players settles under it. You can rebrand anytime."), /*#__PURE__*/React.createElement("div", {
    className: "ob-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Book name"), /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "flag",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: book,
    onChange: e => setBook(e.target.value),
    placeholder: "e.g. Stadium Club",
    maxLength: 32
  })), bookErr && /*#__PURE__*/React.createElement("span", {
    className: "auth-err-text"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 12
  }), bookErr)), /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Operator display name"), /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: operator,
    onChange: e => setOperator(e.target.value),
    placeholder: "Your name"
  })), /*#__PURE__*/React.createElement("span", {
    className: "auth-hint-text"
  }, "Signed in as ", /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: 'var(--font-num)',
      color: 'var(--muted)'
    }
  }, "@", username), " \xB7 manager (root of the org)")))), step === 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "House profile"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Pick a starting profile"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "One click sets your house edge, credit line, exposure alerts, and settlement cadence across every game. Re-baseline anytime in Setup."), /*#__PURE__*/React.createElement("div", {
    className: "ob-presets"
  }, PRESETS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.key,
    className: cx('ob-preset', p.key === presetKey && 'is-on'),
    onClick: () => setPresetKey(p.key)
  }, /*#__PURE__*/React.createElement("span", {
    className: "ob-preset-radio"
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "ob-preset-name"
  }, p.label), /*#__PURE__*/React.createElement("span", {
    className: "ob-preset-blurb"
  }, p.blurb)), /*#__PURE__*/React.createElement("span", {
    className: "ob-preset-rtp"
  }, mPct(p.rtp), /*#__PURE__*/React.createElement("small", null, "RTP")))))), step === 2 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Review \xB7 ", preset.label), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Here's what this sets"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "Applying writes only house + risk config \u2014 no money moves and no bonuses are sent. Promo templates wait in Promotions."), /*#__PURE__*/React.createElement("div", {
    className: "ob-review"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-review-sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-review-h"
  }, "House & risk"), /*#__PURE__*/React.createElement("dl", {
    style: {
      margin: 0
    }
  }, /*#__PURE__*/React.createElement(Def, {
    k: "Game RTP (all adjustable games)",
    v: `${mPct(preset.rtp)} · ${mPct(1 - preset.rtp)} edge`
  }), /*#__PURE__*/React.createElement(Def, {
    k: "Credit-use alert at",
    v: mPct(preset.creditUtil)
  }), /*#__PURE__*/React.createElement(Def, {
    k: "Exposure alert cap",
    v: preset.exposureCap == null ? 'Off' : mFmtCents(preset.exposureCap)
  }), /*#__PURE__*/React.createElement(Def, {
    k: "Default credit line",
    v: mFmtCents(preset.defaultCreditLimit)
  }), /*#__PURE__*/React.createElement(Def, {
    k: "Settlement cadence",
    v: `${preset.settlementPeriodDays} days`
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ob-review-sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-review-h"
  }, "Starter promo templates"), preset.promos.map(pr => /*#__PURE__*/React.createElement("div", {
    className: "ob-promo",
    key: pr.name
  }, /*#__PURE__*/React.createElement("span", {
    className: "nm"
  }, pr.name, /*#__PURE__*/React.createElement("em", null, pr.type === 'freeplay' ? 'Free play' : 'Bonus')), /*#__PURE__*/React.createElement("span", {
    className: "amt"
  }, mFmtCents(pr.cents)))), /*#__PURE__*/React.createElement("p", {
    className: "auth-hint-text",
    style: {
      marginTop: 8
    }
  }, "Suggestions only \u2014 run them from Promotions when you're ready.")))), step === 3 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Build your desk"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Invite your agents"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "Agents sit under you and recruit players. Add a few now or skip \u2014 you can manage the whole hierarchy from Players later."), /*#__PURE__*/React.createElement("div", {
    className: "ob-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Add an agent"), /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-add"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap",
    style: {
      flex: 1.2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: agentName,
    onChange: e => setAgentName(e.target.value),
    placeholder: "Agent name",
    onKeyDown: e => e.key === 'Enter' && addAgent()
  })), /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "hash",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: agentUser,
    onChange: e => setAgentUser(e.target.value),
    placeholder: "username",
    autoCapitalize: "none",
    onKeyDown: e => e.key === 'Enter' && addAgent()
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: true,
    onClick: addAgent,
    disabled: !agentName.trim()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  })))), desk.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-empty"
  }, "No agents yet \u2014 your desk is just you for now.") : /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-list"
  }, desk.map(a => /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-item",
    key: a.id
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar sm"
  }, a.name[0].toUpperCase()), /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-nm"
  }, a.name), /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-un"
  }, "@", a.username, " \xB7 agent")), /*#__PURE__*/React.createElement("button", {
    className: "ob-invite-x",
    onClick: () => setDesk(d => d.filter(x => x.id !== a.id))
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 15
  }))))))), step === 4 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Book is live"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, book || 'Your book', " is ready."), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "Your house, risk posture, and desk are configured. Open the console to take it from here."), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-summary"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), "Book ", /*#__PURE__*/React.createElement("b", null, book || 'Stadium Club'), " \xB7 operator ", /*#__PURE__*/React.createElement("b", null, operator || username)), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), /*#__PURE__*/React.createElement("b", null, preset.label), " profile \xB7 ", mPct(preset.rtp), " RTP, ", preset.settlementPeriodDays, "-day settle"), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), /*#__PURE__*/React.createElement("b", null, desk.length), " agent", desk.length === 1 ? '' : 's', " on the desk"), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), /*#__PURE__*/React.createElement("b", null, preset.promos.length), " promo templates ready in Promotions")))), /*#__PURE__*/React.createElement("div", {
    className: "ob-foot"
  }, step > 0 ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: back
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 16
  }), "Back") : /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), step < last ? /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    onClick: next,
    disabled: !!bookErr
  }, step === 2 ? `Apply ${preset.label}` : 'Continue', /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 16
  })) : /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    onClick: onDone
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dashboard",
    size: 16
  }), "Open your console")));
}
function Def({
  k,
  v
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ob-def"
  }, /*#__PURE__*/React.createElement("dt", null, k), /*#__PURE__*/React.createElement("dd", null, v));
}
window.OnboardingManager = OnboardingManager;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/OnboardingManager.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/OnboardingPlayer.jsx
try { (() => {
/* global React, Icon, Button, Badge, Switch, cx */
// Player onboarding — a 7-step flow after sign-up. Personalisation (handle, agent
// code, game interests) + the real responsible-play limits (per-bet / session-loss /
// session-time, in cents) + the balanced-preset welcome free play ($25.00). onDone()
// launches the app. Fully interactive: validation, progress, step transitions.
const {
  useState: usePOState
} = React;
const fmtCents = c => '$' + (c / 100).toLocaleString('en-US', {
  minimumFractionDigits: c % 100 ? 2 : 0,
  maximumFractionDigits: 2
});
const fmtMin = m => m >= 60 ? m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h` : `${m}m`;
function OnboardingPlayer({
  name,
  username,
  onDone
}) {
  const D = window.PSA_DATA;
  const [step, setStep] = usePOState(0);
  const [handle, setHandle] = usePOState(name || '');
  const [agentCode, setAgentCode] = usePOState('');
  const [codeOk, setCodeOk] = usePOState(null);
  const [picks, setPicks] = usePOState(() => new Set(['mines', 'crash', 'plinko']));
  const [limits, setLimits] = usePOState({
    perBet: {
      on: true,
      val: 20000
    },
    // cents → PlayerLimits.perBetMax
    loss: {
      on: true,
      val: 50000
    },
    //  cents → PlayerLimits.sessionLossLimit
    time: {
      on: false,
      val: 90
    } //    minutes → PlayerLimits.sessionMinutes
  });
  const [claimed, setClaimed] = usePOState(false);
  const STEPS = ['Welcome', 'Handle', 'Agent', 'Interests', 'Limits', 'Bonus', 'Done'];
  const last = STEPS.length - 1;
  const pct = Math.round(step / last * 100);
  const next = () => setStep(s => Math.min(last, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));
  const togglePick = k => setPicks(p => {
    const n = new Set(p);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  const setLim = (key, patch) => setLimits(l => ({
    ...l,
    [key]: {
      ...l[key],
      ...patch
    }
  }));
  const checkCode = () => {
    const v = agentCode.trim();
    setCodeOk(v ? /^[a-z0-9-]{4,}$/i.test(v) : null);
  };
  const handleErr = step === 1 && !handle.trim() ? "Pick something — you can change it later" : null;
  return /*#__PURE__*/React.createElement("div", {
    className: "ob-shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-progress"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-progress-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ob-step-count"
  }, /*#__PURE__*/React.createElement("b", null, step + 1), " / ", STEPS.length, " \xB7 ", STEPS[step]), step > 0 && step < last && /*#__PURE__*/React.createElement("button", {
    className: "ob-skip",
    onClick: next
  }, "Skip")), /*#__PURE__*/React.createElement("div", {
    className: "ob-bar"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: `${Math.max(8, pct)}%`
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ob-step",
    key: step
  }, step === 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Welcome, ", (name || 'player').split(' ')[0]), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "One figure. Every game."), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "Your points balance works across the casino Originals and the sportsbook. Here's the deal before you play."), /*#__PURE__*/React.createElement("div", {
    className: "ob-points"
  }, /*#__PURE__*/React.createElement(Point, {
    icon: "coins",
    t: "Points, not money",
    d: "No buy-in and no cash-out. Points are for fun and bragging rights."
  }), /*#__PURE__*/React.createElement(Point, {
    icon: "shield-check",
    t: "Provably fair",
    d: "Every Original is verifiable \u2014 the house can't move the result."
  }), /*#__PURE__*/React.createElement(Point, {
    icon: "trophy",
    t: "Climb the week",
    d: "Wager to rise the weekly leaderboard and unlock VIP tiers."
  }))), step === 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Your handle"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "What should we call you?"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "This shows on the leaderboard and the live-wins ticker. Keep it clean."), /*#__PURE__*/React.createElement("div", {
    className: "ob-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Display name"), /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: handle,
    onChange: e => setHandle(e.target.value),
    maxLength: 24,
    placeholder: "e.g. Marco"
  })), handleErr ? /*#__PURE__*/React.createElement("span", {
    className: "auth-err-text"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 12
  }), handleErr) : /*#__PURE__*/React.createElement("span", {
    className: "auth-hint-text"
  }, "Signed in as ", /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: 'var(--font-num)',
      color: 'var(--muted)'
    }
  }, "@", username))))), step === 2 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Recruitment"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Got an agent code?"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "If an agent recruited you, drop their code to join their desk. No code? Skip \u2014 an operator can link you later."), /*#__PURE__*/React.createElement("div", {
    className: "ob-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Agent or referral code ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--faint)'
    }
  }, "\xB7 optional")), /*#__PURE__*/React.createElement("div", {
    className: "ob-invite-add"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-input-wrap",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "hash",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    className: "input",
    value: agentCode,
    onChange: e => {
      setAgentCode(e.target.value);
      setCodeOk(null);
    },
    placeholder: "EAST-DESK",
    autoCapitalize: "characters"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: checkCode,
    disabled: !agentCode.trim()
  }, "Apply")), codeOk === true && /*#__PURE__*/React.createElement("span", {
    className: "auth-err-text",
    style: {
      color: 'var(--green)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 12
  }), "Linked to ", /*#__PURE__*/React.createElement("b", null, "East Desk"), " \u2014 nice."), codeOk === false && /*#__PURE__*/React.createElement("span", {
    className: "auth-err-text"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 12
  }), "That code doesn't look right.")))), step === 3 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Personalise"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Pick a few favourites"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "We'll surface these first in your lobby. Choose as many as you like \u2014 or none."), /*#__PURE__*/React.createElement("div", {
    className: "ob-chips"
  }, D.GAMES.filter(g => g.hot || g.new || ['dice', 'blackjack', 'roulette', 'keno', 'wheel'].includes(g.key)).slice(0, 12).map(g => /*#__PURE__*/React.createElement("button", {
    key: g.key,
    className: cx('ob-chip', picks.has(g.key) && 'is-on'),
    onClick: () => togglePick(g.key)
  }, /*#__PURE__*/React.createElement("img", {
    src: g.icon,
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "ob-chip-name"
  }, g.name), /*#__PURE__*/React.createElement("span", {
    className: "tick"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 15
  })))))), step === 4 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "Responsible play"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Set your guardrails"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "Points are for fun \u2014 these keep it that way. They actually block over-limit play, and you can change them anytime in Profile."), /*#__PURE__*/React.createElement("div", {
    className: "ob-body"
  }, /*#__PURE__*/React.createElement(LimitRow, {
    label: "Per-bet cap",
    sub: "Largest single stake allowed",
    on: limits.perBet.on,
    onToggle: v => setLim('perBet', {
      on: v
    }),
    valLabel: fmtCents(limits.perBet.val),
    min: 500,
    max: 50000,
    step: 500,
    val: limits.perBet.val,
    onVal: v => setLim('perBet', {
      val: v
    })
  }), /*#__PURE__*/React.createElement(LimitRow, {
    label: "Session loss limit",
    sub: "Stop play once you're down this much",
    on: limits.loss.on,
    onToggle: v => setLim('loss', {
      on: v
    }),
    valLabel: fmtCents(limits.loss.val),
    min: 1000,
    max: 200000,
    step: 1000,
    val: limits.loss.val,
    onVal: v => setLim('loss', {
      val: v
    })
  }), /*#__PURE__*/React.createElement(LimitRow, {
    label: "Session time limit",
    sub: "Take a break after this long",
    on: limits.time.on,
    onToggle: v => setLim('time', {
      on: v
    }),
    valLabel: fmtMin(limits.time.val),
    min: 15,
    max: 240,
    step: 15,
    val: limits.time.val,
    onVal: v => setLim('time', {
      val: v
    })
  }))), step === 5 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "On the house"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "Here's your welcome free play"), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "A little something to get you off the mark. It lands in your balance the moment you claim."), /*#__PURE__*/React.createElement("div", {
    className: "ob-claim"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-claim-label"
  }, "Welcome free play"), /*#__PURE__*/React.createElement("div", {
    className: "ob-claim-amt"
  }, fmtCents(2500)), !claimed ? /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    onClick: () => setClaimed(true)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gift",
    size: 17
  }), "Claim free play") : /*#__PURE__*/React.createElement("div", {
    className: "ob-claimed-badge"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 18
  }), "Claimed \u2014 it's in your balance"), /*#__PURE__*/React.createElement("div", {
    className: "ob-claim-note"
  }, "Free play only \u2014 points have no cash value."))), step === 6 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ob-eyebrow"
  }, "All set"), /*#__PURE__*/React.createElement("h2", {
    className: "ob-title"
  }, "You're in, ", (handle || 'player').split(' ')[0], "."), /*#__PURE__*/React.createElement("p", {
    className: "ob-lede"
  }, "Your figure is ready and your lobby is personalised. Time to play."), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-summary"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), "Playing as ", /*#__PURE__*/React.createElement("b", null, handle || username)), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), /*#__PURE__*/React.createElement("b", null, picks.size), " favourite", picks.size === 1 ? '' : 's', " pinned to your lobby"), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), [limits.perBet.on, limits.loss.on, limits.time.on].filter(Boolean).length, " play limit(s) active"), /*#__PURE__*/React.createElement("div", {
    className: "ob-done-row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), /*#__PURE__*/React.createElement("b", null, fmtCents(2500)), " free play ", claimed ? 'claimed' : 'waiting in Rewards')))), /*#__PURE__*/React.createElement("div", {
    className: "ob-foot"
  }, step > 0 ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: back
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 16
  }), "Back") : /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), step < last ? /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    onClick: next,
    disabled: step === 1 && !!handleErr
  }, step === 0 ? "Let's go" : 'Continue', /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 16
  })) : /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    onClick: onDone
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 16
  }), "Enter PlayStadium")));
}
function Point({
  icon,
  t,
  d
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ob-point"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 19
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ob-point-t"
  }, t), /*#__PURE__*/React.createElement("div", {
    className: "ob-point-d"
  }, d)));
}
function LimitRow({
  label,
  sub,
  on,
  onToggle,
  valLabel,
  min,
  max,
  step,
  val,
  onVal
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ob-limit"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ob-limit-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ob-limit-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "ob-limit-sub"
  }, sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: cx('ob-limit-val', !on && 'off')
  }, on ? valLabel : 'Off'), /*#__PURE__*/React.createElement(Switch, {
    checked: on,
    onChange: onToggle
  }))), /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "slider",
    min: min,
    max: max,
    step: step,
    value: val,
    disabled: !on,
    onChange: e => onVal(Number(e.target.value)),
    style: {
      opacity: on ? 1 : 0.4
    }
  }));
}
window.OnboardingPlayer = OnboardingPlayer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/OnboardingPlayer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/PlayStadiumApp.jsx
try { (() => {
/* global React, ReactDOM, Shell, CasinoLobby, GamePage, Sportsbook, MyBets, Rewards, Leaderboard, Profile, ConsoleDashboard, PlayersScreen, RiskScreen, SettlementScreen, GamesEdgeScreen, Icon, cx */
const {
  useState: useApp,
  useEffect: useAppEffect
} = React;
const TITLES = {
  casino: 'Casino',
  sportsbook: 'Sportsbook',
  mybets: 'My Bets',
  rewards: 'Rewards',
  leaderboard: 'Leaderboard',
  profile: 'Profile',
  dashboard: 'Management',
  players: 'Players & agents',
  risk: 'Risk & exposure',
  settlement: 'Settlement & ledger',
  games: 'Games & edge'
};
function Toast({
  msg
}) {
  if (!msg) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "psa-toast"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }), msg);
}
function PlayStadiumApp() {
  const D = window.PSA_DATA;
  const [area, setArea] = useApp('player');
  const [route, setRoute] = useApp('casino');
  const [gameKey, setGameKey] = useApp(null);
  const [search, setSearch] = useApp('');
  const [soundOn, setSoundOn] = useApp(true);
  const [toast, setToast] = useApp('');
  const [wallet, setWallet] = useApp({
    avail: D.ME.avail,
    week: D.ME.week,
    risk: D.ME.risk
  });
  useAppEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = key => {
    setRoute(key);
    if (key === 'casino') setGameKey(null);
  };
  const enterConsole = () => {
    setArea('console');
    setRoute('dashboard');
  };
  const exitConsole = () => {
    setArea('player');
    setRoute('casino');
    setGameKey(null);
  };
  const showToast = m => setToast(m);
  const title = gameKey && route === 'casino' ? D.GAMES.find(g => g.key === gameKey)?.name || 'Casino' : TITLES[route] || '';
  const showSearch = area === 'player' && route === 'casino' && !gameKey;
  let screen = null;
  if (area === 'console') {
    screen = route === 'players' ? /*#__PURE__*/React.createElement(PlayersScreen, null) : route === 'risk' ? /*#__PURE__*/React.createElement(RiskScreen, null) : route === 'settlement' ? /*#__PURE__*/React.createElement(SettlementScreen, null) : route === 'games' ? /*#__PURE__*/React.createElement(GamesEdgeScreen, null) : /*#__PURE__*/React.createElement(ConsoleDashboard, {
      onNavigate: navigate
    });
  } else if (route === 'casino') {
    screen = gameKey ? /*#__PURE__*/React.createElement(GamePage, {
      gameKey: gameKey,
      wallet: wallet,
      onWallet: setWallet,
      onBack: () => setGameKey(null)
    }) : /*#__PURE__*/React.createElement(CasinoLobby, {
      search: search,
      onPlay: k => {
        setGameKey(k);
        window.scrollTo(0, 0);
      }
    });
  } else if (route === 'sportsbook') {
    screen = /*#__PURE__*/React.createElement(Sportsbook, {
      wallet: wallet,
      onWallet: setWallet,
      onToast: showToast
    });
  } else if (route === 'mybets') screen = /*#__PURE__*/React.createElement(MyBets, {
    wallet: wallet
  });else if (route === 'rewards') screen = /*#__PURE__*/React.createElement(Rewards, {
    me: D.ME
  });else if (route === 'leaderboard') screen = /*#__PURE__*/React.createElement(Leaderboard, null);else if (route === 'profile') screen = /*#__PURE__*/React.createElement(Profile, {
    me: D.ME,
    wallet: wallet
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Shell, {
    area: area,
    active: route,
    title: title,
    search: showSearch ? search : null,
    onSearch: setSearch,
    onNavigate: navigate,
    onEnterConsole: enterConsole,
    onExitConsole: exitConsole,
    wallet: wallet,
    me: D.ME,
    soundOn: soundOn,
    onToggleSound: () => setSoundOn(s => !s),
    onSignOut: () => {
      window.location.href = 'auth.html';
    }
  }, screen), /*#__PURE__*/React.createElement(Toast, {
    msg: toast
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(PlayStadiumApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/PlayStadiumApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/Shell.jsx
try { (() => {
/* global React, Icon, Button, Avatar, Badge, Dropdown, MenuItem, MenuLabel, MenuSep, Switch, Separator, SearchInput, cx */
// The app shell: shadcn-style left sidebar (swaps between the player app and the
// operator console), a topbar with the live wallet + account menu, and the scrolling
// content area. Pure chrome — App.jsx owns routing state and renders the active screen.
const {
  useState: useStateShell
} = React;
const LOGO = '../../assets/logo/playstadium-logo-trim.png';
const PLAYER_NAV = [{
  group: 'Play',
  items: [{
    key: 'casino',
    label: 'Casino',
    icon: 'dice'
  }, {
    key: 'sportsbook',
    label: 'Sportsbook',
    icon: 'target'
  }]
}, {
  group: 'Account',
  items: [{
    key: 'mybets',
    label: 'My Bets',
    icon: 'receipt'
  }, {
    key: 'rewards',
    label: 'Rewards',
    icon: 'gift'
  }, {
    key: 'leaderboard',
    label: 'Leaderboard',
    icon: 'trophy'
  }, {
    key: 'profile',
    label: 'Profile',
    icon: 'user'
  }]
}];
const CONSOLE_NAV = [{
  group: 'Operate',
  items: [{
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard'
  }, {
    key: 'players',
    label: 'Players & agents',
    icon: 'users'
  }, {
    key: 'risk',
    label: 'Risk & exposure',
    icon: 'shield'
  }, {
    key: 'settlement',
    label: 'Settlement & ledger',
    icon: 'wallet'
  }, {
    key: 'games',
    label: 'Games & edge',
    icon: 'sliders'
  }]
}];
function Brand({
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: "psa-brand",
    onClick: onClick
  }, /*#__PURE__*/React.createElement("img", {
    src: LOGO,
    alt: "",
    className: "psa-brand-mark"
  }), /*#__PURE__*/React.createElement("span", {
    className: "psa-brand-name wordmark"
  }, "PlayStadium", /*#__PURE__*/React.createElement("span", {
    className: "psa-brand-dot"
  }, ".io")));
}
function SideNav({
  nav,
  active,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "psa-nav scroll-y"
  }, nav.map(g => /*#__PURE__*/React.createElement("div", {
    className: "psa-nav-group",
    key: g.group
  }, /*#__PURE__*/React.createElement("div", {
    className: "psa-nav-label"
  }, g.group), g.items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.key,
    className: cx('psa-nav-item', active === it.key && 'is-active'),
    onClick: () => onNavigate(it.key)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 18
  }), /*#__PURE__*/React.createElement("span", null, it.label))))));
}
function Wallet({
  wallet
}) {
  const {
    fmt,
    fmtSigned
  } = window.PSA_DATA;
  const up = wallet.week > 0,
    down = wallet.week < 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "psa-wallet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "psa-wallet-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "psa-wallet-label"
  }, "Balance"), /*#__PURE__*/React.createElement("span", {
    className: "psa-wallet-value num"
  }, fmt(wallet.avail))), /*#__PURE__*/React.createElement("div", {
    className: "sep-v",
    style: {
      height: 28
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "psa-wallet-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "psa-wallet-label"
  }, "This week"), /*#__PURE__*/React.createElement("span", {
    className: cx('psa-wallet-value num', up && 'up', down && 'down')
  }, wallet.week === 0 ? 'Even' : (up ? '▲ ' : '▼ ') + fmtSigned(wallet.week).replace(/^[+−]/, ''))), /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "sm",
    className: "psa-wallet-deposit"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 15
  }), "Get points"));
}
function AccountMenu({
  me,
  soundOn,
  onToggleSound,
  area,
  onEnterConsole,
  onSignOut
}) {
  const tierColor = (window.PSA_DATA.VIP_TIERS.find(t => t.name === me.vip) || {}).color || 'var(--gold)';
  return /*#__PURE__*/React.createElement(Dropdown, {
    align: "end",
    width: 236,
    trigger: /*#__PURE__*/React.createElement("button", {
      className: "psa-acct"
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: me.name
    }), /*#__PURE__*/React.createElement("span", {
      className: "psa-acct-id"
    }, /*#__PURE__*/React.createElement("span", {
      className: "psa-acct-name"
    }, me.name), /*#__PURE__*/React.createElement("span", {
      className: "psa-acct-role"
    }, me.role)), /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-down",
      size: 15
    }))
  }, /*#__PURE__*/React.createElement("div", {
    className: "psa-acct-vip"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "crown",
    size: 16,
    style: {
      color: tierColor
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, me.vip, " tier"), /*#__PURE__*/React.createElement("span", {
    className: "right num",
    style: {
      marginLeft: 'auto',
      color: 'var(--muted-foreground)'
    }
  }, "VIP")), /*#__PURE__*/React.createElement(MenuSep, null), /*#__PURE__*/React.createElement("button", {
    className: "menu-item",
    onClick: onToggleSound,
    onMouseDown: e => e.preventDefault()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: soundOn ? 'volume-2' : 'volume-x',
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "Sound"), /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, soundOn ? 'On' : 'Off')), /*#__PURE__*/React.createElement(MenuItem, {
    icon: "user"
  }, "Profile & limits"), area !== 'console' && /*#__PURE__*/React.createElement(MenuItem, {
    icon: "dashboard",
    onClick: onEnterConsole
  }, "Management console"), /*#__PURE__*/React.createElement(MenuSep, null), /*#__PURE__*/React.createElement(MenuItem, {
    icon: "log-out",
    onClick: onSignOut
  }, "Sign out"));
}
function Shell({
  area,
  active,
  title,
  search,
  onSearch,
  onNavigate,
  onEnterConsole,
  onExitConsole,
  wallet,
  me,
  soundOn,
  onToggleSound,
  onSignOut,
  children
}) {
  const [mobileOpen, setMobileOpen] = useStateShell(false);
  const isConsole = area === 'console';
  const nav = isConsole ? CONSOLE_NAV : PLAYER_NAV;
  return /*#__PURE__*/React.createElement("div", {
    className: cx('psa-shell', mobileOpen && 'is-mobile-open')
  }, /*#__PURE__*/React.createElement("aside", {
    className: "psa-sidebar"
  }, /*#__PURE__*/React.createElement(Brand, {
    onClick: () => onNavigate(isConsole ? 'dashboard' : 'casino')
  }), isConsole && /*#__PURE__*/React.createElement("button", {
    className: "psa-back",
    onClick: onExitConsole
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 16
  }), "Back to app"), /*#__PURE__*/React.createElement(SideNav, {
    nav: nav,
    active: active,
    onNavigate: k => {
      onNavigate(k);
      setMobileOpen(false);
    }
  }), !isConsole && /*#__PURE__*/React.createElement("button", {
    className: "psa-console-cta",
    onClick: onEnterConsole
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dashboard",
    size: 18
  }), /*#__PURE__*/React.createElement("span", null, "Management console"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15,
    style: {
      marginLeft: 'auto'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "psa-side-foot"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 12
  }), "Provably fair"))), /*#__PURE__*/React.createElement("div", {
    className: "psa-scrim",
    onClick: () => setMobileOpen(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "psa-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "psa-topbar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-icon psa-burger",
    onClick: () => setMobileOpen(true)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "menu",
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    className: "psa-topbar-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, isConsole ? 'Operator' : 'Player'), /*#__PURE__*/React.createElement("h1", {
    className: "h-cond psa-page-title"
  }, title)), search != null && /*#__PURE__*/React.createElement("div", {
    className: "psa-topbar-search"
  }, /*#__PURE__*/React.createElement(SearchInput, {
    placeholder: "Search games\u2026",
    value: search,
    onChange: e => onSearch(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "psa-topbar-right"
  }, /*#__PURE__*/React.createElement(Wallet, {
    wallet: wallet
  }), /*#__PURE__*/React.createElement(AccountMenu, {
    me: me,
    soundOn: soundOn,
    onToggleSound: onToggleSound,
    area: area,
    onEnterConsole: onEnterConsole,
    onSignOut: onSignOut
  }))), /*#__PURE__*/React.createElement("main", {
    className: "psa-content scroll-y"
  }, children, /*#__PURE__*/React.createElement("footer", {
    className: "psa-footer"
  }, "Play money \u2014 points for fun, no buy-in, no cash-out. PlayStadium.io"))));
}
window.Shell = Shell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/Sportsbook.jsx
try { (() => {
/* global React, Icon, Button, Badge, LiveBadge, Card, Tabs, Input, Dialog, cx */
// Sportsbook: league rail, event board with tappable odds, and a docked bet slip
// (single / parlay) that debits the shared points balance.
const {
  useState: useSB,
  useMemo: useMSB
} = React;
const toDecimal = a => a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
const oddsNum = s => Number(String(s).replace(/[^-\d.]/g, ''));
function OddsButton({
  main,
  odds,
  selected,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: cx('odds', selected && 'is-on'),
    onClick: onClick
  }, odds != null ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "odds-line"
  }, main), /*#__PURE__*/React.createElement("span", {
    className: "odds-price num"
  }, odds)) : /*#__PURE__*/React.createElement("span", {
    className: "odds-price num solo"
  }, main));
}
function EventCard({
  ev,
  has,
  toggle
}) {
  const D = window.PSA_DATA;
  const colKey = ci => ci === 0 ? ['a', 'ao'] : ci === 1 ? ['b', 'bo'] : ['c', null];
  const mk = ev.markets;
  return /*#__PURE__*/React.createElement(Card, {
    className: "ev-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ev-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ev-top-l"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary"
  }, ev.league), ev.live ? /*#__PURE__*/React.createElement(LiveBadge, null, ev.clock) : /*#__PURE__*/React.createElement("span", {
    className: "ev-time"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 13
  }), ev.time)), /*#__PURE__*/React.createElement("button", {
    className: "ev-more"
  }, "+ markets")), /*#__PURE__*/React.createElement("div", {
    className: "ev-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ev-match"
  }, [ev.away, ev.home].map((t, ti) => /*#__PURE__*/React.createElement("div", {
    className: "ev-team",
    key: ti
  }, /*#__PURE__*/React.createElement("span", {
    className: "ev-team-name"
  }, t.name), t.score != null && /*#__PURE__*/React.createElement("span", {
    className: "ev-team-score num"
  }, t.score)))), /*#__PURE__*/React.createElement("div", {
    className: "ev-markets",
    style: {
      '--cols': mk.cols.length
    }
  }, mk.cols.map(c => /*#__PURE__*/React.createElement("div", {
    className: "ev-col-head",
    key: c
  }, c)), mk.type === '1x2' ? mk.cols.map((c, ci) => {
    const field = ['a', 'b', 'c'][ci];
    const val = mk.rows[0][field];
    const id = `${ev.id}:${c}`;
    return /*#__PURE__*/React.createElement(OddsButton, {
      key: c,
      main: val,
      selected: has(id),
      onClick: () => toggle({
        id,
        event: `${ev.away.name} v ${ev.home.name}`,
        pick: `${c === '1' ? ev.away.name : c === '2' ? ev.home.name : 'Draw'}`,
        odds: val
      })
    });
  }) : mk.cols.map((c, ci) => {
    const [mf, of] = colKey(ci);
    return mk.rows.map((row, ri) => {
      const main = row[mf];
      const odd = of ? row[of] : null;
      if (main == null) return /*#__PURE__*/React.createElement("span", {
        key: c + ri
      });
      const id = `${ev.id}:${c}:${ri}`;
      const pick = of ? `${row.label} ${main}` : `${row.label} ML`;
      return /*#__PURE__*/React.createElement(OddsButton, {
        key: c + ri,
        main: main,
        odds: odd,
        selected: has(id),
        onClick: () => toggle({
          id,
          event: `${ev.away.name} v ${ev.home.name}`,
          pick,
          odds: odd || main
        })
      });
    });
  }))));
}
function BetSlip({
  sels,
  setSels,
  wallet,
  onWallet,
  onPlaced
}) {
  const D = window.PSA_DATA;
  const [mode, setMode] = useSB('single');
  const [stake, setStake] = useSB(50);
  const remove = id => setSels(s => s.filter(x => x.id !== id));
  const dec = sels.map(s => toDecimal(oddsNum(s.odds)));
  const parlayDec = dec.reduce((a, b) => a * b, 1);
  const potential = sels.length === 0 ? 0 : mode === 'parlay' ? stake * parlayDec : sels.reduce((sum, s) => sum + stake * toDecimal(oddsNum(s.odds)), 0);
  const totalStake = mode === 'parlay' ? stake : stake * sels.length;
  const canPlace = sels.length > 0 && stake > 0 && totalStake <= wallet.avail;
  function place() {
    if (!canPlace) return;
    onWallet({
      ...wallet,
      avail: wallet.avail - totalStake,
      risk: wallet.risk + totalStake
    });
    setSels([]);
    onPlaced(`Bet placed · ${D.fmt(totalStake)} stake`);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "slip"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slip-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "h-cond slip-title"
  }, "Bet slip"), sels.length > 0 && /*#__PURE__*/React.createElement(Badge, {
    variant: "gold"
  }, sels.length), sels.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "slip-clear",
    onClick: () => setSels([])
  }, "Clear")), sels.length > 1 && /*#__PURE__*/React.createElement(Tabs, {
    className: "slip-tabs",
    value: mode,
    onChange: setMode,
    options: [{
      value: 'single',
      label: 'Singles'
    }, {
      value: 'parlay',
      label: `Parlay ${parlayDec.toFixed(2)}×`
    }],
    gold: true
  }), sels.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "slip-empty"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ticket",
    size: 26
  }), /*#__PURE__*/React.createElement("p", null, "Tap any odds to add a pick.")) : /*#__PURE__*/React.createElement("div", {
    className: "slip-list scroll-y"
  }, sels.map(s => /*#__PURE__*/React.createElement("div", {
    className: "slip-pick",
    key: s.id
  }, /*#__PURE__*/React.createElement("div", {
    className: "slip-pick-main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "slip-pick-name"
  }, s.pick), /*#__PURE__*/React.createElement("span", {
    className: "slip-pick-ev"
  }, s.event)), /*#__PURE__*/React.createElement("span", {
    className: "slip-pick-odds num"
  }, s.odds), /*#__PURE__*/React.createElement("button", {
    className: "slip-x",
    onClick: () => remove(s.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14
  }))))), sels.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "slip-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slip-stake"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, mode === 'parlay' ? 'Parlay stake' : 'Stake (each)'), /*#__PURE__*/React.createElement("div", {
    className: "gp-bet-input"
  }, /*#__PURE__*/React.createElement("span", {
    className: "gp-bet-$"
  }, "$"), /*#__PURE__*/React.createElement("input", {
    className: "input num",
    type: "number",
    value: stake,
    min: 1,
    onChange: e => setStake(Math.max(1, Number(e.target.value) || 0))
  }))), /*#__PURE__*/React.createElement("div", {
    className: "slip-summary"
  }, /*#__PURE__*/React.createElement("div", {
    className: "slip-row"
  }, /*#__PURE__*/React.createElement("span", null, "Total stake"), /*#__PURE__*/React.createElement("span", {
    className: "num"
  }, D.fmt(totalStake))), /*#__PURE__*/React.createElement("div", {
    className: "slip-row slip-row-pot"
  }, /*#__PURE__*/React.createElement("span", null, "Potential payout"), /*#__PURE__*/React.createElement("span", {
    className: "num gold"
  }, D.fmt(potential)))), /*#__PURE__*/React.createElement(Button, {
    variant: "default",
    size: "lg",
    block: true,
    disabled: !canPlace,
    onClick: place
  }, totalStake > wallet.avail ? 'Not enough points' : 'Place bet')));
}
function Sportsbook({
  wallet,
  onWallet,
  onToast
}) {
  const D = window.PSA_DATA;
  const [league, setLeague] = useSB('all');
  const [sels, setSels] = useSB([]);
  const [slipOpen, setSlipOpen] = useSB(false);
  const events = useMSB(() => D.EVENTS.filter(e => league === 'all' || e.sport === league), [league]);
  const has = id => sels.some(s => s.id === id);
  const toggle = sel => setSels(s => s.some(x => x.id === sel.id) ? s.filter(x => x.id !== sel.id) : [...s, sel]);
  return /*#__PURE__*/React.createElement("div", {
    className: "screen sb-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-rail"
  }, D.SPORTS.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.key,
    className: cx('rail-chip', league === s.key && 'is-on'),
    onClick: () => setLeague(s.key)
  }, s.label))), /*#__PURE__*/React.createElement("div", {
    className: "sb-board"
  }, events.map(ev => /*#__PURE__*/React.createElement(EventCard, {
    key: ev.id,
    ev: ev,
    has: has,
    toggle: toggle
  })))), /*#__PURE__*/React.createElement("aside", {
    className: "sb-slip-dock"
  }, /*#__PURE__*/React.createElement(BetSlip, {
    sels: sels,
    setSels: setSels,
    wallet: wallet,
    onWallet: onWallet,
    onPlaced: onToast
  })), sels.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "slip-fab",
    onClick: () => setSlipOpen(true)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ticket",
    size: 18
  }), "Bet slip \xB7 ", sels.length), /*#__PURE__*/React.createElement(Dialog, {
    open: slipOpen,
    onClose: () => setSlipOpen(false),
    sheet: true
  }, /*#__PURE__*/React.createElement("div", {
    className: "sheet-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "h-cond",
    style: {
      fontSize: 18
    }
  }, "Bet slip"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-icon btn-sm",
    onClick: () => setSlipOpen(false)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sheet-body scroll-y"
  }, /*#__PURE__*/React.createElement(BetSlip, {
    sels: sels,
    setSels: setSels,
    wallet: wallet,
    onWallet: onWallet,
    onPlaced: m => {
      onToast(m);
      setSlipOpen(false);
    }
  }))));
}
window.Sportsbook = Sportsbook;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/Sportsbook.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/data.js
try { (() => {
/* PlayStadium — mock data for the UI kit. Points only (shown with $ for familiarity,
   no cash value). Game art = the real 3D PNGs in ../../assets/game-icons/. */
(function () {
  const ART = '../../assets/game-icons/';
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  const fmtSigned = n => (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const mult = m => m.toFixed(2) + '×';

  // 21 Originals — key matches the PNG filename in assets/game-icons/
  const GAMES = [{
    key: 'mines',
    name: 'Mines',
    cat: 'Originals',
    hot: true,
    tag: 'Uncover gems for a rising multiplier while dodging the hidden mines.'
  }, {
    key: 'crash',
    name: 'Crash',
    cat: 'Originals',
    hot: true,
    tag: 'Watch the multiplier climb and cash out before the rocket crashes.'
  }, {
    key: 'plinko',
    name: 'Plinko',
    cat: 'Originals',
    hot: true,
    tag: 'Drop a ball down the pins and ride it to a multiplier — the edges pay biggest.'
  }, {
    key: 'dice',
    name: 'Dice',
    cat: 'Originals',
    tag: 'Roll over or under your number — slide to set your own odds and payout.'
  }, {
    key: 'limbo',
    name: 'Limbo',
    cat: 'Originals',
    hot: true,
    tag: 'Pick a target multiplier and watch your bet climb — clear it to win.'
  }, {
    key: 'keno',
    name: 'Keno',
    cat: 'Originals',
    tag: 'Choose your numbers and watch the draw — the more you match, the more you win.'
  }, {
    key: 'wheel',
    name: 'Wheel',
    cat: 'Originals',
    tag: 'Spin the wheel and land a multiplier — set your risk and segments.'
  }, {
    key: 'hilo',
    name: 'Hilo',
    cat: 'Cards',
    tag: 'Call the next card higher or lower and ride the streak.'
  }, {
    key: 'dragon-tower',
    name: 'Dragon Tower',
    cat: 'Originals',
    tag: 'Climb the tower row by row, dodging the hidden skulls.'
  }, {
    key: 'pump',
    name: 'Pump',
    cat: 'Originals',
    hot: true,
    tag: 'Inflate the balloon for a bigger multiplier — bank it before it pops.'
  }, {
    key: 'coinflip',
    name: 'Coinflip',
    cat: 'Originals',
    tag: 'Heads or tails — double or nothing, the simplest edge on the floor.'
  }, {
    key: 'diamonds',
    name: 'Diamonds',
    cat: 'Originals',
    tag: 'Match the gems you draw for a poker-style multiplier payout.'
  }, {
    key: 'cases',
    name: 'Cases',
    cat: 'Originals',
    tag: 'Open a case and spin the reel for a hidden multiplier.'
  }, {
    key: 'chickenroad',
    name: 'Chicken Road',
    cat: 'Originals',
    new: true,
    tag: 'Cross lane by lane for a climbing multiplier — don\u2019t get caught.'
  }, {
    key: 'blackjack',
    name: 'Blackjack',
    cat: 'Table',
    tag: 'Beat the dealer to 21 without going over.'
  }, {
    key: 'roulette',
    name: 'Roulette',
    cat: 'Table',
    tag: 'Place your chips on the single-zero European wheel.'
  }, {
    key: 'baccarat',
    name: 'Baccarat',
    cat: 'Table',
    tag: 'Bet player, banker or tie on the classic table game.'
  }, {
    key: 'sicbo',
    name: 'Sic Bo',
    cat: 'Table',
    tag: 'Three dice, dozens of bets — call the roll.'
  }, {
    key: 'threecardpoker',
    name: 'Three Card Poker',
    cat: 'Cards',
    tag: 'Make your best three-card hand against the dealer.'
  }, {
    key: 'videopoker',
    name: 'Video Poker',
    cat: 'Cards',
    new: true,
    tag: 'Jacks or better — hold, draw and hit the royal.'
  }, {
    key: 'slots',
    name: 'Slots',
    cat: 'Slots',
    tag: 'Spin the reels for lines, scatters and free spins.'
  }].map(g => ({
    ...g,
    icon: ART + g.key + '.png'
  }));
  const CATEGORIES = ['All', 'Originals', 'Table', 'Cards', 'Slots'];

  // Sportsbook
  const SPORTS = [{
    key: 'all',
    label: 'All'
  }, {
    key: 'nba',
    label: 'NBA'
  }, {
    key: 'nfl',
    label: 'NFL'
  }, {
    key: 'soccer',
    label: 'Soccer'
  }, {
    key: 'mlb',
    label: 'MLB'
  }, {
    key: 'nhl',
    label: 'NHL'
  }, {
    key: 'ufc',
    label: 'UFC'
  }];
  const EVENTS = [{
    id: 'e1',
    league: 'NBA',
    sport: 'nba',
    live: true,
    clock: 'Q3 · 4:12',
    away: {
      name: 'Celtics',
      score: 71
    },
    home: {
      name: 'Lakers',
      score: 68
    },
    markets: {
      type: '3way',
      cols: ['Spread', 'Total', 'Money'],
      rows: [{
        label: 'Celtics',
        a: '-3.5',
        ao: '-110',
        b: 'o 224.5',
        bo: '-105',
        c: '-145'
      }, {
        label: 'Lakers',
        a: '+3.5',
        ao: '-110',
        b: 'u 224.5',
        bo: '-115',
        c: '+124'
      }]
    }
  }, {
    id: 'e2',
    league: 'NBA',
    sport: 'nba',
    time: 'Tomorrow · 7:30 PM',
    away: {
      name: 'Warriors'
    },
    home: {
      name: 'Nuggets'
    },
    markets: {
      type: '3way',
      cols: ['Spread', 'Total', 'Money'],
      rows: [{
        label: 'Warriors',
        a: '+5.5',
        ao: '-108',
        b: 'o 232.5',
        bo: '-110',
        c: '+182'
      }, {
        label: 'Nuggets',
        a: '-5.5',
        ao: '-112',
        b: 'u 232.5',
        bo: '-110',
        c: '-220'
      }]
    }
  }, {
    id: 'e3',
    league: 'NFL',
    sport: 'nfl',
    time: 'Sun · 1:00 PM',
    away: {
      name: 'Eagles'
    },
    home: {
      name: 'Cowboys'
    },
    markets: {
      type: '3way',
      cols: ['Spread', 'Total', 'Money'],
      rows: [{
        label: 'Eagles',
        a: '-2.5',
        ao: '-110',
        b: 'o 47.5',
        bo: '-110',
        c: '-135'
      }, {
        label: 'Cowboys',
        a: '+2.5',
        ao: '-110',
        b: 'u 47.5',
        bo: '-110',
        c: '+114'
      }]
    }
  }, {
    id: 'e4',
    league: 'Soccer',
    sport: 'soccer',
    live: true,
    clock: "67'",
    away: {
      name: 'Arsenal',
      score: 1
    },
    home: {
      name: 'Chelsea',
      score: 1
    },
    markets: {
      type: '1x2',
      cols: ['1', 'X', '2'],
      rows: [{
        label: 'Match result',
        a: '+165',
        b: '+205',
        c: '+170'
      }]
    }
  }, {
    id: 'e5',
    league: 'NHL',
    sport: 'nhl',
    time: 'Today · 9:00 PM',
    away: {
      name: 'Oilers'
    },
    home: {
      name: 'Knights'
    },
    markets: {
      type: '3way',
      cols: ['Puck', 'Total', 'Money'],
      rows: [{
        label: 'Oilers',
        a: '+1.5',
        ao: '-180',
        b: 'o 6.5',
        bo: '+100',
        c: '+128'
      }, {
        label: 'Knights',
        a: '-1.5',
        ao: '+150',
        b: 'u 6.5',
        bo: '-120',
        c: '-152'
      }]
    }
  }, {
    id: 'e6',
    league: 'MLB',
    sport: 'mlb',
    time: 'Today · 8:05 PM',
    away: {
      name: 'Dodgers'
    },
    home: {
      name: 'Padres'
    },
    markets: {
      type: '3way',
      cols: ['Run', 'Total', 'Money'],
      rows: [{
        label: 'Dodgers',
        a: '-1.5',
        ao: '+128',
        b: 'o 8.5',
        bo: '-105',
        c: '-138'
      }, {
        label: 'Padres',
        a: '+1.5',
        ao: '-150',
        b: 'u 8.5',
        bo: '-115',
        c: '+118'
      }]
    }
  }, {
    id: 'e7',
    league: 'UFC',
    sport: 'ufc',
    time: 'Sat · 10:00 PM',
    away: {
      name: 'Adesanya'
    },
    home: {
      name: 'Pereira'
    },
    markets: {
      type: 'ml',
      cols: ['Money'],
      rows: [{
        label: 'Adesanya',
        c: '+135'
      }, {
        label: 'Pereira',
        c: '-155'
      }]
    }
  }];

  // Org roster (hierarchy)
  const PLAYERS = [{
    id: 'p1',
    name: 'Marcus Vane',
    role: 'player',
    agent: 'Eddie Cole',
    week: 4820,
    avail: 12400,
    risk: 600,
    status: 'active',
    vip: 'Gold'
  }, {
    id: 'p2',
    name: 'Sloane Reyes',
    role: 'player',
    agent: 'Eddie Cole',
    week: -1240,
    avail: 3800,
    risk: 250,
    status: 'active',
    vip: 'Silver'
  }, {
    id: 'p3',
    name: 'Theo Park',
    role: 'player',
    agent: 'Nadia Frost',
    week: 9680,
    avail: 22100,
    risk: 1500,
    status: 'active',
    vip: 'Platinum'
  }, {
    id: 'p4',
    name: 'Junie Hart',
    role: 'player',
    agent: 'Nadia Frost',
    week: -3200,
    avail: 900,
    risk: 0,
    status: 'active',
    vip: 'Bronze'
  }, {
    id: 'p5',
    name: 'Dario Quinn',
    role: 'player',
    agent: 'Eddie Cole',
    week: 1450,
    avail: 7600,
    risk: 400,
    status: 'active',
    vip: 'Silver'
  }, {
    id: 'p6',
    name: 'Wes Calloway',
    role: 'player',
    agent: 'Nadia Frost',
    week: -560,
    avail: 5200,
    risk: 120,
    status: 'suspended',
    vip: 'Bronze'
  }, {
    id: 'p7',
    name: 'Indra Bose',
    role: 'player',
    agent: 'Eddie Cole',
    week: 12300,
    avail: 31000,
    risk: 2200,
    status: 'active',
    vip: 'Diamond'
  }, {
    id: 'p8',
    name: 'Cleo March',
    role: 'player',
    agent: 'Nadia Frost',
    week: 740,
    avail: 4100,
    risk: 80,
    status: 'active',
    vip: 'Gold'
  }];
  const AGENTS = [{
    id: 'a1',
    name: 'Eddie Cole',
    role: 'agent',
    players: 4,
    week: 7470,
    status: 'active'
  }, {
    id: 'a2',
    name: 'Nadia Frost',
    role: 'agent',
    players: 4,
    week: 6960,
    status: 'active'
  }];

  // The signed-in player (the wallet in the header)
  const ME = {
    id: 'p1',
    name: 'Marcus Vane',
    vip: 'Gold',
    avail: 12400,
    week: 4820,
    risk: 600,
    role: 'player'
  };

  // My Bets feed (casino + sportsbook)
  const BETS = [{
    id: 'b1',
    game: 'Mines',
    side: 'casino',
    stake: 200,
    mult: 3.96,
    outcome: 'win',
    when: '2m ago'
  }, {
    id: 'b2',
    game: 'Lakers ML',
    side: 'sportsbook',
    stake: 500,
    mult: 0,
    outcome: 'loss',
    when: '14m ago'
  }, {
    id: 'b3',
    game: 'Crash',
    side: 'casino',
    stake: 150,
    mult: 12.4,
    outcome: 'win',
    when: '31m ago'
  }, {
    id: 'b4',
    game: 'Celtics −3.5',
    side: 'sportsbook',
    stake: 300,
    mult: 1.91,
    outcome: 'win',
    when: '1h ago'
  }, {
    id: 'b5',
    game: 'Plinko',
    side: 'casino',
    stake: 100,
    mult: 0,
    outcome: 'loss',
    when: '1h ago'
  }, {
    id: 'b6',
    game: 'Limbo',
    side: 'casino',
    stake: 80,
    mult: 2.0,
    outcome: 'win',
    when: '2h ago'
  }, {
    id: 'b7',
    game: 'Parlay (3)',
    side: 'sportsbook',
    stake: 250,
    mult: 0,
    outcome: 'loss',
    when: '3h ago'
  }, {
    id: 'b8',
    game: 'Dice',
    side: 'casino',
    stake: 120,
    mult: 1.98,
    outcome: 'win',
    when: '4h ago'
  }, {
    id: 'b9',
    game: 'Pump',
    side: 'casino',
    stake: 60,
    mult: 0,
    outcome: 'loss',
    when: '5h ago'
  }, {
    id: 'b10',
    game: 'Roulette',
    side: 'casino',
    stake: 200,
    mult: 2.0,
    outcome: 'win',
    when: '6h ago'
  }, {
    id: 'b11',
    game: 'Warriors +5.5',
    side: 'sportsbook',
    stake: 400,
    mult: 1.92,
    outcome: 'win',
    when: 'Yesterday'
  }, {
    id: 'b12',
    game: 'Wheel',
    side: 'casino',
    stake: 90,
    mult: 0,
    outcome: 'loss',
    when: 'Yesterday'
  }];

  // Leaderboard (weekly)
  const LEADERBOARD = [{
    rank: 1,
    name: 'Indra Bose',
    vip: 'Diamond',
    week: 12300,
    wagered: 84000
  }, {
    rank: 2,
    name: 'Theo Park',
    vip: 'Platinum',
    week: 9680,
    wagered: 61200
  }, {
    rank: 3,
    name: 'Marcus Vane',
    vip: 'Gold',
    week: 4820,
    wagered: 39400,
    me: true
  }, {
    rank: 4,
    name: 'Dario Quinn',
    vip: 'Silver',
    week: 1450,
    wagered: 18600
  }, {
    rank: 5,
    name: 'Cleo March',
    vip: 'Gold',
    week: 740,
    wagered: 14200
  }, {
    rank: 6,
    name: 'Wes Calloway',
    vip: 'Bronze',
    week: -560,
    wagered: 9800
  }, {
    rank: 7,
    name: 'Sloane Reyes',
    vip: 'Silver',
    week: -1240,
    wagered: 22300
  }, {
    rank: 8,
    name: 'Junie Hart',
    vip: 'Bronze',
    week: -3200,
    wagered: 12700
  }];

  // VIP / rewards
  const VIP_TIERS = [{
    name: 'Bronze',
    need: 0,
    color: '#b08d57'
  }, {
    name: 'Silver',
    need: 25000,
    color: '#c4c4c2'
  }, {
    name: 'Gold',
    need: 75000,
    color: '#f0be4a'
  }, {
    name: 'Platinum',
    need: 200000,
    color: '#9fd8e8'
  }, {
    name: 'Diamond',
    need: 500000,
    color: '#7ea2ff'
  }];
  const REWARDS = [{
    id: 'r1',
    title: 'Weekly bonus',
    sub: 'Claim every Monday',
    value: '$500',
    state: 'ready',
    icon: 'gift'
  }, {
    id: 'r2',
    title: 'Rakeback',
    sub: '5% of house edge, daily',
    value: '$128',
    state: 'accruing',
    icon: 'percent'
  }, {
    id: 'r3',
    title: 'Reload boost',
    sub: 'Next 3 deposits +10%',
    value: '+10%',
    state: 'locked',
    icon: 'zap'
  }, {
    id: 'r4',
    title: 'Level-up chest',
    sub: 'Unlocks at Platinum',
    value: '$2,500',
    state: 'locked',
    icon: 'sparkles'
  }];

  // Risk / exposure (operator)
  const EXPOSURE = [{
    id: 'x1',
    event: 'Lakers v Celtics',
    market: 'Spread',
    side: 'Lakers +3.5',
    open: 8400,
    max: 12000,
    tone: 'mid'
  }, {
    id: 'x2',
    event: 'Cowboys v Eagles',
    market: 'Money',
    side: 'Eagles ML',
    open: 11200,
    max: 12000,
    tone: 'high'
  }, {
    id: 'x3',
    event: 'Casino · Crash',
    market: 'Originals',
    side: 'House',
    open: 3200,
    max: 15000,
    tone: 'low'
  }, {
    id: 'x4',
    event: 'Nuggets v Warriors',
    market: 'Total',
    side: 'Over 232.5',
    open: 6100,
    max: 12000,
    tone: 'mid'
  }, {
    id: 'x5',
    event: 'Padres v Dodgers',
    market: 'Run line',
    side: 'Dodgers -1.5',
    open: 2400,
    max: 10000,
    tone: 'low'
  }, {
    id: 'x6',
    event: 'Casino · Mines',
    market: 'Originals',
    side: 'House',
    open: 5400,
    max: 15000,
    tone: 'mid'
  }];

  // Ledger / cashier transactions
  const LEDGER = [{
    id: 't1',
    when: '09:42',
    player: 'Marcus Vane',
    type: 'Settle',
    detail: 'Mines · win',
    amount: 592
  }, {
    id: 't2',
    when: '09:40',
    player: 'Sloane Reyes',
    type: 'Wager',
    detail: 'Lakers ML',
    amount: -500
  }, {
    id: 't3',
    when: '09:31',
    player: 'Theo Park',
    type: 'Settle',
    detail: 'Crash · win',
    amount: 1860
  }, {
    id: 't4',
    when: '09:18',
    player: 'Indra Bose',
    type: 'Adjust',
    detail: 'Credit increase',
    amount: 5000
  }, {
    id: 't5',
    when: '09:02',
    player: 'Junie Hart',
    type: 'Wager',
    detail: 'Parlay (3)',
    amount: -250
  }, {
    id: 't6',
    when: '08:55',
    player: 'Dario Quinn',
    type: 'Settle',
    detail: 'Roulette · win',
    amount: 400
  }, {
    id: 't7',
    when: '08:47',
    player: 'Cleo March',
    type: 'Wager',
    detail: 'Dice',
    amount: -120
  }, {
    id: 't8',
    when: '08:30',
    player: 'Wes Calloway',
    type: 'Settle',
    detail: 'Plinko · loss',
    amount: -100
  }];

  // Live activity ticker (lobby)
  const ACTIVITY = [{
    name: 'Indra B.',
    game: 'Crash',
    mult: 18.2,
    payout: 2730
  }, {
    name: 'Theo P.',
    game: 'Mines',
    mult: 9.1,
    payout: 1820
  }, {
    name: 'Cleo M.',
    game: 'Limbo',
    mult: 4.0,
    payout: 360
  }, {
    name: 'Dario Q.',
    game: 'Plinko',
    mult: 6.5,
    payout: 975
  }, {
    name: 'Marcus V.',
    game: 'Dice',
    mult: 1.98,
    payout: 238
  }];
  const CONSOLE_FIGURES = {
    balance: 102400,
    week: 14430,
    weekTone: 'up',
    today: 3260,
    todayTone: 'up',
    active: 7
  };
  window.PSA_DATA = {
    fmt,
    fmtSigned,
    mult,
    GAMES,
    CATEGORIES,
    SPORTS,
    EVENTS,
    PLAYERS,
    AGENTS,
    ME,
    BETS,
    LEADERBOARD,
    VIP_TIERS,
    REWARDS,
    EXPOSURE,
    LEDGER,
    ACTIVITY,
    CONSOLE_FIGURES
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/data.js", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/icons.jsx
try { (() => {
/* global React */
// Lucide-style inline icon set (thin 1.75 stroke), matching the brand's hairline
// weight. Inner SVG markup kept as strings for compactness; <Icon name size/>
// renders them. Game tiles use the real 3D PNGs in assets/ — these are UI chrome.

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  'chevron-right': '<polyline points="9 6 15 12 9 18"/>',
  'chevron-left': '<polyline points="15 6 9 12 15 18"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-up-right': '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M17.5 14.4A5.5 5.5 0 0 1 21 20"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1"/><path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5Z"/><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/>',
  gift: '<rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7.5h14V13"/><line x1="12" y1="9" x2="12" y2="20.5"/><path d="M12 9C12 6 10.5 4.5 8.8 4.5A2.3 2.3 0 0 0 8.8 9Z"/><path d="M12 9c0-3 1.5-4.5 3.2-4.5A2.3 2.3 0 0 1 15.2 9Z"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 7.5 11"/><path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16.5 11"/><line x1="12" y1="14" x2="12" y2="17.5"/><path d="M8.5 20.5h7"/><path d="M9.5 17.5h5l.5 3h-6Z"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none"/>',
  gem: '<path d="M5 9h14l-7 11Z"/><path d="M5 9 8 4h8l3 5"/><path d="M8 4 9.5 9 12 4 14.5 9 16 4"/><path d="M9.5 9 12 20l2.5-11"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="8.5" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="5.5" rx="1.4"/><rect x="3.5" y="15" width="7" height="5.5" rx="1.4"/><rect x="13.5" y="12" width="7" height="8.5" rx="1.4"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4 3 7.3 7 9 4-1.7 7-5 7-9V6Z"/><polyline points="9.2 12 11.2 14 15 9.6"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 1.6 6.5 1.6 6.5H4.4S6 14 6 9Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  'bar-chart': '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="9"/>',
  'trending-up': '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
  'trending-down': '<polyline points="3 7 9 13 13 9 21 17"/><polyline points="15 17 21 17 21 11"/>',
  sparkles: '<path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9Z"/><path d="M18.5 4.5 19 6.5 21 7 19 7.5 18.5 9.5 18 7.5 16 7 18 6.5Z" fill="currentColor" stroke="none"/>',
  crown: '<path d="M4 8.5 7.5 12 12 6l4.5 6L20 8.5 18.5 18h-13Z"/><line x1="5.5" y1="20.5" x2="18.5" y2="20.5"/>',
  star: '<path d="M12 3.5 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.6 6.6 19.5 7.9 13.6 3.4 9.6l6-.6Z"/>',
  coins: '<ellipse cx="9" cy="7.5" rx="5.5" ry="3"/><path d="M3.5 7.5v4c0 1.66 2.46 3 5.5 3"/><path d="M9 14.5c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3v-4"/><ellipse cx="15" cy="10.5" rx="5.5" ry="3"/>',
  activity: '<polyline points="3 12 7 12 10 4 14 20 17 12 21 12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5 19.8 17M4.2 17l2.6-1.5M17.2 8.5 19.8 7"/>',
  sliders: '<line x1="5" y1="4" x2="5" y2="14"/><line x1="5" y1="18" x2="5" y2="20"/><circle cx="5" cy="16" r="2"/><line x1="12" y1="4" x2="12" y2="9"/><line x1="12" y1="13" x2="12" y2="20"/><circle cx="12" cy="11" r="2"/><line x1="19" y1="4" x2="19" y2="14"/><line x1="19" y1="18" x2="19" y2="20"/><circle cx="19" cy="16" r="2"/>',
  'log-out': '<path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14"/><polyline points="16 8 20 12 16 16"/><line x1="20" y1="12" x2="9" y2="12"/>',
  'volume-2': '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  'volume-x': '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z"/><line x1="16" y1="9.5" x2="20.5" y2="14"/><line x1="20.5" y1="9.5" x2="16" y2="14"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><polyline points="12 7.5 12 12 15 13.5"/>',
  play: '<path d="M7 4.5 19 12 7 19.5Z" fill="currentColor" stroke="none"/>',
  percent: '<line x1="18" y1="6" x2="6" y2="18"/><circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/>',
  flame: '<path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1 .4-1.8 1-2.5C9 10 9 12 9 12c-1-2 1-6 3-9Z"/>',
  zap: '<path d="M13 2 4.5 13H11l-1 9 8.5-11H12Z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 2v-8.5Z"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><line x1="4" y1="9.5" x2="20" y2="9.5"/><line x1="8.5" y1="3.5" x2="8.5" y2="7"/><line x1="15.5" y1="3.5" x2="15.5" y2="7"/>',
  'dollar-sign': '<line x1="12" y1="3" x2="12" y2="21"/><path d="M16 6.5C16 5 14 4 12 4S8 5 8 7s2 3 4 3.5 4 1.5 4 3.5-2 3-4 3-4-1-4-2.5"/>',
  'circle-dot': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  'panel-left': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><line x1="9.5" y1="4.5" x2="9.5" y2="19.5"/>',
  'more-horizontal': '<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  receipt: '<path d="M5 3.5h14v17l-2.3-1.4L14.4 21 12 19.4 9.6 21 7.3 19.1 5 20.5Z"/><line x1="8.5" y1="8" x2="15.5" y2="8"/><line x1="8.5" y1="12" x2="15.5" y2="12"/>',
  megaphone: '<path d="M4 9.5 16 5v12L4 13Z"/><path d="M4 9.5H3a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h1"/><path d="M16 7a3.5 3.5 0 0 1 0 8"/><path d="M7 13.5V18l3 1v-4"/>',
  flag: '<line x1="5" y1="3.5" x2="5" y2="21"/><path d="M5 4.5h12l-2 3.5 2 3.5H5Z"/>',
  'pie-chart': '<path d="M12 3.5A8.5 8.5 0 1 0 20.5 12H12Z"/><path d="M12 3.5V12h8.5A8.5 8.5 0 0 0 12 3.5Z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.4 2.5 14.6 0 17M12 3.5c-2.5 2.4-2.5 14.6 0 17"/>',
  ticket: '<path d="M3.5 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/><line x1="14" y1="6" x2="14" y2="16" stroke-dasharray="1.5 2"/>',
  bolt: '<path d="M13 2 4.5 13H11l-1 9 8.5-11H12Z"/>',
  'shield-check': '<path d="M12 3 5 6v5.5c0 4 3 7.3 7 9 4-1.7 7-5 7-9V6Z"/><polyline points="9.2 12 11.2 14 15 9.6"/>',
  hash: '<line x1="9" y1="4" x2="7.5" y2="20"/><line x1="16.5" y1="4" x2="15" y2="20"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="3.5" y1="15" x2="19.5" y2="15"/>'
};
function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className = '',
  style
}) {
  const inner = ICONS[name] || '';
  return React.createElement('svg', {
    className,
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style,
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/playstadium-app/ui.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* global React */
// shadcn/ui-style primitives, brand-themed via theme.css. Minimal, self-contained
// (no Radix/Tailwind) — same component vocabulary and class structure shadcn uses.
const {
  useState,
  useRef,
  useEffect,
  useCallback
} = React;
const cx = (...a) => a.filter(Boolean).join(' ');

/* ---------------- Button ---------------- */
function Button({
  variant = 'default',
  size,
  block,
  icon,
  className = '',
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cx('btn', `btn-${variant}`, size && `btn-${size}`, icon && 'btn-icon', block && 'btn-block', className)
  }, rest), children);
}

/* ---------------- Card ---------------- */
const Card = ({
  className = '',
  children,
  ...r
}) => /*#__PURE__*/React.createElement("div", _extends({
  className: cx('card', className)
}, r), children);
const CardHeader = ({
  className = '',
  children,
  ...r
}) => /*#__PURE__*/React.createElement("div", _extends({
  className: cx('card-header', className)
}, r), children);
const CardTitle = ({
  className = '',
  children,
  ...r
}) => /*#__PURE__*/React.createElement("div", _extends({
  className: cx('card-title', className)
}, r), children);
const CardDescription = ({
  className = '',
  children,
  ...r
}) => /*#__PURE__*/React.createElement("div", _extends({
  className: cx('card-desc', className)
}, r), children);
const CardContent = ({
  className = '',
  children,
  ...r
}) => /*#__PURE__*/React.createElement("div", _extends({
  className: cx('card-content', className)
}, r), children);
const CardFooter = ({
  className = '',
  children,
  ...r
}) => /*#__PURE__*/React.createElement("div", _extends({
  className: cx('card-footer', className)
}, r), children);

/* ---------------- Badge ---------------- */
function Badge({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cx('badge', `badge-${variant}`, className)
  }, rest), children);
}
const LiveBadge = ({
  children = 'Live'
}) => /*#__PURE__*/React.createElement("span", {
  className: "badge badge-live"
}, /*#__PURE__*/React.createElement("span", {
  className: "dot"
}), children);

/* ---------------- Tabs (controlled) ---------------- */
function Tabs({
  value,
  onChange,
  options,
  gold,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: cx('tabs-list', className),
    role: "tablist"
  }, options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      role: "tab",
      className: cx('tabs-trigger', gold && 'is-gold'),
      "data-active": value === v,
      onClick: () => onChange(v)
    }, label);
  }));
}

/* ---------------- Input / Field ---------------- */
const Input = ({
  className = '',
  ...r
}) => /*#__PURE__*/React.createElement("input", _extends({
  className: cx('input', className)
}, r));
const Field = ({
  label,
  children
}) => /*#__PURE__*/React.createElement("label", {
  className: "field"
}, label && /*#__PURE__*/React.createElement("span", {
  className: "label"
}, label), children);
function SearchInput({
  className = '',
  ...r
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: cx('search', className)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16
  }), /*#__PURE__*/React.createElement("input", _extends({
    className: "input"
  }, r)));
}

/* ---------------- Avatar ---------------- */
function Avatar({
  name = '',
  src,
  size = '',
  className = ''
}) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  return /*#__PURE__*/React.createElement("span", {
    className: cx('avatar', size, className)
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initial);
}

/* ---------------- Progress / Switch / Separator ---------------- */
const Progress = ({
  value = 0,
  className = ''
}) => /*#__PURE__*/React.createElement("div", {
  className: cx('progress', className)
}, /*#__PURE__*/React.createElement("span", {
  style: {
    width: `${Math.max(0, Math.min(100, value))}%`
  }
}));
const Switch = ({
  checked,
  onChange
}) => /*#__PURE__*/React.createElement("button", {
  type: "button",
  className: "switch",
  "data-on": !!checked,
  onClick: () => onChange && onChange(!checked),
  role: "switch",
  "aria-checked": !!checked
}, /*#__PURE__*/React.createElement("span", null));
const Separator = ({
  vertical,
  className = ''
}) => /*#__PURE__*/React.createElement("div", {
  className: cx(vertical ? 'sep-v' : 'sep', className)
});

/* ---------------- Stat tile ---------------- */
function Stat({
  label,
  value,
  delta,
  deltaTone,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: cx('stat', className)
  }, /*#__PURE__*/React.createElement("span", {
    className: "stat-label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "stat-value"
  }, value), delta != null && /*#__PURE__*/React.createElement("span", {
    className: cx('stat-delta', deltaTone === 'up' && 'up', deltaTone === 'down' && 'down')
  }, deltaTone && /*#__PURE__*/React.createElement(Icon, {
    name: deltaTone === 'up' ? 'trending-up' : 'trending-down',
    size: 13
  }), delta));
}

/* ---------------- Placeholder (image slot) ---------------- */
const Placeholder = ({
  label = 'Image',
  className = '',
  style
}) => /*#__PURE__*/React.createElement("div", {
  className: cx('ph', className),
  style: style
}, /*#__PURE__*/React.createElement("span", {
  className: "ph-tag"
}, label));

/* ---------------- Dropdown menu ---------------- */
function Dropdown({
  trigger,
  children,
  align = 'start',
  menuClassName = '',
  width
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);
  const pos = align === 'end' ? {
    right: 0
  } : {
    left: 0
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setOpen(o => !o),
    style: {
      display: 'inline-flex'
    }
  }, trigger), open && /*#__PURE__*/React.createElement("div", {
    className: cx('menu', menuClassName),
    style: {
      top: 'calc(100% + 6px)',
      minWidth: width,
      ...pos
    },
    onClick: e => {
      if (e.target.closest('.menu-item')) setOpen(false);
    }
  }, children));
}
function MenuItem({
  icon,
  active,
  right,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    className: "menu-item",
    "data-active": !!active
  }, rest), icon && /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, children), right != null && /*#__PURE__*/React.createElement("span", {
    className: "right"
  }, right));
}
const MenuLabel = ({
  children
}) => /*#__PURE__*/React.createElement("div", {
  className: "menu-label"
}, children);
const MenuSep = () => /*#__PURE__*/React.createElement("div", {
  className: "menu-sep"
});

/* ---------------- Dialog / Sheet ---------------- */
function Dialog({
  open,
  onClose,
  children,
  sheet
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "overlay",
    onClick: onClose
  }), /*#__PURE__*/React.createElement("div", {
    className: sheet ? 'sheet' : 'dialog',
    role: "dialog",
    "aria-modal": "true"
  }, children));
}

/* ---------------- Tooltip ---------------- */
const Tooltip = ({
  label,
  children
}) => /*#__PURE__*/React.createElement("span", {
  className: "tip"
}, children, /*#__PURE__*/React.createElement("span", {
  className: "tip-body"
}, label));
Object.assign(window, {
  cx,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  LiveBadge,
  Tabs,
  Input,
  Field,
  SearchInput,
  Avatar,
  Progress,
  Switch,
  Separator,
  Stat,
  Placeholder,
  Dropdown,
  MenuItem,
  MenuLabel,
  MenuSep,
  Dialog,
  Tooltip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/playstadium-app/ui.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/SportsbookApp.jsx
try { (() => {
/* global React */
// PlayStadium sportsbook screen — nav/header with shared points balance, a league
// rail, the event list (EventRow), and the docked BetSlip. Composes design-system
// components from the bundle.
const {
  EventRow,
  BetSlip,
  WalletPill,
  Badge
} = window.PlayStadiumDesignSystem_e4e367;
function SportsbookApp() {
  const sports = window.PS_SPORTS;
  const events = window.PS_EVENTS;
  const [sport, setSport] = React.useState('nba');
  const [sel, setSel] = React.useState([]);
  const [stake, setStake] = React.useState(100);
  const [mode, setMode] = React.useState('parlay');
  const [balanceCents, setBalanceCents] = React.useState(842000);
  const [weekCents] = React.useState(31200);
  const [toast, setToast] = React.useState(null);
  const shown = events.filter(e => e.sport === sport);
  const ids = sel.map(s => s.id);
  const labelOf = e => `${e.home.name} vs ${e.away.name} · ${e.league}`;
  const pick = (o, ev, event) => {
    setSel(cur => cur.find(x => x.id === o.id) ? cur.filter(x => x.id !== o.id) : [...cur, {
      id: o.id,
      pick: `${o.label}`,
      event: labelOf(event),
      price: Number(o.price)
    }]);
  };
  const place = () => {
    setBalanceCents(b => Math.max(0, b - stake * 100));
    setToast(`Bet placed · ${stake.toLocaleString()} pts`);
    setSel([]);
    setTimeout(() => setToast(null), 2600);
  };
  const fmt = c => '$' + (c / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "sb-app"
  }, /*#__PURE__*/React.createElement("header", {
    className: "sb-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-header__inner"
  }, /*#__PURE__*/React.createElement("a", {
    className: "sb-brand",
    href: "../casino-lobby/index.html"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo/playstadium-chip-logo.png",
    alt: "PlayStadium.io"
  }), /*#__PURE__*/React.createElement("span", null, "PlayStadium")), /*#__PURE__*/React.createElement("nav", {
    className: "sb-nav"
  }, /*#__PURE__*/React.createElement("a", {
    href: "../casino-lobby/index.html"
  }, "Casino"), /*#__PURE__*/React.createElement("a", {
    className: "is-active",
    href: "#"
  }, "Sportsbook"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "My bets")), /*#__PURE__*/React.createElement("div", {
    className: "sb-header__right"
  }, /*#__PURE__*/React.createElement(WalletPill, {
    balance: fmt(balanceCents),
    weekCents: weekCents
  })))), /*#__PURE__*/React.createElement("div", {
    className: "sb-rail"
  }, sports.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.id,
    className: 'sb-rail__btn' + (sport === s.id ? ' is-active' : ''),
    onClick: () => setSport(s.id)
  }, s.label))), /*#__PURE__*/React.createElement("div", {
    className: "sb-body"
  }, /*#__PURE__*/React.createElement("main", {
    className: "sb-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-list__head"
  }, /*#__PURE__*/React.createElement("h1", null, sports.find(s => s.id === sport)?.label, " ", /*#__PURE__*/React.createElement("span", null, "\xB7 today")), /*#__PURE__*/React.createElement("span", {
    className: "sb-list__count"
  }, shown.length, " events")), /*#__PURE__*/React.createElement("div", {
    className: "sb-rows"
  }, shown.map(e => /*#__PURE__*/React.createElement(EventRow, {
    key: e.id,
    league: e.league,
    time: e.time,
    live: e.live,
    home: e.home,
    away: e.away,
    score: e.score,
    markets: e.markets,
    selectedId: ids.find(id => e.markets.some(m => m.options.some(o => o.id === id))),
    onPick: o => pick(o, e.markets, e)
  })))), /*#__PURE__*/React.createElement("div", {
    className: "sb-slip"
  }, /*#__PURE__*/React.createElement(BetSlip, {
    selections: sel,
    stake: stake,
    mode: mode,
    onStakeChange: setStake,
    onModeChange: setMode,
    onRemove: s => setSel(cur => cur.filter(x => x.id !== s.id)),
    onPlace: place
  }))), toast ? /*#__PURE__*/React.createElement("div", {
    className: "sb-toast"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "live"
  }, "Won't settle \u2014 demo"), " ", toast) : null);
}
window.SportsbookApp = SportsbookApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/SportsbookApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sportsbook/events.js
try { (() => {
// PlayStadium sportsbook — sample events. Decimal odds. One shared points balance.
window.PS_SPORTS = [{
  id: 'nba',
  label: 'NBA'
}, {
  id: 'epl',
  label: 'Soccer'
}, {
  id: 'nfl',
  label: 'NFL'
}, {
  id: 'mlb',
  label: 'MLB'
}, {
  id: 'ufc',
  label: 'UFC'
}, {
  id: 'nhl',
  label: 'NHL'
}];
window.PS_EVENTS = [{
  id: 'e1',
  sport: 'nba',
  league: 'NBA',
  time: 'LIVE',
  live: true,
  home: {
    name: 'Lakers'
  },
  away: {
    name: 'Celtics'
  },
  score: {
    home: 58,
    away: 61
  },
  markets: [{
    heading: 'Spread',
    options: [{
      id: 'e1-sh',
      label: 'LAL -3.5',
      price: '1.91'
    }, {
      id: 'e1-sa',
      label: 'BOS +3.5',
      price: '1.91',
      move: 'up'
    }]
  }, {
    heading: 'Total',
    options: [{
      id: 'e1-to',
      label: 'O 218.5',
      price: '1.87'
    }, {
      id: 'e1-tu',
      label: 'U 218.5',
      price: '1.95'
    }]
  }, {
    heading: 'Money',
    options: [{
      id: 'e1-mh',
      label: 'LAL',
      price: '1.74'
    }, {
      id: 'e1-ma',
      label: 'BOS',
      price: '2.10',
      move: 'down'
    }]
  }]
}, {
  id: 'e2',
  sport: 'nba',
  league: 'NBA',
  time: '9:00 PM',
  home: {
    name: 'Warriors'
  },
  away: {
    name: 'Nuggets'
  },
  markets: [{
    heading: 'Spread',
    options: [{
      id: 'e2-sh',
      label: 'GSW -1.5',
      price: '1.95'
    }, {
      id: 'e2-sa',
      label: 'DEN +1.5',
      price: '1.87'
    }]
  }, {
    heading: 'Total',
    options: [{
      id: 'e2-to',
      label: 'O 232.5',
      price: '1.90'
    }, {
      id: 'e2-tu',
      label: 'U 232.5',
      price: '1.92'
    }]
  }, {
    heading: 'Money',
    options: [{
      id: 'e2-mh',
      label: 'GSW',
      price: '1.83'
    }, {
      id: 'e2-ma',
      label: 'DEN',
      price: '2.00'
    }]
  }]
}, {
  id: 'e3',
  sport: 'epl',
  league: 'EPL',
  time: '11:30 AM',
  home: {
    name: 'Arsenal'
  },
  away: {
    name: 'Chelsea'
  },
  markets: [{
    heading: '1X2',
    options: [{
      id: 'e3-h',
      label: 'ARS',
      price: '1.55'
    }, {
      id: 'e3-d',
      label: 'Draw',
      price: '4.20'
    }, {
      id: 'e3-a',
      label: 'CHE',
      price: '5.50',
      move: 'down'
    }]
  }]
}, {
  id: 'e4',
  sport: 'epl',
  league: 'LaLiga',
  time: '1:00 PM',
  home: {
    name: 'Madrid'
  },
  away: {
    name: 'Sevilla'
  },
  markets: [{
    heading: '1X2',
    options: [{
      id: 'e4-h',
      label: 'RMA',
      price: '1.40'
    }, {
      id: 'e4-d',
      label: 'Draw',
      price: '4.80'
    }, {
      id: 'e4-a',
      label: 'SEV',
      price: '7.50'
    }]
  }]
}, {
  id: 'e5',
  sport: 'nfl',
  league: 'NFL',
  time: 'Sun 1:00 PM',
  home: {
    name: 'Chiefs'
  },
  away: {
    name: 'Bills'
  },
  markets: [{
    heading: 'Spread',
    options: [{
      id: 'e5-sh',
      label: 'KC -2.5',
      price: '1.91'
    }, {
      id: 'e5-sa',
      label: 'BUF +2.5',
      price: '1.91'
    }]
  }, {
    heading: 'Total',
    options: [{
      id: 'e5-to',
      label: 'O 48.5',
      price: '1.90'
    }, {
      id: 'e5-tu',
      label: 'U 48.5',
      price: '1.92'
    }]
  }, {
    heading: 'Money',
    options: [{
      id: 'e5-mh',
      label: 'KC',
      price: '1.65',
      move: 'up'
    }, {
      id: 'e5-ma',
      label: 'BUF',
      price: '2.30'
    }]
  }]
}, {
  id: 'e6',
  sport: 'ufc',
  league: 'UFC 312',
  time: 'Sat 10:00 PM',
  home: {
    name: 'Adesanya'
  },
  away: {
    name: 'Pereira'
  },
  markets: [{
    heading: 'Winner',
    options: [{
      id: 'e6-h',
      label: 'ADE',
      price: '2.05'
    }, {
      id: 'e6-a',
      label: 'PER',
      price: '1.80'
    }]
  }]
}];
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sportsbook/events.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.GameCard = __ds_scope.GameCard;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.WalletPill = __ds_scope.WalletPill;

__ds_ns.BetSlip = __ds_scope.BetSlip;

__ds_ns.EventRow = __ds_scope.EventRow;

__ds_ns.OddsButton = __ds_scope.OddsButton;

})();
