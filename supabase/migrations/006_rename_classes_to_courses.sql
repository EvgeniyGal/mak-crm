-- Rename classes table to courses
-- This migration renames the classes table and updates all related references

-- Step 1: Rename the table (PostgreSQL will automatically update foreign key constraints)
ALTER TABLE public.classes RENAME TO courses;

-- Step 2: Update RLS policies
DROP POLICY IF EXISTS "Approved users can access all data" ON public.courses;
CREATE POLICY "Approved users can access all data" ON public.courses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.status = 'approved'
        )
    );

-- Step 3: Update trigger name (if it exists)
DROP TRIGGER IF EXISTS update_classes_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Update index names
ALTER INDEX IF EXISTS idx_attendances_class_id RENAME TO idx_attendances_course_id;
ALTER INDEX IF EXISTS idx_payments_class_id RENAME TO idx_payments_course_id;

-- Note: Column names like class_id in other tables remain unchanged for now
-- to maintain backward compatibility. We can rename them in a future migration if needed.
-- The foreign key constraints will still work correctly with the renamed table.

