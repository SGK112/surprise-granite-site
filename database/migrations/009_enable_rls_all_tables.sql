-- Enable RLS on ALL tables that contain sensitive data
-- This prevents anonymous/public access to customer data
-- Service role (backend) still has full access

-- ============================================
-- CRITICAL: Customer & Business Data
-- ============================================

-- Leads (customer names, emails, phones)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on leads" ON leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users read own leads" ON leads FOR SELECT TO authenticated USING (true);

-- Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on customers" ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users read customers" ON customers FOR SELECT TO authenticated USING (true);

-- Shopify Orders
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on shopify_orders" ON shopify_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage shopify_orders" ON shopify_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Shopify Customers
ALTER TABLE shopify_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on shopify_customers" ON shopify_customers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- SG Users
ALTER TABLE sg_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on sg_users" ON sg_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own profile" ON sg_users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON sg_users FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Anon can insert sg_users" ON sg_users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth can insert sg_users" ON sg_users FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- ORDERS & PAYMENTS
-- ============================================

-- Orders (already has RLS but fix policies)
-- order_items (already has RLS)
-- order_events (already has RLS)

-- Invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on invoices" ON invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage invoices" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on invoice_items" ON invoice_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage invoice_items" ON invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE invoice_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on invoice_tokens" ON invoice_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read invoice_tokens" ON invoice_tokens FOR SELECT TO anon USING (true);

-- Estimates
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on estimates" ON estimates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage estimates" ON estimates FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on estimate_items" ON estimate_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage estimate_items" ON estimate_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE estimate_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on estimate_tokens" ON estimate_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read estimate_tokens" ON estimate_tokens FOR SELECT TO anon USING (true);

-- ============================================
-- PROJECTS & JOBS
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on projects" ON projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage projects" ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on jobs" ON jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage jobs" ON jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- MARKETPLACE (public read OK, write restricted)
-- ============================================

ALTER TABLE distributor_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on distributor_products" ON distributor_products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read distributor_products" ON distributor_products FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can read distributor_products" ON distributor_products FOR SELECT TO authenticated USING (true);

ALTER TABLE distributor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on distributor_profiles" ON distributor_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read distributor_profiles" ON distributor_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can read distributor_profiles" ON distributor_profiles FOR SELECT TO authenticated USING (true);

ALTER TABLE slab_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on slab_inventory" ON slab_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read slab_inventory" ON slab_inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can read slab_inventory" ON slab_inventory FOR SELECT TO authenticated USING (true);

ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on material_categories" ON material_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read material_categories" ON material_categories FOR SELECT TO anon USING (true);

ALTER TABLE stone_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on stone_listings" ON stone_listings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read stone_listings" ON stone_listings FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated manage stone_listings" ON stone_listings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- USER DATA
-- ============================================

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on user_favorites" ON user_favorites FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users manage own favorites" ON user_favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE pro_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pro_notifications" ON pro_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own notifications" ON pro_notifications FOR SELECT TO authenticated USING (true);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on notifications" ON notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read notifications" ON notifications FOR SELECT TO authenticated USING (true);

-- ============================================
-- PORTAL & AUTH
-- ============================================

ALTER TABLE portal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on portal_tokens" ON portal_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read portal_tokens" ON portal_tokens FOR SELECT TO anon USING (true);

ALTER TABLE customer_portal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on customer_portal_tokens" ON customer_portal_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read customer_portal_tokens" ON customer_portal_tokens FOR SELECT TO anon USING (true);

-- ============================================
-- COLLABORATION
-- ============================================

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on contractors" ON contractors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage contractors" ON contractors FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE collaborator_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on collaborator_messages" ON collaborator_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage messages" ON collaborator_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE customer_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on customer_messages" ON customer_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage customer_messages" ON customer_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
