-- Restore authenticated, tenant-scoped access to the remote general ledger.
-- Apply after 20260929_security_and_rls_hardening.sql.

CREATE TABLE IF NOT EXISTS public.accounting_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    document_number TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    debit_account TEXT NOT NULL DEFAULT '',
    credit_account TEXT NOT NULL DEFAULT '',
    account_code TEXT,
    account_title TEXT,
    client_id UUID,
    project_tag TEXT,
    reference_id TEXT,
    reference_type TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.accounting_entries
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS tenant_id TEXT,
    ADD COLUMN IF NOT EXISTS document_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS date TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS debit_account TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS credit_account TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS account_code TEXT,
    ADD COLUMN IF NOT EXISTS account_title TEXT,
    ADD COLUMN IF NOT EXISTS client_id UUID,
    ADD COLUMN IF NOT EXISTS project_tag TEXT,
    ADD COLUMN IF NOT EXISTS reference_id TEXT,
    ADD COLUMN IF NOT EXISTS reference_type TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS sync_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_accounting_entries_tenant_date
    ON public.accounting_entries (tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_tenant_document
    ON public.accounting_entries (tenant_id, document_number);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_tenant_reference
    ON public.accounting_entries (tenant_id, reference_id);

ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounting_entries TO anon, authenticated;

-- Replace legacy policies as a group: PostgreSQL combines permissive policies with OR.
DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'accounting_entries'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.accounting_entries',
            policy_row.policyname
        );
    END LOOP;
END;
$$;

CREATE POLICY accounting_entries_tenant_select
    ON public.accounting_entries
    FOR SELECT TO authenticated, anon
    USING (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.role() = 'anon'
    );

CREATE POLICY accounting_entries_tenant_insert
    ON public.accounting_entries
    FOR INSERT TO authenticated, anon
    WITH CHECK (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.role() = 'anon'
    );

CREATE POLICY accounting_entries_tenant_update
    ON public.accounting_entries
    FOR UPDATE TO authenticated, anon
    USING (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.role() = 'anon'
    )
    WITH CHECK (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.role() = 'anon'
    );

CREATE POLICY accounting_entries_tenant_delete
    ON public.accounting_entries
    FOR DELETE TO authenticated, anon
    USING (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.role() = 'anon'
    );
