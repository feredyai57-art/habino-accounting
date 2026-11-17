import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Plus, RefreshCw, Smartphone } from 'lucide-react';
import {
  addPosDeviceSurvey,
  listAllPosDeviceSurveys,
  listTenantPosDeviceSurveys,
  PosConnectionInfo,
  PosDeviceSurvey,
  PosDeviceSurveyInput,
  PosTerminalType
} from '../lib/posDeviceSurveyService';
import { Tenant } from '../types';
import { toPersianDigits } from '../lib/currencyUtils';

const emptyForm: PosDeviceSurveyInput = {
  paymentProvider: '',
  deviceBrand: '',
  deviceModel: '',
  terminalType: 'unknown',
  connectionInfo: 'unknown',
  deviceCount: 1,
  notes: ''
};

const terminalTypeLabel: Record<PosTerminalType, string> = {
  traditional: 'پوز معمولی / غیراندرویدی',
  android_smart: 'پوز هوشمند اندرویدی',
  other: 'نوع دیگر',
  unknown: 'نمی‌دانم'
};

const connectionInfoLabel: Record<PosConnectionInfo, string> = {
  api_sdk: 'ارائه‌دهنده API یا SDK دارد',
  local_driver: 'فقط درایور یا برنامهٔ واسط می‌شناسم',
  no_api: 'گفته شده اتصال نرم‌افزاری ندارد',
  unknown: 'اطلاعی ندارم / بررسی نشده'
};

const formatDate = (value: string) => new Date(value).toLocaleString('fa-IR');

