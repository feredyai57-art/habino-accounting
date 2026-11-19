BEGIN;

CREATE OR REPLACE FUNCTION public.current_platform_admin_tier()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
    SELECT CASE
        WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN NULL
        WHEN auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin' THEN 'founder'
        WHEN auth.jwt() -> 'app_metadata' ->> 'role' = 'hubino_support' THEN
            CASE
                WHEN auth.jwt() -> 'app_metadata' ->> 'admin_tier' IN ('support', 'billing', 'sre')
                    THEN auth.jwt() -> 'app_metadata' ->> 'admin_tier'
                ELSE 'support'
            END
        ELSE NULL
    END;
$function$;

REVOKE ALL ON FUNCTION public.current_platform_admin_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_platform_admin_tier() TO authenticated;

COMMIT;
