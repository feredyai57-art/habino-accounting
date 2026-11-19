BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_create_tenant_member(
    p_tenant_id TEXT,
    p_auth_user_id UUID,
    p_email TEXT,
    p_phone TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_permissions JSONB,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant public.tenants%ROWTYPE;
    v_member JSONB;
    v_member_count INTEGER;
    v_max_users INTEGER;
    v_plan TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Tenant member invitations require a trusted server request.';
    END IF;

    IF p_tenant_id IS NULL
       OR p_auth_user_id IS NULL
       OR p_email IS NULL
       OR p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       OR p_full_name IS NULL
       OR btrim(p_full_name) = ''
       OR p_role IS NULL
       OR p_role NOT IN ('tenant_owner', 'tenant_accountant', 'tenant_cashier', 'tenant_inventory', 'tenant_auditor')
       OR jsonb_typeof(p_permissions) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Tenant member details are invalid.';
    END IF;

    SELECT *
    INTO v_tenant
    FROM public.tenants
    WHERE id::TEXT = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND';
    END IF;
    IF v_tenant.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'TENANT_NOT_ACTIVE';
    END IF;

    v_plan := COALESCE(v_tenant.metadata #>> '{subscription,plan}', 'starter');
    v_max_users := CASE v_plan
        WHEN 'professional' THEN 5
        WHEN 'enterprise' THEN 999
        ELSE 1
    END;

    SELECT COUNT(*)
    INTO v_member_count
    FROM public.tenant_users
    WHERE tenant_id = v_tenant.id;

    IF v_member_count >= v_max_users THEN
        RAISE EXCEPTION 'TENANT_SEAT_LIMIT';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.tenant_users
        WHERE tenant_id = v_tenant.id
          AND lower(email) = lower(btrim(p_email))
    ) THEN
        RAISE EXCEPTION 'TENANT_MEMBER_EMAIL_EXISTS';
    END IF;

    INSERT INTO public.tenant_users (
        id,
        tenant_id,
        email,
        phone,
        full_name,
        role,
        permissions,
        status,
        notes,
        created_at,
        updated_at
    )
    VALUES (
        p_auth_user_id::TEXT,
        v_tenant.id,
        lower(btrim(p_email)),
        COALESCE(btrim(p_phone), ''),
        btrim(p_full_name),
        p_role,
        p_permissions,
        'active',
        NULLIF(btrim(COALESCE(p_notes, '')), ''),
        NOW(),
        NOW()
    )
    RETURNING jsonb_build_object(
        'id', id,
        'tenant_id', tenant_id,
        'email', email,
        'phone', phone,
        'full_name', full_name,
        'role', role,
        'permissions', permissions,
        'status', status,
        'notes', notes,
        'created_at', created_at
    )
    INTO v_member;

    RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_tenant_member(
    TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_tenant_member(
    TEXT, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT
) TO service_role;

DO $$
BEGIN
    IF has_function_privilege(
        'anon',
        'public.rpc_create_tenant_member(text,uuid,text,text,text,text,jsonb,text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'public.rpc_create_tenant_member(text,uuid,text,text,text,text,jsonb,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Client roles can still execute the tenant member invitation RPC.';
    END IF;
    IF NOT has_function_privilege(
        'service_role',
        'public.rpc_create_tenant_member(text,uuid,text,text,text,text,jsonb,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'The trusted service role cannot execute the tenant member invitation RPC.';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
