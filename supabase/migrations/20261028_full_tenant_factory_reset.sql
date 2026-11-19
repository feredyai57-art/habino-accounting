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
BEGIN
    IF to_regprocedure('public.rpc_factory_reset_tenant_core(text,boolean,boolean)') IS NULL THEN
        ALTER FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
            RENAME TO rpc_factory_reset_tenant_core;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_factory_reset_tenant_core(TEXT, BOOLEAN, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_factory_reset_tenant_core(TEXT, BOOLEAN, BOOLEAN)
    TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_factory_reset_tenant(
    p_tenant_id TEXT,
    p_preserve_inventory BOOLEAN DEFAULT TRUE,
    p_preserve_clients BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
    v_table TEXT;
    v_column RECORD;
    v_deleted_count BIGINT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Factory reset requires a trusted server request.';
    END IF;

    v_result := public.rpc_factory_reset_tenant_core(
        p_tenant_id,
        p_preserve_inventory,
        p_preserve_clients
    );

    IF NOT p_preserve_inventory AND NOT p_preserve_clients THEN
        IF to_regclass('public.company_settings') IS NOT NULL THEN
            FOR v_column IN
                SELECT column_name, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'company_settings'
                  AND column_name NOT IN ('id', 'tenant_id', 'created_at', 'updated_at')
                ORDER BY ordinal_position
            LOOP
                IF v_column.column_default IS NOT NULL THEN
                    EXECUTE format(
                        'UPDATE public.company_settings SET %I = DEFAULT WHERE tenant_id::text = $1',
                        v_column.column_name
                    ) USING p_tenant_id;
                ELSIF v_column.is_nullable = 'YES' THEN
                    EXECUTE format(
                        'UPDATE public.company_settings SET %I = NULL WHERE tenant_id::text = $1',
                        v_column.column_name
                    ) USING p_tenant_id;
                END IF;
            END LOOP;

            UPDATE public.company_settings
            SET updated_at = NOW()
            WHERE tenant_id::text = p_tenant_id;
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            v_result := jsonb_set(
                v_result,
                '{deleted_counts,company_settings_reset}',
                to_jsonb(v_deleted_count),
                TRUE
            );
        END IF;

        FOREACH v_table IN ARRAY ARRAY[
            'platform_support_notes',
            'human_uat_results',
            'document_diagnostic_events',
            'agent_idea_proposals',
            'agent_roadmap_items',
            'agent_system_needs',
            'agent_convergence_gaps',
            'agent_event_logs',
            'agent_roadmap_ingestion_reports',
            'system_audit_events'
        ]
        LOOP
            IF to_regclass(format('public.%I', v_table)) IS NOT NULL
               AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = v_table
                      AND column_name = 'tenant_id'
               ) THEN
                EXECUTE format(
                    'DELETE FROM public.%I WHERE tenant_id::text = $1',
                    v_table
                ) USING p_tenant_id;
                GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
                v_result := jsonb_set(
                    v_result,
                    ARRAY['deleted_counts', v_table],
                    to_jsonb(v_deleted_count),
                    TRUE
                );
            END IF;
        END LOOP;

        v_result := jsonb_set(v_result, '{full_reset_cleanup}', 'true'::jsonb, TRUE);
    END IF;

    RETURN v_result;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
