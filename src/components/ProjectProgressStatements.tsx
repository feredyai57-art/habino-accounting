import React, { useMemo, useState } from 'react';
import { FileText, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import {
  Project,
  ProjectProgressStatement,
  ProjectProgressStatementDeduction,
  ProjectProgressStatementLine
} from '../types';
import { formatCurrency } from '../lib/currencyUtils';
import { getCurrentJalaliDate } from '../lib/dateUtils';
import { HabinoAccountingKernel } from '../lib/accountingKernel';
import { getProjectMonthKey } from '../lib/projectFinancials';
import {
  calculateProjectProgressStatementTotals,
  getProjectProgressStatementCumulativeTotals
} from '../lib/projectProgressStatements';

type Props = {
  project: Project;
  currency: 'IRT' | 'IRR' | 'USD';
  selectedMonth?: string;
  onUpdate: (id: string, updated: Partial<Project>) => Promise<void>;
};

const createEmptyLine = (): ProjectProgressStatementLine => ({
  id: HabinoAccountingKernel.generateUUID(),
  description: '',
  unit: '',
  previousQuantity: 0,
  currentQuantity: 0,
  unitRate: 0
});

const STATUS_LABELS: Record<ProjectProgressStatement['status'], string> = {
  draft: 'پیش‌نویس',
  submitted: 'ارسال‌شده (ثبت داخلی)',
  approved: 'تأییدشده (ثبت داخلی)',
  rejected: 'نیازمند اصلاح'
};

const STATUS_STYLES: Record<ProjectProgressStatement['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-amber-100 text-amber-900'
};

const approvedPreviousQuantity = (
  project: Project,
  description: string,
  unit: string,
  editingStatementId?: string
): number => {
  const key = `${description.trim().toLocaleLowerCase()}|${unit.trim().toLocaleLowerCase()}`;
  if (!description.trim() || !unit.trim()) return 0;
  return (project.progressStatements || [])
    .filter(statement => statement.status === 'approved' && statement.id !== editingStatementId)
    .flatMap(statement => statement.lines)
    .filter(line => `${line.description.trim().toLocaleLowerCase()}|${line.unit.trim().toLocaleLowerCase()}` === key)
    .reduce((total, line) => total + (Number(line.currentQuantity) || 0), 0);
};

export const ProjectProgressStatements: React.FC<Props> = ({ project, currency, selectedMonth, onUpdate }) => {
  const statements = project.progressStatements || [];
  const visibleStatements = selectedMonth
    ? statements.filter(statement => getProjectMonthKey(statement.date) === selectedMonth)
    : statements;
  const [editor, setEditor] = useState<ProjectProgressStatement | null>(null);
  const [viewing, setViewing] = useState<ProjectProgressStatement | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const approvedCumulativeTotal = useMemo(
    () => getProjectProgressStatementCumulativeTotals(statements),
    [statements]
  );

  const beginNewStatement = () => {
    const now = new Date().toISOString();
    const sequence = statements.reduce((max, statement) => {
      const suffix = Number(statement.number.match(/-(\d+)$/)?.[1]) || 0;
      return Math.max(max, suffix);
    }, 0) + 1;
    const number = `PV-${project.id.slice(0, 6).toUpperCase()}-${String(sequence).padStart(3, '0')}`;
    setError('');
    setEditor({
      id: HabinoAccountingKernel.generateUUID(),
      number,
      date: selectedMonth ? `${selectedMonth}/01` : getCurrentJalaliDate(),
      period: selectedMonth || '',
      status: 'draft',
      lines: [createEmptyLine()],
      vatRate: 0,
      deductions: [],
      createdAt: now,
      updatedAt: now
    });
  };

  const saveStatement = async (statement: ProjectProgressStatement) => {
    setIsSaving(true);
    setError('');
    try {
      const saved = { ...statement, updatedAt: new Date().toISOString() };
      const next = [...statements.filter(candidate => candidate.id !== saved.id), saved]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      await onUpdate(project.id, { progressStatements: next });
      setEditor(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const validateForSubmission = (statement: ProjectProgressStatement): string | null => {
    if (!statement.period.trim()) return 'دوره صورت‌وضعیت را وارد کنید.';
    if (!statement.date.trim()) return 'تاریخ صورت‌وضعیت الزامی است.';
    if (statement.lines.length === 0 || statement.lines.some(line =>
      !line.description.trim() ||
      !line.unit.trim() ||
      !Number.isFinite(line.currentQuantity) ||
      line.currentQuantity <= 0 ||
      !Number.isFinite(line.unitRate) ||
      line.unitRate <= 0 ||
      !Number.isFinite(line.previousQuantity) ||
      line.previousQuantity < 0
    )) {
      return 'شرح، واحد، مقدار این دوره، مقدار قبلی معتبر و نرخ مثبت برای همه ردیف‌ها الزامی است.';
    }
    if (!Number.isFinite(statement.vatRate) || statement.vatRate < 0 || statement.vatRate > 100) {
      return 'درصد مالیات باید بین صفر تا صد باشد.';
    }
    if (statement.deductions.some(deduction =>
      !deduction.title.trim() || !Number.isFinite(deduction.amount) || deduction.amount < 0
    )) {
      return 'عنوان و مبلغ معتبر برای همه کسورات وارد کنید.';
    }
    const totals = calculateProjectProgressStatementTotals(statement.lines, statement.vatRate, statement.deductions);
    if (totals.payableAmount < 0) return 'مجموع کسورات از مبلغ قابل پرداخت بیشتر است.';
    return null;
  };

  const submitForEmployer = () => {
    if (!editor) return;
    const validationError = validateForSubmission(editor);
    if (validationError) {
      setError(validationError);
      return;
    }
    void saveStatement({
      ...editor,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      rejectionReason: undefined
    });
  };

  const changeStatus = async (
    statement: ProjectProgressStatement,
    status: 'approved' | 'rejected'
  ) => {
    const rejectionReason = status === 'rejected'
      ? window.prompt('علت رد یا موارد نیازمند اصلاح را بنویسید:')
      : undefined;
    if (status === 'rejected' && !rejectionReason?.trim()) return;

    const updated: ProjectProgressStatement = status === 'approved'
      ? { ...statement, status, approvedAt: new Date().toISOString(), rejectionReason: undefined }
      : { ...statement, status, rejectedAt: new Date().toISOString(), rejectionReason: rejectionReason!.trim() };
    await saveStatement(updated);
  };

  const removeStatement = async (statement: ProjectProgressStatement) => {
    if (!window.confirm(`صورت‌وضعیت ${statement.number} حذف شود؟`)) return;
    setError('');
    setIsSaving(true);
    try {
      await onUpdate(project.id, {
        progressStatements: statements.filter(candidate => candidate.id !== statement.id)
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  const totalsFor = (statement: ProjectProgressStatement) =>
    calculateProjectProgressStatementTotals(statement.lines, statement.vatRate, statement.deductions);

  const printStatement = () => window.print();

  return (
    <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #project-progress-print, #project-progress-print * { visibility: visible !important; }
          #project-progress-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; padding: 24px !important; background: white !important; color: black !important; }
          #project-progress-print .no-print { display: none !important; }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-blue-950">صورت‌وضعیت‌های پروژه</h4>
          <p className="mt-1 text-[10px] text-blue-800">
            ارسال و تأیید به‌صورت داخلی ثبت می‌شود و امضای دیجیتال یا تأیید بیرونی نیست؛ همچنین سند حسابداری ایجاد نمی‌کند.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">
            کارکرد تأییدشده کل پروژه: {formatCurrency(approvedCumulativeTotal, currency)}
          </span>
          <button type="button" onClick={beginNewStatement} className="flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-blue-800">
            <Plus className="h-3.5 w-3.5" />
            صورت‌وضعیت جدید
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[10px] text-rose-700">{error}</p>}

      {visibleStatements.length === 0 ? (
        <p className="rounded-lg bg-white/80 p-3 text-center text-[10px] text-slate-500">
          {selectedMonth ? `برای دوره ${selectedMonth} صورت‌وضعیتی ثبت نشده است.` : 'برای این پروژه هنوز صورت‌وضعیتی ثبت نشده است.'}
        </p>
      ) : (
        <div className="space-y-2">
          {[...visibleStatements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(statement => {
            const totals = totalsFor(statement);
            return (
              <div key={statement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-800">{statement.number} · {statement.period || 'بدون دوره'}</p>
                    <p className="text-[10px] text-slate-500">{statement.date} · مبلغ قابل پرداخت: {formatCurrency(totals.payableAmount, currency)}</p>
                    {statement.status === 'rejected' && statement.rejectionReason && (
                      <p className="mt-1 text-[10px] text-amber-800">علت اصلاح: {statement.rejectionReason}</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${STATUS_STYLES[statement.status]}`}>
                    {STATUS_LABELS[statement.status]}
                  </span>
                </div>
                <div className="no-print flex items-center gap-1">
                  <button type="button" onClick={() => setViewing(statement)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50">مشاهده / چاپ</button>
                  {(statement.status === 'draft' || statement.status === 'rejected') && (
                    <button type="button" onClick={() => { setError(''); setEditor(statement); }} className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100">ویرایش</button>
                  )}
                  {statement.status === 'submitted' && (
                    <>
                      <button type="button" onClick={() => void changeStatus(statement, 'approved')} className="rounded-md px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">ثبت تأیید کارفرما</button>
                      <button type="button" onClick={() => void changeStatus(statement, 'rejected')} className="rounded-md px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-50">رد / اصلاح</button>
                    </>
                  )}
                  {statement.status !== 'approved' && (
                    <button type="button" disabled={isSaving} onClick={() => void removeStatement(statement)} aria-label={`حذف صورت‌وضعیت ${statement.number}`} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <StatementEditor
          project={project}
          statement={editor}
          currency={currency}
          isSaving={isSaving}
          error={error}
          onChange={setEditor}
          onClose={() => { setEditor(null); setError(''); }}
          onSave={() => void saveStatement(editor)}
          onSubmit={submitForEmployer}
        />
      )}

      {viewing && (
        <StatementPreview
          project={project}
          statement={viewing}
          currency={currency}
          onClose={() => setViewing(null)}
          onPrint={printStatement}
        />
      )}
    </section>
  );
};

const StatementEditor: React.FC<{
  project: Project;
  statement: ProjectProgressStatement;
  currency: Props['currency'];
  isSaving: boolean;
  error: string;
  onChange: (statement: ProjectProgressStatement) => void;
  onClose: () => void;
  onSave: () => void;
  onSubmit: () => void;
}> = ({ project, statement, currency, isSaving, error, onChange, onClose, onSave, onSubmit }) => {
  const totals = calculateProjectProgressStatementTotals(statement.lines, statement.vatRate, statement.deductions);
  const updateLine = (lineId: string, patch: Partial<ProjectProgressStatementLine>) => {
    onChange({
      ...statement,
      lines: statement.lines.map(line => {
        if (line.id !== lineId) return line;
        const updated = { ...line, ...patch };
        if ('description' in patch || 'unit' in patch) {
          updated.previousQuantity = approvedPreviousQuantity(
            project,
            updated.description,
            updated.unit,
            statement.id
          );
        }
        return updated;
      })
    });
  };
  const updateDeduction = (deductionId: string, patch: Partial<ProjectProgressStatementDeduction>) => {
    onChange({
      ...statement,
      deductions: statement.deductions.map(item => item.id === deductionId ? { ...item, ...patch } : item)
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3">
      <div className="my-auto max-h-[95vh] w-full max-w-5xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">تنظیم صورت‌وضعیت {statement.number}</h3>
            <p className="mt-1 text-[10px] text-slate-500">پروژه: {project.title} · مقادیر تأییدشده قبلی با شرح و واحد یکسان خودکار جمع می‌شوند.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-semibold text-slate-600">
            دوره صورت‌وضعیت *
            <input value={statement.period} onChange={event => onChange({ ...statement, period: event.target.value })} placeholder="مثال: ۱۴۰۵/۰۱ یا مرحله اول" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            تاریخ *
            <input value={statement.date} onChange={event => onChange({ ...statement, date: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800">شرح کار و محاسبه کارکرد</h4>
            <button type="button" onClick={() => onChange({ ...statement, lines: [...statement.lines, createEmptyLine()] })} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100"><Plus className="h-3 w-3" /> افزودن ردیف</button>
          </div>
          <div className="space-y-2">
            {statement.lines.map((line, index) => (
              <div key={line.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-7">
                <input value={line.description} onChange={event => updateLine(line.id, { description: event.target.value })} placeholder={`شرح ردیف ${index + 1}`} className="rounded-lg border border-slate-200 bg-white p-2 text-[10px] lg:col-span-2" />
                <input value={line.unit} onChange={event => updateLine(line.id, { unit: event.target.value })} placeholder="واحد (متر، عدد...)" className="rounded-lg border border-slate-200 bg-white p-2 text-[10px]" />
                <label className="text-[9px] text-slate-500">مقدار قبلی
                  <input type="number" min="0" step="any" value={line.previousQuantity} onChange={event => updateLine(line.id, { previousQuantity: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px]" />
                </label>
                <label className="text-[9px] text-slate-500">مقدار این دوره *
                  <input type="number" min="0" step="any" value={line.currentQuantity || ''} onChange={event => updateLine(line.id, { currentQuantity: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px]" />
                </label>
                <label className="text-[9px] text-slate-500">نرخ واحد *
                  <input type="number" min="0" step="any" value={line.unitRate || ''} onChange={event => updateLine(line.id, { unitRate: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-[10px]" />
                </label>
                <div className="flex items-end justify-between gap-1 text-[10px]">
                  <span className="pb-2 font-bold text-slate-700">{formatCurrency(line.currentQuantity * line.unitRate, currency)}</span>
                  {statement.lines.length > 1 && <button type="button" onClick={() => onChange({ ...statement, lines: statement.lines.filter(item => item.id !== line.id) })} aria-label="حذف ردیف" className="mb-1 rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-right text-[10px] text-slate-600">مبلغ کارکرد تجمعی بر اساس این صورت‌وضعیت: {formatCurrency(totals.cumulativeAmount, currency)}</p>
        </div>

        <div className="grid gap-4 border-t pt-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">کسورات قراردادی (دستی)</h4>
              <button type="button" onClick={() => onChange({ ...statement, deductions: [...statement.deductions, { id: HabinoAccountingKernel.generateUUID(), title: '', amount: 0 }] })} className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"><Plus className="h-3 w-3" /> افزودن کسور</button>
            </div>
            {statement.deductions.length === 0 && <p className="text-[10px] text-slate-500">در صورت نیاز، کسور را طبق قرارداد وارد کنید؛ نرخ قانونی به‌صورت خودکار اعمال نمی‌شود.</p>}
            {statement.deductions.map(deduction => (
              <div key={deduction.id} className="flex gap-2">
                <input value={deduction.title} onChange={event => updateDeduction(deduction.id, { title: event.target.value })} placeholder="مثال: حسن انجام کار" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px]" />
                <input type="number" min="0" value={deduction.amount || ''} onChange={event => updateDeduction(deduction.id, { amount: Number(event.target.value) })} placeholder="مبلغ کسور" className="w-32 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px]" />
                <button type="button" onClick={() => onChange({ ...statement, deductions: statement.deductions.filter(item => item.id !== deduction.id) })} aria-label="حذف کسور" className="rounded-lg p-2 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-slate-600">نرخ مالیات ارزش افزوده (درصد، اختیاری)
              <input type="number" min="0" max="100" step="any" value={statement.vatRate} onChange={event => onChange({ ...statement, vatRate: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" />
            </label>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-[10px]">
              <div className="flex justify-between"><span>کارکرد این دوره</span><strong>{formatCurrency(totals.currentAmount, currency)}</strong></div>
              <div className="flex justify-between"><span>مالیات ارزش افزوده</span><strong>{formatCurrency(totals.vatAmount, currency)}</strong></div>
              <div className="flex justify-between"><span>کسورات دستی</span><strong>{formatCurrency(totals.deductionsAmount, currency)}</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-xs font-bold"><span>خالص قابل پرداخت</span><strong>{formatCurrency(totals.payableAmount, currency)}</strong></div>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] text-rose-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[10px] text-slate-600 hover:bg-slate-100">بستن</button>
          <button type="button" disabled={isSaving} onClick={onSave} className="rounded-lg border border-slate-300 px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isSaving ? 'در حال ذخیره...' : 'ذخیره پیش‌نویس'}</button>
          <button type="button" disabled={isSaving} onClick={onSubmit} className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-800 disabled:opacity-50"><Send className="h-3 w-3" /> ثبت ارسال برای کارفرما</button>
        </div>
      </div>
    </div>
  );
};

const StatementPreview: React.FC<{
  project: Project;
  statement: ProjectProgressStatement;
  currency: Props['currency'];
  onClose: () => void;
  onPrint: () => void;
}> = ({ project, statement, currency, onClose, onPrint }) => {
  const totals = calculateProjectProgressStatementTotals(statement.lines, statement.vatRate, statement.deductions);
  const clientName = project.clientName || 'کارفرما';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3">
      <div className="my-auto max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="no-print flex items-center justify-between border-b p-3">
          <p className="text-xs font-bold text-slate-800">پیش‌نمایش صورت‌وضعیت</p>
          <div className="flex gap-2">
            <button type="button" onClick={onPrint} className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white"><Printer className="h-3.5 w-3.5" /> چاپ / ذخیره PDF</button>
            <button type="button" onClick={onClose} aria-label="بستن پیش‌نمایش" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div id="project-progress-print" dir="rtl" className="space-y-5 p-6 text-slate-900">
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
            <div>
              <h1 className="text-xl font-black">صورت‌وضعیت کارکرد پروژه</h1>
              <p className="mt-2 text-sm">پروژه: {project.title}</p>
              <p className="mt-1 text-sm">کارفرما: {clientName}</p>
            </div>
            <div className="text-left text-sm">
              <p>شماره: {statement.number}</p>
              <p className="mt-2">دوره: {statement.period}</p>
              <p className="mt-2">تاریخ: {statement.date}</p>
              <p className="mt-2">وضعیت: {STATUS_LABELS[statement.status]}</p>
            </div>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                {['ردیف', 'شرح عملیات', 'واحد', 'مقدار قبلی', 'مقدار این دوره', 'مقدار تجمعی', 'نرخ واحد', 'مبلغ این دوره'].map(title => (
                  <th key={title} className="border border-slate-400 p-2 text-right">{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="border border-slate-300 p-2">{index + 1}</td>
                  <td className="border border-slate-300 p-2">{line.description}</td>
                  <td className="border border-slate-300 p-2">{line.unit}</td>
                  <td className="border border-slate-300 p-2">{line.previousQuantity}</td>
                  <td className="border border-slate-300 p-2">{line.currentQuantity}</td>
                  <td className="border border-slate-300 p-2">{line.previousQuantity + line.currentQuantity}</td>
                  <td className="border border-slate-300 p-2">{formatCurrency(line.unitRate, currency)}</td>
                  <td className="border border-slate-300 p-2">{formatCurrency(line.currentQuantity * line.unitRate, currency)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td colSpan={7} className="border border-slate-400 p-2">جمع کارکرد این دوره</td>
                <td className="border border-slate-400 p-2">{formatCurrency(totals.currentAmount, currency)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mr-auto max-w-sm space-y-2 text-sm">
            <div className="flex justify-between"><span>کارکرد تجمعی تا این صورت‌وضعیت</span><strong>{formatCurrency(totals.cumulativeAmount, currency)}</strong></div>
            <div className="flex justify-between"><span>مالیات ارزش افزوده ({statement.vatRate}٪)</span><strong>{formatCurrency(totals.vatAmount, currency)}</strong></div>
            {statement.deductions.map(deduction => (
              <div key={deduction.id} className="flex justify-between text-rose-700"><span>{deduction.title}</span><strong>({formatCurrency(deduction.amount, currency)})</strong></div>
            ))}
            <div className="flex justify-between border-t-2 border-slate-700 pt-2 text-base font-black"><span>خالص قابل پرداخت این دوره</span><strong>{formatCurrency(totals.payableAmount, currency)}</strong></div>
          </div>

          {statement.rejectionReason && <p className="rounded border border-amber-400 p-3 text-sm">موارد نیازمند اصلاح: {statement.rejectionReason}</p>}
          <div className="grid grid-cols-2 gap-10 pt-10 text-center text-xs">
            <div className="border-t border-slate-500 pt-2">تهیه‌کننده / پیمانکار</div>
            <div className="border-t border-slate-500 pt-2">تأیید کارفرما</div>
          </div>
          <p className="text-center text-[10px] text-slate-500">وضعیت ارسال و تأیید در این سامانه به‌صورت داخلی ثبت شده و جایگزین امضای دیجیتال یا تأیید بیرونی نیست. این گزارش به‌تنهایی فاکتور یا سند حسابداری محسوب نمی‌شود.</p>
        </div>
      </div>
    </div>
  );
};
