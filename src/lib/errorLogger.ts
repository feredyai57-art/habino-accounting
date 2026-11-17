/**
 * Habino Accounting - Client-Side Error Logger & Minimal Financial Audit Watchdog
 * سامانه هوشمند ثبت لاگ، پالایش داده‌های محرمانه و رهگیری رویدادهای مالی (Financial Audit Trail)
 */

export interface HabinoLogEntry {
  id: string;
  timestamp: string;
  isoTime: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  source?: string;
  stack?: string;
  details?: any;
}

export type FinancialAuditEventType =
  // ۵ گره بحرانی مصوب بخش ۸.۳ کتابخانه دانش هابینو:
  | 'TRANSACTION_POSTED'
  | 'TRANSACTION_VOIDED'
  | 'INVARIANT_VIOLATION_ROLLBACK'
  | 'CASCADE_MUTATION'
  | 'OUTBOX_SYNC_FAILURE'
  | 'BACKUP_DISCREPANCY_DETECTED'
  // شناسه‌های سازگار ماژولار:
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
  | 'DOCUMENT_DIAGNOSTIC_UPLOAD_FAILED'
  | 'TRANSACTION_ROLLBACK'
  | 'OFFLINE_QUEUE_FAILED'
  | 'OFFLINE_QUEUE_SYNCED'
  | 'BALANCE_INVARIANT_PASSED'
  | 'BALANCE_INVARIANT_VIOLATION'
  | 'FISCAL_YEAR_CLOSED'
  | 'PROJECT_PROFIT_CLOSED';

export interface HabinoFinancialAuditEvent {
  id: string;
  eventType: FinancialAuditEventType;
  timestamp: string;
  isoTime: string;
  tenantId?: string;
  docIdentifier?: string;
  status: 'SUCCESS' | 'PENDING' | 'BLOCKED' | 'ROLLBACK' | 'FAILED';
  summaryFa: string;
  metadata?: Record<string, any>;
  correlationId?: string;
}

/**
 * کلیدهای حساس جهت پالایش خودکار از لاگ‌ها (PII & Secret Sanitization)
 * مصوب بخش ۸.۳ کتابخانه جامع دانش هابینو: ممنوعیت مطلق ثبت مبالغ، نام اشخاص، توکن‌ها و فایل‌ها
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /bearer/i,
  /apikey/i,
  /api_key/i,
  /nationalcode/i,
  /national_code/i,
  /cardnumber/i,
  /card_number/i,
  /cvv/i,
  /privatekey/i,
  // 🛡️ الزامات حریم خصوصی بخش ۸.۳: منع مطلق مبالغ و هویت اشخاص در لاگ
  /amount/i,
  /grandtotal/i,
  /subtotal/i,
  /price/i,
  /total/i,
  /debit/i,
  /credit/i,
  /discrepancy/i,
  /balance/i,
  /salary/i,
  /wage/i,
  /fee/i,
  /tax/i,
  /discount/i,
  /cost/i,
  /clientname/i,
  /customername/i,
  /personname/i,
  /contactname/i,
  /voice/i,
  /audio/i,
  /signature/i,
  /image/i,
  /base64/i
];

/**
 * پالایش خودکار عبارات متنی حاوی اعداد و ارقام مالی
 * مصوب بخش ۸.۳ کتابخانه جامع دانش هابینو: منع مطلق مبالغ در لاگ‌های ممیزی
 */
export function sanitizeAuditSummary(summary: string): string {
  if (!summary || typeof summary !== 'string') return '';
  return summary
    .replace(/مجموع\s*بدهکار\s*=\s*[\d,.\u06F0-\u06F9]+/gi, 'مجموع بدهکار=[محفوظ]')
    .replace(/مجموع\s*بستانکار\s*=\s*[\d,.\u06F0-\u06F9]+/gi, 'مجموع بستانکار=[محفوظ]')
    .replace(/انحراف\s*=\s*[\d,.\u06F0-\u06F9]+\s*(?:ریال|IRR)?/gi, 'انحراف=[محفوظ]')
    .replace(/(?:مبلغ|مجموع|انحراف|بدهکار|بستانکار|مانده|قیمت|تراکنش)\s*[:=]?\s*[\d,.\u06F0-\u06F9]+(?:\s*(?:ریال|تومان|IRR|IRT))?/gi, '[محفوظ]')
    .replace(/[\d,.\u06F0-\u06F9]{3,}\s*(?:ریال|تومان|IRR|IRT)/gi, '[مبلغ محفوظ]');
}

