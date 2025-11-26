-- Move capacity from rooms to classes
-- This migration adds capacity to classes table and migrates existing data

-- Step 1: Add capacity column to classes table
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS capacity INTEGER;

-- Step 2: Migrate capacity from rooms to classes
-- For classes that have a room_id, copy the capacity from the room
UPDATE public.classes c
SET capacity = r.capacity
FROM public.rooms r
WHERE c.room_id = r.id
AND c.capacity IS NULL;

-- Step 3: Set a default capacity for classes without room_id (if any)
-- Use a reasonable default like 20
UPDATE public.classes
SET capacity = 20
WHERE capacity IS NULL;

-- Step 4: Make capacity NOT NULL with a default
ALTER TABLE public.classes
ALTER COLUMN capacity SET DEFAULT 20,
ALTER COLUMN capacity SET NOT NULL;

-- Step 5: Add check constraint to ensure capacity > 0
ALTER TABLE public.classes
ADD CONSTRAINT check_capacity_positive CHECK (capacity > 0);

-- Step 6: Remove capacity from rooms table
ALTER TABLE public.rooms DROP COLUMN IF EXISTS capacity;

