-- 014_aspn_members.sql
-- Arizona Stone Providers Network (ASPN) — member directory
--
-- Frictionless signup: email + business_name + service_category required, everything
-- else optional and progressively completable. Members start unapproved; Joshua
-- approves before the row appears in the public directory.
--
-- Idempotent (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS public.aspn_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Required at signup
  email           text NOT NULL,
  business_name   text NOT NULL,
  service_category text NOT NULL,  -- stone-yard, fabricator, tile-installer, designer, gc, sealer, other
  -- Auto-derived from business_name; unique URL slug for /aspn/members/<slug>/
  slug            text UNIQUE,
  -- Optional, completable later
  contact_name    text,
  phone           text,
  website         text,
  city            text,
  state           text DEFAULT 'AZ',
  zip             text,
  -- Profile content
  short_description text,    -- 160-char tagline for directory cards
  long_description  text,    -- full member-page bio
  service_areas     text[],  -- cities they serve
  specialties       text[],  -- specific products / techniques
  -- Social
  instagram_url   text,
  facebook_url    text,
  houzz_url       text,
  yelp_url        text,
  google_url      text,
  linkedin_url    text,
  -- License
  az_roc_license  text,
  bonded_insured  boolean DEFAULT false,
  -- Imagery
  logo_url        text,
  cover_image_url text,
  gallery_urls    text[],
  -- Membership status
  founder_status  boolean DEFAULT false,  -- first 50 members get this badge
  approved        boolean DEFAULT false,  -- Joshua-approved → public directory
  rejected        boolean DEFAULT false,
  rejection_reason text,
  featured        boolean DEFAULT false,  -- front-page directory feature
  -- Audit
  created_at      timestamptz DEFAULT now() NOT NULL,
  approved_at     timestamptz,
  updated_at      timestamptz DEFAULT now() NOT NULL,
  -- Verification token for "complete your profile" links
  verification_token text DEFAULT gen_random_uuid()::text,
  email_verified  boolean DEFAULT false,
  email_verified_at timestamptz
);

-- Slug must be unique. We compute it on insert from business_name.
CREATE INDEX IF NOT EXISTS aspn_members_slug_idx ON public.aspn_members(slug);
CREATE INDEX IF NOT EXISTS aspn_members_email_idx ON public.aspn_members(lower(email));
CREATE INDEX IF NOT EXISTS aspn_members_approved_idx ON public.aspn_members(approved) WHERE approved = true;
CREATE INDEX IF NOT EXISTS aspn_members_service_category_idx ON public.aspn_members(service_category);
CREATE INDEX IF NOT EXISTS aspn_members_city_idx ON public.aspn_members(lower(city));
CREATE INDEX IF NOT EXISTS aspn_members_founder_idx ON public.aspn_members(founder_status) WHERE founder_status = true;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.aspn_members_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aspn_members_updated_at ON public.aspn_members;
CREATE TRIGGER aspn_members_updated_at
  BEFORE UPDATE ON public.aspn_members
  FOR EACH ROW EXECUTE FUNCTION public.aspn_members_set_updated_at();

-- Auto-flag first 50 approved members as founders
CREATE OR REPLACE FUNCTION public.aspn_members_set_founder_status()
RETURNS trigger AS $$
DECLARE
  approved_count integer;
BEGIN
  IF NEW.approved = true AND (OLD IS NULL OR OLD.approved = false) THEN
    SELECT COUNT(*) INTO approved_count FROM public.aspn_members WHERE approved = true;
    IF approved_count < 50 THEN
      NEW.founder_status = true;
    END IF;
    NEW.approved_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aspn_members_founder_check ON public.aspn_members;
CREATE TRIGGER aspn_members_founder_check
  BEFORE UPDATE ON public.aspn_members
  FOR EACH ROW EXECUTE FUNCTION public.aspn_members_set_founder_status();

-- Slug auto-generation on insert
CREATE OR REPLACE FUNCTION public.aspn_members_generate_slug()
RETURNS trigger AS $$
DECLARE
  base_slug text;
  candidate text;
  counter integer := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    -- lowercase, alphanumeric + dash, collapse runs, trim dashes
    base_slug := regexp_replace(lower(NEW.business_name), '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := substring(base_slug from 1 for 60);
    candidate := base_slug;
    WHILE EXISTS (SELECT 1 FROM public.aspn_members WHERE slug = candidate AND id != NEW.id) LOOP
      counter := counter + 1;
      candidate := base_slug || '-' || counter;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aspn_members_slug_gen ON public.aspn_members;
CREATE TRIGGER aspn_members_slug_gen
  BEFORE INSERT ON public.aspn_members
  FOR EACH ROW EXECUTE FUNCTION public.aspn_members_generate_slug();

-- RLS: service_role can do anything; anon can SELECT only approved members
ALTER TABLE public.aspn_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aspn_members_anon_read_approved ON public.aspn_members;
CREATE POLICY aspn_members_anon_read_approved ON public.aspn_members
  FOR SELECT TO anon
  USING (approved = true);

DROP POLICY IF EXISTS aspn_members_service_role_all ON public.aspn_members;
CREATE POLICY aspn_members_service_role_all ON public.aspn_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.aspn_members TO anon;
GRANT ALL ON public.aspn_members TO service_role;
