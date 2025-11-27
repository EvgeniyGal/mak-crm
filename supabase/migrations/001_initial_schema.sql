-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    middle_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'owner')),
    phone TEXT,
    email TEXT NOT NULL,
    day_of_birth DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'fired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_first_name TEXT NOT NULL,
    student_last_name TEXT NOT NULL,
    student_date_of_birth DATE NOT NULL,
    parent_first_name TEXT NOT NULL,
    parent_middle_name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'moved', 'don''t disturb')),
    comment TEXT,
    enrolled_class_ids UUID[] DEFAULT ARRAY[]::UUID[],
    interested_class_ids UUID[] DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teachers table
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    middle_name TEXT,
    date_of_birth DATE,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'probational', 'fired')),
    comment TEXT,
    assigned_class_ids UUID[] DEFAULT ARRAY[]::UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes table
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    teachers_ids UUID[] DEFAULT ARRAY[]::UUID[],
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    schedule_ids UUID[] DEFAULT ARRAY[]::UUID[],
    student_ids UUID[] DEFAULT ARRAY[]::UUID[],
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedules table
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    time_slot TIME NOT NULL,
    week_day INTEGER NOT NULL CHECK (week_day >= 0 AND week_day <= 6), -- 0 = Sunday, 6 = Saturday
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Package Types table
CREATE TABLE IF NOT EXISTS public.package_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    lesson_count INTEGER NOT NULL CHECK (lesson_count > 0),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendances table
CREATE TABLE IF NOT EXISTS public.attendances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, class_id)
);

-- Student Presences table
CREATE TABLE IF NOT EXISTS public.student_presences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'absent with valid reason')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, attendance_id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    package_type_id UUID NOT NULL REFERENCES public.package_types(id) ON DELETE RESTRICT,
    student_presence_ids UUID[] DEFAULT ARRAY[]::UUID[],
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
    type TEXT NOT NULL CHECK (type IN ('cash', 'card', 'test')),
    available_lesson_count INTEGER NOT NULL DEFAULT 0 CHECK (available_lesson_count >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Tasks table
CREATE TABLE IF NOT EXISTS public.admin_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('first lesson', 'absent', 'admin', 'birthday')),
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenditures table
CREATE TABLE IF NOT EXISTS public.expenditures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('regular', 'staff', 'till')),
    person TEXT,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teacher Salaries table
CREATE TABLE IF NOT EXISTS public.teacher_salaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_students_enrolled_class_ids ON public.students USING GIN(enrolled_class_ids);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON public.attendances(date);
CREATE INDEX IF NOT EXISTS idx_attendances_class_id ON public.attendances(class_id);
CREATE INDEX IF NOT EXISTS idx_student_presences_student_id ON public.student_presences(student_id);
CREATE INDEX IF NOT EXISTS idx_student_presences_attendance_id ON public.student_presences(attendance_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_class_id ON public.payments(class_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendances_updated_at BEFORE UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_presences_updated_at BEFORE UPDATE ON public.student_presences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_tasks_updated_at BEFORE UPDATE ON public.admin_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenditures_updated_at BEFORE UPDATE ON public.expenditures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teacher_salaries_updated_at BEFORE UPDATE ON public.teacher_salaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_package_types_updated_at BEFORE UPDATE ON public.package_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenditures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_salaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users - only approved users can access
CREATE POLICY "Approved users can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Owners can manage users" ON public.users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.role = 'owner' AND u.status = 'approved'
        )
    );

-- RLS Policies for other tables - only approved users can access
CREATE POLICY "Approved users can access all data" ON public.students
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.teachers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.classes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.rooms
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.schedules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.attendances
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.student_presences
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.package_types
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.admin_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.expenditures
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

CREATE POLICY "Approved users can access all data" ON public.teacher_salaries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

