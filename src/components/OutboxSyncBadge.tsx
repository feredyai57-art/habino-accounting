import React, { useState, useEffect } from 'react';
import { offlineOutbox, OutboxItem } from '../lib/offlineOutboxQueue';
import { Cloud, CloudUpload, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import { toPersianDigits } from '../lib/currencyUtils';

export const OutboxSyncBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = offlineOutbox.subscribe(currentItems => {
      setItems(currentItems);
    });
    return () => unsubscribe();
  }, []);

  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'failed').length;
  const pendingError = items.find(i =>
    (i.status === 'pending' || i.status === 'failed') && i.errorMessage
  )?.errorMessage;

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await offlineOutbox.flushQueue({ retryFailed: true });
      const remainingItems = offlineOutbox.getPendingItems();
      const latestError = remainingItems.find(item => item.errorMessage)?.errorMessage;
      if (result.synced > 0) {
        setLastSyncResult(
          remainingItems.length > 0
            ? `${toPersianDigits(result.synced)} سند همگام شد؛ ${toPersianDigits(remainingItems.length)} باقی ماند`
            : `${toPersianDigits(result.synced)} سند همگام شد`
        );
      } else if (result.failed > 0) {
        setLastSyncResult(latestError || `${toPersianDigits(result.failed)} سند با خطا مواجه شد`);
      } else if (remainingItems.length > 0) {
        setLastSyncResult(latestError || 'ارسال انجام نشد؛ وضعیت نشست Supabase را بررسی کنید.');
      } else {
        setLastSyncResult('صف خالی است');
      }
      setTimeout(() => setLastSyncResult(null), 4000);
    } catch (e: any) {
      setLastSyncResult('خطا در ارتباط');
      setTimeout(() => setLastSyncResult(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Show empty state when queue has no items, regardless of lastSyncResult state
  // This ensures the empty state is always visible when there are no outbox items
  if (items.length === 0 && !lastSyncResult) {
    return (
      <button
        onClick={handleManualSync}
        aria-label="بررسی همگام‌سازی؛ صف خالی است"
        className={`${compact ? 'flex' : 'hidden md:flex'} items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-medium transition-all cursor-pointer`}
        title="صف آفلاین همگام است - کلیک جهت بررسی مجدد"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span className={compact ? 'hidden sm:inline text-[11px]' : 'text-[11px]'}>همگام</span>
      </button>
    );
  }

  // Reset lastSyncResult when queue becomes empty after sync
  if (items.length === 0 && lastSyncResult) {
    setLastSyncResult(null);
  }

  return (
    <button
      onClick={handleManualSync}
      disabled={isSyncing}
      aria-label={`همگام‌سازی؛ ${pendingCount} سند در صف`}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${
        pendingCount > 0
          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
          : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
      }`}
      title={pendingCount > 0
        ? `${toPersianDigits(pendingCount)} سند در صف ارسال آفلاین${pendingError ? `: ${pendingError}` : ' - کلیک جهت ارسال فوری'}`
        : 'همگام‌سازی'}
    >
      {isSyncing ? (
        <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
      ) : pendingCount > 0 ? (
        <CloudUpload className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
      ) : (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      )}
      <span className={compact ? 'hidden sm:inline text-[11px]' : 'text-[11px]'}>
        {isSyncing
          ? 'در حال همگام‌سازی...'
          : lastSyncResult
          ? lastSyncResult
          : `${toPersianDigits(pendingCount)} در صف آفلاین`}
      </span>
      {compact && pendingCount > 0 && (
        <span className="text-[10px] sm:hidden">{toPersianDigits(pendingCount)}</span>
      )}
      {pendingCount > 0 && !isSyncing && (
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
      )}
    </button>
  );
};
