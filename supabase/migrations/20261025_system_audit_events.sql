BEGIN;

CREATE TABLE IF NOT EXISTS public.system_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    actor_id UUID,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action ~ '^[A-Z0-9_]{1,64}$'),
    resource_type TEXT CHECK (resource_type IS NULL OR resource_type ~ '^[a-z][a-z0-9_]{0,63}$'),
    resource_id TEXT CHECK (resource_id IS NULL OR length(resource_id) <= 128),
    correlation_id TEXT CHECK (correlation_id IS NULL OR correlation_id ~ '^[A-Za-z0-9_-]{1,64}$'),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'started', 'observed')),
    reason_code TEXT CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z0-9_]{1,40}$'),
    event_source TEXT NOT NULL CHECK (event_source IN ('application', 'database')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_tenant_created
    ON public.system_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_actor_created
    ON public.system_audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_correlation
    ON public.system_audit_events (correlation_id)
    WHERE correlation_id IS NOT NULL;

ALTER TABLE public.system_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_audit_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.system_audit_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.system_audit_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.system_audit_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.system_audit_events TO service_role;

DROP POLICY IF EXISTS system_audit_events_select ON public.system_audit_events;
CREATE POLICY system_audit_events_select
    ON public.system_audit_events FOR SELECT TO authenticated
    USING (
        tenant_id = auth.jwt() -> 'app_metadata' ->> 'tenant_id'
        OR auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
    );

DO $$
BEGIN
    IF to_regclass('public.document_diagnostic_events') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS document_diagnostic_events_select ON public.document_diagnostic_events';
        EXECUTE $policy$
            CREATE POLICY document_diagnostic_events_select
                ON public.document_diagnostic_events FOR SELECT TO authenticated
                USING (
                    created_at >= NOW() - INTERVAL '30 days'
                    AND (
                        tenant_id = auth.jwt() -> 'app_metadata' ->> 'tenant_id'
                        OR auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
                    )
                )
        $policy$;

        EXECUTE 'DROP POLICY IF EXISTS document_diagnostic_events_insert ON public.document_diagnostic_events';
        EXECUTE $policy$
            CREATE POLICY document_diagnostic_events_insert
                ON public.document_diagnostic_events FOR INSERT TO authenticated
                WITH CHECK (
                    event_source = 'client'
                    AND tenant_id = auth.jwt() -> 'app_metadata' ->> 'tenant_id'
                    AND created_at >= NOW() - INTERVAL '5 minutes'
                    AND created_at <= NOW() + INTERVAL '1 minute'
                )
        $policy$;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_system_audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row JSONB;
    v_tenant_id TEXT;
    v_resource_id TEXT;
    v_correlation_id TEXT;
    v_action TEXT;
    v_headers JSONB;
BEGIN
    IF TG_OP = 'UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
        RETURN NEW;
    END IF;

    v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    v_tenant_id := NULLIF(v_row ->> 'tenant_id', '');
    IF v_tenant_id IS NULL AND TG_TABLE_NAME = 'tenants' THEN
        v_tenant_id := NULLIF(v_row ->> 'id', '');
    END IF;
    v_resource_id := NULLIF(v_row ->> 'id', '');

    BEGIN
        v_headers := current_setting('request.headers', true)::JSONB;
        v_correlation_id := v_headers ->> 'x-correlation-id';
    EXCEPTION WHEN OTHERS THEN
        v_correlation_id := NULL;
    END;

    IF v_correlation_id !~ '^[A-Za-z0-9_-]{1,64}$' THEN
        v_correlation_id := NULL;
    END IF;

    v_action := CASE TG_OP
        WHEN 'INSERT' THEN 'DB_ROW_INSERT'
        WHEN 'UPDATE' THEN 'DB_ROW_UPDATE'
        WHEN 'DELETE' THEN 'DB_ROW_DELETE'
    END;

    INSERT INTO public.system_audit_events (
        tenant_id,
        actor_id,
        actor_role,
        action,
        resource_type,
        resource_id,
        correlation_id,
        outcome,
        event_source
    ) VALUES (
        v_tenant_id,
        auth.uid(),
        COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', auth.role(), 'unknown'),
        v_action,
        TG_TABLE_NAME,
        v_resource_id,
        v_correlation_id,
        'succeeded',
        'database'
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_system_audit_row_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOR v_table IN
        SELECT id_column.table_name
        FROM information_schema.columns AS id_column
        LEFT JOIN information_schema.columns AS tenant_column
          ON tenant_column.table_schema = id_column.table_schema
         AND tenant_column.table_name = id_column.table_name
         AND tenant_column.column_name = 'tenant_id'
        JOIN information_schema.tables AS base_table
          ON base_table.table_schema = id_column.table_schema
         AND base_table.table_name = id_column.table_name
         AND base_table.table_type = 'BASE TABLE'
        WHERE id_column.table_schema = 'public'
          AND id_column.column_name = 'id'
          AND (
              tenant_column.column_name = 'tenant_id'
              OR id_column.table_name = 'tenants'
          )
          AND id_column.table_name NOT IN (
              'system_audit_events',
              'document_diagnostic_events',
              'tenant_audit_logs'
          )
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_system_audit_row_change ON public.%I',
            v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_system_audit_row_change
             AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.capture_system_audit_row_change()',
            v_table
        );
    END LOOP;
END;
$$;

COMMIT;