/**
 * پالایش امن اشیاء پیش از ثبت در لاگ و حافظه کلاینت
 */
function sanitizeLogDetails(value: any, depth = 0): any {
  if (depth > 2) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 500) {
      return value.substring(0, 500) + '... [TRUNCATED]';
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? value.stack.substring(0, 500) : undefined
    };
  }
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return value.slice(0, 10).map(item => sanitizeLogDetails(item, depth + 1)).concat(['[MORE_ITEMS_TRUNCATED]']);
    }
    return value.map(item => sanitizeLogDetails(item, depth + 1));
  }
  if (typeof value === 'object') {
    const cleanObj: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some(regex => regex.test(key));
      if (isSensitive) {
        cleanObj[key] = '[REDACTED]';
      } else {
        cleanObj[key] = sanitizeLogDetails(value[key], depth + 1);
      }
    }
    return cleanObj;
  }
  return String(value);
}

class HabinoErrorLogger {
  private static instance: HabinoErrorLogger;
  private logs: HabinoLogEntry[] = [];
  private readonly maxLogs: number = 200;
  private listeners: Array<(logs: HabinoLogEntry[]) => void> = [];
  private initialized: boolean = false;
  private lastRemoteRuntimeErrorAt = 0;

  private constructor() {
    this.loadPersistedLogs();
    this.initGlobalWatchdog();
  }

  public static getInstance(): HabinoErrorLogger {
    if (!HabinoErrorLogger.instance) {
      HabinoErrorLogger.instance = new HabinoErrorLogger();
    }
    return HabinoErrorLogger.instance;
  }

  private shouldIgnoreError(entry: { message?: string; source?: string; stack?: string }): boolean {
    const raw = `${entry.message || ''} ${entry.source || ''} ${entry.stack || ''}`.toLowerCase();
    return (
      raw.includes('[vite]') ||
      raw.includes('websocket') ||
      raw.includes('failed to connect to websocket') ||
      raw.includes('@vite/client') ||
      raw.includes('vite/client') ||
      raw.includes('vite/dist/client') ||
      raw.includes('vite:not-found') ||
      raw.includes('hmr') ||
      raw.includes('chrome-extension://') ||
      raw.includes('moz-extension://')
    );
  }

