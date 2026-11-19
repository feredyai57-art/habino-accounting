CREATE TABLE IF NOT EXISTS public.human_uat_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    scenario_code TEXT NOT NULL,
    scenario_snapshot JSONB NOT NULL CHECK (jsonb_typeof(scenario_snapshot) = 'object'),
    status TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'blocked')),
    tester_name TEXT NOT NULL CHECK (length(trim(tester_name)) BETWEEN 1 AND 160),
    device_info TEXT NOT NULL CHECK (length(trim(device_info)) BETWEEN 5 AND 500),
    app_version TEXT NOT NULL CHECK (length(trim(app_version)) BETWEEN 1 AND 120),
    observed_result TEXT NOT NULL CHECK (length(trim(observed_result)) BETWEEN 1 AND 8000),
    evidence_reference TEXT CHECK (evidence_reference IS NULL OR length(evidence_reference) <= 1000),
    tester_notes TEXT CHECK (tester_notes IS NULL OR length(tester_notes) <= 8000),
    execution_duration_minutes INTEGER CHECK (execution_duration_minutes IS NULL OR execution_duration_minutes BETWEEN 0 AND 10080),
    tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL DEFAULT auth.uid(),
    CONSTRAINT human_uat_pass_requires_evidence
        CHECK (status <> 'passed' OR (evidence_reference IS NOT NULL AND length(trim(evidence_reference)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_human_uat_results_tenant_scenario_tested
    ON public.human_uat_results (tenant_id, scenario_id, tested_at DESC);

ALTER TABLE public.human_uat_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_uat_results FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "human_uat_results_tenant_select" ON public.human_uat_results;
DROP POLICY IF EXISTS "human_uat_results_tenant_insert" ON public.human_uat_results;

CREATE POLICY "human_uat_results_tenant_select"
    ON public.human_uat_results FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND (
            tenant_id = public.current_tenant_id()
            OR public.current_tenant_id() IN ('tenant-master-admin', 'all')
        )
    );

CREATE POLICY "human_uat_results_tenant_insert"
    ON public.human_uat_results FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND created_by = auth.uid()
        AND (
            tenant_id = public.current_tenant_id()
            OR public.current_tenant_id() IN ('tenant-master-admin', 'all')
        )
    );

REVOKE ALL ON TABLE public.human_uat_results FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.human_uat_results TO authenticated;
