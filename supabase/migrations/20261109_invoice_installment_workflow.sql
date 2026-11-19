DO $$
BEGIN
  IF to_regclass('public.installments') IS NULL THEN
    RAISE EXCEPTION 'Required table public.installments is missing; apply the core schema migration first.';
  END IF;
END;
$$;

ALTER TABLE IF EXISTS public.installments
  ADD COLUMN IF NOT EXISTS principal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_principal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_interest_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_service_fee_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_installments integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS plan_approved_by text,
  ADD COLUMN IF NOT EXISTS plan_approved_at timestamptz;

UPDATE public.installments
SET principal_amount = amount,
    paid_amount = CASE WHEN status = 'paid' THEN amount ELSE paid_amount END,
paid_principal_amount = CASE WHEN status = 'paid' THEN amount ELSE paid_principal_amount END
WHERE principal_amount = 0
  AND interest_amount = 0
  AND service_fee_amount = 0;

UPDATE public.installments AS installment
SET total_installments = counts.installment_count
FROM (
  SELECT invoice_id, tenant_id, COUNT(*)::integer AS installment_count
  FROM public.installments
  GROUP BY invoice_id, tenant_id
) AS counts
WHERE installment.invoice_id = counts.invoice_id
  AND installment.tenant_id IS NOT DISTINCT FROM counts.tenant_id
  AND installment.total_installments = 1
  AND counts.installment_count > 1;

ALTER TABLE IF EXISTS public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'bank';

ALTER TABLE IF EXISTS public.transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.checks
  ADD COLUMN IF NOT EXISTS related_installment_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
