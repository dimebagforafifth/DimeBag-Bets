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

### Odds-API comparison (pros / cons / cost / docs)

> Cost = third-party estimate unless marked **(published)**. Verify sales-gated
> figures (see the manual fill-in tracker below).

| Provider | Type | Free tier | Paid cost | Pros | Cons | Docs / links |
|---|---|---|---|---|---|---|
| **The Odds API** ⭐ | Aggregator data | 500 credits/mo, commercial OK **(published)** | $30 / $59 / $119 / $249 mo **(published)** | Only real free *commercial* tier; broad multi-sport; scores+`completed` endpoint for grading; dead-simple REST/JSON; ToS allow apps where data isn't the product | REST polling only (no push); props paid + US-centric; credit cost scales with markets×regions | [site](https://the-odds-api.com/) · [docs](https://the-odds-api.com/liveapi/guides/v4/) · [pricing/FAQ](https://the-odds-api.com/#get-access) · [markets](https://the-odds-api.com/sports-odds-data/betting-markets.html) |
| **API-Sports / API-Football** | Data + stats | 100 req/day **(published)** | $19 / $29 / $39 mo **(published)** | Cheapest paid; live odds even on free; excellent **player stats** for prop grading; commercial OK on free | Basic markets only (h2h/O-U/handicap); no tennis/UFC/esports odds; REST polling | [site](https://api-sports.io/) · [docs](https://www.api-football.com/documentation-v3) · [pricing](https://www.api-football.com/pricing) |
| **BetsAPI / b365api** | bet365 scrape | none ($1 day-trial) | from ~$10/mo | Broadest cheap coverage incl. **tennis/UFC/boxing/esports**; InPlay + Results | Scraped bet365 → legal/ToS risk; commercial terms unverified; REST polling | [site](https://betsapi.com/) · [docs](https://betsapi.com/docs/) · [pricing](https://betsapi.com/mm/pricing_table) |
| **SportMonks** | Soccer data | 2 leagues | €29 / €99 / €249 mo (+ odds add-on) | Rich soccer data/stats + predictions; 14-day full trial | Soccer only; odds are a paid add-on (sales-priced); conflicting free-tier ToS language | [site](https://www.sportmonks.com/football-api/) · [pricing](https://www.sportmonks.com/football-api/plans-pricing/) |
| **Goalserve** | Multi-sport data | none | ~$250–$800/mo | Broad coverage; in-game player stats; pre + in-play | No free tier; pricey for MVP; XML/JSON polling | [site](https://www.goalserve.com/) · [odds pricing](https://www.goalserve.com/en/sport-data-feeds/odds-api/prices) |
| **OpticOdds** | Aggregator **+ grader** | none | ~$5,000/mo (often per-sport) | 100+ books; props/alts/futures; **SSE push stream**; turnkey **grader** (Won/Lost/Refunded/Half) — biggest grading time-saver | Expensive; **active Swish lawsuit** over data sourcing; ToS 403-blocked/unverified | [site](https://opticodds.com/sports-betting-api) · [docs](https://developer.opticodds.com/) · [grader](https://developer.opticodds.com/reference/get_grader-odds) |
| **OddsJam** | Aggregator | none | ~$500–$1k+ entry; enterprise higher | 100+ books; props/alts; auto-grading + injury/settlement alerts; historical/backtesting | WebSocket = enterprise tier only; same Swish lawsuit; ToS unverified | [site](https://oddsjam.com/odds-api) |
| **LSports (OddService)** | Aggregator data | none | contact sales | 100+ sports incl. esports; **0–1s in-play**; settlement in one feed; XML/JSON + WebSocket | No public price; ToS re: non-real-money unverified | [site](https://www.lsports.eu/oddservice/) |
| **SportsDataIO** | Data + verification | trial | contact sales | Scores/stats/props/futures; **settlement-verification** layer (pauses payouts on mismatch) | Props in separate warehouse/key; not a full grader; sales-priced | [site](https://sportsdata.io/) · [betting feeds](https://sportsdata.io/live-odds-api) |
| **Sportradar** | Official feed | none | ~$5k–$30k+/mo | Official low-latency data; WebSocket push; managed trading; deepest coverage | Built for **licensed operators**; sales-gated; costly; states it won't sell to unlicensed ops | [site](https://sportradar.com/) · [dev portal](https://developer.sportradar.com/) |
| **Genius Sports** | Official feed | none | ~$4k–$6k+/mo | Official **NFL** betting data; sub-second; trading services | **Licensed sportsbooks only**; exclusive-rights premium pricing | [site](https://www.geniussports.com/) · [odds feeds](https://www.geniussports.com/bet/odds-feeds-api/) |
| **Kambi** | Turnkey platform | n/a | contact sales | Full sportsbook + Odds Feed+ + algorithmic managed trading | **Licensed B2C operators only**, 60+ regulated jurisdictions | [site](https://www.kambi.com/) |
| **Betby** | Turnkey platform | n/a | contact sales | Iframe sportsbook + managed risk; fast integration | Operator platform, not a data feed; real-money oriented | [site](https://betby.com/sportsbook/) |

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

### Live-dealer studio comparison (pros / cons / cost / docs)

| Studio | Model | Serves non-real-money? | Cost (est., verify) | Pros | Cons | Link |
|---|---|---|---|---|---|---|
| **Evolution** | B2B live studios | Yes — on sweeps (Stake.us, High 5, WOW Vegas) | Rev-share % of GGR (unpublished) | Market leader; huge catalog incl. game shows; GLI/eCOGRA tested; already on social platforms | GGR rev-share has no basis for non-redeemable points; exiting some US states (CA Sept 2025); reached via aggregator | [evolution.com](https://www.evolution.com/) |
| **Ezugi** (Evolution-owned) | B2B live | Yes — explicitly adapted for sweeps | unpublished | Sweeps-friendly; lower barrier than the majors; 1,000+ operators | Same GGR/onboarding unknowns for a points app | [ezugi.com](https://www.ezugi.com/) |
| **Pragmatic Play Live** | B2B live | **Requires licensed operator** | ~10–20% GGR (third-party est.) | Single API w/ slots + live + virtuals; fast (3–5 wk) integration | Requires proof of license; exited CA sweeps Sept 2025 | [pragmaticplay.com/live-casino](https://www.pragmaticplay.com/en/live-casino/) |
| **Playtech Live** | B2B live | Selective — licensed/large brands only | contact sales | Tier-1 production quality; 180+ licensees | Highest barrier; no social/sweeps product found | [playtech.com](https://www.playtech.com/) |

> Across all four, **rev-share keys off GGR (gross gaming revenue) you don't have**
> in a closed-loop points model — so standard commercial terms don't map, and
> whether any studio would onboard a non-redeemable points app is undocumented
> (direct inquiry required).

## 2B. Self-hosting your own dealer stream — if you ever want real video

Protocol baseline: **WebRTC ~100–400ms** (sub-second, harder to scale) ·
**LL-HLS ~2–5s** (CDN-scalable) · standard HLS ~10–30s. A casino table needs bets
to **close before the reveal**, so either sub-second WebRTC or LL-HLS with a
betting-cutoff buffer.

| Platform | Latency | Pricing (est., verify) | Pros | Cons | Docs |
|---|---|---|---|---|---|
| **LiveKit** ⭐ (cloud or self-host OSS) | sub-second WebRTC | ~$0.0005/min connection + ~$0.10–0.12/GB egress | Best fit: first-class **React/TS SDK**; **data tracks** for bet/game-state sync; **self-hostable** → lowest marginal cost | Cloud egress adds up at scale; you operate the SFU if self-hosting | [site](https://livekit.io/) · [docs](https://docs.livekit.io/) · [pricing](https://livekit.io/pricing) |
| **Amazon IVS Real-Time** | sub-second WebRTC | per **participant-hour** (rate unverified); audio-only ⅒ | **Timed Metadata** frame-synced to every viewer; AWS-managed scale (10k–25k/stage) | Participant-hour cost grows with audience; AWS lock-in; exact rates unverified | [site](https://aws.amazon.com/ivs/) · [pricing](https://aws.amazon.com/ivs/pricing/) · [calculator](https://ivs.rocks/calculator/) |
| **Agora** | sub-second WebRTC | HD ~$3.99 / Full-HD ~$8.99 per 1,000 min; 10k free min/mo | Mature SDKs + React; RTM signaling/data channel for state sync | Priciest per-minute at scale; "standard-minute" multipliers complicate cost | [site](https://www.agora.io/) · [pricing](https://www.agora.io/en/pricing/) |
| **Cloudflare Stream** | ~2–5s (HLS) | **$5/1k min stored + $1/1k delivered, no egress fee** | Cheapest one-to-many broadcast; flat per-minute regardless of resolution | **Not sub-second** (a separate Realtime/Calls product does WebRTC); no frame-synced metadata | [site](https://www.cloudflare.com/products/cloudflare-stream/) · [docs](https://developers.cloudflare.com/stream/) · [pricing](https://developers.cloudflare.com/stream/pricing/) |
| **Mux** | ~4–7s (LL-HLS) | ~$0.032/min encode + per-min delivery; $20→$100 usage | Excellent web/React SDKs; simple pipeline | Not real-time; live timed-metadata appears to be a gap | [site](https://www.mux.com/) · [pricing](https://www.mux.com/pricing/video) |
| **Raw WebRTC** (mediasoup/Janus) | sub-second | servers + bandwidth only | Cheapest at scale; full control | You build SFU/TURN/signaling/scaling; highest eng. effort | [mediasoup](https://mediasoup.org/) · [Janus](https://janus.conf.meetecho.com/) |

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

### Simulated-dealer comparison (pros / cons / cost / docs)

| Approach | What it is | Cost (est.) | Pros | Cons | Link |
|---|---|---|---|---|---|
| **Pre-rendered / looped clips or 2D-3D in-browser animation** ⭐ | Cosmetic visual layer triggered by the provably-fair `core` outcome | **~$0 marginal** (static CDN assets) | Cheapest by an order of magnitude; infinite scale; zero licensing; fits points-only + provably-fair ethos; works offline-of-any-vendor | Not "real" video; up-front art/animation production effort | in-house (CDN/Vercel) |
| **Unreal MetaHuman + Convai NeuroSync** | Real-time photoreal avatar with live TTS lipsync | Engine free; GPU/compute cost to render | Photoreal; responsive/interactive | Heavy GPU; complex pipeline; must render **one shared feed** + stream it | [metahuman.com](https://www.metahuman.com/) · [convai.com](https://convai.com/) |
| **HeyGen LiveAvatar** | Hosted real-time AI avatar over WebRTC | ~$0.095/min (Lite) – $0.25/min (Full); $19/mo starter; ent. ~$24k min | Turnkey talking avatar; no studio | **Per-viewer** billing doesn't scale to concurrency; expensive | [heygen.com](https://www.heygen.com/) |

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

## Manual fill-in tracker (data we could not acquire)

> Blank cells are values that were sales-gated or behind a 403. Fill in as you
> confirm them; flip Status to ✅ when done.

| # | Item to confirm | Provider | Value to fill in | Where to get it | Status |
|---|---|---|---|---|---|
| 1 | Non-real-money use allowed under ToS? | The Odds API | ____ (yes/no + clause) | Full ToS / support email | ☐ |
| 2 | Exact monthly price + any minimum commit | OpticOdds | $______/mo | Sales quote | ☐ |
| 3 | Exact entry price + WebSocket tier | OddsJam | $______/mo; WS tier ____ | Sales quote | ☐ |
| 4 | Exact price + packaging | LSports | $______ | Sales quote | ☐ |
| 5 | Starter price + min commit | Sportradar | $______/mo | Sales quote | ☐ |
| 6 | Starter price (esp. NFL data) | Genius Sports | $______/mo | Sales quote | ☐ |
| 7 | Odds add-on price | SportMonks | €______ | Sales quote | ☐ |
| 8 | Non-real-money / license clause in API ToS | OpticOdds, OddsJam, LSports | ____ (allowed?) | API ToS (was 403) | ☐ |
| 9 | Swish Analytics lawsuit outcome | OpticOdds / OddsJam | ____ (resolved?) | Court docket / news | ☐ |
| 10 | Will they onboard a **non-redeemable points** app? | Evolution / Ezugi | ____ (yes/no + terms) | Direct commercial inquiry | ☐ |
| 11 | Rev-share % + setup/integration cost | Evolution / Ezugi / Pragmatic | ____ % / $______ | Sales quote | ☐ |
| 12 | Real-time participant-hour rate (SD/HD/FHD) | AWS IVS | $______/participant-hr | [pricing](https://aws.amazon.com/ivs/pricing/) / [calc](https://ivs.rocks/calculator/) | ☐ |
| 13 | Max viewers per real-time stage | AWS IVS | ____ (10k vs 25k) | AWS docs | ☐ |
| 14 | Connection-minute + egress per-GB rates | LiveKit | $____/min; $____/GB | [pricing](https://livekit.io/pricing) | ☐ |
| 15 | Standard-minute multiplier ratios | Agora | ____ | [pricing](https://www.agora.io/en/pricing/) | ☐ |
| 16 | Live frame-synced timed-metadata support? | Mux | ____ (yes/no) | Mux docs | ☐ |
| 17 | DimeBag's own max-payout / parlay cap | (internal) | ____ | Product decision | ☐ |

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
