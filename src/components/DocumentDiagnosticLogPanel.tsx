import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Download, RefreshCw } from 'lucide-react';
import { useAccounting } from '../lib/store';
import { habinoFinancialAuditLogger } from '../lib/errorLogger';
import {
  DocumentDiagnosticEventType,
  fetchRemoteDocumentDiagnosticEvents,
  RemoteDocumentDiagnosticEvent
} from '../lib/documentDiagnostics';

const DOCUMENT_EVENT_TYPES = new Set<DocumentDiagnosticEventType>([
  'DOCUMENT_REGISTERED',
  'DOCUMENT_REGISTER_FAILED',
  'DOCUMENT_UPDATED',
  'DOCUMENT_UPDATE_FAILED',
  'DOCUMENT_RESTORED',
  'DOCUMENT_DELETED',
  'DOCUMENT_DELETE_BLOCKED',
  'DOCUMENT_SYNC_STARTED',
  'DOCUMENT_SYNCED',
  'DOCUMENT_SYNC_QUEUED',
  'DOCUMENT_SYNC_FAILED',
  'DOCUMENT_CLOUD_FETCHED',
  'DOCUMENT_CLOUD_FETCH_FAILED',
  'DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED'
]);

const EVENT_LABELS: Record<DocumentDiagnosticEventType, string> = {
  DOCUMENT_REGISTERED: 'ثبت محلی فاکتور',
  DOCUMENT_REGISTER_FAILED: 'شکست ثبت محلی',
  DOCUMENT_UPDATED: 'ویرایش محلی فاکتور',
  DOCUMENT_UPDATE_FAILED: 'شکست ویرایش محلی',
  DOCUMENT_RESTORED: 'بازیابی فاکتور',
  DOCUMENT_DELETED: 'درخواست حذف پیش‌فاکتور',
  DOCUMENT_DELETE_BLOCKED: 'حذف مسدود شد',
  DOCUMENT_SYNC_STARTED: 'شروع همگام‌سازی',
  DOCUMENT_SYNCED: 'تأیید همگام‌سازی',
  DOCUMENT_SYNC_QUEUED: 'در صف همگام‌سازی',
  DOCUMENT_SYNC_FAILED: 'شکست همگام‌سازی',
  DOCUMENT_CLOUD_FETCHED: 'دریافت از ابر',
  DOCUMENT_CLOUD_FETCH_FAILED: 'شکست دریافت از ابر',
  DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED: 'ثبت ابری لاگ ناموفق'
};

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'موفق',
  PENDING: 'در انتظار',
  BLOCKED: 'مسدود',
  FAILED: 'ناموفق',
  ROLLBACK: 'بازگشت تراکنش'
};

