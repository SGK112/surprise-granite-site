-- ============================================================
-- ONE-PASTE BOOTSTRAP — applies migrations 014 (ASPN) + 015
-- (products / vendor_inventory / drop_ship_orders).
--
-- HOW TO USE:
--   1. Open https://supabase.com/dashboard/project/ypeypgwsycxcagncgdur/sql/new
--   2. Paste this entire file
--   3. Click RUN
--   4. Tell Claude "migrations done"
--
-- This is the LAST manual SQL paste. Future migrations apply
-- automatically via the `supabase-migrate` GitHub Action when
-- you push a new file under `supabase/migrations/`.
--
-- Safe + idempotent: re-running this file is a no-op.
-- No `exec_sql` backdoor — DDL stays scoped to the GitHub
-- workflow, which authenticates with a project-scoped PAT.
-- ============================================================

\echo '=== Applying migration 014: ASPN members ==='

-- (Migration 014 inlined — Arizona Stone Providers Network)
CREATE TABLE IF NOT EXISTS public.aspn_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  business_name   text NOT NULL,
  service_category text NOT NULL,
  slug            text UNIQUE,
  contact_name    text,
  phone           text,
  website         text,
  city            text,
  state           text DEFAULT 'AZ',
  zip             text,
  short_description text,
  long_description  text,
  service_areas     text[],
  specialties       text[],
  instagram_url   text,
  facebook_url    text,
  houzz_url       text,
  yelp_url        text,
  google_url      text,
  linkedin_url    text,
  az_roc_license  text,
  bonded_insured  boolean DEFAULT false,
  logo_url        text,
  cover_image_url text,
  gallery_urls    text[],
  founder_status  boolean DEFAULT false,
  approved        boolean DEFAULT false,
  rejected        boolean DEFAULT false,
  rejection_reason text,
  featured        boolean DEFAULT false,
  created_at      timestamptz DEFAULT now() NOT NULL,
  approved_at     timestamptz,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  verification_token text DEFAULT gen_random_uuid()::text,
  email_verified  boolean DEFAULT false,
  email_verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS aspn_members_slug_idx ON public.aspn_members(slug);
CREATE INDEX IF NOT EXISTS aspn_members_email_idx ON public.aspn_members(lower(email));
CREATE INDEX IF NOT EXISTS aspn_members_approved_idx ON public.aspn_members(approved) WHERE approved = true;
CREATE INDEX IF NOT EXISTS aspn_members_service_category_idx ON public.aspn_members(service_category);
CREATE INDEX IF NOT EXISTS aspn_members_city_idx ON public.aspn_members(lower(city));
CREATE INDEX IF NOT EXISTS aspn_members_founder_idx ON public.aspn_members(founder_status) WHERE founder_status = true;

CREATE OR REPLACE FUNCTION public.aspn_members_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aspn_members_updated_at ON public.aspn_members;
CREATE TRIGGER aspn_members_updated_at BEFORE UPDATE ON public.aspn_members
  FOR EACH ROW EXECUTE FUNCTION public.aspn_members_set_updated_at();

CREATE OR REPLACE FUNCTION public.aspn_members_set_founder_status() RETURNS trigger AS $$
DECLARE approved_count integer;
BEGIN
  IF NEW.approved = true AND (OLD IS NULL OR OLD.approved = false) THEN
    SELECT COUNT(*) INTO approved_count FROM public.aspn_members WHERE approved = true;
    IF approved_count < 50 THEN NEW.founder_status = true; END IF;
    NEW.approved_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aspn_members_founder_check ON public.aspn_members;
CREATE TRIGGER aspn_members_founder_check BEFORE UPDATE ON public.aspn_members
  FOR EACH ROW EXECUTE FUNCTION public.aspn_members_set_founder_status();

