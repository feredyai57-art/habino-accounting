import React, { useState, useEffect, useRef } from 'react';
import { useAccounting } from '../lib/store';
import { formatCurrency } from '../lib/currencyUtils';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileText,
  CreditCard,
  Users,
  AlertCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Percent,
  Layers,
  Activity,
  ChevronLeft,
  Info,
  Trash2,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Key,
  X,
  BookOpen
} from 'lucide-react';
import { getCashflowInsights } from '../services/geminiService';
import { calculateAccountingCycle, calculateInvoiceNetSalesAmount } from '../lib/financialAccountingEngine';
import { TenantWorkflowWelcomeModal } from './TenantWorkflowWelcomeModal';
import { fromPostgresDate } from '../lib/dateUtils';
import { isModuleRelevantToGuild } from '../lib/moduleVisibility';
import { getTransactionPurpose } from '../lib/transactionAccounting';
import { loadEquityRecords } from '../lib/equityRepository';
import { validateFixedAssetOpeningRegister } from '../lib/openingPeriodValidation';
import { FixedAssetRecord } from '../types';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

export const Dashboard: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    invoices,
    checks,
    transactions,
    clients,
    inventory,
    projects,
    bankAccounts,
    accountingEntries,
    settings,
    activeTenant,
    currentUser,
    canAccessModule,
    hasPermission,
    updateSettings,
    reconcileLedgerAndOpeningBalances,
    executeFactoryReset
  } = useAccounting();
  const canShowModule = (moduleId: string): boolean =>
    canAccessModule(moduleId).allowed &&
    isModuleRelevantToGuild(moduleId, activeTenant?.guildType);
  const canManageWorkspace = currentUser?.role === 'super_admin' ||
    hasPermission('tenant:manage_settings');
  const [insights, setInsights] = useState<string>('');
  const [loadingInsights, setLoadingInsights] = useState<boolean>(false);
  const [showPnlDetails, setShowPnlDetails] = useState<boolean>(false);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetMode, setResetMode] = useState<'preserve_inventory' | 'full'>('preserve_inventory');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetNoticeKind, setResetNoticeKind] = useState<'success' | 'error' | 'warning'>('success');
  const [confirmPhraseInput, setConfirmPhraseInput] = useState<string>('');
  const [acknowledgedRisk, setAcknowledgedRisk] = useState<boolean>(false);
  const [resetProgressStep, setResetProgressStep] = useState<string>('');
  const [showWelcomeGuide, setShowWelcomeGuide] = useState<boolean>(false);
  const [isPostResetGuide, setIsPostResetGuide] = useState<boolean>(false);
  const openingStartInitiatedRef = useRef(false);

  const showResetNotice = (message: string, kind: 'success' | 'error' | 'warning') => {
    setResetNotice(message);
    setResetNoticeKind(kind);
  };

  const activeProjects = projects.filter(project => project.status !== 'completed');
  const openingStatusForGuide = settings.openingPeriodStatus === 'completed' &&
    settings.openingPeriodStandardVersion !== 2
    ? undefined
    : settings.openingPeriodStatus;

  useEffect(() => {
    // Welcome guide only for the current tenant's actual opening-period state.
    // Do not show it for fresh tenants or when another tenant was reset.
    if (settings.openingPeriodStatus === 'completed' && settings.openingPeriodStandardVersion === 2) {
      setShowWelcomeGuide(false);
      return;
    }
    if (settings.openingPeriodStatus === 'completed') {
      setShowWelcomeGuide(true);
      return;
    }
    if (settings.openingPeriodStatus === 'in_progress') {
      if (!openingStartInitiatedRef.current) {
        setShowWelcomeGuide(true);
      }
      return;
    }
    setShowWelcomeGuide(false);
  }, [settings.openingPeriodStatus, settings.openingPeriodStandardVersion]);

  const handleStartOpeningPeriod = async () => {
    if (settings.openingPeriodStatus === 'completed' && settings.openingPeriodStandardVersion === 2) return;
    openingStartInitiatedRef.current = true;
    try {
      const result = await updateSettings({ openingPeriodStatus: 'in_progress' });
      if (!result.success) {
        throw new Error(result.message || 'شروع عملیات اول دوره ذخیره نشد.');
      }
    } catch (error) {
      openingStartInitiatedRef.current = false;
      throw error;
    }
  };

  const handleFinishOpeningPeriod = async () => {
    const invalidInventory = inventory.filter(item => {
      const stock = Number(item.stock);
      const buyPrice = Number(item.buyPrice);
      return item.type !== 'service' &&
        (!Number.isFinite(stock) || stock < 0 || (stock > 0 && (!Number.isFinite(buyPrice) || buyPrice <= 0)));
    });
    if (invalidInventory.length > 0) {
      const names = invalidInventory.slice(0, 3).map(item => item.name).join('، ');
      throw new Error(`برای کالاهای دارای موجودی، تعداد معتبر و بهای خرید مثبت ثبت کنید: ${names}`);
    }

    const invalidBankAccounts = bankAccounts.filter(account => {
      const balance = Number(account.balance ?? 0);
      return !Number.isFinite(balance) || balance < 0;
    });
    if (invalidBankAccounts.length > 0) {
      const names = invalidBankAccounts.slice(0, 3).map(account => account.bankName).join('، ');
      throw new Error(`مانده نقد و بانک باید عدد معتبر و نامنفی باشد: ${names}`);
    }

    const openingTenantId = activeTenant?.id && activeTenant.id !== 'all'
      ? activeTenant.id
      : currentUser?.tenantId || 'tenant-main';
    const fixedAssets = await loadEquityRecords<FixedAssetRecord>('fixedAssets', openingTenantId);
    const fixedAssetErrors = validateFixedAssetOpeningRegister(accountingEntries, fixedAssets);
    if (fixedAssetErrors.length > 0) {
      throw new Error(fixedAssetErrors.join('\n'));
    }

    const report = reconcileLedgerAndOpeningBalances();
    if (report.openingWorkflowErrors?.length) {
      throw new Error(report.openingWorkflowErrors.join('\n'));
    }
    if (!report.isBalanced) {
      throw new Error('تراز افتتاحیه متوازن نیست. اطلاعات و مانده‌های ثبت‌شده را بررسی و دوباره تلاش کنید.');
    }
    const result = await updateSettings({ openingPeriodStatus: 'completed', openingPeriodStandardVersion: 2 });
    if (!result.success) {
      throw new Error(result.message || 'پایان عملیات اول دوره ذخیره نشد.');
    }
    setIsPostResetGuide(false);
    setShowWelcomeGuide(false);
  };

  const handleConfirmFactoryReset = async () => {
    const trimmedPhrase = confirmPhraseInput.trim();
    if (trimmedPhrase !== 'حذف داده‌های مالی' && trimmedPhrase.toUpperCase() !== 'RESET') {
      showResetNotice('خطای امنیتی: لطفاً عبارت «حذف داده‌های مالی» یا «RESET» را جهت تأیید تایپ فرمایید.', 'warning');
      return;
    }

    if (!acknowledgedRisk) {
      showResetNotice('لطفاً گزینه پذیرش مسئولیت انهدام دائمی داده‌ها را علامت بزنید.', 'warning');
      return;
    }

    setIsResetting(true);
    setResetProgressStep('در حال ابطال صف‌های آفلاین و پاکسازی کش محلی...');
    let completedResetMessage = '';
    try {
      setTimeout(() => {
        setResetProgressStep('در حال اجرای پایپلاین انهدام ابری در سوپابیس (Supabase RPC)...');
      }, 700);

      const res = await executeFactoryReset(resetMode, trimmedPhrase);
      if (!res.success) {
        showResetNotice(`ریست انجام نشد و داده‌های این دستگاه پاک نشده‌اند. ${res.message}`, 'error');
        return;
      }
      completedResetMessage = res.message;
      showResetNotice(res.message, 'success');
      setShowResetModal(false);
      setConfirmPhraseInput('');
      setAcknowledgedRisk(false);
      openingStartInitiatedRef.current = false;
      setTimeout(() => setResetNotice(null), 10000);

      const openingStatus = await updateSettings({ openingPeriodStatus: 'in_progress' });
      if (!openingStatus.success) {
        showResetNotice(`${res.message} توجه: وضعیت شروع دوره مالی ذخیره نشد. ${openingStatus.message || ''}`, 'warning');
        return;
      }
      setResetProgressStep('');
      setIsPostResetGuide(true);
      setShowWelcomeGuide(true);
    } catch (e: any) {
      showResetNotice(
        completedResetMessage
          ? `ریست فکتوری با موفقیت انجام شد. ${completedResetMessage} توجه: مرحله بعدی کامل نشد. ${e?.message || 'خطای سیستمی'}`
          : `خطا در بازنشانی کارخانه: ${e?.message || 'خطای سیستمی'}`,
        completedResetMessage ? 'warning' : 'error'
      );
    } finally {
      setIsResetting(false);
      setResetProgressStep('');
    }
  };

  // ۱. اجرای موتور جامع حسابداری استاندارد دوبل (Single Source of Financial Truth)
  const accounting = React.useMemo(() => {
    return calculateAccountingCycle({
      invoices,
      transactions,
      inventory,
      projects,
      checks,
      bankAccounts,
      clients
    });
  }, [invoices, transactions, inventory, projects, checks, bankAccounts, clients]);

  const { pnl, balanceSheet, ratios, cashFlow } = accounting;

  // Monthly financial aggregation for Recharts preview widget (تنها با داده‌های واقعی و بدون داده‌های کاذب)
  const monthlyStats = React.useMemo(() => {
    const persianMonthNames = [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
    ];
    const data = persianMonthNames.map((name, idx) => ({
      name,
      monthIndex: idx + 1,
      income: 0,
      cogs: 0,
      expense: 0,
      netProfit: 0,
    }));

    invoices.forEach(inv => {
      if (inv.is_deleted || inv.status === 'cancelled' || inv.status === 'draft') return;
      if (
        inv.type !== 'sale' &&
        inv.type !== 'service' &&
        inv.type !== 'sale_return'
      ) return;
      let mIdx = -1;
      const normalizedDate = fromPostgresDate(inv.date);
      if (normalizedDate) {
        const match = normalizedDate.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
          mIdx = parseInt(match[2], 10) - 1;
        }
      }
      if (mIdx >= 0 && mIdx < 12) {
        const isSalesReturn = inv.type === 'sale_return';
        data[mIdx].income += calculateInvoiceNetSalesAmount(inv) * (isSalesReturn ? -1 : 1);

        if (inv.items && inv.items.length > 0) {
          inv.items.forEach(it => {
            const qty = Number(it.quantity) || 0;
            const matchedInv = inventory.find(item =>
              (it.itemId && item.id === it.itemId) ||
              (item.name && it.description && item.name.trim().toLowerCase() === it.description.trim().toLowerCase())
            );
            const unitBuy = Number(it.metadata?.buyPrice) || Number(matchedInv?.buyPrice) || 0;
            data[mIdx].cogs += qty * unitBuy * (isSalesReturn ? -1 : 1);
          });
        }
      }
    });

    transactions.forEach(tx => {
      let mIdx = -1;
      const normalizedDate = fromPostgresDate(tx.date);
      if (normalizedDate) {
        const match = normalizedDate.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
          mIdx = parseInt(match[2], 10) - 1;
        }
      }
      if (mIdx >= 0 && mIdx < 12) {
        const purpose = getTransactionPurpose(tx);
        if (purpose === 'expense' && !tx.relatedInvoiceId) {
          data[mIdx].expense += (Number(tx.amount) || 0);
        } else if (purpose === 'revenue' && !tx.relatedInvoiceId) {
          data[mIdx].income += (Number(tx.amount) || 0);
        }
      }
    });

    data.forEach(item => {
      // سود خالص ماهانه بر اساس استاندارد: فروش منهای بهای تمام‌شده منهای هزینه‌های جاری
      item.netProfit = item.income - item.cogs - item.expense;
    });

    // به هیچ وجه داده‌های تستی تزریق نمی‌شود. داده‌های واقعی سال جاری برگردانده می‌شوند.
    return data;
  }, [invoices, transactions, inventory]);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoadingInsights(true);
      const res = await getCashflowInsights({
        totalIncome: pnl.netSales + pnl.otherIncomes,
        cogs: pnl.totalCogs,
        grossProfit: pnl.grossProfit,
        totalExpense: pnl.operatingExpenses,
        netProfit: pnl.netProfit,
        currentRatio: ratios.currentRatio,
        pendingReceivableChecks: cashFlow.pendingIncomingChecks,
        pendingPayableChecks: cashFlow.pendingOutgoingChecks,
        futureBalance: cashFlow.predictive30DayCash,
        totalInvoices: invoices.length,
        totalClients: clients.length
      });
      setInsights(res.insights);
      setLoadingInsights(false);
    };
    fetchInsights();
  }, [pnl.netProfit, cashFlow.predictive30DayCash]);

  return (
    <div className="space-y-4 rounded-2xl bg-[#f3f8f8] p-3 pb-5 text-[#193b4a]" id="dashboard-container">
      {/* Impersonation Mode Banner */}
      {currentUser?.role === 'super_admin' && activeTenant && (
        <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-center gap-4 animate-fadeIn" role="status">
          <div className="p-3 bg-amber-100 rounded-xl text-amber-700">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-900 text-sm">حالت نظارت — نمایش داده‌های مستأجر</p>
            <p className="text-amber-800 text-xs mt-0.5">
              شما به عنوان سوپرادمین در حال مشاهده داده‌های مالی مستأجر <strong>{activeTenant.name}</strong> ({activeTenant.id}) هستید.
              این حالت برای راهنمایی تلفنی و پشتیبانی فعال شده است. تمام عملیات در لاگ ممیزی ثبت می‌شوند.
            </p>
          </div>
          <span className="px-3 py-1 bg-amber-200 text-amber-900 rounded-full text-xs font-bold border border-amber-300">
            نظارت فعال
          </span>
        </div>
      )}

      {/* Header & Quick stats */}
      <div className="relative overflow-hidden rounded-2xl border border-[#dcebea] bg-white p-4 shadow-sm">
        <div className="absolute -left-12 -top-16 h-36 w-36 rounded-full bg-[#d8f1ed]/70 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2aa99d] to-[#38b9a5] text-white shadow-sm">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#193b4a]" id="dashboard-title">داشبورد یکپارچه هابینو</h1>
              <p className="text-xs text-[#71858a] mt-1">نمای کلی عملکرد مالی، پروژه‌ها و جریان نقدی کسب‌وکار</p>
            </div>
          </div>
          <span className="self-start rounded-full border border-[#b8e3d8] bg-[#edf9f5] px-2.5 py-1 text-[10px] font-bold text-[#228f82]">
            وضعیت مالی به‌روز است
          </span>
        </div>
        <div className="relative mt-3 flex items-center gap-1.5 flex-wrap border-t border-[#edf2f1] pt-3">
          {canShowModule('analytics') && <button
            onClick={() => onNavigate('analytics')}
            className="px-3.5 py-2 bg-[#e8f7f5] hover:bg-[#d8f1ed] text-[#238e83] border border-[#bde5de] rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            id="quick-analytics-btn"
          >
            <BarChart3 className="w-4 h-4" />
            <span>داشبورد تحلیلی ماهانه</span>
          </button>}
          {canShowModule('reports') && <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-2 bg-[#edf8f5] hover:bg-[#dff2ed] text-[#238e83] border border-[#c5e8df] rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            id="quick-reports-btn"
          >
            <BarChart3 className="w-4 h-4" />
            <span>صورت مالی و سود و زیان</span>
          </button>}
          {canManageWorkspace && <button
            onClick={() => {
              setIsPostResetGuide(false);
              setShowWelcomeGuide(true);
            }}
            className="px-3.5 py-2 bg-[#eef6fa] hover:bg-[#dceef6] text-[#277bb5] border border-[#c5e1ed] rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            id="workflow-guide-btn"
            title="راهنمای گردش عملیات مالی و قوانین ۹‌گانه هابینو"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#277bb5]" />
            <span>راهنمای گردش کار</span>
          </button>}
          {canManageWorkspace && <button
            onClick={() => setShowResetModal(true)}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            id="factory-reset-btn"
            title="ریست و بازگردانی به تنظیمات کارخانه (پاکسازی پایگاه داده و کش سیستم)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>ریست و تنظیم کارخانه</span>
          </button>}
          {canShowModule('invoices') && <button
            onClick={() => onNavigate('invoices')}
            className="px-4 py-2 bg-[#2aa99d] hover:bg-[#238e83] text-white rounded-xl text-sm font-medium transition-colors shadow-sm cursor-pointer"
            id="quick-new-invoice-btn"
          >
            + صدور فاکتور جدید
          </button>}
          {canShowModule('checks') && <button
            onClick={() => onNavigate('checks')}
            className="px-4 py-2 bg-[#b79a4a] hover:bg-[#9f8439] text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
            id="quick-new-check-btn"
          >
            ثبت چک صیادی
          </button>}
        </div>
      </div>

      {/* اعلان نتیجه بازنشانی کارخانه */}
      {resetNotice && (
        <div
          role={resetNoticeKind === 'error' ? 'alert' : 'status'}
          className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between gap-2 animate-fadeIn shadow-xs ${
            resetNoticeKind === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : resetNoticeKind === 'warning'
                ? 'bg-amber-50 border border-amber-200 text-amber-900'
                : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {resetNoticeKind === 'success'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              : resetNoticeKind === 'warning'
                ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{resetNotice}</span>
          </div>
          <button
            onClick={() => setResetNotice(null)}
            className={resetNoticeKind === 'success'
              ? 'text-emerald-700 hover:text-emerald-900'
              : resetNoticeKind === 'warning'
                ? 'text-amber-700 hover:text-amber-900'
                : 'text-rose-700 hover:text-rose-900'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {canShowModule('projects') && activeProjects.length > 0 && (
        <section className="rounded-2xl border border-[#dcebea] bg-white p-4 shadow-sm" aria-labelledby="dashboard-projects-title">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 id="dashboard-projects-title" className="text-sm font-bold text-[#193b4a]">پروژه‌های جاری</h2>
              <p className="mt-0.5 text-[10px] text-[#82979a]">نمایش سریع پیشرفت پروژه‌های فعال</p>
            </div>
            <button type="button" onClick={() => onNavigate('projects')} className="text-[11px] font-bold text-[#2aa99d] hover:text-[#238e83]">
              مشاهده همه
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {activeProjects.slice(0, 3).map((project, index) => {
              const progress = Math.max(0, Math.min(100, Math.round(((project.totalIncome || 0) / Math.max(project.budget || 1, 1)) * 100)));
              const accents = ['from-[#2aa99d] to-[#58c6b6]', 'from-[#3aa98d] to-[#76c9a8]', 'from-[#b79a4a] to-[#d4bd70]'];
              return (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => onNavigate('projects')}
                  className="group rounded-xl border border-[#e1eceb] bg-[#f7fbfa] p-3 text-right transition-colors hover:border-[#b8ddd8] hover:bg-[#eff9f7]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-[#315866]">{project.title || 'پروژه بدون عنوان'}</span>
                    <span className="text-[10px] font-black text-[#718b91]">{progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e1eceb]">
                    <div className={`h-full rounded-full bg-gradient-to-l ${accents[index % accents.length]}`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{project.clientName || 'بدون طرف حساب'}</span>
                    <span className="text-[#2aa99d] group-hover:underline">جزئیات</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Metric Cards Grid - بر اساس استانداردهای دوبل و GAAP */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4" id="dashboard-metrics-grid">
        {/* ۱. فروش و درآمدهای عملیاتی */}
        <div className="bg-white p-4 rounded-2xl border border-[#dcebea] shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-[#71858a] text-sm">
            <span className="font-medium text-[#315866]">فروش و درآمدهای عملیاتی</span>
            <div className="p-2 bg-[#e6f7f3] text-[#229b8b] rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-[#193b4a]">
            {formatCurrency(pnl.netSales + pnl.otherIncomes, settings.currency)}
          </p>
          <div className="flex items-center justify-between text-xs text-[#71858a] pt-1 border-t border-[#edf2f1]">
            <span className="flex items-center gap-1 text-[#229b8b] font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>فروش خالص</span>
            </span>
            <span className="text-[11px] font-mono text-[#9aabad]">
              {pnl.salesDiscounts > 0 ? `تخفیفات: ${formatCurrency(pnl.salesDiscounts, settings.currency)}` : 'بدون تخفیف ثبت‌شده'}
            </span>
          </div>
        </div>

        {/* ۲. بهای تمام‌شده کالا و خدمات (COGS) */}
        <div className="bg-white p-4 rounded-2xl border border-[#dcebea] shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-[#71858a] text-sm">
            <span className="font-medium text-[#315866]">بهای تمام‌شده کالا و خدمات</span>
            <div className="p-2 bg-[#fbf4df] text-[#b1913e] rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-[#193b4a]">
            {formatCurrency(pnl.totalCogs, settings.currency)}
          </p>
          <div className="flex items-center justify-between text-xs text-[#71858a] pt-1 border-t border-[#edf2f1]">
            <span className="text-[#b1913e] font-medium">
              {pnl.goodsCost > 0 ? 'بهای خرید اقلام انبار' : (pnl.servicesCost > 0 ? 'هزینه مستقیم خدمات' : 'فاقد اقلام کالایی')}
            </span>
            <span className="text-[11px] font-mono text-slate-400">COGS کالا و پروژه</span>
          </div>
        </div>

        {/* ۳. سود خالص واقعی دوره */}
        <div className="bg-white p-4 rounded-2xl border border-[#dcebea] shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-[#71858a] text-sm">
            <span className="font-medium text-[#315866]">سود خالص واقعی دوره</span>
            <div className={`p-2 rounded-lg ${pnl.netProfit >= 0 ? 'bg-[#e8f7f5] text-[#2aa99d]' : 'bg-rose-50 text-rose-600'}`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-2xl font-bold ${pnl.netProfit >= 0 ? 'text-[#193b4a]' : 'text-rose-600'}`}>
              {formatCurrency(pnl.netProfit, settings.currency)}
            </p>
            <span className={`text-[11px] px-2 py-0.5 font-bold rounded-full border ${
              pnl.netMarginPercent >= 20
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : pnl.netMarginPercent > 0
                ? 'bg-[#e8f7f5] text-[#238e83] border-[#bde5de]'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              حاشیه: {pnl.netMarginPercent.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#71858a] pt-1 border-t border-[#edf2f1]">
            <span>سود ناخالص: {formatCurrency(pnl.grossProfit, settings.currency)}</span>
            {canShowModule('reports') && <button
              type="button"
              onClick={() => setShowPnlDetails(!showPnlDetails)}
              className="text-[11px] text-[#2aa99d] hover:text-[#238e83] font-semibold cursor-pointer underline flex items-center gap-0.5"
            >
              <span>{showPnlDetails ? 'بستن فرمول' : 'مشاهده فرمول'}</span>
            </button>}
          </div>
        </div>

        {/* ۴. موجودی نقد و بانک‌ها */}
        <div className="bg-white p-4 rounded-2xl border border-[#dcebea] shadow-sm space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-[#71858a] text-sm">
            <span className="font-medium text-[#315866]">موجودی صندوق و بانک‌ها</span>
            <div className="p-2 bg-[#e8f7f5] text-[#2aa99d] rounded-lg">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-[#193b4a]">
            {formatCurrency(cashFlow.actualAvailableCash, settings.currency)}
          </p>
          <div className="flex items-center justify-between text-xs text-[#71858a] pt-1 border-t border-[#edf2f1]">
            <span className="text-[#2aa99d] font-medium">
              پیش‌بینی ۳۰ روزه:
            </span>
            <span className="font-bold text-[#315866]">
              {formatCurrency(cashFlow.predictive30DayCash, settings.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* P&L Step-by-Step Chain Indicator (شفاف‌سازی زنجیره سود مطابق استاندارد) */}
      {showPnlDetails && canShowModule('reports') && (
        <div className="bg-[#b79a4a] text-white p-5 rounded-2xl border border-[#9f8439] shadow-md space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-[#d4bd70] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-white/20 text-white rounded-lg">
                <Info className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-white">زنجیره استاندارد محاسبه سود (P&L Reconciliation)</h4>
            </div>
            <span className="text-xs text-slate-400">انطباق ۱۰۰٪ با استاندارد سازمان حسابرسی ایران و GAAP</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-[#9f8439]/70 p-3 rounded-xl border border-[#d4bd70]/60 space-y-1">
              <span className="text-slate-400">۱. فروش خالص</span>
              <p className="text-base font-bold text-emerald-400">{formatCurrency(pnl.netSales, settings.currency)}</p>
              <p className="text-[11px] text-slate-400">فروش کل منهای تخفیفات و برگشتی‌ها</p>
            </div>

            <div className="bg-[#9f8439]/70 p-3 rounded-xl border border-[#d4bd70]/60 space-y-1">
              <span className="text-slate-400">۲. کسر بهای تمام‌شده (COGS)</span>
              <p className="text-base font-bold text-amber-400">- {formatCurrency(pnl.totalCogs, settings.currency)}</p>
              <p className="text-[11px] text-slate-400">قیمت خرید کالاها از انبار + هزینه مستقیم خدمات</p>
            </div>

            <div className="bg-[#9f8439]/70 p-3 rounded-xl border border-[#d4bd70]/60 space-y-1">
              <span className="text-slate-400">۳. سود ناخالص دوره</span>
              <p className="text-base font-bold text-white">= {formatCurrency(pnl.grossProfit, settings.currency)}</p>
              <p className="text-[11px] text-slate-400">حاشیه سود ناخالص: {pnl.grossMarginPercent.toFixed(1)}%</p>
            </div>

            <div className="bg-[#9f8439]/70 p-3 rounded-xl border border-[#d4bd70]/60 space-y-1">
              <span className="text-slate-400">۴. کسر هزینه‌های جاری (OPEX)</span>
              <p className="text-base font-bold text-rose-400">- {formatCurrency(pnl.operatingExpenses, settings.currency)}</p>
              <p className="text-[11px] text-slate-400">هزینه‌های اداری، کرایه، دستمزد و مخارج عمومی</p>
            </div>
          </div>

          <div className="bg-[#9f8439] border border-[#d4bd70] p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-white">
              <strong>نتیجه حسابداری نهایی:</strong> سود خالص واقعی هابینو برابر است با{' '}
              <span className="text-white font-bold">{formatCurrency(pnl.netProfit, settings.currency)}</span> با حاشیه سود خالص{' '}
              <span className="text-white font-bold">{pnl.netMarginPercent.toFixed(1)}%</span>.
            </span>
            <button
              onClick={() => onNavigate('reports')}
              className="text-xs text-white hover:text-[#fff7d6] font-bold underline shrink-0 cursor-pointer"
            >
              مشاهده صورت سود و زیان رسمی ←
            </button>
          </div>
        </div>
      )}

      {/* CFO Financial Health Ratios Toolbar (نوار پایش سلامت مالی و نقدینگی) */}
      {canShowModule('reports') && <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#dcebea] shadow-sm space-y-3" id="cfo-financial-health-bar">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-50 text-cyan-600 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#193b4a] flex items-center gap-2">
                نوار پایش سلامت مالی و نقدینگی (CFO Health Monitor)
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                  ratios.liquidityStatus === 'stable'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : ratios.liquidityStatus === 'watch'
                    ? 'bg-[#e8f7f5] text-[#238e83] border-[#bde5de]'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {ratios.liquidityStatus === 'stable' ? 'وضعیت پایدار' : (ratios.liquidityStatus === 'watch' ? 'تحت رصد' : 'هشدار کنترل نقدینگی')}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{ratios.liquidityMessageFa}</p>
            </div>
          </div>
          <div className="text-xs text-slate-400 font-mono self-end sm:self-center">
            سرمایه در گردش: {formatCurrency(balanceSheet.workingCapital, settings.currency)}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {/* نسبت جاری */}
          <div className="bg-[#f7fbfa] border border-[#e1eceb] p-3 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-[#71858a]">
              <span>نسبت جاری (Current)</span>
              <span className="text-[10px] text-slate-400">حداقل ۱.۲</span>
            </div>
            <p className={`text-lg font-black ${ratios.currentRatio >= 1.2 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {!Number.isFinite(ratios.currentRatio) ? '∞ (بدون بدهی)' : ratios.currentRatio}
            </p>
            <p className="text-[10px] text-slate-400">دارایی جاری ÷ بدهی جاری</p>
          </div>

          {/* نسبت آنی / سریع */}
          <div className="bg-[#f7fbfa] border border-[#e1eceb] p-3 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-[#71858a]">
              <span>نسبت سریع (Quick)</span>
              <span className="text-[10px] text-slate-400">حداقل ۱.۰</span>
            </div>
            <p className={`text-lg font-black ${ratios.quickRatio >= 1.0 ? 'text-[#2aa99d]' : 'text-amber-600'}`}>
              {!Number.isFinite(ratios.quickRatio) ? '∞ (تعهدات صفر)' : ratios.quickRatio}
            </p>
            <p className="text-[10px] text-slate-400">نقدشونده بدون انبار ÷ بدهی</p>
          </div>

          {/* حاشیه سود ناخالص */}
          <div className="bg-[#f7fbfa] border border-[#e1eceb] p-3 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-[#71858a]">
              <span>حاشیه سود ناخالص</span>
              <Percent className="w-3 h-3 text-slate-400" />
            </div>
            <p className="text-lg font-black text-[#193b4a]">
              {pnl.grossMarginPercent.toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-400">سود ناخالص ÷ فروش خالص</p>
          </div>

          {/* ارزش دفتری انبار */}
          <div className="bg-[#f7fbfa] border border-[#e1eceb] p-3 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-[#71858a]">
              <span>موجودی انبار (بهای خرید)</span>
              <Layers className="w-3 h-3 text-slate-400" />
            </div>
            <p className="text-lg font-black text-[#193b4a]">
              {formatCurrency(balanceSheet.inventoryValuation, settings.currency)}
            </p>
            <p className="text-[10px] text-slate-400">سرمایه ذخیره‌شده در کالا</p>
          </div>
        </div>
      </div>}

      {/* AI Synapse Advisor & Diagnostic Quick Widget */}
      {(canShowModule('synapse') || canShowModule('diagnostics')) && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {canShowModule('synapse') && <div className={`${canShowModule('diagnostics') ? 'lg:col-span-2' : 'lg:col-span-3'} bg-gradient-to-r from-[#b79a4a] via-[#c6aa58] to-[#2aa99d] text-white p-6 rounded-2xl shadow-sm relative overflow-hidden`} id="synapse-ai-card">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-500/30 shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  هسته تحلیلی سیناپس (AI CFO)
                  <span className="text-xs font-normal px-2 py-0.5 bg-cyan-500/30 border border-cyan-400/30 rounded-full text-cyan-200">
                    تحلیل آنلاین
                  </span>
                </h3>
              </div>
              {loadingInsights ? (
                <p className="text-sm text-cyan-200/80 animate-pulse">در حال تحلیل دفاتر دوبل و اسناد مالی...</p>
              ) : (
                <p className="text-sm text-slate-200 leading-relaxed">{insights || 'تراز دفاتر در سطح بهینه قرار دارد.'}</p>
              )}
            </div>
          </div>
        </div>}

        {/* Diagnostics Quick Status Card */}
        {canShowModule('diagnostics') && <div className="bg-white p-5 rounded-2xl border border-[#dcebea] shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#193b4a]">پایش و عیب‌یاب دفاتر</h4>
                <span className="text-[10px] text-[#229b8b] font-bold">تراز ۱۰۰٪ و بدون مغایرت</span>
              </div>
            </div>
            <span className="text-xs font-black text-[#193b4a] bg-[#edf6f5] px-2.5 py-1 rounded-lg">۱۰۰٪</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            سیستم تراز آزمایشی، عدم وجود رکوردهای یتیم و سلامت دفاتر دوبل را تایید می‌کند.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('diagnostics')}
              className="py-2 bg-[#b79a4a] hover:bg-[#9f8439] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
            >
              پنل عیب‌یابی
            </button>
            {canShowModule('agents_studio') && <button
              type="button"
              onClick={() => onNavigate('agents_studio')}
              className="py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer text-center flex items-center justify-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>استودیو ۵ ایجنت</span>
            </button>}
          </div>
        </div>}
      </div>}

      {/* Monthly Financial Performance Analytics Card (Recharts) */}
      {canShowModule('analytics') && <div className="bg-white p-6 rounded-2xl border border-[#dcebea] shadow-sm space-y-4" id="monthly-analytics-preview-widget">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#edf2f1] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#193b4a] flex items-center gap-2">
                وضعیت مالی ماهانه (درآمد، هزینه و سود خالص)
                <span className="text-[10px] font-normal px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200/60 rounded-md">
                  مبتنی بر Recharts
                </span>
              </h3>
              <p className="text-xs text-[#71858a] mt-0.5">
                بررسی روند ماهانه درآمد و هزینه‌های عملیاتی به همراه خط روند سود خالص
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('analytics')}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#2aa99d] hover:bg-[#238e83] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            <span>مشاهده داشبورد تحلیلی جامع</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Monthly KPI Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#e8f7f5] border border-[#c5e8df] p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs text-[#237e75] font-medium">مجموع درآمد دوره</span>
            <span className="text-sm font-bold text-[#228f82]">
              {formatCurrency(monthlyStats.reduce((s, m) => s + m.income, 0), settings.currency)}
            </span>
          </div>
          <div className="bg-[#fbf4df] border border-[#eee0ae] p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs text-[#8b7332] font-medium">مجموع هزینه‌ها</span>
            <span className="text-sm font-bold text-[#9b7c28]">
              {formatCurrency(monthlyStats.reduce((s, m) => s + m.expense, 0), settings.currency)}
            </span>
          </div>
          <div className="bg-[#eaf2fa] border border-[#c7dfef] p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs text-[#28698e] font-medium">سود خالص انباشته</span>
            <span className="text-sm font-bold text-[#2aa99d]">
              {formatCurrency(monthlyStats.reduce((s, m) => s + m.netProfit, 0), settings.currency)}
            </span>
          </div>
        </div>

        {/* Chart Container */}
        <div className="h-72 w-full pt-2" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyStats} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${(val / 1000000).toLocaleString('fa-IR')}M`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#b79a4a] text-white p-3 rounded-xl shadow-lg border border-[#9f8439] text-xs space-y-1 text-right font-sans" dir="rtl">
                        <p className="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-300">{label}</p>
                        {payload.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5" style={{ color: item.color }}>
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                              {item.name}:
                            </span>
                            <span className="font-bold text-white">
                              {formatCurrency(Number(item.value), settings.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                formatter={(val) => <span className="text-slate-600 font-sans text-xs">{val}</span>}
              />
              <Bar dataKey="income" name="درآمد" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" name="هزینه" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line
                type="monotone"
                dataKey="netProfit"
                name="سود خالص"
                stroke="#6366f1"
                strokeWidth={3}
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#ffffff' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>}

      {/* Recent Invoices & Checks Split */}
      {(canShowModule('invoices') || canShowModule('checks')) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoices */}
        {canShowModule('invoices') && <div className="bg-white p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2aa99d]" />
              آخرین فاکتورها
            </h3>
            <button onClick={() => onNavigate('invoices')} className="text-xs text-[#2aa99d] hover:underline">
              مشاهده همه
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {invoices.slice(0, 4).map(inv => (
              <div key={inv.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-slate-800">{inv.clientName || 'مشتری نامشخص'}</p>
                  <p className="text-xs text-slate-400">فاکتور #{inv.invoiceNumber} | {inv.date}</p>
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800">{formatCurrency(inv.grandTotal, settings.currency)}</p>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-md ${
                    inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {inv.status === 'paid' ? 'تسویه شده' : 'در انتظار پرداخت'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>}

        {/* Checks */}
        {canShowModule('checks') && <div className="bg-white p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-600" />
              چک‌های صیادی پیش‌رو
            </h3>
            <button onClick={() => onNavigate('checks')} className="text-xs text-[#2aa99d] hover:underline">
              مشاهده همه
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {checks.slice(0, 4).map(chk => (
              <div key={chk.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-slate-800">{chk.bankName} - {chk.clientName}</p>
                  <p className="text-xs text-slate-400">سررسید: {chk.dueDate} | #{chk.checkNumber}</p>
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800">{formatCurrency(chk.amount, settings.currency)}</p>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-md ${
                    chk.status === 'cleared' ? 'bg-emerald-50 text-emerald-700' :
                    chk.status === 'endorsed' ? 'bg-sky-50 text-sky-700' :
                    chk.status === 'bounced' ? 'bg-rose-50 text-rose-700' :
                    chk.status === 'cancelled' ? 'bg-slate-100 text-slate-600' :
                    'bg-cyan-50 text-cyan-700'
                  }`}>
                    {chk.status === 'cleared' ? 'وصول شده' :
                     chk.status === 'endorsed' ? `خرج‌شده به ${chk.metadata?.endorsedToClientName || 'طرف‌حساب'}` :
                     chk.status === 'bounced' ? 'برگشتی' :
                     chk.status === 'cancelled' ? 'باطل‌شده' :
                     'در جریان وصول'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>}

      {/* Factory Reset Double-Confirmation Modal Dialog */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-4 my-8">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    ریست فکتوری و تنظیم کارخانه (دوگانه: لوکال + ابری)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    نابودی کامل و بازگشت به نقطه صفر در هر دو لایه IndexedDB و دیتابیس ابری سوپابیس
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isResetting) {
                    setShowResetModal(false);
                    setConfirmPhraseInput('');
                    setAcknowledgedRisk(false);
                  }
                }}
                disabled={isResetting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* گارد امنیتی حفظ اطلاعات مستأجر */}
            <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-emerald-950 block">حفظ هویت سازمانی و لایسنس مستأجر (Tenant Profile Guard)</span>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  رکورد مستأجر در جدول سازمان‌ها، حساب‌های کاربری، رمزهای عبور و وضعیت لایسنس شما ۱۰۰٪ مصون بوده و حذف نخواهند شد؛ صرفاً تراکنش‌ها، اسناد و صورتحساب‌های مالی صفر می‌گردند.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs text-slate-700 font-medium">
                سطح پاکسازی داده‌های مالی را مشخص فرمایید:
              </p>

              {/* گزینه اول: حفظ انبار کالاها و پاکسازی کلیه اسناد و مخاطبین */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  resetMode === 'preserve_inventory'
                    ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="factoryResetMode"
                  disabled={isResetting}
                  checked={resetMode === 'preserve_inventory'}
                  onChange={() => setResetMode('preserve_inventory')}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">
                    پاکسازی اسناد مالی، فاکتورها، مخاطبین و بانک/صندوق (حفظ انبار کالاها)
                  </span>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    تمام فاکتورها، تراکنش‌ها، چک‌ها، اسناد دوبل، مخاطبین و حساب‌های بانکی/صندوق در لوکال و سوپابیس حذف می‌شوند، اما کالاهای انبار باقی می‌مانند.
                  </p>
                </div>
              </label>

              {/* گزینه دوم: ریست ۱۰۰٪ نقطه صفر */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  resetMode === 'full'
                    ? 'border-rose-500 bg-rose-50/50 ring-1 ring-rose-500'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="factoryResetMode"
                  disabled={isResetting}
                  checked={resetMode === 'full'}
                  onChange={() => setResetMode('full')}
                  className="mt-1 text-rose-600 focus:ring-rose-500"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-rose-800 block">
                    ریست کامل کارخانه نقطه صفر (حذف ۱۰۰٪ داده‌ها شامل مخاطبین، بانک، صندوق و انبار)
                  </span>
                  <p className="text-[11px] text-rose-600 leading-normal">
                    تمام داده‌های مالی، فاکتورها، مخاطبین، حساب‌های بانکی و صندوق، انبار کالاها و تنظیمات در حافظه محلی و دیتابیس ابری سوپابیس نابود شده و به صفر کارخانه بازمی‌گردند. فقط حساب کاربری و لایسنس حفظ می‌شوند.
                  </p>
                </div>
              </label>
            </div>

            {/* گارد امنیتی ۱: تایپ عبارت تأییدیه سخت‌گیرانه */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-500" />
                  تأییدیه امنیتی جهت انهدام قطعی داده‌ها:
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmPhraseInput('حذف داده‌های مالی')}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  درج عبارت «حذف داده‌های مالی»
                </button>
              </div>
              <input
                type="text"
                value={confirmPhraseInput}
                onChange={(e) => setConfirmPhraseInput(e.target.value)}
                disabled={isResetting}
                placeholder="عبارت «حذف داده‌های مالی» یا «RESET» را تایپ فرمایید"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 bg-white"
              />
            </div>

            {/* گارد امنیتی ۲: چک‌باکس پذیرش مسئولیت انهدام دائمی */}
            <label className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={acknowledgedRisk}
                onChange={(e) => setAcknowledgedRisk(e.target.checked)}
                disabled={isResetting}
                className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
              />
              <span className="text-[11px] leading-tight text-slate-600">
                تأیید می‌کنم که این عملیات غیرقابل بازگشت است و تمام اسناد، چک‌ها و تراکنش‌های ابری (Supabase) و کش‌های آفلاین این مستأجر نابود خواهند شد.
              </span>
            </label>

            {/* نمایش وضعیت گام‌به‌گام حین پردازش */}
            {isResetting && resetProgressStep && (
              <div className="p-3 bg-[#fbf4df] border border-[#eee0ae] rounded-xl text-xs text-[#8b7332] flex items-center gap-2 animate-pulse">
                <RotateCcw className="w-4 h-4 animate-spin text-[#b79a4a] shrink-0" />
                <span>{resetProgressStep}</span>
              </div>
            )}

            {/* دکمه‌های اقدام */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setConfirmPhraseInput('');
                  setAcknowledgedRisk(false);
                }}
                disabled={isResetting}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmFactoryReset}
                disabled={
                  isResetting ||
                  !acknowledgedRisk ||
                  (confirmPhraseInput.trim() !== 'حذف داده‌های مالی' && confirmPhraseInput.trim().toUpperCase() !== 'RESET')
                }
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
                  !acknowledgedRisk ||
                  (confirmPhraseInput.trim() !== 'حذف داده‌های مالی' && confirmPhraseInput.trim().toUpperCase() !== 'RESET')
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : resetMode === 'full'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isResetting ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال اجرای ریست دوگانه...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>تأیید نهایی و اجرای ریست فکتوری</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال راهنما و خوش‌آمدگویی گردش کار اولیه هابینو */}
      {canManageWorkspace && <TenantWorkflowWelcomeModal
        isOpen={showWelcomeGuide}
        onClose={() => setShowWelcomeGuide(false)}
        openingPeriodStatus={openingStatusForGuide}
        onStartOpeningPeriod={handleStartOpeningPeriod}
        onFinishOpeningPeriod={handleFinishOpeningPeriod}
        onNavigateToClients={() => onNavigate('clients')}
        onNavigateToInventory={() => onNavigate('inventory')}
        onNavigateToBanks={() => onNavigate('banks')}
        onNavigateToInvoices={() => onNavigate('invoices')}
        onNavigateToLedger={() => onNavigate('ledger')}
        tenantName={settings.name}
        isPostReset={isPostResetGuide}
        isSuperAdminContext={currentUser?.role === 'super_admin'}
      />}
    </div>
  );
};
