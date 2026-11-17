import React, { useState, useRef, useEffect } from 'react';
import { useAccounting } from '../lib/store';
import { formatCurrency } from '../lib/currencyUtils';
import { Invoices } from './Invoices';
import { Checks } from './Checks';
import { Installments } from './Installments';
import { Transactions } from './Transactions';
import { Clients } from './Clients';
import { Inventory } from './Inventory';
import { Banks } from './Banks';
import { FinancialProjects } from './FinancialProjects';
import { Ledger } from './Ledger';
import { Settings } from './Settings';
import { DiagnosticModule } from './DiagnosticModule';
import { SynapseVoiceChat } from './SynapseVoiceChat';
import { SiraFlowAvatar } from './SiraFlowAvatar';
import { AppHub } from './AppHub';
import { RoadmapStudio } from './RoadmapStudio';
import { LiveAgentDiagnosticStudio } from './LiveAgentDiagnosticStudio';
import { UserManagementView } from './UserManagementView';
import { LoginModal } from './LoginModal';
import { UpgradeModal } from './UpgradeModal';
import { PLATFORM_ONLY_MODULES, ROLE_DETAILS_FA } from '../lib/authEngine';
import { Dashboard } from './Dashboard';
import { LicenseManager } from './LicenseManager';
import { BackupManager } from './BackupManager';
import { Reports } from './Reports';
import { DecentralizedIdStudio } from './DecentralizedIdStudio';
import { OpenCommerceStudio } from './OpenCommerceStudio';
import { PayrollStudio } from './PayrollStudio';
import { BarcodeScannerStudio } from './BarcodeScannerStudio';
import { FinancialAnalyticsDashboard } from './FinancialAnalyticsDashboard';
import { LiveSupabaseTester } from './LiveSupabaseTester';
import { PreLaunchAcceptanceStudio } from './PreLaunchAcceptanceStudio';
import { AccountingVerificationStudio } from './AccountingVerificationStudio';
import { HabinoAdminPanel } from './HabinoAdminPanel';
import { PWAInstallButton } from './PWAInstallButton';
import { DataSourceSyncBadge } from './DataSourceSyncBadge';
import { OfflineIndicator } from './OfflineIndicator';
import { SecurityGate } from './common/SecurityGates';
import { isModuleRelevantToGuild } from '../lib/moduleVisibility';

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
  Minus,
  Square,
  X,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  Clock,
  Calendar,
  Wifi,
  Volume2,
  Search,
  Power,
  RefreshCw,
  Monitor,
  LayoutGrid,
  ShieldCheck,
  Scale,
  TrendingUp,
  AlertCircle,
  Database,
  Key,
  Smartphone,
  Move,
  Fingerprint,
  Globe,
  Calculator,
  ScanLine,
  Cpu,
  LogIn,
  Crown,
  AlertTriangle
} from 'lucide-react';

