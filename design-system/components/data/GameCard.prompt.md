A casino-lobby game tile: the glossy 3D icon over a gold-tinted well, the game name in Saira Condensed, a one-line Stake-style tag, and a gold "Play →" that slides in on hover (card rises 3px + gold glow).

```jsx
<GameCard
  name="Mines"
  tag="Uncover gems for a rising multiplier."
  icon="/assets/game-icons/mines.png"
  iconAlt="Mines"
  onClick={() => openGame('mines')}
/>
```

Place tiles in a responsive grid (`grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))`). Always pass one of the 21 `assets/game-icons/*.png` — never a hand-drawn icon.
