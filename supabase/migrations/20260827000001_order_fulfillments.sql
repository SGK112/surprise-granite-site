-- Per-vendor fulfillment on a single customer order.
--
-- A storefront order can span several vendors — a 3-sample order went to MSI
-- (2 chips) and Daltile (1). Before this, the order carried ONE status and ONE
-- tracking_number, so there was nowhere to record that Daltile was already
-- placed by phone while MSI had not been sent a PO yet. Worse, printVendorPO
-- printed every line on one sheet, so MSI's PO showed the Daltile sample.
--
-- One row per (order, vendor). Which lines belong to a vendor is not stored
-- here: orders.items[].vendor_id already says so (set by the price validator at
-- checkout), and duplicating it would let the two disagree.

CREATE TABLE IF NOT EXISTS public.order_fulfillments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id         text NOT NULL,

  -- pending  : we owe this vendor a PO
  -- ordered  : PO sent / phoned in, awaiting shipment
  -- shipped  : vendor gave us tracking
  -- delivered: confirmed received
  -- cancelled: not being fulfilled by this vendor
  status            text NOT NULL DEFAULT 'pending',

  po_number         text,          -- our PO reference sent to the vendor
  vendor_order_ref  text,          -- THEIR order number (e.g. Ruvati RS0832413)
  tracking_number   text,
  tracking_carrier  text,

  ordered_at        timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT order_fulfillments_status_check
    CHECK (status IN ('pending','ordered','shipped','delivered','cancelled')),
  CONSTRAINT order_fulfillments_order_vendor_key UNIQUE (order_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS order_fulfillments_order_id_idx  ON public.order_fulfillments(order_id);
CREATE INDEX IF NOT EXISTS order_fulfillments_vendor_id_idx ON public.order_fulfillments(vendor_id);
CREATE INDEX IF NOT EXISTS order_fulfillments_status_idx    ON public.order_fulfillments(status);

-- Staff-only data (vendor refs, our PO numbers). The API reaches this with the
-- service role; no anon/authenticated policy is granted, so RLS denies by
-- default and a leaked anon key cannot read who we buy from or at what ref.
ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.order_fulfillments IS
  'One row per (order, vendor). Line membership comes from orders.items[].vendor_id, never duplicated here.';
