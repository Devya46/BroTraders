# Bro Rewards — Cloudflare Pages Setup

> One-time deployment steps for the rewards/loyalty system.
> After this, signed-in visitors earn points, can redeem Bro Packages, and Mike can manage everything from `/admin/rewards.html`.

## What this branch adds

- **`migrations/0002_rewards.sql`** — D1 tables: `users`, `points_ledger`, `bro_packages`, `redemptions`, `firm_reviews` + 2 seed packages. Also adds `user_id` column to existing `clicks` table.
- **`functions/api/rewards/*.js`** — backend: sync, me, packages, redeem, profile, review, admin.
- **`js/supabase-config.js` + `js/auth.js`** — Supabase client wrapper with `window.BroAuth`.
- **`js/click-attribution.js`** — site-wide `/go/<firm>` link rewriter (adds `?u=<user_id>` for signed-in visitors). Loaded by `head.js` on every page.
- **`rewards/login.html`, `signup.html`, `account.html`, `catalog.html`** — user-facing pages.
- **`admin/rewards.html`** — Mike-only admin dashboard (token-gated like `/admin/clicks.html`).
- Updated `functions/go/[firm].js` to log `user_id` on every click when present.
- Updated `header.html` + `header.js` to expose a "Rewards" nav entry (swaps to "My Rewards" when signed in).

## Setup steps (15 min, one time)

### 1. Apply the D1 migration

The existing D1 database is `propfirmbro-clicks`. From the Cloudflare dashboard:

**Workers & Pages → D1 → propfirmbro-clicks → Console** — paste the contents of `migrations/0002_rewards.sql` and Execute. Should report several "successful" rows (CREATE TABLE × 5, indexes, INSERT × 2, ALTER TABLE).

Verify with:
```sql
SELECT slug, title, points_cost FROM bro_packages;
```
You should see the two seeded packages (`pro-bro-1-month`, `prop-firm-25k`).

### 2. Configure Supabase

#### 2a. Get your Supabase URL + anon key

Already wired into `js/supabase-config.js`:

- Project URL: `https://fbanoutdeiigpcssronf.supabase.co`
- anon public key: hardcoded in `js/supabase-config.js`

(The anon key is safe to expose client-side — it only allows what Supabase RLS policies allow. For Bro Rewards we use Supabase only for auth, so the anon key just lets the browser sign in/sign up.)

#### 2b. Configure email auth (Supabase dashboard → Authentication → Providers)

- **Email** — enable. Decide on confirm-email-required (recommended ON for prod).
- **Site URL** (Authentication → URL Configuration) — set to `https://propfirmbro.com`.
- **Redirect URLs** — allow `https://propfirmbro.com/rewards/account.html` and (for testing) `http://localhost:8788/rewards/account.html`.

#### 2c. Configure Google OAuth

In Supabase dashboard → Authentication → Providers → **Google**:

1. Toggle "Enable"
2. You'll see a callback URL like `https://fbanoutdeiigpcssronf.supabase.co/auth/v1/callback` — copy it.
3. In a Google Cloud project (create one if needed) → APIs & Services → Credentials → Create OAuth Client ID:
   - Application type: **Web application**
   - Authorized redirect URIs: paste the callback URL from Supabase
4. Copy the Client ID + Client Secret back into the Supabase dashboard → Save.

#### 2d. (Later) Discord OAuth

Same flow — Supabase has a Discord provider, just enable it and paste in Discord OAuth credentials. No code changes needed on our side; `BroAuth.signInWithProvider("discord")` is already supported.

### 3. Set Pages environment variables

Cloudflare dashboard → **Workers & Pages → propfirmbro → Settings → Environment variables**.

Add these (Production environment):

| Name | Value | Type |
|------|-------|------|
| `SUPABASE_URL` | `https://fbanoutdeiigpcssronf.supabase.co` | Plain text |
| `SUPABASE_ANON_KEY` | (the anon key from step 2a) | Secret |

`STATS_TOKEN` should already be set (from PR #37, used by both `/api/click-stats` and `/api/rewards/admin`).

### 4. Verify D1 binding

Same Settings page → **Functions → D1 database bindings**. Should already show:

- Variable: `DB` → `propfirmbro-clicks`

If not, add it.

### 5. Redeploy

Cloudflare deploys automatically on the next git push (or trigger a manual redeploy after merge). After deploy, all new endpoints are live.

## Smoke tests

After deploy, walk through:

1. **Anonymous click attribution still works**
   `https://propfirmbro.com/go/fundedseat` → redirects to FundedSeat, logs a row to `clicks` with `user_id = NULL`.

2. **Signup**
   Open `https://propfirmbro.com/rewards/signup.html`, create an account, confirm email if required, land on `/rewards/account.html`.
   Account should show **5,000 points** (signup bonus). Ledger should have a `signup` row.

3. **Daily-login bonus**
   Sign out, sign back in tomorrow. Ledger gets a `daily_login` row (+100 pts).

4. **Profile completion**
   On the account page, set a display name and save. +2,000 pts, `profile_complete` ledger row.

5. **Logged-in click attribution**
   While signed in, click a `/go/` link anywhere on the site. Check the latest row in `clicks` → `user_id` should be filled in.

6. **Redemption**
   With Mike's account (after manually awarding enough points via the admin page), redeem a Bro Package on `/rewards/catalog.html`. Status should be `pending`. Admin page should show it.

7. **Admin fulfillment**
   On `/admin/rewards.html`, click "Mark fulfilled" on the pending redemption. Status flips to `fulfilled`.

8. **Review flow**
   (No public review submission UI in this PR — just the endpoint.) From the browser console on the account page:
   ```js
   await BroAuth.authedFetch("/api/rewards/review", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ firm_slug: "fundedseat", rating: 5, title: "Great firm", body: "Used FundedSeat for 3 months, payouts always on time, support is responsive." }),
   }).then(r => r.json());
   ```
   Then approve it from `/admin/rewards.html` → user gets +500 pts.

## Earn rates (open for change)

Living in `functions/api/rewards/_lib.js` → `EARN_RATES`. Mike's said "voor nu prima" but wants to revisit before public launch. Default rates:

| Action | Free Bro | Pro Bro |
|---|---|---|
| Signup | 5,000 | 7,500 |
| Profile complete | 2,000 | 3,000 |
| Daily login | 100 | 150 |
| Review approved | 500 | 750 |
| Referral signup | 10,000 | 15,000 |
| Pro Bro welcome (one-time) | — | 25,000 |

1000 pts ≈ €1.

## What's not in this PR (intentional)

- Whop sync for auto Pro Bro detection (manual toggle via admin for now).
- Public review-submission UI on firm pages (endpoint exists; UI is later).
- Discord OAuth (architecture supports it — just enable in Supabase when ready).
- Mystery Bro Package / probabilistic redemptions (Phase 2).
- Anti-fraud rate limiting beyond the schema's natural `awardOnce` checks.
