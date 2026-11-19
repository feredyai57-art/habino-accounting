import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AccountingProvider, useAccounting } from './lib/store';
import { SiraFlowProvider } from './lib/siraflowStore';
import { Dashboard } from './components/Dashboard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OutboxSyncBadge } from './components/OutboxSyncBadge';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PlatformImpersonationBanner } from './components/PlatformImpersonationBanner';
import { LoginModal } from './components/LoginModal';
import { UpgradeModal } from './components/UpgradeModal';
import { HabinoLandingPage } from './components/HabinoLandingPage';
import { BazaarOnboardingModal } from './components/BazaarOnboardingModal';
import { SecurityGate } from './components/common/SecurityGates';
import { FUTURE_RELEASE_MODULES, PLATFORM_ONLY_MODULES, ROLE_DETAILS_FA } from './lib/authEngine';
import { ENABLE_OS_DESKTOP } from './lib/moduleVisibility';
import { lazyWithRetry } from './lib/lazyWithRetry';

const ISOLATED_ENGINEERING_MODULES = new Set([
  'roadmap', 'diagnostics', 'supabase_tester', 'pre_launch_qa', 'accounting_verification', 'agents_studio'
]);

const ThemeSynchronizer: React.FC = () => {
  useEffect(() => {
    const applyTheme = () => {
      const preference = localStorage.getItem('habino_desktop_theme');
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const hour = new Date().getHours();
      const isDark = preference === 'dark' || (
        preference !== 'light' && (systemDark || hour >= 19 || hour < 7)
      );
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    };

    applyTheme();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const timer = window.setInterval(applyTheme, 60_000);
    const handleThemeChange = () => applyTheme();
    mediaQuery.addEventListener?.('change', applyTheme);
    window.addEventListener('habino-theme-change', handleThemeChange);
    return () => {
      window.clearInterval(timer);
      mediaQuery.removeEventListener?.('change', applyTheme);
      window.removeEventListener('habino-theme-change', handleThemeChange);
    };
  }, []);

  return null;
};

