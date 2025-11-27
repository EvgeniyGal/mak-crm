-- Migration to add payment_type column to expenditures table
-- Payment type indicates how the expenditure was paid: cash or till

ALTER TABLE public.expenditures
ADD COLUMN IF NOT EXISTS payment_type TEXT CHECK (payment_type IN ('cash', 'till'));

-- Set default value for existing records (optional - can be NULL)
-- UPDATE public.expenditures SET payment_type = 'cash' WHERE payment_type IS NULL;

