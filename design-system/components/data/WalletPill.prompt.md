The header wallet unit: the headline points balance the player can bet now, with their week win/loss standing alongside as a plain up/down (sign of `weekCents` drives the ▲/▼ + green/red automatically).

```jsx
<WalletPill balance="$8,420" weekCents={31200} />   // ▲ $312.00 green
<WalletPill balance="$1,050" weekCents={-4800} />   // ▼ $48.00 red
<WalletPill balance="$500"   weekCents={0} />        // Even
```

`balance` is a pre-formatted string (it's points, styled like currency). Lives top-right in the app header.
