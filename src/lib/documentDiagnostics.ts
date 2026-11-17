import { getSupabaseClient, getSupabaseConfig } from './supabase';
import {
  FinancialAuditEventType,
  HabinoFinancialAuditEvent,
  habinoFinancialAuditLogger
} from './errorLogger';

export type DocumentDiagnosticEventType =
  | 'DOCUMENT_REGISTERED'
  | 'DOCUMENT_REGISTER_FAILED'
  | 'DOCUMENT_UPDATED'
  | 'DOCUMENT_UPDATE_FAILED'
  | 'DOCUMENT_RESTORED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_DELETE_BLOCKED'
  | 'DOCUMENT_SYNC_STARTED'
  | 'DOCUMENT_SYNCED'
  | 'DOCUMENT_SYNC_QUEUED'
  | 'DOCUMENT_SYNC_FAILED'
  | 'DOCUMENT_CLOUD_FETCHED'
  | 'DOCUMENT_CLOUD_FETCH_FAILED'
  | 'DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED';

export interface RemoteDocumentDiagnosticEvent {
  id: string;
  tenant_id: string;
  correlation_id: string;
  event_type: DocumentDiagnosticEventType;
  status: 'SUCCESS' | 'PENDING' | 'BLOCKED' | 'FAILED';
  event_source: 'client' | 'server';
  reason_code: string | null;
  record_count: number | null;
  created_at: string;
}

export interface DocumentDiagnosticOptions {
  reasonCode?: string;
  recordCount?: number;
}

const EVENT_SUMMARIES: Record<DocumentDiagnosticEventType, string> = {
  DOCUMENT_REGISTERED: 'فاکتور در حافظه محلی ثبت شد.',
  DOCUMENT_REGISTER_FAILED: 'ثبت محلی فاکتور ناموفق بود.',
  DOCUMENT_UPDATED: 'فاکتور در حافظه محلی ویرایش شد.',
  DOCUMENT_UPDATE_FAILED: 'ویرایش محلی فاکتور ناموفق بود.',
  DOCUMENT_RESTORED: 'فاکتور بازیابی و دوباره ثبت شد.',
  DOCUMENT_DELETED: 'درخواست حذف فاکتور ثبت شد.',
  DOCUMENT_DELETE_BLOCKED: 'حذف فاکتور ثبت‌شده به‌دلیل حفاظت از آثار مالی مسدود شد.',
  DOCUMENT_SYNC_STARTED: 'ارسال فاکتور به پایگاه داده آغاز شد.',
  DOCUMENT_SYNCED: 'پایگاه داده ثبت یا به‌روزرسانی فاکتور را تأیید کرد.',
  DOCUMENT_SYNC_QUEUED: 'فاکتور برای همگام‌سازی بعدی در صف آفلاین قرار گرفت.',
  DOCUMENT_SYNC_FAILED: 'همگام‌سازی فاکتور با پایگاه داده ناموفق بود.',
  DOCUMENT_CLOUD_FETCHED: 'دریافت فاکتورها از پایگاه داده کامل شد.',
  DOCUMENT_CLOUD_FETCH_FAILED: 'دریافت فاکتورها از پایگاه داده ناموفق بود.',
  DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED: 'ارسال گزارش تشخیصی به پایگاه داده ناموفق بود؛ نسخه محلی حفظ شد.'
};

export const createDiagnosticCorrelationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const uploadDiagnosticEvent = async (
  event: HabinoFinancialAuditEvent,
  eventType: DocumentDiagnosticEventType,
  tenantId: string
): Promise<void> => {
  if (!getSupabaseConfig().isConfigured || eventType === 'DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED') return;

  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }
  if (!sessionData.session) return;

  const { error } = await client.from('document_diagnostic_events').insert({
    tenant_id: tenantId,
    correlation_id: event.correlationId,
    event_type: eventType,
    status: event.status,
    event_source: 'client',
    reason_code: event.metadata?.reasonCode || null,
    record_count: event.metadata?.recordCount ?? null,
    created_at: event.isoTime
  });

  if (error) throw error;
};

export const recordDocumentDiagnosticEvent = (
  eventType: DocumentDiagnosticEventType,
  tenantId: string,
  status: 'SUCCESS' | 'PENDING' | 'BLOCKED' | 'FAILED',
  correlationId = createDiagnosticCorrelationId(),
  options: DocumentDiagnosticOptions = {}
): HabinoFinancialAuditEvent => {
  const reasonCode = options.reasonCode
    ? (/^[A-Z0-9_]{1,40}$/.test(options.reasonCode) ? options.reasonCode : 'UNCLASSIFIED')
    : undefined;
  const recordCount = Number.isInteger(options.recordCount) && options.recordCount! >= 0
    ? options.recordCount
    : undefined;
  const event = habinoFinancialAuditLogger.logEvent(
    eventType as FinancialAuditEventType,
    {
      tenantId,
      correlationId,
      status,
      summaryFa: EVENT_SUMMARIES[eventType],
      metadata: reasonCode || recordCount !== undefined
        ? {
            ...(reasonCode ? { reasonCode } : {}),
            ...(recordCount !== undefined ? { recordCount } : {})
          }
        : undefined
    }
  );

  void uploadDiagnosticEvent(event, eventType, tenantId).catch(error => {
    const errorCode = typeof error?.code === 'string' ? error.code.slice(0, 40) : 'REMOTE_LOG_ERROR';
    habinoFinancialAuditLogger.logEvent('DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED', {
      tenantId,
      correlationId,
      status: 'FAILED',
      summaryFa: EVENT_SUMMARIES.DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED,
      metadata: { errorCode }
    });
  });

  return event;
};

export const fetchRemoteDocumentDiagnosticEvents = async (
  tenantId: string,
  limit = 100
): Promise<RemoteDocumentDiagnosticEvent[]> => {
  if (!getSupabaseConfig().isConfigured) {
    throw new Error('اتصال Supabase پیکربندی نشده است.');
  }

  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error('برای مشاهده گزارش ابری، نشست احراز‌شده Supabase لازم است.');
  }

  let query = client
    .from('document_diagnostic_events')
    .select('id, tenant_id, correlation_id, event_type, status, event_source, reason_code, record_count, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(300, Math.trunc(limit))));
  if (tenantId !== 'all') query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as RemoteDocumentDiagnosticEvent[];
};