export const DocumentDiagnosticLogPanel: React.FC = () => {
  const { activeTenantId, currentUser } = useAccounting();
  const tenantId = currentUser?.role === 'super_admin'
    ? activeTenantId
    : currentUser?.tenantId || activeTenantId;
  const [localEvents, setLocalEvents] = useState(() => habinoFinancialAuditLogger.getEvents(300));
  const [remoteEvents, setRemoteEvents] = useState<RemoteDocumentDiagnosticEvent[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => habinoFinancialAuditLogger.subscribe(setLocalEvents), []);

  useEffect(() => {
    const handleFactoryReset = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string }>).detail;
      if (!detail?.tenantId || detail.tenantId === tenantId || tenantId === 'all') {
        setRefreshKey(key => key + 1);
      }
    };
    window.addEventListener('habino_factory_reset_occurred', handleFactoryReset);
    return () => window.removeEventListener('habino_factory_reset_occurred', handleFactoryReset);
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRemoteError(null);
    fetchRemoteDocumentDiagnosticEvents(tenantId)
      .then(events => {
        if (!cancelled) setRemoteEvents(events);
      })
      .catch(error => {
        if (!cancelled) {
          setRemoteEvents([]);
          setRemoteError(error instanceof Error ? error.message : 'دریافت لاگ‌های ابری ناموفق بود.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, refreshKey]);

  const filteredLocalEvents = useMemo(
    () => localEvents.filter(event =>
      (tenantId === 'all' || event.tenantId === tenantId) &&
      DOCUMENT_EVENT_TYPES.has(event.eventType as DocumentDiagnosticEventType)
    ),
    [localEvents, tenantId]
  );

  const timeline = useMemo(() => {
    const localItems = filteredLocalEvents.map(event => ({
      id: event.id,
      correlationId: event.correlationId || '',
      eventType: event.eventType as DocumentDiagnosticEventType,
      status: event.status,
      reasonCode: event.metadata?.reasonCode || '',
      recordCount: event.metadata?.recordCount,
      createdAt: event.isoTime,
      source: 'این مرورگر',
      channel: 'local'
    }));
    const cloudItems = remoteEvents.map((event: RemoteDocumentDiagnosticEvent) => ({
      id: event.id,
      correlationId: event.correlation_id,
      eventType: event.event_type,
      status: event.status,
      reasonCode: event.reason_code || '',
      recordCount: event.record_count,
      createdAt: event.created_at,
      source: event.event_source === 'server' ? 'سرور' : 'ابر؛ گزارش کلاینت',
      channel: 'cloud'
    }));
    return [...localItems, ...cloudItems]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 300);
  }, [filteredLocalEvents, remoteEvents]);

  const handleExport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      tenantId,
      retention: 'Local browser: most recent 300 audit events; cloud: last 30 days',
      localEvents: filteredLocalEvents,
      cloudEvents: remoteEvents
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `habino-document-diagnostics-${tenantId}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportMessage('گزارش پالایش‌شده دانلود شد؛ آن را فقط از مسیر امن پشتیبانی ارسال کنید.');
  };

  return (
    <section className="space-y-5" dir="rtl">
      <header className="flex flex-col gap-3 rounded-3xl border border-indigo-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">رهگیری فاکتور و همگام‌سازی</h3>
            <p className="mt-1 text-xs text-slate-500">مستأجر فعال: {tenantId}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey(value => value + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تازه‌سازی ابر
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" />
            دریافت گزارش پشتیبانی
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
        لاگ‌ها فقط نوع رویداد، وضعیت، زمان و شناسهٔ پیگیری تصادفی را ثبت می‌کنند؛ شماره فاکتور، نام طرف‌حساب و مبالغ در این گزارش ذخیره نمی‌شود.
        رویداد محلی فقط در همین مرورگر می‌ماند مگر نشست Supabase احراز شده باشد. داده ابری پس از ۳۰ روز از دید خارج می‌شود.
      </div>

      {remoteError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          گزارش ابری در دسترس نیست: {remoteError}
          <span className="mt-1 block text-[11px]">ثبت‌های محلی همچنان حفظ می‌شوند. بررسی کنید migration لاگ تشخیصی روی پروژه Supabase اجرا شده باشد.</span>
        </div>
      )}
      {exportMessage && <p className="text-xs text-emerald-700">{exportMessage}</p>}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h4 className="text-sm font-bold text-slate-800">رویدادهای اخیر</h4>
          <span className="text-xs text-slate-500">{timeline.length} رویداد</span>
        </div>
        {timeline.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">برای این مستأجر هنوز رویداد تشخیصی ثبت نشده است.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {timeline.map(event => (
              <li key={`${event.channel}-${event.id}`} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{EVENT_LABELS[event.eventType]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      event.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800'
                        : event.status === 'PENDING' ? 'bg-amber-100 text-amber-800'
                        : event.status === 'BLOCKED' ? 'bg-slate-200 text-slate-700'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {STATUS_LABELS[event.status] || event.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{event.source}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 break-all font-mono text-[10px] text-slate-500">
                    <span>پیگیری: {event.correlationId || 'در رویدادهای قدیمی موجود نیست'}</span>
                    {event.reasonCode && <span>کد علت: {event.reasonCode}</span>}
                    {event.recordCount !== null && event.recordCount !== undefined && <span>تعداد فاکتور ابری: {event.recordCount}</span>}
                  </div>
                </div>
                <time className="text-[11px] text-slate-500" dir="ltr">
                  {new Date(event.createdAt).toLocaleString('fa-IR')}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};