CREATE OR REPLACE FUNCTION public.aspn_members_generate_slug() RETURNS trigger AS $$
DECLARE base_slug text; candidate text; counter integer := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base_slug := regexp_replace(lower(NEW.business_name), '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := substring(base_slug from 1 for 60);
    candidate := base_slug;
    WHILE EXISTS (SELECT 1 FROM public.aspn_members WHERE slug = candidate AND id != NEW.id) LOOP
      counter := counter + 1; candidate := base_slug || '-' || counter;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aspn_members_slug_gen ON public.aspn_members;
CREATE TRIGGER aspn_members_slug_gen BEFORE INSERT ON public.aspn_members
  FOR EACH ROW EXECUTE FUNCTION public.aspn_members_generate_slug();

ALTER TABLE public.aspn_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aspn_members_anon_read_approved ON public.aspn_members;
CREATE POLICY aspn_members_anon_read_approved ON public.aspn_members FOR SELECT TO anon USING (approved = true);
DROP POLICY IF EXISTS aspn_members_service_role_all ON public.aspn_members;
CREATE POLICY aspn_members_service_role_all ON public.aspn_members FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.aspn_members TO anon;
GRANT ALL ON public.aspn_members TO service_role;

\echo '=== Applying migration 015: products + vendor_inventory ==='

CREATE TABLE IF NOT EXISTS public.vendor_config (
  vendor_id        text PRIMARY KEY,
  vendor_name      text NOT NULL,
  vendor_url       text,
  vendor_logo_url  text,
  dropship_email   text,
  dropship_api_url text,
  dropship_method  text DEFAULT 'email' CHECK (dropship_method IN ('email','api','manual')),
  default_markup_pct numeric DEFAULT 30,
  sample_offered   boolean DEFAULT true,
  sample_price     numeric DEFAULT 0,
  sample_shipping  numeric DEFAULT 0,
  scraper_enabled  boolean DEFAULT true,
  last_scraped_at  timestamptz,
  last_scrape_status text,
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  notes            text
);

INSERT INTO public.vendor_config (vendor_id, vendor_name, vendor_url, dropship_method, sample_offered, default_markup_pct, notes) VALUES
  ('aracruz',       'AraCruz Granite',     'https://www.aracruzre.com',          'email',  false, 30, 'Natural stone — gallery only'),
  ('msi',           'MSI Surfaces',        'https://www.msisurfaces.com',        'manual', true,  30, 'Quartz samples mailable'),
  ('monterrey-tile','Monterrey Tile',      'https://www.monterreytile.com',      'email',  true,  35, 'Tile — customer pays shipping'),
  ('ruvati',        'Ruvati',              'https://ruvati.com',                  'manual', false, 25, 'Sinks — drop-ship'),
  ('kibi',          'Kibi USA',            'https://www.kibiusa.com',             'manual', false, 30, 'Faucets — drop-ship'),
  ('lions-floor',   'Lions Floor',         'https://www.lionsfloor.com',          'manual', true,  30, 'Flooring samples'),
  ('caesarstone',   'Caesarstone',         'https://www.caesarstoneus.com',       'manual', true,  30, 'Quartz samples mailable'),
  ('silestone',     'Silestone',           'https://www.silestone.com',           'manual', true,  30, 'Quartz samples mailable'),
  ('hanstone',      'Hanstone Quartz',     'https://www.hanstonequartz.com',      'manual', true,  30, 'Quartz samples mailable'),
  ('vicostone',     'Vicostone',           'https://www.vicostonequartz.com',     'manual', true,  30, 'Quartz samples mailable'),
  ('daltile',       'Daltile',             'https://www.daltile.com',             'manual', true,  30, 'Tile + Panoramic Porcelain'),
  ('arizona-tile',  'Arizona Tile',        'https://www.arizonatile.com',         'manual', false, 30, 'Stone yard'),
  ('arcsurfaces',   'Architectural Surfaces','https://arcsurfaces.com',           'manual', true,  30, 'Quartz + porcelain distributor'),
  ('cosentino',     'Cosentino',           'https://www.cosentino.com',           'manual', true,  30, 'Silestone + Dekton + Sensa parent')
ON CONFLICT (vendor_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       text NOT NULL REFERENCES public.vendor_config(vendor_id) ON DELETE CASCADE,
  sku             text NOT NULL,
  name            text NOT NULL,
  slug            text,
  brand           text,
  category        text NOT NULL,
  subcategory     text,
  description     text,
  short_description text,
  primary_image_url text,
  image_urls      text[],
  vendor_cost     numeric,
  retail_price    numeric,
  price_unit      text DEFAULT 'each' CHECK (price_unit IN ('each','sqft','linear-ft','set','pair','box')),
  currency        text DEFAULT 'USD',
  specs           jsonb DEFAULT '{}'::jsonb,
  size            text,
  finish          text,
  color_family    text,
  sample_eligible boolean DEFAULT false,
  sample_price    numeric DEFAULT 0,
  sample_sku      text,
  in_stock        boolean DEFAULT true,
  stock_quantity  integer,
  lead_time_days  integer,
  vendor_url      text,
  tags            text[],
  active          boolean DEFAULT true,
  first_scraped_at timestamptz DEFAULT now(),
  last_scraped_at  timestamptz DEFAULT now(),
  last_changed_at  timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  UNIQUE(vendor_id, sku)
);

CREATE INDEX IF NOT EXISTS products_vendor_idx ON public.products(vendor_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category);
CREATE INDEX IF NOT EXISTS products_active_in_stock_idx ON public.products(active, in_stock) WHERE active = true AND in_stock = true;
CREATE INDEX IF NOT EXISTS products_sample_eligible_idx ON public.products(sample_eligible) WHERE sample_eligible = true;
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products(slug);

CREATE OR REPLACE FUNCTION public.products_generate_slug() RETURNS trigger AS $$
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
CREATE TRIGGER products_slug_gen BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_generate_slug();

CREATE OR REPLACE FUNCTION public.products_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_set_updated_at();

CREATE TABLE IF NOT EXISTS public.vendor_inventory (
  id              bigserial PRIMARY KEY,
  vendor_id       text NOT NULL REFERENCES public.vendor_config(vendor_id) ON DELETE CASCADE,
  sku             text NOT NULL,
  product_id      uuid REFERENCES public.products(id) ON DELETE CASCADE,
  in_stock        boolean,
  stock_quantity  integer,
  vendor_cost     numeric,
  retail_price    numeric,
  source_url      text,
  scrape_run_id   text,
  scraped_at      timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS vendor_inventory_vendor_sku_idx ON public.vendor_inventory(vendor_id, sku);
CREATE INDEX IF NOT EXISTS vendor_inventory_scrape_run_idx ON public.vendor_inventory(scrape_run_id);
CREATE INDEX IF NOT EXISTS vendor_inventory_scraped_at_idx ON public.vendor_inventory(scraped_at DESC);

CREATE TABLE IF NOT EXISTS public.drop_ship_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    text UNIQUE,
  customer_email  text NOT NULL,
  customer_name   text,
  customer_phone  text,
  ship_to_name    text,
  ship_to_street  text,
  ship_to_city    text,
  ship_to_state   text,
  ship_to_zip     text,
  ship_to_country text DEFAULT 'US',
  product_id      uuid REFERENCES public.products(id),
  vendor_id       text REFERENCES public.vendor_config(vendor_id),
  product_sku     text,
  product_name    text,
  quantity        integer DEFAULT 1,
  unit_price      numeric NOT NULL,
  shipping        numeric DEFAULT 0,
  total           numeric NOT NULL,
  status          text DEFAULT 'pending' CHECK (status IN ('pending','vendor_notified','vendor_acknowledged','shipped','delivered','cancelled','refunded')),
  vendor_order_ref text,
  tracking_number text,
  tracking_carrier text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  paid            boolean DEFAULT false,
  paid_at         timestamptz,
  vendor_notified_at timestamptz,
  vendor_notified_method text,
  customer_confirmed_at timestamptz,
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  notes           text
);
CREATE INDEX IF NOT EXISTS drop_ship_orders_status_idx ON public.drop_ship_orders(status);
CREATE INDEX IF NOT EXISTS drop_ship_orders_customer_idx ON public.drop_ship_orders(lower(customer_email));
CREATE INDEX IF NOT EXISTS drop_ship_orders_vendor_idx ON public.drop_ship_orders(vendor_id);
CREATE INDEX IF NOT EXISTS drop_ship_orders_created_idx ON public.drop_ship_orders(created_at DESC);

CREATE OR REPLACE FUNCTION public.drop_ship_orders_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS drop_ship_orders_updated_at ON public.drop_ship_orders;
CREATE TRIGGER drop_ship_orders_updated_at BEFORE UPDATE ON public.drop_ship_orders
  FOR EACH ROW EXECUTE FUNCTION public.drop_ship_orders_set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_ship_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_anon_read ON public.products;
CREATE POLICY products_anon_read ON public.products FOR SELECT TO anon USING (active = true);
DROP POLICY IF EXISTS products_service_all ON public.products;
CREATE POLICY products_service_all ON public.products FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS vendor_config_anon_read ON public.vendor_config;
CREATE POLICY vendor_config_anon_read ON public.vendor_config FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS vendor_config_service_all ON public.vendor_config;
CREATE POLICY vendor_config_service_all ON public.vendor_config FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS vendor_inventory_service_all ON public.vendor_inventory;
CREATE POLICY vendor_inventory_service_all ON public.vendor_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS drop_ship_orders_service_all ON public.drop_ship_orders;
CREATE POLICY drop_ship_orders_service_all ON public.drop_ship_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.vendor_config TO anon;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.vendor_config TO service_role;
GRANT ALL ON public.vendor_inventory TO service_role;
GRANT ALL ON public.drop_ship_orders TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vendor_inventory_id_seq TO service_role;

-- Note: future migrations apply automatically via the
-- `.github/workflows/supabase-migrate.yml` GitHub Action +
-- supabase/migrations/ directory. No exec_sql backdoor.

\echo '=== DONE — verify ==='
SELECT 'aspn_members' AS table_name, count(*) AS rows FROM public.aspn_members
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'vendor_config', count(*) FROM public.vendor_config
UNION ALL SELECT 'vendor_inventory', count(*) FROM public.vendor_inventory
UNION ALL SELECT 'drop_ship_orders', count(*) FROM public.drop_ship_orders;
