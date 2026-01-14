-- Fix Leads Table Schema
-- Run this in Supabase SQL Editor to add missing columns
-- ============================================================

-- Add missing columns for lead capture modal (safe - only adds if not exists)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS image_urls JSONB;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS form_name TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS page_url TEXT;

-- Create index on zip_code for location-based queries
CREATE INDEX IF NOT EXISTS leads_zip_code_idx ON public.leads(zip_code);

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'leads' AND table_schema = 'public'
ORDER BY ordinal_position;
