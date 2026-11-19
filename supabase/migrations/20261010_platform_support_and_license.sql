CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.platform_support_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    created_by UUID NOT NULL DEFAULT auth.uid(),
    category TEXT NOT NULL CHECK (category IN ('license', 'accounting_fix', 'onboarding', 'bug_report')),
    content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 8000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_support_notes_tenant_created
    ON public.platform_support_notes (tenant_id, created_at DESC);

ALTER TABLE public.platform_support_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_support_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_support_notes_select" ON public.platform_support_notes;
DROP POLICY IF EXISTS "platform_support_notes_insert" ON public.platform_support_notes;

CREATE POLICY "platform_support_notes_select"
    ON public.platform_support_notes FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
    );

CREATE POLICY "platform_support_notes_insert"
    ON public.platform_support_notes FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND created_by = auth.uid()
        AND auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
    );

REVOKE ALL ON TABLE public.platform_support_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.platform_support_notes TO authenticated;

CREATE TABLE IF NOT EXISTS public.platform_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    license_hash TEXT NOT NULL UNIQUE,
    plan TEXT CHECK (plan IN ('starter', 'professional', 'enterprise')),
    addon_id TEXT,
    duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 90, 180, 365, 9999)),
    is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    issued_by UUID NOT NULL DEFAULT auth.uid(),
    redeemed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT platform_licenses_lifetime_expiry
        CHECK ((is_lifetime AND expires_at IS NULL) OR (NOT is_lifetime AND expires_at IS NOT NULL)),
    CONSTRAINT platform_licenses_entitlement_type
        CHECK ((addon_id IS NULL AND plan IS NOT NULL) OR (addon_id IS NOT NULL AND plan IS NULL))
);

ALTER TABLE public.platform_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_licenses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_licenses FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_issue_habino_license(
    p_tenant_id TEXT,
    p_plan TEXT,
    p_duration_days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_key TEXT;
    v_expires_at TIMESTAMPTZ;
    v_is_lifetime BOOLEAN := p_duration_days = 9999;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'super_admin role required';
    END IF;
    IF p_tenant_id IS NULL OR length(trim(p_tenant_id)) = 0
       OR p_plan IS NULL OR p_duration_days IS NULL
       OR p_plan NOT IN ('starter', 'professional', 'enterprise')
       OR p_duration_days NOT IN (30, 90, 180, 365, 9999) THEN
        RAISE EXCEPTION 'invalid license request';
    END IF;

    v_key := 'HAB-' || upper(encode(extensions.gen_random_bytes(24), 'hex'));
    IF NOT v_is_lifetime THEN
        v_expires_at := NOW() + make_interval(days => p_duration_days);
    END IF;

    INSERT INTO public.platform_licenses (
        tenant_id, license_hash, plan, duration_days, is_lifetime, expires_at
    ) VALUES (
        p_tenant_id, encode(extensions.digest(v_key, 'sha256'), 'hex'), p_plan,
        p_duration_days, v_is_lifetime, v_expires_at
    );

    RETURN jsonb_build_object(
        'serial_key', v_key,
        'expires_at', v_expires_at,
        'is_lifetime', v_is_lifetime
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_activate_habino_license(
    p_tenant_id TEXT,
    p_license_key TEXT,
    p_expected_plan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_license public.platform_licenses%ROWTYPE;
    v_tenant_claim TEXT := public.current_tenant_id();
BEGIN
    IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authenticated user required';
    END IF;
    IF p_tenant_id IS NULL OR v_tenant_claim IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'license tenant mismatch';
    END IF;

    SELECT * INTO v_license
    FROM public.platform_licenses
    WHERE license_hash = encode(extensions.digest(upper(trim(p_license_key)), 'sha256'), 'hex')
    FOR UPDATE;

    IF NOT FOUND OR v_license.tenant_id <> p_tenant_id
       OR v_license.addon_id IS NOT NULL OR v_license.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'license is invalid or revoked';
    END IF;
    IF p_expected_plan IS NOT NULL AND v_license.plan IS DISTINCT FROM p_expected_plan THEN
        RAISE EXCEPTION 'license does not match the selected plan';
    END IF;
    IF NOT v_license.is_lifetime AND v_license.expires_at <= NOW() THEN
        RAISE EXCEPTION 'license has expired';
    END IF;

    IF v_license.redeemed_at IS NULL THEN
        UPDATE public.platform_licenses
        SET redeemed_at = NOW()
        WHERE id = v_license.id;
    END IF;

    RETURN jsonb_build_object(
        'plan', v_license.plan,
        'expires_at', v_license.expires_at,
        'is_lifetime', v_license.is_lifetime
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_issue_habino_addon_license(
    p_tenant_id TEXT,
    p_addon_id TEXT,
    p_duration_days INTEGER DEFAULT 365
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_key TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'super_admin role required';
    END IF;
    IF p_tenant_id IS NULL OR length(trim(p_tenant_id)) = 0
       OR p_addon_id IS NULL OR p_duration_days IS NULL
       OR p_addon_id NOT IN (
           'addon_synapse', 'addon_payroll', 'addon_barcode_scanner', 'addon_extra_seats'
       )
       OR p_duration_days NOT IN (30, 90, 180, 365) THEN
        RAISE EXCEPTION 'invalid add-on license request';
    END IF;

    v_key := 'HAB-' || upper(encode(extensions.gen_random_bytes(24), 'hex'));
    v_expires_at := NOW() + make_interval(days => p_duration_days);
    INSERT INTO public.platform_licenses (
        tenant_id, license_hash, addon_id, duration_days, expires_at
    ) VALUES (
        p_tenant_id, encode(extensions.digest(v_key, 'sha256'), 'hex'), p_addon_id,
        p_duration_days, v_expires_at
    );

    RETURN jsonb_build_object('serial_key', v_key, 'expires_at', v_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_activate_habino_addon_license(
    p_tenant_id TEXT,
    p_addon_id TEXT,
    p_license_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_license public.platform_licenses%ROWTYPE;
BEGIN
    IF auth.role() <> 'authenticated' OR auth.uid() IS NULL
       OR public.current_tenant_id() IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'authenticated tenant user required';
    END IF;

    SELECT * INTO v_license
    FROM public.platform_licenses
    WHERE license_hash = encode(extensions.digest(upper(trim(p_license_key)), 'sha256'), 'hex')
    FOR UPDATE;

    IF NOT FOUND OR v_license.tenant_id <> p_tenant_id
       OR v_license.addon_id IS DISTINCT FROM p_addon_id
       OR v_license.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'add-on license is invalid or revoked';
    END IF;
    IF v_license.expires_at <= NOW() THEN
        RAISE EXCEPTION 'add-on license has expired';
    END IF;

    IF v_license.redeemed_at IS NULL THEN
        UPDATE public.platform_licenses
        SET redeemed_at = NOW()
        WHERE id = v_license.id;
    END IF;

    RETURN jsonb_build_object('addon_id', v_license.addon_id, 'expires_at', v_license.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_issue_habino_license(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_activate_habino_license(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_issue_habino_addon_license(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_activate_habino_addon_license(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_issue_habino_license(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_activate_habino_license(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_issue_habino_addon_license(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_activate_habino_addon_license(TEXT, TEXT, TEXT) TO authenticated;