export const TenantPosDeviceSurvey: React.FC<{ tenantId: string; tenantName: string }> = ({
  tenantId,
  tenantName
}) => {
  const [form, setForm] = useState<PosDeviceSurveyInput>(emptyForm);
  const [surveys, setSurveys] = useState<PosDeviceSurvey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSurveys(await listTenantPosDeviceSurveys(tenantId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'بارگذاری اطلاعات پوز ناموفق بود.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [tenantId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const saved = await addPosDeviceSurvey(tenantId, tenantName, form);
      setSurveys(current => [saved, ...current]);
      setForm(emptyForm);
      setSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'ثبت اطلاعات پوز ناموفق بود.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-2xl bg-blue-50 p-2.5 text-blue-700"><CreditCard className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">نیازسنجی اتصال پوز بانکی</h3>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              مشخصات دستگاه‌های «{tenantName}» را ثبت کنید تا امکان اتصال مدل‌ها و شرکت‌های پرداخت پرکاربرد بررسی شود.
              برای هر مدل متفاوت، یک ردیف جداگانه ثبت کنید.
            </p>
          </div>
        </div>

        {error && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
        {success && <p role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4" />اطلاعات با موفقیت ثبت شد.</p>}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>شرکت پرداخت (PSP) <b className="text-rose-500">*</b></span>
            <input required maxLength={120} value={form.paymentProvider}
              onChange={event => setForm(current => ({ ...current, paymentProvider: event.target.value }))}
              placeholder="مثلاً به‌پرداخت ملت، سپ، ایران‌کیش یا سایر"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>برند دستگاه</span>
            <input maxLength={120} value={form.deviceBrand}
              onChange={event => setForm(current => ({ ...current, deviceBrand: event.target.value }))}
              placeholder="مثلاً PAX، Verifone، Newland"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>مدل دقیق دستگاه <b className="text-rose-500">*</b></span>
            <input required maxLength={120} value={form.deviceModel}
              onChange={event => setForm(current => ({ ...current, deviceModel: event.target.value }))}
              placeholder="مثلاً S90 یا A920"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>نوع دستگاه</span>
            <select value={form.terminalType}
              onChange={event => setForm(current => ({ ...current, terminalType: event.target.value as PosTerminalType }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              {Object.entries(terminalTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>اطلاع از روش اتصال</span>
            <select value={form.connectionInfo}
              onChange={event => setForm(current => ({ ...current, connectionInfo: event.target.value as PosConnectionInfo }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              {Object.entries(connectionInfoLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-700">
            <span>تعداد این مدل</span>
            <input type="number" min={1} max={100} required value={form.deviceCount}
              onChange={event => setForm(current => ({ ...current, deviceCount: Number(event.target.value) }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-700 md:col-span-2">
            <span>توضیحات تکمیلی (اختیاری)</span>
            <textarea maxLength={1200} rows={3} value={form.notes}
              onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}
              placeholder="اگر از شرکت پرداخت پاسخ یا مستندات اتصال دریافت کرده‌اید، توضیح دهید."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5" />
          </label>
          <p className="text-[11px] leading-5 text-amber-800 md:col-span-2">
            اطلاعات کارت، رمز، رسید پرداخت یا اطلاعات محرمانهٔ بانکی را در این فرم وارد نکنید.
          </p>
          <div className="md:col-span-2">
            <button type="submit" disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              ثبت دستگاه
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">دستگاه‌های ثبت‌شده</h3>
          <button type="button" onClick={() => void refresh()} disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />به‌روزرسانی
          </button>
        </div>
        {isLoading ? <p className="py-8 text-center text-xs text-slate-400">در حال بارگذاری...</p>
          : surveys.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">هنوز دستگاهی ثبت نشده است.</p>
            : <div className="space-y-3">
              {surveys.map(survey => (
                <article key={survey.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-blue-600" />
                      <h4 className="text-xs font-bold text-slate-900">{survey.paymentProvider} · {survey.deviceBrand || 'برند نامشخص'} {survey.deviceModel}</h4>
                    </div>
                    <span className="text-[10px] text-slate-400">{formatDate(survey.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-600">
                    {terminalTypeLabel[survey.terminalType]} · {connectionInfoLabel[survey.connectionInfo]} · تعداد: {toPersianDigits(survey.deviceCount)}
                  </p>
                  {survey.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{survey.notes}</p>}
                </article>
              ))}
            </div>}
      </section>
    </div>
  );
};

export const AdminPosDeviceSurvey: React.FC<{ tenants: Tenant[] }> = ({ tenants }) => {
  const [surveys, setSurveys] = useState<PosDeviceSurvey[]>([]);
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSurveys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSurveys(await listAllPosDeviceSurveys());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'بارگذاری پاسخ‌ها ناموفق بود.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSurveys();
  }, [loadSurveys]);

  const groupedSurveys = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const groups = new Map<string, { tenantId: string; tenantName: string; surveys: PosDeviceSurvey[] }>();
    surveys.forEach(survey => {
      const tenant = tenants.find(item => item.id === survey.tenantId);
      const tenantName = survey.tenantName || tenant?.name || '';
      const matchesTenant = tenantFilter === 'all' || tenantFilter === survey.tenantId;
      const matchesSearch = !query || [
        tenantName,
        survey.tenantId,
        survey.paymentProvider,
        survey.deviceBrand,
        survey.deviceModel,
        survey.notes
      ].some(value => (value || '').toLocaleLowerCase().includes(query));
      if (!matchesTenant || !matchesSearch) return;

      const group = groups.get(survey.tenantId) || {
        tenantId: survey.tenantId,
        tenantName: tenantName || 'فضای کاری ثبت‌شده',
        surveys: []
      };
      group.surveys.push(survey);
      groups.set(survey.tenantId, group);
    });
    return [...groups.values()].sort((a, b) => a.tenantName.localeCompare(b.tenantName, 'fa'));
  }, [surveys, tenants, search, tenantFilter]);

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">نیازسنجی دستگاه‌های پوز مستأجران</h3>
          <p className="mt-1 text-xs text-slate-500">پاسخ‌ها برای شناسایی شرکت‌های پرداخت و مدل‌های پرتکرار گردآوری شده‌اند.</p>
        </div>
        <button type="button" onClick={() => void loadSurveys()} disabled={isLoading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />به‌روزرسانی
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={search} onChange={event => setSearch(event.target.value)}
          placeholder="جستجو در مستأجر، شرکت پرداخت یا مدل..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs" />
        <select value={tenantFilter} onChange={event => setTenantFilter(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
          <option value="all">همهٔ مستأجران</option>
          {surveys.map(survey => survey.tenantId)
            .filter((tenantId, index, rows) => rows.indexOf(tenantId) === index)
            .map(tenantId => {
              const tenant = tenants.find(item => item.id === tenantId);
              const survey = surveys.find(item => item.tenantId === tenantId);
              return <option key={tenantId} value={tenantId}>{survey?.tenantName || tenant?.name || tenantId}</option>;
            })}
        </select>
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="h-4 w-4" />{error}</p>}
      {isLoading ? <p className="py-10 text-center text-xs text-slate-400">در حال دریافت پاسخ‌ها...</p>
        : groupedSurveys.length === 0 ? <p className="py-10 text-center text-xs text-slate-400">{error ? 'پاسخ‌ها بارگذاری نشدند.' : 'پاسخی با این فیلترها پیدا نشد.'}</p>
          : <div className="space-y-3">
            <p className="text-[11px] text-slate-500">
              {toPersianDigits(groupedSurveys.length)} مستأجر · {toPersianDigits(groupedSurveys.reduce((count, group) => count + group.surveys.length, 0))} ردیف اطلاعات دستگاه
            </p>
            {groupedSurveys.map((group, groupIndex) => {
              const deviceCount = group.surveys.reduce((count, survey) => count + survey.deviceCount, 0);
              return (
                <details key={group.tenantId} className="rounded-2xl border border-slate-200 bg-slate-50" open={groupIndex === 0}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{group.tenantName}</h4>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400" dir="ltr">{group.tenantId}</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-800">
                      {toPersianDigits(group.surveys.length)} ردیف · {toPersianDigits(deviceCount)} دستگاه
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 p-3">
                    {group.surveys.map(survey => (
                      <article key={survey.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-blue-900">
                            {survey.paymentProvider} · {survey.deviceBrand || 'برند نامشخص'} {survey.deviceModel}
                          </p>
                          <span className="text-[10px] text-slate-400">{formatDate(survey.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-slate-600">
                          {terminalTypeLabel[survey.terminalType]} · {connectionInfoLabel[survey.connectionInfo]} · تعداد: {toPersianDigits(survey.deviceCount)}
                        </p>
                        {survey.notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-xs leading-5 text-slate-700">{survey.notes}</p>}
                      </article>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>}
    </section>
  );
};
