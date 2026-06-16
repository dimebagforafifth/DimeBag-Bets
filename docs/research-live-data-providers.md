# Research: Live Data & Streaming Providers for DimeBag-Bets

*Deep-research synthesis — 2026-06-16. Five parallel research angles, multi-source.*

> **Context that drives every recommendation:** DimeBag-Bets is **points-based —
> non-real-money, closed-loop, no KYC, no gambling license** (CLAUDE.md §1). This
> is the decisive filter: most premium sports-data feeds and all the big
> live-dealer studios are built around *licensed real-money operators in regulated
> jurisdictions*. The realistic options are data-only odds APIs and
> self-hosted/simulated casino visuals.

> **Confidence note:** Vendor pricing/ToS pages (The Odds API, API-Sports,
> Sportradar, Genius, OddsJam/OpticOdds, AWS, LiveKit, Agora, Cloudflare,
> DraftKings/FanDuel house rules) widely returned **HTTP 403** to automated
> fetching. Dollar figures for sales-gated providers are **third-party estimates**;
> the non-real-money ToS question is **unconfirmed at primary sources**. Items to
> verify directly are listed at the end.

---

## TL;DR recommendation

**Sportsbook odds (Part 1):**
- **Start on The Odds API** — the only provider with a genuine *free commercial*
  tier (500 credits/mo), broad multi-sport coverage, moneyline/spread/totals
  (+ player props on paid), ~30s live updates, a scores endpoint for grading, and
  ToS that permit commercial user-facing apps *where data is not the product* (a
  points app fits). Scale up its paid tiers ($30 → $59 → $119/mo) as usage grows.
- **Grade bets yourself** from the scores/`completed` feed; add a cheap
  **stats feed (API-Sports)** when you build player props. Consider **OpticOdds**
  (turnkey win/loss/push grader) only at real scale — and only after reading its
  ToS, given an active data-misappropriation lawsuit.
- **Avoid the premium feeds** (Sportradar, Genius, LSports, Kambi, Betby) for now:
  built for licensed real-money operators, sales-gated, $4k–$30k+/mo.

**Live casino dealer (Part 2):**
- **Build a simulated dealer, not a real stream.** A pre-rendered/looped or
  in-browser animated dealer driven by your provably-fair `core` RNG, served as
  static CDN assets, has **~$0 marginal cost, zero licensing friction**, and fits
  the points-only + clean-UI ethos. Real third-party live dealer (Evolution etc.)
  is high-friction and probably unavailable to a non-redeemable points app; real
  self-hosted video is an operational business (studio + staff) far beyond MVP.

---

# Part 1 — Sportsbook Live Odds API

## 1A. The tiered landscape

### Tier 1 — Low-cost / free (best fit for the MVP)

**The Odds API** — *recommended starting point*
- Free "Starter" tier: **500 credits/month**, all sports, most bookmakers, all
  markets, historical access; resets monthly. *(the-odds-api.com FAQ)*
- Paid: **$30/mo** (20k credits) · **$59/mo** (100k) · **$119/mo** (5M) ·
  **$249/mo** (15M). Credit cost scales with markets×regions per call, so 500 free
  credits ≈ ~16 typical multi-market requests/day.
- Markets: h2h (moneyline), spreads, totals, outrights, **player props** + alt
  lines via the event-odds endpoint (props mainly US sports/books, **paid only**).
- Coverage: ~50 bookmakers across ~26 sports (NFL/NBA/MLB/NHL, soccer, tennis…).
- Live: core markets refresh **~every 30s**; props/periods ~1 min. REST polling
  only (no WebSocket).
- **Scores & Results endpoint** with a `completed` boolean → usable for grading.
- Historical odds from 2020 (paid add-on).
- **ToS:** commercial use in user-facing apps explicitly permitted *provided the
  data isn't the product being resold*. A points sportsbook fits — but confirm
  against full ToS.

**API-Sports / API-Football** — cheapest paid multi-sport, good for stats
- Free: **100 req/day**; Paid **$19/$29/$39/mo** (7.5k / 75k / 150k req/day).
  *(One third-party listing said 7,500/day free — that conflicts with the
  primary 100/day and is likely an error.)*
- Pre-match **and** live odds on all plans incl. free; commercial use allowed on
  free tier.
