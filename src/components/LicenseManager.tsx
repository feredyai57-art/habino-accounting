import React, { useEffect, useState } from 'react';
import { useAccounting } from '../lib/store';
import {
  TIER_DETAILS,
  getRemainingDays,
  DEMO_VS_MARKET_COMPARISON
} from '../lib/licenseEngine';
import { SubscriptionPlanType, Tenant } from '../types';
import { formatCurrency } from '../lib/currencyUtils';
import { UpgradeModal } from './UpgradeModal';
import { issuePlatformAddonLicense, issuePlatformLicense } from '../lib/platformSupportService';
import {
  ShieldCheck,
  Key,
  CreditCard,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  RefreshCw,
  Award,
  Crown,
  Lock,
  ChevronLeft,
  Users,
  Bot,
  ShoppingBag,
  Database,
  Layers,
  ArrowLeftRight,
  PackagePlus
} from 'lucide-react';
import { HABINO_ADDONS, PLAN_LIMITS } from '../lib/authEngine';

interface LicenseManagerProps {
  defaultTab?: 'comparison' | 'plans' | 'environment' | 'master';
  tenantsOverride?: Tenant[];
  initialTenantId?: string;
}

export const LicenseManager: React.FC<LicenseManagerProps> = ({ defaultTab, tenantsOverride, initialTenantId }) => {
  const {
    license,
    activeTenant,
    availableTenants,
    currentUser,
    hasAddon,
    activateLicense,
    loadDemoData,
    switchToCleanMarketData,
    settings
  } = useAccounting();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'comparison' | 'plans' | 'environment' | 'master'>(defaultTab || 'comparison');
  const [modalInitialTab, setModalInitialTab] = useState<'plans' | 'addons'>('plans');

  // Activation Key Input
  const [inputKey, setInputKey] = useState<string>('');
  const [holderName, setHolderName] = useState<string>('');
  const [activationMsg, setActivationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isActivating, setIsActivating] = useState<boolean>(false);

  // Master Generator State (For Farid Tehrani)
  const [genTier, setGenTier] = useState<SubscriptionPlanType>('starter');
  const [genDuration, setGenDuration] = useState<number>(365);
  const [genTenantId, setGenTenantId] = useState<string>(initialTenantId || activeTenant.id);
  const [generatedKey, setGeneratedKey] = useState<{
    serialKey: string;
    expiresAt: string | null;
    isLifetime: boolean;
    tenantName: string;
    plan: SubscriptionPlanType;
  } | null>(null);

  const [genAddonId, setGenAddonId] = useState<string>('addon_payroll');
  const [generatedAddonKey, setGeneratedAddonKey] = useState<{ serialKey: string; tenantName: string } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedAddon, setCopiedAddon] = useState<boolean>(false);

  const [envMsg, setEnvMsg] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState<boolean>(false);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canIssueLicenses = currentUser?.role === 'super_admin' ||
    currentUser?.adminTier === 'founder' ||
    currentUser?.adminTier === 'billing';
  const targetTenants = tenantsOverride?.length ? tenantsOverride : availableTenants;
  const licenseTargetTenant = targetTenants.find(tenant => tenant.id === genTenantId);

  useEffect(() => {
    setGenTenantId(initialTenantId || activeTenant.id);
  }, [activeTenant.id, initialTenantId]);

  const remaining = getRemainingDays(license.expiresAt);
  const currentTierInfo = TIER_DETAILS[license.tier] || TIER_DETAILS.bazaar || TIER_DETAILS.pro;
  const availableActiveAddonCount = (activeTenant?.subscription?.activeAddons || []).filter(addonId =>
    HABINO_ADDONS.some(addon => addon.id === addonId && addon.status === 'available')
  ).length;
  const isServerIssuedLicenseKey = /^HAB-[A-F0-9]{48}$/i.test(license.licenseKey);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    setIsActivating(true);
    setActivationMsg(null);

    const res = await activateLicense(inputKey, holderName || 'کاربر گرامی');
    setIsActivating(false);

    if (res.success) {
      setActivationMsg({ type: 'success', text: res.message });
      setInputKey('');
    } else {
      setActivationMsg({ type: 'error', text: res.message });
    }
  };

  const handleUnavailablePurchase = () => {
    setActivationMsg({
      type: 'error',
      text: 'درگاه پرداخت درون‌برنامه‌ای هنوز به سرویس پرداخت متصل نیست؛ برای ارتقا از کلید لایسنس معتبر استفاده کنید.'
    });
  };

  const handleGenerateSerial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canIssueLicenses || !licenseTargetTenant) return;
    setIsActivating(true);
    setActivationMsg(null);
    try {
      const result = await issuePlatformLicense(licenseTargetTenant.id, genTier, genDuration);
      setGeneratedKey({ ...result, tenantName: licenseTargetTenant.name, plan: genTier });
      setCopied(false);
    } catch (error) {
      setActivationMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'صدور لایسنس از سرویس امن ناموفق بود.'
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleGenerateAddonKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canIssueLicenses || !licenseTargetTenant) return;
    const addon = HABINO_ADDONS.find(item => item.id === genAddonId && item.status === 'available');
    if (!addon) {
      setActivationMsg({ type: 'error', text: 'صدور کلید فقط برای افزونه‌های منتشرشده مجاز است.' });
      return;
    }
    setIsActivating(true);
    setActivationMsg(null);
    try {
      const result = await issuePlatformAddonLicense(licenseTargetTenant.id, genAddonId);
      setGeneratedAddonKey({ serialKey: result.serialKey, tenantName: licenseTargetTenant.name });
      setCopiedAddon(false);
    } catch (error) {
      setActivationMsg({
        type: 'error',
        text: error instanceof Error ? error.message : 'صدور کلید افزونه از سرویس امن ناموفق بود.'
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleCopyAddonKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedAddon(true);
    setTimeout(() => setCopiedAddon(false), 2500);
  };

  const handleLoadDemo = () => {
    loadDemoData();
    setEnvMsg('داده‌های نمونه آموزشی و تستی نسخه دمو با موفقیت بارگذاری شدند.');
    setTimeout(() => setEnvMsg(null), 4000);
  };

  const handleCleanSlate = () => {
    switchToCleanMarketData();
    setEnvMsg('پایگاه‌داده با موفقیت برای شروع کار واقعی کسب‌وکار شما در نسخه بازار آماده و تمیز شد.');
    setTimeout(() => setEnvMsg(null), 4000);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-10" id="license-manager-module">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
            <span>مدیریت لایسنس و امکانات نسخه بازار هابینو</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            مقایسه پلن‌ها، فعال‌سازی فوری با کد لایسنس معتبر و مدیریت افزونه‌های هابینو
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setModalInitialTab('addons');
              setUpgradeModalOpen(true);
            }}
            className="text-xs px-3.5 py-1.5 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <PackagePlus className="w-4 h-4" />
            <span>فروشگاه افزونه‌ها (Add-ons)</span>
          </button>
          <button
            onClick={() => {
              setModalInitialTab('plans');
              setUpgradeModalOpen(true);
            }}
            className="text-xs px-3.5 py-1.5 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Crown className="w-4 h-4 text-slate-950" />
            <span>خرید و ارتقای اشتراک</span>
          </button>
          <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-500" />
            {activeTenant?.subscription?.plan === 'enterprise' ? 'سطح ۳: سازمانی' : activeTenant?.subscription?.plan === 'professional' ? 'سطح ۲: کارگاه‌ها' : 'سطح ۱: پایه'}
          </span>
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
            isSuperAdmin ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : remaining.isExpired ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {isSuperAdmin ? 'فعال — سوپر ادمین (بدون انقضاء)' : remaining.formatted}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('comparison')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'comparison'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>مقایسه امکانات دمو و نسخه بازار (فعال‌سازی ۱۰۰٪)</span>
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'plans'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>طرح‌های اشتراک و خرید بازار</span>
        </button>

        <button
          onClick={() => setActiveTab('environment')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'environment'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>محیط داده (سوئیچ دمو / کار واقعی)</span>
        </button>

        {canIssueLicenses && (
          <button
            onClick={() => setActiveTab('master')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'master'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>پنل صدور لایسنس (مدیریت کل)</span>
          </button>
        )}
      </div>

      {/* Active License Overview Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-8 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                وضعیت: {license.status === 'active' ? 'نسخه بازار فعال و معتبر' : 'منقضی شده'}
              </span>
              <span className="text-xs text-slate-300">مالک: {license.holderName}</span>
            </div>

            <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              {currentTierInfo.title}
            </h3>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              {currentTierInfo.subtitle}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <Key className="w-4 h-4 text-blue-400" />
                <span className="font-mono">{license.licenseKey}</span>
                {!isServerIssuedLicenseKey && (
                  <span className="text-[10px] text-amber-300 border border-amber-300/30 rounded px-1.5 py-0.5">
                    {license.licenseKey.toUpperCase().startsWith('HABINO-TRIAL-')
                      ? 'شناسهٔ آزمایشی؛ کد فعال‌سازی نیست'
                      : 'شناسهٔ محلی؛ کد فعال‌سازی نیست'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>اعتبار تا: {new Date(license.expiresAt).toLocaleDateString('fa-IR')}</span>
              </div>
              {availableActiveAddonCount > 0 && (
                <div className="flex items-center gap-1.5 text-indigo-300 font-semibold bg-indigo-950/60 px-2.5 py-0.5 rounded-lg border border-indigo-800/60">
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>{availableActiveAddonCount} افزونه ماژولار فعال</span>
                </div>
              )}
              {license.aiSynapseEnabled && currentUser?.role === 'super_admin' && (
                <div className="flex items-center gap-1.5 text-violet-300 font-semibold bg-violet-950/60 px-2 py-0.5 rounded border border-violet-800/60">
                  <Bot className="w-3.5 h-3.5" />
                  <span>دسترسی داخلی سیناپس</span>
                </div>
              )}
              {currentUser?.role !== 'super_admin' && (
                <div className="flex items-center gap-1.5 text-violet-300 font-semibold bg-violet-950/60 px-2 py-0.5 rounded border border-violet-800/60">
                  <Bot className="w-3.5 h-3.5" />
                  <span>دستیارهای هوشمند در نسخه‌های آینده ارائه می‌شوند</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
            <button
              onClick={() => {
                setModalInitialTab('addons');
                setUpgradeModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>فروشگاه افزونه‌ها</span>
            </button>
            <button
              onClick={() => {
                setModalInitialTab('plans');
                setUpgradeModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Crown className="w-4 h-4 text-slate-950" />
              <span>خرید و تمدید اشتراک</span>
            </button>
            {isServerIssuedLicenseKey && (
              <button
                onClick={() => handleCopyKey(license.licenseKey)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-blue-300" />}
                <span>{copied ? 'کپی شد!' : 'کپی کد لایسنس'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {activationMsg && (
        <div className={`p-4 rounded-2xl border text-xs font-medium flex items-center gap-2.5 ${
          activationMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {activationMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
          <span>{activationMsg.text}</span>
        </div>
      )}

      {/* TAB 1: COMPARISON & FULL ACTIVATION */}
      {activeTab === 'comparison' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span>تعداد کل قابلیت‌های در نظر گرفته شده</span>
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">۱۵ قابلیت کلیدی</div>
              <p className="text-[11px] text-slate-500">فاکتور، چک صیادی، اقساط، حسابداری دوبل، ترازنامه و...</p>
            </div>

            <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
                <span>وضعیت فعال‌سازی قابلیت‌ها</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-800">وابسته به اشتراک معتبر</div>
              <p className="text-[11px] text-emerald-700">دسترسی پس از تأیید لایسنس و افزونه‌های فعال نمایش داده می‌شود.</p>
            </div>

            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-blue-700 text-xs font-bold">
                <span>محدودیت یا بخش غیرفعال</span>
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-800">بر اساس پلن</div>
              <p className="text-[11px] text-blue-700">محدودیت‌ها مطابق سطح اشتراک و افزونه‌های تأییدشده اعمال می‌شوند.</p>
            </div>
          </div>

          {/* Detailed Feature Comparison Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  ماتریس مقایسه امکانات نسخه دمو با نسخه بازار هابینو
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تطبیق دقیق کلیه بخش‌های طراحی شده در نسخه آزمایشی با امکانات ارائه شده در نسخه بازار
                </p>
              </div>

            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-100/60">
                    <th className="p-4">ردیف</th>
                    <th className="p-4">نام بخش و قابلیت</th>
                    <th className="p-4">دسته‌بندی</th>
                    <th className="p-4">وضعیت در نسخه دمو</th>
                    <th className="p-4">وضعیت در نسخه بازار</th>
                    <th className="p-4 text-center">شرط دسترسی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DEMO_VS_MARKET_COMPARISON.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-4 font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-sm">{item.title}</div>
                        <div className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-lg">{item.description}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 whitespace-nowrap">
                        <span>{item.demoStatus}</span>
                      </td>
                      <td className="p-4 text-emerald-700 font-bold whitespace-nowrap">
                        {item.bazaarStatus}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold text-[11px]">
                          پلن یا افزونه معتبر
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PLANS & IN-APP PURCHASE */}
      {activeTab === 'plans' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Subscription Plans & Direct Purchase Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bazaar Edition Plan */}
            <div className={`rounded-3xl border p-6 flex flex-col justify-between relative shadow-lg transition-all ${
              license.tier === 'bazaar' ? 'border-emerald-600 ring-2 ring-emerald-600/20 bg-emerald-50/20' : 'border-emerald-200 bg-white'
            }`}>
              <span className="absolute -top-3 right-6 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" />
                نسخه رسمی کافه بازار
              </span>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">بسته ویژه بازار</span>
                  {license.tier === 'bazaar' && <span className="text-[11px] font-bold text-emerald-600">طرح فعلی شما</span>}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{TIER_DETAILS.bazaar.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{TIER_DETAILS.bazaar.subtitle}</p>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(TIER_DETAILS.bazaar.price, settings.currency)}
                  <span className="text-xs font-normal text-slate-500 mr-1.5">/ اشتراک کامل بازار</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-700 pt-2">
                  {TIER_DETAILS.bazaar.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={handleUnavailablePurchase}
                className="mt-6 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                {license.tier === 'bazaar' ? 'اشتراک بازار فعال است' : 'اطلاعات خرید درون‌برنامه‌ای'}
              </button>
            </div>

            {/* Pro Plan */}
            <div className={`rounded-3xl border p-6 flex flex-col justify-between transition-all ${
              license.tier === 'pro' ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/20' : 'border-slate-200 bg-white'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">حرفه‌ای</span>
                  {license.tier === 'pro' && <span className="text-[11px] font-bold text-blue-600">طرح فعلی شما</span>}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{TIER_DETAILS.pro.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{TIER_DETAILS.pro.subtitle}</p>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(TIER_DETAILS.pro.price, settings.currency)}
                  <span className="text-xs font-normal text-slate-500 mr-1.5">/ سالانه</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-700 pt-2">
                  {TIER_DETAILS.pro.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={handleUnavailablePurchase}
                className="mt-6 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
              >
                {license.tier === 'pro' ? 'تمدید اشتراک حرفه‌ای' : 'اطلاعات طرح حرفه‌ای'}
              </button>
            </div>

            {/* Enterprise CFO Plan */}
            <div className={`rounded-3xl border p-6 flex flex-col justify-between transition-all ${
              license.tier === 'enterprise' ? 'border-purple-600 ring-2 ring-purple-600/20 bg-purple-50/20' : 'border-slate-200 bg-white'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    سازمانی
                  </span>
                  {license.tier === 'enterprise' && <span className="text-[11px] font-bold text-purple-600">طرح فعلی شما</span>}
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{TIER_DETAILS.enterprise.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{TIER_DETAILS.enterprise.subtitle}</p>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(TIER_DETAILS.enterprise.price, settings.currency)}
                  <span className="text-xs font-normal text-slate-500 mr-1.5">/ سالانه</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-700 pt-2">
                  {TIER_DETAILS.enterprise.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={handleUnavailablePurchase}
                className="mt-6 w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                {license.tier === 'enterprise' ? 'طرح سازمانی فعال است' : 'اطلاعات طرح سازمانی'}
              </button>
            </div>
          </div>

          {/* Manual Key Activation Section */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                <span>ثبت و ارتقای لایسنس با کد فعال‌سازی (Serial Key)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                فقط کد واقعی صادرشده از پنل سوپرادمین را وارد کنید. شناسهٔ نمایشی Trial و کدهای نمونه، لایسنس قابل‌فعال‌سازی نیستند.
              </p>
            </div>

            <form onSubmit={handleActivate} className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <input
                  type="text"
                  placeholder="نام دارنده اشتراک / شرکت (اختیاری)"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-blue-500"
                />
              </div>
              <div className="md:col-span-5">
                <input
                  type="text"
                  placeholder="کد لایسنس صادرشده از پنل سوپرادمین"
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 uppercase focus:outline-blue-500"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={isActivating}
                  className="w-full h-full min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isActivating ? 'در حال تایید...' : 'فعال‌سازی لایسنس'}</span>
                </button>
              </div>
            </form>

            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              کدهای آزمایشی مانند <span className="font-mono">HABINO-TRIAL-…</span> یا کدهای نمونه را وارد نکنید. لایسنس صادرشده فقط برای مستأجر مقصدی معتبر است که هنگام صدور انتخاب شده است.
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATA ENVIRONMENT (DEMO VS LIVE) */}
      {activeTab === 'environment' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6 animate-in fade-in">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <span>مدیریت محیط داده: سوئیچ بین داده‌های آزمایشی دمو و کار واقعی بازار</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              کاربران نسخه بازار می‌توانند جهت آموزش پرسنل یا بررسی تمامی قابلیت‌ها، داده‌های نمونه دمو را بارگذاری کنند؛ یا با یک کلیک محیط را برای شروع ورود فاکتورها و چک‌های واقعی کسب‌وکار پاک‌سازی نمایند.
            </p>
          </div>

          {envMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{envMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-blue-200 bg-blue-50/30 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>بارگذاری داده‌های نمونه دمو (تست و آموزش)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  فاکتورهای نمونه ۴ قالبه، چک‌های صیادی معلق و وصولی، اقساط‌بندی متصل، طرف‌های حساب و پروژه‌ها را به صورت نمونه وارد سیستم می‌کند تا کارکرد سیستم را ارزیابی کنید.
                </p>
              </div>
              <button
                onClick={handleLoadDemo}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>بارگذاری داده‌های دمو</span>
              </button>
            </div>

            <div className="border border-emerald-200 bg-emerald-50/30 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>شروع کار واقعی در نسخه بازار (محیط تمیز)</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  فاکتورها، چک‌ها و اسناد آزمایشی نمونه را پاک کرده و دفاتر مالی را با مانده صفر برای ثبت داده‌های تجاری و اسناد مالی واقعی شما آماده می‌سازد.
                </p>
              </div>
              <button
                onClick={handleCleanSlate}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>آماده‌سازی دیتابیس تمیز جهت کار واقعی</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MASTER ADMIN GENERATOR */}
      {activeTab === 'master' && canIssueLicenses && (
        <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-6 md:p-8 shadow-sm space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-sm">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">صدور لایسنس از سرویس امن</h3>
                <p className="text-xs text-slate-500 mt-0.5">پیش از صدور، مستأجر مقصد را انتخاب کنید؛ هر کلید فقط برای همان مستأجر معتبر است.</p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
              صدور رسمی لایسنس هابینو
            </span>
          </div>

          <form onSubmit={handleGenerateSerial} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">نوع پلن اشتراک</label>
              <select
                value={genTier}
                onChange={e => {
                  setGenTier(e.target.value as SubscriptionPlanType);
                  setGeneratedKey(null);
                }}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
              >
                <option value="starter">پایه</option>
                <option value="professional">حرفه‌ای</option>
                <option value="enterprise">سازمانی</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1.5">مدت اعتبار (روز)</label>
              <select
                value={genDuration}
                onChange={e => {
                  setGenDuration(Number(e.target.value));
                  setGeneratedKey(null);
                }}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono"
              >
                <option value={30}>۳۰ روز</option>
                <option value={90}>۹۰ روز (سه ماهه)</option>
                <option value={180}>۱۸۰ روز (شش ماهه)</option>
                <option value={365}>۳۶۵ روز (یک ساله)</option>
                <option value={9999}>مادام‌العمر</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1.5">فضای کاری مقصد</label>
              <select
                value={genTenantId}
                onChange={event => {
                  setGenTenantId(event.target.value);
                  setGeneratedKey(null);
                  setGeneratedAddonKey(null);
                }}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
              >
                {targetTenants.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.id})</option>
                ))}
              </select>
            </div>

            <div className="flex items-end md:col-span-3">
              <button
                type="submit"
                disabled={isActivating || !licenseTargetTenant}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isActivating ? 'در حال صدور از سرویس امن...' : 'صدور کلید لایسنس'}</span>
              </button>
            </div>
          </form>

          {generatedKey && (
            <div className="p-4 rounded-2xl bg-white border border-indigo-200 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-700">
                    کلید صادرشده برای {generatedKey.tenantName}، پلن {PLAN_LIMITS[generatedKey.plan].planNameFa}:
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                    اعتبار: {generatedKey.isLifetime ? 'مادام‌العمر' : generatedKey.expiresAt ? new Date(generatedKey.expiresAt).toLocaleDateString('fa-IR') : 'نامشخص'}
                  </span>
                </div>
                <p className="font-mono text-base font-bold text-slate-800 tracking-wider">
                  {generatedKey.serialKey}
                </p>
              </div>

              <button
                onClick={() => handleCopyKey(generatedKey.serialKey)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copied ? 'کپی شد' : 'کپی جهت ارسال به مشتری'}</span>
              </button>
            </div>
          )}

          {/* Server-issued add-on license */}
          <div className="pt-6 border-t border-indigo-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">صدور کلید امن افزونه</h4>
                  <p className="text-[11px] text-slate-500">صدور فقط برای افزونه منتشرشده؛ کلید فقط برای مستأجر مقصد معتبر است.</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                Server issued
              </span>
            </div>

            <form onSubmit={handleGenerateAddonKey} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">انتخاب افزونه مورد نظر</label>
                <select
                  value={genAddonId}
                  onChange={e => setGenAddonId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                >
                  {HABINO_ADDONS.filter(addon => addon.status === 'available').map(addon => (
                    <option key={addon.id} value={addon.id}>
                      {addon.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">فضای کاری مقصد</label>
                <select
                  value={genTenantId}
                  onChange={event => {
                    setGenTenantId(event.target.value);
                    setGeneratedKey(null);
                    setGeneratedAddonKey(null);
                  }}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl"
                >
                  {targetTenants.map(tenant => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.id})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isActivating || !licenseTargetTenant}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Key className="w-4 h-4" />
                  <span>{isActivating ? 'در حال صدور...' : 'صدور کلید افزونه'}</span>
                </button>
              </div>
            </form>

            {generatedAddonKey && (
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-purple-800">کلید تولید شده:</span>
                    <span className="text-[10px] px-2 py-0.5 bg-white text-purple-700 rounded border border-purple-200 font-mono">
                      {generatedAddonKey.tenantName}
                    </span>
                  </div>
                  <p className="font-mono text-base font-bold text-slate-900 tracking-wider">
                    {generatedAddonKey.serialKey}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyAddonKey(generatedAddonKey.serialKey)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-purple-100 text-purple-800 rounded-xl text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
                  >
                    {copiedAddon ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-purple-600" />}
                    <span>{copiedAddon ? 'کپی شد' : 'کپی کلید'}</span>
                  </button>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        initialTab={modalInitialTab}
      />
    </div>
  );
};
