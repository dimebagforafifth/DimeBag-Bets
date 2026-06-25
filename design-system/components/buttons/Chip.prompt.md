A small selectable token for bet presets (½, 2×, Max) and quick lobby filters. Gold-gem highlight when `active`.

```jsx
<Chip active={preset === '2x'} onClick={() => setPreset('2x')}>2×</Chip>
<Chip>Max</Chip>
<Chip>$50</Chip>
```

Renders a `<button>` with `aria-pressed`. Spread the rest onto it (`onClick`, `disabled`). Use in a flex row with `gap` for bet-amount presets or filter rails.
