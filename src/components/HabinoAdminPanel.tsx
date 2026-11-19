import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../lib/store';
import { ROLE_DETAILS_FA } from '../lib/authEngine';
import { AdminTier, Tenant, GuildType } from '../types';
import { toPersianDigits } from '../lib/currencyUtils';
import {
  addSupportNote,
  listPlatformOperators,
  listPlatformTenantsSummary,
  listSupportNotes,
  PlatformOperator,
  PlatformOperatorRole,
  PlatformTenantSummary,
  SupportNote,
  SupportNoteCategory,
  updatePlatformOperatorRole
} from '../lib/platformSupportService';
import { recordSystemAuditEvent } from '../lib/systemAuditService';
import { SystemAuditLogPanel } from './SystemAuditLogPanel';
import { AdminPosDeviceSurvey } from './PosDeviceSurvey';
import SupportMessagingCenter from './SupportMessagingCenter';
import { AdminInfrastructureTab } from './AdminInfrastructureTab';

const EngineeringRoadmap = React.lazy(() =>
  import('./RoadmapStudio').then(module => ({ default: module.RoadmapStudio }))
);
const EngineeringAgentsStudio = React.lazy(() =>
  import('./LiveAgentDiagnosticStudio').then(module => ({ default: module.LiveAgentDiagnosticStudio }))
);
const AdminLicenseManager = React.lazy(() =>
  import('./LicenseManager').then(module => ({ default: module.LicenseManager }))
);
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
  Menu,
  Pencil,
  Save,
  X
} from 'lucide-react';

const TENANTS_PAGE_SIZE = 25;

interface HabinoAdminPanelProps {
  onEnterTenantPreview?: () => void;
  onExitAdmin?: () => void;
}

