-- Remove available_lesson_count column from payments table
-- Lessons are now tracked in student_class_lessons table instead
ALTER TABLE public.payments DROP COLUMN IF EXISTS available_lesson_count;

