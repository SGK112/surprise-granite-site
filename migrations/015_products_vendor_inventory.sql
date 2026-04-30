-- 015_products_vendor_inventory.sql
-- Unified product catalog + live vendor inventory + drop-ship order tracking.
--
-- Architecture:
--   products            — canonical SKU-level catalog. One row per (vendor + sku).
--                         Populated by scrapers; what marketplace pages render from.
--   vendor_inventory    — live stock snapshots per (sku, vendor). Time-series.
--                         Rolled-up into products.in_stock by latest snapshot.
--   drop_ship_orders    — customer-placed sample orders. Surface to admin queue.
--   vendor_config       — vendor connection details + drop-ship handoff style.
--
-- Idempotent (IF NOT EXISTS everywhere).

-- ───────── vendor_config ─────────
CREATE TABLE IF NOT EXISTS public.vendor_config (
  vendor_id        text PRIMARY KEY,            -- 'aracruz', 'msi', 'monterey-tile', 'ruvati', 'kibi', etc.
  vendor_name      text NOT NULL,
  vendor_url       text,
  vendor_logo_url  text,
  -- Drop-ship handoff
  dropship_email   text,                         -- email to notify when order placed
  dropship_api_url text,                         -- POST endpoint if vendor has one
  dropship_method  text DEFAULT 'email' CHECK (dropship_method IN ('email','api','manual')),
  -- Pricing
  default_markup_pct numeric DEFAULT 30,         -- 30% default; per-vendor override
  -- Sample policy
  sample_offered   boolean DEFAULT true,
  sample_price     numeric DEFAULT 0,            -- cost of a sample (passed to customer)
  sample_shipping  numeric DEFAULT 0,            -- shipping per sample order
  -- Scraper config
  scraper_enabled  boolean DEFAULT true,
  last_scraped_at  timestamptz,
  last_scrape_status text,
  -- Audit
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  notes            text
);

-- Seed the vendors we know about
INSERT INTO public.vendor_config (vendor_id, vendor_name, vendor_url, dropship_method, sample_offered, default_markup_pct, notes)
VALUES
  ('aracruz',       'AraCruz Granite',     'https://www.aracruzgranite.com',     'email',  false, 30, 'Natural stone — gallery only, no samples'),
  ('msi',           'MSI Surfaces',        'https://www.msisurfaces.com',        'manual', true,  30, 'Quartz samples mailable; natural stone gallery only'),
  ('monterey-tile', 'Monterey Tile',       'https://www.montereytile.com',       'email',  true,  35, 'Tile samples — customer pays shipping'),
  ('ruvati',        'Ruvati',              'https://ruvati.com',                  'manual', false, 25, 'Sinks — drop-ship full units, no samples'),
  ('kibi',          'Kibi',                'https://www.kibibath.com',            'manual', false, 30, 'Faucets — drop-ship'),
  ('lions-floor',   'Lions Floor',         'https://www.lionsfloor.com',          'manual', true,  30, 'Flooring samples — customer pays shipping'),
  ('caesarstone',   'Caesarstone',         'https://www.caesarstoneus.com',       'manual', true,  30, 'Quartz samples mailable'),
  ('silestone',     'Silestone (Cosentino)','https://www.silestone.com',          'manual', true,  30, 'Quartz samples mailable'),
  ('hanstone',      'Hanstone Quartz',     'https://www.hanstonequartz.com',      'manual', true,  30, 'Quartz samples mailable'),
  ('vicostone',     'Vicostone',           'https://www.vicostonequartz.com',     'manual', true,  30, 'Quartz samples mailable'),
  ('daltile',       'Daltile',             'https://www.daltile.com',             'manual', true,  30, 'Tile + Panoramic Porcelain'),
  ('arizona-tile',  'Arizona Tile',        'https://www.arizonatile.com',         'manual', false, 30, 'Stone yard — gallery only')
ON CONFLICT (vendor_id) DO NOTHING;

