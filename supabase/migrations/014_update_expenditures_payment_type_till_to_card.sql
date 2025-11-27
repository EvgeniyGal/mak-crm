-- Migration to update payment_type from 'till' to 'card' in expenditures table
-- This aligns with the requirement to have only Cash and Card payment options

-- Step 1: Drop all existing check constraints on payment_type column first
-- This must be done before updating data to avoid constraint violations
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Find all check constraints that involve payment_type
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.expenditures'::regclass
          AND contype = 'c'
          AND (
            pg_get_constraintdef(oid) LIKE '%payment_type%'
            OR conname LIKE '%payment_type%'
            OR conname = 'expenditures_payment_type_check'
          )
    LOOP
        EXECUTE 'ALTER TABLE public.expenditures DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_record.conname);
    END LOOP;
END $$;

-- Also explicitly try dropping by common constraint names
ALTER TABLE public.expenditures DROP CONSTRAINT IF EXISTS expenditures_payment_type_check;
ALTER TABLE public.expenditures DROP CONSTRAINT IF EXISTS expenditures_payment_type_check1;

-- Step 2: Now update any existing 'till' values to 'card' (no constraint blocking us)
UPDATE public.expenditures
SET payment_type = 'card'
WHERE payment_type = 'till';

-- Step 3: Add new constraint that allows only 'cash' and 'card'
ALTER TABLE public.expenditures
ADD CONSTRAINT expenditures_payment_type_check 
CHECK (payment_type IS NULL OR payment_type IN ('cash', 'card'));

