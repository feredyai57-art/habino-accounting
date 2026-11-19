-- Keep cash/bank accounts non-negative and apply payable-check clearing to the
-- bank balance atomically with the check status transition.

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

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS balance NUMERIC(18, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.prevent_negative_bank_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.balance < 0 THEN
    RAISE EXCEPTION 'موجودی صندوق یا بانک نمی‌تواند منفی شود؛ مانده را تأمین یا تراکنش را اصلاح کنید.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bank_accounts_prevent_negative_balance
  ON public.bank_accounts;

CREATE TRIGGER bank_accounts_prevent_negative_balance
  BEFORE INSERT OR UPDATE OF balance ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_negative_bank_account_balance();

CREATE OR REPLACE FUNCTION public.apply_payable_check_bank_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_bank_account_id UUID;
  v_bank_balance NUMERIC(18, 2);
  v_amount NUMERIC(18, 2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'payable' AND NEW.status = 'cleared' THEN
      RAISE EXCEPTION 'چک پرداختی باید ابتدا در وضعیت در جریان ثبت و سپس پس از کنترل موجودی پاس شود.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.type <> 'payable' OR NEW.type <> 'payable' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'cleared' THEN
    v_bank_account_id := COALESCE(
      NEW.bank_account_id,
      NULLIF(NEW.metadata->>'bankAccountId', '')::UUID
    );
    v_amount := NEW.amount;

    SELECT balance
      INTO v_bank_balance
      FROM public.bank_accounts
     WHERE id = v_bank_account_id
       AND tenant_id = NEW.tenant_id
     FOR UPDATE;

    IF NOT FOUND OR v_bank_balance < v_amount THEN
      RAISE EXCEPTION 'موجودی بانک برای پاس‌شدن این چک کافی نیست؛ وضعیت چک تغییر نکرد.'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.bank_accounts
       SET balance = balance - v_amount,
           updated_at = NOW()
     WHERE id = v_bank_account_id
       AND tenant_id = NEW.tenant_id;
  ELSIF OLD.status = 'cleared' AND NEW.status = 'bounced' THEN
    v_bank_account_id := COALESCE(
      OLD.bank_account_id,
      NULLIF(OLD.metadata->>'bankAccountId', '')::UUID
    );
    v_amount := OLD.amount;

    UPDATE public.bank_accounts
       SET balance = balance + v_amount,
           updated_at = NOW()
     WHERE id = v_bank_account_id
       AND tenant_id = OLD.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'حساب بانکی چک برای بازگرداندن وجه برگشتی یافت نشد.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checks_apply_payable_bank_balance
  ON public.checks;

CREATE TRIGGER checks_apply_payable_bank_balance
  AFTER INSERT OR UPDATE OF type, status ON public.checks
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_payable_check_bank_balance();
