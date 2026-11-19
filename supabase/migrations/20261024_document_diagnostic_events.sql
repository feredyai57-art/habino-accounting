BEGIN;

CREATE TABLE IF NOT EXISTS public.document_diagnostic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL CHECK (
        length(correlation_id) BETWEEN 1 AND 64
        AND correlation_id ~ '^[A-Za-z0-9_-]+$'
    ),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'DOCUMENT_REGISTERED',
        'DOCUMENT_REGISTER_FAILED',
        'DOCUMENT_UPDATED',
        'DOCUMENT_UPDATE_FAILED',
        'DOCUMENT_RESTORED',
        'DOCUMENT_DELETED',
        'DOCUMENT_DELETE_BLOCKED',
        'DOCUMENT_SYNC_STARTED',
        'DOCUMENT_SYNCED',
        'DOCUMENT_SYNC_QUEUED',
        'DOCUMENT_SYNC_FAILED',
        'DOCUMENT_CLOUD_FETCHED',
        'DOCUMENT_CLOUD_FETCH_FAILED',
        'DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED'
    )),
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'PENDING', 'BLOCKED', 'FAILED')),
    event_source TEXT NOT NULL DEFAULT 'client' CHECK (event_source IN ('client', 'server')),
    reason_code TEXT CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z0-9_]{1,40}$'),
    record_count INTEGER CHECK (record_count IS NULL OR record_count BETWEEN 0 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_diagnostic_tenant_created
    ON public.document_diagnostic_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_diagnostic_correlation
    ON public.document_diagnostic_events (correlation_id);

ALTER TABLE public.document_diagnostic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_diagnostic_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_diagnostic_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.document_diagnostic_events TO authenticated, service_role;

DROP POLICY IF EXISTS document_diagnostic_events_select ON public.document_diagnostic_events;
CREATE POLICY document_diagnostic_events_select
    ON public.document_diagnostic_events FOR SELECT TO authenticated
    USING (
        created_at >= NOW() - INTERVAL '30 days'
        AND (
            tenant_id = public.current_tenant_id()
            OR auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
        )
    );

DROP POLICY IF EXISTS document_diagnostic_events_insert ON public.document_diagnostic_events;
CREATE POLICY document_diagnostic_events_insert
    ON public.document_diagnostic_events FOR INSERT TO authenticated
    WITH CHECK (
        event_source = 'client'
        AND tenant_id = public.current_tenant_id()
        AND created_at >= NOW() - INTERVAL '5 minutes'
        AND created_at <= NOW() + INTERVAL '1 minute'
    );

CREATE OR REPLACE FUNCTION public.prune_document_diagnostic_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.document_diagnostic_events
    WHERE created_at < NOW() - INTERVAL '30 days';
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_document_diagnostic_events() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_prune_document_diagnostic_events ON public.document_diagnostic_events;
CREATE TRIGGER trg_prune_document_diagnostic_events
    AFTER INSERT ON public.document_diagnostic_events
    FOR EACH ROW EXECUTE FUNCTION public.prune_document_diagnostic_events();

COMMIT;
