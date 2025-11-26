-- Add comment field to payments table
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS comment TEXT;

