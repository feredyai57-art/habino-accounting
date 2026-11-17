import React, { useState, useMemo } from 'react';
import { useAccounting } from '../lib/store';
import { Transaction, TransactionPurpose, TransactionType } from '../types';
import { formatCurrency, toPersianDigits } from '../lib/currencyUtils';
import {
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wallet,
  X
} from 'lucide-react';
import { categorizeTransaction } from '../services/geminiService';
import { SearchableClientSelect } from './SearchableClientSelect';
import { formatDocumentTime } from '../lib/documentTime';
import { CalendarJalaliDateInput } from './CalendarJalaliDateInput';
import { getCurrentJalaliDate } from '../lib/dateUtils';
import { getAllAccountMoeins } from '../lib/chartOfAccountsData';
import { getUnifiedFloatingTafsiliList } from '../lib/floatingTafsiliEngine';
import {
  getTransactionPurpose,
  getTransactionPurposeGroups,
  isTransactionCounterAccountAllowed
} from '../lib/transactionAccounting';

const isPartnerCurrentPurpose = (purpose: TransactionPurpose): boolean =>
  purpose === 'owner_contribution' || purpose === 'owner_withdrawal';

export const Transactions: React.FC = () => {
  const { transactions, clients, projects, bankAccounts, settings, activeTenant, currentUser, addTransaction, deleteTransaction } = useAccounting();
  const tenantId = activeTenant?.id && activeTenant.id !== 'all'
    ? activeTenant.id
    : currentUser?.tenantId || 'tenant-main';
  const partnerTafsilis = useMemo(() => getUnifiedFloatingTafsiliList(clients)
    .filter(account => account.type === 'partner' && account.isActive !== false && account.tenantId === tenantId),
  [clients, tenantId]);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [type, setType] = useState<TransactionType>('income');
  const [purpose, setPurpose] = useState<TransactionPurpose>('revenue');
  const [category, setCategory] = useState('درآمد خدمات');
  const [date, setDate] = useState(getCurrentJalaliDate);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [counterAccountCode, setCounterAccountCode] = useState('40102');
  const [partnerTafsiliCode, setPartnerTafsiliCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingTransaction, setIsDeletingTransaction] = useState(false);
  const transactionPurposeOptions: { value: TransactionPurpose; label: string }[] = type === 'income'
    ? [
        { value: 'revenue', label: 'درآمد جدید' },
        { value: 'receivable_collection', label: 'وصول طلب / فاکتور ثبت‌شده' },
        { value: 'customer_advance', label: 'پیش‌دریافت از مشتری' },
        { value: 'loan_proceeds', label: 'دریافت تسهیلات / وام' },
        { value: 'owner_contribution', label: 'آورده مالک / شریک' }
      ]
    : type === 'expense'
      ? [
          { value: 'expense', label: 'هزینه جدید' },
          { value: 'payable_settlement', label: 'تسویه بدهی / فاکتور خرید' },
          { value: 'supplier_advance', label: 'پیش‌پرداخت به تأمین‌کننده' },
          { value: 'loan_repayment', label: 'بازپرداخت وام / تسهیلات' },
          { value: 'owner_withdrawal', label: 'برداشت مالک / شریک' }
        ]
      : [{ value: 'transfer', label: 'انتقال بین حساب‌های خودمان' }];
  const counterAccounts = getAllAccountMoeins().filter(account =>
    isTransactionCounterAccountAllowed(purpose, account.code, account.groupCode) &&
    (purpose !== 'revenue' || account.nature !== 'debit') &&
    (purpose !== 'expense' || account.nature !== 'credit')
  );
  const getPurposeDefaultAccount = (nextPurpose: TransactionPurpose) => {
    if (nextPurpose === 'receivable_collection') return '10201';
    if (nextPurpose === 'payable_settlement') return '20101';
    if (nextPurpose === 'revenue') return '40102';
    if (nextPurpose === 'expense') return '60102';
    if (nextPurpose === 'customer_advance') return '20201';
    if (nextPurpose === 'supplier_advance') return '10401';
    if (nextPurpose === 'owner_contribution' || nextPurpose === 'owner_withdrawal') return '30102';
    const groups = getTransactionPurposeGroups(nextPurpose);
    return getAllAccountMoeins().find(account => groups.includes(account.groupCode))?.code || '';
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const descMatch = (tx.description || '').toLowerCase().includes(q);
        const clientMatch = (tx.clientName || '').toLowerCase().includes(q);
        const catMatch = (tx.category || '').toLowerCase().includes(q);
        if (!descMatch && !clientMatch && !catMatch) return false;
      }

      return true;
    });
  }, [transactions, typeFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalIncome = transactions
      .filter(t => getTransactionPurpose(t) === 'revenue')
      .reduce((s, t) => s + t.amount, 0);

    const totalExpense = transactions
      .filter(t => getTransactionPurpose(t) === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    const totalCashIn = transactions
      .filter(transaction => transaction.type === 'income')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalCashOut = transactions
      .filter(transaction => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const netBalance = totalCashIn - totalCashOut;

    return { totalIncome, totalExpense, netBalance };
  }, [transactions]);

  const handleSmartCategorize = async () => {
    if (!description.trim()) return;
    setIsCategorizing(true);
    setFormError(null);
    try {
      const suggested = await categorizeTransaction(description, amount, type);
      setCategory(suggested);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const isPartnerCurrentTransaction = isPartnerCurrentPurpose(purpose);
    if (!description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError('شرح و مبلغ معتبر برای ثبت تراکنش الزامی است.');
      return;
    }
    if (!clientId && !isPartnerCurrentTransaction) {
      setFormError('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
      return;
    }
    if (!cashAccountId) {
      setFormError('انتخاب حساب صندوق یا بانک مبدأ/مقصد الزامی است.');
      return;
    }
    if (type === 'transfer' && (!destinationAccountId || destinationAccountId === cashAccountId)) {
      setFormError('برای انتقال، حساب مقصد متفاوت از حساب مبدأ انتخاب کنید.');
      return;
    }
    if (type !== 'transfer' && !counterAccountCode) {
      setFormError('انتخاب حساب مقابل از کدینگ حساب‌ها الزامی است.');
      return;
    }
    if ((purpose === 'owner_contribution' || purpose === 'owner_withdrawal') &&
      !partnerTafsilis.some(partner => partner.code === partnerTafsiliCode)) {
      setFormError('برای ثبت آورده یا برداشت، تفصیلی شریک مستأجر جاری را انتخاب کنید.');
      return;
    }

    try {
      const client = clientId ? clients.find(c => c.id === clientId) : undefined;
      if ((!client && !isPartnerCurrentTransaction) ||
        (client && activeTenant?.id && client.tenantId && client.tenantId !== activeTenant.id)) {
        setFormError('طرف‌حساب معتبر برای مستأجر جاری انتخاب کنید.');
        return;
      }
      await addTransaction({
        description,
        amount: Number(amount) || 0,
        type,
        purpose,
        category,
        counterAccountCode: type !== 'transfer' ? counterAccountCode : undefined,
        partnerTafsiliCode: partnerTafsiliCode || undefined,
        partnerTafsiliTitle: partnerTafsilis.find(partner => partner.code === partnerTafsiliCode)?.title,
        expenseAccountCode: purpose === 'expense' ? counterAccountCode : undefined,
        date,
        cashAccountId: cashAccountId || undefined,
        destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
        clientId: isPartnerCurrentTransaction ? undefined : clientId,
        clientName: client?.name || partnerTafsilis.find(partner => partner.code === partnerTafsiliCode)?.title || '',
        projectId: projectId || undefined
      });

      setShowModal(false);
      setDescription('');
      setAmount(0);
      setClientId('');
      setPartnerTafsiliCode('');
      setProjectId('');
      setCashAccountId('');
      setDestinationAccountId('');
      setCounterAccountCode('40102');
      setDate(getCurrentJalaliDate());
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const chooseTransactionType = (nextType: TransactionType) => {
    setType(nextType);
    const nextPurpose: TransactionPurpose = nextType === 'income'
      ? 'revenue'
      : nextType === 'expense'
        ? 'expense'
        : 'transfer';
    setPurpose(nextPurpose);
    setCounterAccountCode(getPurposeDefaultAccount(nextPurpose));
    setFormError(null);
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    setIsDeletingTransaction(true);
    setDeleteError(null);
    try {
      await deleteTransaction(transactionToDelete.id);
      setTransactionToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeletingTransaction(false);
    }
  };

  return (
    <div className="space-y-6" id="transactions-module">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            تراکنش‌های مالی و جریان وجوه نقد
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ثبت دریافت‌ها و پرداخت‌های روزانه، دسته‌بندی هوشمند با سیناپس و گزارش تراز نقدی
          </p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setDate(getCurrentJalaliDate());
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          ثبت تراکنش جدید
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              درآمد شناسایی‌شده
            </span>
            <span className="text-[11px] font-mono text-emerald-600 font-semibold">
              {toPersianDigits(transactions.filter(t => getTransactionPurpose(t) === 'revenue').length)} تراکنش
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-emerald-900 font-mono">
            {formatCurrency(stats.totalIncome, settings.currency)}
          </div>
        </div>

        <div className="p-4 bg-rose-50/70 border border-rose-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-rose-600" />
              هزینه شناسایی‌شده
            </span>
            <span className="text-[11px] font-mono text-rose-600 font-semibold">
              {toPersianDigits(transactions.filter(t => getTransactionPurpose(t) === 'expense').length)} تراکنش
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-rose-900 font-mono">
            {formatCurrency(stats.totalExpense, settings.currency)}
          </div>
        </div>

        <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-blue-600" />
              خالص جریان وجه
            </span>
            <span className="text-[11px] font-mono text-blue-600 font-semibold">
              دریافت وجه منهای پرداخت وجه
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-blue-900 font-mono">
            {formatCurrency(stats.netBalance, settings.currency)}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            همه گردش‌ها ({toPersianDigits(transactions.length)})
          </button>
          <button
            onClick={() => setTypeFilter('income')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'income'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            دریافت‌ها (+)
          </button>
          <button
            onClick={() => setTypeFilter('transfer')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'transfer' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            انتقال‌ها
          </button>
          <button
            onClick={() => setTypeFilter('expense')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'expense'
                ? 'bg-rose-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            هزینه‌ها (-)
          </button>
        </div>

        {/* Global Search Box */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="جستجوی سریع شرح، طرف‌حساب، یا دسته‌بندی..."
            aria-label="جستجو در تراکنش‌ها"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full min-w-[760px] text-right border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
              <th className="p-4">نوع</th>
              <th className="p-4">شرح تراکنش</th>
              <th className="p-4">دسته‌بندی حساب</th>
              <th className="p-4">طرف‌حساب</th>
              <th className="p-4">تاریخ ثبت</th>
              <th className="p-4">مبلغ تراکنش</th>
              <th className="p-4 text-center">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                  هیچ تراکنشی مطابق با عبارت جستجو یافت نشد.
                </td>
              </tr>
            ) : (
              filteredTransactions.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-4">
                    <div className={`p-1.5 rounded-lg inline-block ${
                      tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : tx.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {tx.type === 'income' ? <ArrowUpRight className="w-4 h-4" /> : tx.type === 'expense' ? <ArrowDownRight className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                      <span className="sr-only">
                        {tx.type === 'income' ? 'دریافت' : tx.type === 'expense' ? 'پرداخت' : 'انتقال'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 font-bold text-slate-900">{tx.description}</td>
                  <td className="p-4 text-xs">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium">
                      {tx.category}
                    </span>
                    {tx.cashAccountId && (
                      <span className="block mt-1 text-[10px] text-slate-500">
                        حساب: {bankAccounts.find(account => account.id === tx.cashAccountId)?.bankName || 'صندوق/بانک'}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-slate-700 font-medium text-xs">{tx.clientName || '—'}</td>
                  <td className="p-4 text-slate-400 text-xs font-mono">
                    <div>{tx.date}</div>
                    <div className="mt-1 text-[10px] text-slate-500">ساعت {formatDocumentTime(tx.created_at)}</div>
                  </td>
                  <td className={`p-4 font-bold font-mono ${tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-rose-600' : 'text-blue-600'}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '↔'} {formatCurrency(tx.amount, settings.currency)}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setTransactionToDelete(tx);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="حذف تراکنش"
                      aria-label={`حذف تراکنش ${tx.description}`}
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

      {/* Modal for New Transaction */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-blue-600" />
                ثبت تراکنش مالی جدید
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                title="بستن فرم تراکنش (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>بستن فرم</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { chooseTransactionType('income'); setCategory('دریافت وجه'); }}
                  className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                    type === 'income' ? 'bg-emerald-50 border-emerald-600 text-emerald-700 shadow-xs' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  دریافت وجه (+)
                </button>
                <button
                  type="button"
                  onClick={() => { chooseTransactionType('expense'); setCategory('پرداخت وجه'); }}
                  className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                    type === 'expense' ? 'bg-rose-50 border-rose-600 text-rose-700 shadow-xs' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  پرداخت / خروج وجه (-)
                </button>
                <button
                  type="button"
                  onClick={() => { chooseTransactionType('transfer'); setCategory('انتقال بین حساب‌ها'); }}
                  className={`col-span-2 p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                    type === 'transfer' ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  انتقال بین صندوق و بانک‌های خودمان
                </button>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">ماهیت حسابداری رویداد *</label>
                <select
                  required
                  value={purpose}
                  onChange={event => {
                    const nextPurpose = event.target.value as TransactionPurpose;
                    setPurpose(nextPurpose);
                    setCounterAccountCode(getPurposeDefaultAccount(nextPurpose));
                    if (isPartnerCurrentPurpose(nextPurpose)) setClientId('');
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  {transactionPurposeOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  دریافت و پرداخت الزاماً درآمد یا هزینه نیستند؛ ماهیت صحیح را برای ثبت حسابداری انتخاب کنید.
                </p>
              </div>

              {type !== 'transfer' && (
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">حساب مقابل در دفتر کل *</label>
                  <select
                    required
                    value={counterAccountCode}
                    disabled={purpose === 'receivable_collection' || purpose === 'payable_settlement'}
                    onChange={event => setCounterAccountCode(event.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    {counterAccounts.map(account => (
                      <option key={account.code} value={account.code}>
                        {account.code} - {account.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(purpose === 'owner_contribution' || purpose === 'owner_withdrawal') && (
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">شریک / سهامدار *</label>
                  <select
                    required
                    value={partnerTafsiliCode}
                    onChange={event => setPartnerTafsiliCode(event.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="">انتخاب تفصیلی شریک همین مستأجر...</option>
                    {partnerTafsilis.map(partner => (
                      <option key={partner.id} value={partner.code}>{partner.code} - {partner.title}</option>
                    ))}
                  </select>
                  {partnerTafsilis.length === 0 && <p className="mt-1 text-[10px] text-rose-700">ابتدا تفصیلی نوع «شریک/سهامدار» را برای همین مستأجر تعریف کنید.</p>}
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-600 block mb-1">شرح تراکنش *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="مثال: واریز پیش‌پرداخت قرارداد / خرید تجهیزات کارگاه"
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSmartCategorize}
                    disabled={isCategorizing || !description}
                    className="px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl flex items-center gap-1 font-bold disabled:opacity-50 cursor-pointer"
                    title="تشخیص هوشمند دسته‌بندی با هوش مصنوعی سیناپس"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isCategorizing ? '...' : 'سیناپس'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">مبلغ ({settings.currency}) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={amount || ''}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">دسته‌بندی حساب</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">
                  {type === 'income' ? 'واریز به صندوق / حساب بانکی *' : 'پرداخت از صندوق / حساب بانکی *'}
                </label>
                <select
                  required
                  value={cashAccountId}
                  onChange={event => setCashAccountId(event.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <option value="">انتخاب حساب...</option>
                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.accountType === 'cash' ? 'صندوق' : 'بانک'}: {account.bankName}
                    </option>
                  ))}
                </select>
                {bankAccounts.length === 0 && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    برای ثبت گردش به تفکیک صندوق یا بانک، ابتدا حساب موردنظر را در بخش «صندوق و حساب‌های بانکی» بسازید.
                  </p>
                )}
              </div>

              {type === 'transfer' && (
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">واریز به حساب مقصد *</label>
                  <select
                    required
                    value={destinationAccountId}
                    onChange={event => setDestinationAccountId(event.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <option value="">انتخاب حساب مقصد...</option>
                    {bankAccounts.filter(account => account.id !== cashAccountId).map(account => (
                      <option key={account.id} value={account.id}>
                        {account.accountType === 'cash' ? 'صندوق' : 'بانک'}: {account.bankName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!isPartnerCurrentPurpose(purpose) && (
                <div>
                  <SearchableClientSelect
                    clients={clients}
                    value={clientId}
                    onChange={setClientId}
                    label={type === 'transfer' ? 'طرف‌حساب / مرجع انتقال *' : 'طرف‌حساب *'}
                    placeholder="جستجو و انتخاب طرف‌حساب..."
                    required
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-600 block mb-1">تاریخ تراکنش</label>
                <CalendarJalaliDateInput value={date} onChange={setDate} />
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">برچسب پروژه (اختیاری)</label>
                <select
                  value={projectId}
                  onChange={event => setProjectId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"
                >
                  <option value="">بدون تخصیص به پروژه</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">برچسب پروژه برای گزارش‌گیری است و حساب دفتر کل جداگانه ایجاد نمی‌کند.</p>
              </div>

              {formError && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-700">
                  {formError}
                </p>
              )}

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
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors"
                >
                  ثبت در دفاتر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {transactionToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">حذف تراکنش</h3>
            <p className="mt-2 text-sm text-slate-600">
              آیا از حذف تراکنش «{transactionToDelete.description}» به مبلغ{' '}
              {formatCurrency(transactionToDelete.amount, settings.currency)} اطمینان دارید؟
            </p>
            {deleteError && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                حذف تراکنش انجام نشد: {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isDeletingTransaction}
                onClick={() => setTransactionToDelete(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeletingTransaction}
                onClick={confirmDeleteTransaction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-60"
              >
                {isDeletingTransaction ? 'در حال حذف...' : 'حذف تراکنش'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
