-- Migration to add new expenditure types
-- Adds: utilities, rent, office, repair, classes, other

-- Step 1: Drop the existing check constraint
ALTER TABLE public.expenditures 
DROP CONSTRAINT IF EXISTS expenditures_type_check;

-- Step 2: Add new constraint with all allowed types
ALTER TABLE public.expenditures
ADD CONSTRAINT expenditures_type_check 
CHECK (type IN ('regular', 'staff', 'till', 'utilities', 'rent', 'office', 'repair', 'classes', 'other'));

