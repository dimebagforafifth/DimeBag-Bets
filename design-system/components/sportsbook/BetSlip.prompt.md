The points bet slip — lists selections (each with a remove ✕), takes a points stake, and shows combined odds + potential return live. Toggle Single / Parlay. Casino and sportsbook share one points balance.

```jsx
<BetSlip
  selections={[{ id:'h', pick:'Lakers -3.5', event:'Lakers vs Celtics · NBA', price:1.91 }]}
  stake={stake} mode={mode}
  onStakeChange={setStake} onModeChange={setMode}
  onRemove={removePick} onPlace={placeBet}
/>
```

`price` is decimal odds. Empty state prompts the player to tap any odds. Composes the design-system `Button` for the place-bet CTA.
