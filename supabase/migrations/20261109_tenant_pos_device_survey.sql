BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_pos_device_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    created_by UUID NOT NULL DEFAULT auth.uid(),
    payment_provider TEXT NOT NULL CHECK (length(trim(payment_provider)) BETWEEN 1 AND 120),
    device_brand TEXT CHECK (device_brand IS NULL OR length(device_brand) <= 120),
    device_model TEXT NOT NULL CHECK (length(trim(device_model)) BETWEEN 1 AND 120),
    terminal_type TEXT NOT NULL CHECK (terminal_type IN ('traditional', 'android_smart', 'other', 'unknown')),
    connection_info TEXT NOT NULL CHECK (connection_info IN ('api_sdk', 'local_driver', 'no_api', 'unknown')),
    device_count INTEGER NOT NULL CHECK (device_count BETWEEN 1 AND 100),
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 1200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_pos_device_surveys_tenant_created
    ON public.tenant_pos_device_surveys (tenant_id, created_at DESC);

ALTER TABLE public.tenant_pos_device_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pos_device_surveys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_pos_device_surveys_select ON public.tenant_pos_device_surveys;
DROP POLICY IF EXISTS tenant_pos_device_surveys_insert ON public.tenant_pos_device_surveys;

CREATE POLICY tenant_pos_device_surveys_select
    ON public.tenant_pos_device_surveys FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

CREATE POLICY tenant_pos_device_surveys_insert
    ON public.tenant_pos_device_surveys FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND created_by = auth.uid()
        AND auth.jwt() -> 'app_metadata' ->> 'role' NOT IN ('super_admin', 'hubino_support')
    );

REVOKE ALL ON TABLE public.tenant_pos_device_surveys FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.tenant_pos_device_surveys TO authenticated;

COMMIT;
