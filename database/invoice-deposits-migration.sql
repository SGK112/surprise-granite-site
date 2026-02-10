-- =====================================================
-- INVOICE DEPOSITS MIGRATION
-- Add deposit tracking to invoices
-- =====================================================

-- Add deposit_requested column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'deposit_requested') THEN
    ALTER TABLE invoices ADD COLUMN deposit_requested DECIMAL(10,2);
  END IF;
END $$;

-- Add deposit_percent column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'deposit_percent') THEN
    ALTER TABLE invoices ADD COLUMN deposit_percent DECIMAL(5,2);
  END IF;
END $$;

-- Add deposit_paid column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'deposit_paid') THEN
    ALTER TABLE invoices ADD COLUMN deposit_paid DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add deposit_paid_at column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'deposit_paid_at') THEN
    ALTER TABLE invoices ADD COLUMN deposit_paid_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add balance_due column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'balance_due') THEN
    ALTER TABLE invoices ADD COLUMN balance_due DECIMAL(10,2);
  END IF;
END $$;

-- Add deposit_payment_method column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'deposit_payment_method') THEN
    ALTER TABLE invoices ADD COLUMN deposit_payment_method TEXT;
  END IF;
END $$;

-- Add same fields to estimates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'deposit_requested') THEN
    ALTER TABLE estimates ADD COLUMN deposit_requested DECIMAL(10,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'deposit_paid') THEN
    ALTER TABLE estimates ADD COLUMN deposit_paid DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'deposit_paid_at') THEN
    ALTER TABLE estimates ADD COLUMN deposit_paid_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'balance_due') THEN
    ALTER TABLE estimates ADD COLUMN balance_due DECIMAL(10,2);
  END IF;
END $$;

COMMENT ON COLUMN invoices.deposit_requested IS 'Deposit amount requested from customer';
COMMENT ON COLUMN invoices.deposit_percent IS 'Deposit as percentage of total';
COMMENT ON COLUMN invoices.deposit_paid IS 'Amount of deposit actually paid';
COMMENT ON COLUMN invoices.deposit_paid_at IS 'When the deposit was paid';
COMMENT ON COLUMN invoices.balance_due IS 'Remaining balance after deposit';
COMMENT ON COLUMN invoices.deposit_payment_method IS 'How the deposit was paid (cash, check, card, etc)';
