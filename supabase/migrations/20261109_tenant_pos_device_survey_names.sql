BEGIN;

ALTER TABLE public.tenant_pos_device_surveys
    ADD COLUMN IF NOT EXISTS tenant_name TEXT;

UPDATE public.tenant_pos_device_surveys AS survey
SET tenant_name = tenant.name
FROM public.tenants AS tenant
WHERE survey.tenant_name IS NULL
  AND survey.tenant_id = tenant.id::TEXT;

COMMIT;
