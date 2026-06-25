/* global React */
// The lobby body: a featured hero strip + the full Originals grid of GameCards.
const { GameCard, Badge, Button, Stat } = window.PlayStadiumDesignSystem_e4e367

function FeaturedHero({ game, onPlay }) {
  if (!game) return null
  return (
    <section className="sl-hero">
      <div className="sl-hero__copy">
        <div className="sl-hero__eyebrow">
          <Badge variant="solid">Featured tonight</Badge>
          <Badge variant="live">2,481 playing</Badge>
        </div>
        <h1 className="sl-hero__title">{game.name}</h1>
        <p className="sl-hero__tag">{game.tag}</p>
        <div className="sl-hero__stats">
          <Stat label="Top win tonight" value="312×" hot />
          <Stat label="House edge" value="1.0%" />
          <Stat label="Provably fair" value="Yes" />
        </div>
        <div className="sl-hero__cta">
          <Button variant="primary" size="lg" onClick={() => onPlay(game)}>Take a seat</Button>
          <Button variant="text">How it plays →</Button>
        </div>
      </div>
      <div className="sl-hero__art">
        <img src={game.icon} alt={game.name} />
      </div>
    </section>
  )
}

function OriginalsGrid({ title, games, onPlay }) {
  return (
    <section className="sl-section">
      <div className="sl-section__head">
        <h2 className="sl-section__title">{title}</h2>
        <span className="sl-section__count">{games.length} games</span>
      </div>
      <div className="sl-grid">
        {games.map((g) => (
          <GameCard
            key={g.id}
            name={g.name}
            tag={g.tag}
            icon={g.icon}
            iconAlt={g.name}
            onClick={() => onPlay(g)}
          />
        ))}
      </div>
    </section>
  )
}

window.FeaturedHero = FeaturedHero
window.OriginalsGrid = OriginalsGrid
