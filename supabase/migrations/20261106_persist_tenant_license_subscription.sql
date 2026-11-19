BEGIN;

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
    v_plan_name TEXT;
    v_max_users INTEGER;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authenticated user required';
    END IF;
    IF p_tenant_id IS NULL OR v_tenant_claim IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'active tenant claim mismatch';
    END IF;
    IF p_license_key IS NULL OR length(trim(p_license_key)) = 0 THEN
        RAISE EXCEPTION 'license key is required';
    END IF;

    SELECT * INTO v_license
    FROM public.platform_licenses
    WHERE license_hash = encode(extensions.digest(upper(trim(p_license_key)), 'sha256'), 'hex')
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license key not found';
    END IF;
    IF v_license.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'license assigned to another tenant';
    END IF;
    IF v_license.addon_id IS NOT NULL THEN
        RAISE EXCEPTION 'add-on license cannot activate a plan';
    END IF;
    IF v_license.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'license has been revoked';
    END IF;
    IF p_expected_plan IS NOT NULL AND v_license.plan IS DISTINCT FROM p_expected_plan THEN
        RAISE EXCEPTION 'license does not match the selected plan';
    END IF;
    IF NOT v_license.is_lifetime AND v_license.expires_at <= NOW() THEN
        RAISE EXCEPTION 'license has expired';
    END IF;

    v_plan_name := CASE v_license.plan
        WHEN 'starter' THEN 'پکیج پایه (اصناف خرد)'
        WHEN 'professional' THEN 'پکیج حرفه‌ای (در حال رشد)'
        WHEN 'enterprise' THEN 'پکیج کامل سازمانی (نامحدود)'
    END;
    v_max_users := CASE v_license.plan
        WHEN 'starter' THEN 1
        WHEN 'professional' THEN 5
        WHEN 'enterprise' THEN 999
    END;
    v_expires_at := COALESCE(v_license.expires_at, '9999-12-31T23:59:59.999Z'::timestamptz);

    IF v_license.redeemed_at IS NULL THEN
        UPDATE public.platform_licenses
        SET redeemed_at = NOW()
        WHERE id = v_license.id;
    END IF;

    UPDATE public.tenants
    SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{subscription}',
            (COALESCE(metadata -> 'subscription', '{}'::jsonb) - 'serialKey') ||
                jsonb_build_object(
                    'plan', v_license.plan,
                    'planNameFa', v_plan_name,
                    'status', 'active',
                    'maxUsers', v_max_users,
                    'expiresAt', v_expires_at,
                    'isLifetime', v_license.is_lifetime
                ),
            TRUE
        ),
        updated_at = NOW()
    WHERE id::TEXT = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'license tenant record not found';
    END IF;

    RETURN jsonb_build_object(
        'plan', v_license.plan,
        'expires_at', v_expires_at,
        'is_lifetime', v_license.is_lifetime
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_activate_habino_license(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_activate_habino_license(TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