export const HabinoAdminPanel: React.FC<HabinoAdminPanelProps> = ({ onEnterTenantPreview, onExitAdmin }) => {
  const {
    currentUser,
    activeTenant,
    availableTenants,
    switchTenant,
    updatePlatformTenantAccount,
    isOnline
  } = useAccounting();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isPlatformSupport = currentUser?.role === 'hubino_support';
  const adminTier: AdminTier = currentUser?.adminTier || (isSuperAdmin ? 'founder' : 'support');
  const canViewSupportDesk = adminTier === 'founder' || adminTier === 'support';
  const canViewBilling = adminTier === 'founder' || adminTier === 'billing';
  const canViewInfraAndAudit = adminTier === 'founder' || adminTier === 'sre';
  const canManageOperators = adminTier === 'founder';

  // Active Admin Sub-tab
  type AdminPanelTab = 'tenants' | 'license' | 'notes' | 'audit' | 'pos_survey' | 'inbox' | 'super_admin' | 'infra' | 'rnd_lab';
  const [activeTab, setActiveTab] = useState<AdminPanelTab>(() =>
    adminTier === 'support' ? 'inbox' : adminTier === 'sre' ? 'infra' : 'tenants'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Search & Filters for Tenants
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [tenantPage, setTenantPage] = useState(1);
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
  const [platformTenantSummaries, setPlatformTenantSummaries] = useState<PlatformTenantSummary[]>([]);
  const [tenantSummaryLoading, setTenantSummaryLoading] = useState(false);
  const [tenantSummaryLoaded, setTenantSummaryLoaded] = useState(false);
  const [tenantSummaryError, setTenantSummaryError] = useState<string | null>(null);
  const [tenantSummaryRefreshKey, setTenantSummaryRefreshKey] = useState(0);
  const [platformOperators, setPlatformOperators] = useState<PlatformOperator[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [operatorsError, setOperatorsError] = useState<string | null>(null);
  const [operatorActionLoading, setOperatorActionLoading] = useState(false);
  const [newOperatorEmail, setNewOperatorEmail] = useState('');
  const [newOperatorAdminTier, setNewOperatorAdminTier] = useState<AdminTier>('support');
  const [pendingOperatorChange, setPendingOperatorChange] = useState<{
    email: string;
    role: PlatformOperatorRole;
    adminTier: AdminTier;
  } | null>(null);
  const [pendingImpersonationTenantId, setPendingImpersonationTenantId] = useState<string | null>(null);
  const [impersonationReason, setImpersonationReason] = useState('');
  const [pendingRoleChange, setPendingRoleChange] = useState<PlatformOperator | null>(null);
  const [rndLabView, setRndLabView] = useState<'roadmap' | 'agents'>('roadmap');

  const tenantDirectory: Tenant[] = useMemo(
    () => tenantSummaryLoaded
      ? platformTenantSummaries.map(summary => ({
          id: summary.id,
          name: summary.name,
          slug: summary.slug,
          guildType: summary.guildType,
          ownerEmail: summary.ownerEmail,
          ownerName: summary.ownerName,
          ownerPhone: summary.ownerPhone,
          status: summary.status,
          createdAt: summary.createdAt,
          subscription: summary.subscription || undefined,
          metadata: {
            allowSupportReadOnlyAccess: summary.allowSupportReadOnlyAccess,
            supportAccessGrantedUntil: summary.supportAccessGrantedUntil || undefined
          }
        }))
      : isOnline
        ? []
        : availableTenants,
    [tenantSummaryLoaded, platformTenantSummaries, isOnline, availableTenants]
  );

  const selectedTenant = useMemo(() => {
    return tenantDirectory.find(t => t.id === selectedTenantId) || activeTenant;
  }, [tenantDirectory, selectedTenantId, activeTenant]);

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

  useEffect(() => {
    if (!isSuperAdmin && !isPlatformSupport) return;
    let cancelled = false;
    setTenantSummaryLoading(true);
    setTenantSummaryError(null);
    listPlatformTenantsSummary()
      .then(rows => {
        if (!cancelled) {
          setPlatformTenantSummaries(rows);
          setTenantSummaryLoaded(true);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setPlatformTenantSummaries([]);
          setTenantSummaryError(error instanceof Error ? error.message : 'بارگذاری فهرست مستأجران ناموفق بود.');
        }
      })
      .finally(() => {
        if (!cancelled) setTenantSummaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [isSuperAdmin, isPlatformSupport, tenantSummaryRefreshKey]);

  useEffect(() => {
    if (!canManageOperators || activeTab !== 'super_admin') return;
    let cancelled = false;
    setOperatorsLoading(true);
    setOperatorsError(null);
    listPlatformOperators()
      .then(rows => { if (!cancelled) setPlatformOperators(rows); })
      .catch(error => {
        if (!cancelled) {
          setPlatformOperators([]);
          setOperatorsError(error instanceof Error ? error.message : 'بارگذاری اپراتورهای پلتفرم ناموفق بود.');
        }
      })
      .finally(() => { if (!cancelled) setOperatorsLoading(false); });
    return () => { cancelled = true; };
  }, [canManageOperators, activeTab]);

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
    if (!canViewSupportDesk) return;
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
  }, [selectedTenantId, canViewSupportDesk, resetRefreshKey]);

  // Filtered tenants list
  const filteredTenants = useMemo(() => {
    return tenantDirectory.filter(t => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.ownerPhone && t.ownerPhone.includes(searchTerm)) ||
        (t.ownerName && t.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesPlan = planFilter === 'all' || t.subscription?.plan === planFilter;
      return matchesSearch && matchesPlan;
    });
  }, [tenantDirectory, searchTerm, planFilter]);
  const totalTenantPages = Math.max(1, Math.ceil(filteredTenants.length / TENANTS_PAGE_SIZE));
  const paginatedTenants = useMemo(
    () => filteredTenants.slice((tenantPage - 1) * TENANTS_PAGE_SIZE, tenantPage * TENANTS_PAGE_SIZE),
    [filteredTenants, tenantPage]
  );

  useEffect(() => {
    setTenantPage(1);
  }, [searchTerm, planFilter]);

  useEffect(() => {
    setTenantPage(page => Math.min(page, totalTenantPages));
  }, [totalTenantPages]);

  // Tenant specific notes
  const currentTenantNotes = useMemo(() => {
    return supportNotes.filter(n => n.tenantId === selectedTenantId);
  }, [supportNotes, selectedTenantId]);

  const adminSections = [
    {
      id: 'support',
      title: adminTier === 'support' ? 'میز کار پشتیبانی مستأجران' : 'عملیات پشتیبانی مستأجران',
      description: 'میز کار هدایت‌شدهٔ تیکت‌ها، تماس‌ها و پروندهٔ مستأجران.',
      icon: Headphones,
      visible: canViewSupportDesk,
      tabs: [
        { id: 'inbox' as const, label: 'میز کار پشتیبانی (تیکت و تماس)', icon: Headphones },
        ...(adminTier === 'support'
          ? [{ id: 'tenants' as const, label: `دایرکتوری مستأجران (${tenantDirectory.length})`, icon: Building2 }]
          : [{ id: 'notes' as const, label: `یادداشت‌ها و سوابق تماس (${supportNotes.length})`, icon: MessageSquare }])
      ]
    },
    {
      id: 'billing',
      title: 'مالی، لایسنس و پوز',
      description: 'دایرکتوری مستأجران، لایسنس‌ها و نیازسنجی پوز.',
      icon: Building2,
      visible: canViewBilling,
      tabs: [
        { id: 'tenants' as const, label: `دایرکتوری مستأجران (${tenantDirectory.length})`, icon: Building2 },
        { id: 'license' as const, label: 'صدور و تمدید لایسنس و افزونه', icon: Key },
        { id: 'pos_survey' as const, label: 'نیازسنجی پوز بانکی', icon: CreditCard }
      ]
    },
    {
      id: 'operators',
      title: 'حاکمیت سوپرادمین (فقط بنیان‌گذار)',
      description: 'مدیریت نقش و سطح دسترسی اپراتورهای پلتفرم.',
      icon: ShieldCheck,
      visible: canManageOperators,
      tabs: [
        { id: 'super_admin' as const, label: 'مدیریت اپراتورها', icon: ShieldCheck },
        { id: 'rnd_lab' as const, label: 'آزمایشگاه مهندسی و رودمپ', icon: Zap }
      ]
    },
    {
      id: 'audit',
      title: 'زیرساخت و ممیزی (SRE و بنیان‌گذار)',
      description: 'ثبت‌های ممیزی ناپایدار سراسری (فقط‌خواندنی).',
      icon: ShieldCheck,
      visible: canViewInfraAndAudit,
      tabs: [
        { id: 'audit' as const, label: 'ممیزی سراسری و امنیتی', icon: ShieldCheck },
        { id: 'infra' as const, label: 'زیرساخت و سلامت سامانه', icon: Database }
      ]
    }
  ].filter(section => section.visible);

  const activeSection = adminSections.find(section =>
    section.tabs.some(tab => tab.id === activeTab)
  ) || adminSections[0];

  useEffect(() => {
    if (!adminSections.some(section => section.tabs.some(tab => tab.id === activeTab))) {
      setActiveTab(adminSections[0].tabs[0].id);
    }
  }, [activeTab, adminTier]);

  const handleImpersonateTenant = async (tenantId: string, reason?: string) => {
    if (!canViewSupportDesk) {
      setActionFeedback({ type: 'error', message: 'مشاهدهٔ فضای کاری فقط برای اپراتور پلتفرم مجاز است.' });
      return;
    }
    setIsProcessing(true);
    setActionFeedback({ type: 'info', message: `در حال فعال‌سازی مشاهدهٔ فقط‌خواندنی مستأجر ${tenantId}...` });
    try {
      const targetTenant = tenantDirectory.find(tenant => tenant.id === tenantId);
      const result = await switchTenant(tenantId, reason, targetTenant);
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
      setPendingImpersonationTenantId(null);
      setImpersonationReason('');
      setSelectedTenantId(tenantId);
      setActionFeedback({
        type: 'success',
        message: `مشاهدهٔ فقط‌خواندنی «${targetTenant?.name || tenantId}» آغاز شد و پس از ۳۰ دقیقه پایان می‌یابد.`
      });
      onEnterTenantPreview?.();
    } catch (err) {
      void recordSystemAuditEvent({
        action: 'PLATFORM_IMPERSONATION_STARTED',
        tenantId,
        resourceType: 'tenant',
        resourceId: tenantId,
        reasonCode: 'TENANT_SWITCH_FAILED',
        outcome: 'failed'
      });
      setActionFeedback({ type: 'error', message: err instanceof Error ? err.message : 'خطا در تعویض مستأجر' });
    } finally {
      setIsProcessing(false);
    }
  };

  const requestTenantObservation = (tenantId: string) => {
    const summary = platformTenantSummaries.find(item => item.id === tenantId);
    if (summary?.status === 'suspended') {
      setActionFeedback({
        type: 'error',
        message: 'فضای کاری این مستأجر تعلیق شده است و مشاهدهٔ پنل آن مجاز نیست. ابتدا وضعیت آن را تغییر دهید.'
      });
      return;
    }
    const consentIsValid = summary?.allowSupportReadOnlyAccess === true &&
      !!summary.supportAccessGrantedUntil &&
      new Date(summary.supportAccessGrantedUntil).getTime() > Date.now();
    if (consentIsValid || tenantId === currentUser?.tenantId) {
      void handleImpersonateTenant(tenantId);
      return;
    }
    setPendingImpersonationTenantId(tenantId);
    setImpersonationReason('');
  };

  const handleUpdatePlatformRole = async (
    email: string,
    role: PlatformOperatorRole,
    adminTier?: AdminTier | null
  ) => {
    if (!canManageOperators || operatorActionLoading) return;
    setOperatorActionLoading(true);
    setOperatorsError(null);
    try {
      const operator = await updatePlatformOperatorRole(email, role, adminTier);
      setPlatformOperators(current => {
        const remaining = current.filter(item => item.id !== operator.id);
        return role === 'tenant_owner' ? remaining : [...remaining, operator];
      });
      setPendingRoleChange(null);
      setPendingOperatorChange(null);
      setNewOperatorEmail('');
      setActionFeedback({ type: 'success', message: 'نقش اپراتور پلتفرم با موفقیت به‌روزرسانی شد.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تغییر نقش اپراتور ناموفق بود.';
      setOperatorsError(message);
      setActionFeedback({ type: 'error', message });
    } finally {
      setOperatorActionLoading(false);
    }
  };

  const handleNewOperatorSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const email = newOperatorEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setOperatorsError('یک نشانی ایمیل معتبر وارد کنید.');
      return;
    }
    const role: PlatformOperatorRole = newOperatorAdminTier === 'founder' ? 'super_admin' : 'hubino_support';
    setPendingOperatorChange({ email, role, adminTier: newOperatorAdminTier });
  };

  const handleSaveTenantAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageOperators) return;
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
      setTenantSummaryRefreshKey(key => key + 1);
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
    if (!newNoteContent.trim() || !canViewSupportDesk) return;
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

  const handleQuickCreateSupportNote = async (
    tenantId: string,
    category: SupportNoteCategory,
    content: string
  ): Promise<SupportNote> => {
    if (!canViewSupportDesk) throw new Error('ثبت یادداشت تماس برای این سطح دسترسی مجاز نیست.');
    try {
      const note = await addSupportNote(tenantId, category, content);
      void recordSystemAuditEvent({
        action: 'SUPPORT_NOTE_CREATED',
        tenantId,
        resourceType: 'platform_support_note',
        resourceId: note.id,
        reasonCode: category.toUpperCase(),
        outcome: 'succeeded'
      });
      setSupportNotes(notes => [note, ...notes]);
      setActionFeedback({ type: 'success', message: 'یادداشت تماس در پرونده مستأجر ثبت شد.' });
      return note;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ثبت یادداشت تماس ناموفق بود.';
      setActionFeedback({ type: 'error', message });
      throw error;
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
    <div className="min-h-screen bg-slate-50 font-sans lg:flex" dir="rtl">
      <aside className={`sticky top-0 z-40 flex w-full flex-col border-l border-slate-800 bg-slate-900 text-white lg:sticky lg:h-screen lg:w-60 lg:shrink-0 ${mobileNavOpen ? 'min-h-screen' : 'h-14 lg:h-screen'}`}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">
              {adminTier === 'support' ? 'میز کار پشتیبانی' : 'کنسول مدیریت هابینو'}
            </p>
            <span className={`text-[10px] ${adminTier === 'founder' ? 'text-amber-300' : 'text-teal-200'}`}>
              {{ founder: 'بنیان‌گذار', support: 'پشتیبان مستأجران', billing: 'مالی و لایسنس', sre: 'زیرساخت و SRE' }[adminTier]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(open => !open)}
            aria-expanded={mobileNavOpen}
            aria-controls="admin-sidebar-navigation"
            aria-label={mobileNavOpen ? 'بستن ناوبری' : 'بازکردن ناوبری'}
            className="rounded-lg p-2 text-slate-200 hover:bg-slate-800 lg:hidden"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <nav
          id="admin-sidebar-navigation"
          aria-label="ناوبری کنسول مدیریت"
          className={`${mobileNavOpen ? 'block' : 'hidden'} flex-1 space-y-4 overflow-y-auto p-3 lg:block`}
        >
          {adminSections.map(section => (
            <section key={section.id} className="space-y-1">
              <h2 className="px-2 text-[10px] font-bold text-slate-400">{section.title}</h2>
              {section.tabs.map(tab => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileNavOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-right text-[11px] font-semibold transition-colors ${
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <TabIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <footer className={`${mobileNavOpen ? 'block' : 'hidden'} space-y-2 border-t border-slate-800 p-3 lg:block`}>
          <p className="truncate text-xs font-bold text-slate-200">{currentUser?.fullName}</p>
          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-right text-xs font-bold text-white hover:bg-white/20"
            >
              بازگشت به فضای کار
            </button>
          )}
        </footer>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <h1 className="truncate text-sm font-black text-slate-800">{activeSection?.title || 'کنسول مدیریت'}</h1>
          <div className="flex min-w-0 items-center gap-2 text-[10px]">
            <span className="max-w-[45vw] truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">
              مستأجر فعال: {selectedTenant?.name || 'نامشخص'}
            </span>
            <span className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1.5 font-bold text-amber-800">
              فقط‌خواندنی / غیرمالی
            </span>
          </div>
        </header>

        <main className="flex-1 space-y-4 p-4 sm:p-5">
          {actionFeedback && (
            <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs animate-fadeIn ${
              actionFeedback.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : actionFeedback.type === 'error'
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : 'border-blue-300 bg-blue-50 text-blue-900'
            }`}>
              <div className="flex items-center gap-2">
                {actionFeedback.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                {actionFeedback.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />}
                {actionFeedback.type === 'info' && <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-blue-600" />}
                <span>{actionFeedback.message}</span>
              </div>
              <button type="button" onClick={() => setActionFeedback(null)} className="shrink-0 text-slate-500 underline">
                بستن
              </button>
            </div>
          )}

      {activeTab === 'audit' && canViewInfraAndAudit && (
        <SystemAuditLogPanel tenantId={selectedTenantId} />
      )}

      {activeTab === 'infra' && canViewInfraAndAudit && (
        <AdminInfrastructureTab />
      )}

      {activeTab === 'rnd_lab' && canManageOperators && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" dir="rtl">
          <div>
            <h2 className="font-black text-slate-900">آزمایشگاه مهندسی و رودمپ</h2>
            <p className="mt-1 text-xs text-slate-500">ابزارهای مهندسی و نقشهٔ راه فقط در این فضای بنیان‌گذار در دسترس هستند.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRndLabView('roadmap')} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">رودمپ</button>
            <button type="button" onClick={() => setRndLabView('agents')} className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">استودیو ایجنت‌ها</button>
            <button type="button" onClick={() => setActiveTab('infra')} className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">پایش سلامت سامانه</button>
            <button type="button" onClick={() => setActiveTab('audit')} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">گزارش‌های مهندسی</button>
          </div>
          <React.Suspense fallback={<p role="status" className="text-xs text-slate-500">در حال بارگذاری رودمپ مهندسی...</p>}>
            {rndLabView === 'roadmap' ? <EngineeringRoadmap /> : <EngineeringAgentsStudio />}
          </React.Suspense>
        </section>
      )}

      {activeTab === 'pos_survey' && canViewBilling && (
        <AdminPosDeviceSurvey tenants={tenantDirectory} />
      )}

      {activeTab === 'inbox' && canViewSupportDesk && (
        <SupportMessagingCenter
          mode="support"
          tenants={tenantDirectory}
          onRequestReadOnlyPreview={(tenantId, reason) => handleImpersonateTenant(tenantId, reason)}
          onQuickCreateSupportNote={handleQuickCreateSupportNote}
        />
      )}

      {/* TAB 1: Tenants Workdesk & Directory */}
      {activeTab === 'tenants' && (canViewSupportDesk || canViewBilling) && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="جستجو بر اساس نام، شناسه، مالک یا موبایل..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-slate-400" />
              <select
                value={planFilter}
                onChange={event => setPlanFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
              >
                <option value="all">همه پلن‌ها</option>
                <option value="starter">پایه (Starter)</option>
                <option value="professional">حرفه‌ای (Pro)</option>
                <option value="enterprise">سازمانی (Enterprise)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setTenantSummaryRefreshKey(key => key + 1)}
              disabled={tenantSummaryLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${tenantSummaryLoading ? 'animate-spin' : ''}`} />
              تازه‌سازی
            </button>
            <span className="shrink-0 text-[11px] font-bold text-slate-500">
              {toPersianDigits(filteredTenants.length)} مستأجر
            </span>
          </div>
          {tenantSummaryError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{tenantSummaryError}</p>}
          {tenantSummaryLoading && <p role="status" className="text-xs text-slate-500">در حال دریافت خلاصهٔ غیرمالی مستأجران...</p>}
          {!tenantSummaryLoading && tenantDirectory.length === 0 && !tenantSummaryError && (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">مستأجری برای نمایش در دسترس نیست.</p>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[950px] border-collapse text-right text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">کسب‌وکار / شناسه</th>
                  <th className="px-3 py-2.5">مالک و تماس</th>
                  <th className="px-3 py-2.5">پلن و وضعیت</th>
                  <th className="px-3 py-2.5">مجوز مشاهده</th>
                  <th className="px-3 py-2.5">اقدامات سریع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTenants.map(t => {
              const isSelected = t.id === selectedTenantId;
              const isCurrentActive = t.id === activeTenant.id;
              const sub = t.subscription;
              const isTrial = sub?.status === 'trial';
              const remainingTrial = sub?.trialDaysRemaining ?? 30;
              const consentActive = t.metadata.allowSupportReadOnlyAccess === true &&
                !!t.metadata.supportAccessGrantedUntil &&
                new Date(t.metadata.supportAccessGrantedUntil).getTime() > Date.now();

              return (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  aria-selected={isSelected}
                  className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50/70' : 'bg-white'}`}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                      <span>{t.id}</span>
                      {isCurrentActive && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-sans font-bold text-emerald-800">فعال مرورگر</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-800">{t.ownerName || 'ثبت‌نشده'}</p>
                    {(canViewSupportDesk || canViewBilling || canManageOperators) && (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">{t.ownerPhone || '—'}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-bold text-indigo-700">{sub?.planNameFa || 'پایه'}</p>
                    <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      t.status === 'suspended' || sub?.isSuspended
                        ? 'bg-rose-100 text-rose-800'
                        : isTrial
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {t.status === 'suspended' || sub?.isSuspended
                        ? 'معلق / قفل'
                        : isTrial ? `تست ${toPersianDigits(remainingTrial)} روزه` : 'فعال'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {consentActive
                      ? <span className="font-bold text-emerald-700">با رضایت</span>
                      : <span className="font-bold text-amber-700">نیازمند دلیل</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {canManageOperators && (
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            setSelectedTenantId(t.id);
                            setTenantEditOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                        >
                          <Pencil className="h-3 w-3" />
                          ویرایش
                        </button>
                      )}
                      {canViewSupportDesk && (
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            requestTenantObservation(t.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-blue-700"
                        >
                          <Eye className="h-3 w-3" />
                          مشاهده
                        </button>
                      )}
                      {canViewBilling && (
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            setSelectedTenantId(t.id);
                            setActiveTab('license');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Key className="h-3 w-3" />
                          لایسنس
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
                {filteredTenants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-500">مستأجری با این جستجو پیدا نشد.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className="text-[11px] font-semibold text-slate-600">
              صفحه {toPersianDigits(tenantPage)} از {toPersianDigits(totalTenantPages)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTenantPage(page => Math.max(1, page - 1))}
                disabled={tenantPage <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
              >
                قبلی
              </button>
              <button
                type="button"
                onClick={() => setTenantPage(page => Math.min(totalTenantPages, page + 1))}
                disabled={tenantPage >= totalTenantPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
              >
                بعدی
              </button>
            </div>
          </div>
        </div>
      )}

{/* TAB 3: Centralized License Management */}
      {canViewBilling && activeTab === 'license' && (
        <div className="space-y-4">
          <React.Suspense fallback={<div role="status" className="p-6 text-center text-sm text-slate-500" dir="rtl">در حال بارگذاری مدیریت لایسنس...</div>}>
            <AdminLicenseManager defaultTab="master" tenantsOverride={tenantDirectory} initialTenantId={selectedTenantId} />
          </React.Suspense>
        </div>
      )}

      {/* TAB: Super Admin Management */}
      {canManageOperators && activeTab === 'super_admin' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              مدیریت سوپر ادمینان پلتفرم
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              تعریف، تغییر و لغو نقش سوپرادمین برای کاربران پلتفرم هابینو. فقط بنیان‌گذار مجاز به این عملیات است.
            </p>
          </div>

          {operatorsError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{operatorsError}</p>}
          {operatorsLoading ? (
            <p role="status" className="text-xs text-slate-500">در حال بارگذاری اپراتورهای واقعی پلتفرم...</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 p-4">
              <table className="w-full min-w-[700px] text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 font-medium">نام</th>
                    <th className="pb-2 font-medium">ایمیل</th>
                    <th className="pb-2 font-medium">سطح و نقش پایه</th>
                    <th className="pb-2 font-medium">آخرین ورود</th>
                    <th className="pb-2 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {platformOperators.map(operator => (
                    <tr key={operator.id} className="border-b border-slate-100">
                      <td className="py-3 font-semibold text-slate-800">{operator.fullName || 'نام ثبت‌نشده'}</td>
                      <td className="py-3 text-slate-600">{operator.email}</td>
                      <td className="py-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${
                          operator.adminTier === 'founder' ? 'bg-amber-100 text-amber-800'
                            : operator.adminTier === 'billing' ? 'bg-indigo-100 text-indigo-800'
                              : operator.adminTier === 'sre' ? 'bg-sky-100 text-sky-800'
                                : 'bg-teal-100 text-teal-800'
                        }`}>
                          {{ founder: 'بنیان‌گذار', support: 'پشتیبان مستأجران', billing: 'مالی و لایسنس', sre: 'زیرساخت و SRE' }[operator.adminTier]}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-500">
                          نقش پایه: {operator.role === 'super_admin' ? 'سوپرادمین' : 'اپراتور پلتفرم'}
                        </p>
                      </td>
                      <td className="py-3 text-xs text-slate-500">{operator.lastSignInAt ? new Date(operator.lastSignInAt).toLocaleString('fa-IR') : 'ثبت نشده'}</td>
                      <td className="py-3">
                        {operator.email.toLowerCase() !== 'tehrani.smart51@gmail.com' && (
                          <button
                            type="button"
                            onClick={() => setPendingRoleChange(operator)}
                            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          >
                            لغو نقش اپراتور
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!platformOperators.length && <tr><td colSpan={5} className="py-5 text-center text-xs text-slate-400">اپراتور پلتفرمی ثبت نشده است.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={handleNewOperatorSubmit} className="rounded-2xl border border-slate-200 p-5">
            <h4 className="mb-4 font-bold text-slate-900">تعیین نقش اپراتور پلتفرم</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                ایمیل کاربر
                <input
                  type="email"
                  value={newOperatorEmail}
                  onChange={event => setNewOperatorEmail(event.target.value)}
                  required
                  placeholder="example@habino.ir"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                سطح دسترسی
                <select
                  value={newOperatorAdminTier}
                  onChange={event => setNewOperatorAdminTier(event.target.value as AdminTier)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-normal"
                >
                  <option value="founder">بنیان‌گذار</option>
                  <option value="support">پشتیبان مستأجران</option>
                  <option value="billing">مالی و لایسنس</option>
                  <option value="sre">زیرساخت و SRE</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={operatorActionLoading}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              اعمال تغییر نقش
            </button>
          </form>

          {/* Important Notes */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h4 className="font-bold text-amber-900 mb-2">⚠️ نکات امنیتی مهم</h4>
            <ul className="text-sm text-amber-800 space-y-1 list-disc pl-4">
              <li>سوپرادمین دسترسی فراگیر به کل پلتفرم و تمام مستأجران دارد.</li>
              <li>نمی‌توان آخرین سوپرادمین را بدون معرفی جایگزين تغییر نقش داد.</li>
              <li>تقریرات هوش صوتی سیناپس: تغییر نقش نیازمند تأیید صوتی صریح بنیان‌گذار است.</li>
              <li>تمام تغییرات در لاگ ممیزی سیستمی ثبت می‌شود.</li>
              <li>ایمیل بنیان‌گذار <code className="font-mono text-xs bg-amber-200 px-1 py-0.5 rounded">tehrani.smart51@gmail.com</code> همواره به عنوان سوپرادمین حفظ می‌شود.</li>
            </ul>
          </div>
</div>
      )}

      {pendingImpersonationTenantId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <form
            onSubmit={event => {
              event.preventDefault();
              if (!impersonationReason.trim()) return;
              void handleImpersonateTenant(pendingImpersonationTenantId, impersonationReason.trim());
            }}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="impersonation-reason-title"
            dir="rtl"
          >
            <h2 id="impersonation-reason-title" className="font-black text-slate-900">ثبت دلیل اضطراری مشاهده</h2>
            <p className="text-xs leading-6 text-slate-600">
              برای مستأجر «{tenantDirectory.find(tenant => tenant.id === pendingImpersonationTenantId)?.name || pendingImpersonationTenantId}» رضایت معتبر ثبت نشده است. دلیل مشاهده باید ثبت شود؛ دسترسی همچنان فقط‌خواندنی و حداکثر ۳۰ دقیقه است.
            </p>
            <textarea
              value={impersonationReason}
              onChange={event => setImpersonationReason(event.target.value)}
              required
              minLength={8}
              maxLength={180}
              rows={4}
              autoFocus
              placeholder="دلیل مشخص و مرتبط با درخواست پشتیبانی را بنویسید..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPendingImpersonationTenantId(null); setImpersonationReason(''); }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">انصراف</button>
              <button type="submit" disabled={isProcessing || impersonationReason.trim().length < 8} className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">ثبت دلیل و شروع مشاهده</button>
            </div>
          </form>
        </div>
      )}

      {pendingOperatorChange && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="operator-change-title" dir="rtl">
            <h2 id="operator-change-title" className="font-black text-slate-900">تأیید تغییر نقش اپراتور</h2>
            <p className="text-xs leading-6 text-slate-600">
              نقش {pendingOperatorChange.email} به «{{ founder: 'بنیان‌گذار', support: 'پشتیبان مستأجران', billing: 'مالی و لایسنس', sre: 'زیرساخت و SRE' }[pendingOperatorChange.adminTier]}» تغییر کند؟
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingOperatorChange(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">انصراف</button>
              <button type="button" disabled={operatorActionLoading} onClick={() => void handleUpdatePlatformRole(pendingOperatorChange.email, pendingOperatorChange.role, pendingOperatorChange.adminTier)} className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">تأیید تغییر</button>
            </div>
          </div>
        </div>
      )}

      {pendingRoleChange && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="operator-revoke-title" dir="rtl">
            <h2 id="operator-revoke-title" className="font-black text-slate-900">لغو نقش اپراتور</h2>
            <p className="text-xs leading-6 text-slate-600">نقش پلتفرمی {pendingRoleChange.email} به مدیر مستأجر تغییر می‌کند. سرور از کاهش نقش آخرین سوپرادمین جلوگیری خواهد کرد.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingRoleChange(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">انصراف</button>
              <button type="button" disabled={operatorActionLoading} onClick={() => void handleUpdatePlatformRole(pendingRoleChange.email, 'tenant_owner', null)} className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">تأیید لغو نقش</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Support Notes & Call Logs */}
      {canViewSupportDesk && activeTab === 'notes' && (
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
              <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                {currentTenantNotes.map(n => (
                  <div key={n.id} className="space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50 p-3">
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

      {tenantEditOpen && canManageOperators && (
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
        </main>
      </div>
    </div>
  );
};

export default HabinoAdminPanel;