  private loadPersistedLogs(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const saved = sessionStorage.getItem('habino_runtime_errors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.logs = parsed.filter(item => !this.shouldIgnoreError(item)).slice(-this.maxLogs);
          this.persistLogs();
        }
      }
    } catch (_) {
      // Ignored
    }
  }

  private persistLogs(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      sessionStorage.setItem('habino_runtime_errors', JSON.stringify(this.logs.slice(-this.maxLogs)));
    } catch (_) {
      // Ignored
    }
  }

  private initGlobalWatchdog(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // 1. Trap window unhandled errors
    window.addEventListener('error', (event: ErrorEvent) => {
      this.logInternal({
        level: 'error',
        message: event.message || 'خطای ناشناخته در زمان اجرا (Window Error)',
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'window.onerror',
        stack: event.error?.stack || undefined
      });
    });

    // 2. Trap unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      let msg = 'خطای پرامیس مدیریت‌نشده (Unhandled Promise Rejection)';
      let stack: string | undefined = undefined;

      if (event.reason instanceof Error) {
        msg = event.reason.message;
        stack = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        msg = event.reason;
      } else if (event.reason && typeof event.reason === 'object') {
        try {
          msg = JSON.stringify(sanitizeLogDetails(event.reason));
        } catch (_) {}
      }

      this.logInternal({
        level: 'error',
        message: msg,
        source: 'unhandledrejection',
        stack
      });
    });

    // 3. Wrap console.error and console.warn with sensitive data sanitization
    const originalConsoleError = console.error.bind(console);
    const originalConsoleWarn = console.warn.bind(console);

    console.error = (...args: any[]) => {
      try {
        const primary = args[0];
        const msg = typeof primary === 'string' 
          ? primary 
          : primary instanceof Error 
            ? primary.message 
            : typeof primary === 'object' 
              ? JSON.stringify(sanitizeLogDetails(primary)) 
              : String(primary);

        const stack = primary instanceof Error ? primary.stack : undefined;
        this.logInternal({
          level: 'error',
          message: msg || 'خطای ثبت‌شده در کنسول',
          source: 'console.error',
          stack,
          details: args.length > 1 ? sanitizeLogDetails(args.slice(1)) : undefined
        });
      } catch (_) {}
      originalConsoleError(...args);
    };

    console.warn = (...args: any[]) => {
      try {
        const primary = args[0];
        const msg = typeof primary === 'string' 
          ? primary 
          : typeof primary === 'object' 
            ? JSON.stringify(sanitizeLogDetails(primary)) 
            : String(primary);

        // Filter out noisy Vite HMR or websocket warnings
        if (!msg.includes('[vite]') && !msg.includes('WebSocket')) {
          this.logInternal({
            level: 'warn',
            message: msg || 'هشدار کنسول',
            source: 'console.warn',
            details: args.length > 1 ? sanitizeLogDetails(args.slice(1)) : undefined
          });
        }
      } catch (_) {}
      originalConsoleWarn(...args);
    };
  }

  private logInternal(entry: Omit<HabinoLogEntry, 'id' | 'timestamp' | 'isoTime'>): void {
    if (this.shouldIgnoreError(entry)) {
      return;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('fa-IR');
    const formattedTime = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const newLog: HabinoLogEntry = {
      id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: `${formattedDate} ${formattedTime}`,
      isoTime: now.toISOString(),
      ...entry,
      details: entry.details ? sanitizeLogDetails(entry.details) : undefined
    };

    this.logs.unshift(newLog);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.persistLogs();
    this.notify();
    if (entry.level === 'error') this.reportRuntimeError(entry.source);
  }

  private reportRuntimeError(source?: string): void {
    const now = Date.now();
    if (now - this.lastRemoteRuntimeErrorAt < 60_000) return;
    this.lastRemoteRuntimeErrorAt = now;
    void import('./systemAuditService')
      .then(({ recordSystemAuditEvent }) => recordSystemAuditEvent({
        action: 'CLIENT_RUNTIME_ERROR',
        resourceType: source === 'window.onerror'
          ? 'window_error'
          : source === 'unhandledrejection'
            ? 'unhandled_rejection'
            : source === 'console.error'
              ? 'console_error'
              : 'application',
        outcome: 'failed',
        reasonCode: 'CLIENT_RUNTIME_ERROR'
      }))
      .catch(() => {
        console.warn('[SystemAudit] Could not initialize remote runtime-error reporting.');
      });
  }

  public logCustom(level: 'error' | 'warn' | 'info', message: string, source?: string, details?: any): void {
    this.logInternal({ level, message, source: source || 'application', details: sanitizeLogDetails(details) });
  }

  public getLogs(): HabinoLogEntry[] {
    return [...this.logs];
  }

  public getCounts(): { total: number; errors: number; warnings: number; unhandled: number } {
    let errors = 0;
    let warnings = 0;
    let unhandled = 0;

    for (const log of this.logs) {
      if (log.level === 'error') {
        errors++;
        if (log.source === 'unhandledrejection' || log.source === 'window.onerror') {
          unhandled++;
        }
      } else if (log.level === 'warn') {
        warnings++;
      }
    }

    return {
      total: this.logs.length,
      errors,
      warnings,
      unhandled
    };
  }

  public clearLogs(): void {
    this.logs = [];
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('habino_runtime_errors');
    }
    this.notify();
  }

  public subscribe(listener: (logs: HabinoLogEntry[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener([...this.logs]);
      } catch (_) {}
    }
  }
}

