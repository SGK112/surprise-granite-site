-- Add subscription tracking columns to sg_users
-- These columns are used to track Pro/Fabricator/Business subscriptions from Stripe

-- Add subscription columns if they don't exist
DO $$
BEGIN
    -- subscription_id: Stripe subscription ID for active subscriptions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sg_users' AND column_name = 'subscription_id') THEN
        ALTER TABLE sg_users ADD COLUMN subscription_id TEXT;
    END IF;

    -- subscription_status: Current subscription status (active, past_due, canceled, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sg_users' AND column_name = 'subscription_status') THEN
        ALTER TABLE sg_users ADD COLUMN subscription_status TEXT;
    END IF;

    -- subscription_updated_at: When the subscription was last updated
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sg_users' AND column_name = 'subscription_updated_at') THEN
        ALTER TABLE sg_users ADD COLUMN subscription_updated_at TIMESTAMPTZ;
    END IF;

    -- stripe_customer_id: Stripe customer ID for billing portal access
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'sg_users' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE sg_users ADD COLUMN stripe_customer_id TEXT;
    END IF;
END $$;

-- Create index for subscription lookups
CREATE INDEX IF NOT EXISTS idx_sg_users_subscription_id ON sg_users(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sg_users_stripe_customer_id ON sg_users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN sg_users.subscription_id IS 'Stripe subscription ID for active Pro/Fabricator/Business subscriptions';
COMMENT ON COLUMN sg_users.subscription_status IS 'Current Stripe subscription status: active, past_due, canceled, incomplete, etc.';
COMMENT ON COLUMN sg_users.subscription_updated_at IS 'Timestamp of last subscription status change';
COMMENT ON COLUMN sg_users.stripe_customer_id IS 'Stripe customer ID for billing portal and payment management';
