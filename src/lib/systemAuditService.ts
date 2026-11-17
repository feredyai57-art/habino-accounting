import { getSupabaseClient, getSupabaseConfig } from './supabase';

export type SystemAuditOutcome = 'succeeded' | 'failed' | 'started' | 'observed';

export interface SystemAuditEventInput {
  action: string;
  tenantId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  correlationId?: string | null;
  outcome?: SystemAuditOutcome;
  reasonCode?: string | null;
}

export interface SystemAuditEvent {
  id: string;
  tenantId: string | null;
  actorId: string | null;
  actorRole: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  correlationId: string | null;
  outcome: SystemAuditOutcome;
  reasonCode: string | null;
  eventSource: 'application' | 'database';
  createdAt: string;
}

export async function recordSystemAuditEvent(event: SystemAuditEventInput): Promise<void> {
  const config = getSupabaseConfig();
  if (!config.isConfigured) return;

  let timeout: number | undefined;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn('[SystemAudit] Could not inspect the current authenticated session.');
      return;
    }
    const session = data.session;
    const accessToken = session?.access_token;
    if (!accessToken) return;

    const controller = new AbortController();
    timeout = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch('/api/system-audit/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...event,
        tenantId: event.tenantId ?? session.user.app_metadata?.tenant_id ?? null
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.warn(`[SystemAudit] Event submission was rejected (HTTP ${response.status}).`);
    }
  } catch {
    console.warn('[SystemAudit] Event submission failed because the audit service is unavailable.');
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

export async function listSystemAuditEvents(tenantId: string): Promise<SystemAuditEvent[]> {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    throw new Error('اتصال ابری برای گزارش ممیزی پیکربندی نشده است.');
  }

  const client = getSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw new Error(`اعتبارسنجی نشست گزارش ممیزی ناموفق بود: ${userError.message}`);
  const role = userData.user?.app_metadata?.role;
  if (!userData.user || !['super_admin', 'hubino_support'].includes(role)) {
    throw new Error('برای مشاهده گزارش ممیزی، نشست معتبر پلتفرمی لازم است.');
  }

  await recordSystemAuditEvent({
    action: 'AUDIT_LOG_READ',
    tenantId,
    resourceType: 'system_audit_events',
    outcome: 'observed'
  });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let query = client
    .from('system_audit_events')
    .select('id, tenant_id, actor_id, actor_role, action, resource_type, resource_id, correlation_id, outcome, reason_code, event_source, created_at')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(200);

  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error) throw new Error(`بارگذاری گزارش ممیزی ناموفق بود: ${error.message}`);

  return (data || []).map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    correlationId: row.correlation_id,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    eventSource: row.event_source,
    createdAt: row.created_at
  }));
}
