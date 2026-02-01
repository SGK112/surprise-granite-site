-- Add missing link columns to estimates table
-- This enables full traceability: Lead → Estimate → Invoice → Project

-- Add lead_id to estimates if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimates' AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE public.estimates ADD COLUMN lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_estimates_lead_id ON public.estimates(lead_id);
  END IF;
END $$;

-- Add customer_id to estimates if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimates' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.estimates ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_estimates_customer_id ON public.estimates(customer_id);
  END IF;
END $$;

-- Add project_id to estimates for reverse lookup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimates' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.estimates ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON public.estimates(project_id);
  END IF;
END $$;

-- Add project_id to invoices for direct project link
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);
  END IF;
END $$;

-- Backfill lead_id from customers where possible
UPDATE public.estimates e
SET lead_id = c.lead_id
FROM public.customers c
WHERE e.customer_id = c.id
  AND e.lead_id IS NULL
  AND c.lead_id IS NOT NULL;

-- Backfill customer_id from customer_email match
UPDATE public.estimates e
SET customer_id = c.id
FROM public.customers c
WHERE LOWER(e.customer_email) = LOWER(c.email)
  AND e.customer_id IS NULL
  AND e.user_id = c.user_id;

COMMENT ON COLUMN public.estimates.lead_id IS 'Links estimate to originating lead for traceability';
COMMENT ON COLUMN public.estimates.customer_id IS 'Links estimate to customer record';
COMMENT ON COLUMN public.estimates.project_id IS 'Links estimate to resulting project (after conversion)';
COMMENT ON COLUMN public.invoices.project_id IS 'Links invoice to project for bidirectional access';
