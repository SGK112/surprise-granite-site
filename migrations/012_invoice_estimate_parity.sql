-- 012_invoice_estimate_parity.sql
-- Adds the columns the invoice-view already reads but that were missing from the
-- invoices / invoice_items tables. Without these, convertToInvoice() silently
-- dropped 8 fields from the estimate, so customer-facing invoices were incomplete.
--
-- Verified 2026-04-20 by probing PostgREST (anon role) column-by-column:
--   invoices.project_description, project_type, internal_notes, terms_conditions,
--   inclusions, exclusions, estimated_timeline, warranty_terms  → DID NOT EXIST
--   invoice_items.category → DID NOT EXIST
--
-- Safe to re-run (IF NOT EXISTS on every column).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS project_description text,
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS terms_conditions text,
  ADD COLUMN IF NOT EXISTS inclusions text,
  ADD COLUMN IF NOT EXISTS exclusions text,
  ADD COLUMN IF NOT EXISTS estimated_timeline text,
  ADD COLUMN IF NOT EXISTS warranty_terms text;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS category text;

-- Backfill: for any invoice already created from an estimate, copy the rich
-- estimate fields across. Idempotent — only fills NULLs.
UPDATE public.invoices i
SET
  project_description  = COALESCE(i.project_description, e.project_description),
  project_type         = COALESCE(i.project_type,        e.project_type),
  internal_notes       = COALESCE(i.internal_notes,      e.internal_notes),
  terms_conditions     = COALESCE(i.terms_conditions,    e.terms_conditions),
  inclusions           = COALESCE(i.inclusions,          e.inclusions),
  exclusions           = COALESCE(i.exclusions,          e.exclusions),
  estimated_timeline   = COALESCE(i.estimated_timeline,  e.estimated_timeline),
  warranty_terms       = COALESCE(i.warranty_terms,      e.warranty_terms)
FROM public.estimates e
WHERE i.estimate_id = e.id
  AND (
    i.project_description IS NULL OR
    i.project_type        IS NULL OR
    i.internal_notes      IS NULL OR
    i.terms_conditions    IS NULL OR
    i.inclusions          IS NULL OR
    i.exclusions          IS NULL OR
    i.estimated_timeline  IS NULL OR
    i.warranty_terms      IS NULL
  );
