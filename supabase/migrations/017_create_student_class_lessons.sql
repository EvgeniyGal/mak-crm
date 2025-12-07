-- Create student_class_lessons table
-- This table tracks the number of lessons available for each student-class combination
-- Records are created when a student first enrolls in a course with initial value 0
CREATE TABLE IF NOT EXISTS public.student_class_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    lesson_count INTEGER NOT NULL DEFAULT 0 CHECK (lesson_count >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, class_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_student_class_lessons_student_class ON public.student_class_lessons(student_id, class_id);

-- Enable RLS
ALTER TABLE public.student_class_lessons ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read
CREATE POLICY "Allow authenticated users to read student_class_lessons"
    ON public.student_class_lessons
    FOR SELECT
    TO authenticated
    USING (true);

-- Create policy to allow authenticated users to insert
CREATE POLICY "Allow authenticated users to insert student_class_lessons"
    ON public.student_class_lessons
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Create policy to allow authenticated users to update
CREATE POLICY "Allow authenticated users to update student_class_lessons"
    ON public.student_class_lessons
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create policy to allow authenticated users to delete
CREATE POLICY "Allow authenticated users to delete student_class_lessons"
    ON public.student_class_lessons
    FOR DELETE
    TO authenticated
    USING (true);

