-- =============================================
-- SURPRISE GRANITE - ENTERPRISE SSO & RBAC SCHEMA
-- Migration 005: SSO Configuration, Roles, Audit Logging
-- =============================================

-- =============================================
-- 1. DISTRIBUTOR SSO CONFIGURATION
-- Maps enterprise email domains to SSO providers
-- =============================================

CREATE TABLE IF NOT EXISTS distributor_sso_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,

  -- Provider configuration
  provider TEXT NOT NULL CHECK (provider IN ('google_workspace', 'microsoft_azure', 'okta', 'saml')),
  is_active BOOLEAN DEFAULT true,

  -- Domain mapping (e.g., ['@msistone.com', '@msisurfaces.com'])
  email_domains TEXT[] NOT NULL,

  -- Provider-specific settings
  tenant_id TEXT,              -- Azure AD tenant ID
  client_id TEXT,              -- Custom OAuth client ID
  metadata_url TEXT,           -- SAML metadata URL

  -- Behavior settings
  enforce_sso BOOLEAN DEFAULT false,        -- Require SSO (no password login)
  auto_provision_users BOOLEAN DEFAULT true, -- Create users on first SSO login
  default_role TEXT DEFAULT 'viewer' CHECK (default_role IN ('admin', 'sales', 'warehouse_manager', 'viewer')),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(distributor_id, provider)
);

CREATE INDEX idx_sso_config_domains ON distributor_sso_config USING GIN (email_domains);
CREATE INDEX idx_sso_config_distributor ON distributor_sso_config(distributor_id);

-- =============================================
-- 2. ROLE PERMISSION TEMPLATES
-- Default permission sets for each role
-- =============================================

CREATE TABLE IF NOT EXISTS role_permission_templates (
  role TEXT PRIMARY KEY CHECK (role IN ('admin', 'sales', 'warehouse_manager', 'viewer')),
  permissions JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO role_permission_templates (role, permissions, description) VALUES
('admin', '{
  "inventory": {"read": true, "write": true, "delete": true, "bulk_import": true},
  "inquiries": {"read": true, "write": true, "assign": true, "delete": true},
  "analytics": {"read": true, "export": true},
  "settings": {"read": true, "write": true},
  "team": {"read": true, "invite": true, "manage": true, "remove": true},
  "api_keys": {"read": true, "create": true, "revoke": true},
  "locations": {"read": true, "write": true, "delete": true},
  "billing": {"read": true, "manage": true},
  "audit_logs": {"read": true}
}'::jsonb, 'Full administrative access - can manage all aspects of the distributor account'),

('sales', '{
  "inventory": {"read": true, "write": true, "delete": false, "bulk_import": true},
  "inquiries": {"read": true, "write": true, "assign": false, "delete": false},
  "analytics": {"read": true, "export": false},
  "settings": {"read": false, "write": false},
  "team": {"read": true, "invite": false, "manage": false, "remove": false},
  "api_keys": {"read": false, "create": false, "revoke": false},
  "locations": {"read": true, "write": false, "delete": false},
  "billing": {"read": false, "manage": false},
  "audit_logs": {"read": false}
}'::jsonb, 'Sales team access - manage inventory and respond to inquiries'),

('warehouse_manager', '{
  "inventory": {"read": true, "write": true, "delete": true, "bulk_import": true},
  "inquiries": {"read": true, "write": false, "assign": false, "delete": false},
  "analytics": {"read": true, "export": false},
  "settings": {"read": false, "write": false},
  "team": {"read": true, "invite": false, "manage": false, "remove": false},
  "api_keys": {"read": false, "create": false, "revoke": false},
  "locations": {"read": true, "write": true, "delete": false},
  "billing": {"read": false, "manage": false},
  "audit_logs": {"read": false}
}'::jsonb, 'Warehouse operations - full inventory and location control'),

('viewer', '{
  "inventory": {"read": true, "write": false, "delete": false, "bulk_import": false},
  "inquiries": {"read": true, "write": false, "assign": false, "delete": false},
  "analytics": {"read": true, "export": false},
  "settings": {"read": false, "write": false},
  "team": {"read": true, "invite": false, "manage": false, "remove": false},
  "api_keys": {"read": false, "create": false, "revoke": false},
  "locations": {"read": true, "write": false, "delete": false},
  "billing": {"read": false, "manage": false},
  "audit_logs": {"read": false}
}'::jsonb, 'Read-only access - view inventory and analytics')
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions, description = EXCLUDED.description;

-- =============================================
-- 3. DISTRIBUTOR USER ROLES
-- Maps users to distributors with specific roles
-- =============================================

CREATE TABLE IF NOT EXISTS distributor_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role assignment
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales', 'warehouse_manager', 'viewer')),
  permissions JSONB NOT NULL,  -- Copy of template, can be customized

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Invitation tracking
  invited_at TIMESTAMPTZ,
  invited_by UUID REFERENCES auth.users(id),
  invite_token TEXT,
  invite_expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,

  -- MFA status
  mfa_required BOOLEAN DEFAULT false,
  mfa_enrolled BOOLEAN DEFAULT false,
  mfa_enrolled_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(distributor_id, user_id)
);

