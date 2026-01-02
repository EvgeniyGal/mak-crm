-- ============================================================
-- USERS TABLE — COMBINED RLS POLICIES (OPTIMIZED)
-- ============================================================

-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- DROP OLD / CONFLICTING POLICIES
-- ------------------------------------------------------------

-- Old separate policies
DROP POLICY IF EXISTS "Users can select their own record" ON public.users;
DROP POLICY IF EXISTS "Approved users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Owners can update users" ON public.users;

-- Previously created combined policies (long-name collisions)
DROP POLICY IF EXISTS "Users can select their own record or approved users can view all" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record or owners can update all" ON public.users;

-- Recommended short, stable names
DROP POLICY IF EXISTS users_select_policy ON public.users;
DROP POLICY IF EXISTS users_update_policy ON public.users;

-- ------------------------------------------------------------
-- CREATE COMBINED SELECT POLICY
-- ------------------------------------------------------------
-- Users can:
--   • select their own record
--   • OR approved users can view all users

CREATE POLICY users_select_policy
ON public.users
FOR SELECT
USING (
    id = auth.uid()
    OR public.is_user_approved(auth.uid())
);

-- ------------------------------------------------------------
-- CREATE COMBINED UPDATE POLICY
-- ------------------------------------------------------------
-- Users can:
--   • update their own record
--   • OR owners can update all users

CREATE POLICY users_update_policy
ON public.users
FOR UPDATE
USING (
    id = auth.uid()
    OR public.is_user_owner(auth.uid())
)
WITH CHECK (
    id = auth.uid()
    OR public.is_user_owner(auth.uid())
);
