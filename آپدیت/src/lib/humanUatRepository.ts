import { getSupabaseClient, getSupabaseConfig } from './supabase';
import {
  HumanTestStatus,
  HumanUatScenario,
  INITIAL_HUMAN_UAT_SCENARIOS
} from './preLaunchAcceptanceEngine';

export type HumanUatStorageMode = 'cloud' | 'local';

export interface HumanUatLoadResult {
  scenarios: HumanUatScenario[];
  storageMode: HumanUatStorageMode;
  historyCount: number;
  recentHistory: HumanUatHistoryEntry[];
}

export interface HumanUatHistoryEntry {
  id: string;
  scenarioId: string;
  scenarioCode: string;
  status: HumanTestStatus;
  testerName: string;
  deviceInfo?: string;
  appVersion: string;
  observedResult: string;
  evidenceReference?: string;
  executionDurationMinutes?: number;
  testedAt: string;
}

export interface HumanUatResultInput {
  scenarioId: string;
  scenarioCode: string;
  scenarioSnapshot: {
    title: string;
    objective: string;
    prerequisites: string[];
    steps: string[];
    expectedResult: string;
    testerRole: string;
    importance: HumanUatScenario['importance'];
  };
  status: HumanTestStatus;
  testerName: string;
  deviceInfo: string;
  appVersion: string;
  observedResult: string;
  evidenceReference: string;
  testerNotes: string;
  executionDurationMinutes: number | null;
}

interface HumanUatResultRow {
  id?: string;
  scenario_id: string;
  scenario_code: string;
  scenario_snapshot: HumanUatResultInput['scenarioSnapshot'];
  status: HumanTestStatus;
  tester_name: string;
  device_info: string | null;
  app_version: string;
  observed_result: string;
  evidence_reference: string | null;
  tester_notes: string | null;
  execution_duration_minutes: number | null;
  tested_at: string;
}

const localStorageKey = (tenantId: string) =>
  `habino_human_uat_scenarios_v3:${encodeURIComponent(tenantId)}`;

const mergeScenarioResults = (
  rows: HumanUatResultRow[],
  base: HumanUatScenario[] = INITIAL_HUMAN_UAT_SCENARIOS
): HumanUatScenario[] => {
  const latestByScenario = new Map<string, HumanUatResultRow>();
  for (const row of rows) {
    if (!latestByScenario.has(row.scenario_id)) latestByScenario.set(row.scenario_id, row);
  }

  return base.map(scenario => {
    const result = latestByScenario.get(scenario.id);
    if (!result || result.scenario_code !== scenario.code) return scenario;
    return {
      ...scenario,
      status: result.status,
      testerName: result.tester_name,
      deviceInfo: result.device_info || undefined,
      appVersion: result.app_version,
      observedResult: result.observed_result,
      evidenceReference: result.evidence_reference || undefined,
      testerNotes: result.tester_notes || undefined,
      testedAt: result.tested_at,
      executionDurationMinutes: result.execution_duration_minutes ?? undefined
    };
  });
};

const mergeLocalScenarioResults = (
  storedScenarios: HumanUatScenario[],
  base: HumanUatScenario[] = INITIAL_HUMAN_UAT_SCENARIOS
): HumanUatScenario[] => {
  const savedById = new Map(storedScenarios.map(scenario => [scenario.id, scenario]));
  return base.map(scenario => ({
    ...scenario,
    ...(savedById.get(scenario.id) || {})
  }));
};

const localHistory = (scenarios: HumanUatScenario[]): HumanUatHistoryEntry[] =>
  scenarios
    .filter(scenario => scenario.testedAt)
    .map(scenario => ({
      id: `${scenario.id}:${scenario.testedAt}`,
      scenarioId: scenario.id,
      scenarioCode: scenario.code,
      status: scenario.status,
      testerName: scenario.testerName || '',
      deviceInfo: scenario.deviceInfo,
      appVersion: scenario.appVersion || '',
      observedResult: scenario.observedResult || '',
      evidenceReference: scenario.evidenceReference,
      executionDurationMinutes: scenario.executionDurationMinutes,
      testedAt: scenario.testedAt || ''
    }))
    .sort((a, b) => b.testedAt.localeCompare(a.testedAt));

const mapHistory = (rows: HumanUatResultRow[]): HumanUatHistoryEntry[] =>
  rows.map(row => ({
    id: row.id || `${row.scenario_id}:${row.tested_at}:${row.tester_name}`,
    scenarioId: row.scenario_id,
    scenarioCode: row.scenario_code,
    status: row.status,
    testerName: row.tester_name,
    deviceInfo: row.device_info || undefined,
    appVersion: row.app_version,
    observedResult: row.observed_result,
    evidenceReference: row.evidence_reference || undefined,
    executionDurationMinutes: row.execution_duration_minutes ?? undefined,
    testedAt: row.tested_at
  }));

export const loadLocalHumanUatScenarios = (tenantId: string): HumanUatScenario[] => {
  try {
    const stored = localStorage.getItem(localStorageKey(tenantId));
    if (!stored) return INITIAL_HUMAN_UAT_SCENARIOS;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error('Stored UAT results must be an array.');
    return mergeLocalScenarioResults(parsed as HumanUatScenario[]);
  } catch (error) {
    console.error('Failed to load local human UAT results:', error);
    return INITIAL_HUMAN_UAT_SCENARIOS;
  }
};

