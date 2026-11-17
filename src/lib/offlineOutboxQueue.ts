/**
 * HABINO ACCOUNTING - OFFLINE OUTBOX SYNC QUEUE
 * Architectural Pattern: Reliable Outbox Pattern for Multi-Tenant Financial Systems
 *
 * Guarantees zero data loss during network disruptions, VPN/proxy timeouts,
 * or cloud database connection drops. All signatures, financial entries, and
 * offline events are persisted locally first and reliably synced with Supabase.
 */

import { indexedDbEngine } from './indexedDbEngine';
import { habinoFinancialAuditLogger } from './errorLogger';
import { getSupabaseClient, getSupabaseConfig } from './supabase';
import { orderOutboxItemsForSync } from './offlineOutboxOrdering';

export interface OutboxItem<T = any> {
  id: string;
  type: 'signature' | 'invoice' | 'transaction' | 'client' | 'check' | 'entries' | 'installment' | 'bankAccount' | 'equityProfile' | 'equityOwnership' | 'equityEvent' | 'fixedAsset';
  tenantId: string;
  payload: T;
  createdAt: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: number;
  errorMessage?: string;
  version?: number;
}

export const retainLatestClientOutboxItems = (items: OutboxItem[]): OutboxItem[] => {
  const latestByClient = new Map<string, OutboxItem>();

  for (const item of items) {
    if (item.type !== 'client' || typeof item.payload?.id !== 'string' || !item.payload.id) continue;

    const key = `${item.tenantId}:${item.payload.id}`;
    const current = latestByClient.get(key);
    if (!current || item.createdAt > current.createdAt) {
      latestByClient.set(key, item);
    }
  }

  return items.filter(item => {
    if (item.type !== 'client' || typeof item.payload?.id !== 'string' || !item.payload.id) return true;
    return latestByClient.get(`${item.tenantId}:${item.payload.id}`) === item;
  });
};

const STORAGE_KEY = 'habino_offline_outbox_queue_v1';
const MAX_DEFAULT_ATTEMPTS = 5;

type QueueListener = (items: OutboxItem[]) => void;

class OfflineOutboxQueue {
  private items: OutboxItem[] = [];
  private listeners: Set<QueueListener> = new Set();
  private isFlushing = false;
  private autoSyncTimer: any = null;

