import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../lib/store';
import { ROLE_DETAILS_FA } from '../lib/authEngine';
import { Tenant, UserRole, GuildType } from '../types';
import { toPersianDigits } from '../lib/currencyUtils';
import { addSupportNote, listSupportNotes, SupportNote, SupportNoteCategory } from '../lib/platformSupportService';
import { recordSystemAuditEvent } from '../lib/systemAuditService';
import { SystemAuditLogPanel } from './SystemAuditLogPanel';
import { AdminPosDeviceSurvey } from './PosDeviceSurvey';
import SupportMessagingCenter from './SupportMessagingCenter';
import {
  ShieldAlert,
  ShieldCheck,
  Headphones,
  Crown,
  Search,
  Filter,
  Users,
  Building2,
  Key,
  CheckCircle2,
  AlertTriangle,
  AlertTriangle as AlertTriangleIcon,
  RefreshCw,
  Phone,
  Mail,
  FileText,
  Layers,
  Wrench,
  Upload,
  ArrowRightLeft,
  Eye,
  Bot,
  Zap,
  Database,
  CreditCard,
  MessageSquare,
  Lock,
  Unlock,
  Radio,
  Send,
  Terminal,
  Sliders,
  ChevronRight,
  ArrowUpRight,
  Pencil,
  Save,
  X
} from 'lucide-react';

interface HabinoAdminPanelProps {
  onOpenLicenseManagement?: () => void;
}