- Markets are basic (match winner, O/U, handicaps); **no tennis/UFC/esports odds**,
  not a props strength. **But** strong **player-statistics** feeds (~15s updates)
  → excellent cheap source for **grading player props yourself**.

**BetsAPI (bet365-sourced)** — broadest live coverage, higher risk
- From **~$10/mo**, $1 one-day trial; **3,600 req/hr** default.
- Broadest cheap sport coverage incl. **tennis, UFC, boxing, esports**; InPlay +
  Results endpoints (settlement data).
- ⚠️ **Scraped bet365 data** → higher legal/ToS risk; commercial/redistribution
  terms unverified.

**SportMonks** — soccer-only (skip unless soccer-first). Free tier = 2 leagues;
odds are a paid add-on; conflicting personal-vs-commercial ToS language on the
free plan.

**Goalserve** — premium, no free tier (~$250–$800/mo). Listed for completeness.

### Tier 2 — Aggregator data APIs (the realistic "step up")

**OpticOdds / OddsJam** (sister companies, now under Gambling.com Group)
- Aggregate **100+ sportsbooks**, deep markets incl. **player props**, alt lines,
  in-play; REST + **push (SSE)** streaming; "live in <5 min" docs.
- **OpticOdds has an explicit grader** (`/grader/odds`) returning **Won / Lost /
  Refunded (push) / Half-Won / Half-Lost / Pending** — genuine per-bet grading,
  not just scores. This is the one asked-about provider offering turnkey grading.
- Pricing: form-gated, third-party est. **~$5,000/mo** (often per-sport).
- ⚠️ **Two flags:** (1) active **Swish Analytics lawsuit** (Jan 2025) alleging
  unauthorized scraping/misappropriation of the underlying odds data; (2) their
  API ToS could not be retrieved (403) — the license / non-real-money clauses
  **must be read directly** before relying.

**LSports (OddService / TRADE)** — real-time odds aggregating 100+ books, 100+
sports incl. esports, **0–1s in-play latency**, settlement in one feed, XML/JSON +
WebSocket. Data-only, more flexibly packaged than the official majors; no public
price; ToS re: non-real-money unverified.

### Tier 3 — Premium / official feeds (NOT a fit yet)

| Provider | What it is | Fit flag |
|---|---|---|
| **Sportradar** | Official licensed data, 50+ sports, WebSocket push, Managed Trading | Built for **licensed regulated operators**; states it doesn't sell to unlicensed operators. Est. $5k–$30k+/mo. |
| **Genius Sports (Betgenius)** | Official data (exclusive **NFL** betting data), sub-second, trading services | Oriented to **licensed sportsbooks** via exclusive league rights. Est. $4k–$6k+/mo. |
| **Kambi** | Turnkey B2B sportsbook platform + Odds Feed+ | **Explicitly serves "licensed B2C operators," 60+ regulated jurisdictions** — strongest "licensed-only" signal. |
| **Betby** | Turnkey iframe sportsbook + managed risk | Full **operator platform**, not a data feed. |

> All Tier-3 vendors are contact-sales; **no vendor-confirmed pricing** was
> obtainable. For a non-real-money product these carry the most contractual
> friction and cost, with little upside over an aggregator data feed.

## 1B. Bet types & grading — what you actually need

To grade the bet types in CLAUDE.md §4 yourself, you need **(a) a scores +
`completed`/official-status feed** and **(b) a player box-score + active/DNP feed**:

- **Moneyline:** final score + game-official flag.
- **Spread / Totals:** both teams' final score + the line; exact tie on a
  **whole-number** line = **push** (refund); **half-point lines can't push**.
- **Player props:** the player's stat line + a "started / played a snap / had a
  plate appearance" flag (inactive/DNP → **void/refund**).
- **Parlays:** each leg's graded outcome + price; multiply decimal odds; **one
  loss loses the parlay**; a **push/void leg drops out and the parlay reprices**
  on the rest; correlated/related contingencies can't be combined (except priced
  same-game parlays).

**Official-game thresholds (industry standard, matches §4):** NFL full game incl.
OT · **NBA ≥43 min** (else no action) · **MLB moneyline official at 5 inn / 4.5 if
home leads; run line & totals need full 9 / 8.5** · **NHL** ML/puck line/totals
include OT+shootout; 3-way "60-minute" lines exclude them · **Soccer** settles on
90 min + stoppage, excludes extra time/penalties.