  constructor() {
    this.loadFromStorage();
    this.initNetworkListeners();
    this.hydrateFromIndexedDb();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      this.items = [];
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.items = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[OfflineOutboxQueue] Failed to load queue from localStorage:', err);
      this.items = [];
    }
  }

  private async hydrateFromIndexedDb(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const dbItems = await indexedDbEngine.getAll<OutboxItem>('outboxItems');
      if (dbItems && dbItems.length > 0) {
        // Merge IndexedDB items with in-memory / localStorage items by ID
        const existingMap = new Map(this.items.map(i => [i.id, i]));
        let hasNew = false;
        for (const item of dbItems) {
          if (!existingMap.has(item.id)) {
            this.items.push(item);
            hasNew = true;
          }
        }
        if (hasNew) {
          this.items.sort((a, b) => b.createdAt - a.createdAt);
          this.saveToStorage();
        }
      }
    } catch (err) {
      console.warn('[OfflineOutboxQueue] Hydrate from IndexedDB error:', err);
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      if (window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
      }
    } catch (err) {
      console.error('[OfflineOutboxQueue] Failed to persist queue to localStorage:', err);
    }

    // High-capacity async persistence in IndexedDB
    indexedDbEngine.saveBatch('outboxItems', this.items).catch(err => {
      console.warn('[OfflineOutboxQueue] Failed to save batch to IndexedDB:', err);
    });

    this.notifyListeners();
  }

  private notifyListeners(): void {
    const snapshot = [...this.items];
    this.listeners.forEach(fn => {
      try {
        fn(snapshot);
      } catch (e) {
        console.error('[OfflineOutboxQueue] Listener error:', e);
      }
    });
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    // Flush automatically when connection recovers
    window.addEventListener('online', () => {
      console.log('[OfflineOutboxQueue] Network restored (online event). Triggering flush...');
      this.flushQueue();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        this.flushQueue();
      }
    });

    // Periodic heartbeat sync every 45 seconds if pending items exist
    if (!this.autoSyncTimer) {
      this.autoSyncTimer = setInterval(() => {
        if (this.getPendingCount() > 0 && navigator.onLine) {
          this.flushQueue();
        }
      }, 45000);
    }
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public enqueue<T = any>(
    type: OutboxItem['type'],
    payload: T,
    tenantId: string = 'tenant-main',
    maxAttempts: number = MAX_DEFAULT_ATTEMPTS
  ): OutboxItem<T> {
    const newItem: OutboxItem<T> = {
      id: `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      type,
      tenantId,
      payload,
      createdAt: Date.now(),
      status: 'pending',
      attempts: 0,
      maxAttempts
    };

    this.items.unshift(newItem);
    this.saveToStorage();

    // Trigger immediate background sync attempt if online
    if (typeof navigator === 'undefined' || navigator.onLine) {
      setTimeout(() => this.flushQueue(), 500);
    }

    return newItem;
  }

  public getPendingCount(): number {
    return this.items.filter(i => i.status === 'pending' || i.status === 'failed').length;
  }

  public getPendingItems(): OutboxItem[] {
    return this.items.filter(i => i.status === 'pending' || i.status === 'failed');
  }

  public getAllItems(): OutboxItem[] {
    return [...this.items];
  }

  public clearCompleted(): void {
    // Remove both 'synced' and 'failed' items, keep only 'pending' items for retry
    const toKeep = this.items.filter(i => i.status === 'pending');
    const removed = this.items.filter(i => i.status !== 'pending');
    this.items = toKeep;
    this.saveToStorage();
    removed.forEach(r => indexedDbEngine.deleteItem('outboxItems', r.id).catch(() => {}));
  }

  public clearAll(): void {
    this.items = [];
    this.saveToStorage();
    indexedDbEngine.clearStore('outboxItems').catch(() => {});
  }

  public async clearTenant(tenantId: string): Promise<void> {
    this.items = this.items.filter(item => item.tenantId !== tenantId);
    this.saveToStorage();
    await indexedDbEngine.clearTenantStore('outboxItems', tenantId);
  }

  public removeItem(id: string): void {
    this.items = this.items.filter(i => i.id !== id);
    this.saveToStorage();
    indexedDbEngine.deleteItem('outboxItems', id).catch(() => {});
  }

  /**
   * Process and flush all pending outbox items
   */
  public async flushQueue(options: { retryFailed?: boolean } = {}): Promise<{ synced: number; failed: number }> {
    if (this.isFlushing) {
      return { synced: 0, failed: 0 };
    }

    this.isFlushing = true;
    let synced = 0;
    let failed = 0;

    if (options.retryFailed) {
      this.items.forEach(item => {
        if (item.status === 'failed') {
          item.status = 'pending';
          item.attempts = 0;
        }
      });
      this.saveToStorage();
    }

    const latestItems = retainLatestClientOutboxItems(this.items);
    const latestItemIds = new Set(latestItems.map(item => item.id));
    const supersededClientItems = this.items.filter(item =>
      item.type === 'client' &&
      typeof item.payload?.id === 'string' &&
      item.payload.id &&
      !latestItemIds.has(item.id)
    );
    if (supersededClientItems.length > 0) {
      const supersededIds = new Set(supersededClientItems.map(item => item.id));
      this.items = this.items.filter(item => !supersededIds.has(item.id));
      this.saveToStorage();
      for (const item of supersededClientItems) {
        indexedDbEngine.deleteItem('outboxItems', item.id).catch(err =>
          console.warn('[OfflineOutboxQueue] Failed to remove superseded client update:', err)
        );
      }
    }

    let recoveredInterruptedClientSync = false;
    for (const item of this.items) {
      if (item.type === 'client' && item.status === 'syncing') {
        item.status = 'pending';
        recoveredInterruptedClientSync = true;
      }
    }
    if (recoveredInterruptedClientSync) this.saveToStorage();

    const pending = orderOutboxItemsForSync(this.items.filter(
      item => item.status === 'pending' || (item.status === 'failed' && item.attempts < item.maxAttempts)
    ));

    for (const item of pending) {
      if (item.type === 'invoice') {
        const config = getSupabaseConfig();
        if (!config.isConfigured) {
          item.errorMessage = 'برای همگام‌سازی خودکار فاکتور، اتصال Supabase پیکربندی نشده است.';
          this.saveToStorage();
          continue;
        }

        try {
          const { data, error } = await getSupabaseClient().auth.getSession();
          if (error || !data?.session?.user) {
            item.errorMessage = error
              ? `بررسی نشست Supabase ناموفق بود: ${error.message}`
              : 'برای ارسال فاکتور، نشست احراز هویت‌شده Supabase لازم است؛ پس از ورود دوباره خودکار تلاش می‌شود.';
            this.saveToStorage();
            continue;
          }
        } catch (error) {
          item.errorMessage = `بررسی نشست Supabase ناموفق بود: ${error instanceof Error ? error.message : 'خطای نامشخص'}`;
          this.saveToStorage();
          continue;
        }
      }

      item.status = 'syncing';
      item.attempts += 1;
      item.lastAttemptAt = Date.now();
      this.saveToStorage();

      try {
        const success = await this.processItem(item);
        if (success) {
          item.status = 'synced';
          item.errorMessage = undefined;
          synced += 1;
          habinoFinancialAuditLogger.logEvent('OFFLINE_QUEUE_SYNCED', {
            docIdentifier: item.id,
            tenantId: item.tenantId,
            status: 'SUCCESS',
            summaryFa: `همگام‌سازی موفقیت‌آمیز داده‌های ${item.type} از صف آفلاین`,
            metadata: { itemId: item.id, itemType: item.type, attempts: item.attempts }
          });
        } else {
          item.status = item.attempts >= item.maxAttempts ? 'failed' : 'pending';
          failed += 1;
          if (item.status === 'failed') {
            habinoFinancialAuditLogger.logEvent('OUTBOX_SYNC_FAILURE', {
              docIdentifier: item.id,
              tenantId: item.tenantId,
              status: 'FAILED',
              summaryFa: `توقف همگام‌سازی آیتم صف آفلاین (${item.type}) به دلیل رسیدن به سقف تلاش‌ها`,
              metadata: { itemId: item.id, itemType: item.type, attempts: item.attempts }
            });
          }
        }
      } catch (err: any) {
        console.warn(`[OfflineOutboxQueue] Sync failed for item ${item.id}:`, err);
        item.status = item.attempts >= item.maxAttempts ? 'failed' : 'pending';
        item.errorMessage = err?.message || 'خطای برقراری ارتباط با سرور یا پایگاه داده';
        failed += 1;
        if (item.status === 'failed') {
          habinoFinancialAuditLogger.logEvent('OUTBOX_SYNC_FAILURE', {
            docIdentifier: item.id,
            tenantId: item.tenantId,
            status: 'FAILED',
            summaryFa: `شکست قطعی در همگام‌سازی آیتم صف آفلاین (${item.type}): ${item.errorMessage}`,
            metadata: { itemId: item.id, itemType: item.type, attempts: item.attempts, error: item.errorMessage }
          });
        }
      }

      this.saveToStorage();
    }

    this.clearCompleted();
    this.isFlushing = false;
    return { synced, failed };
  }

  /**
   * Dispatches item based on its type
   */
  private async processItem(item: OutboxItem): Promise<boolean> {
    switch (item.type) {
      case 'signature':
        return await this.syncSignatureItem(item);
      case 'entries': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        await SupabaseSyncEngine.syncAccountingEntries(item.payload, item.tenantId);
        return true;
      }
      case 'client': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        return await SupabaseSyncEngine.syncClient(item.payload, item.tenantId, item.createdAt);
      }
      case 'invoice': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        const invoice = item.payload?.invoice || item.payload;
        const entries = Array.isArray(item.payload?.accountingEntries)
          ? item.payload.accountingEntries
          : undefined;
        return await SupabaseSyncEngine.syncInvoice(
          invoice,
          item.tenantId,
          entries,
          false,
          item.payload?.correlationId
        );
      }
      case 'transaction': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        return await SupabaseSyncEngine.syncTransaction(item.payload, item.tenantId);
      }
      case 'installment': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        return await SupabaseSyncEngine.syncInstallment(item.payload, item.tenantId);
      }
      case 'bankAccount': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        return await SupabaseSyncEngine.syncBankAccount(item.payload, item.tenantId);
      }
      case 'equityProfile':
      case 'equityOwnership':
      case 'equityEvent': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        return await SupabaseSyncEngine.syncEquityRecord(item.type, item.payload, item.tenantId);
      }
      case 'fixedAsset': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        return await SupabaseSyncEngine.syncFixedAsset(item.payload, item.tenantId);
      }
      case 'check': {
        const { SupabaseSyncEngine } = await import('./supabaseSyncEngine');
        if (item.payload?.check && Array.isArray(item.payload?.accountingEntries)) {
          return await SupabaseSyncEngine.syncCheck(
            item.payload.check,
            item.tenantId,
            item.payload.accountingEntries,
            false
          );
        }
        return await SupabaseSyncEngine.syncCheck(item.payload, item.tenantId);
      }
      default:
        console.warn(`[OfflineOutboxQueue] Unknown type: ${item.type}`);
        return true;
    }
  }

  private async syncSignatureItem(item: OutboxItem): Promise<boolean> {
    const payload = item.payload;
    if (!payload) return true;

    const shareToken = payload.shareToken || payload.verificationToken || payload.signatureRecord?.verification_token;
    const token = shareToken || payload.invoiceId;

    if (!token) {
      throw new Error('فاقد شناسه یا توکن فاکتور جهت همگام‌سازی امضا');
    }

    const response = await fetch(`/api/invoices/public/${encodeURIComponent(token)}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': item.tenantId || 'tenant-main'
      },
      body: JSON.stringify({
        dataUrl: payload.dataUrl || payload.signatureUrl,
        signerName: payload.signerName || payload.signatureRecord?.signer_name || 'تاییدکننده پیش‌فاکتور',
        signerRole: payload.signerRole || payload.signatureRecord?.signer_role || 'client',
        signerNationalId: payload.signerNationalId || payload.signatureRecord?.signer_national_id
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error || `Server HTTP ${response.status}`);
    }

    const data = await response.json();
    return Boolean(data.success);
  }

}

// Global Singleton Instance
export const offlineOutbox = new OfflineOutboxQueue();