CREATE INDEX idx_user_roles_user ON distributor_user_roles(user_id) WHERE is_active = true;
CREATE INDEX idx_user_roles_distributor ON distributor_user_roles(distributor_id) WHERE is_active = true;
CREATE INDEX idx_user_roles_invite_token ON distributor_user_roles(invite_token) WHERE invite_token IS NOT NULL;

-- =============================================
-- 4. AUTHENTICATION AUDIT LOGS
-- Security and compliance logging
-- =============================================

CREATE TABLE IF NOT EXISTS auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    -- Authentication events
    'login_success', 'login_failed', 'logout',
    'sso_login', 'sso_failed', 'sso_provisioned',
    'token_refresh', 'token_revoked',
    'session_created', 'session_revoked',
    -- Authorization events
    'permission_denied', 'permission_granted',
    'role_assigned', 'role_changed', 'role_removed',
    -- Security events
    'mfa_enabled', 'mfa_disabled', 'mfa_challenge_success', 'mfa_challenge_failed',
    'password_reset_requested', 'password_reset_completed', 'password_changed',
    -- API events
    'api_key_created', 'api_key_used', 'api_key_revoked',
    -- Team events
    'user_invited', 'user_accepted_invite', 'user_removed',
    -- System events
    'deprecated_auth_used', 'suspicious_activity', 'rate_limited'
  )),
  event_status TEXT DEFAULT 'success' CHECK (event_status IN ('success', 'failed', 'blocked', 'pending')),

  -- Actor information
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  distributor_id UUID REFERENCES distributors(id),

  -- Request context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  request_id TEXT,

  -- Event details
  details JSONB DEFAULT '{}',
  error_message TEXT,

  -- Geolocation (optional, for suspicious activity detection)
  country_code CHAR(2),
  region TEXT,
  city TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_audit_user ON auth_audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_distributor ON auth_audit_logs(distributor_id, created_at DESC);
CREATE INDEX idx_audit_event_type ON auth_audit_logs(event_type, created_at DESC);
CREATE INDEX idx_audit_ip ON auth_audit_logs(ip_address, created_at DESC);
CREATE INDEX idx_audit_created ON auth_audit_logs(created_at DESC);

-- Partitioning for performance (optional - enable for high volume)
-- CREATE INDEX idx_audit_created_month ON auth_audit_logs(date_trunc('month', created_at));

-- =============================================
-- 5. USER SESSIONS
-- Track active sessions for security
-- =============================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  distributor_id UUID REFERENCES distributors(id),

  -- Session identification
  session_token_hash TEXT NOT NULL,  -- SHA256 hash of refresh token

  -- Device info
  device_fingerprint TEXT,
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,

  -- Location
  ip_address INET,
  country_code CHAR(2),
  city TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,
  revoke_reason TEXT
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_sessions_token ON user_sessions(session_token_hash) WHERE is_active = true;

-- =============================================
-- 6. RLS POLICIES
-- =============================================

ALTER TABLE distributor_sso_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- SSO Config: Only admins can view/manage
CREATE POLICY "Admins can view SSO config" ON distributor_sso_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM distributor_user_roles
      WHERE distributor_id = distributor_sso_config.distributor_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  );

CREATE POLICY "Admins can manage SSO config" ON distributor_sso_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM distributor_user_roles
      WHERE distributor_id = distributor_sso_config.distributor_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  );

-- User Roles: Users can view own, admins can manage all
CREATE POLICY "Users can view own role" ON distributor_user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON distributor_user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM distributor_user_roles dur
      WHERE dur.distributor_id = distributor_user_roles.distributor_id
      AND dur.user_id = auth.uid()
      AND dur.role = 'admin'
      AND dur.is_active = true
    )
  );

-- Audit Logs: Admins can view their distributor's logs
CREATE POLICY "Admins can view audit logs" ON auth_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM distributor_user_roles
      WHERE distributor_id = auth_audit_logs.distributor_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
    OR user_id = auth.uid()  -- Users can see their own events
  );

-- Sessions: Users can view/manage own sessions
CREATE POLICY "Users can view own sessions" ON user_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can revoke own sessions" ON user_sessions
  FOR UPDATE USING (user_id = auth.uid());

