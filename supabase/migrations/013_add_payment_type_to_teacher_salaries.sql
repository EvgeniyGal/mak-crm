-- Migration to add payment_type column to teacher_salaries table
-- Payment type indicates how the salary was paid: cash or till

ALTER TABLE public.teacher_salaries
ADD COLUMN IF NOT EXISTS payment_type TEXT CHECK (payment_type IN ('cash', 'till'));

