-- Migration to rename payment type 'test' to 'free'
-- This updates both the constraint and existing data

-- First, update existing data
UPDATE public.payments
SET type = 'free'
WHERE type = 'test';

-- Drop the old constraint
ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS payments_type_check;

-- Add the new constraint with 'free' instead of 'test'
ALTER TABLE public.payments
ADD CONSTRAINT payments_type_check CHECK (type IN ('cash', 'card', 'free'));

-- Update the automated task function to use 'free' instead of 'test'
CREATE OR REPLACE FUNCTION check_first_lessons()
RETURNS void 
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    payment_record RECORD;
    attendance_exists BOOLEAN;
BEGIN
    -- Find payments with type 'free' from current week
    FOR payment_record IN
        SELECT p.id, p.student_id, p.created_at, p.class_id
        FROM payments p
        WHERE p.type = 'free'
        AND p.created_at >= date_trunc('week', CURRENT_DATE)
        AND p.created_at < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
    LOOP
        -- Check if attendance exists for this student in this class after payment
        SELECT EXISTS(
            SELECT 1
            FROM attendances a
            JOIN student_presences sp ON sp.attendance_id = a.id
            WHERE a.class_id = payment_record.class_id
            AND sp.student_id = payment_record.student_id
            AND a.date >= payment_record.created_at::date
        ) INTO attendance_exists;

        -- If no attendance, create task if not exists
        IF NOT attendance_exists THEN
            INSERT INTO admin_tasks (title, type, comment, status)
            SELECT 
                'Студент має перший урок, але не відвідав заняття',
                'first lesson',
                'Перевірте, чому студент не відвідав перший урок та коли він планує відвідати.',
                'active'
            WHERE NOT EXISTS (
                SELECT 1 FROM admin_tasks
                WHERE type = 'first lesson'
                AND status = 'active'
                AND comment LIKE '%' || (SELECT student_first_name || ' ' || student_last_name FROM students WHERE id = payment_record.student_id) || '%'
                AND created_at >= CURRENT_DATE - INTERVAL '1 day'
            );
        END IF;
    END LOOP;
END;
$$;

