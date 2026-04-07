-- Order Events / Timeline
-- Tracks status changes, emails sent, messages, and tracking updates

CREATE TABLE IF NOT EXISTS order_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- status_change, email_sent, tracking_added, message_sent, note_added
  description TEXT,
  actor TEXT, -- email of admin who performed the action
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_events_order_id ON order_events(order_id);
CREATE INDEX idx_order_events_created_at ON order_events(created_at);

-- RLS
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on order_events"
  ON order_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can insert order events"
  ON order_events FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Authenticated users view own order events"
  ON order_events FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_email = auth.email()
    )
  );