const saveLocalHumanUatScenarios = (tenantId: string, scenarios: HumanUatScenario[]): void => {
  try {
    localStorage.setItem(localStorageKey(tenantId), JSON.stringify(scenarios));
  } catch (error) {
    console.error('Failed to save local human UAT results:', error);
    throw new Error('ذخیره محلی نتایج آزمون انجام نشد؛ فضای مرورگر را بررسی کنید.');
  }
};

const getCloudTenantContext = async (tenantId: string) => {
  if (!getSupabaseConfig().isConfigured) return null;

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(`بازیابی نشست امن سوپابیس ناموفق بود: ${error.message}`);
  if (!data.session) return null;

  const claims = data.session.user.app_metadata || {};
  const claimedTenant = claims.tenant_id;
  if (!claimedTenant) {
    throw new Error('نشست سوپابیس فاقد شناسه مستأجر معتبر است؛ نتیجه ثبت نشد.');
  }
  if (
    claimedTenant !== tenantId &&
    claimedTenant !== 'all' &&
    claimedTenant !== 'tenant-master-admin'
  ) {
    throw new Error('مستأجر نشست با سازمان فعال یکسان نیست؛ نتیجه ثبت نشد.');
  }
  return client;
};

export const loadHumanUatResults = async (tenantId: string): Promise<HumanUatLoadResult> => {
  const client = await getCloudTenantContext(tenantId);
  if (!client) {
    const scenarios = loadLocalHumanUatScenarios(tenantId);
    return {
      scenarios,
      storageMode: 'local',
      historyCount: localHistory(scenarios).length,
      recentHistory: localHistory(scenarios)
    };
  }

  const { data, error, count } = await client
    .from('human_uat_results')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('tested_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`بارگذاری سوابق UAT از سوپابیس ناموفق بود: ${error.message}`);

  return {
    scenarios: mergeScenarioResults((data || []) as HumanUatResultRow[]),
    storageMode: 'cloud',
    historyCount: count ?? data?.length ?? 0,
    recentHistory: mapHistory((data || []) as HumanUatResultRow[]).slice(0, 50)
  };
};

export const saveHumanUatResult = async (
  tenantId: string,
  input: HumanUatResultInput
): Promise<HumanUatLoadResult> => {
  const client = await getCloudTenantContext(tenantId);
  const testedAt = new Date().toISOString();
  const resultRow: HumanUatResultRow = {
    scenario_id: input.scenarioId,
    scenario_code: input.scenarioCode,
    scenario_snapshot: input.scenarioSnapshot,
    status: input.status,
    tester_name: input.testerName.trim(),
    device_info: input.deviceInfo.trim(),
    app_version: input.appVersion.trim(),
    observed_result: input.observedResult.trim(),
    evidence_reference: input.evidenceReference.trim() || null,
    tester_notes: input.testerNotes.trim() || null,
    execution_duration_minutes: input.executionDurationMinutes,
    tested_at: testedAt
  };

  if (!client) {
    const scenarios = loadLocalHumanUatScenarios(tenantId);
    const updated = scenarios.map(scenario => scenario.id === input.scenarioId
      ? {
          ...scenario,
          status: input.status,
          testerName: resultRow.tester_name,
          deviceInfo: resultRow.device_info || undefined,
          appVersion: resultRow.app_version,
          observedResult: resultRow.observed_result,
          evidenceReference: resultRow.evidence_reference || undefined,
          testerNotes: resultRow.tester_notes || undefined,
          testedAt,
          executionDurationMinutes: resultRow.execution_duration_minutes ?? undefined
        }
      : scenario);
    saveLocalHumanUatScenarios(tenantId, updated);
    return {
      scenarios: updated,
      storageMode: 'local',
      historyCount: localHistory(updated).length,
      recentHistory: localHistory(updated)
    };
  }

  const { error } = await client.from('human_uat_results').insert({
    tenant_id: tenantId,
    scenario_id: input.scenarioId,
    scenario_code: input.scenarioCode,
    scenario_snapshot: input.scenarioSnapshot,
    status: input.status,
    tester_name: resultRow.tester_name,
    device_info: resultRow.device_info,
    app_version: resultRow.app_version,
    observed_result: resultRow.observed_result,
    evidence_reference: resultRow.evidence_reference,
    tester_notes: resultRow.tester_notes,
    execution_duration_minutes: resultRow.execution_duration_minutes
  });
  if (error) throw new Error(`ثبت سابقه UAT در سوپابیس ناموفق بود: ${error.message}`);

  const { data, error: loadError, count } = await client
    .from('human_uat_results')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('tested_at', { ascending: false })
    .limit(500);
  if (loadError) throw new Error(`ثبت انجام شد، اما بازخوانی سوابق UAT ناموفق بود: ${loadError.message}`);
  return {
    scenarios: mergeScenarioResults((data || []) as HumanUatResultRow[]),
    storageMode: 'cloud',
    historyCount: count ?? data?.length ?? 0,
    recentHistory: mapHistory((data || []) as HumanUatResultRow[]).slice(0, 50)
  };
};

export const saveLocalUatScenarioSnapshot = (
  tenantId: string,
  scenarios: HumanUatScenario[]
): void => saveLocalHumanUatScenarios(tenantId, scenarios);
