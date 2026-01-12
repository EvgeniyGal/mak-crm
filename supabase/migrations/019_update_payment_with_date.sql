-- Modify the update_updated_at_column function to allow explicit updated_at values
-- If updated_at is being explicitly set to a different value, keep it instead of overriding with NOW()
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Only update updated_at to NOW() if it hasn't been explicitly changed
    -- Check if updated_at is different from OLD.updated_at (meaning it was explicitly set)
    IF (TG_OP = 'UPDATE' AND NEW.updated_at IS DISTINCT FROM OLD.updated_at) THEN
        -- updated_at was explicitly set, keep it
        RETURN NEW;
    ELSE
        -- No explicit change, use NOW()
        NEW.updated_at = NOW();
        RETURN NEW;
    END IF;
END;
$$;
