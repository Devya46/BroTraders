-- D1 schema for the rewards system.
-- Apply with: wrangler d1 execute propfirmbro-clicks --file=./migrations/0002_rewards.sql --remote
--
-- Auth lives in Supabase (Supabase handles email/password + OAuth + JWT issuing).
-- D1 holds the points-related state: who has how many points, where they came from,
-- and what they redeemed. Supabase user UUID is the linking key everywhere.

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,            -- Supabase auth user UUID
  email             TEXT NOT NULL,
  display_name      TEXT,
  is_pro_bro        INTEGER DEFAULT 0,           -- 0/1; updated via Whop sync (later) or admin
  pro_bro_since     TEXT,                        -- ISO timestamp when user became Pro Bro
  pro_bro_bonus_paid INTEGER DEFAULT 0,          -- 0/1; one-time 25k bonus on upgrade
  points_balance    INTEGER NOT NULL DEFAULT 0,  -- denormalised running total (rebuilt from ledger if mismatched)
  points_earned     INTEGER NOT NULL DEFAULT 0,  -- lifetime points earned (excludes redemptions)
  profile_complete  INTEGER DEFAULT 0,           -- 0/1; awarded once when filled
  referral_code     TEXT UNIQUE,                 -- short code like 'bro-mike123' for referral links
  referred_by       TEXT,                        -- referrer's user id, set at signup
  last_login_at     TEXT,                        -- ISO; daily login bonus uses this
  created_at        TEXT NOT NULL                -- ISO
);

CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by   ON users(referred_by);

-- Points ledger: append-only log of every point change.
-- balance = SUM(amount) for that user. Always trust the ledger over users.points_balance.
CREATE TABLE IF NOT EXISTS points_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  amount      INTEGER NOT NULL,                   -- positive = earn, negative = spend
  reason      TEXT NOT NULL,                       -- 'signup', 'profile_complete', 'daily_login',
                                                  -- 'review_submitted', 'referral_signup',
                                                  -- 'pro_bro_welcome', 'manual_bonus',
                                                  -- 'redemption' (negative), 'admin_adjust'
  ref_id      TEXT,                                -- optional: review id, redemption id, etc.
  note        TEXT,                                -- free-text by admin
  created_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user   ON points_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_reason ON points_ledger(reason);

-- Bro Packages catalog (small, hand-maintained — only 2 items in MVP).
CREATE TABLE IF NOT EXISTS bro_packages (
  slug          TEXT PRIMARY KEY,                  -- 'pro-bro-1-month', 'prop-firm-25k'
  title         TEXT NOT NULL,                     -- 'Bro Package — 1 Maand Pro Bro'
  description   TEXT,
  points_cost   INTEGER NOT NULL,
  fulfillment   TEXT NOT NULL,                     -- 'pro_bro_extend' (auto), 'prop_firm_account' (manual)
  is_active     INTEGER DEFAULT 1,                 -- 0/1; soft-disable without delete
  stock         INTEGER,                           -- NULL = unlimited; integer = limited (e.g. 5 accounts/mo)
  created_at    TEXT NOT NULL
);

-- Redemptions log — every time a user spends points.
CREATE TABLE IF NOT EXISTS redemptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  package_slug    TEXT NOT NULL,
  points_cost     INTEGER NOT NULL,                -- snapshot at redemption time
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'fulfilled', 'cancelled'
  fulfillment_data TEXT,                            -- JSON: which firm picked, account size, etc.
  admin_note      TEXT,
  created_at      TEXT NOT NULL,
  fulfilled_at    TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (package_slug) REFERENCES bro_packages(slug)
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user   ON redemptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);

-- Firm reviews — incentivised reviews for negotiating power with prop firms.
CREATE TABLE IF NOT EXISTS firm_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  firm_slug   TEXT NOT NULL,                       -- 'apex', 'fundedseat', etc. — matches /go/<slug>
  rating      INTEGER NOT NULL,                    -- 1-5
  title       TEXT,
  body        TEXT NOT NULL,
  is_approved INTEGER DEFAULT 0,                   -- 0/1; admin moderation before display + payout
  approved_at TEXT,
  approved_by TEXT,                                -- admin user id
  created_at  TEXT NOT NULL,
  UNIQUE(user_id, firm_slug),                       -- one review per user per firm
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_firm     ON firm_reviews(firm_slug, is_approved);
CREATE INDEX IF NOT EXISTS idx_reviews_user     ON firm_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON firm_reviews(is_approved, created_at DESC);

-- Seed the initial Bro Packages.
INSERT OR IGNORE INTO bro_packages (slug, title, description, points_cost, fulfillment, stock, created_at)
VALUES
  ('pro-bro-1-month',
   'Bro Package — 1 Maand Pro Bro',
   'One free month of Pro Bro membership. Instant fulfillment via Whop.',
   50000,
   'pro_bro_extend',
   NULL,
   datetime('now')),
  ('prop-firm-25k',
   'Bro Package — 25K Prop Firm Account',
   'A 25K funded account at one of our partner firms (FundedSeat, Apex, or similar — selected at fulfillment).',
   75000,
   'prop_firm_account',
   NULL,
   datetime('now'));

-- Also extend the existing `clicks` table (PR #37) to capture user attribution
-- when the visitor is logged in.
ALTER TABLE clicks ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clicks_user ON clicks(user_id, created_at DESC);
