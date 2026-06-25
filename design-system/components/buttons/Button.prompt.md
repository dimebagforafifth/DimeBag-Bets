Stadium's primary action control — one confident gold CTA, plus quiet ghost, text, and destructive variants. Use the gold `primary` for the single most important action on a view (place a bet, take a seat); everything else is `ghost` or `text`.

```jsx
<Button variant="primary" size="lg">Take a seat</Button>
<Button variant="ghost">How it plays</Button>
<Button variant="danger">Stop autobet</Button>
<Button variant="text" href="#">View all</Button>
```

Variants: `primary` (gold, graphite ink), `ghost` (surface + hairline), `text` (muted → text on hover), `danger` (red, for stop/cash-out-of). Sizes: `sm` / `md` / `lg`. Pass `block` to fill width, `href` to render as an `<a>`.
