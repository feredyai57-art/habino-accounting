-- Atomically persist a check, its double-entry ledger lines, and the client balance.
-- Apply after the core schema and 20261023_atomic_invoice_ledger_schema.sql.
-- This migration does not inspect or modify a live project automatically.

DO $$
BEGIN
    IF to_regclass('public.checks') IS NULL THEN
        RAISE EXCEPTION 'Required table public.checks is missing; apply the core schema migration first.';
    END IF;
    IF to_regclass('public.clients') IS NULL THEN
        RAISE EXCEPTION 'Required table public.clients is missing; apply the core schema migration first.';
    END IF;
    IF to_regclass('public.accounting_entries') IS NULL THEN
        RAISE EXCEPTION 'Required table public.accounting_entries is missing; apply the accounting schema migration first.';
    END IF;
END;
$$;

ALTER TABLE public.checks
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.rpc_register_check_atomic(
    p_check JSONB,
    p_entries JSONB,
    p_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_check_id UUID;
    v_client_id UUID;
    v_old_client_id UUID;
    v_existing_tenant TEXT;
    v_client_tenant TEXT;
    v_caller_tenant TEXT;
    v_old_metadata JSONB;
    v_check_type TEXT;
    v_check_status TEXT;
    v_old_type TEXT;
    v_check_number TEXT;
    v_client_name TEXT;
    v_amount NUMERIC(18, 2);
    v_old_amount NUMERIC(18, 2) := 0;
    v_old_balance_delta NUMERIC(18, 2) := 0;
    v_new_balance_delta NUMERIC(18, 2);
    v_total_debit NUMERIC(18, 2) := 0;
    v_total_credit NUMERIC(18, 2) := 0;
    v_entry JSONB;
    v_entry_id UUID;
    v_upsert_affected UUID;
BEGIN
    IF p_check IS NULL OR jsonb_typeof(p_check) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_CHECK', 'error', 'اطلاعات چک معتبر نیست.');
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
            RETURN jsonb_build_object('success', false, 'errorCode', 'TENANT_MISMATCH', 'error', 'ثبت چک برای این مستأجر مجاز نیست.');
        END IF;
    ELSIF auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'UNAUTHENTICATED', 'error', 'ثبت چک نیازمند احراز هویت است.');
    END IF;

    v_check_id := COALESCE(NULLIF(p_check->>'id', '')::UUID, gen_random_uuid());
    v_check_type := COALESCE(NULLIF(p_check->>'type', ''), 'receivable');
    v_check_status := COALESCE(NULLIF(p_check->>'status', ''), 'pending');
    v_check_number := COALESCE(NULLIF(p_check->>'checkNumber', ''), v_check_id::TEXT);
    v_client_name := NULLIF(p_check->>'clientName', '');
    v_amount := COALESCE(NULLIF(p_check->>'amount', '')::NUMERIC, 0);

    IF v_check_type NOT IN ('receivable', 'payable') THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_CHECK_TYPE', 'error', 'نوع چک معتبر نیست.');
    END IF;
    IF v_check_status NOT IN ('pending', 'cleared', 'bounced', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_CHECK_STATUS', 'error', 'وضعیت چک معتبر نیست.');
    END IF;
    IF v_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'INVALID_AMOUNT', 'error', 'مبلغ چک نامعتبر است.');
    END IF;

    IF NULLIF(COALESCE(p_check->>'clientId', p_check->>'client_id'), '') IS NOT NULL
       AND COALESCE(p_check->>'clientId', p_check->>'client_id') NOT IN ('null', 'undefined') THEN
        v_client_id := COALESCE(p_check->>'clientId', p_check->>'client_id')::UUID;
    END IF;
    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'errorCode', 'RULE_1_MANDATORY_CONTACT_VIOLATION',
            'error', 'ثبت سند بدون انتخاب مخاطب مجاز نیست.'
        );
    END IF;

    IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) <> 2 THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'LEDGER_ENTRIES_REQUIRED', 'error', 'ثبت چک مالی بدون دو ردیف دفتر کل مجاز نیست.');
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

    IF v_total_debit <> v_amount
       OR v_total_credit <> v_amount
       OR v_total_debit <> v_total_credit
       OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_entries) AS line(value)
           WHERE line.value->>'accountCode' = CASE WHEN v_check_type = 'receivable' THEN '10202' ELSE '20101' END
             AND COALESCE(NULLIF(line.value->>'debit', '')::NUMERIC, 0) = v_amount
             AND COALESCE(NULLIF(line.value->>'credit', '')::NUMERIC, 0) = 0
       )
       OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_entries) AS line(value)
           WHERE line.value->>'accountCode' = CASE WHEN v_check_type = 'receivable' THEN '10201' ELSE '20102' END
             AND COALESCE(NULLIF(line.value->>'debit', '')::NUMERIC, 0) = 0
             AND COALESCE(NULLIF(line.value->>'credit', '')::NUMERIC, 0) = v_amount
       ) THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'LEDGER_UNBALANCED', 'error', 'ردیف‌های دفتر کل چک با مبلغ و نوع چک سازگار نیستند.');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(v_check_id::TEXT));

    SELECT tenant_id, client_id, type, COALESCE(amount, 0), COALESCE(metadata, '{}'::JSONB)
      INTO v_existing_tenant, v_old_client_id, v_old_type, v_old_amount, v_old_metadata
      FROM public.checks
     WHERE id = v_check_id
     FOR UPDATE;

    IF FOUND AND v_existing_tenant IS DISTINCT FROM p_tenant_id THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'TENANT_OWNERSHIP_VIOLATION', 'error', 'این چک متعلق به مستأجر دیگری است.');
    END IF;

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

    IF v_old_client_id IS NOT NULL
       AND COALESCE(v_old_metadata->>'_habinoAtomicLedgerRegistered', 'false') = 'true' THEN
        IF v_old_type = 'receivable' THEN
            v_old_balance_delta := -v_old_amount;
        ELSE
            v_old_balance_delta := v_old_amount;
        END IF;
    END IF;
    IF v_check_type = 'receivable' THEN
        v_new_balance_delta := -v_amount;
    ELSE
        v_new_balance_delta := v_amount;
    END IF;

    INSERT INTO public.checks (
        id, tenant_id, check_number, sayad_number, bank_name, branch_name,
        amount, due_date, issue_date, type, status, client_id, client_name,
        drawer_name, account_number, description, invoice_id, created_at,
        updated_at, metadata
    ) VALUES (
        v_check_id, p_tenant_id, v_check_number,
        NULLIF(p_check->>'sayadNumber', ''),
        COALESCE(NULLIF(p_check->>'bankName', ''), 'بانک'),
        NULLIF(p_check->>'branchName', ''),
        v_amount,
        COALESCE(NULLIF(p_check->>'dueDate', ''), ''),
        NULLIF(p_check->>'issueDate', ''),
        v_check_type, v_check_status, v_client_id, v_client_name,
        v_client_name, NULLIF(p_check->>'accountNumber', ''),
        COALESCE(NULLIF(p_check->>'description', ''), ''),
        NULLIF(COALESCE(p_check->>'invoiceId', p_check->>'invoice_id'), '')::UUID,
        COALESCE(NULLIF(p_check->>'created_at', '')::TIMESTAMPTZ, NOW()), NOW(),
        COALESCE(p_check->'metadata', '{}'::JSONB) || jsonb_build_object('_habinoAtomicLedgerRegistered', true)
    )
    ON CONFLICT (id) DO UPDATE SET
        check_number = EXCLUDED.check_number,
        sayad_number = EXCLUDED.sayad_number,
        bank_name = EXCLUDED.bank_name,
        branch_name = EXCLUDED.branch_name,
        amount = EXCLUDED.amount,
        due_date = EXCLUDED.due_date,
        issue_date = EXCLUDED.issue_date,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        client_id = EXCLUDED.client_id,
        client_name = EXCLUDED.client_name,
        drawer_name = EXCLUDED.drawer_name,
        account_number = EXCLUDED.account_number,
        description = EXCLUDED.description,
        invoice_id = EXCLUDED.invoice_id,
        metadata = COALESCE(checks.metadata, '{}'::JSONB) || EXCLUDED.metadata,
        updated_at = NOW()
    WHERE checks.tenant_id = p_tenant_id
    RETURNING id INTO v_upsert_affected;

    IF v_upsert_affected IS NULL THEN
        RETURN jsonb_build_object('success', false, 'errorCode', 'TENANT_OWNERSHIP_VIOLATION', 'error', 'مالکیت چک برای مستأجر جاری تأیید نشد.');
    END IF;

    IF v_old_client_id IS NOT NULL AND v_old_client_id <> v_client_id AND v_old_balance_delta <> 0 THEN
        UPDATE public.clients
           SET balance = COALESCE(balance, 0) - v_old_balance_delta,
               updated_at = NOW()
         WHERE id = v_old_client_id AND tenant_id = p_tenant_id;
    END IF;
    UPDATE public.clients
       SET balance = COALESCE(balance, 0) + v_new_balance_delta
           - CASE WHEN v_old_client_id = v_client_id THEN v_old_balance_delta ELSE 0 END,
           updated_at = NOW()
     WHERE id = v_client_id AND tenant_id = p_tenant_id;

    DELETE FROM public.accounting_entries
     WHERE reference_id = v_check_id::TEXT
       AND tenant_id = p_tenant_id;

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
            COALESCE(NULLIF(v_entry->>'documentNumber', ''), 'DOC-CHK-' || v_check_number),
            COALESCE(NULLIF(v_entry->>'date', ''), p_check->>'issueDate', ''),
            COALESCE(NULLIF(v_entry->>'description', ''), 'ثبت چک شماره ' || v_check_number),
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
            v_check_id::TEXT,
            'CHECK',
            jsonb_build_object('referenceType', 'CHECK', 'checkNumber', v_check_number),
            COALESCE(NULLIF(v_entry->>'created_at', '')::TIMESTAMPTZ, NOW()),
            NOW()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'checkId', v_check_id,
        'message', 'چک، مانده طرف‌حساب و ردیف‌های دفتر کل به‌صورت اتمیک ثبت شدند.'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'errorCode', 'DB_TRANSACTION_ROLLBACK',
        'error', 'خطا در ثبت اتمیک چک: ' || SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_check_atomic(JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_check_atomic(JSONB, JSONB, TEXT) TO authenticated, service_role;
