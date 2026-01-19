-- ============================================================
-- INVOICE STRIPE INTEGRATION MIGRATION
-- Run this in Supabase SQL Editor to enable Stripe invoice sync
-- ============================================================

-- Add customer_id for linking to customers table
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Add Stripe integration columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT UNIQUE;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_hosted_url TEXT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_pdf_url TEXT;

-- Add amount_due (for Stripe compatibility with balance_due)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS amount_due DECIMAL(10,2) DEFAULT 0;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS invoices_stripe_id_idx ON public.invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices(customer_id);

-- Policy to allow service role (webhooks) to insert/update
-- This should already exist but ensure it's there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoices'
    AND policyname = 'invoices_service_all'
  ) THEN
    CREATE POLICY "invoices_service_all" ON public.invoices
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Done!
SELECT 'Invoice Stripe migration complete!' AS status;
