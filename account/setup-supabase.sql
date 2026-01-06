-- Surprise Granite User Profiles - SEPARATE TABLE
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/cpnqippzgcezidoorwry/sql

-- Create dedicated sg_users table for Surprise Granite
CREATE TABLE IF NOT EXISTS public.sg_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  account_type TEXT DEFAULT 'homeowner' CHECK (
    account_type IN ('homeowner', 'pro_fabricator', 'pro_contractor', 'pro_designer', 'admin')
  ),
  company_name TEXT,
  license_number TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.sg_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "sg_users_select_own" ON public.sg_users
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "sg_users_update_own" ON public.sg_users
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "sg_users_insert_own" ON public.sg_users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Service role can do everything (for admin)
CREATE POLICY "sg_users_service_all" ON public.sg_users
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.sg_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sg_users_updated_at_trigger ON public.sg_users;
CREATE TRIGGER sg_users_updated_at_trigger
  BEFORE UPDATE ON public.sg_users
  FOR EACH ROW EXECUTE FUNCTION public.sg_users_updated_at();

-- Grant access
GRANT ALL ON public.sg_users TO authenticated;
GRANT ALL ON public.sg_users TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS sg_users_email_idx ON public.sg_users(email);
CREATE INDEX IF NOT EXISTS sg_users_account_type_idx ON public.sg_users(account_type);
