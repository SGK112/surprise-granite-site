-- ============================================================
-- LEAD FLOW TRACEABILITY MIGRATION
-- Ensures complete data chain: Lead → Customer → Estimate → Invoice → Job
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add lead_id to CUSTOMERS table (bidirectional link back to originating lead)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- 2. Add customer_id to LEADS table (bidirectional link to converted customer)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 3. Add lead_id to ESTIMATES table (the source of traceability)
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- 4. Add lead_id to invoices table (preserves link from estimate)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- 5. Add estimate_id to invoices table if not exists
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL;

-- 6. Add lead_id to jobs table (full traceability)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- 7. Add estimate_id to jobs table if not exists
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL;

-- 8. Add invoice_id to jobs table if not exists
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

-- 9. Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS customers_lead_id_idx ON public.customers(lead_id);
CREATE INDEX IF NOT EXISTS leads_customer_id_idx ON public.leads(customer_id);
CREATE INDEX IF NOT EXISTS estimates_lead_id_idx ON public.estimates(lead_id);
CREATE INDEX IF NOT EXISTS invoices_lead_id_idx ON public.invoices(lead_id);
CREATE INDEX IF NOT EXISTS invoices_estimate_id_idx ON public.invoices(estimate_id);
CREATE INDEX IF NOT EXISTS jobs_lead_id_idx ON public.jobs(lead_id);
CREATE INDEX IF NOT EXISTS jobs_estimate_id_idx ON public.jobs(estimate_id);
CREATE INDEX IF NOT EXISTS jobs_invoice_id_idx ON public.jobs(invoice_id);

-- 10. Backfill existing invoices with lead_id from their estimates (if estimates have lead_id)
UPDATE public.invoices inv
SET lead_id = est.lead_id
FROM public.estimates est
WHERE inv.estimate_id = est.id
  AND inv.lead_id IS NULL
  AND est.lead_id IS NOT NULL;

-- 11. Backfill existing jobs with lead_id from their invoices (if invoices have lead_id)
UPDATE public.jobs j
SET lead_id = inv.lead_id
FROM public.invoices inv
WHERE j.invoice_id = inv.id
  AND j.lead_id IS NULL
  AND inv.lead_id IS NOT NULL;

-- Done!
SELECT 'Lead flow traceability migration complete!' AS status;

-- Verification queries (optional - run separately to check)
-- SELECT COUNT(*) as customers_with_lead_id FROM customers WHERE lead_id IS NOT NULL;
-- SELECT COUNT(*) as leads_with_customer_id FROM leads WHERE customer_id IS NOT NULL;
-- SELECT COUNT(*) as estimates_with_lead_id FROM estimates WHERE lead_id IS NOT NULL;
-- SELECT COUNT(*) as invoices_with_lead_id FROM invoices WHERE lead_id IS NOT NULL;
-- SELECT COUNT(*) as jobs_with_lead_id FROM jobs WHERE lead_id IS NOT NULL;
-- SELECT COUNT(*) as jobs_with_estimate_id FROM jobs WHERE estimate_id IS NOT NULL;
-- SELECT COUNT(*) as jobs_with_invoice_id FROM jobs WHERE invoice_id IS NOT NULL;
