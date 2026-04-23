-- 013_unified_workflow.sql
-- Unifies estimates → invoices → projects → orders into one customer journey.
-- Adds the columns + tables the UI needs to (a) show jobs alongside ecommerce orders,
-- (b) track shipments / installs, and (c) log customer-facing updates.
--
-- Verified 2026-04-20: all ADDED columns returned 400 on column-probe.
-- Idempotent (IF NOT EXISTS everywhere).

-- ───────────── projects: scheduling, tracking, assignment, order link
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS completion_date date,
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS last_customer_update_at timestamptz;

CREATE INDEX IF NOT EXISTS projects_estimate_id_idx ON public.projects(estimate_id);
CREATE INDEX IF NOT EXISTS projects_invoice_id_idx  ON public.projects(invoice_id);
CREATE INDEX IF NOT EXISTS projects_order_id_idx    ON public.projects(order_id);

-- ───────────── orders: reverse link to project + tracking URL
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tracking_url text;

CREATE INDEX IF NOT EXISTS orders_project_id_idx ON public.orders(project_id);

-- ───────────── project_updates: unified customer-communication log
-- Used by the UI to record every message/status change sent to the customer,
-- so the "timeline" in the job detail view is not a guess.
CREATE TABLE IF NOT EXISTS public.project_updates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('status_change','message','tracking','schedule','note','payment')),
  from_status     text,
  to_status       text,
  subject         text,
  body            text,
  sent_to_customer boolean NOT NULL DEFAULT false,
  delivered_at    timestamptz,
  delivery_error  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_updates_project_id_idx ON public.project_updates(project_id);
CREATE INDEX IF NOT EXISTS project_updates_user_id_idx    ON public.project_updates(user_id);
CREATE INDEX IF NOT EXISTS project_updates_created_at_idx ON public.project_updates(created_at DESC);

-- RLS: owner-only read/write (matches projects RLS pattern).
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_updates_owner_select ON public.project_updates;
CREATE POLICY project_updates_owner_select ON public.project_updates
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS project_updates_owner_insert ON public.project_updates;
CREATE POLICY project_updates_owner_insert ON public.project_updates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS project_updates_owner_update ON public.project_updates;
CREATE POLICY project_updates_owner_update ON public.project_updates
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS project_updates_owner_delete ON public.project_updates;
CREATE POLICY project_updates_owner_delete ON public.project_updates
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────── Back-fill: link existing invoices to the estimate's project
-- (if both exist). One-shot, idempotent.
UPDATE public.invoices i
SET project_id = p.id
FROM public.projects p
WHERE i.project_id IS NULL
  AND i.estimate_id IS NOT NULL
  AND p.estimate_id = i.estimate_id;
