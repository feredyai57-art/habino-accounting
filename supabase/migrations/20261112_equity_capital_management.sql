BEGIN;

CREATE TABLE IF NOT EXISTS public.equity_company_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL UNIQUE,
    legal_form TEXT NOT NULL CHECK (legal_form IN ('joint_stock', 'limited_liability', 'general_partnership', 'other')),
    registered_capital NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (registered_capital >= 0),
    authorized_shares BIGINT CHECK (authorized_shares IS NULL OR authorized_shares > 0),
    issued_shares BIGINT CHECK (issued_shares IS NULL OR issued_shares > 0),
    nominal_share_value NUMERIC(20, 2) CHECK (nominal_share_value IS NULL OR nominal_share_value > 0),
    currency TEXT NOT NULL DEFAULT 'IRT',
    effective_date DATE NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID DEFAULT auth.uid(),
    CONSTRAINT equity_company_profiles_share_bounds_check
        CHECK (issued_shares IS NULL OR authorized_shares IS NULL OR issued_shares <= authorized_shares),
    CONSTRAINT equity_company_profiles_share_capital_check
        CHECK (
            legal_form <> 'joint_stock'
            OR (authorized_shares IS NOT NULL AND issued_shares IS NOT NULL AND nominal_share_value IS NOT NULL)
        ),
    CONSTRAINT equity_company_profiles_registered_amount_check
        CHECK (
            legal_form <> 'joint_stock'
            OR registered_capital = issued_shares * nominal_share_value
        )
);

CREATE TABLE IF NOT EXISTS public.equity_ownership_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    owner_tafsili_code TEXT NOT NULL,
    owner_name TEXT NOT NULL CHECK (length(trim(owner_name)) > 0),
    effective_date DATE NOT NULL,
    share_count BIGINT CHECK (share_count IS NULL OR share_count >= 0),
    ownership_percent NUMERIC(9, 6) NOT NULL CHECK (ownership_percent BETWEEN 0 AND 100),
    committed_capital NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (committed_capital >= 0),
    paid_capital NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (paid_capital >= 0 AND paid_capital <= committed_capital),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID DEFAULT auth.uid(),
    UNIQUE (tenant_id, owner_tafsili_code, effective_date)
);

CREATE TABLE IF NOT EXISTS public.equity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'opening', 'partner_admission', 'partner_exit', 'share_transfer',
        'capital_increase', 'capital_decrease', 'profit_appropriation',
        'dividend_declaration', 'dividend_payment', 'owner_current_account'
    )),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'voided')),
    effective_date DATE NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    journal_document_number TEXT,
    approval_reference TEXT,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID DEFAULT auth.uid(),
    UNIQUE (id, tenant_id),
    CHECK (status NOT IN ('approved', 'posted') OR approval_reference IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.fixed_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    asset_tag TEXT NOT NULL CHECK (length(trim(asset_tag)) BETWEEN 1 AND 80),
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    asset_class TEXT NOT NULL CHECK (asset_class IN ('land', 'building', 'machinery', 'equipment', 'furniture', 'vehicle', 'other')),
    account_code TEXT NOT NULL CHECK (account_code IN ('20601', '20602', '20603', '20604', '20605')),
    acquisition_date DATE NOT NULL,
    in_service_date DATE NOT NULL,
    gross_cost NUMERIC(20, 2) NOT NULL CHECK (gross_cost > 0),
    accumulated_depreciation NUMERIC(20, 2) NOT NULL DEFAULT 0
        CHECK (accumulated_depreciation >= 0 AND accumulated_depreciation <= gross_cost),
    residual_value NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (residual_value >= 0 AND residual_value <= gross_cost),
    useful_life_months INTEGER CHECK (useful_life_months IS NULL OR useful_life_months > 0),
    depreciation_method TEXT NOT NULL CHECK (depreciation_method IN ('none', 'straight_line', 'declining_balance', 'units_of_production')),
    valuation_reference TEXT NOT NULL CHECK (length(trim(valuation_reference)) BETWEEN 1 AND 300),
    journal_document_number TEXT NOT NULL CHECK (journal_document_number LIKE 'DOC-OPN-%'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed')),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID DEFAULT auth.uid(),
    UNIQUE (tenant_id, asset_tag),
    CHECK (accumulated_depreciation <= gross_cost - residual_value),
    CHECK (asset_class <> 'land' OR depreciation_method = 'none')
);

CREATE INDEX IF NOT EXISTS idx_equity_ownership_tenant_effective
    ON public.equity_ownership_positions (tenant_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_equity_events_tenant_effective
    ON public.equity_events (tenant_id, effective_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equity_events_tenant_status
    ON public.equity_events (tenant_id, status, event_type);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_status
    ON public.fixed_assets (tenant_id, status, asset_tag);

ALTER TABLE public.equity_company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_company_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.equity_ownership_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_ownership_positions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.equity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equity_company_profiles_tenant_access ON public.equity_company_profiles;
DROP POLICY IF EXISTS equity_company_profiles_select ON public.equity_company_profiles;
DROP POLICY IF EXISTS equity_company_profiles_insert ON public.equity_company_profiles;
DROP POLICY IF EXISTS equity_company_profiles_update ON public.equity_company_profiles;
CREATE POLICY equity_company_profiles_select
    ON public.equity_company_profiles FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );
CREATE POLICY equity_company_profiles_insert
    ON public.equity_company_profiles FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );
CREATE POLICY equity_company_profiles_update
    ON public.equity_company_profiles FOR UPDATE TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

DROP POLICY IF EXISTS equity_ownership_positions_tenant_access ON public.equity_ownership_positions;
DROP POLICY IF EXISTS equity_ownership_positions_select ON public.equity_ownership_positions;
DROP POLICY IF EXISTS equity_ownership_positions_insert ON public.equity_ownership_positions;
DROP POLICY IF EXISTS equity_ownership_positions_update ON public.equity_ownership_positions;
CREATE POLICY equity_ownership_positions_select
    ON public.equity_ownership_positions FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );
CREATE POLICY equity_ownership_positions_insert
    ON public.equity_ownership_positions FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );
CREATE POLICY equity_ownership_positions_update
    ON public.equity_ownership_positions FOR UPDATE TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

DROP POLICY IF EXISTS equity_events_tenant_access ON public.equity_events;
DROP POLICY IF EXISTS equity_events_select ON public.equity_events;
DROP POLICY IF EXISTS equity_events_insert ON public.equity_events;
DROP POLICY IF EXISTS equity_events_update ON public.equity_events;
CREATE POLICY equity_events_select
    ON public.equity_events FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

CREATE POLICY equity_events_insert
    ON public.equity_events FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

CREATE POLICY equity_events_update
    ON public.equity_events FOR UPDATE TO authenticated
    USING (
        (tenant_id = public.current_tenant_id() AND status NOT IN ('posted', 'voided'))
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

DROP POLICY IF EXISTS fixed_assets_select ON public.fixed_assets;
DROP POLICY IF EXISTS fixed_assets_insert ON public.fixed_assets;
DROP POLICY IF EXISTS fixed_assets_update ON public.fixed_assets;
CREATE POLICY fixed_assets_select
    ON public.fixed_assets FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );
CREATE POLICY fixed_assets_insert
    ON public.fixed_assets FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );
CREATE POLICY fixed_assets_update
    ON public.fixed_assets FOR UPDATE TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    )
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
    );

GRANT SELECT, INSERT, UPDATE ON public.equity_company_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.equity_ownership_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.equity_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fixed_assets TO authenticated;

COMMIT;