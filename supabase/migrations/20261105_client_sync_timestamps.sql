BEGIN;

DO $$
BEGIN
    IF to_regclass('public.clients') IS NULL THEN
        RAISE EXCEPTION 'Required public.clients table is missing.';
    END IF;
END;
$$;

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
