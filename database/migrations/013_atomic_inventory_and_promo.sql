-- Migration 013: Atomic RPC functions for inventory and promos
--
-- Fixes two race conditions found in audit round 2:
-- 1. Inventory deduction uses read-modify-write; concurrent checkouts
--    can double-deduct.
-- 2. Promo current_uses counter uses read-modify-write; concurrent
--    redemptions can exceed max_uses.
--
-- Both replaced with atomic Postgres functions callable via
-- supabase.rpc().

BEGIN;

-- Atomic inventory decrement. Returns the new qty_on_hand, or -1 if
-- the SKU doesn't exist / isn't tracked / insufficient stock.
CREATE OR REPLACE FUNCTION decrement_inventory(
  p_sku TEXT,
  p_qty INTEGER,
  p_order_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_id UUID;
BEGIN
  -- Lock the row so concurrent callers wait.
  SELECT id, qty_on_hand INTO v_id, v_current
  FROM product_inventory
  WHERE sku = p_sku AND track_inventory = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;

  -- Check for backorder allowance
  IF v_current < p_qty THEN
    -- Check if backorder is allowed
    IF EXISTS (SELECT 1 FROM product_inventory WHERE id = v_id AND allow_backorder = TRUE) THEN
      v_new := v_current - p_qty; -- allow negative
    ELSE
      RETURN -1; -- insufficient stock
    END IF;
  ELSE
    v_new := v_current - p_qty;
  END IF;

  UPDATE product_inventory SET qty_on_hand = v_new, updated_at = NOW() WHERE id = v_id;

  INSERT INTO inventory_movements (sku, delta, reason, order_id, note)
  VALUES (p_sku, -p_qty, 'order', p_order_id, COALESCE(p_note, 'Auto-deducted on order'));

  RETURN v_new;
END;
$$ LANGUAGE plpgsql;

-- Atomic inventory increment (for restocks/refunds).
CREATE OR REPLACE FUNCTION increment_inventory(
  p_sku TEXT,
  p_qty INTEGER,
  p_reason TEXT DEFAULT 'restock',
  p_order_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_id UUID;
  v_new INTEGER;
BEGIN
  SELECT id, qty_on_hand + p_qty INTO v_id, v_new
  FROM product_inventory
  WHERE sku = p_sku AND track_inventory = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;

  UPDATE product_inventory SET qty_on_hand = v_new, updated_at = NOW() WHERE id = v_id;

  INSERT INTO inventory_movements (sku, delta, reason, order_id, note)
  VALUES (p_sku, p_qty, p_reason, p_order_id, COALESCE(p_note, 'Auto-incremented'));

  RETURN v_new;
END;
$$ LANGUAGE plpgsql;

-- Atomic promo redemption. Increments current_uses only if the code
-- hasn't exceeded max_uses. Returns TRUE if redeemed, FALSE if limit hit.
CREATE OR REPLACE FUNCTION redeem_promotion(
  p_promotion_id UUID,
  p_order_id UUID DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT 0
) RETURNS BOOLEAN AS $$
DECLARE
  v_current INTEGER;
  v_max INTEGER;
BEGIN
  SELECT current_uses, max_uses INTO v_current, v_max
  FROM promotions
  WHERE id = p_promotion_id AND active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- max_uses NULL = unlimited
  IF v_max IS NOT NULL AND v_current >= v_max THEN
    RETURN FALSE;
  END IF;

  UPDATE promotions SET current_uses = current_uses + 1 WHERE id = p_promotion_id;

  INSERT INTO promotion_redemptions (promotion_id, order_id, customer_email, discount_amount)
  VALUES (p_promotion_id, p_order_id, lower(p_customer_email), p_discount_amount);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Rollback:
--   DROP FUNCTION IF EXISTS decrement_inventory;
--   DROP FUNCTION IF EXISTS increment_inventory;
--   DROP FUNCTION IF EXISTS redeem_promotion;
