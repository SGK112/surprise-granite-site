-- ============================================================
-- INVOICE TOKENS TABLE
-- Enables secure shareable invoice links for customer viewing
-- ============================================================

-- Create the invoice_tokens table
CREATE TABLE IF NOT EXISTS public.invoice_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_viewed_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS invoice_tokens_token_idx ON public.invoice_tokens(token);
CREATE INDEX IF NOT EXISTS invoice_tokens_invoice_id_idx ON public.invoice_tokens(invoice_id);

-- Enable RLS
ALTER TABLE public.invoice_tokens ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own tokens
CREATE POLICY "invoice_tokens_select_own" ON public.invoice_tokens
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "invoice_tokens_insert_own" ON public.invoice_tokens
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "invoice_tokens_update_own" ON public.invoice_tokens
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "invoice_tokens_delete_own" ON public.invoice_tokens
  FOR DELETE USING (created_by = auth.uid());

-- Public read access via token (for customer invoice viewing - no auth required)
CREATE POLICY "invoice_tokens_public_read" ON public.invoice_tokens
  FOR SELECT USING (true);

-- Public update for view tracking (last_viewed_at, view_count)
CREATE POLICY "invoice_tokens_public_update_views" ON public.invoice_tokens
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- Service role full access
CREATE POLICY "invoice_tokens_service_all" ON public.invoice_tokens
  FOR ALL USING (auth.role() = 'service_role');

SELECT 'Invoice tokens migration complete!' AS status;
