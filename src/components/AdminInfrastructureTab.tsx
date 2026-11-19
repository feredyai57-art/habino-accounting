import React, { Suspense, lazy, useState } from 'react';
import { AlertCircle, Activity, Database, Loader2, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';

const DiagnosticModule = lazy(() => import('./DiagnosticModule').then(module => ({ default: module.DiagnosticModule })));
const TenantIsolationVerificationStudio = lazy(() => import('./TenantIsolationVerificationStudio').then(module => ({ default: module.TenantIsolationVerificationStudio })));
const PreLaunchAcceptanceStudio = lazy(() => import('./PreLaunchAcceptanceStudio').then(module => ({ default: module.PreLaunchAcceptanceStudio })));
const AccountingVerificationStudio = lazy(() => import('./AccountingVerificationStudio').then(module => ({ default: module.AccountingVerificationStudio })));
const StressTestEngineStudio = lazy(() => import('./StressTestEngineStudio').then(module => ({ default: module.StressTestEngineStudio })));

type InfrastructureView = 'diagnostics' | 'migrations' | 'isolation' | 'qa' | 'stress';

interface AdminInfrastructureTabProps {
  isReadOnlySupport?: boolean;
}

interface MigrationStatus {
  message: string;
  supabaseConfigured: boolean;
  recommendationFa: string;
}

interface MigrationScriptStatus {
  fileName: string;
  version: string;
  totalBytes: number;
  totalLines: number;
  hasIdempotentStabilization: boolean;
  hasSchemaCacheReload: boolean;
}

export const AdminInfrastructureTab: React.FC<AdminInfrastructureTabProps> = ({ isReadOnlySupport = false }) => {
  const [activeView, setActiveView] = useState<InfrastructureView>('diagnostics');
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [scriptStatus, setScriptStatus] = useState<MigrationScriptStatus | null>(null);
  const [loadingMigration, setLoadingMigration] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const loadMigrationStatus = async () => {
    setLoadingMigration(true);
    setMigrationError(null);
    try {
      const { data: sessionData, error: sessionError } = await getSupabaseClient().auth.getSession();
      if (sessionError) throw new Error(`بازیابی نشست پلتفرم ناموفق بود: ${sessionError.message}`);
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('نشست معتبر برای بررسی مهاجرت پیدا نشد.');
      const headers = { Authorization: `Bearer ${token}` };
      const [verifyResponse, sqlResponse] = await Promise.all([
        fetch('/api/admin/migration/verify', { method: 'POST', headers }),
        fetch('/api/admin/migration/sql', { headers })
      ]);
      const [verifyResult, sqlResult] = await Promise.all([
        verifyResponse.json().catch(() => null) as Promise<MigrationStatus & { error?: string } | null>,
        sqlResponse.json().catch(() => null) as Promise<MigrationScriptStatus & { error?: string } | null>
      ]);
      if (!verifyResponse.ok || !verifyResult) {
        throw new Error(verifyResult?.error || `بررسی مهاجرت ناموفق بود (HTTP ${verifyResponse.status}).`);
      }
      if (!sqlResponse.ok || !sqlResult) {
        throw new Error(sqlResult?.error || `بررسی فایل مهاجرت ناموفق بود (HTTP ${sqlResponse.status}).`);
      }
      setMigrationStatus(verifyResult);
      setScriptStatus(sqlResult);
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : 'بررسی وضعیت مهاجرت ناموفق بود.');
    } finally {
      setLoadingMigration(false);
    }
  };

  const views: Array<{ id: InfrastructureView; label: string; icon: typeof Activity }> = [
    { id: 'diagnostics', label: 'پایش زنده سوپابیس', icon: Activity },
    ...(!isReadOnlySupport ? [
      { id: 'migrations' as const, label: 'مایگریشن و اسکیما', icon: Database },
      { id: 'isolation' as const, label: 'ایزولاسیون مستأجران (RLS)', icon: ShieldCheck },
      { id: 'qa' as const, label: 'آمادگی انتشار (QA)', icon: ShieldCheck },
      { id: 'stress' as const, label: 'تست استرس و ممیزی', icon: Zap }
    ] : [])
  ];

  return (
    <section className="space-y-4" dir="rtl">
      {isReadOnlySupport && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-6 text-sky-900">
          دسترسی پشتیبانی فقط‌خواندنی است؛ ابزارهای مهاجرت و آزمون‌های تغییردهنده برای این نقش در دسترس نیستند.
        </p>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="ابزارهای زیرساخت">
        {views.map(view => {
          const Icon = view.icon;
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => setActiveView(view.id)}
              aria-current={activeView === view.id ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                activeView === view.id ? 'bg-indigo-700 text-white' : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {view.label}
            </button>
          );
        })}
      </nav>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {activeView === 'migrations' && !isReadOnlySupport ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">بررسی وضعیت مایگریشن‌ها و اسکیما</h3>
                <p className="mt-1 text-xs text-slate-500">وضعیت اتصال و آماده‌بودن فایل SQL را بدون نمایش محتوای پایگاه داده بررسی کنید.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadMigrationStatus()}
                disabled={loadingMigration}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {loadingMigration ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                بررسی وضعیت
              </button>
            </div>
            {migrationError && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {migrationError}
              </p>
            )}
            {migrationStatus && scriptStatus && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-700">
                <p>{migrationStatus.message}</p>
                <p>اتصال Supabase: {migrationStatus.supabaseConfigured ? 'پیکربندی‌شده' : 'پیکربندی‌نشده'}</p>
                <p>
                  فایل {scriptStatus.fileName} · نسخه {scriptStatus.version} · {scriptStatus.totalLines} خط ·
                  {scriptStatus.hasIdempotentStabilization ? ' تثبیت تکرارپذیر آماده' : ' تثبیت تکرارپذیر یافت نشد'} ·
                  {scriptStatus.hasSchemaCacheReload ? ' تازه‌سازی کش اسکیما آماده' : ' تازه‌سازی کش اسکیما یافت نشد'}
                </p>
                <p>{migrationStatus.recommendationFa}</p>
              </div>
            )}
          </div>
        ) : (
          <Suspense fallback={<div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />در حال بارگذاری ابزار...</div>}>
            {activeView === 'diagnostics' && <DiagnosticModule />}
            {activeView === 'isolation' && !isReadOnlySupport && <TenantIsolationVerificationStudio />}
            {activeView === 'qa' && !isReadOnlySupport && <PreLaunchAcceptanceStudio />}
            {activeView === 'stress' && !isReadOnlySupport && (
              <div className="space-y-6">
                <AccountingVerificationStudio standalone />
                <StressTestEngineStudio standalone />
              </div>
            )}
          </Suspense>
        )}
      </div>
    </section>
  );
};

export default AdminInfrastructureTab;
