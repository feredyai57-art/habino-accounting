import React, { useState, useMemo } from 'react';
import { Client, Invoice, Transaction, AccountingEntry, Check, CompanySettings } from '../types';
import { formatCurrency, toPersianDigits } from '../lib/currencyUtils';
import { exportClientStatementToCsv, buildClientBalanceReminderMessage } from '../lib/exportUtils';
import { getClientEntryDocumentLabel, getClientLedgerSummary } from '../lib/clientLedger';
import { formatDocumentTime } from '../lib/documentTime';
import {
  X,
  Printer,
  Scale,
  Calendar,
  Building,
  UserCheck,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  ShieldAlert,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  Download,
  Share2,
  MessageSquare,
  Copy,
  Check as CheckIcon,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface StatementRow {
  id: string;
  date: string;
  created_at?: string;
  type: 'invoice' | 'payment' | 'check' | 'opening' | 'entry';
  typeFa: string;
  referenceNumber: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  diagnosis: 'بدهکار' | 'بستانکار' | 'تسویه';
}

interface ClientStatementModalProps {
  client: Client;
  onClose: () => void;
  invoices: Invoice[];
  transactions: Transaction[];
  accountingEntries: AccountingEntry[];
  checks: Check[];
  settings: CompanySettings;
}

export const ClientStatementModal: React.FC<ClientStatementModalProps> = ({
  client,
  onClose,
  invoices,
  accountingEntries,
  settings
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'invoices' | 'payments' | 'checks' | 'opening'>('all');
  const [isMaximized, setIsMaximized] = useState(false);

  // Build the complete chronological statement rows
  const { statementRows, totalDebit, totalCredit, finalBalance } = useMemo(() => {
    const clientLedger = getClientLedgerSummary(accountingEntries, client.id, client.name);
    const rawRows: Array<Omit<StatementRow, 'runningBalance' | 'diagnosis'>> = clientLedger.entries.map(entry => {
      const type: StatementRow['type'] = entry.documentNumber?.startsWith('DOC-OPN')
        ? 'opening'
        : entry.documentNumber?.startsWith('DOC-INV')
        ? 'invoice'
        : entry.documentNumber?.startsWith('DOC-TX')
        ? 'payment'
        : entry.documentNumber?.startsWith('DOC-CHK')
        ? 'check'
        : 'entry';

      return {
        id: entry.id,
        date: entry.date || '۱۴۰۳/۰۱/۰۱',
        created_at: entry.created_at,
        type,
        typeFa: getClientEntryDocumentLabel(entry, invoices),
        referenceNumber: entry.documentNumber || '—',
        description: entry.description || 'گردش حساب طرف‌حساب',
        debit: Number(entry.debit) || 0,
        credit: Number(entry.credit) || 0
      };
    });

    if (rawRows.length === 0 && Number(client.balance)) {
      const balance = Number(client.balance);
      rawRows.push({
        id: `opening-fallback-${client.id}`,
        date: '۱۴۰۳/۰۱/۰۱',
        type: 'opening',
        typeFa: 'مانده اولیه',
        referenceNumber: 'OPN-001',
        description: 'مانده حساب انتقالی اول دوره (بدون آرتیکل دفترکل)',
        debit: balance > 0 ? balance : 0,
        credit: balance < 0 ? Math.abs(balance) : 0
      });
    }

    // Opening balance is the starting point even if its posting date was saved as the client creation date.
    rawRows.sort((a, b) => {
      if (a.type === 'opening' && b.type !== 'opening') return -1;
      if (b.type === 'opening' && a.type !== 'opening') return 1;
      return a.date.localeCompare(b.date);
    });

    // Calculate Running Balance
    let accumulator = 0;
    let sumDebit = 0;
    let sumCredit = 0;

    const rowsWithBalance: StatementRow[] = rawRows.map(row => {
      accumulator += (row.debit - row.credit);
      sumDebit += row.debit;
      sumCredit += row.credit;

      const diagnosis: 'بدهکار' | 'بستانکار' | 'تسویه' =
        accumulator > 0 ? 'بدهکار' : accumulator < 0 ? 'بستانکار' : 'تسویه';

      return {
        ...row,
        runningBalance: Math.abs(accumulator),
        diagnosis
      };
    });

    return {
      statementRows: rowsWithBalance,
      totalDebit: sumDebit,
      totalCredit: sumCredit,
      finalBalance: rawRows.length > 0 ? accumulator : clientLedger.balance
    };
  }, [client, invoices, accountingEntries]);

  // Filtered rows for current active tab
  const displayedRows = useMemo(() => {
    if (activeFilter === 'all') return statementRows;
    const typeByFilter = {
      invoices: 'invoice',
      payments: 'payment',
      checks: 'check',
      opening: 'opening'
    } as const;
    return statementRows.filter(r => r.type === typeByFilter[activeFilter]);
  }, [statementRows, activeFilter]);

  // Credit limit calculation
  const creditLimit = Number(client.creditLimit) || 0;
  const isCreditExceeded = creditLimit > 0 && finalBalance > creditLimit;
  const remainingCredit = creditLimit > 0 ? Math.max(0, creditLimit - finalBalance) : null;

  // Messaging & Export State
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  const reminderMessage = useMemo(() => {
    return buildClientBalanceReminderMessage(client, finalBalance, settings.name || 'مجموعه اقتصادی', settings.currency);
  }, [client, finalBalance, settings]);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(reminderMessage);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSendWhatsApp = () => {
    const rawPhone = (client.phone || '').replace(/[^0-9+]/g, '');
    let formattedPhone = rawPhone;
    if (formattedPhone.startsWith('09')) {
      formattedPhone = '98' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+98')) {
      formattedPhone = formattedPhone.substring(1);
    }
    const encoded = encodeURIComponent(reminderMessage);
    const url = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleExportCsv = () => {
    exportClientStatementToCsv(client, statementRows, settings.name || 'مجموعه اقتصادی');
  };

  const handlePrint = () => {
    const statement = document.getElementById('client-statement-printable');
    if (!statement) {
      console.error('[ClientStatementModal] Printable statement content was not found.');
      return;
    }

    const printPortal = document.createElement('div');
    printPortal.id = 'habino-client-statement-print-portal';
    printPortal.appendChild(statement.cloneNode(true));
    document.body.appendChild(printPortal);
    document.body.classList.add('habino-client-statement-print');

    let cleanupTimer: number | undefined;
    const cleanup = () => {
      if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
      printPortal.remove();
      document.body.classList.remove('habino-client-statement-print');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    cleanupTimer = window.setTimeout(cleanup, 60_000);
    window.print();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs print:bg-white ${
        isMaximized ? 'overflow-hidden p-0' : 'overflow-y-auto p-3 sm:p-6'
      }`}
      dir="rtl"
      id="client-statement-modal"
    >
      <div id="client-statement-printable" className={`bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col print:shadow-none print:border-0 ${
        isMaximized
          ? 'rounded-none w-full h-full max-w-none max-h-none my-0'
          : 'rounded-3xl w-full max-w-5xl max-h-[92vh] my-auto'
      }`}>
        
        {/* Header - Screen & Print */}
        <div className="client-statement-print-header p-5 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between gap-4 shrink-0 print:bg-white print:text-black print:border-b print:border-slate-300">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-400/30 print:hidden">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white print:text-black">
                  کارت حساب تفصیلی و گردش بده/بستان: {client.name}
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 print:border-slate-400 print:text-black">
                  {client.type === 'corporate' ? 'شخصیت حقوقی' : 'شخصیت حقیقی'}
                </span>
              </div>
              <p className="text-xs text-slate-300 print:text-slate-600 mt-0.5">
                {settings.name} | مانده بر پایه حساب‌های دریافتنی/پرداختنی دفترکل؛ بدون جمع‌زدن درآمد، مالیات یا سرمایه
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            {/* Quick Export to Excel / CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="دانلود فایل اکسل (CSV) ریز گردش حساب"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">اکسل گردش</span>
            </button>

            {/* Notification / Share Modal trigger */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="ارسال پیامک یا واتساپ صورتحساب به مخاطب"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ارسال یادآور</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              title="چاپ صورتحساب تفصیلی"
            >
              <Printer className="w-4 h-4" />
              <span>چاپ</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(value => !value)}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title={isMaximized ? 'بازگشت به اندازه عادی' : 'بزرگ‌نمایی کارت حساب'}
              aria-label={isMaximized ? 'بازگشت به اندازه عادی' : 'بزرگ‌نمایی کارت حساب'}
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Client Profile & Balance Summary Strip */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block">شماره تماس</span>
              <span className="font-bold text-slate-800 font-mono">{client.phone || 'ثبت نشده'}</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block">کد / شناسه ملی</span>
              <span className="font-bold text-slate-800 font-mono">{client.nationalCode || 'ثبت نشده'}</span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block">سقف اعتبار مالی مجاز</span>
              <span className="font-bold text-slate-800 font-mono">
                {creditLimit > 0 ? formatCurrency(creditLimit, settings.currency) : 'تعریف‌نشده (نامحدود)'}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 block">اعتبار باقیمانده</span>
              <span className={`font-bold font-mono ${isCreditExceeded ? 'text-rose-600' : 'text-emerald-600'}`}>
                {remainingCredit !== null ? formatCurrency(remainingCredit, settings.currency) : '—'}
              </span>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500">گردش کل بدهکاری (+)</span>
                <p className="text-sm font-bold text-rose-600 mt-0.5 font-mono">
                  {formatCurrency(totalDebit, settings.currency)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500">گردش کل بستانکاری (-)</span>
                <p className="text-sm font-bold text-emerald-600 mt-0.5 font-mono">
                  {formatCurrency(totalCredit, settings.currency)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>

            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              finalBalance > 0
                ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                : finalBalance < 0
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-slate-100 border-slate-200 text-slate-900'
            }`}>
              <div>
                <span className="text-[11px] font-semibold">
                  مانده نهایی حساب: {finalBalance > 0 ? 'بدهکار به ما' : finalBalance < 0 ? 'بستانکار از ما' : 'تسویه'}
                </span>
                <p className="text-base font-extrabold font-mono mt-0.5">
                  {formatCurrency(Math.abs(finalBalance), settings.currency)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-white/80 shadow-2xs flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
            </div>
          </div>

          {isCreditExceeded && (
            <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>
                هشدار: مانده بدهی طرف‌حساب از سقف اعتبار تعیین‌شده ({formatCurrency(creditLimit, settings.currency)}) فراتر رفته است!
              </span>
            </div>
          )}
        </div>

        {/* Tab Filters (Hidden on Print) */}
        <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0 print:hidden">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            همه اسناد ({statementRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('invoices')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'invoices'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            فاکتورها ({statementRows.filter(r => r.type === 'invoice').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('payments')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'payments'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            دریافتی‌ها و پرداخت‌ها ({statementRows.filter(r => r.type === 'payment').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('checks')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'checks'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            چک‌های صیادی ({statementRows.filter(r => r.type === 'check').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('opening')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'opening'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            اسناد افتتاحیه ({statementRows.filter(r => r.type === 'opening').length})
          </button>
        </div>

        {/* Statement Table Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3 w-12 text-center">ردیف</th>
                  <th className="p-3 w-28">تاریخ</th>
                  <th className="p-3 w-28">نوع سند</th>
                  <th className="p-3 w-32">شماره سند / پیگیری</th>
                  <th className="p-3 min-w-[200px]">شرح عملیات</th>
                  <th className="p-3 w-32 text-left text-rose-600">بدهکار (+)</th>
                  <th className="p-3 w-32 text-left text-emerald-600">بستانکار (-)</th>
                  <th className="p-3 w-36 text-left font-extrabold text-slate-900">مانده پس از سند</th>
                  <th className="p-3 w-20 text-center">تشخیص</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      هیچ سندی در این دسته‌بندی برای این طرف‌حساب یافت نشد.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3 font-mono text-slate-600">
                        <div>{toPersianDigits(row.date)}</div>
                        <div className="mt-1 text-[10px] text-slate-400">ساعت {formatDocumentTime(row.created_at)}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          row.type === 'invoice'
                            ? 'bg-indigo-50 text-indigo-700'
                            : row.type === 'payment'
                            ? 'bg-emerald-50 text-emerald-700'
                            : row.type === 'check'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          {row.typeFa}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-medium text-slate-800">{row.referenceNumber}</td>
                      <td className="p-3 text-slate-700">{row.description}</td>
                      <td className="p-3 text-left font-mono font-bold text-rose-600">
                        {row.debit > 0 ? formatCurrency(row.debit, settings.currency) : '—'}
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-600">
                        {row.credit > 0 ? formatCurrency(row.credit, settings.currency) : '—'}
                      </td>
                      <td className="p-3 text-left font-mono font-extrabold text-slate-900">
                        {formatCurrency(row.runningBalance, settings.currency)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.diagnosis === 'بدهکار'
                            ? 'bg-rose-100 text-rose-700'
                            : row.diagnosis === 'بستانکار'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {row.diagnosis}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {displayedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <td colSpan={5} className="p-3 text-right">جمع کل ردیف‌های نمایش‌داده‌شده:</td>
                    <td className="p-3 text-left font-mono text-rose-700">
                      {formatCurrency(displayedRows.reduce((s, r) => s + r.debit, 0), settings.currency)}
                    </td>
                    <td className="p-3 text-left font-mono text-emerald-700">
                      {formatCurrency(displayedRows.reduce((s, r) => s + r.credit, 0), settings.currency)}
                    </td>
                    <td className="p-3 text-left font-mono text-slate-900 font-extrabold">
                      {formatCurrency(Math.abs(finalBalance), settings.currency)}
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-600">
                        {finalBalance > 0 ? 'بد' : finalBalance < 0 ? 'بس' : 'تسویه'}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Official Signature Lines for Print */}
          <div className="hidden print:grid grid-cols-3 gap-6 pt-16 text-center text-xs font-semibold text-slate-700">
            <div className="border-t border-slate-400 pt-2">
              امضای حسابدار / صادرکننده
            </div>
            <div className="border-t border-slate-400 pt-2">
              تایید مدیر مالی و اداری
            </div>
            <div className="border-t border-slate-400 pt-2">
              امضا و مهر کارفرما / طرف‌حساب
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 print:hidden">
          <span className="text-xs text-slate-500">
            تعداد {displayedRows.length} رکورد در کارت حساب این طرف‌حساب درج شده است.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            بستن کارت حساب
          </button>
        </div>
      </div>

      {/* Share / SMS Reminder Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">ارسال یادآور و صورتحساب به مخاطب</h4>
                  <p className="text-[11px] text-slate-500">طرف‌حساب: {client.name} ({client.phone || 'شماره ثبت نشده'})</p>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Text Preview */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                متن استاندارد پیامک و واتساپ:
              </label>
              <textarea
                readOnly
                rows={5}
                value={reminderMessage}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs leading-relaxed text-slate-800 resize-none font-sans focus:outline-hidden select-all"
              />
            </div>

            {/* Status indicators */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100">
              <span>مانده قطعی دفاتر: <strong className="text-slate-900 font-mono">{formatCurrency(Math.abs(finalBalance), settings.currency)}</strong> ({finalBalance > 0 ? 'بدهکار/طلب شرکت' : finalBalance < 0 ? 'بستانکار' : 'تسویه'})</span>
              {copiedNotification && (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckIcon className="w-3.5 h-3.5" /> متن کپی شد
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>کپی متن پیام</span>
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>ارسال مستقیم واتساپ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
