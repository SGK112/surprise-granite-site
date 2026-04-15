-- Migration 011: promotions table
--
-- Replaces the client-only promo code validation in js/cart.js
-- (WELCOME10 / SAVE20 / FREESHIP hardcoded object) with a real
-- server-enforced system. Aria can CRUD promotions through the
-- /api/promotions admin routes.
--
-- Run in Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS promotions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  -- discount type: percent (value 0-100), fixed (value in dollars),
  -- free_shipping (value ignored, zeroes out shipping)
  type              TEXT NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  value             NUMERIC(10, 2) NOT NULL DEFAULT 0,
  description       TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  max_uses          INTEGER,              -- null = unlimited
  current_uses      INTEGER NOT NULL DEFAULT 0,
  per_customer_limit INTEGER,              -- null = unlimited per customer
  min_order_amount  NUMERIC(10, 2),       -- null = no minimum
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES sg_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Codes are case-insensitive. Store as uppercase and enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_unique
  ON promotions (upper(code));

CREATE INDEX IF NOT EXISTS promotions_active_idx
  ON promotions (active)
  WHERE active = TRUE;

-- Per-customer usage tracking so per_customer_limit can be enforced.
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id  UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_email TEXT,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_redemptions_promotion_idx
  ON promotion_redemptions (promotion_id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_customer_idx
  ON promotion_redemptions (customer_email);

-- Seed the three legacy codes so nothing breaks when we flip the switch.
INSERT INTO promotions (code, type, value, description, active)
VALUES
  ('WELCOME10', 'percent', 10, 'Welcome discount — 10% off first order', TRUE),
  ('SAVE20',    'percent', 20, '20% off sitewide',                       TRUE),
  ('FREESHIP',  'free_shipping', 0, 'Free shipping',                     TRUE)
ON CONFLICT DO NOTHING;

COMMIT;

-- Rollback:
--   DROP TABLE IF EXISTS promotion_redemptions;
--   DROP TABLE IF EXISTS promotions;