export interface OpenWindow {
  id: string;
  moduleId: string;
  title: string;
  icon: any;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface HabinoDesktopProps {
  onSwitchToClassicView?: () => void;
  onSwitchToLandingView?: () => void;
}

export const HabinoDesktop: React.FC<HabinoDesktopProps> = ({ onSwitchToClassicView, onSwitchToLandingView }) => {
  const {
    invoices,
    checks,
    transactions,
    bankAccounts,
    settings,
    isOnline,
    currentUser,
    activeTenant,
    license,
    canAccessModule
  } = useAccounting();

  const [upgradeModalOpen, setUpgradeModalOpen] = useState<boolean>(false);
  const [themePreference, setThemePreference] = useState<'auto' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'auto';
    const stored = localStorage.getItem('habino_desktop_theme');
    return stored === 'dark' || stored === 'light' || stored === 'auto' ? stored : 'auto';
  });
  const [systemDarkMode, setSystemDarkMode] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [systemHour, setSystemHour] = useState(() => new Date().getHours());
  const isAutoNight = systemDarkMode || systemHour >= 19 || systemHour < 7;
  const isDarkMode = themePreference === 'dark' || (themePreference === 'auto' && isAutoNight);
  const isTrial = activeTenant?.subscription?.status === 'trial' || license.tier === 'trial';
  const trialDaysRemaining = activeTenant?.subscription?.trialDaysRemaining ?? 30;
  const isSuspended = activeTenant?.subscription?.isSuspended || (isTrial && trialDaysRemaining <= 0);

  // Screen size & Mobile viewport detection
  const [screenSize, setScreenSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  }));
  const isMobile = screenSize.width < 768;

  useEffect(() => {
    localStorage.setItem('habino_desktop_theme', themePreference);
    window.dispatchEvent(new CustomEvent('habino-theme-change', { detail: themePreference }));
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
  }, [themePreference]);

  useEffect(() => {
    if (themePreference !== 'auto') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => {
      setSystemDarkMode(mediaQuery.matches);
      setSystemHour(new Date().getHours());
    };
    const timer = window.setInterval(updateSystemTheme, 60_000);
    mediaQuery.addEventListener?.('change', updateSystemTheme);
    updateSystemTheme();
    return () => {
      window.clearInterval(timer);
      mediaQuery.removeEventListener?.('change', updateSystemTheme);
    };
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
  }, [isDarkMode]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const preference = (event as CustomEvent<'auto' | 'light' | 'dark'>).detail;
      if (preference === 'auto' || preference === 'light' || preference === 'dark') {
        setThemePreference(preference);
      }
    };
    window.addEventListener('habino-theme-change', handleThemeChange);
    return () => window.removeEventListener('habino-theme-change', handleThemeChange);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Desktop State
  const [windows, setWindows] = useState<OpenWindow[]>(() => {
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const initialW = mobile ? Math.max(280, window.innerWidth - 12) : 920;
    const initialH = mobile ? Math.max(340, window.innerHeight - 95) : 600;
    return [
      {
        id: 'win-dashboard',
        moduleId: 'dashboard',
        title: 'داشبورد مالی هابینو',
        icon: LayoutDashboard,
        isMinimized: false,
        isMaximized: mobile,
        zIndex: 10,
        position: { x: mobile ? 6 : 40, y: mobile ? 40 : 30 },
        size: { width: initialW, height: initialH }
      }
    ];
  });

  const [activeWindowId, setActiveWindowId] = useState<string>('win-dashboard');
  const [nextZIndex, setNextZIndex] = useState<number>(11);
  const [startMenuOpen, setStartMenuOpen] = useState<boolean>(false);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const defaultDesktopAppIds = [
    'dashboard',
    'analytics',
    'invoices',
    'checks',
    'transactions',
    'clients',
    'inventory',
    'reports'
  ];
  const desktopLayoutKey = `habino_desktop_pinned_apps_${currentUser?.id || 'guest'}_${activeTenant?.id || 'tenant-main'}`;
  const [desktopPinnedIds, setDesktopPinnedIds] = useState<string[]>(defaultDesktopAppIds);
  const [desktopWidgetIds, setDesktopWidgetIds] = useState<string[]>([]);
  const [desktopAppPositions, setDesktopAppPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isDesktopDropTarget, setIsDesktopDropTarget] = useState(false);
  const [desktopContextMenu, setDesktopContextMenu] = useState<{
    itemId: string;
    itemType: 'app' | 'widget';
    x: number;
    y: number;
  } | null>(null);
  const loadedDesktopLayoutKeyRef = useRef<string | null>(null);
  const [readyDesktopLayoutKey, setReadyDesktopLayoutKey] = useState<string | null>(null);
  const desktopIconAreaRef = useRef<HTMLDivElement>(null);
  const desktopContextMenuItemRef = useRef<HTMLButtonElement>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  const getDefaultDesktopPositions = (appIds: string[], widgetIds: string[] = []) => {
    const areaWidth = Math.max(1, screenSize.width - 64);
    const areaHeight = Math.max(1, screenSize.height - 48 - 80);
    const horizontalTravel = Math.max(1, areaWidth - 104);
    const verticalTravel = Math.max(1, areaHeight - 112);
    const positions = appIds.reduce<Record<string, { x: number; y: number }>>((result, id, index) => {
      result[id] = {
        x: Math.max(0, 1 - (index % 4) * 112 / horizontalTravel),
        y: Math.min(Math.floor(index / 4) * 120 / verticalTravel, 1)
      };
      return result;
    }, {});
    const appRows = Math.ceil(appIds.length / 4);
    widgetIds.forEach((id, index) => {
      positions[`widget:${id}`] = {
        x: index % 2 === 0 ? 1 : 0,
        y: Math.min((appRows * 120 + Math.floor(index / 2) * 126) / verticalTravel, 1)
      };
    });
    return positions;
  };

  const legacyFinancialWidgetId = 'bank_checks_summary';

  const isLegacyDefaultLayout = (
    appIds: string[],
    positions: Record<string, { x: number; y: number }>
  ) => {
    const areaWidth = Math.max(1, screenSize.width - 32);
    const areaHeight = Math.max(1, screenSize.height - 48 - 80);
    const legacyDefaults = appIds.reduce<Record<string, { x: number; y: number }>>((defaults, id, index) => {
      defaults[id] = {
        x: Math.min((index % 4) * 112 / Math.max(1, areaWidth - 104), 1),
        y: Math.min(Math.floor(index / 4) * 120 / Math.max(1, areaHeight - 112), 1)
      };
      return defaults;
    }, {});
    return appIds.every(id =>
      positions[id] &&
      Math.abs(positions[id].x - legacyDefaults[id].x) < 0.0001 &&
      Math.abs(positions[id].y - legacyDefaults[id].y) < 0.0001
    );
  };

  useEffect(() => {
    if (desktopContextMenu) desktopContextMenuItemRef.current?.focus();
  }, [desktopContextMenu]);

  useEffect(() => {
    if (loadedDesktopLayoutKeyRef.current === desktopLayoutKey) return;
    loadedDesktopLayoutKeyRef.current = desktopLayoutKey;
    try {
      const saved = localStorage.getItem(desktopLayoutKey);
      if (!saved) {
        setDesktopPinnedIds(defaultDesktopAppIds);
        setDesktopAppPositions(getDefaultDesktopPositions(defaultDesktopAppIds));
        setDesktopWidgetIds([legacyFinancialWidgetId]);
        setReadyDesktopLayoutKey(desktopLayoutKey);
        return;
      }
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const pinnedIds = parsed.filter((id): id is string => typeof id === 'string');
        setDesktopPinnedIds(pinnedIds);
        setDesktopWidgetIds([legacyFinancialWidgetId]);
        setDesktopAppPositions(getDefaultDesktopPositions(pinnedIds, [legacyFinancialWidgetId]));
      } else if (parsed && typeof parsed === 'object') {
        const pinnedIds = Array.isArray(parsed.pinnedIds)
          ? parsed.pinnedIds.filter((id: unknown): id is string => typeof id === 'string')
          : defaultDesktopAppIds;
        const savedWidgetIds = Array.isArray(parsed.widgetIds)
          ? parsed.widgetIds.filter((id: unknown): id is string => typeof id === 'string')
          : [];
        const hasMigratedLegacyWidget = parsed.widgetMigrationVersion === 1;
        const widgetIds = hasMigratedLegacyWidget
          ? savedWidgetIds
          : [...new Set([...savedWidgetIds, legacyFinancialWidgetId])];
        const savedPositions = parsed.positions && typeof parsed.positions === 'object'
          ? parsed.positions as Record<string, unknown>
          : {};
        const validPositions = Object.entries(savedPositions).reduce<Record<string, { x: number; y: number }>>(
          (positions, [id, value]) => {
            if (
              value &&
              typeof value === 'object' &&
              'x' in value &&
              'y' in value &&
              typeof value.x === 'number' &&
              Number.isFinite(value.x) &&
              typeof value.y === 'number' &&
              Number.isFinite(value.y)
            ) {
              positions[id] = {
                x: Math.max(0, Math.min(1, value.x)),
                y: Math.max(0, Math.min(1, value.y))
              };
            }
            return positions;
          },
          {}
        );
        if (isLegacyDefaultLayout(pinnedIds, validPositions)) {
          setDesktopPinnedIds(pinnedIds);
          setDesktopWidgetIds(widgetIds);
          setDesktopAppPositions(getDefaultDesktopPositions(pinnedIds, widgetIds));
          setReadyDesktopLayoutKey(desktopLayoutKey);
          return;
        }
        setDesktopPinnedIds(pinnedIds);
        setDesktopWidgetIds(widgetIds);
        setDesktopAppPositions({ ...getDefaultDesktopPositions(pinnedIds, widgetIds), ...validPositions });
      } else {
        setDesktopPinnedIds(defaultDesktopAppIds);
        setDesktopWidgetIds([legacyFinancialWidgetId]);
        setDesktopAppPositions(getDefaultDesktopPositions(defaultDesktopAppIds));
      }
      setReadyDesktopLayoutKey(desktopLayoutKey);
    } catch (error) {
      console.error('[HabinoDesktop] Failed to load pinned desktop apps:', error);
      setDesktopPinnedIds(defaultDesktopAppIds);
      setDesktopWidgetIds([legacyFinancialWidgetId]);
      setDesktopAppPositions(getDefaultDesktopPositions(defaultDesktopAppIds, [legacyFinancialWidgetId]));
      setReadyDesktopLayoutKey(desktopLayoutKey);
    }
  }, [desktopLayoutKey]);

  useEffect(() => {
    if (readyDesktopLayoutKey !== desktopLayoutKey) return;
    try {
      localStorage.setItem(desktopLayoutKey, JSON.stringify({
        pinnedIds: desktopPinnedIds,
        widgetIds: desktopWidgetIds,
        widgetMigrationVersion: 1,
        positions: desktopAppPositions
      }));
    } catch (error) {
      console.error('[HabinoDesktop] Failed to save pinned desktop apps:', error);
    }
  }, [desktopLayoutKey, desktopPinnedIds, desktopWidgetIds, desktopAppPositions, readyDesktopLayoutKey]);

  // Clock interval
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('fa-IR', { month: 'long', day: 'numeric', year: 'numeric' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Desktop Applications List
  const apps = [
    { id: 'dashboard', title: 'داشبورد اصلی', icon: LayoutDashboard, color: 'from-[#2aa99d] to-[#38b9a5]', category: 'مدیریت' },
    { id: 'analytics', title: 'داشبورد تحلیلی ماهانه', icon: BarChart3, color: 'from-[#2aa99d] to-[#68c8b7]', category: 'گزارش‌ها و هوش تجاری' },
    { id: 'invoices', title: 'فاکتورها و صدور', icon: FileText, color: 'from-[#35a9a0] to-[#2d8eaf]', category: 'فروش' },
    { id: 'checks', title: 'چک‌های صیادی', icon: CreditCard, color: 'from-[#b79a4a] to-[#d4bd70]', category: 'بانک و چک' },
    { id: 'installments', title: 'اقساط و وصولی', icon: Layers, color: 'from-violet-500 to-purple-700', category: 'مالی' },
    { id: 'transactions', title: 'درآمد و هزینه', icon: ArrowLeftRight, color: 'from-[#3aa98d] to-[#2aa99d]', category: 'مالی' },
    { id: 'clients', title: 'طرف‌های حساب', icon: Users, color: 'from-[#35a9a0] to-[#58c6b6]', category: 'پایگاه مشتریان' },
    { id: 'inventory', title: 'خدمات و انبار', icon: Wrench, color: 'from-[#b79a4a] to-[#d4bd70]', category: 'محصولات' },
    { id: 'barcode_scanner', title: 'بارکدخوان و اسکنر کالا', icon: ScanLine, color: 'from-emerald-500 to-teal-700', category: 'محصولات و انبار' },
    { id: 'banks', title: 'بانک‌ها و صندوق', icon: Landmark, color: 'from-[#2d8eaf] to-[#277fc1]', category: 'بانک و چک' },
    { id: 'projects', title: 'پروژه‌ها و گزارش مالی', icon: FolderKanban, color: 'from-[#b79a4a] to-[#9f8439]', category: 'گزارش‌های مالی' },
    { id: 'did_protocol', title: 'پروتکل هویت W3C DID و VC', icon: Fingerprint, color: 'from-blue-600 via-indigo-700 to-slate-900', category: 'زیرساخت هویت و امنیت' },
    { id: 'open_commerce', title: 'وب‌سرویس و وب‌هوک‌ها (API)', icon: Globe, color: 'from-indigo-600 to-blue-700', category: 'توسعه‌دهندگان' },
    { id: 'payroll', title: 'حقوق، دستمزد و بیمه تأمین اجتماعی', icon: Calculator, color: 'from-blue-600 to-indigo-800', category: 'منابع انسانی و بیمه' },
    { id: 'ledger', title: 'دفتر کل و روزنامه', icon: BookOpen, color: 'from-[#2d8eaf] to-[#277fc1]', category: 'اسناد استاندارد' },
    { id: 'reports', title: 'صورت‌های مالی و P&L', icon: BarChart3, color: 'from-[#2aa99d] to-[#3aa98d]', category: 'گزارش‌ها' },
    { id: 'synapse', title: 'دستیار صوتی سایرافلو', icon: Bot, color: 'from-blue-600 via-indigo-600 to-purple-600', category: 'هوش مصنوعی' },
    { id: 'agents_studio', title: 'استودیو ۵ ایجنت هابینو', icon: Cpu, color: 'from-purple-600 via-indigo-600 to-pink-600', category: 'هوش مصنوعی و ایجنت‌ها' },
    { id: 'admin_panel', title: 'کنسول مدیریت و پشتیبانی پیشرفته', icon: Headphones, color: 'from-slate-900 via-indigo-950 to-slate-900', category: 'مدیریت و پشتیبانی' },
    { id: 'user_management', title: 'مدیریت اعضا، نقش‌ها و مستأجران (RBAC)', icon: ShieldCheck, color: 'from-blue-600 via-indigo-700 to-purple-800', category: 'امنیت و دسترسی' },
    { id: 'diagnostics', title: 'عیب‌یاب و ترازنامه', icon: Activity, color: 'from-rose-500 to-red-600', category: 'ممیزی' },
    { id: 'supabase_tester', title: 'تست زنده سوپابیس', icon: Database, color: 'from-emerald-600 to-teal-700', category: 'زیرساخت و اتصال' },
    { id: 'pre_launch_qa', title: 'آزمون جامع و آمادگی انتشار (QA & UAT)', icon: ShieldCheck, color: 'from-blue-600 via-indigo-600 to-emerald-600', category: 'مهندسی و ممیزی' },
    { id: 'accounting_verification', title: 'آزمون خودکار تراز و دفتر کل', icon: Scale, color: 'from-emerald-600 via-teal-600 to-cyan-700', category: 'مهندسی و ممیزی' },
    { id: 'landing_portal', title: 'صفحه فرود و پورتال هابینو', icon: Globe, color: 'from-cyan-500 to-blue-600', category: 'پورتال' },
    { id: 'roadmap', title: 'رودمپ و تصمیمات مهندسی', icon: Sparkles, color: 'from-amber-400 to-yellow-600', category: 'مهندسی و معماری' },
    { id: 'hub', title: 'مرکز افزونه‌ها', icon: Grid, color: 'from-blue-600 to-cyan-600', category: 'ابزارها' },
    { id: 'license', title: 'مدیریت لایسنس و خرید', icon: Key, color: 'from-blue-600 to-indigo-700', category: 'امنیت و اشتراک' },
    { id: 'backup', title: 'پشتیبان‌گیری و بازیابی', icon: Database, color: 'from-emerald-600 to-teal-700', category: 'امنیت و اشتراک' },
    { id: 'settings', title: 'تنظیمات هابینو', icon: SettingsIcon, color: 'from-slate-600 to-zinc-800', category: 'سیستم' },
  ];

  const canShowModule = (moduleId: string): boolean =>
    canAccessModule(moduleId).allowed &&
    isModuleRelevantToGuild(moduleId, activeTenant?.guildType);

  useEffect(() => {
    const permittedWindows = windows.filter(
      win => !PLATFORM_ONLY_MODULES.has(win.moduleId) || canShowModule(win.moduleId)
    );
    if (permittedWindows.length === windows.length) return;

    setWindows(permittedWindows);
    if (!permittedWindows.some(win => win.id === activeWindowId)) {
      const topWindow = permittedWindows
        .filter(win => !win.isMinimized)
        .reduce<OpenWindow | null>(
          (top, win) => !top || win.zIndex > top.zIndex ? win : top,
          null
        );
      setActiveWindowId(topWindow?.id || '');
    }
  }, [windows, activeWindowId, currentUser?.id, currentUser?.role, activeTenant?.guildType]);

  const visibleApps = apps.filter(app =>
    app.id === 'landing_portal' || canShowModule(app.id)
  );
  const desktopApps = desktopPinnedIds
    .map(id => visibleApps.find(app => app.id === id))
    .filter((app): app is typeof visibleApps[number] => Boolean(app));
  const defaultDesktopPositions = getDefaultDesktopPositions(desktopPinnedIds, desktopWidgetIds);
  const totalBalance = bankAccounts.reduce((sum, bank) => sum + (bank.balance || 0), 0);
  const pendingChecks = checks.filter(check => check.status === 'pending');
  const pendingChecksCount = pendingChecks.length;
  const unpaidSalesInvoices = invoices.filter(invoice =>
    ['sale', 'service'].includes(invoice.type) &&
    invoice.status !== 'draft' &&
    invoice.status !== 'cancelled' &&
    (invoice.remainingAmount || 0) > 0
  );
  const unpaidPurchaseInvoices = invoices.filter(invoice =>
    invoice.type === 'purchase' &&
    invoice.status !== 'draft' &&
    invoice.status !== 'cancelled' &&
    (invoice.remainingAmount || 0) > 0
  );
  const availableDesktopWidgets = [
    {
      id: legacyFinancialWidgetId,
      title: 'موجودی بانک و چک‌های در جریان',
      icon: Landmark,
      value: formatCurrency(totalBalance, settings.currency),
      detail: `${pendingChecksCount} چک در جریان`,
      color: 'text-emerald-600',
      available: canShowModule('banks')
    },
    {
      id: 'bank_balance',
      title: 'موجودی بانک‌ها',
      icon: Landmark,
      value: formatCurrency(totalBalance, settings.currency),
      detail: `${bankAccounts.length} حساب بانکی`,
      color: 'text-emerald-600',
      available: canShowModule('banks')
    },
    {
      id: 'receivable_checks',
      title: 'چک‌های دریافتنی در جریان',
      icon: CreditCard,
      value: `${checks.filter(check => check.type === 'receivable' && check.status === 'pending').length} فقره`,
      detail: formatCurrency(checks.filter(check => check.type === 'receivable' && check.status === 'pending').reduce((sum, check) => sum + (check.amount || 0), 0), settings.currency),
      color: 'text-amber-600',
      available: canShowModule('checks')
    },
    {
      id: 'payable_checks',
      title: 'چک‌های پرداختنی در جریان',
      icon: CreditCard,
      value: `${checks.filter(check => check.type === 'payable' && check.status === 'pending').length} فقره`,
      detail: formatCurrency(checks.filter(check => check.type === 'payable' && check.status === 'pending').reduce((sum, check) => sum + (check.amount || 0), 0), settings.currency),
      color: 'text-rose-600',
      available: canShowModule('checks')
    },
    {
      id: 'sales_receivables',
      title: 'مانده فاکتورهای فروش',
      icon: FileText,
      value: formatCurrency(unpaidSalesInvoices.reduce((sum, invoice) => sum + (invoice.remainingAmount || 0), 0), settings.currency),
      detail: `${unpaidSalesInvoices.length} فاکتور تسویه‌نشده`,
      color: 'text-blue-600',
      available: canShowModule('invoices')
    },
    {
      id: 'purchase_payables',
      title: 'مانده فاکتورهای خرید',
      icon: FileText,
      value: formatCurrency(unpaidPurchaseInvoices.reduce((sum, invoice) => sum + (invoice.remainingAmount || 0), 0), settings.currency),
      detail: `${unpaidPurchaseInvoices.length} فاکتور تسویه‌نشده`,
      color: 'text-violet-600',
      available: canShowModule('invoices')
    }
  ].filter(widget => widget.available);
  const desktopWidgets = desktopWidgetIds
    .map(id => availableDesktopWidgets.find(widget => widget.id === id))
    .filter((widget): widget is typeof availableDesktopWidgets[number] => Boolean(widget));

  const handleDesktopDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDesktopDropTarget(false);
    const draggedDesktopWidgetId = event.dataTransfer.getData('text/habino-desktop-widget');
    const widgetId = draggedDesktopWidgetId || event.dataTransfer.getData('text/habino-widget');
    const draggedDesktopAppId = event.dataTransfer.getData('text/habino-desktop-app');
    const appId = draggedDesktopAppId || event.dataTransfer.getData('text/habino-app');
    if (widgetId && !availableDesktopWidgets.some(widget => widget.id === widgetId)) return;
    if (!widgetId && (!appId || !visibleApps.some(app => app.id === appId))) return;
    const area = desktopIconAreaRef.current?.getBoundingClientRect();
    if (!area) return;
    const itemWidth = widgetId ? 240 : 104;
    const itemHeight = widgetId ? 112 : 112;
    const xTravel = Math.max(1, area.width - itemWidth);
    const yTravel = Math.max(1, area.height - itemHeight);
    const position = {
      x: Math.max(0, Math.min(1, (event.clientX - area.left - itemWidth / 2) / xTravel)),
      y: Math.max(0, Math.min(1, (event.clientY - area.top - itemHeight / 2) / yTravel))
    };
    if (widgetId) {
      setDesktopWidgetIds(current => current.includes(widgetId) ? current : [...current, widgetId]);
      setDesktopAppPositions(current => ({ ...current, [`widget:${widgetId}`]: position }));
    } else if (appId) {
      setDesktopPinnedIds(current => current.includes(appId) ? current : [...current, appId]);
      setDesktopAppPositions(current => ({ ...current, [appId]: position }));
    }
    setDesktopContextMenu(null);
  };

  const openDesktopContextMenu = (
    event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
    itemId: string,
    itemType: 'app' | 'widget'
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const clientX = 'clientX' in event ? event.clientX : bounds.left + bounds.width / 2;
    const clientY = 'clientY' in event ? event.clientY : bounds.top + bounds.height / 2;
    setDesktopContextMenu({
      itemId,
      itemType,
      x: Math.max(8, Math.min(clientX, window.innerWidth - 200)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - 96))
    });
  };

  // Open / Focus Window
  const openApp = (appId: string) => {
    setStartMenuOpen(false);
    setSearchQuery('');
    setSelectedAppId(null);
    if (appId === 'landing_portal') {
      onSwitchToLandingView?.();
      return;
    }
    if (!canShowModule(appId)) return;
    const existing = windows.find(w => w.moduleId === appId);

    if (existing) {
      if (existing.isMinimized) {
        setWindows(prev => prev.map(w => w.id === existing.id ? { ...w, isMinimized: false, zIndex: nextZIndex } : w));
      } else {
        setWindows(prev => prev.map(w => w.id === existing.id ? { ...w, zIndex: nextZIndex } : w));
      }
      setActiveWindowId(existing.id);
      setNextZIndex(prev => prev + 1);
      return;
    }

    const appInfo = apps.find(a => a.id === appId);
    if (!appInfo) return;

    // Offset position for cascading windows
    const count = windows.length;
    const isMob = screenSize.width < 768;
    const winWidth = isMob ? Math.max(280, screenSize.width - 12) : 880;
    const winHeight = isMob ? Math.max(320, screenSize.height - 95) : 580;
    const xPos = isMob ? 6 : 40 + (count % 6) * 30;
    const yPos = isMob ? 40 : 30 + (count % 6) * 25;

    const newWindow: OpenWindow = {
      id: `win-${appId}-${Date.now()}`,
      moduleId: appId,
      title: appInfo.title,
      icon: appInfo.icon,
      isMinimized: false,
      isMaximized: isMob,
      zIndex: nextZIndex,
      position: { x: xPos, y: yPos },
      size: { width: winWidth, height: winHeight }
    };

    setWindows(prev => [...prev, newWindow]);
    setActiveWindowId(newWindow.id);
    setNextZIndex(prev => prev + 1);
  };

  // Window Actions
  const focusWindow = (id: string) => {
    setActiveWindowId(id);
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: false, zIndex: nextZIndex } : w));
    setNextZIndex(prev => prev + 1);
  };

  const minimizeWindow = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isMinimized: true } : w));
    if (activeWindowId === id) {
      const remaining = windows.filter(w => w.id !== id && !w.isMinimized);
      if (remaining.length > 0) {
        const top = remaining.reduce((prev, curr) => prev.zIndex > curr.zIndex ? prev : curr);
        setActiveWindowId(top.id);
      } else {
        setActiveWindowId('');
      }
    }
  };

  const toggleShowDesktop = () => {
    const hasVisibleWindows = windows.some(w => !w.isMinimized);
    if (hasVisibleWindows) {
      setWindows(prev => prev.map(w => ({ ...w, isMinimized: true })));
      setActiveWindowId('');
      return;
    }

    const topWindow = windows.reduce<OpenWindow | null>(
      (top, current) => !top || current.zIndex > top.zIndex ? current : top,
      null
    );
    if (!topWindow) return;

    setWindows(prev => prev.map(w => ({
      ...w,
      isMinimized: false,
      ...(w.id === topWindow.id ? { zIndex: nextZIndex } : {})
    })));
    setActiveWindowId(topWindow.id);
    setNextZIndex(prev => prev + 1);
  };

  const toggleMaximizeWindow = (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    setWindows(prev => prev.map(w => w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
    focusWindow(id);
  };

  const fitToMobileWindow = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setWindows(prev => prev.map(w => {
      if (w.id === id) {
        const mobW = Math.max(280, screenSize.width - 12);
        const mobH = Math.max(300, screenSize.height - 95);
        return {
          ...w,
          isMaximized: false,
          position: { x: 6, y: 40 },
          size: { width: mobW, height: mobH }
        };
      }
      return w;
    }));
    focusWindow(id);
  };

  const closeWindow = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setWindows(prev => prev.filter(w => w.id !== id));
    if (activeWindowId === id) {
      const remaining = windows.filter(w => w.id !== id && !w.isMinimized);
      if (remaining.length > 0) {
        const top = remaining.reduce((prev, curr) => prev.zIndex > curr.zIndex ? prev : curr);
        setActiveWindowId(top.id);
      } else {
        setActiveWindowId('');
      }
    }
  };

  // 1. Dragging support (Mouse & Touch)
  const [draggingWinId, setDraggingWinId] = useState<string | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; winX: number; winY: number }>({
    clientX: 0,
    clientY: 0,
    winX: 0,
    winY: 0
  });

  const handleStartDrag = (clientX: number, clientY: number, win: OpenWindow) => {
    if (win.isMaximized) return;
    focusWindow(win.id);
    setDraggingWinId(win.id);
    dragStartRef.current = {
      clientX,
      clientY,
      winX: win.position.x,
      winY: win.position.y
    };
  };

  const handleMouseDownHeader = (e: React.MouseEvent, win: OpenWindow) => {
    if ((e.target as HTMLElement).closest('button')) return;
    handleStartDrag(e.clientX, e.clientY, win);
  };

  const handleTouchStartHeader = (e: React.TouchEvent, win: OpenWindow) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.touches.length === 1) {
      handleStartDrag(e.touches[0].clientX, e.touches[0].clientY, win);
    }
  };

  // 2. Corner Resizing support (Mouse & Touch)
  const [resizingWinId, setResizingWinId] = useState<string | null>(null);
  const resizeStartRef = useRef<{ clientX: number; clientY: number; startW: number; startH: number }>({
    clientX: 0,
    clientY: 0,
    startW: 0,
    startH: 0
  });

  const handleStartResize = (clientX: number, clientY: number, win: OpenWindow) => {
    if (win.isMaximized) return;
    focusWindow(win.id);
    setResizingWinId(win.id);
    resizeStartRef.current = {
      clientX,
      clientY,
      startW: win.size.width,
      startH: win.size.height
    };
  };

  // 3. Two-Finger Pinch-to-Resize Gesture Support
  const [pinchingWinId, setPinchingWinId] = useState<string | null>(null);
  const [pinchFeedback, setPinchFeedback] = useState<{ width: number; height: number; title: string } | null>(null);
  const pinchStartRef = useRef<{
    initialDist: number;
    initialWidth: number;
    initialHeight: number;
    winId: string;
  }>({ initialDist: 0, initialWidth: 0, initialHeight: 0, winId: '' });

  const handleWindowTouchStart = (e: React.TouchEvent, win: OpenWindow) => {
    if (e.touches.length === 2) {
      focusWindow(win.id);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      const curWidth = win.isMaximized ? Math.min(screenSize.width - 12, win.size.width) : win.size.width;
      const curHeight = win.isMaximized ? Math.min(screenSize.height - 95, win.size.height) : win.size.height;

      pinchStartRef.current = {
        initialDist: dist,
        initialWidth: curWidth,
        initialHeight: curHeight,
        winId: win.id
      };
      setPinchingWinId(win.id);
      setPinchFeedback({ width: curWidth, height: curHeight, title: win.title });
    }
  };

  useEffect(() => {
    // Movement Handler for Mouse & Touch
    const onMove = (clientX: number, clientY: number) => {
      if (draggingWinId) {
        const dx = clientX - dragStartRef.current.clientX;
        const dy = clientY - dragStartRef.current.clientY;

        setWindows(prev => prev.map(w => {
          if (w.id === draggingWinId) {
            const maxX = Math.max(0, window.innerWidth - 60);
            const maxY = Math.max(0, window.innerHeight - 80);
            return {
              ...w,
              position: {
                x: Math.max(0, Math.min(maxX, dragStartRef.current.winX + dx)),
                y: Math.max(36, Math.min(maxY, dragStartRef.current.winY + dy))
              }
            };
          }
          return w;
        }));
      }

      if (resizingWinId) {
        const dx = clientX - resizeStartRef.current.clientX;
        const dy = clientY - resizeStartRef.current.clientY;

        setWindows(prev => prev.map(w => {
          if (w.id === resizingWinId) {
            const minW = Math.min(260, window.innerWidth - 20);
            const maxW = window.innerWidth - 8;
            const minH = 200;
            const maxH = window.innerHeight - 60;
            return {
              ...w,
              size: {
                width: Math.max(minW, Math.min(maxW, resizeStartRef.current.startW + dx)),
                height: Math.max(minH, Math.min(maxH, resizeStartRef.current.startH + dy))
              }
            };
          }
          return w;
        }));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      onMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      setDraggingWinId(null);
      setResizingWinId(null);
    };

    // Touch Move for Dragging and Pinching
    const handleTouchMove = (e: TouchEvent) => {
      if (pinchingWinId && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const ratio = dist / (pinchStartRef.current.initialDist || 1);

        const minW = Math.min(260, window.innerWidth - 20);
        const maxW = window.innerWidth - 8;
        const minH = 200;
        const maxH = window.innerHeight - 60;

        const newW = Math.max(minW, Math.min(maxW, Math.round(pinchStartRef.current.initialWidth * ratio)));
        const newH = Math.max(minH, Math.min(maxH, Math.round(pinchStartRef.current.initialHeight * ratio)));

        setWindows(prev => prev.map(w => {
          if (w.id === pinchingWinId) {
            return {
              ...w,
              isMaximized: false,
              size: { width: newW, height: newH }
            };
          }
          return w;
        }));

        setPinchFeedback(prev => prev ? { ...prev, width: newW, height: newH } : null);
      } else if (draggingWinId && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (resizingWinId && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchingWinId) {
        setPinchingWinId(null);
        setTimeout(() => setPinchFeedback(null), 1200);
      }
      if (e.touches.length === 0) {
        setDraggingWinId(null);
        setResizingWinId(null);
      }
    };

    if (draggingWinId || resizingWinId || pinchingWinId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [draggingWinId, resizingWinId, pinchingWinId]);

  // کنترل سریع کلید Escape برای بستن منوی استارت یا خروج از تمام‌صفحه
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (startMenuOpen) {
          setStartMenuOpen(false);
          return;
        }
        if (activeWindowId) {
          const activeWin = windows.find(w => w.id === activeWindowId);
          if (activeWin) {
            if (activeWin.isMaximized) {
              setWindows(prev => prev.map(w => w.id === activeWindowId ? { ...w, isMaximized: false } : w));
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWindowId, startMenuOpen, windows]);

  // Render Component inside Window
  const renderModule = (moduleId: string, winId?: string) => {
    switch (moduleId) {
      case 'dashboard':
        return <Dashboard onNavigate={(tab) => openApp(tab)} />;
      case 'analytics':
        return <FinancialAnalyticsDashboard onNavigateToModule={(mod) => openApp(mod)} />;
      case 'invoices':
        return <Invoices />;
      case 'checks':
        return <Checks />;
      case 'installments':
        return <Installments />;
      case 'transactions':
        return <Transactions />;
      case 'clients':
        return <Clients onNavigateToPayroll={() => openApp('payroll')} />;
      case 'inventory':
        return <Inventory />;
      case 'barcode_scanner':
        return (
          <BarcodeScannerStudio
            onNavigateToInvoice={() => openApp('invoices')}
            onNavigateToInventory={() => openApp('inventory')}
            onNavigateToChecks={(prefilledSayad) => {
              if (prefilledSayad) {
                localStorage.setItem('habino_pending_sayad_qr', JSON.stringify(prefilledSayad));
              }
              openApp('checks');
            }}
          />
        );
      case 'banks':
        return <Banks />;
      case 'projects':
        return <FinancialProjects />;
      case 'did_protocol':
        return <DecentralizedIdStudio />;
      case 'open_commerce':
        return <OpenCommerceStudio />;
      case 'payroll':
        return <PayrollStudio />;
      case 'ledger':
        return <Ledger />;
      case 'reports':
        return <Reports />;
      case 'synapse':
        return <SynapseVoiceChat />;
      case 'diagnostics':
        return <DiagnosticModule />;
      case 'supabase_tester':
        return <LiveSupabaseTester />;
      case 'pre_launch_qa':
        return <PreLaunchAcceptanceStudio />;
      case 'accounting_verification':
        return <AccountingVerificationStudio standalone={true} />;
      case 'agents_studio':
        return <LiveAgentDiagnosticStudio />;
      case 'user_management':
        return <UserManagementView />;
      case 'admin_panel':
        return <HabinoAdminPanel onOpenLicenseManagement={() => openApp('license')} />;
      case 'roadmap':
        return <RoadmapStudio />;
      case 'hub':
        return <AppHub onSelectModule={(m) => openApp(m)} />;
      case 'license':
        return <LicenseManager />;
      case 'backup':
        return <BackupManager />;
      case 'settings':
        return (
          <Settings
            onClose={() => {
              if (winId) {
                setWindows(prev => prev.filter(w => w.id !== winId));
              }
            }}
          />
        );
      default:
        return <div className="p-8 text-center text-slate-500">ماژول در حال بارگذاری است...</div>;
    }
  };

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredApps = visibleApps.filter(a =>
    a.title.toLocaleLowerCase().includes(normalizedSearchQuery) ||
    a.category.toLocaleLowerCase().includes(normalizedSearchQuery)
  );

  return (
    <div
      className={`relative w-full h-screen overflow-hidden select-none font-sans transition-colors duration-300 ${
        isDarkMode
          ? 'bg-[radial-gradient(ellipse_at_top_right,#1e3a5f_0%,#111827_50%,#080d18_100%)] text-slate-100'
          : 'bg-[radial-gradient(ellipse_at_top_right,#dbeafe_0%,#f1f5f9_48%,#e2e8f0_100%)] text-slate-800'
      }`}
      data-theme={isDarkMode ? 'dark' : 'light'}
      dir="rtl"
      id="habino-desktop-environment"
      onClick={() => {
        if (startMenuOpen) {
          setStartMenuOpen(false);
          setSearchQuery('');
        }
      }}
    >
      {/* Desktop wallpaper */}
      <div className={`absolute inset-0 pointer-events-none ${
        isDarkMode
          ? 'bg-[linear-gradient(to_right,#cbd5e10a_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e10a_1px,transparent_1px)] bg-[size:48px_48px]'
          : 'bg-[linear-gradient(to_right,#64748b0a_1px,transparent_1px),linear-gradient(to_bottom,#64748b0a_1px,transparent_1px)] bg-[size:48px_48px]'
      }`} />
      <div className={`absolute top-12 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none ${isDarkMode ? 'bg-sky-500/10' : 'bg-sky-300/20'}`} />
      <div className={`absolute bottom-20 right-1/3 w-80 h-80 rounded-full blur-3xl pointer-events-none ${isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-200/30'}`} />
      <div className="absolute inset-0 hidden md:flex items-center justify-center pointer-events-none overflow-hidden" aria-hidden="true">
        <img
          src="/habino-desktop-logo-transparent.png"
          alt=""
          className={`w-[min(38vw,520px)] h-auto object-contain translate-y-10 drop-shadow-[0_8px_18px_rgba(80,65,35,0.18)] ${isDarkMode ? 'opacity-[0.58]' : 'opacity-[0.72]'}`}
        />
      </div>

      {/* Desktop brand and account bar */}
      <div className={`absolute top-0 inset-x-0 h-10 backdrop-blur-xl border-b shadow-sm flex items-center justify-between px-3 sm:px-5 z-30 text-xs transition-colors ${
        isDarkMode ? 'bg-slate-950/75 border-slate-700/80' : 'bg-white/85 border-slate-200/90'
      }`}>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className={`flex items-center gap-2 font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            <img src="/habino-desktop-logo-transparent.png" alt="لوگوی هابینو" className="w-8 h-8 object-contain rounded-lg shadow-sm" />
            <span className="hidden xs:inline">میزکار هابینو</span>
            <span className="text-[10px] text-[#927832] font-medium px-1.5 py-0.5 bg-[#fff9e8] border border-[#eadcae] rounded-md">هابینو</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setUpgradeModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] shadow-sm transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            title="خرید و ارتقای اشتراک هابینو"
          >
            <Crown className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">خرید و ارتقای اشتراک</span>
            {isTrial && (
              <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium hidden sm:inline">
                {trialDaysRemaining} روز هدیه
              </span>
            )}
          </button>

          {/* User Profile & Auth Pill */}
          <button
            type="button"
            onClick={() => setLoginModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            title={currentUser ? 'مشاهده حساب کاربری' : 'ورود / ثبت‌نام در سامانه'}
          >
            {currentUser ? (
              <>
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                  {currentUser.fullName[0]}
                </div>
                <span className="font-semibold hidden xs:inline max-w-32 truncate">{currentUser.fullName}</span>
                <span className="text-[10px] text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded-md max-w-28 truncate">
                  {activeTenant?.name || settings.name || 'سازمان'}
                </span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-semibold">ورود / ثبت‌نام</span>
              </>
            )}
          </button>

          {onSwitchToClassicView && (
            <button
              type="button"
              onClick={onSwitchToClassicView}
              className="hidden sm:flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] transition-colors"
              title="تغییر به نمای پنل سایدباری"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-blue-700" />
              <span>نمای وب</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setThemePreference(isDarkMode ? 'light' : 'dark')}
            className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title={isDarkMode ? 'فعال‌کردن حالت روز دستی' : 'فعال‌کردن حالت شب دستی'}
            aria-label={isDarkMode ? 'فعال‌کردن حالت روز' : 'فعال‌کردن حالت شب'}
            aria-pressed={isDarkMode}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Suspension Warning Banner */}
      {isSuspended && (
        <div className="absolute top-10 inset-x-0 z-30 bg-rose-50 text-rose-900 border-b border-rose-200 px-4 py-2 flex items-center justify-between text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>حساب کاربری هابینو در وضعیت پایان دوره هدیه (تعلیق) قرار دارد.</strong> جهت ادامه کار و دسترسی به امکانات پیشرفته، نسبت به نهایی‌سازی خرید اقدام فرمایید.
            </span>
          </div>
          <button
            onClick={() => setUpgradeModalOpen(true)}
            className="px-3 py-1.5 bg-rose-700 text-white font-semibold rounded-lg text-xs hover:bg-rose-800 shadow-xs cursor-pointer shrink-0 transition-colors mr-2"
          >
            خرید و فعال‌سازی
          </button>
        </div>
      )}

      {/* Desktop Main Workspace Area */}
      <div
        className={`relative w-full h-[calc(100vh-48px)] pt-11 px-4 pb-14 overflow-hidden transition-colors ${
          isDesktopDropTarget ? 'bg-[#e8f7f5]/60 ring-2 ring-inset ring-[#2aa99d]/50' : ''
        }`}
        onClick={() => setDesktopContextMenu(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDesktopContextMenu(null);
        }}
        onDragOver={(event) => {
          const draggingDesktopApp = event.dataTransfer.types.includes('text/habino-desktop-app');
          const draggingWidget = event.dataTransfer.types.includes('text/habino-widget') ||
            event.dataTransfer.types.includes('text/habino-desktop-widget');
          if (!draggingDesktopApp && !draggingWidget && !event.dataTransfer.types.includes('text/habino-app')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = draggingDesktopApp || event.dataTransfer.types.includes('text/habino-desktop-widget')
            ? 'move'
            : 'copy';
          setIsDesktopDropTarget(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDesktopDropTarget(false);
        }}
        onDrop={handleDesktopDrop}
      >
        {isDesktopDropTarget && (
          <div className="absolute inset-x-4 top-12 z-20 rounded-2xl border-2 border-dashed border-[#2aa99d] bg-white/80 px-4 py-3 text-center text-xs font-bold text-[#238e83] backdrop-blur-sm">
            آیکون را در محل دلخواه رها کنید
          </div>
        )}
        <div ref={desktopIconAreaRef} className="absolute inset-x-4 top-12 bottom-14 z-10 pointer-events-none">
          {desktopApps.map(app => {
            const Icon = app.icon;
            const isOpen = windows.some(w => w.moduleId === app.id);
            const position = desktopAppPositions[app.id] || defaultDesktopPositions[app.id];
            return (
              <div
                key={app.id}
                className="absolute w-[104px] pointer-events-auto"
                style={{
                  left: `${position.x * 100}%`,
                  top: `${position.y * 100}%`,
                  transform: `translate(${-position.x * 100}%, ${-position.y * 100}%)`
                }}
              >
                <button
                  type="button"
                  draggable
                  aria-label={app.title}
                  aria-pressed={selectedAppId === app.id}
                  onDoubleClick={() => openApp(app.id)}
                  onClick={() => {
                    if (isMobile) {
                      openApp(app.id);
                      return;
                    }
                    setSelectedAppId(app.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                      openDesktopContextMenu(event, app.id, 'app');
                    } else if (!isMobile && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      openApp(app.id);
                    }
                  }}
                  onContextMenu={(event) => openDesktopContextMenu(event, app.id, 'app')}
                  className={`group flex w-full flex-col items-center justify-center p-3 rounded-2xl transition-all cursor-grab active:cursor-grabbing active:scale-[0.98] text-center relative ${
                    selectedAppId === app.id
                      ? isDarkMode
                        ? 'bg-slate-800/95 border-[#2aa99d]/60 shadow-md ring-2 ring-[#2aa99d]/20'
                        : 'bg-white/95 border-[#2aa99d] shadow-md ring-2 ring-[#bde5de]'
                      : isDarkMode
                        ? 'bg-slate-900/55 border-slate-700/70 hover:bg-slate-800/95 hover:border-[#2aa99d]/40 hover:shadow-md'
                        : 'bg-white/65 border-white/80 hover:bg-white/95 hover:border-[#bde5de] hover:shadow-md'
                  } focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/habino-desktop-app', app.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setIsDesktopDropTarget(false)}
                  title={app.title}
                >
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${app.color} p-3.5 shadow-md flex items-center justify-center text-white mb-2 group-hover:-translate-y-0.5 transition-transform relative`}>
                    <Icon className="w-7 h-7" />
                    {isOpen && (
                      <span className={`absolute -bottom-1 w-2 h-2 bg-emerald-500 rounded-full ring-2 ${isDarkMode ? 'ring-slate-800' : 'ring-white'}`} />
                    )}
                  </div>
                  <span className={`text-[10px] sm:text-[11px] font-medium leading-tight line-clamp-2 px-0.5 ${
                    isDarkMode ? 'text-slate-200 group-hover:text-white' : 'text-slate-700 group-hover:text-slate-950'
                  }`}>
                    {app.title}
                  </span>
                </button>
              </div>
            );
          })}
          {desktopWidgets.map(widget => {
            const Icon = widget.icon;
            const position = desktopAppPositions[`widget:${widget.id}`] ||
              defaultDesktopPositions[`widget:${widget.id}`] ||
              { x: 1, y: 0 };
            return (
              <div
                key={`widget:${widget.id}`}
                className="absolute w-60 pointer-events-auto"
                onContextMenu={(event) => openDesktopContextMenu(event, widget.id, 'widget')}
                style={{
                  left: `${position.x * 100}%`,
                  top: `${position.y * 100}%`,
                  transform: `translate(${-position.x * 100}%, ${-position.y * 100}%)`
                }}
              >
                <button
                  type="button"
                  draggable
                  onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                      openDesktopContextMenu(event, widget.id, 'widget');
                    }
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/habino-desktop-widget', widget.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setIsDesktopDropTarget(false)}
                  className={`w-full rounded-2xl border p-4 text-right shadow-lg backdrop-blur-xl transition-colors cursor-grab active:cursor-grabbing ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-900/90 hover:bg-slate-900'
                      : 'border-white bg-white/90 hover:bg-white'
                  }`}
                  aria-label={`ویجت ${widget.title}`}
                  title="برای جابه‌جایی بکشید؛ برای گزینه‌ها راست‌کلیک کنید"
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <Icon className={`h-4 w-4 ${widget.color}`} />
                    {widget.title}
                  </span>
                  <span className={`mt-2 block truncate text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {widget.value}
                  </span>
                  <span className={`mt-1 block truncate text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {widget.detail}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {desktopContextMenu && (
          <div
            role="menu"
            aria-label="گزینه‌های میانبر میزکار"
            className={`fixed z-50 w-48 rounded-xl border p-1.5 shadow-xl ${
              isDarkMode
                ? 'border-slate-700 bg-slate-900 text-slate-100'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
            style={{ left: desktopContextMenu.x, top: desktopContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={desktopContextMenuItemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                setDesktopAppPositions(getDefaultDesktopPositions(desktopPinnedIds, desktopWidgetIds));
                setDesktopContextMenu(null);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2aa99d] ${
                isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>چیدمان منظم خودکار</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (desktopContextMenu.itemType === 'app') {
                  setDesktopPinnedIds(current => current.filter(id => id !== desktopContextMenu.itemId));
                } else {
                  setDesktopWidgetIds(current => current.filter(id => id !== desktopContextMenu.itemId));
                }
                setDesktopAppPositions(current => {
                  const positions = { ...current };
                  delete positions[desktopContextMenu.itemType === 'widget'
                    ? `widget:${desktopContextMenu.itemId}`
                    : desktopContextMenu.itemId];
                  return positions;
                });
                setDesktopContextMenu(null);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2aa99d] ${
                isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
              }`}
            >
              <Minus className="h-4 w-4" />
              <span>{desktopContextMenu.itemType === 'widget' ? 'برداشتن ویجت از میزکار' : 'برداشتن از میزکار'}</span>
            </button>
          </div>
        )}

        {/* Two-finger Pinch Resize Floating Toast Feedback */}
        {pinchFeedback && (
          <div className="fixed top-12 inset-x-0 mx-auto w-fit px-4 py-2 bg-blue-600/95 backdrop-blur-md border border-blue-400 text-white rounded-2xl shadow-2xl z-50 flex items-center gap-2 text-xs font-bold animate-pulse">
            <Smartphone className="w-4 h-4" />
            <span>تغییر اندازه دو انگشتی {pinchFeedback.title}: {pinchFeedback.width} × {pinchFeedback.height} پیکسل</span>
          </div>
        )}

        {/* Desktop Synapse Widget */}
        {canShowModule('synapse') && (
          <div className="absolute top-14 left-6 hidden lg:flex flex-col gap-4 w-72 pointer-events-auto z-0">
            <div
              onClick={() => openApp('synapse')}
              className={`backdrop-blur-xl rounded-2xl p-4 shadow-lg space-y-3 cursor-pointer group transition-all ${
                isDarkMode ? 'bg-slate-900/85 border border-indigo-800 hover:border-indigo-500 shadow-black/20' : 'bg-white/90 border border-indigo-100 hover:border-indigo-300 shadow-slate-900/5'
              }`}
            >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SiraFlowAvatar state="idle" size="sm" showStatusLabel={false} showBadges={false} />
                    <div>
                      <h4 className={`text-xs font-bold group-hover:text-blue-500 transition-colors flex items-center gap-1.5 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                        <span>دستیار صوتی سایرافلو</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-medium">دستیار</span>
                      </h4>
                      <p className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>دستیار صوتی هابینو</p>
                    </div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
                </div>
                <div className={`flex items-center justify-between text-[11px] pt-1 border-t ${isDarkMode ? 'text-slate-300 border-slate-700' : 'text-slate-600 border-slate-100'}`}>
                  <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>وضعیت:</span>
                  <span className="text-emerald-700 font-medium">آماده استفاده</span>
                </div>
            </div>
          </div>
        )}

        {/* Active Multi-Windows Container */}
        {windows.filter(win =>
          !PLATFORM_ONLY_MODULES.has(win.moduleId) || canShowModule(win.moduleId)
        ).map(win => {
          if (win.isMinimized) return null;
          const isMax = win.isMaximized;
          const isActive = activeWindowId === win.id;

          const adaptiveWidth = isMax ? '100%' : `${Math.min(screenSize.width - 12, win.size.width)}px`;
          const adaptiveHeight = isMax ? 'calc(100% - 38px)' : `${Math.min(screenSize.height - 95, win.size.height)}px`;
          const adaptiveLeft = isMax ? 0 : `${Math.min(Math.max(4, screenSize.width - 60), win.position.x)}px`;
          const adaptiveTop = isMax ? '36px' : `${Math.max(38, Math.min(screenSize.height - 80, win.position.y))}px`;

          return (
            <div
              data-desktop-window
              key={win.id}
              onClick={() => focusWindow(win.id)}
              onTouchStart={(e) => handleWindowTouchStart(e, win)}
              style={{
                zIndex: win.zIndex,
                top: adaptiveTop,
                left: adaptiveLeft,
                width: adaptiveWidth,
                height: adaptiveHeight,
                maxWidth: '100vw',
                maxHeight: 'calc(100vh - 48px)'
              }}
              className={`absolute rounded-2xl overflow-hidden shadow-2xl flex flex-col transition-all duration-75 ${
                isMax ? 'rounded-none inset-0' : ''
              } ${
                isActive
                  ? 'border border-blue-200 shadow-slate-900/15 bg-white ring-1 ring-blue-100'
                  : 'border border-slate-200 bg-white/95 opacity-95 shadow-slate-900/10'
              }`}
            >
              {/* Window Header Titlebar (Draggable & Touch-Move Handle) */}
              <div
                onMouseDown={(e) => handleMouseDownHeader(e, win)}
                onTouchStart={(e) => handleTouchStartHeader(e, win)}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  toggleMaximizeWindow(win.id, e);
                }}
                className={`h-11 px-3 sm:px-4 flex items-center justify-between cursor-move select-none border-b touch-none ${
                  isActive ? 'bg-white text-slate-800 border-slate-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs truncate max-w-[55%]">
                  <div className="p-1 rounded-md bg-blue-50 text-blue-700 shrink-0">
                    <win.icon className="w-4 h-4" />
                  </div>
                  <span className="truncate">{win.title}</span>
                </div>

                {/* Window Control Buttons */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Fit to Mobile Button */}
                  <button
                    onClick={(e) => fitToMobileWindow(win.id, e)}
                    className="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-slate-500 hover:text-blue-700 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    title="تطبیق سریع اندازه با موبایل"
                    aria-label="تطبیق اندازه پنجره با موبایل"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => minimizeWindow(win.id, e)}
                    className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    title="کوچک‌کردن پنجره (Minimize)"
                    aria-label={`کوچک‌کردن ${win.title}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  {isMax ? (
                    <button
                      onClick={(e) => toggleMaximizeWindow(win.id, e)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                      title="خروج از تمام‌صفحه و بازیابی اندازه پنجره"
                      aria-label="بازیابی اندازه پنجره"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-blue-700" />
                      <span className="hidden sm:inline">کوچک‌کردن</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => toggleMaximizeWindow(win.id, e)}
                      className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                      title="بزرگ‌نمایی کامل (Maximize)"
                      aria-label={`بزرگ‌نمایی ${win.title}`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={(e) => closeWindow(win.id, e)}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600"
                    title="بستن این صفحه و بازگشت به میزکار"
                    aria-label={`بستن ${win.title}`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>بستن</span>
                  </button>
                </div>
              </div>

              {/* Window Internal Body */}
              <div className="flex-1 w-full h-full overflow-y-auto bg-slate-50/70 text-slate-800 p-3 sm:p-4 md:p-6 relative">
                <SecurityGate
                  moduleId={win.moduleId}
                  moduleTitleFa={win.title}
                  onNavigate={(tab) => openApp(tab)}
                  onOpenLoginModal={() => setLoginModalOpen(true)}
                >
                  {renderModule(win.moduleId, win.id)}
                </SecurityGate>
              </div>

              {/* Corner Manual Resize Grip Handle (for touch and mouse) */}
              {!isMax && (
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleStartResize(e.clientX, e.clientY, win);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    if (e.touches.length === 1) {
                      handleStartResize(e.touches[0].clientX, e.touches[0].clientY, win);
                    }
                  }}
                  className="absolute bottom-0 left-0 w-8 h-8 flex items-end justify-start p-1.5 cursor-nesw-resize text-slate-400 hover:text-blue-700 bg-slate-100/80 hover:bg-blue-50 rounded-tr-xl touch-none z-30 transition-colors"
                  title="تغییر اندازه پنجره (کشیدن گوشه یا دو انگشتی)"
                >
                  <Move className="w-4 h-4 rotate-45" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Start Menu Popover */}
      {startMenuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          id="habino-start-menu"
          role="dialog"
          aria-label="برنامه‌ها و تنظیمات هابینو"
          className={`absolute bottom-14 left-2 right-2 sm:left-auto sm:right-4 w-auto sm:w-96 max-h-[520px] backdrop-blur-2xl border rounded-3xl p-4 sm:p-5 shadow-2xl z-50 flex flex-col space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-150 ${
            isDarkMode ? 'bg-slate-900/95 border-slate-700 shadow-black/30' : 'bg-white/95 border-slate-200 shadow-slate-900/15'
          }`}
        >
          {/* User Profile in Start Menu */}
          <div className={`flex items-center justify-between pb-3 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-base shadow-sm ${
                isDarkMode ? 'bg-blue-950 text-blue-300 border border-blue-900' : 'bg-blue-50 text-blue-700 border border-blue-100'
              }`}>
                {currentUser?.fullName?.[0] || settings.name?.[0] || 'ه'}
              </div>
              <div>
                <h3 className={`font-bold text-sm ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{currentUser?.fullName || 'کاربر هابینو'}</h3>
                <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{activeTenant?.name || settings.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openApp('settings')}
              className={`p-2 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isDarkMode ? 'text-slate-400 hover:text-blue-300 hover:bg-slate-800' : 'text-slate-500 hover:text-blue-700 hover:bg-blue-50'
              }`}
              aria-label="باز کردن تنظیمات"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className={`w-4 h-4 absolute right-3 top-2.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="جستجوی برنامه‌ها و اسناد هابینو..."
              aria-label="جستجوی برنامه‌ها"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pr-9 pl-4 py-2 border rounded-xl text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
              }`}
            />
          </div>

          {availableDesktopWidgets.length > 0 && <div className="space-y-1">
            <p className={`px-2 text-[10px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              ویجت‌های اطلاعاتی · برای افزودن بکشید
            </p>
            <div className="grid max-h-24 grid-cols-2 gap-1 overflow-y-auto">
              {availableDesktopWidgets.map(widget => {
                const Icon = widget.icon;
                const isAdded = desktopWidgetIds.includes(widget.id);
                return (
                  <button
                    key={widget.id}
                    type="button"
                    draggable={!isAdded}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/habino-widget', widget.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    className={`flex min-w-0 items-center gap-2 rounded-xl border p-2 text-right transition-colors cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2aa99d] ${
                      isDarkMode
                        ? 'border-slate-700 bg-slate-800/70 hover:bg-slate-800'
                        : 'border-slate-100 bg-slate-50 hover:bg-blue-50'
                    }`}
                    aria-label={`${widget.title}${isAdded ? '، افزوده‌شده' : '، افزودن به میزکار'}`}
                    title={isAdded ? 'این ویجت روی میزکار است؛ برای جابه‌جایی خود ویجت را بکشید' : 'برای افزودن به میزکار بکشید'}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${widget.color}`} />
                    <span className={`truncate text-[10px] font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {widget.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>}

          {/* Apps List */}
          <div className="flex-1 overflow-y-auto max-h-48 space-y-1 pr-1">
            <p className={`text-[10px] font-bold px-2 mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>برنامه‌ها و بخش‌ها</p>
            <div className="grid grid-cols-2 gap-1.5">
              {filteredApps.map(app => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.id}
                    onClick={() => openApp(app.id)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/habino-app', app.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-xl text-right transition-colors cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2aa99d] ${
                      isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-blue-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg bg-gradient-to-br ${app.color} text-white`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-xs font-medium truncate ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{app.title}</span>
                  </button>
                );
              })}
              {filteredApps.length === 0 && (
                <p className={`col-span-2 px-2 py-4 text-center text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  برنامه‌ای با این نام پیدا نشد.
                </p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className={`pt-3 border-t flex items-center justify-between text-xs ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
            {canShowModule('synapse') ? <button
              type="button"
              onClick={() => openApp('synapse')}
              className={`flex items-center gap-1.5 font-medium ${isDarkMode ? 'text-indigo-300 hover:text-indigo-200' : 'text-indigo-700 hover:text-indigo-900'}`}
            >
              <Bot className="w-4 h-4" />
              <span>دستیار صوتی سیناپس</span>
            </button> : <span />}
            <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>حسابداری هابینو</span>
          </div>
        </div>
      )}

      {/* Desktop Bottom Taskbar / Dock */}
      <div className={`absolute bottom-0 inset-x-0 h-12 backdrop-blur-2xl border-t flex items-center justify-between px-3 z-40 transition-colors ${
        isDarkMode ? 'bg-slate-950/85 border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]' : 'bg-white/90 border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.04)]'
      }`}>
        {/* Start Button & Running Windows Tabs */}
        <div className="flex items-center gap-2 max-w-[70%] overflow-x-auto no-scrollbar">
          {/* Start Menu Trigger */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (startMenuOpen) setSearchQuery('');
              setStartMenuOpen(prev => !prev);
            }}
            type="button"
            aria-expanded={startMenuOpen}
            aria-haspopup="dialog"
            aria-controls="habino-start-menu"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              startMenuOpen ? 'bg-blue-700 text-white ring-2 ring-blue-200' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <div className="w-4 h-4 bg-white/20 rounded flex items-center justify-center text-[10px]">هـ</div>
            <span>هابینو</span>
          </button>

          {/* Window Tabs */}
          {windows.map(win => {
            const isActive = activeWindowId === win.id && !win.isMinimized;
            const Icon = win.icon;
            return (
              <div
                key={win.id}
                className={`group flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? isDarkMode
                      ? 'bg-blue-950/70 text-blue-200 border border-blue-900 shadow-sm'
                      : 'bg-blue-50 text-blue-900 border border-blue-100 shadow-sm'
                    : isDarkMode
                      ? 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                      : 'bg-slate-100/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <button
                  onClick={(e) => {
                    if (win.isMinimized) {
                      focusWindow(win.id);
                    } else if (activeWindowId === win.id) {
                      minimizeWindow(win.id, e);
                    } else {
                      focusWindow(win.id);
                    }
                  }}
                  className="flex items-center gap-1.5 max-w-[130px] sm:max-w-[170px] truncate cursor-pointer text-right"
                  title={isActive ? `کوچک‌کردن ${win.title}` : `بازکردن ${win.title}`}
                  aria-label={isActive ? `کوچک‌کردن ${win.title}` : `بازکردن ${win.title}`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? (isDarkMode ? 'text-blue-300' : 'text-blue-700') : (isDarkMode ? 'text-slate-400' : 'text-slate-500')}`} />
                  <span className="truncate">{win.title}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWindow(win.id, e);
                  }}
                  className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                    isDarkMode ? 'text-slate-500 hover:text-rose-300 hover:bg-rose-950/50' : 'text-slate-400 hover:text-rose-700 hover:bg-rose-100'
                  }`}
                  title={`بستن ${win.title}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* System Tray (Clock, Network, Show Desktop) */}
        <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {/* Quick Show Desktop Peek Button */}
          <button
            onClick={toggleShowDesktop}
            disabled={windows.length === 0}
            className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isDarkMode ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-blue-300 border border-slate-700' : 'bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200'
            }`}
            title={windows.some(w => !w.isMinimized) ? 'نمایش میزکار' : 'بازگردانی پنجره‌ها'}
            aria-label={windows.some(w => !w.isMinimized) ? 'نمایش میزکار' : 'بازگردانی پنجره‌ها'}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden lg:inline text-[11px]">
              {windows.some(w => !w.isMinimized) ? 'میزکار' : 'بازگردانی'}
            </span>
          </button>
          <PWAInstallButton variant="compact" />

          {canShowModule('synapse') && <button
            type="button"
            onClick={() => openApp('synapse')}
            className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-indigo-300 hover:text-indigo-200' : 'hover:bg-indigo-50 text-indigo-700 hover:text-indigo-900'}`}
            title="دستیار صوتی سیناپس"
            aria-label="باز کردن دستیار صوتی سیناپس"
          >
            <Bot className="w-4 h-4" />
          </button>}

          <DataSourceSyncBadge className={isDarkMode ? 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} />

          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
            isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <Wifi className={`w-3.5 h-3.5 ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`} />
            <span className="text-[10px] hidden sm:inline">{isOnline ? 'آنلاین' : 'آفلاین'}</span>
          </div>

          <div className="flex flex-col items-end leading-tight px-1 font-mono">
            <span className={`font-bold text-xs ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{currentTime}</span>
            <span className={`text-[9px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{currentDate}</span>
          </div>
        </div>
      </div>
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onOpenUpgradeModal={() => setUpgradeModalOpen(true)}
      />
      <UpgradeModal isOpen={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />
      <OfflineIndicator />
    </div>
  );
};

export default HabinoDesktop;
