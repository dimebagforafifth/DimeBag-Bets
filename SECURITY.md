# Security Policy

DimeBag-Bets (a.k.a. PlayStadium.io) is a **points-only** sportsbook and casino
app. The in-app balance is shown in dollar-style figures for familiarity, but it
has **no cash value**: there are no buy-ins, no cash-out, no payments, and no KYC
path. Points cannot be purchased, redeemed, withdrawn, or transferred for real
money. This shapes the threat model — the assets worth protecting are account
integrity, the provably-fair guarantees, and user data (email, IP, gameplay), not
real funds.

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub:

1. Open the repository's **Security** tab → **Report a vulnerability**, which
   starts a private GitHub Security Advisory visible only to you and the
   maintainer; or
2. Go directly to
   <https://github.com/dimebagforafifth/DimeBag-Bets/security/advisories/new>.

Please include the affected file/route, reproduction steps or a proof of concept,
and the impact you observed. We aim to acknowledge a report within a few days. As
a points-only project there is no paid bug bounty, but reporters are credited in
the advisory unless they prefer to remain anonymous.

### Supported scope

`main` is the only supported version (the app is pre-1.0 and deploys from `main`).
**In scope:** the web app, the `api/` edge functions, the provably-fair
derivation, and the Supabase money/auth RPCs. **Out of scope:** findings that
require a self-hosted misconfiguration, and anything predicated on the points
having real monetary value (they do not).

## Secrets rotation checklist

The project's development history referenced credentials that must be treated as
compromised and **rotated before any individual player logins go live**:

- [ ] **SGO / SportsGameOdds API key** (`SPORTS_ODDS_API_KEY_HEADER`) — rotate in
      the SGO dashboard and revoke the old key.
- [ ] **Any development GitHub token** seen in transcripts — revoke at
      <https://github.com/settings/tokens> and replace with a fine-grained,
      least-privilege token (or a GitHub App).
- [ ] Review **`FAIRNESS_SECRET`**, **`CRON_SECRET`**, and the Supabase
      **service-role key** — set strong, unique production values. The dev
      fallbacks referenced in `.env.example` are non-production placeholders only.

Going forward, the **Secret Scan** workflow (gitleaks) blocks new secrets from
being committed, and real secrets live only in untracked `.env.local` / the deploy
provider's secret store — never in the repo.

## Pre-player-auth security checklist

Reproduced verbatim from
[`docs/operations/pending-issues.md`](docs/operations/pending-issues.md) — the
gate that must be cleared before any individual player logins:

> ### ⚠️ Pre-player-auth security checklist (before any individual player logins)
>
> 1. **Populate `book_members`** so `_assert_operator` enforces roles (else a self-hosted book
>    with memberships could still mis-scope). Until then the single-operator fallback holds.
> 2. **Route player resolves through the server grader** (`api/resolve-bet.ts` →
>    `service_resolve_wager`), never `resolve_wager` with a client multiplier.
> 3. **Set the tenant JWT claim at login** (`active_tenant()` in 0004) and add the multi-user
>    read policies' membership rows.
> 4. **Rotate leaked secrets** (SGO API key, any dev GitHub token seen in transcripts).
> 5. **Confirm The Odds API terms** allow a non-real-money app before enabling live odds.

## Automated security controls

CI enforces several layers (see `.github/`):

- **Dependency audit** — `npm audit --audit-level=high` blocks merges on HIGH/
  CRITICAL advisories; OSV-Scanner adds broader coverage and reports to the
  Security tab.
- **Dependabot** — weekly npm + GitHub Actions updates (`.github/dependabot.yml`).
- **CodeQL** — `javascript-typescript` analysis on every PR, every push to `main`,
  and a weekly schedule, using the `security-extended` query suite.
- **Secret scanning** — gitleaks on every push and pull request, tuned by
  `.gitleaks.toml`.
- **Pinned Actions** — every third-party Action is pinned to a full commit SHA to
  block supply-chain attacks on the CI itself.