export const HabinoAdminPanel: React.FC<HabinoAdminPanelProps> = ({ onOpenLicenseManagement }) => {
  const {
    currentUser,
    activeTenant,
    availableTenants,
    tenantUsers,
    license,
    switchTenant,
    updatePlatformTenantAccount,
    changeUserRole,
    hasAddon,
    syncFromSupabase,
    pushToSupabase,
    isOnline
  } = useAccounting();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isPlatformSupport = currentUser?.role === 'hubino_support';

  // Active Admin Sub-tab
  const [activeTab, setActiveTab] = useState<'tenants' | 'license' | 'notes' | 'audit' | 'pos_survey' | 'inbox' | 'super_admin'>('tenants');

  // Search & Filters for Tenants
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selectedTenantId, setSelectedTenantId] = useState<string>(activeTenant?.id || 'tenant-main');
  const [tenantEditOpen, setTenantEditOpen] = useState<boolean>(false);
  const [tenantEditForm, setTenantEditForm] = useState<{
    name: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    guildType: GuildType;
    status: 'active' | 'suspended' | 'trial';
  }>({
    name: activeTenant.name,
    ownerName: activeTenant.ownerName,
    ownerEmail: activeTenant.ownerEmail,
    ownerPhone: activeTenant.ownerPhone || '',
    guildType: activeTenant.guildType,
    status: activeTenant.status
  });

  // Selected Tenant Object
  const selectedTenant = useMemo(() => {
    return availableTenants.find(t => t.id === selectedTenantId) || activeTenant;
  }, [availableTenants, selectedTenantId, activeTenant]);

  useEffect(() => {
    setTenantEditForm({
      name: selectedTenant.name,
      ownerName: selectedTenant.ownerName,
      ownerEmail: selectedTenant.ownerEmail,
      ownerPhone: selectedTenant.ownerPhone || '',
      guildType: selectedTenant.guildType,
      status: selectedTenant.status
    });
  }, [selectedTenant]);

  // Action status messages
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // License Generator State
  const [supportNotes, setSupportNotes] = useState<SupportNote[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [resetRefreshKey, setResetRefreshKey] = useState(0);

  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [newNoteCategory, setNewNoteCategory] = useState<SupportNoteCategory>('onboarding');

  useEffect(() => {
    const handleFactoryReset = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string }>).detail;
      if (!detail?.tenantId || detail.tenantId === selectedTenantId) {
        setResetRefreshKey(key => key + 1);
      }
    };
    window.addEventListener('habino_factory_reset_occurred', handleFactoryReset);
    return () => window.removeEventListener('habino_factory_reset_occurred', handleFactoryReset);
  }, [selectedTenantId]);

  useEffect(() => {
    if (!isSuperAdmin && !isPlatformSupport) return;
    let cancelled = false;
    setNotesLoading(true);
    setNotesError(null);
    listSupportNotes(selectedTenantId)
      .then(notes => {
        if (!cancelled) setSupportNotes(notes);
      })
      .catch(error => {
        if (!cancelled) {
          setSupportNotes([]);
          setNotesError(error instanceof Error ? error.message : 'بارگذاری پرونده پشتیبانی ناموفق بود.');
        }
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTenantId, isSuperAdmin, isPlatformSupport, resetRefreshKey]);

  useEffect(() => {
    if ((!isSuperAdmin && (activeTab === 'license' || activeTab === 'pos_survey' || activeTab === 'super_admin')) ||
        ((!isSuperAdmin && !isPlatformSupport) && activeTab === 'audit')) {
      setActiveTab('tenants');
    }
  }, [activeTab, isSuperAdmin, isPlatformSupport]);

  // Filtered tenants list
  const filteredTenants = useMemo(() => {
    return availableTenants.filter(t => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.ownerPhone && t.ownerPhone.includes(searchTerm)) ||
        (t.ownerName && t.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesPlan = planFilter === 'all' || t.subscription?.plan === planFilter;
      return matchesSearch && matchesPlan;
    });
  }, [availableTenants, searchTerm, planFilter]);

  // Tenant specific notes
  const currentTenantNotes = useMemo(() => {
    return supportNotes.filter(n => n.tenantId === selectedTenantId);
  }, [supportNotes, selectedTenantId]);

  const adminSections = [
    {
      id: 'tenants',
      title: 'مستأجران',
      description: 'دایرکتوری مستأجران، وضعیت اشتراک و مدیریت دسترسی‌ها.',
      icon: Building2,
      visible: true,
      tabs: [{ id: 'tenants' as const, label: `دایرکتوری مستأجران (${availableTenants.length})`, icon: Building2 }]
    },
    {
      id: 'support',
      title: 'پشتیبانی',
      description: 'پیام‌های مستأجران، یادداشت‌های تماس و پرونده‌های پشتیبانی.',
      icon: Headphones,
      visible: true,
      tabs: [
        { id: 'inbox' as const, label: 'پیام‌های مستأجران', icon: Headphones },
        { id: 'notes' as const, label: `یادداشت‌ها و سوابق تماس (${supportNotes.length})`, icon: MessageSquare },
        ...(isSuperAdmin
          ? [{ id: 'pos_survey' as const, label: 'نیازسنجی پوز بانکی', icon: CreditCard }]
          : [])
      ]
    },
    {
      id: 'platform',
      title: 'مدیریت پلتفرم',
      description: 'مدیریت لایسنس، افزونه‌ها و سوپر ادمینان.',
      icon: Sliders,
      visible: isSuperAdmin,
      tabs: [
        { id: 'license' as const, label: 'لایسنس و افزونه‌ها', icon: Key },
        { id: 'super_admin' as const, label: 'مدیریت سوپر ادمین', icon: ShieldCheck }
      ]
    },
    {
      id: 'audit',
      title: 'ممیزی سیستمی',
      description: 'ثبت‌های ممیزی ناپایدار سراسری (فقط‌خواندنی).',
      icon: ShieldCheck,
      visible: isSuperAdmin || isPlatformSupport,
      tabs: [
        { id: 'audit' as const, label: 'ممیزی سراسری و امنیتی', icon: ShieldCheck }
      ]
    }
  ].filter(section => section.visible);

  const activeSection = adminSections.find(section =>
    section.tabs.some(tab => tab.id === activeTab)
  ) || adminSections[0];

  // Handle Switch to Tenant in Impersonation Mode
  const handleImpersonateTenant = async (tenantId: string) => {
    if (!isSuperAdmin) {
      setActionFeedback({ type: 'error', message: 'تغییر فضای کاری مستأجر فقط برای سوپرادمین مجاز است.' });
      return;
    }
    setIsProcessing(true);
    setActionFeedback({ type: 'info', message: `در حال فعال‌سازی حالت ممیزی و انتقال به مستأجر ${tenantId}...` });
    try {
      const result = await switchTenant(tenantId);
      if (!result.success) {
        void recordSystemAuditEvent({
          action: 'PLATFORM_IMPERSONATION_STARTED',
          tenantId,
          resourceType: 'tenant',
          resourceId: tenantId,
          reasonCode: 'TENANT_SWITCH_REJECTED',
          outcome: 'failed'
        });
        setActionFeedback({ type: 'error', message: result.message });
        return;
      }
      void recordSystemAuditEvent({
        action: 'PLATFORM_IMPERSONATION_STARTED',
        tenantId,
        resourceType: 'tenant',
        resourceId: tenantId,
        outcome: 'succeeded'
      });
      setSelectedTenantId(tenantId);
      setActionFeedback({
        type: 'success',
        message: `فضای کاری به مستأجر «${availableTenants.find(tenant => tenant.id === tenantId)?.name || tenantId}» منتقل شد.`
      });
    } catch (err: any) {
      void recordSystemAuditEvent({
        action: 'PLATFORM_IMPERSONATION_STARTED',
        tenantId,
        resourceType: 'tenant',
        resourceId: tenantId,
        reasonCode: 'TENANT_SWITCH_FAILED',
        outcome: 'failed'
      });
      setActionFeedback({ type: 'error', message: err.message || 'خطا در تعویض مستأجر' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveTenantAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSuperAdmin) return;
    setIsProcessing(true);
    setActionFeedback(null);
    try {
      const result = await updatePlatformTenantAccount(selectedTenantId, tenantEditForm);
      if (!result.success) {
        setActionFeedback({ type: 'error', message: result.message });
        return;
      }

      void recordSystemAuditEvent({
        action: 'TENANT_ACCOUNT_UPDATED',
        tenantId: selectedTenantId,
        resourceType: 'tenant',
        resourceId: selectedTenantId,
        reasonCode: tenantEditForm.status === 'suspended' ? 'SUSPENDED' : 'UPDATED',
        outcome: 'succeeded'
      });
      setTenantEditOpen(false);
      setActionFeedback({ type: 'success', message: result.message });
    } catch (error) {
      setActionFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'ذخیرهٔ مشخصات مستأجر ناموفق بود.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Save Support Call Note
  const handleAddSupportNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || (!isSuperAdmin && !isPlatformSupport)) return;
    try {
      const newNote = await addSupportNote(selectedTenantId, newNoteCategory, newNoteContent);
      void recordSystemAuditEvent({
        action: 'SUPPORT_NOTE_CREATED',
        tenantId: selectedTenantId,
        resourceType: 'platform_support_note',
        resourceId: newNote.id,
        reasonCode: newNoteCategory.toUpperCase(),
        outcome: 'succeeded'
      });
      setSupportNotes(notes => [newNote, ...notes]);
      setNewNoteContent('');
      setNotesError(null);
      setActionFeedback({ type: 'success', message: 'یادداشت تماس در پرونده ابری و مشترک ثبت شد.' });
    } catch (error) {
      void recordSystemAuditEvent({
        action: 'SUPPORT_NOTE_CREATED',
        tenantId: selectedTenantId,
        resourceType: 'platform_support_note',
        reasonCode: 'SUPPORT_NOTE_FAILED',
        outcome: 'failed'
      });
      const message = error instanceof Error ? error.message : 'ثبت یادداشت تماس ناموفق بود.';
      setNotesError(message);
      setActionFeedback({ type: 'error', message });
    }
  };

  if (!isSuperAdmin && !isPlatformSupport) {
    return (
      <div className="max-w-3xl mx-auto p-8 bg-rose-50 border border-rose-200 rounded-3xl text-rose-900" dir="rtl">
        <h2 className="font-black text-lg">دسترسی به کنسول پشتیبانی مجاز نیست</h2>
        <p className="text-sm mt-2">این بخش فقط برای سوپرادمین و اعضای احراز‌شده تیم پشتیبانی هابینو در دسترس است.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 font-sans space-y-6" dir="rtl">
      {/* Top Banner & Security Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg border border-blue-400/40 shrink-0">
              <Headphones className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">کنسول مدیریت و پشتیبانی پیشرفته هابینو</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  دسترسی راهبردی
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                میزکار پشتیبانی؛ عملیات مالی و مدیریتی حساس فقط در اختیار سوپرادمین است.
              </p>
            </div>
          </div>

          <div className="bg-slate-800/80 px-4 py-3 rounded-2xl border border-slate-700/80 text-xs">
            <span className="block text-slate-400 mb-1">اپراتور واردشده</span>
            <span className="font-bold text-white">{currentUser?.fullName}</span>
            <span className={`mr-2 px-2 py-0.5 rounded-md ${isSuperAdmin ? 'bg-amber-500/20 text-amber-300' : 'bg-teal-500/20 text-teal-200'}`}>
              {isSuperAdmin ? 'سوپرادمین' : 'پشتیبانی فنی'}
            </span>
          </div>
        </div>

        {/* Selected Tenant Quick Context Pill */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">مستأجر تحت ممیزی فعلی:</span>
            <span className="font-bold text-white bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              {selectedTenant?.name} ({selectedTenant?.id})
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/60 text-blue-200 border border-blue-700">
              پلن: {selectedTenant?.subscription?.planNameFa || 'پایه'}
            </span>
          </div>
        </div>

        {/* Financial Data Access Warning */}
        <div className="mt-4 pt-4 border-t border-slate-800 p-3 bg-amber-500/10 border-amber-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <p className="font-bold text-amber-100">محدودیت دسترسی داده‌های مالی</p>
            <p className="mt-1">
              این کنسول برای مدیریت پلتفرم و پشتیبانی است. دسترسی به داده‌های مالی مستأجران (فاکتورها، چک‌ها، تراکنش‌ها، دفتر کل، مانده‌ها، انبار) از طریق این بخش ممکن نیست.
              برای راهنمایی تلفنی، از دکمه «مشاهده در نقش کاربر» برای ورود به داشبورد مستأجر استفاده کنید.
            </p>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm animate-fadeIn ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
            : actionFeedback.type === 'error'
            ? 'bg-rose-50 text-rose-900 border-rose-300'
            : 'bg-blue-50 text-blue-900 border-blue-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {actionFeedback.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
            {actionFeedback.type === 'info' && <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 animate-spin" />}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-500 hover:text-slate-700 text-xs underline cursor-pointer"
          >
            بستن
          </button>
        </div>
      )}

      <section aria-label="ناوبری کنسول مدیریت" className="space-y-3">
        <nav className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="بخش‌های اصلی کنسول">
          {adminSections.map(section => {
            const SectionIcon = section.icon;
            const isActive = activeSection.id === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveTab(section.tabs[0].id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs font-bold transition-colors ${
                  isActive
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <SectionIcon className="h-4 w-4 shrink-0" />
                <span>{section.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">{activeSection.title}</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{activeSection.description}</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label={`زیر‌بخش‌های ${activeSection.title}`}>
            {activeSection.tabs.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </section>

      {activeTab === 'audit' && (isSuperAdmin || isPlatformSupport) && (
        <SystemAuditLogPanel tenantId={selectedTenantId} />
      )}

      {activeTab === 'pos_survey' && isSuperAdmin && (
        <AdminPosDeviceSurvey tenants={availableTenants} />
      )}

      {activeTab === 'inbox' && (isSuperAdmin || isPlatformSupport) && (
        <SupportMessagingCenter mode="support" tenants={availableTenants} />
      )}

      {/* TAB 1: Tenants Workdesk & Directory */}
      {activeTab === 'tenants' && (
        <div className="space-y-6">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="جستجو بر اساس نام کسب‌وکار، شناسه، نام مدیر، شماره تماس..."
                className="w-full pr-9 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              >
                <option value="all">همه پلن‌ها</option>
                <option value="starter">پایه (Starter)</option>
                <option value="professional">حرفه‌ای (Pro)</option>
                <option value="enterprise">سازمانی (Enterprise)</option>
              </select>
            </div>
          </div>

          {/* Tenants Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTenants.map(t => {
              const isSelected = t.id === selectedTenantId;
              const isCurrentActive = t.id === activeTenant.id;
              const sub = t.subscription;
              const isTrial = sub?.status === 'trial';
              const remainingTrial = sub?.trialDaysRemaining ?? 30;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  className={`bg-white rounded-3xl p-5 border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-blue-600 shadow-lg ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  {isCurrentActive && (
                    <span className="absolute top-3 left-3 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      مستأجر فعال مرورگر
                    </span>
                  )}

                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-black text-sm shrink-0">
                        {t.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 text-sm truncate">{t.name}</h3>
                        <p className="text-[11px] text-slate-500 font-mono truncate">{t.id}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">مالک:</span>
                        <span className="font-semibold text-slate-800">{t.ownerName || 'ثبت‌نشده'}</span>
                      </div>
                      {isSuperAdmin && <div className="flex items-center justify-between">
                        <span className="text-slate-400">شماره تماس:</span>
                        <span className="font-mono text-slate-800">{t.ownerPhone || '—'}</span>
                      </div>}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">پلن و اشتراک:</span>
                        <span className="font-bold text-indigo-700">{sub?.planNameFa || 'پایه'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">وضعیت لایسنس:</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          t.status === 'suspended' || sub?.isSuspended
                            ? 'bg-rose-100 text-rose-800'
                            : isTrial
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {t.status === 'suspended' || sub?.isSuspended
                            ? 'معلق / قفل'
                            : isTrial ? `${toPersianDigits(remainingTrial)} روز تست` : 'لایسنس فعال'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    {isSuperAdmin ? <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTenantId(t.id);
                        setTenantEditOpen(true);
                      }}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-amber-200 cursor-pointer"
                      title="ویرایش مشخصات یا تعلیق/فعال‌سازی فضای کاری"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>ویرایش</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImpersonateTenant(t.id);
                      }}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      title="ورود به حساب مشتری در حالت فقط‌خواندنی برای راهنمایی تلفنی"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>مشاهده در نقش کاربر</span>
                    </button>
                    </> : <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTenantId(t.id);
                        setActiveTab('notes');
                      }}
                      className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>پرونده تماس‌ها</span>
                    </button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

{/* TAB 3: Centralized License Management */}
      {isSuperAdmin && activeTab === 'license' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">مدیریت یکپارچهٔ اشتراک و لایسنس</h3>
            <p className="text-sm text-slate-500 mt-1">
              صدور لایسنس پلن و افزونه در یک محل انجام می‌شود تا مستأجر مقصد، پلن و مدت اعتبار همیشه یکسان و روشن باشند.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenLicenseManagement}
            disabled={!onOpenLicenseManagement}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
          >
            رفتن به مدیریت لایسنس و خرید
            <ArrowUpRight className="w-4 h-4" />
          </button>
          {!onOpenLicenseManagement && (
            <p className="text-xs text-amber-700">مدیریت یکپارچهٔ لایسنس را از منوی «مدیریت لایسنس و خرید» باز کنید.</p>
          )}
        </div>
      )}

      {/* TAB: Super Admin Management */}
      {isSuperAdmin && activeTab === 'super_admin' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              مدیریت سوپر ادمینان پلتفرم
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              تعریف، تغییر و لغو نقش سوپرادمین برای کاربران پلتفرم هابینو. فقط founders مجاز به این عملیات هستند.
            </p>
          </div>

          {/* Current Super Admins List */}
          <div className="border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-900">سوپر ادمینان فعلی</h4>
              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-md">
                ایمیل بنیان‌گذار: tehrani.smart51@gmail.com
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 text-slate-500 font-medium">نام</th>
                    <th className="pb-2 text-slate-500 font-medium">ایمیل</th>
                    <th className="pb-2 text-slate-500 font-medium">نقش</th>
                    <th className="pb-2 text-slate-500 font-medium">وضعیت</th>
                    <th className="pb-2 text-slate-500 font-medium text-right">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantUsers
                    .filter(u => u.role === 'super_admin')
                    .map(user => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 text-slate-900 font-medium">{user.fullName}</td>
                        <td className="py-3 text-slate-600">{user.email}</td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-bold">
                            سوپرادمین
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${user.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {user.status === 'active' ? 'فعال' : 'غیرفعال'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {user.email !== 'tehrani.smart51@gmail.com' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`آیا از لغو نقش سوپرادمین برای ${user.fullName} ({user.email}) مطمئن هستید؟`)) {
                                  changeUserRole(user.id, 'tenant_owner')
                                    .then(res => {
                                      if (res.success) {
                                        setActionFeedback({ type: 'success', message: res.message });
                                      } else {
                                        setActionFeedback({ type: 'error', message: res.message });
                                      }
                                    });
                                }
                              }}
                              disabled={tenantUsers.filter(u => u.role === 'super_admin').length <= 1}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                              لغو سوپرادمین
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Designate New Super Admin */}
          <div className="border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-900">تعین سوپرادمین جدید</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ایمیل کاربر</label>
                <input
                  type="email"
                  placeholder="example@habino.ir"
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نقش جدید</label>
                <select
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="super_admin">سوپرادمین</option>
                  <option value="hubino_support">پشتیبانی فنی</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              اعمال تغییر نقش
            </button>
          </div>

          {/* Important Notes */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h4 className="font-bold text-amber-900 mb-2">⚠️ نکات امنیتی مهم</h4>
            <ul className="text-sm text-amber-800 space-y-1 list-disc pl-4">
              <li>سوپرادمین دسترسی فراگیر به کل پلتفرم و تمام مستأجران دارد.</li>
              <li>نمی‌توان آخرین سوپرادمین را بدون معرفی جایگزين تغییر نقش داد.</li>
              <li>تقریرات هوش صوتی سیناپس: تغییر نقش نیازمند تأیید صوتی صریح بنیان‌گذار است.</li>
              <li>تمام تغییرات در لاگ ممیزی سیستmiques ثبت می‌شود.</li>
              <li>ایمیل بنیان‌گذار <code className="font-mono text-xs bg-amber-200 px-1 py-0.5 rounded">tehrani.smart51@gmail.com</code> همواره به عنوان سوپرادمین حفظ می‌شود.</li>
            </ul>
          </div>
</div>
      )}

      {/* TAB 5: Support Notes & Call Logs */}
      {activeTab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New Note Form */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              ثبت یادداشت تماس برای: {selectedTenant?.name}
            </h3>

            {notesError && (
              <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">{notesError}</p>
            )}
            <form onSubmit={handleAddSupportNote} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">دسته‌بندی تماس:</label>
                <select
                  value={newNoteCategory}
                  onChange={e => setNewNoteCategory(e.target.value as SupportNoteCategory)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                >
                  <option value="onboarding">راهنمایی اولیه و آنبوردینگ</option>
                  <option value="license">درخواست تمدید یا ارتقای لایسنس</option>
                  <option value="accounting_fix">رفع ناترازی یا آموزش ثبت سند</option>
                  <option value="bug_report">گزارش اشکال یا بازخورد اصناف</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">شرح مکالمه و اقدام انجام‌شده:</label>
                <textarea
                  rows={4}
                  value={newNoteContent}
                  onChange={e => setNewNoteContent(e.target.value)}
                  placeholder="مثال: تماس کاربر جهت تنظیم مالیات بر ارزش افزوده در فاکتور. راهنمایی شد و دوره ۳۰ روزه تمدید گردید..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={notesLoading || !newNoteContent.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>ثبت در پرونده مشتری</span>
              </button>
            </form>
          </div>

          {/* Notes History */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">سوابق تماس‌ها و ممیزی‌های انجام‌شده</h3>
              <span className="text-xs text-slate-400">تعداد کل: {toPersianDigits(currentTenantNotes.length)} یادداشت</span>
            </div>

            {notesLoading ? (
              <div className="text-center py-12 text-slate-400 text-xs">در حال بارگذاری پرونده تماس‌ها از سرور...</div>
            ) : currentTenantNotes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                {notesError ? 'پرونده تماس از سرور دریافت نشد.' : 'هنوز یادداشتی برای این مستأجر ثبت نشده است.'}
              </div>
            ) : (
              <div className="space-y-3">
                {currentTenantNotes.map(n => (
                  <div key={n.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {n.authorId === currentUser?.id ? currentUser.fullName : `کاربر ${n.authorId.slice(0, 8)}`}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                          {n.category === 'onboarding' ? 'آنبوردینگ' : n.category === 'license' ? 'لایسنس' : n.category === 'accounting_fix' ? 'اصلاح حسابداری' : 'گزارش اشکال'}
                        </span>
                      </div>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {new Date(n.timestamp).toLocaleString('fa-IR')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tenantEditOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-edit-title"
            onSubmit={handleSaveTenantAccount}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="tenant-edit-title" className="text-base font-black text-slate-900">
                  ویرایش فضای کاری مستأجر
                </h2>
                <p className="text-xs text-slate-500 mt-1">{selectedTenant.name} · {selectedTenant.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setTenantEditOpen(false)}
                disabled={isProcessing}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
              تعلیق، قابل‌بازگشت است و هیچ داده‌ای را حذف نمی‌کند. ایمیل این فرم، ایمیل تماس مالک است و اطلاعات ورود را تغییر نمی‌دهد.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-700 space-y-1">
                <span>نام کسب‌وکار</span>
                <input
                  required
                  value={tenantEditForm.name}
                  onChange={event => setTenantEditForm(form => ({ ...form, name: event.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 space-y-1">
                <span>نام مالک</span>
                <input
                  required
                  value={tenantEditForm.ownerName}
                  onChange={event => setTenantEditForm(form => ({ ...form, ownerName: event.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 space-y-1">
                <span>ایمیل تماس مالک</span>
                <input
                  required
                  type="email"
                  value={tenantEditForm.ownerEmail}
                  onChange={event => setTenantEditForm(form => ({ ...form, ownerEmail: event.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 space-y-1">
                <span>شماره تماس</span>
                <input
                  value={tenantEditForm.ownerPhone}
                  onChange={event => setTenantEditForm(form => ({ ...form, ownerPhone: event.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700 space-y-1">
                <span>صنف</span>
                <select
                  value={tenantEditForm.guildType}
                  onChange={event => setTenantEditForm(form => ({ ...form, guildType: event.target.value as GuildType }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="services">خدماتی</option>
                  <option value="technology">فناوری</option>
                  <option value="contracting">پیمانکاری</option>
                  <option value="commercial">بازرگانی</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700 space-y-1">
                <span>وضعیت فضای کاری</span>
                <select
                  value={tenantEditForm.status}
                  onChange={event => setTenantEditForm(form => ({
                    ...form,
                    status: event.target.value as 'active' | 'suspended' | 'trial'
                  }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="active">فعال</option>
                  <option value="suspended">معلق (قابل‌بازگشت)</option>
                  <option value="trial">آزمایشی</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTenantEditOpen(false)}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {isProcessing ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default HabinoAdminPanel;
