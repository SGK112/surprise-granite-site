-- Migration 010: customers metadata column + unique constraint
--
-- Background:
-- 1. api/routes/customers.js and the Stripe checkout webhook both want
--    to stash order-related metadata on the customer row. The live
--    customers table had no metadata column, forcing fragile workarounds
--    that stuffed everything into the `notes` free-text field.
-- 2. The webhook uses upsert(onConflict: 'email') semantics in several
--    paths, but live customers had no unique index on email (scoped by
--    user_id), so those upserts silently created duplicate rows under
--    concurrent checkouts.
--
-- This migration fixes both. Run in the Supabase SQL Editor.

BEGIN;

-- 1. Add a JSONB metadata column. Default empty object so existing rows
--    pass NOT NULL-ish joins (column itself stays nullable in practice).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Normalize all existing emails to lowercase so the unique constraint
--    we're about to add treats "Josh@X.com" and "josh@x.com" as the same
--    row. Application code also lowercases on write; this backfills.
UPDATE customers
SET email = lower(email)
WHERE email IS NOT NULL AND email <> lower(email);

-- 3. Collapse duplicates by keeping the most recently updated row per
--    (user_id, email). Older duplicates are deleted. Back up the table
--    first if you want to preserve their data.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, email
           ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
         ) AS rn
  FROM customers
  WHERE email IS NOT NULL
)
DELETE FROM customers
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Plain-column unique constraint so PostgREST `onConflict: 'user_id,email'`
--    and Postgres `ON CONFLICT (user_id, email)` both work. Application
--    code is responsible for lowercasing email on write (and already does).
ALTER TABLE customers
  ADD CONSTRAINT customers_user_email_unique UNIQUE (user_id, email);

COMMIT;

-- Rollback (manual):
--   DROP INDEX IF EXISTS customers_user_email_unique;
--   ALTER TABLE customers DROP COLUMN IF EXISTS metadata;
