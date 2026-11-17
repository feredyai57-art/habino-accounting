import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../lib/store';
import { Check, CheckType, CheckStatus } from '../types';
import { formatCurrency, toPersianDigits } from '../lib/currencyUtils';
import {
  CreditCard,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  ScanLine,
  X
} from 'lucide-react';
import { SearchableClientSelect } from './SearchableClientSelect';
import { CalendarJalaliDateInput } from './CalendarJalaliDateInput';
import { SayadCheckScannerModal } from './SayadCheckScannerModal';
import { SayadCheckQrData } from '../lib/sayadBarcodeParser';
import { validateInvoiceClientId } from './Invoices';
import { formatDocumentTime } from '../lib/documentTime';

interface ChecksProps {
  initialSayadData?: SayadCheckQrData | null;
}

export const Checks: React.FC<ChecksProps> = ({ initialSayadData }) => {
  const { checks, addCheck, updateCheck, deleteCheck, clients, bankAccounts, settings, activeTenant } = useAccounting();
  const [showModal, setShowModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkToDelete, setCheckToDelete] = useState<Check | null>(null);
  const [checkToClear, setCheckToClear] = useState<Check | null>(null);
  const [checkToEndorse, setCheckToEndorse] = useState<Check | null>(null);
  const [clearingBankAccountId, setClearingBankAccountId] = useState('');
  const [endorseeClientId, setEndorseeClientId] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [endorsementError, setEndorsementError] = useState<string | null>(null);
  const [isDeletingCheck, setIsDeletingCheck] = useState(false);
  const [isClearingCheck, setIsClearingCheck] = useState(false);
  const [isEndorsingCheck, setIsEndorsingCheck] = useState(false);
  const [activeTypeFilter, setActiveTypeFilter] = useState<'all' | 'receivable' | 'payable'>('all');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'pending' | 'cleared' | 'endorsed' | 'bounced'>('all');

  // Form State
  const [type, setType] = useState<CheckType>('receivable');
  const [checkNumber, setCheckNumber] = useState('');
  const [sayadNumber, setSayadNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState('');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const payableBankAccounts = bankAccounts.filter(account =>
    account.accountType !== 'cash' &&
    Boolean(account.accountCode) &&
    (!account.tenantId || account.tenantId === activeTenant?.id)
  );
  const receivableSettlementAccounts = bankAccounts.filter(account =>
    Boolean(account.accountCode) &&
    (!account.tenantId || account.tenantId === activeTenant?.id)
  );

  const handleSayadDetected = (data: SayadCheckQrData) => {
    setSayadNumber(data.formattedSayadId);
    if (data.bankName) setBankName(data.bankName);
    if (data.amount) setAmount(data.amount);
    if (data.dueDate) setDueDate(data.dueDate);
    if (data.serial) setCheckNumber(data.serial);
    setShowModal(true);
  };

  useEffect(() => {
    if (initialSayadData) {
      handleSayadDetected(initialSayadData);
    } else {
      const stored = localStorage.getItem('habino_pending_sayad_qr');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          localStorage.removeItem('habino_pending_sayad_qr');
          handleSayadDetected(parsed);
        } catch {
          localStorage.removeItem('habino_pending_sayad_qr');
        }
      }
    }
  }, [initialSayadData]);

  // Filtered checks list
  const filteredChecks = useMemo(() => {
    return checks.filter(chk => {
      // Type filter
      if (activeTypeFilter !== 'all' && chk.type !== activeTypeFilter) return false;
      // Status filter
      if (activeStatusFilter !== 'all' && chk.status !== activeStatusFilter) return false;

      // Search query across client name, check number, sayad ID, bank name, notes
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const clientMatch = (chk.clientName || '').toLowerCase().includes(q);
        const checkNumMatch = (chk.checkNumber || '').toLowerCase().includes(q);
        const sayadMatch = (chk.sayadNumber || '').toLowerCase().includes(q);
        const bankMatch = (chk.bankName || '').toLowerCase().includes(q);
        const notesMatch = (chk.notes || '').toLowerCase().includes(q);

        if (!clientMatch && !checkNumMatch && !sayadMatch && !bankMatch && !notesMatch) {
          return false;
        }
      }

      return true;
    });
  }, [checks, activeTypeFilter, activeStatusFilter, searchQuery]);

  // Financial KPI sums
  const stats = useMemo(() => {
    const receivablePending = checks
      .filter(c => c.type === 'receivable' && c.status === 'pending')
      .reduce((s, c) => s + c.amount, 0);

    const payablePending = checks
      .filter(c => c.type === 'payable' && c.status === 'pending')
      .reduce((s, c) => s + c.amount, 0);

    const bouncedTotal = checks
      .filter(c => c.status === 'bounced')
      .reduce((s, c) => s + c.amount, 0);

    return { receivablePending, payablePending, bouncedTotal };
  }, [checks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const selectedBankAccount = type === 'payable'
      ? payableBankAccounts.find(account => account.id === bankAccountId)
      : undefined;
    if (type === 'payable' && !selectedBankAccount) {
      setSubmitError(payableBankAccounts.length
        ? 'برای صدور چک پرداختی، حساب بانکی معتبر انتخاب کنید.'
        : 'برای صدور چک پرداختی ابتدا یک حساب بانکی متصل به حساب دفتر کل تعریف کنید.');
      return;
    }
    const clientValidation = validateInvoiceClientId(clientId, clients, {
      tenantId: activeTenant?.id
    });
    if (!clientValidation.isValid) {
      alert(clientValidation.errorFa || 'ثبت سند بدون مخاطب مجاز نیست.');
      return;
    }

    const client = clientValidation.client || clients.find(c => c.id === clientId);

    try {
      await addCheck({
        checkNumber,
        sayadNumber,
        bankName: selectedBankAccount?.bankName || bankName,
        bankAccountId: selectedBankAccount?.id,
        amount,
        issueDate: new Date().toLocaleDateString('fa-IR'),
        dueDate,
        type,
        status: 'pending',
        clientId: clientValidation.clientId || clientId,
        clientName: client?.name || 'مشتری نامشخص',
        notes,
        description: notes
      });

      setShowModal(false);
      resetForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  };

  const confirmCheckEndorsement = async () => {
    if (!checkToEndorse || !endorseeClientId) return;
    const endorsee = clients.find(client => client.id === endorseeClientId);
    if (!endorsee) {
      setEndorsementError('طرف‌حساب دریافت‌کننده چک را انتخاب کنید.');
      return;
    }
    setIsEndorsingCheck(true);
    setEndorsementError(null);
    try {
      await updateCheck(checkToEndorse.id, {
        status: 'endorsed',
        metadata: {
          ...checkToEndorse.metadata,
          endorsedToClientId: endorsee.id,
          endorsedToClientName: endorsee.name,
          endorsedAt: new Date().toISOString()
        }
      });
      setCheckToEndorse(null);
    } catch (error) {
      setEndorsementError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsEndorsingCheck(false);
    }
  };

  const resetForm = () => {
    setCheckNumber('');
    setSayadNumber('');
    setBankName('');
    setBankAccountId('');
    setAmount(0);
    setDueDate('');
    setClientId('');
    setNotes('');
  };

  const handleStatusChange = (id: string, newStatus: CheckStatus) => {
    const check = checks.find(item => item.id === id);
    setStatusError(null);
    if (newStatus === 'cleared' && check?.type === 'receivable') {
      setClearingBankAccountId(check.bankAccountId || '');
      setClearError(null);
      setCheckToClear(check);
      return;
    }
    if (newStatus === 'endorsed' && check?.type === 'receivable') {
      setEndorseeClientId('');
      setEndorsementError(null);
      setCheckToEndorse(check);
      return;
    }

    updateCheck(id, { status: newStatus }).catch(error => {
      setStatusError(error instanceof Error ? error.message : String(error));
    });
  };

  const confirmCheckClearance = async () => {
    if (!checkToClear || !clearingBankAccountId) return;
    setIsClearingCheck(true);
    setClearError(null);
    try {
      await updateCheck(checkToClear.id, {
        status: 'cleared',
        bankAccountId: clearingBankAccountId
      });
      setCheckToClear(null);
    } catch (error) {
      setClearError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClearingCheck(false);
    }
  };

  const confirmDeleteCheck = async () => {
    if (!checkToDelete) return;
    setIsDeletingCheck(true);
    setDeleteError(null);
    try {
      await deleteCheck(checkToDelete.id);
      setCheckToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeletingCheck(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
            مدیریت چک‌های صیادی و اسناد تجاری
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ردیابی سررسید، استعلام سامانه صیاد و تسویه خودکار حساب اشخاص
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScannerModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
          >
            <ScanLine className="w-4 h-4 text-slate-950" />
            <span>اسکن بارکد چک صیاد</span>
            <span className="text-[10px] bg-slate-950/15 px-1.5 py-0.5 rounded-full font-mono">P1</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            ثبت چک جدید
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              چک‌های دریافتی در جریان وصول
            </span>
            <span className="text-[11px] font-mono text-emerald-600 font-semibold">
              {toPersianDigits(checks.filter(c => c.type === 'receivable' && c.status === 'pending').length)} فقره
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-emerald-900">
            {formatCurrency(stats.receivablePending, settings.currency)}
          </div>
        </div>

        <div className="p-4 bg-rose-50/70 border border-rose-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
              چک‌های پرداختی متعهد در سررسید
            </span>
            <span className="text-[11px] font-mono text-rose-600 font-semibold">
              {toPersianDigits(checks.filter(c => c.type === 'payable' && c.status === 'pending').length)} فقره
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-rose-900">
            {formatCurrency(stats.payablePending, settings.currency)}
          </div>
        </div>

        <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              چک‌های برگشتی و حقوقی
            </span>
            <span className="text-[11px] font-mono text-amber-600 font-semibold">
              {toPersianDigits(checks.filter(c => c.status === 'bounced').length)} فقره
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-amber-900">
            {formatCurrency(stats.bouncedTotal, settings.currency)}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              activeTypeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            همه نوع
          </button>
          <button
            onClick={() => setActiveTypeFilter('receivable')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              activeTypeFilter === 'receivable'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            دریافتی
          </button>
          <button
            onClick={() => setActiveTypeFilter('payable')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              activeTypeFilter === 'payable'
                ? 'bg-rose-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            پرداختی
          </button>

          <span className="w-px h-4 bg-slate-200 mx-1" />

          <button
            onClick={() => setActiveStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
              activeStatusFilter === 'all'
                ? 'bg-slate-200 text-slate-800 font-bold'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            همه وضعیت‌ها
          </button>
          <button
            onClick={() => setActiveStatusFilter('pending')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
              activeStatusFilter === 'pending'
                ? 'bg-amber-100 text-amber-800 font-bold'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            در جریان وصول
          </button>
          <button
            onClick={() => setActiveStatusFilter('cleared')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
              activeStatusFilter === 'cleared'
                ? 'bg-emerald-100 text-emerald-800 font-bold'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            وصول شده
          </button>
          <button
            onClick={() => setActiveStatusFilter('endorsed')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
              activeStatusFilter === 'endorsed'
                ? 'bg-sky-100 text-sky-800 font-bold'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            خرج‌شده
          </button>
          <button
            onClick={() => setActiveStatusFilter('bounced')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
              activeStatusFilter === 'bounced'
                ? 'bg-rose-100 text-rose-800 font-bold'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            برگشت خورده
          </button>
        </div>
        {statusError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            تغییر وضعیت چک انجام نشد: {statusError}
          </p>
        )}

        {/* Global Search Box */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="جستجوی سریع طرف‌حساب، شناسه صیاد، شماره چک یا بانک..."
            aria-label="جستجو در چک‌ها"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-purple-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600"
              aria-label="پاک‌کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Checks Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full min-w-[980px] text-right border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
              <th className="p-4">نوع</th>
              <th className="p-4">شماره صیاد / سریال چک</th>
              <th className="p-4">بانک عامل</th>
              <th className="p-4">طرف‌حساب</th>
              <th className="p-4">تاریخ سررسید</th>
              <th className="p-4">مبلغ چک</th>
              <th className="p-4">وضعیت صیادی</th>
              <th className="p-4 text-center">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredChecks.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                  موردی مطابق با فیلترها و عبارت جستجوی مورد نظر یافت نشد.
                  {(searchQuery || activeTypeFilter !== 'all' || activeStatusFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setActiveTypeFilter('all');
                        setActiveStatusFilter('all');
                      }}
                      className="block mx-auto mt-3 px-3 py-1.5 rounded-lg border border-slate-200 text-purple-700 hover:bg-purple-50 font-semibold"
                    >
                      پاک‌کردن جستجو و فیلترها
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredChecks.map(chk => (
                <tr key={chk.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      chk.type === 'receivable' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {chk.type === 'receivable' ? 'دریافتی' : 'پرداختی'}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="font-mono font-bold text-slate-900">#{chk.checkNumber}</p>
                    {chk.sayadNumber && (
                      <p className="font-mono text-[11px] text-slate-400 mt-0.5 tracking-wider">
                        صیاد: {chk.sayadNumber}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-slate-700 font-medium">{chk.bankName}</td>
                  <td className="p-4 font-bold text-slate-900">
                    {chk.clientName}
                    {chk.status === 'endorsed' && chk.metadata?.endorsedToClientName && (
                      <p className="mt-1 text-[10px] font-medium text-sky-700">
                        خرج‌شده به: {chk.metadata.endorsedToClientName}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-xs font-mono font-semibold text-slate-700">
                    <div>{chk.dueDate}</div>
                    <div className="mt-1 text-[10px] text-slate-500">ثبت: {formatDocumentTime(chk.created_at)}</div>
                  </td>
                  <td className="p-4 font-bold text-slate-900">{formatCurrency(chk.amount, settings.currency)}</td>
                  <td className="p-4">
                    <select
                      value={chk.status}
                      onChange={e => handleStatusChange(chk.id, e.target.value as CheckStatus)}
                      className={`text-xs font-semibold rounded-xl px-2.5 py-1.5 border transition-colors cursor-pointer ${
                        chk.status === 'cleared' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                        chk.status === 'endorsed' ? 'bg-sky-50 text-sky-700 border-sky-300' :
                        chk.status === 'bounced' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                        'bg-amber-50 text-amber-800 border-amber-300'
                      }`}
                    >
                      <option value={chk.status}>
                        {chk.status === 'cleared' ? 'وصول و تسویه شده' :
                         chk.status === 'endorsed' ? 'خرج‌شده به طرف‌حساب' :
                         chk.status === 'bounced' ? 'برگشت خورده (عدم پاس)' :
                         chk.status === 'cancelled' ? 'باطل / عودت داده شده' :
                         'در جریان وصول'}
                      </option>
                      {chk.status === 'pending' && (
                        <>
                          <option value="cleared">وصول و تسویه شده</option>
                          {chk.type === 'receivable' && <option value="endorsed">خرج‌شده به طرف‌حساب</option>}
                          <option value="bounced">برگشت خورده (عدم پاس)</option>
                          <option value="cancelled">باطل / عودت داده شده</option>
                        </>
                      )}
                      {(chk.status === 'cleared' || chk.status === 'endorsed') && (
                        <option value="bounced">برگشت خورده (عدم پاس)</option>
                      )}
                    </select>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setCheckToDelete(chk);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="حذف چک"
                      aria-label={`حذف چک ${chk.checkNumber}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Check Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-purple-600" />
                ثبت چک صیادی جدید
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                title="بستن فرم چک (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>بستن فرم</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">نوع سند چک *</label>
                  <select
                    value={type}
                    onChange={e => {
                      setType(e.target.value as CheckType);
                      setSubmitError(null);
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="receivable">دریافتی از مشتری</option>
                    <option value="payable">پرداختی به تامین‌کننده</option>
                  </select>
                </div>

                {type === 'payable' ? (
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">حساب بانکی صادرکننده چک *</label>
                    <select
                      required
                      value={bankAccountId}
                      onChange={e => setBankAccountId(e.target.value)}
                      disabled={payableBankAccounts.length === 0}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs disabled:opacity-60"
                    >
                      <option value="">
                        {payableBankAccounts.length ? 'انتخاب حساب بانکی...' : 'ابتدا حساب بانکی تعریف کنید'}
                      </option>
                      {payableBankAccounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.bankName} - {account.accountNumber || 'بدون شماره'} ({account.accountCode})
                        </option>
                      ))}
                    </select>
                    {payableBankAccounts.length === 0 && (
                      <p className="text-[10px] text-amber-700 mt-1">
                        صدور چک تا زمان تعریف حساب بانکی و اتصال آن به دفتر کل غیرفعال است.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">بانک صادرکننده چک دریافتی *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: بانک ملت، ملی، پاسارگاد"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Searchable Client Select */}
              <div>
                <SearchableClientSelect
                  clients={clients}
                  value={clientId}
                  onChange={setClientId}
                  label={type === 'receivable' ? 'صاحب چک / پرداخت‌کننده (طرف‌حساب)' : 'دریافت‌کننده چک (طرف‌حساب)'}
                  placeholder="جستجو و انتخاب طرف‌حساب چک..."
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">شماره سریال چک *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: ۹۸۷۶۵۴"
                    value={checkNumber}
                    onChange={e => setCheckNumber(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-600 block">شناسه ۱۶ رقمی صیاد</label>
                    <button
                      type="button"
                      onClick={() => setShowScannerModal(true)}
                      className="text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      <span>اسکن با دوربین</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="شناسه یکتای صیادی"
                    value={sayadNumber}
                    onChange={e => setSayadNumber(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono tracking-wider"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">مبلغ چک ({settings.currency}) *</label>
                  <input
                    type="number"
                    required
                    min="1000"
                    placeholder="مبلغ به عدد"
                    value={amount || ''}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">تاریخ سررسید چک *</label>
                  <CalendarJalaliDateInput
                    required
                    placeholder="مثال: ۱۴۰۳/۰۸/۱۵"
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">شرح و بابت (یادداشت)</label>
                <input
                  type="text"
                  placeholder="مثال: بابت پیش‌پرداخت قرارداد طراحی معماری"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-xs transition-colors"
                >
                  ثبت قطعی چک
                </button>
              </div>
              {submitError && (
                <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                  {submitError}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
      {checkToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">حذف چک</h3>
            <p className="mt-2 text-sm text-slate-600">
              آیا از حذف چک شماره «{checkToDelete.checkNumber}» به مبلغ{' '}
              {formatCurrency(checkToDelete.amount, settings.currency)} اطمینان دارید؟
            </p>
            {deleteError && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                حذف چک انجام نشد: {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isDeletingCheck}
                onClick={() => setCheckToDelete(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeletingCheck}
                onClick={confirmDeleteCheck}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-60"
              >
                {isDeletingCheck ? 'در حال حذف...' : 'حذف چک'}
              </button>
            </div>
          </div>
        </div>
      )}
      {checkToClear && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">وصول چک دریافتی</h3>
            <p className="mt-2 text-sm text-slate-600">
              حساب بانکی‌ای را که مبلغ چک شماره «{checkToClear.checkNumber}» به آن واریز شده انتخاب کنید.
            </p>
            <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="check-clearing-bank-account">
              حساب بانکی مقصد *
            </label>
            <select
              id="check-clearing-bank-account"
              required
              value={clearingBankAccountId}
              onChange={event => setClearingBankAccountId(event.target.value)}
              disabled={receivableSettlementAccounts.length === 0 || isClearingCheck}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs disabled:opacity-60"
            >
              <option value="">
                {receivableSettlementAccounts.length ? 'انتخاب صندوق یا حساب بانکی...' : 'صندوق یا حساب متصل به دفتر کل تعریف نشده است'}
              </option>
              {receivableSettlementAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.bankName} - {account.accountNumber || 'بدون شماره'} ({account.accountCode})
                </option>
              ))}
            </select>
            {receivableSettlementAccounts.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                برای وصول چک، ابتدا یک صندوق یا حساب بانکی متصل به دفتر کل تعریف کنید.
              </p>
            )}
            {clearError && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                وصول چک انجام نشد: {clearError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isClearingCheck}
                onClick={() => setCheckToClear(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!clearingBankAccountId || receivableSettlementAccounts.length === 0 || isClearingCheck}
                onClick={confirmCheckClearance}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-60"
              >
                {isClearingCheck ? 'در حال ثبت...' : 'تأیید وصول'}
              </button>
            </div>
          </div>
        </div>
      )}
      {checkToEndorse && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">خرج‌کردن چک دریافتی</h3>
            <p className="mt-2 text-sm text-slate-600">
              چک شماره «{checkToEndorse.checkNumber}» به مبلغ{' '}
              {formatCurrency(checkToEndorse.amount, settings.currency)} به طرف‌حساب انتخاب‌شده واگذار و بدهی او تسویه می‌شود.
            </p>
            <div className="mt-4">
              <SearchableClientSelect
                clients={clients.filter(client => client.id !== checkToEndorse.clientId)}
                value={endorseeClientId}
                onChange={setEndorseeClientId}
                label="طرف‌حساب دریافت‌کننده چک *"
                placeholder="جستجو و انتخاب طرف‌حساب..."
              />
            </div>
            {endorsementError && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                واگذاری چک انجام نشد: {endorsementError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isEndorsingCheck}
                onClick={() => setCheckToEndorse(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!endorseeClientId || isEndorsingCheck}
                onClick={confirmCheckEndorsement}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold disabled:opacity-60"
              >
                {isEndorsingCheck ? 'در حال ثبت...' : 'تأیید واگذاری چک'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sayad Check QR Camera Scanner Modal */}
      <SayadCheckScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onSayadDetected={handleSayadDetected}
      />
    </div>
  );
};