/**
 * 🏛️ سامانه رسمی ثبت رویدادهای حسابداری و ممیزی مالی (Habino Financial Audit Logger)
 * ثبت ساختاریافته رویدادهای حیاتی: ثبت سند، ابطال، Rollback، گارد توازن و وضعیت همگام‌سازی آفلاین
 */
export class HabinoFinancialAuditLogger {
  private static instance: HabinoFinancialAuditLogger;
  private events: HabinoFinancialAuditEvent[] = [];
  private readonly maxEvents: number = 300;
  private listeners: Array<(events: HabinoFinancialAuditEvent[]) => void> = [];

  private constructor() {
    this.loadPersistedEvents();
  }

  public static getInstance(): HabinoFinancialAuditLogger {
    if (!HabinoFinancialAuditLogger.instance) {
      HabinoFinancialAuditLogger.instance = new HabinoFinancialAuditLogger();
    }
    return HabinoFinancialAuditLogger.instance;
  }

  private loadPersistedEvents(): void {
    if (typeof window === 'undefined') return;
    try {
      // 🛡️ ذخیره‌سازی پایدار در LocalStorage و مهاجرت داده‌های SessionStorage قبلی
      let saved = window.localStorage ? localStorage.getItem('habino_financial_audit_trail') : null;
      if (!saved && window.sessionStorage) {
        saved = sessionStorage.getItem('habino_financial_audit_trail');
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.events = parsed.slice(-this.maxEvents);
        }
      }
    } catch (_) {}
  }

  private persistEvents(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify(this.events.slice(-this.maxEvents));
      if (window.localStorage) {
        localStorage.setItem('habino_financial_audit_trail', payload);
      }
    } catch (_) {}
  }

  public logEvent(
    eventType: FinancialAuditEventType,
    params: {
      docIdentifier?: string;
      tenantId?: string;
      status: 'SUCCESS' | 'PENDING' | 'BLOCKED' | 'ROLLBACK' | 'FAILED';
      summaryFa: string;
      metadata?: Record<string, any>;
      correlationId?: string;
    }
  ): HabinoFinancialAuditEvent {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('fa-IR');
    const formattedTime = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 🛡️ الزامات حریم خصوصی بخش ۸.۳: پالایش کامل مبالغ، اعداد پولی و نام اشخاص از متن و متادیتا
    const cleanSummary = sanitizeAuditSummary(params.summaryFa);
    const cleanMetadata = params.metadata ? sanitizeLogDetails(params.metadata) : undefined;

    const auditEvent: HabinoFinancialAuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      eventType,
      timestamp: `${formattedDate} ${formattedTime}`,
      isoTime: now.toISOString(),
      tenantId: params.tenantId,
      docIdentifier: params.docIdentifier,
      status: params.status,
      summaryFa: cleanSummary,
      metadata: cleanMetadata,
      correlationId: params.correlationId
    };

    this.events.unshift(auditEvent);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    this.persistEvents();
    this.notify();
    return auditEvent;
  }

  public getEvents(limit: number = 50): HabinoFinancialAuditEvent[] {
    return this.events.slice(0, limit);
  }

  public clear(): void {
    this.events = [];
    if (typeof window !== 'undefined') {
      try {
        localStorage?.removeItem('habino_financial_audit_trail');
        sessionStorage?.removeItem('habino_financial_audit_trail');
      } catch (_) {}
    }
    this.notify();
  }

  public subscribe(listener: (events: HabinoFinancialAuditEvent[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener([...this.events]);
      } catch (_) {}
    }
  }
}

export const habinoErrorLogger = HabinoErrorLogger.getInstance();
export const habinoFinancialAuditLogger = HabinoFinancialAuditLogger.getInstance();