-- ───────── products ─────────
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       text NOT NULL REFERENCES public.vendor_config(vendor_id) ON DELETE CASCADE,
  sku             text NOT NULL,
  -- Identity
  name            text NOT NULL,
  slug            text,
  brand           text,
  -- Categorization
  category        text NOT NULL,    -- 'quartz', 'granite', 'marble', 'quartzite', 'porcelain', 'tile', 'flooring', 'sink', 'faucet', 'cabinet-hardware', etc.
  subcategory     text,             -- 'kitchen-sink', 'bath-vanity', 'wall-tile', etc.
  -- Description
  description     text,
  short_description text,
  -- Imagery
  primary_image_url text,
  image_urls      text[],
  -- Pricing (vendor cost + retail with markup)
  vendor_cost     numeric,          -- what we pay vendor
  retail_price    numeric,          -- customer-facing
  price_unit      text DEFAULT 'each' CHECK (price_unit IN ('each','sqft','linear-ft','set','pair','box')),
  currency        text DEFAULT 'USD',
  -- Specs (free-form)
  specs           jsonb DEFAULT '{}'::jsonb,
  size            text,             -- '12x24', '126x63', etc.
  finish          text,
  color_family    text,
  -- Sample policy (drop-ship)
  sample_eligible boolean DEFAULT false,        -- can customer order a sample?
  sample_price    numeric DEFAULT 0,
  sample_sku      text,                         -- vendor's sample-SKU if different
  -- Stock
  in_stock        boolean DEFAULT true,
  stock_quantity  integer,
  lead_time_days  integer,
  -- Vendor reference
  vendor_url      text,                         -- product page on vendor site
  -- Search/discovery
  tags            text[],
  -- Lifecycle
  active          boolean DEFAULT true,
  -- Audit
  first_scraped_at timestamptz DEFAULT now(),
  last_scraped_at  timestamptz DEFAULT now(),
  last_changed_at  timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  -- Composite uniqueness: a vendor never has two products with the same SKU
  UNIQUE(vendor_id, sku)
);

CREATE INDEX IF NOT EXISTS products_vendor_idx ON public.products(vendor_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category);
CREATE INDEX IF NOT EXISTS products_active_in_stock_idx ON public.products(active, in_stock) WHERE active = true AND in_stock = true;
CREATE INDEX IF NOT EXISTS products_sample_eligible_idx ON public.products(sample_eligible) WHERE sample_eligible = true;
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products(slug);

-- Slug auto-generation (lowercase, alphanumeric+dash) — combine vendor_id + sku for uniqueness
CREATE OR REPLACE FUNCTION public.products_generate_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := regexp_replace(lower(NEW.vendor_id || '-' || NEW.name), '[^a-z0-9]+', '-', 'g');
    NEW.slug := regexp_replace(NEW.slug, '^-+|-+$', '', 'g');
    NEW.slug := substring(NEW.slug from 1 for 100);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_slug_gen ON public.products;
CREATE TRIGGER products_slug_gen
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_generate_slug();

-- updated_at
CREATE OR REPLACE FUNCTION public.products_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_set_updated_at();

