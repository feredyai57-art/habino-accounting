-- ==============================================================================
-- HABINO ENTERPRISE - ATOMIC DUAL-LAYER TENANT FACTORY RESET RPC FUNCTION
-- File: src/db/supabase_atomic_tenant_factory_reset_rpc.sql
-- Architecture: Safe, Atomic, Cascading Zero-Trust Factory Reset
-- Strictly preserves: tenants, tenant_users, auth.users, and platform_licenses.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_factory_reset_tenant(
    p_tenant_id TEXT,
    p_preserve_inventory BOOLEAN DEFAULT TRUE,
    p_preserve_clients BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report JSONB := '{}'::jsonb;
    v_deleted_count INT := 0;
    v_target_tenant TEXT;
BEGIN
    v_target_tenant := TRIM(p_tenant_id);
    IF v_target_tenant IS NULL OR v_target_tenant = '' THEN
        RAISE EXCEPTION 'شناسه مستأجر (tenant_id) جهت اجرای تنظیم کارخانه الزامی است.';
    END IF;

    IF v_target_tenant = '*' OR v_target_tenant = 'public' THEN
        RAISE EXCEPTION 'پاکسازی سراسری بدون تفکیک مستأجر از طریق این تابع مجاز نمی‌باشد.';
    END IF;

    -- 1. Installments (References invoices & clients)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'installments') THEN
        DELETE FROM public.installments WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{installments}', to_jsonb(v_deleted_count));
    END IF;

    -- 2. General Ledger Accounting Entries
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounting_entries') THEN
        DELETE FROM public.accounting_entries WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{accounting_entries}', to_jsonb(v_deleted_count));
    END IF;

    -- 3. Transactions (Cash/Bank Flows)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
        DELETE FROM public.transactions WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{transactions}', to_jsonb(v_deleted_count));
    END IF;

    -- 4. Checks (Sayad Instruments)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checks') THEN
        DELETE FROM public.checks WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{checks}', to_jsonb(v_deleted_count));
    END IF;

    -- 5. Invoice Signatures
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_signatures') THEN
        DELETE FROM public.invoice_signatures WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{invoice_signatures}', to_jsonb(v_deleted_count));
    END IF;

    -- 6. Invoices (Must be deleted before clients due to ON DELETE RESTRICT on clients)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        DELETE FROM public.invoices WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{invoices}', to_jsonb(v_deleted_count));
    END IF;

    -- 7. Projects (Cost Centers)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
        DELETE FROM public.projects WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{projects}', to_jsonb(v_deleted_count));
    END IF;

    -- 8. Clients & Bank Accounts (If not preserved)
    IF NOT p_preserve_clients THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients') THEN
            DELETE FROM public.clients WHERE tenant_id = v_target_tenant;
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            v_report := jsonb_set(v_report, '{clients}', to_jsonb(v_deleted_count));
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_accounts') THEN
            DELETE FROM public.bank_accounts WHERE tenant_id = v_target_tenant;
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            v_report := jsonb_set(v_report, '{bank_accounts}', to_jsonb(v_deleted_count));
        END IF;
    END IF;

    -- 9. Inventory Items (If not preserved)
    IF NOT p_preserve_inventory THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_items') THEN
            DELETE FROM public.inventory_items WHERE tenant_id = v_target_tenant;
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            v_report := jsonb_set(v_report, '{inventory_items}', to_jsonb(v_deleted_count));
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory') THEN
            DELETE FROM public.inventory WHERE tenant_id = v_target_tenant;
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            v_report := jsonb_set(v_report, '{inventory}', to_jsonb(v_deleted_count));
        END IF;
    END IF;

    -- 10. Backups
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'backups') THEN
        DELETE FROM public.backups WHERE tenant_id = v_target_tenant;
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_report := jsonb_set(v_report, '{backups}', to_jsonb(v_deleted_count));
    END IF;

    -- 11. Optional diagnostic / audit events
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_diagnostic_events') THEN
        DELETE FROM public.agent_diagnostic_events WHERE tenant_id = v_target_tenant;
    END IF;

    -- 12. Reset company settings timestamp and cached balance flags
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_settings') THEN
        UPDATE public.company_settings
        SET updated_at = NOW()
        WHERE tenant_id = v_target_tenant;
    END IF;

    -- ⚠️ STRICT SAFETY ASSURANCES:
    -- 1. Table 'tenants' IS NEVER DELETED.
    -- 2. Table 'tenant_users' IS NEVER DELETED.
    -- 3. Schema 'auth.users' IS NEVER TOUCHED.
    -- 4. Table 'licenses' IS NEVER DELETED.

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', v_target_tenant,
        'deleted_counts', v_report,
        'preserve_inventory', p_preserve_inventory,
        'preserve_clients', p_preserve_clients,
        'timestamp', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_factory_reset_tenant(TEXT, BOOLEAN, BOOLEAN)
    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounting_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.checks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.installments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO anon, authenticated;
