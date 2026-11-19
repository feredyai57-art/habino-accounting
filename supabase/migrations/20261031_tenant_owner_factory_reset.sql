BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)') IS NULL THEN
        RAISE EXCEPTION 'Required public.rpc_factory_reset_tenant_audited function is missing.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_factory_reset_tenant_audited(
    p_tenant_id TEXT,
    p_preserve_inventory BOOLEAN,
    p_preserve_clients BOOLEAN,
    p_actor_id UUID,
    p_actor_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Factory reset requires a trusted server request.';
    END IF;

    IF p_actor_role IS NULL
       OR p_actor_role NOT IN ('super_admin', 'tenant_owner', 'server_admin')
       OR (p_actor_role = 'server_admin' AND p_actor_id IS NOT NULL)
       OR (p_actor_role IN ('super_admin', 'tenant_owner') AND p_actor_id IS NULL) THEN
        RAISE EXCEPTION 'Factory reset actor attribution is invalid.';
    END IF;

    v_result := public.rpc_factory_reset_tenant(
        p_tenant_id,
        p_preserve_inventory,
        p_preserve_clients
    );

    INSERT INTO public.system_audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        outcome,
        event_source
    ) VALUES (
        p_tenant_id,
        p_actor_id,
        p_actor_role,
        'TENANT_FACTORY_RESET',
        'tenant',
        p_tenant_id,
        'succeeded',
        'application'
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_factory_reset_tenant_audited(TEXT, BOOLEAN, BOOLEAN, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_factory_reset_tenant_audited(TEXT, BOOLEAN, BOOLEAN, UUID, TEXT)
    TO service_role;

DO $$
BEGIN
    IF has_function_privilege(
        'anon',
        'public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Client roles can still execute the tenant factory reset RPC.';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'The trusted service role cannot execute the tenant factory reset RPC.';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
