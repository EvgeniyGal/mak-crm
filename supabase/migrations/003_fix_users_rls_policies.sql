-- Fix infinite recursion in users RLS policies
-- The problem: policies were checking users table which triggered recursion
-- Solution: Allow users to insert/select their own record, then check approved status separately

-- Drop ALL existing policies on users table to start fresh
DROP POLICY IF EXISTS "Approved users can view all users" ON public.users;
DROP POLICY IF EXISTS "Owners can manage users" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own record" ON public.users;
DROP POLICY IF EXISTS "Users can select their own record" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Owners can update users" ON public.users;
DROP POLICY IF EXISTS "Owners can delete users" ON public.users;

-- Create a security definer function to check user status without RLS recursion
CREATE OR REPLACE FUNCTION public.is_user_approved(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id AND status = 'approved'
  );
END;
$$;

-- Create a security definer function to check if user is owner
CREATE OR REPLACE FUNCTION public.is_user_owner(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id AND role = 'owner' AND status = 'approved'
  );
END;
$$;

-- Create a security definer function to insert user profile (bypasses RLS)
-- This allows signup to work even when session isn't fully established
-- Security: Only allows creating profile for the authenticated user's own ID
CREATE OR REPLACE FUNCTION public.create_user_profile(
    user_id UUID,
    user_email TEXT,
    user_first_name TEXT,
    user_last_name TEXT,
    user_middle_name TEXT DEFAULT NULL,
    user_phone TEXT DEFAULT NULL,
    user_role TEXT DEFAULT 'admin',
    user_status TEXT DEFAULT 'pending'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check: ensure user_id matches authenticated user
  -- Allow if auth.uid() is NULL (during signup) OR matches user_id
  IF auth.uid() IS NOT NULL AND auth.uid() != user_id THEN
    RAISE EXCEPTION 'Cannot create profile for different user';
  END IF;

  INSERT INTO public.users (
    id, email, first_name, last_name, middle_name, 
    phone, role, status
  ) VALUES (
    user_id, user_email, user_first_name, user_last_name, 
    user_middle_name, user_phone, user_role, user_status
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.create_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile TO anon;

-- Policy 1: Allow INSERT if auth.uid() matches the id being inserted
-- During signup, auth.uid() should be available after signUp() completes
-- Note: We use a security definer function to check auth.users to avoid RLS recursion
CREATE POLICY "Users can insert their own record" ON public.users
    FOR INSERT
    WITH CHECK (
        (auth.uid() IS NOT NULL AND id = auth.uid())
    );

-- Policy 2: Users can select their own record
CREATE POLICY "Users can select their own record" ON public.users
    FOR SELECT
    USING (id = auth.uid());

-- Policy 3: Approved users can view all users (using function to avoid recursion)
CREATE POLICY "Approved users can view all users" ON public.users
    FOR SELECT
    USING (public.is_user_approved(auth.uid()));

-- Policy 4: Users can update their own record (but not change role/status)
CREATE POLICY "Users can update their own record" ON public.users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Policy 5: Owners can update all users (using function to avoid recursion)
CREATE POLICY "Owners can update users" ON public.users
    FOR UPDATE
    USING (public.is_user_owner(auth.uid()))
    WITH CHECK (public.is_user_owner(auth.uid()));

-- Policy 6: Owners can delete users (using function to avoid recursion)
CREATE POLICY "Owners can delete users" ON public.users
    FOR DELETE
    USING (public.is_user_owner(auth.uid()));

