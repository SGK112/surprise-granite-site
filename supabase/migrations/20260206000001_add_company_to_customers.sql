-- Add company column to customers table (optional field)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company TEXT;

-- Add comment for documentation
COMMENT ON COLUMN customers.company IS 'Optional company/business name for the customer';
