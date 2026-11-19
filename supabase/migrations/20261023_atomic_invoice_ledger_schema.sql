-- Habino invoice and general-ledger compatibility migration.
-- Apply after the core schema, 20260929_security_and_rls_hardening.sql, and
-- 20261011_accounting_entries_sync_rls.sql (if that migration is in use).
-- This migration is idempotent. Review and run it in the intended Supabase project;
-- it does not inspect or modify a live project automatically.

DO $$
BEGIN
    IF to_regclass('public.clients') IS NULL THEN
        RAISE EXCEPTION 'Required table public.clients is missing; apply the core schema migration first.';
    END IF;
    IF to_regclass('public.invoices') IS NULL THEN
        RAISE EXCEPTION 'Required table public.invoices is missing; apply the core schema migration first.';
    END IF;
END;
$$;

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS tenant_id TEXT,
    ADD COLUMN IF NOT EXISTS invoice_number TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'sale',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS template TEXT,
    ADD COLUMN IF NOT EXISTS date TEXT,
    ADD COLUMN IF NOT EXISTS due_date TEXT,
    ADD COLUMN IF NOT EXISTS client_id UUID,
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_discount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS total_tax NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS grand_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS terms TEXT,
    ADD COLUMN IF NOT EXISTS project_id UUID,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'template_type'
    ) THEN
        EXECUTE 'UPDATE public.invoices SET template = template_type WHERE template IS NULL';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'discount'
    ) THEN
        EXECUTE 'UPDATE public.invoices SET total_discount = discount WHERE total_discount IS NULL';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'tax'
    ) THEN
        EXECUTE 'UPDATE public.invoices SET total_tax = tax WHERE total_tax IS NULL';
    END IF;
END;
$$;

UPDATE public.invoices SET template = 'professional' WHERE template IS NULL;
UPDATE public.invoices SET total_discount = 0 WHERE total_discount IS NULL;
UPDATE public.invoices SET total_tax = 0 WHERE total_tax IS NULL;
ALTER TABLE public.invoices
    ALTER COLUMN template SET DEFAULT 'professional',
    ALTER COLUMN total_discount SET DEFAULT 0,
    ALTER COLUMN total_tax SET DEFAULT 0;

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
    client_name TEXT,
    project_tag TEXT,
    reference_id TEXT,
    reference_type TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.accounting_entries
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
    ADD COLUMN IF NOT EXISTS client_name TEXT,
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
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
    ON public.invoices (tenant_id, id);

ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.accounting_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounting_entries TO authenticated, service_role;

DO $$
DECLARE
    policy_row RECORD;
BEGIN
    FOR policy_row IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'accounting_entries'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.accounting_entries', policy_row.policyname);
    END LOOP;
END;
$$;

CREATE POLICY accounting_entries_tenant_select
    ON public.accounting_entries FOR SELECT TO authenticated
    USING (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.jwt() -> 'app_metadata' ->> 'tenant_id' IN ('all', 'tenant-master-admin')
        OR auth.jwt() ->> 'tenant_id' IN ('all', 'tenant-master-admin')
    );

CREATE POLICY accounting_entries_tenant_insert
    ON public.accounting_entries FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.jwt() -> 'app_metadata' ->> 'tenant_id' IN ('all', 'tenant-master-admin')
        OR auth.jwt() ->> 'tenant_id' IN ('all', 'tenant-master-admin')
    );

CREATE POLICY accounting_entries_tenant_update
    ON public.accounting_entries FOR UPDATE TO authenticated
    USING (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.jwt() -> 'app_metadata' ->> 'tenant_id' IN ('all', 'tenant-master-admin')
        OR auth.jwt() ->> 'tenant_id' IN ('all', 'tenant-master-admin')
    )
    WITH CHECK (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.jwt() -> 'app_metadata' ->> 'tenant_id' IN ('all', 'tenant-master-admin')
        OR auth.jwt() ->> 'tenant_id' IN ('all', 'tenant-master-admin')
    );

