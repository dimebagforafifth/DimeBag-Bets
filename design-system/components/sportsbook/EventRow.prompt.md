A sportsbook event row: league + start time (or LIVE + score), the two competitors, and market columns of tappable `OddsButton`s. Stacks below 560px so each odds column stretches to a 44px hit target.

```jsx
<EventRow
  league="NBA" time="LIVE" live home={{name:'Lakers'}} away={{name:'Celtics'}}
  score={{home:58, away:61}}
  markets={[{ heading:'Spread', options:[{id:'h',label:'LAL -3.5',price:'1.91'},{id:'a',label:'BOS +3.5',price:'1.91'}] }]}
  selectedId={selId}
  onPick={(opt, market) => addToSlip(opt)}
/>
```

`markets` = `[{ heading, options:[{ id, label, price, move }] }]`. `onPick(option, market)` fires on tap.
