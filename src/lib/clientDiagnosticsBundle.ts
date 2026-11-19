import { HabinoOfflineQueue } from './offlineQueueEngine';
import { offlineOutbox } from './offlineOutboxQueue';
import { indexedDbEngine } from './indexedDbEngine';

export interface SanitizedOutboxItem {
  tableName: string;
  operation: string;
  retryCount: number;
  lastErrorCode: string | null;
}

export interface ClientDiagnosticsBundle {
  generatedAt: string;
  tenantId: string;
  appOriginType: 'localhost' | 'lan_ip' | 'https_domain' | 'other';
  isOnline: boolean;
  serviceWorker: 'active' | 'waiting' | 'none';
  indexedDb: {
    status: 'opened' | 'unavailable';
    pendingCount: number;
    failedCount: number;
    items: SanitizedOutboxItem[];
  };
  lastSyncMeta: string | null;
  browserInfo: {
    userAgent: string;
    platform: string;
    language: string;
  };
}

const getOriginType = (hostname: string, protocol: string): ClientDiagnosticsBundle['appOriginType'] => {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return 'localhost';
  if (/^(10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/.test(hostname)) {
    return 'lan_ip';
  }
  if (protocol === 'https:') return 'https_domain';
  return 'other';
};

const getErrorCode = (message?: string): string | null => {
  if (!message) return null;
  const match = message.match(/\b([A-Z][A-Z0-9_]{2,39})\b/);
  return match?.[1] || null;
};

export async function collectSanitizedDiagnosticsBundle(tenantId: string): Promise<ClientDiagnosticsBundle> {
  if (!tenantId.trim()) throw new Error('شناسهٔ فضای کاری برای تهیهٔ گزارش فنی الزامی است.');
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    throw new Error('گزارش فنی فقط در محیط مرورگر قابل تهیه است.');
  }

  const [storageStats, localQueue, outboxItems, serviceWorkerRegistration] = await Promise.all([
    indexedDbEngine.getStorageStats(),
    HabinoOfflineQueue.getAllItems(tenantId),
    Promise.resolve(offlineOutbox.getAllItems().filter(item => item.tenantId === tenantId)),
    'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration().catch(() => undefined) : Promise.resolve(undefined)
  ]);
  const queueItems: SanitizedOutboxItem[] = [
    ...localQueue
      .filter(item => item.operation === 'upsert' || item.operation === 'delete')
      .map(item => ({
        tableName: item.entityType,
        operation: item.operation,
        retryCount: Number.isFinite(item.retryCount) ? item.retryCount : 0,
        lastErrorCode: getErrorCode(item.lastError)
      })),
    ...outboxItems
      .filter(item => item.status === 'pending' || item.status === 'syncing' || item.status === 'failed')
      .map(item => ({
        tableName: item.type,
        operation: 'sync',
        retryCount: Number.isFinite(item.attempts) ? item.attempts : 0,
        lastErrorCode: getErrorCode(item.errorMessage)
      }))
  ];
  const pendingCount = queueItems.length;
  const failedCount = queueItems.filter(item => item.lastErrorCode !== null).length;
  const registration = serviceWorkerRegistration;
  const serviceWorker: ClientDiagnosticsBundle['serviceWorker'] = registration?.active
    ? 'active'
    : registration?.waiting
      ? 'waiting'
      : 'none';
  const lastSyncMeta = localStorage.getItem('habino_last_successful_sync_at');

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    appOriginType: getOriginType(window.location.hostname, window.location.protocol),
    isOnline: navigator.onLine,
    serviceWorker,
    indexedDb: {
      status: storageStats.isSupported ? 'opened' : 'unavailable',
      pendingCount,
      failedCount,
      items: queueItems
    },
    lastSyncMeta,
    browserInfo: {
      userAgent: navigator.userAgent,
      platform: navigator.platform || '',
      language: navigator.language || ''
    }
  };
}

export function formatDiagnosticBundleForSupport(bundle: ClientDiagnosticsBundle): string {
  const originLabel: Record<ClientDiagnosticsBundle['appOriginType'], string> = {
    localhost: 'محلی',
    lan_ip: 'شبکهٔ محلی',
    https_domain: 'دامنهٔ امن',
    other: 'سایر'
  };
  const serviceWorkerLabel: Record<ClientDiagnosticsBundle['serviceWorker'], string> = {
    active: 'فعال',
    waiting: 'در انتظار فعال‌سازی',
    none: 'در دسترس نیست'
  };
  return [
    '--- گزارش فنی هابینو (بدون اطلاعات مالی) ---',
    `زمان تهیه: ${new Date(bundle.generatedAt).toLocaleString('fa-IR')}`,
    `شناسه فضای کاری: ${bundle.tenantId}`,
    `نوع اتصال: ${originLabel[bundle.appOriginType]} | اینترنت: ${bundle.isOnline ? 'متصل' : 'قطع'}`,
    `Service Worker: ${serviceWorkerLabel[bundle.serviceWorker]}`,
    `صف آفلاین: ${bundle.indexedDb.status === 'opened' ? 'قابل دسترس' : 'ناموجود'} | معلق/خطادار: ${bundle.indexedDb.pendingCount} | دارای کد خطا: ${bundle.indexedDb.failedCount}`,
    `آخرین همگام‌سازی موفق: ${bundle.lastSyncMeta || 'ثبت نشده'}`,
    `مرورگر: ${bundle.browserInfo.platform} | زبان: ${bundle.browserInfo.language}`,
    '--- پایان گزارش فنی ---'
  ].join('\n');
}
