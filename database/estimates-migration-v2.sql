-- Estimates Migration V2 - Add new professional estimate fields
-- Run this in Supabase SQL Editor

-- Add new columns to estimates table
ALTER TABLE public.estimates
ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'custom',
ADD COLUMN IF NOT EXISTS payment_schedule_type TEXT DEFAULT 'deposit-balance',
ADD COLUMN IF NOT EXISTS inclusions TEXT,
ADD COLUMN IF NOT EXISTS exclusions TEXT,
ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
ADD COLUMN IF NOT EXISTS estimated_timeline TEXT;

-- Add category column to estimate_items
ALTER TABLE public.estimate_items
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

-- Add customer_questions table for estimate Q&A
CREATE TABLE IF NOT EXISTS public.estimate_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  asked_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  customer_name TEXT,
  customer_email TEXT
);

-- Enable RLS on estimate_questions
ALTER TABLE public.estimate_questions ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own estimate questions
CREATE POLICY "Users can view own estimate questions" ON public.estimate_questions
  FOR SELECT USING (
    estimate_id IN (SELECT id FROM public.estimates WHERE user_id = auth.uid())
  );

-- Policy for users to update their own estimate questions (answer them)
CREATE POLICY "Users can update own estimate questions" ON public.estimate_questions
  FOR UPDATE USING (
    estimate_id IN (SELECT id FROM public.estimates WHERE user_id = auth.uid())
  );

-- Policy for public to insert questions via token
CREATE POLICY "Public can ask questions via token" ON public.estimate_questions
  FOR INSERT WITH CHECK (
    estimate_id IN (
      SELECT et.estimate_id FROM public.estimate_tokens et
      WHERE et.estimate_id = estimate_questions.estimate_id
      AND et.expires_at > NOW()
    )
  );

-- Policy for public to view questions for estimates they have tokens for
CREATE POLICY "Public can view questions via token" ON public.estimate_questions
  FOR SELECT USING (
    estimate_id IN (
      SELECT et.estimate_id FROM public.estimate_tokens et
      WHERE et.expires_at > NOW()
    )
  );

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_estimate_questions_estimate_id ON public.estimate_questions(estimate_id);

-- Update the estimates table to track when customer viewed
ALTER TABLE public.estimates
ADD COLUMN IF NOT EXISTS customer_viewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS customer_response_notes TEXT;

COMMENT ON TABLE public.estimate_questions IS 'Customer questions about estimates';
COMMENT ON COLUMN public.estimates.project_type IS 'Type of project (countertops, tile, flooring, etc)';
COMMENT ON COLUMN public.estimates.payment_schedule_type IS 'Payment schedule type (deposit-balance, three-part, due-on-completion, custom)';
COMMENT ON COLUMN public.estimates.inclusions IS 'What is included in the estimate';
COMMENT ON COLUMN public.estimates.exclusions IS 'What is NOT included in the estimate';
COMMENT ON COLUMN public.estimates.terms_conditions IS 'Terms and conditions text';
COMMENT ON COLUMN public.estimates.estimated_timeline IS 'Estimated project timeline';
COMMENT ON COLUMN public.estimate_items.category IS 'Item category (material, labor, service, other)';
