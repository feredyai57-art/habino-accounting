BEGIN;

DO $$
BEGIN
    IF to_regclass('public.clients') IS NULL THEN
        RAISE EXCEPTION 'Required public.clients table is missing.';
    END IF;
END;
$$;

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_blocked_for_credit BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
