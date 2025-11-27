-- Fix RLS Performance Warnings
-- This migration optimizes RLS policies by caching auth.uid() calls
-- to prevent re-evaluation for each row, improving query performance at scale

-- Fix users table policies
-- Policy: Users can insert their own record
DROP POLICY IF EXISTS "Users can insert their own record" ON public.users;
CREATE POLICY "Users can insert their own record" ON public.users
    FOR INSERT
    WITH CHECK (
        ((select auth.uid()) IS NOT NULL AND id = (select auth.uid()))
    );

-- Combined SELECT policy for better performance
-- Users can select their own record OR approved users can view all users
DROP POLICY IF EXISTS "Users can select their own record" ON public.users;
DROP POLICY IF EXISTS "Approved users can view all users" ON public.users;
CREATE POLICY "Users can select their own record or approved users can view all" ON public.users
    FOR SELECT
    USING (
        id = (select auth.uid()) 
        OR public.is_user_approved((select auth.uid()))
    );

-- Combined UPDATE policy for better performance
-- Users can update their own record OR owners can update all users
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Owners can update users" ON public.users;
CREATE POLICY "Users can update their own record or owners can update all" ON public.users
    FOR UPDATE
    USING (
        id = (select auth.uid()) 
        OR public.is_user_owner((select auth.uid()))
    )
    WITH CHECK (
        id = (select auth.uid()) 
        OR public.is_user_owner((select auth.uid()))
    );

-- Policy: Owners can delete users
DROP POLICY IF EXISTS "Owners can delete users" ON public.users;
CREATE POLICY "Owners can delete users" ON public.users
    FOR DELETE
    USING (public.is_user_owner((select auth.uid())));

-- Fix students table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.students;
CREATE POLICY "Approved users can access all data" ON public.students
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix teachers table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.teachers;
CREATE POLICY "Approved users can access all data" ON public.teachers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix courses table policy (renamed from classes)
DROP POLICY IF EXISTS "Approved users can access all data" ON public.courses;
CREATE POLICY "Approved users can access all data" ON public.courses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix rooms table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.rooms;
CREATE POLICY "Approved users can access all data" ON public.rooms
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix schedules table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.schedules;
CREATE POLICY "Approved users can access all data" ON public.schedules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix attendances table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.attendances;
CREATE POLICY "Approved users can access all data" ON public.attendances
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix student_presences table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.student_presences;
CREATE POLICY "Approved users can access all data" ON public.student_presences
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix payments table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.payments;
CREATE POLICY "Approved users can access all data" ON public.payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix package_types table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.package_types;
CREATE POLICY "Approved users can access all data" ON public.package_types
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix admin_tasks table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.admin_tasks;
CREATE POLICY "Approved users can access all data" ON public.admin_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix expenditures table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.expenditures;
CREATE POLICY "Approved users can access all data" ON public.expenditures
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

-- Fix teacher_salaries table policy
DROP POLICY IF EXISTS "Approved users can access all data" ON public.teacher_salaries;
CREATE POLICY "Approved users can access all data" ON public.teacher_salaries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = (select auth.uid()) AND u.status = 'approved'
        )
    );