> **Two corrections to CLAUDE.md §4 from the research:** (1) The confirmed payout
> cap is **FanDuel's $1,000,000/day per customer**; the "**max parlay ~299-to-1**"
> figure in the brief **could not be confirmed** for DK/FD. (2) MLB totals/run-line
> require the **full 9 innings** (not the 5-inning moneyline threshold) — the brief
> already says this; just confirming.

**Where to get settlement data:** The Odds API scores (ML/spread/totals) +
API-Sports or SportsDataIO stats (props). **SportsDataIO** also offers a
settlement-**verification** layer (alerts to pause payouts on data mismatch).
**OpticOdds** is the only turnkey **grader**.

## 1C. Recommended migration path (start cheap → scale)

1. **Phase 1 MVP:** The Odds API **free tier** for odds + scores; grade
   ML/spread/totals in your own engine (mirrors how `core` already grades
   win/loss/push/void). Poll through a Supabase edge function; cache in Postgres;
   push to clients via Supabase Realtime (no third-party realtime service — §6).
2. **Add markets:** move to The Odds API **paid tier ($30→$119/mo)**; add
   **API-Sports** for player-stat feeds to grade props.
3. **At scale / deeper markets:** evaluate **OpticOdds** (aggregated odds + SSE
   stream + `/grader/odds`) — *only after* reading its ToS and weighing the Swish
   lawsuit. This replaces a lot of self-built grading.
4. **Only if you ever become a licensed real-money operator:** Sportradar / Genius
   / LSports for official low-latency data + managed trading.

---

# Part 2 — Live Casino Dealer

## 2A. Third-party live-dealer studios — reality check

- **Real live-dealer content *is* available to social/sweepstakes operators
  today.** Evolution (and its **Ezugi** brand) content runs on Stake.us, WOW
  Vegas, and High 5 — genuine human dealers over live video, supplied B2B.
- **The licensing barrier is provider-specific:** **Pragmatic Play** and
  **Playtech** require the operator to be fully licensed (Playtech licenses
  selectively to larger regulated brands). **Evolution/Ezugi** demonstrably
  onboard non-real-money sweepstakes operators.
- **But the decisive gap for DimeBag:** every confirmed example is a **US
  sweepstakes / redeemable-prize** model (dual-currency, prizes redeemable for
  cash). DimeBag is a **pure closed-loop, non-redeemable points** app with **no
  prize/GGR economics at all**. Whether any studio onboards that model is **not
  documented anywhere found** — it would require direct commercial inquiry, and
  rev-share terms (normally a % of GGR) have no basis when there's no GGR.
- **Regulatory contraction:** Evolution **and** Pragmatic Play **exited California
  sweepstakes casinos in Sept 2025**; bans/enforcement spread across 12+ US states
  in 2025–26. The whole social-casino model is under active legal attack.

**Conclusion:** real third-party live dealer is high-friction, costly (GGR
rev-share + integration via an aggregator), and likely **unavailable/inapplicable**
to a non-redeemable points app. Not recommended for the MVP.

## 2B. Self-hosting your own dealer stream — if you ever want real video

Protocol baseline: **WebRTC ~100–400ms** (sub-second, harder to scale) ·
**LL-HLS ~2–5s** (CDN-scalable) · standard HLS ~10–30s. A casino table needs bets
to **close before the reveal**, so either sub-second WebRTC or LL-HLS with a
betting-cutoff buffer.

