BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.rpc_factory_reset_tenant(text,boolean,boolean)') IS NULL THEN
        RAISE EXCEPTION 'Required public.rpc_factory_reset_tenant function is missing.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
    TO service_role;

DO $$
BEGIN
    IF has_function_privilege(
        'anon',
        'public.rpc_factory_reset_tenant(text,boolean,boolean)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'public.rpc_factory_reset_tenant(text,boolean,boolean)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Client roles can still execute the tenant factory reset RPC.';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'public.rpc_factory_reset_tenant(text,boolean,boolean)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'The trusted service role cannot execute the tenant factory reset RPC.';
    END IF;
END;
$$;

COMMIT;
