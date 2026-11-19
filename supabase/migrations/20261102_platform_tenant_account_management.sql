CREATE OR REPLACE FUNCTION public.rpc_update_platform_tenant_account(
    p_tenant_id TEXT,
    p_name TEXT,
    p_owner_name TEXT,
    p_owner_email TEXT,
    p_owner_phone TEXT,
    p_guild_type TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant JSONB;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR auth.jwt() -> 'app_metadata' ->> 'role' IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'super_admin role required';
    END IF;

    IF p_tenant_id IS NULL OR length(trim(p_tenant_id)) = 0
       OR p_name IS NULL OR length(trim(p_name)) = 0
       OR p_owner_name IS NULL OR length(trim(p_owner_name)) = 0
       OR p_owner_email IS NULL OR p_owner_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       OR p_guild_type IS NULL
       OR p_guild_type NOT IN ('services', 'technology', 'contracting', 'commercial')
       OR p_status IS NULL
       OR p_status NOT IN ('active', 'suspended', 'trial') THEN
        RAISE EXCEPTION 'invalid tenant account details';
    END IF;

    UPDATE public.tenants AS tenant
    SET name = trim(p_name),
        owner_name = trim(p_owner_name),
        owner_email = lower(trim(p_owner_email)),
        guild_type = p_guild_type,
        status = p_status,
        metadata = COALESCE(tenant.metadata, '{}'::jsonb) ||
            jsonb_build_object('phone', NULLIF(trim(COALESCE(p_owner_phone, '')), '')),
        updated_at = NOW()
    WHERE tenant.id::text = p_tenant_id
    RETURNING to_jsonb(tenant) INTO v_tenant;

    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'tenant not found';
    END IF;

    RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_platform_tenant_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant TEXT;
BEGIN
    IF auth.role() = 'anon' THEN
        RETURN NULL;
    END IF;

    v_tenant := COALESCE(
        NULLIF(current_setting('app.current_tenant_id', true), ''),
        NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', ''),
        NULLIF(auth.jwt() ->> 'tenant_id', ''),
        NULLIF((current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id'), '')
    );

    IF v_tenant IS NULL THEN
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.tenants AS tenant
        WHERE tenant.id::text = v_tenant
          AND tenant.status = 'suspended'
    ) THEN
        RETURN NULL;
    END IF;

    RETURN v_tenant;
END;
$$;
