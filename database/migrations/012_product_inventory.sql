-- Migration 012: product_inventory table
--
-- Store-side stock tracking. Audit flagged that there's no inventory
-- deduction at checkout and no stock checking before Stripe session
-- creation, so the shop can oversell limited items.
--
-- This table is SKU/slug-addressed so it works with both
-- data/flooring.json style catalogs and future DB-backed products
-- without requiring a full product-catalog refactor first. Rows are
-- opt-in: only SKUs that actually need stock tracking get added.
--
-- Aria can CRUD via /api/inventory.

BEGIN;

CREATE TABLE IF NOT EXISTS product_inventory (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  TEXT NOT NULL,        -- product identifier (slug or SKU)
  name                 TEXT,                  -- display name for admin UI
  qty_on_hand          INTEGER NOT NULL DEFAULT 0,
  qty_reserved         INTEGER NOT NULL DEFAULT 0,  -- in-flight carts (future)
  low_stock_threshold  INTEGER DEFAULT 5,
  track_inventory      BOOLEAN NOT NULL DEFAULT TRUE,
  allow_backorder      BOOLEAN NOT NULL DEFAULT FALSE,
  location             TEXT DEFAULT 'warehouse',
  notes                TEXT,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One stock row per SKU.
CREATE UNIQUE INDEX IF NOT EXISTS product_inventory_sku_unique
  ON product_inventory (sku);

CREATE INDEX IF NOT EXISTS product_inventory_low_stock_idx
  ON product_inventory (qty_on_hand)
  WHERE track_inventory = TRUE;

-- Append-only audit log so Aria can explain "why does this say 3 on hand?"
CREATE TABLE IF NOT EXISTS inventory_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         TEXT NOT NULL,
  delta       INTEGER NOT NULL,                 -- negative = deduction
  -- reason: order, refund, restock, manual_adjust, correction
  reason      TEXT NOT NULL,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES sg_users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_sku_idx
  ON inventory_movements (sku, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx
  ON inventory_movements (order_id);

COMMIT;

-- Rollback:
--   DROP TABLE IF EXISTS inventory_movements;
--   DROP TABLE IF EXISTS product_inventory;
