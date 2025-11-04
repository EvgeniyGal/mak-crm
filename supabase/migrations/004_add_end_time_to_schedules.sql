-- Add end_time column to schedules table
-- This allows schedules to have a time range (start_time and end_time) instead of just a single time_slot

ALTER TABLE public.schedules 
ADD COLUMN IF NOT EXISTS end_time TIME;

-- Update existing schedules: set end_time to 1 hour after time_slot by default
-- This ensures backward compatibility
UPDATE public.schedules
SET end_time = (time_slot::time + INTERVAL '1 hour')::time
WHERE end_time IS NULL;

-- Make end_time required going forward (but allow NULL for migration period)
-- After migration, we can make it NOT NULL if needed

-- Add check constraint to ensure end_time is after start_time
-- Only apply constraint if both values are not NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_end_after_start'
  ) THEN
    ALTER TABLE public.schedules
    ADD CONSTRAINT check_end_after_start 
    CHECK (end_time IS NULL OR time_slot IS NULL OR end_time > time_slot);
  END IF;
END $$;

-- Note: We keep time_slot for backward compatibility but will rename it to start_time in the application layer
-- For now, time_slot will serve as start_time

