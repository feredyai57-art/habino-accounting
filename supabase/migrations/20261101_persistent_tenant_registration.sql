BEGIN;

DO $$
DECLARE
    v_tenant_id_type TEXT;
    v_user_tenant_id_type TEXT;
BEGIN
    CREATE TABLE IF NOT EXISTS public.tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        guild_type VARCHAR(50) NOT NULL DEFAULT 'technology',
        owner_email VARCHAR(255) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO v_tenant_id_type
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.tenants'::regclass
      AND attribute.attname = 'id'
      AND NOT attribute.attisdropped;

    IF v_tenant_id_type IS NULL OR v_tenant_id_type NOT IN ('uuid', 'character varying(100)', 'character varying') THEN
        RAISE EXCEPTION 'Unsupported public.tenants.id type: %', COALESCE(v_tenant_id_type, 'missing');
    END IF;

    IF to_regclass('public.tenant_users') IS NULL THEN
        EXECUTE format(
            'CREATE TABLE public.tenant_users (
                id VARCHAR(100) PRIMARY KEY,
                tenant_id %s NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                full_name VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT ''tenant_cashier'',
                permissions JSONB NOT NULL DEFAULT ''[]''::jsonb,
                status VARCHAR(50) NOT NULL DEFAULT ''active'',
                avatar_url TEXT,
                notes TEXT,
                last_login_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )',
            v_tenant_id_type
        );
    ELSE
        SELECT format_type(attribute.atttypid, attribute.atttypmod)
        INTO v_user_tenant_id_type
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.tenant_users'::regclass
          AND attribute.attname = 'tenant_id'
          AND NOT attribute.attisdropped;

        IF v_user_tenant_id_type IS DISTINCT FROM v_tenant_id_type THEN
            RAISE EXCEPTION 'public.tenant_users.tenant_id type (%) must match public.tenants.id type (%).',
                COALESCE(v_user_tenant_id_type, 'missing'),
                v_tenant_id_type;
        END IF;
    END IF;
END;
$$;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS guild_type VARCHAR(50) NOT NULL DEFAULT 'technology',
    ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.tenant_users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'tenant_cashier',
    ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenants_guild ON public.tenants (guild_type);
CREATE INDEX IF NOT EXISTS idx_tenants_metadata ON public.tenants USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON public.tenant_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_role ON public.tenant_users (role);
CREATE INDEX IF NOT EXISTS idx_tenant_users_email ON public.tenant_users (email);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants, public.tenant_users TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_register_tenant_account(
    p_tenant_id TEXT,
    p_auth_user_id UUID,
    p_business_name TEXT,
    p_slug TEXT,
    p_guild_type TEXT,
    p_owner_email TEXT,
    p_owner_name TEXT,
    p_owner_phone TEXT,
    p_guild_category TEXT,
    p_tenant_metadata JSONB,
    p_created_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant JSONB;
    v_user JSONB;
    v_tenant_id_type TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Tenant registration requires a trusted server request.';
    END IF;

    IF p_tenant_id IS NULL OR p_tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR p_auth_user_id IS NULL
       OR p_business_name IS NULL OR btrim(p_business_name) = ''
       OR p_owner_email IS NULL OR btrim(p_owner_email) = ''
       OR p_owner_name IS NULL OR btrim(p_owner_name) = ''
       OR p_guild_type IS NULL
       OR p_guild_type NOT IN ('services', 'technology', 'contracting', 'commercial') THEN
        RAISE EXCEPTION 'Tenant registration details are invalid.';
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO v_tenant_id_type
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.tenants'::regclass
      AND attribute.attname = 'id'
      AND NOT attribute.attisdropped;

    EXECUTE format(
        'INSERT INTO public.tenants (
            id, name, slug, guild_type, owner_email, owner_name, status, metadata, created_at, updated_at
        ) VALUES (
            $1::%s, $2, $3, $4, $5, $6, ''active'', $7, COALESCE($8, NOW()), NOW()
        )',
        v_tenant_id_type
    ) USING
        p_tenant_id,
        btrim(p_business_name),
        p_slug,
        p_guild_type,
        lower(btrim(p_owner_email)),
        btrim(p_owner_name),
        COALESCE(p_tenant_metadata, '{}'::jsonb) ||
            jsonb_build_object('guildCategory', p_guild_category, 'phone', p_owner_phone),
        p_created_at;

    EXECUTE format(
        'INSERT INTO public.tenant_users (
            id, tenant_id, email, phone, full_name, role, permissions, status, notes, created_at, updated_at
        ) VALUES (
            $1, $2::%s, $3, $4, $5, ''tenant_owner'', $6, ''active'', $7, COALESCE($8, NOW()), NOW()
        )',
        v_tenant_id_type
    ) USING
        p_auth_user_id::TEXT,
        p_tenant_id,
        lower(btrim(p_owner_email)),
        p_owner_phone,
        btrim(p_owner_name),
        '[
            "tenant:manage_users",
            "tenant:manage_settings",
            "tenant:manage_license",
            "accounting:access_ledger",
            "accounting:manage_invoices",
            "accounting:manage_checks",
            "accounting:manage_payroll",
            "accounting:view_reports",
            "accounting:view_profit",
            "accounting:delete_records",
            "inventory:manage_stock",
            "tax:submit_mowadian",
            "ai:use_synapse_cfo"
        ]'::jsonb,
        'مالک مستأجر؛ دوره آزمایشی ۳۰ روزه',
        p_created_at;

    SELECT to_jsonb(t) INTO v_tenant FROM public.tenants AS t WHERE t.id::TEXT = p_tenant_id;
    SELECT to_jsonb(u) INTO v_user FROM public.tenant_users AS u
    WHERE u.id = p_auth_user_id::TEXT AND u.tenant_id::TEXT = p_tenant_id;
    RETURN jsonb_build_object('tenant', v_tenant, 'user', v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_tenant_account(
    TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_tenant_account(
    TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ
) TO service_role;

DO $$
BEGIN
    IF has_function_privilege(
        'anon',
        'public.rpc_register_tenant_account(text,uuid,text,text,text,text,text,text,text,jsonb,timestamp with time zone)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'public.rpc_register_tenant_account(text,uuid,text,text,text,text,text,text,text,jsonb,timestamp with time zone)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Client roles can still execute the tenant registration RPC.';
    END IF;
    IF NOT has_function_privilege(
        'service_role',
        'public.rpc_register_tenant_account(text,uuid,text,text,text,text,text,text,text,jsonb,timestamp with time zone)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'The trusted service role cannot execute the tenant registration RPC.';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
