import React, { useEffect, useMemo, useState } from 'react';
import { useAccounting } from '../lib/store';
import { Download, RefreshCw, Search } from 'lucide-react';
import { SystemAuditEvent, listSystemAuditEvents } from '../lib/systemAuditService';

interface SystemAuditLogPanelProps {
  tenantId: string;
}

export const SystemAuditLogPanel: React.FC<SystemAuditLogPanelProps> = ({ tenantId }) => {
  const { systemAuditLogs } = useAccounting();
  const [events, setEvents] = useState<SystemAuditEvent[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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
    setError(null);

    // First try Supabase (server-side immutable logs)
    listSystemAuditEvents(tenantId)
      .then(rows => {
        if (!cancelled) {
          setEvents(rows);
          setLoading(false);
        }
      })
      .catch(loadError => {
        if (!cancelled) {
          // Fallback to local immutable audit logs when Supabase is not configured
          const localLogs = systemAuditLogs
            .filter(log => tenantId === 'all' || log.tenantId === tenantId)
            .map(log => ({
              id: log.id,
              tenantId: log.tenantId,
              actorId: log.actorId,
              actorRole: log.actorRole,
              action: log.action,
              resourceType: log.resourceType,
              resourceId: log.resourceId,
              correlationId: log.correlationId,
              outcome: log.outcome,
              reasonCode: log.reasonCode,
              eventSource: 'application' as const,
              createdAt: log.timestamp
            }));
          setEvents(localLogs);
          setError(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, refreshKey, systemAuditLogs]);

  const visibleEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return events;
    return events.filter(event => [
      event.actorId,
      event.actorRole,
      event.action,
      event.resourceType,
      event.resourceId,
      event.correlationId,
      event.reasonCode
    ].some(value => value?.toLowerCase().includes(normalizedSearch)));
  }, [events, search]);

  const downloadReport = () => {
    const report = visibleEvents.map(event => ({
      timestamp: event.createdAt,
      tenantId: event.tenantId,
      actorId: event.actorId,
      actorRole: event.actorRole,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      correlationId: event.correlationId,
      outcome: event.outcome,
      reasonCode: event.reasonCode,
      source: event.eventSource
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `habino-audit-${tenantId}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
        گزارش شامل شناسه‌ها و کدهای رویداد است و محتوای فاکتور، مبالغ، متن خطا یا اسرار را نگه نمی‌دارد.
        رویدادهای «پایگاه داده» از تغییر واقعی ردیف‌ها ثبت شده‌اند؛ رویدادهای «برنامه» با نشست معتبر ارسال می‌شوند اما گزارش خود برنامه هستند، نه اثبات مستقل انجام عملیات.
        نمایش این صفحه نیز به‌عنوان رویداد ممیزی ثبت می‌شود.
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="جستجو: شناسه عامل، عملیات، منبع یا شناسه پیگیری"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey(value => value + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تازه‌سازی
          </button>
          <button
            type="button"
            onClick={downloadReport}
            disabled={visibleEvents.length === 0}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            دریافت گزارش پالایش‌شده
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">در حال دریافت گزارش از پایگاه داده...</div>
      ) : visibleEvents.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
          {error ? 'گزارش ممیزی دریافت نشد.' : 'در بازهٔ ۳۰ روزهٔ اخیر رویدادی برای این فیلتر یافت نشد.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-right text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">زمان سرور</th>
                <th className="p-3">عامل / نقش</th>
                <th className="p-3">عملیات</th>
                <th className="p-3">منبع / رکورد</th>
                <th className="p-3">نتیجه / علت</th>
                <th className="p-3">پیگیری / منشأ</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map(event => (
                <tr key={event.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap p-3 font-mono text-slate-600">{new Date(event.createdAt).toLocaleString('fa-IR')}</td>
                  <td className="p-3">
                    <div className="font-mono text-slate-800">{event.actorId || 'هویت قابل‌تشخیص نیست'}</div>
                    <div className="mt-1 text-slate-500">{event.actorRole}</div>
                  </td>
                  <td className="p-3 font-bold text-slate-900">{event.action}</td>
                  <td className="p-3">
                    <div>{event.resourceType || '—'}</div>
                    <div className="mt-1 break-all font-mono text-slate-500">{event.resourceId || '—'}</div>
                  </td>
                  <td className="p-3">
                    <div>{event.outcome}</div>
                    <div className="mt-1 font-mono text-slate-500">{event.reasonCode || '—'}</div>
                  </td>
                  <td className="p-3">
                    <div className="break-all font-mono text-slate-600">{event.correlationId || '—'}</div>
                    <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      event.eventSource === 'database' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {event.eventSource === 'database' ? 'پایگاه داده' : 'برنامه'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 p-3 text-[11px] text-slate-500">
            حداکثر ۲۰۰ رویداد جدیدتر از ۳۰ روز گذشته برای مستأجر انتخاب‌شده نمایش داده می‌شود.
          </p>
        </div>
      )}
    </section>
  );
};

export default SystemAuditLogPanel;