CREATE POLICY accounting_entries_tenant_delete
    ON public.accounting_entries FOR DELETE TO authenticated
    USING (
        tenant_id::text = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'
        OR auth.jwt() -> 'app_metadata' ->> 'tenant_id' IN ('all', 'tenant-master-admin')
        OR auth.jwt() ->> 'tenant_id' IN ('all', 'tenant-master-admin')
    );

CREATE OR REPLACE FUNCTION public.rpc_register_invoice_atomic(
    p_invoice JSONB,
    p_entries JSONB DEFAULT '[]'::jsonb,
    p_tenant_id TEXT DEFAULT 'tenant-main'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv_id UUID;
    v_client_id UUID;
    v_old_client_id UUID;
    v_existing_tenant TEXT;
    v_client_tenant TEXT;
    v_caller_tenant TEXT;
    v_inv_type TEXT;
    v_old_type TEXT;
    v_old_metadata JSONB;
    v_invoice_number TEXT;
    v_client_name TEXT;
    v_created_at TIMESTAMPTZ;
    v_grand_total NUMERIC(18, 2);
    v_remaining NUMERIC(18, 2);
    v_amount_paid NUMERIC(18, 2);
    v_old_grand_total NUMERIC(18, 2);
    v_old_remaining NUMERIC(18, 2);
    v_old_amount_paid NUMERIC(18, 2);
    v_new_balance_delta NUMERIC(18, 2) := 0;
    v_old_balance_delta NUMERIC(18, 2) := 0;
    v_total_debit NUMERIC(18, 2) := 0;
    v_total_credit NUMERIC(18, 2) := 0;
    v_entry JSONB;
    v_entry_id UUID;
    v_upsert_affected UUID;
    v_is_proforma BOOLEAN;
BEGIN
    IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_INVOICE', 'error', 'اطلاعات فاکتور معتبر نیست.');
    END IF;
    IF p_tenant_id IS NULL OR btrim(p_tenant_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_TENANT', 'error', 'شناسه مستأجر معتبر نیست.');
    END IF;

    IF auth.role() = 'authenticated' THEN
        v_caller_tenant := COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'tenant_id',
            auth.jwt() ->> 'tenant_id'
        );
        IF v_caller_tenant IS NULL THEN
            RETURN jsonb_build_object('success', false, 'errorCode', 'AUTH_TENANT_MISSING', 'error', 'شناسه مستأجر در توکن احراز هویت وجود ندارد.');
        END IF;
        IF v_caller_tenant NOT IN ('all', 'tenant-master-admin') AND v_caller_tenant <> p_tenant_id THEN
            RETURN jsonb_build_object('success', false, 'errorCode', 'TENANT_MISMATCH', 'error', 'ثبت فاکتور برای این مستأجر مجاز نیست.');
        END IF;
    ELSIF auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'UNAUTHENTICATED', 'error', 'ثبت سند نیازمند احراز هویت است.');
    END IF;

    v_inv_id := COALESCE(NULLIF(p_invoice->>'id', '')::UUID, gen_random_uuid());
    v_inv_type := COALESCE(NULLIF(p_invoice->>'type', ''), 'sale');
    v_is_proforma := v_inv_type IN ('proforma', 'proforma_sale', 'proforma_purchase', 'pre_invoice');
    v_invoice_number := COALESCE(NULLIF(p_invoice->>'invoiceNumber', ''), v_inv_id::TEXT);
    v_client_name := NULLIF(p_invoice->>'clientName', '');
    v_grand_total := COALESCE(NULLIF(p_invoice->>'grandTotal', '')::NUMERIC, 0);
    v_remaining := COALESCE(NULLIF(p_invoice->>'remainingAmount', '')::NUMERIC, 0);
    v_amount_paid := COALESCE(NULLIF(p_invoice->>'amountPaid', '')::NUMERIC, 0);
    v_created_at := COALESCE(NULLIF(p_invoice->>'created_at', '')::TIMESTAMPTZ, NOW());

    IF v_grand_total < 0 OR v_remaining < 0 OR v_amount_paid < 0 THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_AMOUNT', 'error', 'مبالغ فاکتور نمی‌توانند منفی باشند.');
    END IF;

    IF NULLIF(COALESCE(p_invoice->>'clientId', p_invoice->>'client_id'), '') IS NOT NULL
       AND COALESCE(p_invoice->>'clientId', p_invoice->>'client_id') NOT IN ('null', 'undefined') THEN
        v_client_id := COALESCE(p_invoice->>'clientId', p_invoice->>'client_id')::UUID;
    END IF;

    IF NOT v_is_proforma AND v_client_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'errorCode', 'RULE_1_MANDATORY_CONTACT_VIOLATION',
            'error', 'ثبت سند بدون انتخاب مخاطب مجاز نیست.'
        );
    END IF;

    IF NOT v_is_proforma THEN
        IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
            RETURN jsonb_build_object('success', false, 'errorCode', 'LEDGER_ENTRIES_REQUIRED', 'error', 'ثبت فاکتور مالی بدون ردیف‌های دفتر کل مجاز نیست.');
        END IF;
        FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
        LOOP
            IF NULLIF(v_entry->>'accountCode', '') IS NULL THEN
                RETURN jsonb_build_object('success', false, 'errorCode', 'MISSING_ACCOUNT_CODE', 'error', 'کد حساب در یکی از ردیف‌های دفتر کل مشخص نشده است.');
            END IF;
            IF COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0) < 0
               OR COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0) < 0 THEN
                RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_LEDGER_AMOUNT', 'error', 'مبلغ بدهکار یا بستانکار نمی‌تواند منفی باشد.');
            END IF;
            IF (COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0) = 0
                AND COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0) = 0)
               OR (COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0) > 0
                   AND COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0) > 0) THEN
                RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_LEDGER_LINE', 'error', 'هر ردیف دفتر کل باید فقط یک سمت بدهکار یا بستانکار داشته باشد.');
            END IF;
            v_total_debit := v_total_debit + COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0);
            v_total_credit := v_total_credit + COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0);
        END LOOP;
        IF v_total_debit <= 0
           OR abs(v_total_debit - v_total_credit) > 0.01
           OR abs(v_total_debit - v_grand_total) > 0.01 THEN
            RETURN jsonb_build_object('success', false, 'errorCode', 'LEDGER_UNBALANCED', 'error', 'جمع بدهکار و بستانکار دفتر کل برابر نیست.');
        END IF;
    END IF;

    SELECT tenant_id, client_id, type, metadata,
           COALESCE(grand_total, 0), COALESCE(remaining_amount, 0), COALESCE(amount_paid, 0)
      INTO v_existing_tenant, v_old_client_id, v_old_type, v_old_metadata,
           v_old_grand_total, v_old_remaining, v_old_amount_paid
      FROM public.invoices
     WHERE id = v_inv_id
     FOR UPDATE;

    IF FOUND AND v_existing_tenant IS DISTINCT FROM p_tenant_id THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'TENANT_OWNERSHIP_VIOLATION', 'error', 'این فاکتور متعلق به مستأجر دیگری است.');
    END IF;

    IF v_client_id IS NOT NULL THEN
        PERFORM 1
          FROM public.clients
         WHERE id IN (v_client_id, v_old_client_id)
         ORDER BY id
         FOR UPDATE;

        SELECT tenant_id INTO v_client_tenant
          FROM public.clients
         WHERE id = v_client_id;
        IF NOT FOUND OR v_client_tenant IS DISTINCT FROM p_tenant_id THEN
            RETURN jsonb_build_object('success', false, 'errorCode', 'CLIENT_TENANT_MISMATCH', 'error', 'طرف‌حساب وجود ندارد یا متعلق به مستأجر دیگری است.');
        END IF;
    ELSIF v_old_client_id IS NOT NULL THEN
        PERFORM 1 FROM public.clients WHERE id = v_old_client_id FOR UPDATE;
    END IF;

    IF v_old_type NOT IN ('proforma', 'proforma_sale', 'proforma_purchase', 'pre_invoice') THEN
        CASE v_old_type
            WHEN 'sale' THEN v_old_balance_delta := v_old_remaining;
            WHEN 'service' THEN v_old_balance_delta := v_old_remaining;
            WHEN 'purchase' THEN v_old_balance_delta := -v_old_remaining;
            WHEN 'sale_return' THEN
                IF COALESCE(v_old_metadata->>'returnSettlementMethod', '') = 'account'
                   OR (
                       COALESCE(v_old_metadata->>'returnSettlementMethod', '') <> 'cash'
                       AND (COALESCE(v_old_remaining, 0) > 0 OR v_old_amount_paid < v_old_grand_total)
                   ) THEN
                    v_old_balance_delta := -v_old_grand_total;
                END IF;
            WHEN 'purchase_return' THEN
                IF COALESCE(v_old_metadata->>'returnSettlementMethod', '') = 'account'
                   OR (
                       COALESCE(v_old_metadata->>'returnSettlementMethod', '') <> 'cash'
                       AND (COALESCE(v_old_remaining, 0) > 0 OR v_old_amount_paid < v_old_grand_total)
                   ) THEN
                    v_old_balance_delta := v_old_grand_total;
                END IF;
            ELSE v_old_balance_delta := 0;
        END CASE;
    END IF;

    IF NOT v_is_proforma THEN
        CASE v_inv_type
            WHEN 'sale' THEN v_new_balance_delta := v_remaining;
            WHEN 'service' THEN v_new_balance_delta := v_remaining;
            WHEN 'purchase' THEN v_new_balance_delta := -v_remaining;
            WHEN 'sale_return' THEN
                IF COALESCE(p_invoice->'metadata'->>'returnSettlementMethod', '') = 'account'
                   OR (
                       COALESCE(p_invoice->'metadata'->>'returnSettlementMethod', '') <> 'cash'
                       AND v_amount_paid < v_grand_total
                   ) THEN
                    v_new_balance_delta := -v_grand_total;
                END IF;
            WHEN 'purchase_return' THEN
                IF COALESCE(p_invoice->'metadata'->>'returnSettlementMethod', '') = 'account'
                   OR (
                       COALESCE(p_invoice->'metadata'->>'returnSettlementMethod', '') <> 'cash'
                       AND v_amount_paid < v_grand_total
                   ) THEN
                    v_new_balance_delta := v_grand_total;
                END IF;
            ELSE
                RETURN jsonb_build_object('success', false, 'errorCode', 'UNSUPPORTED_INVOICE_TYPE', 'error', 'نوع فاکتور برای ثبت مالی پشتیبانی نمی‌شود.');
        END CASE;
    END IF;

    INSERT INTO public.invoices (
        id, tenant_id, invoice_number, type, status, template, date, due_date,
        client_id, client_name, items, subtotal, total_discount, total_tax,
        grand_total, amount_paid, remaining_amount, notes, terms, project_id,
        metadata, created_at, updated_at
    ) VALUES (
        v_inv_id, p_tenant_id, v_invoice_number, v_inv_type,
        COALESCE(NULLIF(p_invoice->>'status', ''), 'pending'),
        COALESCE(NULLIF(p_invoice->>'template', ''), 'professional'),
        p_invoice->>'date', p_invoice->>'dueDate', v_client_id,
        v_client_name, COALESCE(p_invoice->'items', '[]'::jsonb),
        COALESCE(NULLIF(p_invoice->>'subtotal', '')::NUMERIC, 0),
        COALESCE(NULLIF(p_invoice->>'totalDiscount', '')::NUMERIC, 0),
        COALESCE(NULLIF(p_invoice->>'totalTax', '')::NUMERIC, 0),
        v_grand_total, v_amount_paid, v_remaining,
        p_invoice->>'notes', p_invoice->>'terms',
        NULLIF(p_invoice->>'projectId', '')::UUID,
        COALESCE(p_invoice->'metadata', '{}'::jsonb),
        v_created_at, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        template = EXCLUDED.template,
        date = EXCLUDED.date,
        due_date = EXCLUDED.due_date,
        client_id = EXCLUDED.client_id,
        client_name = EXCLUDED.client_name,
        items = EXCLUDED.items,
        subtotal = EXCLUDED.subtotal,
        total_discount = EXCLUDED.total_discount,
        total_tax = EXCLUDED.total_tax,
        grand_total = EXCLUDED.grand_total,
        amount_paid = EXCLUDED.amount_paid,
        remaining_amount = EXCLUDED.remaining_amount,
        notes = EXCLUDED.notes,
        terms = EXCLUDED.terms,
        project_id = EXCLUDED.project_id,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    WHERE invoices.tenant_id = p_tenant_id
    RETURNING id INTO v_upsert_affected;

    IF v_upsert_affected IS NULL THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'TENANT_OWNERSHIP_VIOLATION', 'error', 'مالکیت فاکتور برای مستأجر جاری تأیید نشد.');
    END IF;

    IF v_old_client_id IS NOT NULL AND v_old_balance_delta <> 0 THEN
        UPDATE public.clients
           SET balance = COALESCE(balance, 0) - v_old_balance_delta,
               updated_at = NOW()
         WHERE id = v_old_client_id AND tenant_id = p_tenant_id;
    END IF;
    IF v_client_id IS NOT NULL AND v_new_balance_delta <> 0 THEN
        UPDATE public.clients
           SET balance = COALESCE(balance, 0) + v_new_balance_delta,
               updated_at = NOW()
         WHERE id = v_client_id AND tenant_id = p_tenant_id;
    END IF;

    DELETE FROM public.accounting_entries
     WHERE reference_id = v_inv_id::TEXT
       AND tenant_id = p_tenant_id;

    IF NOT v_is_proforma THEN
        FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
        LOOP
            v_entry_id := COALESCE(NULLIF(v_entry->>'id', '')::UUID, gen_random_uuid());
            INSERT INTO public.accounting_entries (
                id, tenant_id, document_number, date, description, debit, credit,
                amount, debit_account, credit_account, account_code, account_title,
                client_id, client_name, project_tag, reference_id, reference_type,
                metadata, created_at, updated_at
            ) VALUES (
                v_entry_id, p_tenant_id,
                COALESCE(NULLIF(v_entry->>'documentNumber', ''), v_invoice_number),
                COALESCE(NULLIF(v_entry->>'date', ''), p_invoice->>'date', ''),
                COALESCE(NULLIF(v_entry->>'description', ''), 'ثبت سند فاکتور شماره ' || v_invoice_number),
                COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0),
                COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0),
                GREATEST(COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0), COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0)),
                CASE WHEN COALESCE(NULLIF(v_entry->>'debit', '')::NUMERIC, 0) > 0
                     THEN COALESCE(NULLIF(v_entry->>'accountTitle', ''), 'سایر حساب‌ها')
                     ELSE 'سایر حساب‌ها' END,
                CASE WHEN COALESCE(NULLIF(v_entry->>'credit', '')::NUMERIC, 0) > 0
                     THEN COALESCE(NULLIF(v_entry->>'accountTitle', ''), 'سایر حساب‌ها')
                     ELSE 'سایر حساب‌ها' END,
                v_entry->>'accountCode',
                NULLIF(v_entry->>'accountTitle', ''),
                COALESCE(NULLIF(v_entry->>'clientId', '')::UUID, v_client_id),
                COALESCE(NULLIF(v_entry->>'clientName', ''), v_client_name),
                NULLIF(v_entry->>'projectTag', ''),
                v_inv_id::TEXT,
                'INVOICE',
                jsonb_build_object('referenceType', 'INVOICE', 'invoiceNumber', v_invoice_number),
                COALESCE(NULLIF(v_entry->>'created_at', '')::TIMESTAMPTZ, v_created_at),
                NOW()
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invoiceId', v_inv_id,
        'message', 'فاکتور، مانده طرف‌حساب و ردیف‌های دفتر کل به‌صورت اتمیک ثبت شدند.'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'errorCode', 'DB_TRANSACTION_ROLLBACK',
        'error', 'خطا در ثبت اتمیک سند: ' || SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_invoice_atomic(JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_invoice_atomic(JSONB, JSONB, TEXT) TO authenticated, service_role;