-- Service role bypass for all tables
CREATE POLICY "Service role full access sso" ON distributor_sso_config
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access roles" ON distributor_user_roles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access audit" ON auth_audit_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access sessions" ON user_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================
-- 7. HELPER FUNCTIONS
-- =============================================

-- Check if user has permission
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id UUID,
  p_distributor_id UUID,
  p_resource TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_permissions JSONB;
BEGIN
  SELECT permissions INTO user_permissions
  FROM public.distributor_user_roles
  WHERE user_id = p_user_id
    AND distributor_id = p_distributor_id
    AND is_active = true;

  IF user_permissions IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN COALESCE(
    (user_permissions -> p_resource ->> p_action)::boolean,
    FALSE
  );
END;
$$;

-- Log audit event
CREATE OR REPLACE FUNCTION log_audit_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_distributor_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  log_id UUID;
  user_email_val TEXT;
BEGIN
  -- Get user email if user_id provided
  IF p_user_id IS NOT NULL THEN
    SELECT email INTO user_email_val FROM auth.users WHERE id = p_user_id;
  END IF;

  INSERT INTO public.auth_audit_logs (
    event_type, event_status, user_id, user_email,
    distributor_id, ip_address, user_agent, details, error_message
  ) VALUES (
    p_event_type, p_status, p_user_id, user_email_val,
    p_distributor_id, p_ip_address, p_user_agent, p_details, p_error_message
  ) RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

-- Get user's role for a distributor
CREATE OR REPLACE FUNCTION get_user_role(
  p_user_id UUID,
  p_distributor_id UUID
) RETURNS TABLE (
  role TEXT,
  permissions JSONB,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT dur.role, dur.permissions, dur.is_active
  FROM public.distributor_user_roles dur
  WHERE dur.user_id = p_user_id
    AND dur.distributor_id = p_distributor_id
    AND dur.is_active = true;
END;
$$;

-- Revoke all other sessions for a user
CREATE OR REPLACE FUNCTION revoke_other_sessions(
  p_user_id UUID,
  p_current_session_hash TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  revoked_count INTEGER;
BEGIN
  UPDATE public.user_sessions
  SET is_active = false,
      revoked_at = NOW(),
      revoke_reason = 'user_revoked_other_sessions'
  WHERE user_id = p_user_id
    AND session_token_hash != p_current_session_hash
    AND is_active = true;

  GET DIAGNOSTICS revoked_count = ROW_COUNT;

  -- Log the action
  PERFORM public.log_audit_event(
    'session_revoked',
    p_user_id,
    NULL,
    jsonb_build_object('revoked_count', revoked_count, 'reason', 'user_action'),
    NULL,
    NULL,
    'success'
  );

  RETURN revoked_count;
END;
$$;

-- Find SSO config by email domain
CREATE OR REPLACE FUNCTION find_sso_config_by_email(
  p_email TEXT
) RETURNS TABLE (
  distributor_id UUID,
  provider TEXT,
  enforce_sso BOOLEAN,
  auto_provision_users BOOLEAN,
  default_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  email_domain TEXT;
BEGIN
  -- Extract domain from email
  email_domain := '@' || split_part(p_email, '@', 2);

  RETURN QUERY
  SELECT
    sso.distributor_id,
    sso.provider,
    sso.enforce_sso,
    sso.auto_provision_users,
    sso.default_role
  FROM public.distributor_sso_config sso
  WHERE email_domain = ANY(sso.email_domains)
    AND sso.is_active = true;
END;
$$;

-- =============================================
-- 8. TRIGGERS
-- =============================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sso_config_updated
  BEFORE UPDATE ON distributor_sso_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_user_roles_updated
  BEFORE UPDATE ON distributor_user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 9. INITIAL DATA MIGRATION
-- Assign admin role to existing distributor owners
-- =============================================

-- For existing distributors, make the linked user an admin
INSERT INTO distributor_user_roles (distributor_id, user_id, role, permissions, is_active, accepted_at)
SELECT
  d.id,
  d.user_id,
  'admin',
  (SELECT permissions FROM role_permission_templates WHERE role = 'admin'),
  true,
  NOW()
FROM distributors d
WHERE d.user_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM distributor_user_roles dur
  WHERE dur.distributor_id = d.id AND dur.user_id = d.user_id
)
ON CONFLICT (distributor_id, user_id) DO NOTHING;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

COMMENT ON TABLE distributor_sso_config IS 'Enterprise SSO configuration - maps email domains to SSO providers';
COMMENT ON TABLE distributor_user_roles IS 'User role assignments within distributors with granular permissions';
COMMENT ON TABLE auth_audit_logs IS 'Security audit trail for authentication and authorization events';
COMMENT ON TABLE user_sessions IS 'Active user sessions for security monitoring and management';
COMMENT ON TABLE role_permission_templates IS 'Default permission sets for each role type';