| Platform | Latency | Pricing basis (est., verify) | Bet-sync mechanism | Note |
|---|---|---|---|---|
| **LiveKit** (cloud or **self-host OSS**) | sub-second WebRTC | ~$0.0005/min connection + ~$0.10–0.12/GB egress | **Data tracks / `publishData`** for game state | First-class **React/TS SDK**; self-hostable = lowest marginal cost. **Best fit.** |
| **Amazon IVS Real-Time** | sub-second WebRTC | per **participant-hour** (exact rate unverified); audio-only ⅒ | **Timed Metadata** frame-synced to all viewers | Up to 10k–25k viewers/stage (source conflict). |
| **Agora** | sub-second | HD ~$3.99 / Full-HD ~$8.99 per 1,000 min; 10k free min/mo | RTM signaling / data streams | Pricier per-minute at scale. |
| **Cloudflare Stream** | ~2–5s (HLS) | **$5/1k min stored + $1/1k delivered, no egress fee** | none frame-synced | Cheapest broadcast; **not sub-second**. |
| **Mux** | ~4–7s (LL-HLS) | ~$0.032/min encode + per-min delivery | timed metadata likely a gap | Good SDKs; not real-time. |
| **Raw WebRTC** | sub-second | servers + bandwidth only | build your own | Cheapest at scale, highest eng. effort. |

**Order-of-magnitude, one 1080p table, 1000 concurrent viewers/hr:** Cloudflare
~$60 (laggy) < Mux (per-min) < LiveKit/raw-WebRTC ~$70–170 (sub-second) < Agora
~$540 < IVS (rate-dependent). **But real video also means a real studio, dealers,
shifts, and ops — a business line, not a feature.**

## 2C. Simulated / animated dealer — *recommended for a points MVP*

- For a **points-only** app the "is it really live?" integrity concerns largely
  evaporate — outcomes already come from your **provably-fair `core` RNG**, which
  is *more* verifiable than a physical table.
- **Cheapest credible dealer = not real video at all:** pre-rendered/looped dealer
  clips, or a 2D/3D **in-browser animated dealer**, triggered by the RNG outcome,
  with the video as a cosmetic layer. Served as static CDN assets →
  **~$0 marginal streaming cost**, scales infinitely, zero licensing.
- **Middle option (responsive talking dealer, no studio):** real-time AI avatar —
  Unreal **MetaHuman** + **Convai NeuroSync** (lipsync), or hosted **HeyGen
  LiveAvatar** (~$0.10–0.25/min). Viable only as **one shared rendered feed**;
  per-viewer avatar APIs don't scale (1000 viewers ≈ $6,000/hr).

---

## Phased adoption plan (mapped to CLAUDE.md §8)

- **Phase 1 (backend + sportsbook):** The Odds API **free** → paid; self-grade
  ML/spread/totals via the existing `core` win/loss/push/void model; poll via
  Supabase edge fn, store in Postgres.
- **Phase 2 (roll-up):** add **API-Sports** stats for player-prop grading as props
  ship; keep odds flowing through Supabase Realtime (no extra realtime vendor §6).
- **Phase 3 (live & polish):** live odds via The Odds API polling; **simulated/
  animated dealer** for any "live casino" feel — built on the provably-fair engine,
  no third-party video.
- **Later / conditional:** **OpticOdds** grader+stream if market depth/scale
  justifies (after ToS review); **real third-party live dealer or self-hosted
  video only if the product ever pivots to licensed real-money** — at which point
  Evolution/Ezugi (content) or LiveKit/IVS (self-host) become relevant.

---

## Things to verify directly before committing (blocked by 403 / estimated)

1. **The Odds API full ToS** — confirm a non-real-money points sportsbook qualifies
   under "data is not the product." (High importance, low effort.)
2. **OpticOdds / OddsJam / LSports API ToS** — license requirement & non-real-money
   clause (all 403-blocked); plus the OpticOdds/OddsJam **Swish Analytics lawsuit**
   outcome before depending on their data.
3. **Sales-gated pricing** for OpticOdds/LSports/Sportradar/Genius (all estimates).
4. **CLAUDE.md §4 "max parlay 299-to-1"** — unconfirmed; confirmed cap is FanDuel
   $1M/day. Decide DimeBag's own cap.
5. **Whether any live-dealer studio onboards a non-redeemable points app** — direct
   inquiry to Evolution/Ezugi (no public source addresses this model).
6. **Streaming rates** (AWS IVS participant-hour, LiveKit per-GB, Agora multipliers)
   and IVS max-viewers-per-stage (10k vs 25k) — only relevant if pursuing real video.

*Sources: provider sites/docs (via search where 403-blocked), iGaming industry
press (SBC, Gambling Insider, CasinoBeats), and developer pricing analyses.
Pricing for sales-gated vendors is third-party estimate, not vendor-confirmed.*
