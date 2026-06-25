A single tappable odds cell for the sportsbook — a small market label over a price. Selected = the one gold hit; feeds the bet slip. Optional `move` shows a tiny ▲/▼ when a price drifts.

```jsx
<OddsButton label="LAL -3.5" price="1.91" selected={picked} onClick={pick} />
<OddsButton label="Over 218.5" price="1.87" move="up" />
```

Group several in a column with a small heading to form a market; `EventRow` does this for you.
