DO $$
BEGIN
  IF to_regclass('public.bank_accounts') IS NULL THEN
    RAISE EXCEPTION 'Required table public.bank_accounts is missing; apply the core schema migration first.';
  END IF;
  IF to_regclass('public.checks') IS NULL THEN
    RAISE EXCEPTION 'Required table public.checks is missing; apply the core schema migration first.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_payable_check_bank_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_bank_account_id uuid;
  v_bank_tenant_id text;
  v_bank_type text;
  v_bank_name text;
  v_account_code text;
  v_account_title text;
BEGIN
  IF NEW.type <> 'payable'
     AND NOT (NEW.type = 'receivable' AND NEW.status = 'cleared') THEN
    RETURN NEW;
  END IF;

  v_bank_account_id := COALESCE(
    NEW.bank_account_id,
    NULLIF(NEW.metadata->>'bankAccountId', '')::uuid
  );
  IF v_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'چک پرداختی یا چک دریافتیِ وصول‌شده باید به حساب مقصد معتبر متعلق به مستأجر متصل باشد.';
  END IF;

  SELECT tenant_id, account_type, bank_name, ledger_account_code, ledger_account_title
    INTO v_bank_tenant_id, v_bank_type, v_bank_name, v_account_code, v_account_title
    FROM public.bank_accounts
   WHERE id = v_bank_account_id;

  IF NOT FOUND
     OR v_bank_tenant_id IS DISTINCT FROM NEW.tenant_id
     OR (NEW.type = 'payable' AND COALESCE(v_bank_type, 'bank') <> 'bank')
     OR (NEW.type = 'receivable' AND COALESCE(v_bank_type, 'bank') NOT IN ('cash', 'bank'))
     OR NULLIF(btrim(v_account_code), '') IS NULL THEN
    RAISE EXCEPTION 'حساب مقصد چک معتبر نیست، به مستأجر جاری تعلق ندارد یا به دفتر کل متصل نشده است.';
  END IF;

  NEW.bank_account_id := v_bank_account_id;
  IF NEW.type = 'payable' THEN
    NEW.bank_name := v_bank_name;
  END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'bankAccountId', v_bank_account_id,
    'bankAccountCode', v_account_code,
    'bankAccountTitle', COALESCE(NULLIF(v_account_title, ''), v_bank_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checks_require_bank_account_for_payable
  ON public.checks;

CREATE TRIGGER checks_require_bank_account_for_payable
BEFORE INSERT OR UPDATE OF type, status, bank_account_id, tenant_id, metadata
ON public.checks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payable_check_bank_account();
