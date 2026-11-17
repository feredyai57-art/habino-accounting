import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FolderKanban, Plus, Trash2, FileText, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import { useAccounting } from '../lib/store';
import { Project, ProjectLaborDaysRecord } from '../types';
import { formatCurrency } from '../lib/currencyUtils';
import { getCurrentJalaliDate } from '../lib/dateUtils';
import { getProjectFinancialEntries, getProjectFinancialSummary, getProjectMonthKey } from '../lib/projectFinancials';
import { HabinoAccountingKernel } from '../lib/accountingKernel';
import { CalendarJalaliDateInput } from './CalendarJalaliDateInput';
import { ProjectProgressStatements } from './ProjectProgressStatements';

export const FinancialProjects: React.FC = () => {
  const { projects, clients, accountingEntries, settings, addProject, updateProject, deleteProject } = useAccounting();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [budget, setBudget] = useState(0);
  const [description, setDescription] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const availableMonths = useMemo(() => {
    const projectIds = new Set(projects.map(project => project.id));
    const dates = [
      ...accountingEntries
        .filter(entry => entry.projectTag && projectIds.has(entry.projectTag))
        .map(entry => entry.date),
      ...projects.flatMap(project => [
        ...(project.laborDays || []).map(record => record.date),
        ...(project.progressStatements || []).map(statement => statement.date)
      ])
    ];
    return [...new Set(dates.map(getProjectMonthKey).filter((month): month is string => Boolean(month)))]
      .sort((left, right) => right.localeCompare(left));
  }, [projects, accountingEntries]);

  const projectReports = useMemo(() => projects.map(project => ({
    project,
    totals: getProjectFinancialSummary(project.id, accountingEntries, selectedMonth || undefined),
    financialEntries: getProjectFinancialEntries(project.id, accountingEntries, selectedMonth || undefined)
  })), [projects, accountingEntries, selectedMonth]);

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const client = clients.find(candidate => candidate.id === clientId);
    if (!title.trim() || !client) {
      setError('عنوان پروژه و انتخاب طرف‌حساب معتبر الزامی است.');
      return;
    }

    setIsSaving(true);
    try {
      await addProject({
        title: title.trim(),
        clientId: client.id,
        clientName: client.name,
        budget: Math.max(0, Number(budget) || 0),
        startDate: getCurrentJalaliDate(),
        status: 'in_progress',
        totalIncome: 0,
        totalExpense: 0,
        description: description.trim()
      });
      setTitle('');
      setClientId('');
      setBudget(0);
      setDescription('');
      setShowCreateForm(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(`پروژه «${project.title}» حذف شود؟ اسناد مالی حفظ می‌شوند اما برچسب این پروژه از آن‌ها برداشته خواهد شد.`)) {
      return;
    }
    setError('');
    try {
      await deleteProject(project.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10" id="financial-projects">
      <header className="flex flex-col justify-between gap-4 rounded-3xl bg-gradient-to-l from-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FolderKanban className="h-5 w-5 text-cyan-300" />
            پروژه‌ها و گزارش مالی
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300">
            فاکتورها و هزینه‌های ثبت‌شده را با برچسب پروژه تجمیع کنید. روزکارکرد پیمانکاران و کارگران نیز دستی و صرفاً آماری ثبت می‌شود و به حسابداری اثر نمی‌گذارد.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white">
            <CalendarDays className="h-4 w-4" />
            <span>دوره گزارش</span>
            <select
              value={selectedMonth}
              onChange={event => setSelectedMonth(event.target.value)}
              className="max-w-36 rounded-lg border-0 bg-white px-2 py-1 text-xs text-slate-800"
              aria-label="انتخاب دوره گزارش پروژه"
            >
              <option value="">همه دوره‌ها</option>
              {availableMonths.map(month => <option key={month} value={month}>{month}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setError(''); setShowCreateForm(value => !value); }}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            تعریف پروژه
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      {showCreateForm && (
        <form onSubmit={handleCreateProject} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">نام پروژه *</label>
            <input required value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">طرف‌حساب / کارفرما *</label>
            <select required value={clientId} onChange={event => setClientId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm">
              <option value="">انتخاب طرف‌حساب...</option>
              {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">بودجه برآوردی (اختیاری)</label>
            <input type="number" min="0" value={budget || ''} onChange={event => setBudget(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">شرح (اختیاری)</label>
            <input value={description} onChange={event => setDescription(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-xl px-4 py-2 text-xs text-slate-600 hover:bg-slate-100">انصراف</button>
            <button type="submit" disabled={isSaving} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? 'در حال ثبت...' : 'ثبت پروژه'}
            </button>
          </div>
        </form>
      )}

      {projectReports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">هنوز پروژه‌ای تعریف نشده است</p>
          <p className="mt-1 text-xs text-slate-500">برای شروع، یک پروژه و طرف‌حساب آن را ثبت کنید.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projectReports.map(({ project, totals, financialEntries }) => {
            const profit = totals.income - totals.directCosts - totals.operatingExpenses;
            return (
              <article key={project.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><FolderKanban className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-900">{project.title}</h3>
                      <p className="mt-1 truncate text-xs text-slate-500">{project.clientName || clients.find(client => client.id === project.clientId)?.name}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => void handleDeleteProject(project)} title="حذف پروژه و برداشتن برچسب از اسناد" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="flex items-center gap-1 text-emerald-700"><TrendingUp className="h-3.5 w-3.5" /> درآمد شناسایی‌شده</div>
                    <strong className="mt-1 block text-emerald-900">{formatCurrency(totals.income, settings.currency)}</strong>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <div className="flex items-center gap-1 text-rose-700"><TrendingDown className="h-3.5 w-3.5" /> هزینه و بهای تمام‌شده</div>
                    <strong className="mt-1 block text-rose-900">{formatCurrency(totals.directCosts + totals.operatingExpenses, settings.currency)}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="flex items-center gap-1 text-slate-500"><Wallet className="h-3.5 w-3.5" /> سود/زیان بر مبنای اسناد ثبت‌شده</span>
                  <strong className={profit >= 0 ? 'text-blue-700' : 'text-rose-700'}>{formatCurrency(profit, settings.currency)}</strong>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> ردیف‌های دفتر کل مرتبط: {totals.ledgerLineCount}</span>
                  {project.budget > 0 && <span>بودجه: {formatCurrency(project.budget, settings.currency)}</span>}
                </div>
                <details className="rounded-xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-3 py-2 text-[10px] font-bold text-slate-700">
                    مشاهده گردش مالی {selectedMonth ? `دوره ${selectedMonth}` : 'همه دوره‌ها'} ({financialEntries.length} ردیف)
                  </summary>
                  {financialEntries.length === 0 ? (
                    <p className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-500">برای این دوره ردیف درآمد یا هزینه‌ای ثبت نشده است.</p>
                  ) : (
                    <div className="max-h-56 space-y-1 overflow-y-auto border-t border-slate-200 p-2">
                      {financialEntries.map(entry => (
                        <div key={entry.id} className="flex items-start justify-between gap-2 rounded-lg bg-white p-2 text-[10px]">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">{entry.description || entry.accountTitle}</p>
                            <p className="mt-0.5 truncate text-slate-500">{entry.date} · {entry.documentNumber} · {entry.accountTitle}</p>
                          </div>
                          <div className="shrink-0 text-left text-slate-600">
                            {Number(entry.debit) > 0 && <p>بدهکار: {formatCurrency(Number(entry.debit), settings.currency)}</p>}
                            {Number(entry.credit) > 0 && <p>بستانکار: {formatCurrency(Number(entry.credit), settings.currency)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
                {project.description && <p className="border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">{project.description}</p>}
                <ProjectLaborDaysEditor project={project} selectedMonth={selectedMonth || undefined} onUpdate={updateProject} />
                <ProjectProgressStatements
                  project={project}
                  currency={settings.currency}
                  selectedMonth={selectedMonth || undefined}
                  onUpdate={updateProject}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ProjectLaborDaysEditor: React.FC<{
  project: Project;
  selectedMonth?: string;
  onUpdate: (id: string, updated: Partial<Project>) => Promise<void>;
}> = ({ project, selectedMonth, onUpdate }) => {
  const [contractorName, setContractorName] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [date, setDate] = useState(() => selectedMonth ? `${selectedMonth}/01` : getCurrentJalaliDate());
  const [days, setDays] = useState(1);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const records = project.laborDays || [];
  const visibleRecords = selectedMonth
    ? records.filter(record => getProjectMonthKey(record.date) === selectedMonth)
    : records;
  const totalDays = visibleRecords.reduce((sum, record) => sum + record.days, 0);

  useEffect(() => {
    setDate(selectedMonth ? `${selectedMonth}/01` : getCurrentJalaliDate());
  }, [selectedMonth]);

  const addRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!contractorName.trim() || !workerName.trim() || !date || !Number.isFinite(days) || days <= 0) {
      setError('نام پیمانکار، نام کارگر، تاریخ و تعداد روز معتبر الزامی است.');
      return;
    }
    if (selectedMonth && getProjectMonthKey(date) !== selectedMonth) {
      setError('تاریخ روزکارکرد باید در دوره انتخاب‌شده باشد.');
      return;
    }

    const record: ProjectLaborDaysRecord = {
      id: HabinoAccountingKernel.generateUUID(),
      contractorName: contractorName.trim(),
      workerName: workerName.trim(),
      date,
      days,
      description: description.trim() || undefined
    };

    setIsSaving(true);
    try {
      await onUpdate(project.id, { laborDays: [...records, record] });
      setContractorName('');
      setWorkerName('');
      setDate(selectedMonth ? `${selectedMonth}/01` : getCurrentJalaliDate());
      setDays(1);
      setDescription('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const removeRecord = async (recordId: string) => {
    setError('');
    try {
      await onUpdate(project.id, { laborDays: records.filter(record => record.id !== recordId) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  return (
    <details className="rounded-xl border border-amber-200 bg-amber-50/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-xs">
        <span className="flex items-center gap-1.5 font-bold text-amber-900">
          <Users className="h-4 w-4" />
          کارکرد روزانه پیمانکاران و کارگران
        </span>
        <span className="whitespace-nowrap text-[10px] text-amber-800">{totalDays} روز ثبت‌شده</span>
      </summary>
      <div className="space-y-3 border-t border-amber-200 p-3">
        <p className="text-[10px] leading-5 text-amber-900">
          این آمار دستی و صرفاً عملیاتی است؛ هیچ سند حسابداری، هزینه حقوق یا تغییر مانده‌ای ایجاد نمی‌کند.
        </p>
        <form onSubmit={addRecord} className="grid gap-2 sm:grid-cols-2">
          <input
            required
            value={contractorName}
            onChange={event => setContractorName(event.target.value)}
            placeholder="نام پیمانکار"
            className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
          />
          <input
            required
            value={workerName}
            onChange={event => setWorkerName(event.target.value)}
            placeholder="نام کارگر"
            className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
          />
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <CalendarJalaliDateInput value={date} onChange={setDate} inputClassName="border-0 p-1 text-xs focus:ring-0" />
          </div>
          <input
            required
            type="number"
            min="0.5"
            step="0.5"
            value={days}
            onChange={event => setDays(Number(event.target.value))}
            aria-label="تعداد روز کارکرد"
            placeholder="تعداد روز"
            className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
          />
          <input
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="توضیح (اختیاری)"
            className="rounded-lg border border-slate-200 bg-white p-2 text-xs sm:col-span-2"
          />
          <button type="submit" disabled={isSaving} className="flex items-center justify-center gap-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50 sm:col-span-2">
            <Plus className="h-3.5 w-3.5" />
            {isSaving ? 'در حال ثبت...' : 'ثبت روزکارکرد (بدون سند حسابداری)'}
          </button>
        </form>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-[10px] text-rose-700">{error}</p>}
        {visibleRecords.length > 0 && (
          <div className="space-y-1">
            {visibleRecords.map(record => (
              <div key={record.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-[10px]">
                <span className="min-w-0 truncate text-slate-700">
                  {record.date} · {record.contractorName} / {record.workerName}
                  {record.description ? ` · ${record.description}` : ''}
                </span>
                <span className="flex shrink-0 items-center gap-2 font-bold text-slate-800">
                  {record.days} روز
                  <button type="button" onClick={() => void removeRecord(record.id)} aria-label={`حذف روزکارکرد ${record.workerName}`} className="text-slate-400 hover:text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
};