-- ───────── vendor_inventory ─────────
-- Time-series of stock snapshots. Lets us track stock changes over time
-- and detect new/returning/discontinued products.
CREATE TABLE IF NOT EXISTS public.vendor_inventory (
  id              bigserial PRIMARY KEY,
  vendor_id       text NOT NULL REFERENCES public.vendor_config(vendor_id) ON DELETE CASCADE,
  sku             text NOT NULL,
  product_id      uuid REFERENCES public.products(id) ON DELETE CASCADE,
  -- Snapshot
  in_stock        boolean,
  stock_quantity  integer,
  vendor_cost     numeric,
  retail_price    numeric,
  -- Source
  source_url      text,
  scrape_run_id   text,                         -- groups all rows from one scrape
  scraped_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS vendor_inventory_vendor_sku_idx ON public.vendor_inventory(vendor_id, sku);
CREATE INDEX IF NOT EXISTS vendor_inventory_scrape_run_idx ON public.vendor_inventory(scrape_run_id);
CREATE INDEX IF NOT EXISTS vendor_inventory_scraped_at_idx ON public.vendor_inventory(scraped_at DESC);

-- ───────── drop_ship_orders ─────────
CREATE TABLE IF NOT EXISTS public.drop_ship_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Order identity
  order_number    text UNIQUE,                  -- 'DS-2026-04-30-0001' etc.
  -- Customer
  customer_email  text NOT NULL,
  customer_name   text,
  customer_phone  text,
  -- Shipping
  ship_to_name    text,
  ship_to_street  text,
  ship_to_city    text,
  ship_to_state   text,
  ship_to_zip     text,
  ship_to_country text DEFAULT 'US',
  -- Order details
  product_id      uuid REFERENCES public.products(id),
  vendor_id       text REFERENCES public.vendor_config(vendor_id),
  product_sku     text,
  product_name    text,
  quantity        integer DEFAULT 1,
  -- Pricing (snapshotted)
  unit_price      numeric NOT NULL,
  shipping        numeric DEFAULT 0,
  total           numeric NOT NULL,
  -- Lifecycle
  status          text DEFAULT 'pending' CHECK (status IN ('pending','vendor_notified','vendor_acknowledged','shipped','delivered','cancelled','refunded')),
  vendor_order_ref text,                        -- vendor's confirmation number once received
  tracking_number text,
  tracking_carrier text,
  -- Stripe / payment
  stripe_session_id text,
  stripe_payment_intent_id text,
  paid            boolean DEFAULT false,
  paid_at         timestamptz,
  -- Notifications
  vendor_notified_at timestamptz,
  vendor_notified_method text,
  customer_confirmed_at timestamptz,
  -- Audit
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  notes           text
);

CREATE INDEX IF NOT EXISTS drop_ship_orders_status_idx ON public.drop_ship_orders(status);
CREATE INDEX IF NOT EXISTS drop_ship_orders_customer_idx ON public.drop_ship_orders(lower(customer_email));
CREATE INDEX IF NOT EXISTS drop_ship_orders_vendor_idx ON public.drop_ship_orders(vendor_id);
CREATE INDEX IF NOT EXISTS drop_ship_orders_created_idx ON public.drop_ship_orders(created_at DESC);

DROP TRIGGER IF EXISTS drop_ship_orders_updated_at ON public.drop_ship_orders;
CREATE OR REPLACE FUNCTION public.drop_ship_orders_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER drop_ship_orders_updated_at
  BEFORE UPDATE ON public.drop_ship_orders
  FOR EACH ROW EXECUTE FUNCTION public.drop_ship_orders_set_updated_at();

-- ───────── RLS ─────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_ship_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_anon_read ON public.products;
CREATE POLICY products_anon_read ON public.products
  FOR SELECT TO anon USING (active = true);

DROP POLICY IF EXISTS products_service_all ON public.products;
CREATE POLICY products_service_all ON public.products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vendor_config_anon_read ON public.vendor_config;
CREATE POLICY vendor_config_anon_read ON public.vendor_config
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS vendor_config_service_all ON public.vendor_config;
CREATE POLICY vendor_config_service_all ON public.vendor_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vendor_inventory_service_all ON public.vendor_inventory;
CREATE POLICY vendor_inventory_service_all ON public.vendor_inventory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS drop_ship_orders_service_all ON public.drop_ship_orders;
CREATE POLICY drop_ship_orders_service_all ON public.drop_ship_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.vendor_config TO anon;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.vendor_config TO service_role;
GRANT ALL ON public.vendor_inventory TO service_role;
GRANT ALL ON public.drop_ship_orders TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vendor_inventory_id_seq TO service_role;
