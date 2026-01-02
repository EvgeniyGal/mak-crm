-- Fix RLS Performance Warnings
-- This migration optimizes RLS policies by caching auth.uid() calls
-- and ensures policies are idempotent (safe to re-run)

--------------------------------------------------
-- USERS TABLE
--------------------------------------------------

-- INSERT: Users can insert their own record
DROP POLICY IF EXISTS "Users can insert their own record" ON public.users;
CREATE POLICY "Users can insert their own record"
ON public.users
FOR INSERT
WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND id = (select auth.uid())
);

-- SELECT: Own record OR approved users can view all
DROP POLICY IF EXISTS "Users can select their own record" ON public.users;
DROP POLICY IF EXISTS "Approved users can view all users" ON public.users;
DROP POLICY IF EXISTS
"Users can select their own record or approved users can view all"
ON public.users;

CREATE POLICY "Users can select their own record or approved users can view all"
ON public.users
FOR SELECT
USING (
    id = (select auth.uid())
    OR public.is_user_approved((select auth.uid()))
);

-- UPDATE: Own record OR owners can update all
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Owners can update users" ON public.users;
DROP POLICY IF EXISTS
"Users can update their own record or owners can update all"
ON public.users;

CREATE POLICY "Users can update their own record or owners can update all"
ON public.users
FOR UPDATE
USING (
    id = (select auth.uid())
    OR public.is_user_owner((select auth.uid()))
)
WITH CHECK (
    id = (select auth.uid())
    OR public.is_user_owner((select auth.uid()))
);

-- DELETE: Owners can delete users
DROP POLICY IF EXISTS "Owners can delete users" ON public.users;
CREATE POLICY "Owners can delete users"
ON public.users
FOR DELETE
USING (
    public.is_user_owner((select auth.uid()))
);

--------------------------------------------------
-- SHARED "APPROVED USER" POLICY
--------------------------------------------------

-- STUDENTS
DROP POLICY IF EXISTS "Approved users can access all data" ON public.students;
CREATE POLICY "Approved users can access all data"
ON public.students
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- TEACHERS
DROP POLICY IF EXISTS "Approved users can access all data" ON public.teachers;
CREATE POLICY "Approved users can access all data"
ON public.teachers
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- COURSES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.courses;
CREATE POLICY "Approved users can access all data"
ON public.courses
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- ROOMS
DROP POLICY IF EXISTS "Approved users can access all data" ON public.rooms;
CREATE POLICY "Approved users can access all data"
ON public.rooms
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- SCHEDULES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.schedules;
CREATE POLICY "Approved users can access all data"
ON public.schedules
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- ATTENDANCES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.attendances;
CREATE POLICY "Approved users can access all data"
ON public.attendances
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- STUDENT_PRESENCES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.student_presences;
CREATE POLICY "Approved users can access all data"
ON public.student_presences
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- PAYMENTS
DROP POLICY IF EXISTS "Approved users can access all data" ON public.payments;
CREATE POLICY "Approved users can access all data"
ON public.payments
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- PACKAGE TYPES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.package_types;
CREATE POLICY "Approved users can access all data"
ON public.package_types
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- ADMIN TASKS
DROP POLICY IF EXISTS "Approved users can access all data" ON public.admin_tasks;
CREATE POLICY "Approved users can access all data"
ON public.admin_tasks
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- EXPENDITURES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.expenditures;
CREATE POLICY "Approved users can access all data"
ON public.expenditures
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);

-- TEACHER SALARIES
DROP POLICY IF EXISTS "Approved users can access all data" ON public.teacher_salaries;
CREATE POLICY "Approved users can access all data"
ON public.teacher_salaries
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.status = 'approved'
    )
);
