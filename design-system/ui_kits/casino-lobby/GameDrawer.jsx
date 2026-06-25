/* global React */
// The bet drawer that slides in when a game is opened. A faked but believable
// bet flow: set amount with Chips, place a bet, see a settled result update the
// wallet. Composes Button, Chip, Stat from the design system.
const { Button, Chip, Stat, Badge } = window.PlayStadiumDesignSystem_e4e367

function GameDrawer({ game, onClose, onSettle }) {
  const [amount, setAmount] = React.useState(50)
  const [phase, setPhase] = React.useState('idle') // idle | rolling | won | lost
  const [result, setResult] = React.useState(null)

  React.useEffect(() => { setPhase('idle'); setResult(null) }, [game && game.id])
  if (!game) return null

  const presets = [10, 50, 100, 250]
  const place = () => {
    setPhase('rolling')
    setTimeout(() => {
      const win = Math.random() > 0.5
      const mult = win ? +(1 + Math.random() * 9).toFixed(2) : 0
      const delta = win ? Math.round(amount * (mult - 1)) : -amount
      setResult({ win, mult, delta })
      setPhase(win ? 'won' : 'lost')
      onSettle(delta * 100) // cents
    }, 1100)
  }

  return (
    <>
      <div className="sl-scrim" onClick={onClose} />
      <aside className="sl-drawer" role="dialog" aria-label={game.name}>
        <div className="sl-drawer__head">
          <div className="sl-drawer__id">
            <span className="sl-drawer__icon"><img src={game.icon} alt="" /></span>
            <div>
              <div className="sl-drawer__name">{game.name}</div>
              <Badge variant="gold">Provably fair</Badge>
            </div>
          </div>
          <button className="sl-drawer__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={'sl-stage sl-stage--' + phase}>
          {phase === 'idle' && <span className="sl-stage__hint">Set your stake and place a bet</span>}
          {phase === 'rolling' && <span className="sl-stage__roll">Rolling…</span>}
          {phase === 'won' && (
            <div className="sl-stage__out sl-stage__out--win">
              <span className="sl-stage__mult">{result.mult}×</span>
              <span className="sl-stage__delta">+{result.delta} pts</span>
            </div>
          )}
          {phase === 'lost' && (
            <div className="sl-stage__out sl-stage__out--loss">
              <span className="sl-stage__mult">0×</span>
              <span className="sl-stage__delta">{result.delta} pts</span>
            </div>
          )}
        </div>

        <div className="sl-bet">
          <div className="sl-bet__label">Bet amount</div>
          <div className="sl-bet__amount">{amount.toLocaleString()} pts</div>
          <div className="sl-bet__presets">
            {presets.map((p) => (
              <Chip key={p} active={amount === p} onClick={() => setAmount(p)}>{p}</Chip>
            ))}
            <Chip onClick={() => setAmount((a) => Math.round(a / 2) || 1)}>½</Chip>
            <Chip onClick={() => setAmount((a) => a * 2)}>2×</Chip>
          </div>
          <div className="sl-bet__stats">
            <Stat label="On win (max)" value={'+' + (amount * 9).toLocaleString()} hot />
            <Stat label="House edge" value="1.0%" />
          </div>
          <Button
            variant={phase === 'rolling' ? 'ghost' : 'primary'}
            size="lg"
            block
            disabled={phase === 'rolling'}
            onClick={place}
          >
            {phase === 'rolling' ? 'Rolling…' : phase === 'idle' ? 'Place bet' : 'Bet again'}
          </Button>
        </div>
      </aside>
    </>
  )
}

window.GameDrawer = GameDrawer
