import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAccounting } from '../lib/store';
import { getSupabaseConfig, setSupabaseCredentials, testSupabaseDirectConnection } from '../lib/supabase';
import { createBackupSnapshot, downloadBackupJson, parseBackupFile } from '../lib/backupEngine';
import { offlineOutbox } from '../lib/offlineOutboxQueue';
import {
  Database,
  Cloud,
  CloudUpload,
  CloudDownload,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  FileDown,
  FileUp,
  Sliders,
  Check,
  Server,
  Layers,
  ShieldCheck,
  Info,
  Sparkles
} from 'lucide-react';

interface DataSourceSyncBadgeProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export const DataSourceSyncBadge: React.FC<DataSourceSyncBadgeProps> = ({
  variant = 'compact',
  className = ''
}) => {
  const {
    invoices,
    accountingEntries,
    clients,
    checks,
    transactions,
    inventory,
    bankAccounts,
    installments,
    projects,
    settings,
    license,
    activeTenant,
    activeTenantId,
    currentUser,
    isOnline,
    isSupabaseLive,
    syncFromSupabase,
    pushToSupabase,
    restoreFullBackup
  } = useAccounting();

  const [isOpen, setIsOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Supabase Config State
  const [showConfig, setShowConfig] = useState(false);
  const currentConfig = getSupabaseConfig();
  const [inputUrl, setInputUrl] = useState(currentConfig.url);
  const [inputKey, setInputKey] = useState(currentConfig.key);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCloudConnected = Boolean(isOnline && isSupabaseLive && currentConfig.isConfigured);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [isAligning, setIsAligning] = useState(false);

  // 0. Force Full Two-Way Cloud Alignment & Reset Synchronization
  const handleForceCloudAlignment = async () => {
    setIsAligning(true);
    setFeedback({ type: 'info', text: 'در حال استعلام مرجع ریست، تخلیه صف آفلاین و تطبیق دوطرفه با پایگاه ابری...' });
    try {
      const targetTenant = isSuperAdmin ? 'all' : (activeTenantId || 'tenant-main');

      // الف. استعلام بلادرنگ وضعیت ریست کارخانه از سرور ابری
      try {
        const resetRes = await fetch(`/api/tenant/reset-status?tenantId=${encodeURIComponent(targetTenant)}`);
        if (resetRes.ok) {
          const resetData = await resetRes.json();
          if (resetData.success && resetData.factory_reset_version) {
            const remoteVer = Number(resetData.factory_reset_version);
            localStorage.setItem(`habino_last_known_reset_version_${targetTenant}`, String(remoteVer));
            if (resetData.factory_reset_at) {
              localStorage.setItem(`habino_pnl_purged_at_${targetTenant}`, resetData.factory_reset_at);
              localStorage.setItem(`habino_factory_reset_${targetTenant}`, resetData.factory_reset_at);
            }
          }
        }
      } catch (_) {}

      // ب. اگر در این محیط اقلام انبار وجود دارند، ارسال به پایگاه ابری جهت تثبیت
      if (inventory.length > 0) {
        try {
          await pushToSupabase();
        } catch (_) {}
      }

      // ج. تخلیه صف آفلاین محلی به ابر
      try {
        await offlineOutbox.flushQueue();
      } catch (_) {}

      // د. دریافت و اعمال داده‌های ابری بر روی سیستم محلی
      const res = await syncFromSupabase(targetTenant);
      if (res.success) {
        setFeedback({
          type: 'success',
          text: `یکپارچه‌سازی و تطبیق با کلود با موفقیت کامل شد. تمام اسناد و انبار (${inventory.length} قلم کالا) با پایگاه ابری Supabase هم‌تراز شدند.`
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'خطا در واکشی داده‌های ابری.'
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطای غیرمنتظره در همگام‌سازی ابری.' });
    } finally {
      setIsAligning(false);
    }
  };

  // 1. Push Local Data to Supabase
  const handlePushData = async () => {
    setIsPushing(true);
    setFeedback({ type: 'info', text: 'در حال ارسال اتمیک داده‌های محلی به دیتابیس ابری...' });
    try {
      const res = await pushToSupabase();
      if (res.success) {
        const total = Object.values(res.upserted || {}).reduce((a, b) => a + b, 0);
        setFeedback({
          type: 'success',
          text: `همگام‌سازی ابری با موفقیت انجام شد. مجموع ${total} رکورد مالی در دیتابیس ابری به‌روزرسانی شد.`
        });
      } else {
        const errDetails = res.errors ? Object.entries(res.errors).map(([k, v]) => `${k}: ${v}`).join(' - ') : '';
        setFeedback({
          type: 'error',
          text: (res.message || 'خطا در ارسال داده‌ها به دیتابیس ابری.') + (errDetails ? ` (${errDetails})` : '')
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطای غیرمنتظره در ارسال ابری.' });
    } finally {
      setIsPushing(false);
    }
  };

  // 2. Pull Cloud Data to Local
  const handlePullData = async () => {
    setIsPulling(true);
    setFeedback({ type: 'info', text: 'در حال واکشی و یکسان‌سازی اسناد از دیتابیس ابری...' });
    try {
      const targetTenant = isSuperAdmin ? 'all' : (activeTenantId || 'tenant-main');
      const res = await syncFromSupabase(targetTenant);
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || 'اسناد مالی ابری با موفقیت دریافت و در سیستم جایگزین شدند.'
        });
      } else {
        setFeedback({ type: 'error', text: res.message || 'خطا در دریافت اطلاعات از سرور ابری.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در برقراری ارتباط با سرور ابری.' });
    } finally {
      setIsPulling(false);
    }
  };

  // 3. Export Local Data Snapshot
  const handleExportSnapshot = () => {
    try {
      const snapshot = createBackupSnapshot({
        invoices,
        checks,
        transactions,
        clients,
        inventory,
        installments,
        bankAccounts,
        projects,
        accountingEntries,
        settings,
        license
      }, activeTenantId || 'tenant-main');

      downloadBackupJson(snapshot);
      setFeedback({
        type: 'success',
        text: 'بسته داده‌های مالی با موفقیت استخراج شد. می‌توانید آن را در محیط‌های دیگر یا پیش‌نمایش بارگذاری کنید.'
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'خطا در ایجاد فایل خروجی: ' + (err?.message || '') });
    }
  };

  // 4. Import Snapshot File
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFeedback({ type: 'info', text: 'در حال اعتبارسنجی و بازیابی بسته داده...' });
    const result = await parseBackupFile(file);
    if (!result.success || !result.snapshot) {
      setFeedback({ type: 'error', text: result.error || 'فایل نامعتبر است.' });
      return;
    }

    try {
      restoreFullBackup(result.snapshot);
      setFeedback({
        type: 'success',
        text: `بسته داده با موفقیت بازیابی شد (${result.snapshot.summary.invoicesCount} فاکتور، ${result.snapshot.summary.ledgerEntriesCount} سند دفتر کل).`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'خطا در استقرار داده‌ها: ' + (err?.message || '') });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 5. Save Supabase Credentials
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setFeedback({ type: 'info', text: 'در حال بررسی اتصال به سرور Supabase...' });
    try {
      const test = await testSupabaseDirectConnection(inputUrl, inputKey);
      if (test.ok) {
        setSupabaseCredentials(inputUrl, inputKey);
        setShowConfig(false);
        setFeedback({
          type: 'success',
          text: `ارتباط با موفقیت برقرار شد (${test.latencyMs}ms). تنظیمات ذخیره گردید.`
        });
      } else {
        setFeedback({
          type: 'error',
          text: `تست اتصال ناموفق بود: ${test.error || test.statusText || 'خطای شبکه'}`
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'خطا در تست اتصال.' });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isSuperAdmin) return null;

  return (
    <>
      {/* Trigger Button / Badge */}
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${
          isCloudConnected
            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
        } ${className}`}
        title="وضعیت منبع داده و همگام‌سازی ابری هابینو"
      >
        {isCloudConnected ? (
          <>
            <Cloud className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span className="hidden sm:inline">دیتابیس ابری متصل</span>
            <span className="sm:hidden">ابر</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </>
        ) : (
          <>
            <HardDrive className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">سندباکس محلی</span>
            <span className="sm:hidden">لوکال</span>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </>
        )}
      </button>

      {/* Main Sync & Data Source Modal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-source-sync-title"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
          >
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${isCloudConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isCloudConnected ? <Database className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
                </div>
                <div>
                  <h3 id="data-source-sync-title" className="text-sm font-bold text-slate-900">مرکز مدیریت منبع داده و یکپارچه‌سازی ابری</h3>
                  <p className="text-[11px] text-slate-500">مستأجر فعال: {activeTenant?.name || 'سازمان اصلی'}</p>
                </div>
              </div>
              <button
                onClick={() => { setIsOpen(false); setFeedback(null); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="بستن پنجره مدیریت دیتابیس ابری"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              
              {/* Feedback Alert */}
              {feedback && (
                <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : feedback.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}>
                  {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />}
                  {feedback.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />}
                  {feedback.type === 'info' && <RefreshCw className="w-4 h-4 shrink-0 text-blue-600 animate-spin mt-0.5" />}
                  <span className="flex-1 leading-relaxed font-medium">{feedback.text}</span>
                </div>
              )}

              {/* Status Banner */}
              <div className={`p-3.5 rounded-xl border ${
                isCloudConnected
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : 'bg-amber-50/50 border-amber-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    {isCloudConnected ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        وضعیت: متصل به دیتابیس ابری (Live Supabase Cloud)
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        وضعیت: حافظه سندباکس محلی (Isolated Local Storage)
                      </>
                    )}
                  </span>
                  <button
                    onClick={() => setShowConfig(!showConfig)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    {showConfig ? 'بستن تنظیمات' : 'تنظیمات Supabase'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {isCloudConnected
                    ? 'داده‌های این محیط به صورت خودکار یا با یک کلیک با پایگاه داده ابری همگام می‌شوند و در تمامی دستگاه‌ها و پیش‌نمایش قابل مشاهده هستند.'
                    : 'اسناد مالی در حافظه ایزوله مرورگر ذخیره شده‌اند. برای مشاهده همین داده‌ها در محیط پیش‌نمایش و سایر سیستم‌ها، آن‌ها را به ابر ارسال نموده یا خروجی بسته داده دریافت کنید.'}
                </p>
              </div>

              {/* Supabase Inline Configuration */}
              {showConfig && (
                <form onSubmit={handleSaveConfig} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span>تنظیم آدرس و کلید اتصال به پایگاه داده Supabase</span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 font-semibold mb-1">آدرس سرور (Project URL):</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={inputUrl}
                      onChange={e => setInputUrl(e.target.value)}
                      placeholder="https://xyzcompany.supabase.co"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 font-semibold mb-1">کلید دسترسی (Anon Public Key):</label>
                    <input
                      type="password"
                      dir="ltr"
                      value={inputKey}
                      onChange={e => setInputKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={isTesting || !inputUrl.trim()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      ذخیره و تست اتصال
                    </button>
                  </div>
                </form>
              )}

              {/* Data Summary Stats */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-slate-700 font-bold mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    آمار اسناد مالی در حافظه این محیط:
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Tenant: {activeTenantId}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-slate-400 text-[10px]">فاکتورها</span>
                    <span className="font-bold text-slate-800 text-sm font-mono">{invoices.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-slate-400 text-[10px]">دفتر کل</span>
                    <span className="font-bold text-slate-800 text-sm font-mono">{accountingEntries.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-slate-400 text-[10px]">طرف حساب</span>
                    <span className="font-bold text-slate-800 text-sm font-mono">{clients.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-slate-400 text-[10px]">چک‌ها</span>
                    <span className="font-bold text-slate-800 text-sm font-mono">{checks.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="block text-slate-400 text-[10px]">تراکنش‌ها</span>
                    <span className="font-bold text-slate-800 text-sm font-mono">{transactions.length}</span>
                  </div>
                </div>
              </div>

              {/* Authenticated User Role Banner */}
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span className="text-slate-700 font-bold">هویت مجاز همگام‌سازی:</span>
                  <span className="text-indigo-900 font-semibold">
                    {currentUser ? currentUser.fullName : 'مهندس فرید تهرانی (بنیان‌گذار)'}
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md font-mono text-[10px] font-bold">
                  {currentUser?.role || 'super_admin'}
                </span>
              </div>

              {/* Cloud Sync Actions */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-emerald-600" />
                    همگام‌سازی مستقیم با پایگاه ابری:
                  </h4>
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
                    سازگار با چندمستأجری V1.0
                  </span>
                </div>

                {/* Primary Force Sync Button */}
                <button
                  onClick={handleForceCloudAlignment}
                  disabled={isAligning || isPushing || isPulling}
                  className="w-full p-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  title="استعلام بلادرنگ ریست، تخلیه صف آفلاین و همگام‌سازی کامل دوطرفه با پایگاه ابری"
                >
                  {isAligning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                  <span>همگام‌سازی اجباری دوطرفه و تطبیق با کلود (Force Cloud Alignment)</span>
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handlePushData}
                    disabled={isPushing || isAligning}
                    className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    {isPushing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                    <span>ارسال تمام داده‌ها به ابر (Push)</span>
                  </button>

                  <button
                    onClick={handlePullData}
                    disabled={isPulling || isAligning}
                    className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    {isPulling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                    <span>دریافت داده‌ها از ابر (Pull)</span>
                  </button>
                </div>
              </div>

              {/* Snapshot Export / Import Actions */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  انتقال آفلاین بین سیستم‌ها (Export / Import):
                </h4>
                <p className="text-[11px] text-slate-500">
                  می‌توانید با یک کلیک یک فایل پشتیبان کامل از دیتای لوکال دانلود کرده و در پیش‌نمایش بارگذاری کنید تا هر دو محیط کاملاً یکسان شوند.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleExportSnapshot}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-blue-600" />
                    <span>دانلود بسته داده (Export JSON)</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <FileUp className="w-4 h-4 text-indigo-600" />
                    <span>بارگذاری بسته داده (Import JSON)</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                معماری چندمستأجری ایزوله هابینو V1.0
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium cursor-pointer"
              >
                بستن
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
};