// Lazy-loaded core tabs & heavy studios with resilient auto-retry
const Invoices = lazyWithRetry(() => import('./components/Invoices').then(m => ({ default: m.Invoices })));
const Checks = lazyWithRetry(() => import('./components/Checks').then(m => ({ default: m.Checks })));
const Transactions = lazyWithRetry(() => import('./components/Transactions').then(m => ({ default: m.Transactions })));
const Clients = lazyWithRetry(() => import('./components/Clients').then(m => ({ default: m.Clients })));
const Inventory = lazyWithRetry(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const Installments = lazyWithRetry(() => import('./components/Installments').then(m => ({ default: m.Installments })));
const Banks = lazyWithRetry(() => import('./components/Banks').then(m => ({ default: m.Banks })));
const FinancialProjects = lazyWithRetry(() => import('./components/FinancialProjects').then(m => ({ default: m.FinancialProjects })));
const Ledger = lazyWithRetry(() => import('./components/Ledger').then(m => ({ default: m.Ledger })));
const EquityCapitalManagement = lazyWithRetry(() => import('./components/EquityCapitalManagement').then(m => ({ default: m.EquityCapitalManagement })));
const Settings = lazyWithRetry(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const SynapseVoiceChat = lazyWithRetry(() => import('./components/SynapseVoiceChat').then(m => ({ default: m.SynapseVoiceChat })));
const AppHub = lazyWithRetry(() => import('./components/AppHub').then(m => ({ default: m.AppHub })));
const LicenseManager = lazyWithRetry(() => import('./components/LicenseManager').then(m => ({ default: m.LicenseManager })));
const UserManagementView = lazyWithRetry(() => import('./components/UserManagementView').then(m => ({ default: m.UserManagementView })));

const DiagnosticModule = lazyWithRetry(() => import('./components/DiagnosticModule').then(m => ({ default: m.DiagnosticModule })));
const RoadmapStudio = lazyWithRetry(() => import('./components/RoadmapStudio').then(m => ({ default: m.RoadmapStudio })));
const HabinoDesktop = lazyWithRetry(() => import('./components/HabinoDesktop').then(m => ({ default: (m as any).default || (m as any).HabinoDesktop })));
const BackupManager = lazyWithRetry(() => import('./components/BackupManager').then(m => ({ default: m.BackupManager })));
const Reports = lazyWithRetry(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const DecentralizedIdStudio = lazyWithRetry(() => import('./components/DecentralizedIdStudio').then(m => ({ default: m.DecentralizedIdStudio })));
const OpenCommerceStudio = lazyWithRetry(() => import('./components/OpenCommerceStudio').then(m => ({ default: m.OpenCommerceStudio })));
const PayrollStudio = lazyWithRetry(() => import('./components/PayrollStudio').then(m => ({ default: m.PayrollStudio })));
const BarcodeScannerStudio = lazyWithRetry(() => import('./components/BarcodeScannerStudio').then(m => ({ default: m.BarcodeScannerStudio })));
const FinancialAnalyticsDashboard = lazyWithRetry(() => import('./components/FinancialAnalyticsDashboard').then(m => ({ default: m.FinancialAnalyticsDashboard })));
const LiveAgentDiagnosticStudio = lazyWithRetry(() => import('./components/LiveAgentDiagnosticStudio').then(m => ({ default: m.LiveAgentDiagnosticStudio })));
const PreLaunchAcceptanceStudio = lazyWithRetry(() => import('./components/PreLaunchAcceptanceStudio').then(m => ({ default: m.PreLaunchAcceptanceStudio })));
const AccountingVerificationStudio = lazyWithRetry(() => import('./components/AccountingVerificationStudio').then(m => ({ default: m.AccountingVerificationStudio })));
const StressTestEngineStudio = lazyWithRetry(() => import('./components/StressTestEngineStudio').then(m => ({ default: m.StressTestEngineStudio })));
const TenantIsolationVerificationStudio = lazyWithRetry(() => import('./components/TenantIsolationVerificationStudio').then(m => ({ default: m.TenantIsolationVerificationStudio })));
const HabinoAdminPanel = lazyWithRetry(() => import('./components/HabinoAdminPanel').then(m => ({ default: m.HabinoAdminPanel })));
const PublicInvoiceView = lazyWithRetry(() => import('./components/PublicInvoiceView').then(m => ({ default: m.PublicInvoiceView })));

import {
  LayoutDashboard,
  BarChart3,
  FileText,
  CreditCard,
  Layers,
  Headphones,
  ArrowLeftRight,
  Users,
  Wrench,
  Landmark,
  FolderKanban,
  BookOpen,
  Settings as SettingsIcon,
  Activity,
  Bot,
  Grid,
  Sparkles,
  Menu,
  X,
  Monitor,
  LayoutGrid,
  ShieldCheck,
  Scale,
  Database,
  Key,
  Fingerprint,
  Globe,
  Compass,
  Calculator,
  ScanLine,
  Cpu,
  LogIn,
  AlertTriangle,
  ShieldAlert,
  Zap,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  );
  const [publicInvoiceToken, setPublicInvoiceToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const isAuthCallback =
      ['invite', 'recovery'].includes(params.get('auth') || '') ||
      ['invite', 'recovery'].includes(params.get('type') || '') ||
      ['invite', 'recovery'].includes(hashParams.get('type') || '') ||
      params.has('code') ||
      hashParams.has('access_token');
    const token = params.get('invoice_token') || params.get('share_token') ||
      (!isAuthCallback ? params.get('token') : null);
    if (token) return token;
    const match = window.location.pathname.match(/\/invoice\/view\/([^/?#]+)/);
    return match ? match[1] : null;
  });

  const [viewMode, setViewMode] = useState<'landing' | 'desktop' | 'classic'>(() => {
    const stored = (localStorage.getItem('habino_view_mode') as 'landing' | 'desktop' | 'classic') || 'landing';
    return stored === 'desktop' && !ENABLE_OS_DESKTOP ? 'classic' : stored;
  });
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [hasDismissedAdminRoute, setHasDismissedAdminRoute] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState<boolean>(false);
  const [bazaarOnboardingOpen, setBazaarOnboardingOpen] = useState<boolean>(false);
  const [showAdvancedStudios, setShowAdvancedStudios] = useState<boolean>(() => {
    return localStorage.getItem('habino_show_advanced_studios') === 'true';
  });
  const { currentUser, activeTenant, license, impersonationSession } = useAccounting();
  const isPlatformAdmin = currentUser?.role === 'super_admin';
  const isPlatformOperator = currentUser?.role === 'super_admin' || currentUser?.role === 'hubino_support';
  const isAdminRoute = typeof window !== 'undefined' && (
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/') ||
    new URLSearchParams(window.location.search).get('view') === 'admin'
  );

  useEffect(() => {
    const syncTheme = () => {
      setIsDarkMode(document.documentElement.dataset.theme === 'dark');
    };
    syncTheme();
    window.addEventListener('habino-theme-change', syncTheme);
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      window.removeEventListener('habino-theme-change', syncTheme);
      observer.disconnect();
    };
  }, []);

  const toggleWebTheme = () => {
    const preference = isDarkMode ? 'light' : 'dark';
    localStorage.setItem('habino_desktop_theme', preference);
    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = preference;
    window.dispatchEvent(new CustomEvent('habino-theme-change', { detail: preference }));
  };

  const isTrial = activeTenant?.subscription?.status === 'trial' || license.tier === 'trial';
  const trialDaysRemaining = activeTenant?.subscription?.trialDaysRemaining ?? 30;
  const isSuspended = !isPlatformOperator && (activeTenant?.subscription?.isSuspended || (isTrial && trialDaysRemaining <= 0));
  const currentOrigin = typeof window !== 'undefined' ? new URL(window.location.href) : null;
  const isLanIpOrigin = !!currentOrigin && /^(10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/.test(currentOrigin.hostname);
  const stableLocalOrigin = isLanIpOrigin && currentOrigin
    ? `${currentOrigin.protocol}//localhost${currentOrigin.port ? `:${currentOrigin.port}` : ''}/`
    : '';

  const handleToggleViewMode = (mode: 'landing' | 'desktop' | 'classic') => {
    const effectiveMode = mode === 'desktop' && !ENABLE_OS_DESKTOP ? 'classic' : mode;
    setViewMode(effectiveMode);
    localStorage.setItem('habino_view_mode', effectiveMode);
  };

  const wasImpersonatingRef = useRef(impersonationSession?.isActive === true);
  useEffect(() => {
    const isImpersonating = impersonationSession?.isActive === true;
    if (wasImpersonatingRef.current && !isImpersonating && isPlatformOperator) {
      setHasDismissedAdminRoute(false);
    }
    wasImpersonatingRef.current = isImpersonating;
  }, [isPlatformOperator, impersonationSession?.isActive]);

  useEffect(() => {
    if (!isAdminRoute || !currentUser || isPlatformOperator) return;
    const redirectTimer = window.setTimeout(() => {
      window.history.replaceState({}, '', '/');
      setActiveTab('dashboard');
      handleToggleViewMode('classic');
    }, 1800);
    return () => window.clearTimeout(redirectTimer);
  }, [isAdminRoute, currentUser?.id, isPlatformOperator]);

  useEffect(() => {
    if (!isPlatformOperator || isAdminRoute || impersonationSession?.isActive || hasDismissedAdminRoute) return;
    window.history.replaceState({}, '', '/admin');
    setActiveTab('admin_panel');
    handleToggleViewMode('classic');
  }, [isPlatformOperator, isAdminRoute, impersonationSession?.isActive, hasDismissedAdminRoute]);

  // If a public link token is present in the URL, render Public Invoice View directly (No login required)
  if (publicInvoiceToken) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">در حال بارگذاری صورت‌حساب آنلاین...</div>}>
        <PublicInvoiceView
          token={publicInvoiceToken}
          onBackToApp={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('invoice_token');
            url.searchParams.delete('token');
            url.searchParams.delete('share_token');
            window.history.pushState({}, '', url.pathname);
            setPublicInvoiceToken(null);
          }}
        />
      </Suspense>
    );
  }

  if (isPlatformOperator && !isAdminRoute && !impersonationSession?.isActive && !hasDismissedAdminRoute) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-600" dir="rtl">در حال ورود به کنسول مدیریت...</div>;
  }

  if (isAdminRoute) {
    const leaveAdminRoute = () => {
      setHasDismissedAdminRoute(true);
      window.history.replaceState({}, '', '/');
      setActiveTab('dashboard');
      handleToggleViewMode(currentUser ? 'classic' : 'landing');
    };
    const enterTenantPreview = () => {
      setHasDismissedAdminRoute(true);
      window.history.replaceState({}, '', '/');
      setActiveTab('dashboard');
      handleToggleViewMode('classic');
    };
    if (isPlatformOperator) {
      return (
        <div className="min-h-screen bg-slate-50">
          <PlatformImpersonationBanner onShowTenantPreview={enterTenantPreview} />
          <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">در حال بارگذاری کنسول مدیریت...</div>}>
            <HabinoAdminPanel onExitAdmin={leaveAdminRoute} onEnterTenantPreview={enterTenantPreview} />
          </Suspense>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6" dir="rtl">
        <section className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h1 className="font-black text-rose-900">{currentUser ? 'دسترسی به کنسول مدیریت مجاز نیست' : 'برای ورود به کنسول ابتدا وارد شوید'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">پنل مدیریت فقط برای سوپرادمین و کارشناسان احراز‌شدهٔ پشتیبانی هابینو در دسترس است.</p>
          <button type="button" onClick={leaveAdminRoute} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">بازگشت به فضای کار</button>
          {!currentUser && (
            <LoginModal isOpen={true} onClose={leaveAdminRoute} onOpenUpgradeModal={() => setUpgradeModalOpen(true)} />
          )}
        </section>
      </div>
    );
  }

  if (viewMode === 'landing') {
    return (
      <>
        <HabinoLandingPage
          onEnterAccounting={(module, targetMode = ENABLE_OS_DESKTOP ? 'desktop' : 'classic') => {
            if (module) setActiveTab(module);
            handleToggleViewMode(targetMode);
          }}
          onOpenLogin={() => setLoginModalOpen(true)}
        />
        <LoginModal
          isOpen={loginModalOpen}
          onClose={() => setLoginModalOpen(false)}
          onOpenUpgradeModal={() => setUpgradeModalOpen(true)}
        />
        <UpgradeModal isOpen={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
      </>
    );
  }

  if (ENABLE_OS_DESKTOP && viewMode === 'desktop') {
    return (
      <>
        {stableLocalOrigin && <StableLocalPwaNotice stableLocalOrigin={stableLocalOrigin} />}
        <Suspense fallback={<div className="h-screen bg-slate-900 flex items-center justify-center text-white text-sm">در حال بارگذاری میزکار دسکتاپ...</div>}>
          <HabinoDesktop
            onSwitchToClassicView={() => handleToggleViewMode('classic')}
            onSwitchToLandingView={() => handleToggleViewMode('landing')}
          />
          <UpgradeModal isOpen={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
        </Suspense>
      </>
    );
  }

  const toggleAdvancedStudios = () => {
    setShowAdvancedStudios(prev => {
      const next = !prev;
      localStorage.setItem('habino_show_advanced_studios', String(next));
      return next;
    });
  };

  // ۱. هسته اصلی عملیات مالی و حسابداری هابینو (Core Operations V1.0)
  const coreNavItems = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'invoices', label: 'فاکتورها و اسناد', icon: FileText },
    { id: 'checks', label: 'چک‌های صیادی', icon: CreditCard },
    { id: 'installments', label: 'اقساط', icon: Layers },
    { id: 'transactions', label: 'تراکنش‌ها', icon: ArrowLeftRight },
    { id: 'clients', label: 'طرف‌های حساب', icon: Users },
    { id: 'payroll', label: 'حقوق و دستمزد و بیمه', icon: Calculator },
    { id: 'inventory', label: 'خدمات و کالا', icon: Wrench },
    { id: 'banks', label: 'بانک‌ها و صندوق', icon: Landmark },
    { id: 'projects', label: 'پروژه‌ها و مناقصات', icon: FolderKanban },
    { id: 'ledger', label: 'دفتر کل و روزنامه', icon: BookOpen },
    { id: 'equity', label: 'سرمایه و شرکا', icon: Scale },
    { id: 'reports', label: 'صورت‌های مالی و تراز', icon: BarChart3 },
  ];

  // ۲. مرکز افزونه‌ها و لایسنسینگ ماژولار (Modular Hub & License)
  const modularHubItems = [
    { id: 'hub', label: 'مرکز افزونه‌ها (Hub)', icon: Grid, badge: 'فروشگاه ماژولار' },
    { id: 'license', label: 'مدیریت لایسنس و اشتراک', icon: Key },
  ];

  // ۳. ابزارها و تنظیمات عمومی (Tools & Settings)
  const settingsNavItems = [
    { id: 'settings', label: 'تنظیمات سیستم', icon: SettingsIcon },
    { id: 'backup', label: 'پشتیبان‌گیری محلی و ابری', icon: Database },
    { id: 'user_management', label: 'مدیریت کاربران و نقش‌ها (RBAC)', icon: ShieldCheck },
  ];

  // ۴. افزونه‌ها و استودیوهای پیشرفته تخصصی (Advanced Studios & Add-ons)
  const advancedStudioItems = [
    { id: 'barcode_scanner', label: 'استودیو بارکدخوان و POS', icon: ScanLine, tag: 'افزونه' },
    { id: 'synapse', label: 'هوش صوتی سیناپس', icon: Bot, tag: 'افزونه' },
    { id: 'analytics', label: 'داشبورد تحلیلی نقدینگی', icon: BarChart3, tag: 'تحلیلی' },
    { id: 'did_protocol', label: 'پروتکل هویت دیجیتال DID', icon: Fingerprint, tag: 'W3C' },
    { id: 'open_commerce', label: 'وب‌سرویس و وب‌هوک کافه‌بازار', icon: Globe, tag: 'API' },
    { id: 'admin_panel', label: 'کنسول مدیریت و پشتیبانی', icon: Headphones, tag: 'ادمین' },
    { id: 'accounting_verification', label: 'ممیزی ۱۰۰ سناریوی طلایی', icon: Scale, tag: 'تست' },
    { id: 'pre_launch_qa', label: 'آزمون آمادگی انتشار (QA)', icon: ShieldCheck, tag: 'تست' },
    { id: 'stress_test', label: 'تست استرس ۱۰۰۰ سند', icon: Zap, tag: 'تست' },
    { id: 'tenant_isolation', label: 'آزمون ایزولاسیون RLS', icon: ShieldAlert, tag: 'تست' },
    { id: 'diagnostics', label: 'عیب‌یاب زنده سوپابیس', icon: Activity, tag: 'تست' },
    { id: 'agents_studio', label: 'استودیو ۵ ایجنت هابینو', icon: Cpu, tag: 'ایجنت' },
    { id: 'roadmap', label: 'رودمپ و تصمیمات مهندسی', icon: Sparkles, tag: 'سند' },
  ];
  const visibleAdvancedStudioItems = advancedStudioItems.filter(item => {
    const infrastructureToolIds = new Set([
      'accounting_verification',
      'pre_launch_qa',
      'stress_test',
      'tenant_isolation',
      'diagnostics'
    ]);
    if (infrastructureToolIds.has(item.id) && !import.meta.env.DEV) return false;
    if (ISOLATED_ENGINEERING_MODULES.has(item.id)) return false;
    if (item.id === 'admin_panel') return isPlatformOperator;
    if (PLATFORM_ONLY_MODULES.has(item.id) || FUTURE_RELEASE_MODULES.has(item.id)) {
      return isPlatformAdmin;
    }
    return true;
  });

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors ${
      isDarkMode ? 'bg-[#0d1d22] text-[#e4f4f1]' : 'bg-slate-50 text-slate-800'
    }`} dir="rtl">
      <PlatformImpersonationBanner />
      {/* Top Navbar */}
      <header className={`border-b sticky top-0 z-40 no-print ${
        isDarkMode ? 'bg-[#12272d] border-[#28545a]' : 'bg-white border-slate-200'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'بستن منوی ناوبری' : 'باز کردن منوی ناوبری'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-[#2aa99d] rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm">
                هـ
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">هابینو حسابداری</h1>
                <p className="text-[10px] text-slate-400">Habino Accounting Platform</p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <OutboxSyncBadge compact />
            <button
              type="button"
              onClick={toggleWebTheme}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                isDarkMode
                  ? 'border-[#76539b] bg-[#24343b] text-[#d4bd70] hover:bg-[#30434b]'
                  : 'border-[#bde5de] bg-[#f8fcfb] text-[#76539b] hover:bg-[#e8f7f5]'
              }`}
              title={isDarkMode ? 'فعال‌کردن حالت روز' : 'فعال‌کردن حالت شب'}
              aria-label={isDarkMode ? 'فعال‌کردن حالت روز' : 'فعال‌کردن حالت شب'}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setLoginModalOpen(true)}
              aria-label={currentUser ? `پروفایل ${currentUser.fullName}` : 'ورود یا ثبت‌نام'}
              className="flex max-w-48 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
              title={currentUser ? 'مشاهده حساب کاربری' : 'ورود یا ثبت‌نام در سامانه'}
            >
              {currentUser ? (
                <>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f7f5] text-[11px] font-bold text-[#238e83]">
                    {currentUser.fullName?.[0] || 'هـ'}
                  </div>
                  <div className="hidden min-w-0 text-right sm:block">
                    <span className="block truncate text-[11px] font-bold leading-tight">{currentUser.fullName}</span>
                    <span className="block truncate text-[9px] leading-tight text-slate-500">
                      {activeTenant?.name || 'سازمان'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 text-[#2aa99d]" />
                  <span className="hidden sm:inline">ورود / ثبت‌نام</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {stableLocalOrigin && <StableLocalPwaNotice stableLocalOrigin={stableLocalOrigin} />}

      {/* Account Suspension Banner (Post-Trial Expiration) */}
      {isSuspended && (
        <div className="bg-rose-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-xs no-print">
          <div className="flex items-center gap-2 max-w-5xl">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              <strong>حساب کاربری شما در وضعیت پایان دوره هدیه (تعلیق موقت) قرار دارد.</strong> جهت ثبت اسناد جدید، صدور فاکتور و بهره‌مندی از امکانات، لطفاً نسبت به خرید یا تمدید اشتراک اقدام نمایید.
            </span>
          </div>
          <button
            onClick={() => setUpgradeModalOpen(true)}
            className="px-3.5 py-1.5 bg-white text-rose-700 font-bold rounded-lg text-xs hover:bg-rose-50 shadow-xs cursor-pointer shrink-0 transition-colors mr-2"
          >
            خرید و فعال‌سازی فوری
          </button>
        </div>
      )}

      {/* Main Container with Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 flex gap-6">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 right-0 z-50 w-64 bg-white border-l border-slate-200 p-4 transition-transform lg:static lg:block lg:w-56 lg:p-0 lg:bg-transparent lg:border-none lg:z-auto ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
          } no-print`}
        >
          <div className="flex lg:hidden justify-between items-center mb-4 pb-2 border-b">
            <span className="font-bold text-sm text-slate-800">منوی ناوبری</span>
            <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {ENABLE_OS_DESKTOP && (
            <div className="mb-3 px-1">
              <button
                onClick={() => handleToggleViewMode('desktop')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-[#b79a4a] to-[#2aa99d] text-white text-xs font-semibold shadow-sm hover:from-[#9f8439] hover:to-[#238e83] transition-all group"
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
                  <span>میزکار دسکتاپ هابینو</span>
                </div>
                <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded border border-white/40">
                  OS
                </span>
              </button>
            </div>
          )}

          <nav className="space-y-4">
            {/* ۱. عملیات پایه و هسته حسابداری */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 px-3 tracking-wider block mb-1">
                عملیات پایه حسابداری
              </span>
              {coreNavItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#2aa99d] text-white shadow-xs'
                        : 'text-[#496b72] hover:bg-[#e8f7f5] hover:text-[#238e83]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#7e9a9d]'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ۲. مرکز افزونه‌ها و لایسنسینگ */}
            <div className="space-y-1 pt-2 border-t border-[#dcebea]/70">
              <span className="text-[10px] font-bold text-slate-400 px-3 tracking-wider block mb-1">
                افزونه‌ها و اشتراک
              </span>
              {modularHubItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#2aa99d] text-white shadow-xs'
                        : item.id === 'hub'
                        ? 'bg-[#fbf4df] text-[#7d672b] hover:bg-[#f5eac5] border border-[#eee0ae]'
                        : 'text-[#496b72] hover:bg-[#e8f7f5] hover:text-[#238e83]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.id === 'hub' ? 'text-[#b79a4a]' : 'text-[#7e9a9d]'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-[#b79a4a] text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ۳. تنظیمات و مدیریت */}
            <div className="space-y-1 pt-2 border-t border-[#dcebea]/70">
              <span className="text-[10px] font-bold text-slate-400 px-3 tracking-wider block mb-1">
                مدیریت سیستم
              </span>
              {settingsNavItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#2aa99d] text-white shadow-xs'
                        : 'text-[#496b72] hover:bg-[#e8f7f5] hover:text-[#238e83]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#7e9a9d]'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setBazaarOnboardingOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[#71858a] transition-colors hover:bg-[#e8f7f5] hover:text-[#238e83] cursor-pointer"
              >
                <Compass className="w-4 h-4 text-[#b79a4a]" />
                <span>راهنمای راه‌اندازی سریع</span>
              </button>
            </div>

            {/* ۴. افزونه‌ها و استودیوهای پیشرفته (Collapsible Accordion) */}
            <div className="space-y-1 pt-2 border-t border-[#dcebea]/70">
              <button
                onClick={toggleAdvancedStudios}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-[#71858a] hover:text-[#238e83] hover:bg-[#e8f7f5] rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#b79a4a]" />
                  <span>استودیوها و افزونه‌ها ({visibleAdvancedStudioItems.length})</span>
                </div>
                {showAdvancedStudios || visibleAdvancedStudioItems.some(i => i.id === activeTab) ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {(showAdvancedStudios || visibleAdvancedStudioItems.some(i => i.id === activeTab)) && (
                <div className="space-y-0.5 pr-1 animate-fadeIn">
                  {visibleAdvancedStudioItems.map(item => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#b79a4a] text-white font-bold shadow-xs'
                            : 'text-[#71858a] hover:bg-[#e8f7f5] hover:text-[#238e83]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-[#7e9a9d]'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.tag && (
                          <span className={`text-[9px] px-1 py-0.2 rounded shrink-0 ${
                            isActive ? 'bg-white/25 text-white' : 'bg-[#edf6f5] text-[#71858a]'
                          }`}>
                            {item.tag}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 w-full min-w-0">
          <SecurityGate
            moduleId={activeTab}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenLoginModal={() => setLoginModalOpen(true)}
            onOpenLicenseModal={() => setUpgradeModalOpen(true)}
          >
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center p-12 min-h-[400px] text-slate-500 gap-3">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">در حال بارگذاری ماژول تخصصی...</span>
              </div>
            }>
              {activeTab === 'dashboard' && <Dashboard onNavigate={(tab) => setActiveTab(tab)} />}
              {activeTab === 'analytics' && <FinancialAnalyticsDashboard onNavigateToModule={(mod) => setActiveTab(mod)} />}
              {activeTab === 'hub' && <AppHub onSelectModule={(mod) => setActiveTab(mod)} />}
              {activeTab === 'invoices' && <Invoices />}
              {activeTab === 'checks' && <Checks />}
              {activeTab === 'installments' && <Installments />}
              {activeTab === 'transactions' && <Transactions />}
              {activeTab === 'clients' && <Clients onNavigateToPayroll={() => setActiveTab('payroll')} />}
              {activeTab === 'inventory' && <Inventory />}
              {activeTab === 'barcode_scanner' && (
                <BarcodeScannerStudio
                  onNavigateToInvoice={() => setActiveTab('invoices')}
                  onNavigateToInventory={() => setActiveTab('inventory')}
                  onNavigateToChecks={(prefilledSayad) => {
                    if (prefilledSayad) {
                      localStorage.setItem('habino_pending_sayad_qr', JSON.stringify(prefilledSayad));
                    }
                    setActiveTab('checks');
                  }}
                />
              )}
              {activeTab === 'banks' && <Banks />}
              {activeTab === 'projects' && <FinancialProjects />}
              {activeTab === 'did_protocol' && <DecentralizedIdStudio />}
              {activeTab === 'open_commerce' && <OpenCommerceStudio />}
              {activeTab === 'payroll' && <PayrollStudio />}
              {activeTab === 'ledger' && <Ledger />}
              {activeTab === 'equity' && <EquityCapitalManagement />}
              {activeTab === 'reports' && <Reports />}
              {activeTab === 'synapse' && <SynapseVoiceChat />}
              {activeTab === 'diagnostics' && <DiagnosticModule />}
              {activeTab === 'pre_launch_qa' && <PreLaunchAcceptanceStudio />}
              {activeTab === 'accounting_verification' && <AccountingVerificationStudio standalone={true} />}
              {activeTab === 'stress_test' && <StressTestEngineStudio standalone={true} />}
              {activeTab === 'agents_studio' && <LiveAgentDiagnosticStudio />}
              {activeTab === 'admin_panel' && <HabinoAdminPanel />}
              {activeTab === 'user_management' && <UserManagementView />}
              {activeTab === 'tenant_isolation' && <TenantIsolationVerificationStudio />}
              {activeTab === 'license' && <LicenseManager />}
              {activeTab === 'backup' && <BackupManager />}
              {activeTab === 'roadmap' && <RoadmapStudio />}
              {activeTab === 'settings' && <Settings onClose={() => setActiveTab('dashboard')} />}
            </Suspense>
          </SecurityGate>
        </main>
      </div>

      {/* Floating SiraFlow Voice Assistant Trigger (Visible when not on synapse tab) */}
      {isPlatformAdmin && activeTab !== 'synapse' && (
        <button
          onClick={() => setActiveTab('synapse')}
          className="fixed bottom-6 left-6 z-40 p-3 bg-gradient-to-tr from-slate-900 via-indigo-950 to-blue-900 hover:from-blue-600 hover:to-indigo-600 text-white rounded-full shadow-2xl border border-blue-400/40 hover:scale-110 active:scale-95 transition-all duration-200 group flex items-center gap-2.5 pr-4 pl-3"
          title="احضار دستیار صوتی سایرافلو (SiraFlow)"
        >
          <div className="relative flex items-center justify-center">
            <span className="absolute w-full h-full rounded-full bg-blue-400/40 animate-ping" />
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md">
              س
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <span className="block text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
              سایرافلو صوتی
            </span>
            <span className="block text-[9px] text-blue-200/80">نسخه بازار و رودمپ</span>
          </div>
        </button>
      )}

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onOpenUpgradeModal={() => setUpgradeModalOpen(true)}
      />
      <UpgradeModal isOpen={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
      <BazaarOnboardingModal
        isOpen={bazaarOnboardingOpen}
        onClose={() => setBazaarOnboardingOpen(false)}
        onOpenModule={(tabId) => setActiveTab(tabId)}
      />
      <OfflineIndicator />
    </div>
  );
};

const StableLocalPwaNotice: React.FC<{ stableLocalOrigin: string }> = ({ stableLocalOrigin }) => {
  const stableUrl = new URL(stableLocalOrigin);
  const displayUrl = `${stableUrl.protocol}//${stableUrl.hostname}${stableUrl.port ? `:${stableUrl.port}` : ''}`;

  return (
    <>
      <style>{'#btn-install-pwa-compact, #btn-install-pwa-banner, #pwa-install-banner { display: none !important; }'}</style>
      <aside className="relative z-50 flex flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>آدرس IP شبکه ممکن است تغییر کند.</strong>
          {' '}برای نصب روی همین کامپیوتر میزبان، از localhost استفاده کنید؛ برای موبایل یا دستگاه دیگر، در مودم برای کامپیوتر میزبان IP ثابت (DHCP Reservation) تنظیم کنید.
        </p>
        <a
          href={stableLocalOrigin}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-2 text-center font-bold text-blue-700 hover:bg-amber-100"
        >
          بازکردن آدرس پایدار {displayUrl}
        </a>
      </aside>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AccountingProvider>
        <SiraFlowProvider>
          <ThemeSynchronizer />
          <MainLayout />
        </SiraFlowProvider>
      </AccountingProvider>
    </ErrorBoundary>
  );
};

export default App;
