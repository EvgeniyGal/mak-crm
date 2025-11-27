-- Combine Multiple Permissive Policies for Better Performance
-- This migration combines multiple permissive policies into single policies
-- to eliminate the "Multiple Permissive Policies" warnings and improve query performance

-- Drop old separate policies
DROP POLICY IF EXISTS "Users can select their own record" ON public.users;
DROP POLICY IF EXISTS "Approved users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Owners can update users" ON public.users;

-- Create combined SELECT policy
-- Users can select their own record OR approved users can view all users
CREATE POLICY "Users can select their own record or approved users can view all" ON public.users
    FOR SELECT
    USING (
        id = (select auth.uid()) 
        OR public.is_user_approved((select auth.uid()))
    );

-- Create combined UPDATE policy
-- Users can update their own record OR owners can update all users
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

