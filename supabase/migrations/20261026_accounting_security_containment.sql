BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.rpc_factory_reset_tenant(text,boolean,boolean)') IS NULL THEN
        RAISE EXCEPTION 'Required public.rpc_factory_reset_tenant function is missing.';
    END IF;
    IF to_regclass('public.system_audit_events') IS NULL THEN
        RAISE EXCEPTION 'Required public.system_audit_events table is missing.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOR v_table IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name IN (
              'invoices',
              'accounting_entries',
              'transactions',
              'checks',
              'installments',
              'projects',
              'clients',
              'bank_accounts',
              'inventory_items',
              'inventory'
          )
    LOOP
        EXECUTE format(
            'REVOKE TRUNCATE ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
            v_table
        );
        EXECUTE format(
            'REVOKE DELETE ON TABLE public.%I FROM PUBLIC, anon',
            v_table
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_accounting_table_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF to_regclass('public.system_audit_events') IS NOT NULL THEN
        INSERT INTO public.system_audit_events (
            tenant_id,
            actor_id,
            actor_role,
            action,
            resource_type,
            outcome,
            event_source
        ) VALUES (
            NULL,
            auth.uid(),
            COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.role(), 'unknown'),
            'DB_TABLE_TRUNCATE',
            TG_TABLE_NAME,
            'succeeded',
            'database'
        );
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_accounting_table_truncate() FROM PUBLIC, anon, authenticated;

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
       OR p_actor_role NOT IN ('super_admin', 'server_admin')
       OR (p_actor_role = 'server_admin' AND p_actor_id IS NOT NULL)
       OR (p_actor_role = 'super_admin' AND p_actor_id IS NULL) THEN
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
DECLARE
    v_table TEXT;
BEGIN
    FOR v_table IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name IN (
              'invoices',
              'accounting_entries',
              'transactions',
              'checks',
              'installments',
              'projects',
              'clients',
              'bank_accounts',
              'inventory_items',
              'inventory'
          )
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_audit_accounting_table_truncate ON public.%I',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_audit_accounting_table_truncate
             BEFORE TRUNCATE ON public.%I
             FOR EACH STATEMENT EXECUTE FUNCTION public.audit_accounting_table_truncate()',
            v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    IF to_regprocedure('public.rpc_factory_reset_tenant(text,boolean,boolean)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
            FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
            TO service_role;
    END IF;

    FOR v_table IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name IN (
              'invoices',
              'accounting_entries',
              'transactions',
              'checks',
              'installments',
              'projects',
              'clients',
              'bank_accounts',
              'inventory_items',
              'inventory'
          )
    LOOP
        IF has_table_privilege('anon', format('public.%I', v_table), 'TRUNCATE') THEN
            RAISE EXCEPTION 'Anonymous TRUNCATE privilege remains on public.%.', v_table;
        END IF;
        IF has_table_privilege('anon', format('public.%I', v_table), 'DELETE') THEN
            RAISE EXCEPTION 'Anonymous DELETE privilege remains on public.%.', v_table;
        END IF;
    END LOOP;

    IF to_regprocedure('public.rpc_factory_reset_tenant(text,boolean,boolean)') IS NOT NULL
       AND (
            has_function_privilege('anon', 'public.rpc_factory_reset_tenant(text,boolean,boolean)', 'EXECUTE')
            OR has_function_privilege('authenticated', 'public.rpc_factory_reset_tenant(text,boolean,boolean)', 'EXECUTE')
       ) THEN
        RAISE EXCEPTION 'The legacy tenant reset RPC is still executable by a client role.';
    END IF;

    IF to_regprocedure('public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)') IS NOT NULL
       AND (
            has_function_privilege('anon', 'public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)', 'EXECUTE')
            OR has_function_privilege('authenticated', 'public.rpc_factory_reset_tenant_audited(text,boolean,boolean,uuid,text)', 'EXECUTE')
       ) THEN
        RAISE EXCEPTION 'The audited tenant reset RPC is still executable by a client role.';
    END IF;
END;
$$;

COMMIT;
