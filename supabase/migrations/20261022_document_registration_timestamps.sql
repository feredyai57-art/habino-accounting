BEGIN;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.invoices
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.transactions
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE public.checks
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.checks
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE public.accounting_entries
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.accounting_entries
    ALTER COLUMN created_at SET DEFAULT NOW();

COMMIT;
