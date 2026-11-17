import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Plus, Search, X } from 'lucide-react';
import { useAccounting } from '../lib/store';
import { formatCurrency } from '../lib/currencyUtils';
import { getCurrentJalaliDate } from '../lib/dateUtils';
import { CalendarJalaliDateInput } from './CalendarJalaliDateInput';
import { Invoice, Installment } from '../types';

export const Installments: React.FC = () => {
  const {
    installments,
    invoices,
    settings,
    bankAccounts,
    currentUser,
    hasPermission,
    createInstallmentPlan,
    recordInstallmentPayment
  } = useAccounting();
  const canManageInstallments = hasPermission('accounting:manage_installments');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [totalInstallments, setTotalInstallments] = useState(3);
  const [totalInterest, setTotalInterest] = useState(0);
  const [totalServiceFee, setTotalServiceFee] = useState(0);
  const [firstDueDate, setFirstDueDate] = useState(getCurrentJalaliDate());
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentInstallment, setPaymentInstallment] = useState<Installment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(getCurrentJalaliDate());
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const invoiceById = useMemo(() => new Map(invoices.map(invoice => [invoice.id, invoice])), [invoices]);
  const eligibleInvoices = useMemo(() => invoices.filter(invoice =>
    ['sale', 'service'].includes(invoice.type) &&
    !['draft', 'cancelled'].includes(invoice.status) &&
    !invoice.is_deleted &&
    Number(invoice.remainingAmount) > 0 &&
    !invoice.metadata?.installmentPlan &&
    !installments.some(installment => installment.invoiceId === invoice.id)
  ), [invoices, installments]);
  const selectedInvoice = eligibleInvoices.find(invoice => invoice.id === selectedInvoiceId);
  const filteredInstallments = installments.filter(installment => {
    const invoice = invoiceById.get(installment.invoiceId);
    const query = searchQuery.trim().toLowerCase();
    return !query || [
      installment.clientName,
      installment.dueDate,
      invoice?.invoiceNumber,
      String(installment.installmentNumber),
      String(installment.totalInstallments),
      String(installment.amount)
    ].some(value => String(value || '').toLowerCase().includes(query));
  });

  const openPlanModal = () => {
    setSelectedInvoiceId('');
    setTotalInstallments(3);
    setTotalInterest(0);
    setTotalServiceFee(0);
    setFirstDueDate(getCurrentJalaliDate());
    setPlanError('');
    setShowPlanModal(true);
  };

  const handleCreatePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice) {
      setPlanError('یک فاکتور قطعی فروش یا خدمات دارای مانده را انتخاب کنید.');
      return;
    }

    setIsSavingPlan(true);
    setPlanError('');
    try {
      const total = Number(selectedInvoice.remainingAmount) + Number(totalInterest) + Number(totalServiceFee);
      const confirmed = window.confirm(
        `تأیید نهایی برنامه تقسیط فاکتور ${selectedInvoice.invoiceNumber}\n` +
        `اصل بدهی: ${formatCurrency(selectedInvoice.remainingAmount, settings.currency)}\n` +
        `بهره: ${formatCurrency(totalInterest, settings.currency)}\n` +
        `کارمزد خدمات: ${formatCurrency(totalServiceFee, settings.currency)}\n` +
        `جمع قابل وصول: ${formatCurrency(total, settings.currency)}\n\n` +
        'با تأیید، برنامه به فاکتور و دفتر کل متصل می‌شود. مالیات برای بهره یا کارمزد به‌صورت خودکار افزوده نمی‌شود.'
      );
      if (!confirmed) return;

      await createInstallmentPlan({
        invoiceId: selectedInvoice.id,
        totalInstallments: Number(totalInstallments),
        firstDueDate,
        totalInterest: Number(totalInterest),
        totalServiceFee: Number(totalServiceFee),
        approvedBy: currentUser?.id || currentUser?.email || ''
      });
      setShowPlanModal(false);
      setNotice(`برنامه ${totalInstallments} قسطی برای فاکتور ${selectedInvoice.invoiceNumber} ثبت و تأیید شد.`);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingPlan(false);
    }
  };

  const openPaymentModal = (installment: Installment) => {
    setPaymentInstallment(installment);
    setPaymentAmount(Math.max(0, installment.amount - installment.paidAmount));
    setPaymentDate(getCurrentJalaliDate());
    setPaymentMethod('cash');
    setBankAccountId('');
    setPaymentError('');
  };

  const handleRecordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentInstallment) return;
    setIsSavingPayment(true);
    setPaymentError('');
    try {
      await recordInstallmentPayment({
        installmentId: paymentInstallment.id,
        amount: Number(paymentAmount),
        paymentMethod,
        bankAccountId: paymentMethod === 'bank' ? bankAccountId : undefined,
        date: paymentDate,
        idempotencyKey: crypto.randomUUID()
      });
      setPaymentInstallment(null);
      setNotice(`دریافت قسط ${paymentInstallment.installmentNumber} در دفتر کل ثبت شد.`);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingPayment(false);
    }
  };

  return (
    <div className="space-y-6" id="installments-module">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">مدیریت اقساط و تعهدات تقسیط‌شده</h2>
          <p className="text-sm text-slate-500">برنامه اقساط فقط برای فاکتور قطعی فروش یا خدمات ثبت می‌شود و هر وصول در دفتر کل درج خواهد شد.</p>
        </div>
        {canManageInstallments && (
          <button
            type="button"
            onClick={openPlanModal}
            disabled={eligibleInvoices.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#76539b] hover:bg-[#60417f] disabled:bg-slate-300 text-white rounded-xl text-sm font-medium shadow-xs"
          >
            <Plus className="w-4 h-4" />
            ایجاد برنامه تقسیط
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="بستن پیام"><X className="h-4 w-4" /></button>
        </div>
      )}
      {canManageInstallments && eligibleInvoices.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          فاکتور قطعی فروش یا خدماتِ دارای مانده و بدون برنامه اقساط برای تقسیط موجود نیست.
        </p>
      )}

      <div className="relative w-full sm:max-w-sm">
        <input
          type="text"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="جستجو بر اساس فاکتور، طرف‌حساب یا سررسید..."
          aria-label="جستجو در اقساط"
          className="w-full pl-9 pr-9 py-2 bg-white border border-[#bde5de] rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-[#76539b]"
        />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} className="absolute left-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600" aria-label="پاک‌کردن جستجو">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full min-w-[880px] text-right border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
              <th className="p-4">قسط / فاکتور</th>
              <th className="p-4">طرف‌حساب</th>
              <th className="p-4">سررسید</th>
              <th className="p-4">مبلغ قسط</th>
              <th className="p-4">وصول‌شده</th>
              <th className="p-4">وضعیت</th>
              <th className="p-4 text-center">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInstallments.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">برنامه یا قسطی برای نمایش وجود ندارد.</td></tr>
            ) : filteredInstallments.map(installment => {
              const remaining = Math.max(0, installment.amount - installment.paidAmount);
              const invoice = invoiceById.get(installment.invoiceId);
              return (
                <tr key={installment.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-4 font-medium text-slate-700">
                    قسط {installment.installmentNumber} از {installment.totalInstallments}
                    <span className="block text-xs text-slate-400">{invoice ? `فاکتور ${invoice.invoiceNumber}` : 'فاکتور مرتبط یافت نشد'}</span>
                  </td>
                  <td className="p-4 font-bold text-slate-800">{installment.clientName}</td>
                  <td className="p-4 text-xs font-mono text-slate-600">{installment.dueDate}</td>
                  <td className="p-4 font-bold text-slate-900">{formatCurrency(installment.amount, settings.currency)}</td>
                  <td className="p-4 text-slate-700">{formatCurrency(installment.paidAmount, settings.currency)}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                      installment.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {installment.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Clock3 className="w-3 h-3 text-amber-500" />}
                      {installment.status === 'paid' ? `تسویه (${installment.paidDate || ''})` : `مانده ${formatCurrency(remaining, settings.currency)}`}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    {canManageInstallments && remaining > 0 && (
                      <button type="button" onClick={() => openPaymentModal(installment)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold">
                        ثبت دریافت
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showPlanModal && (
        <Modal title="تأیید و ایجاد برنامه اقساط" onClose={() => setShowPlanModal(false)}>
          <form onSubmit={handleCreatePlan} className="space-y-4 text-sm">
            <label className="block">
              <span className="block mb-1 font-semibold text-slate-700">فاکتور قطعی فروش یا خدمات *</span>
              <select required value={selectedInvoiceId} onChange={event => setSelectedInvoiceId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5">
                <option value="">انتخاب فاکتور دارای مانده</option>
                {eligibleInvoices.map(invoice => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber} — {invoice.clientName || 'طرف‌حساب'} — مانده: {formatCurrency(invoice.remainingAmount, settings.currency)}
                  </option>
                ))}
              </select>
            </label>
            {selectedInvoice && <InvoicePlanSummary invoice={selectedInvoice} settings={settings} />}

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="block mb-1 font-semibold text-slate-700">تعداد اقساط (۱ تا ۶۰) *</span>
                <input type="number" min={1} max={60} required value={totalInstallments} onChange={event => setTotalInstallments(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 p-2.5" />
              </label>
              <label>
                <span className="block mb-1 font-semibold text-slate-700">اولین سررسید *</span>
                <CalendarJalaliDateInput required value={firstDueDate} onChange={setFirstDueDate} />
              </label>
              <label>
                <span className="block mb-1 font-semibold text-slate-700">مجموع بهره (اختیاری)</span>
                <input type="number" min={0} step="0.01" value={totalInterest} onChange={event => setTotalInterest(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 p-2.5" />
              </label>
              <label>
                <span className="block mb-1 font-semibold text-slate-700">مجموع کارمزد خدمات (اختیاری)</span>
                <input type="number" min={0} step="0.01" value={totalServiceFee} onChange={event => setTotalServiceFee(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 p-2.5" />
              </label>
            </div>
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              ثبت این فرم به‌منزله تأیید مدیر مجاز است. بهره و کارمزد به‌صورت دستی و شفاف تعیین می‌شوند؛ مالیات به‌طور خودکار افزوده نمی‌شود.
            </p>
            {planError && <p role="alert" className="text-sm text-rose-700">{planError}</p>}
            <ModalActions onCancel={() => setShowPlanModal(false)} submitting={isSavingPlan} submitText="تأیید و ثبت برنامه" />
          </form>
        </Modal>
      )}

      {paymentInstallment && (
        <Modal title={`ثبت دریافت قسط ${paymentInstallment.installmentNumber}`} onClose={() => setPaymentInstallment(null)}>
          <form onSubmit={handleRecordPayment} className="space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
              مانده قسط: <strong>{formatCurrency(paymentInstallment.amount - paymentInstallment.paidAmount, settings.currency)}</strong>
            </div>
            <label className="block">
              <span className="block mb-1 font-semibold text-slate-700">مبلغ دریافتی *</span>
              <input type="number" min={0.01} max={paymentInstallment.amount - paymentInstallment.paidAmount} step="0.01" required value={paymentAmount} onChange={event => setPaymentAmount(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 p-2.5" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="block mb-1 font-semibold text-slate-700">روش دریافت *</span>
                <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as 'cash' | 'bank')} className="w-full rounded-xl border border-slate-200 bg-white p-2.5">
                  <option value="cash">صندوق</option>
                  <option value="bank">بانک</option>
                </select>
              </label>
              <label>
                <span className="block mb-1 font-semibold text-slate-700">تاریخ دریافت *</span>
                <CalendarJalaliDateInput required value={paymentDate} onChange={setPaymentDate} />
              </label>
            </div>
            {paymentMethod === 'bank' && (
              <label className="block">
                <span className="block mb-1 font-semibold text-slate-700">حساب بانکی *</span>
                <select required value={bankAccountId} onChange={event => setBankAccountId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2.5">
                  <option value="">انتخاب حساب</option>
                  {bankAccounts.filter(account => account.accountType !== 'cash').map(account => (
                    <option key={account.id} value={account.id}>{account.bankName} — {account.accountNumber}</option>
                  ))}
                </select>
              </label>
            )}
            {paymentError && <p role="alert" className="text-sm text-rose-700">{paymentError}</p>}
            <p className="rounded-lg bg-[#f1eafa] p-3 text-xs text-[#60417f]">وصول جزئی پشتیبانی می‌شود؛ سند دریافت و شناسایی متناسب بهره/کارمزد به‌صورت دوبل در دفتر کل ثبت خواهد شد.</p>
            <ModalActions onCancel={() => setPaymentInstallment(null)} submitting={isSavingPayment} submitText="ثبت دریافت و سند حسابداری" />
          </form>
        </Modal>
      )}
    </div>
  );
};

const InvoicePlanSummary: React.FC<{ invoice: Invoice; settings: ReturnType<typeof useAccounting>['settings'] }> = ({ invoice, settings }) => (
  <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
    <span>مبلغ اصل بدهی</span><strong>{formatCurrency(invoice.remainingAmount, settings.currency)}</strong>
    <span>فاکتور</span><strong>{invoice.invoiceNumber}</strong>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
    <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <CalendarDays className="h-5 w-5 text-[#76539b]" />
        <button type="button" onClick={onClose} aria-label="بستن" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; submitting: boolean; submitText: string }> = ({ onCancel, submitting, submitText }) => (
  <div className="flex justify-end gap-2 border-t pt-4">
    <button type="button" disabled={submitting} onClick={onCancel} className="rounded-xl px-4 py-2 text-slate-500 hover:bg-slate-100">انصراف</button>
    <button type="submit" disabled={submitting} className="rounded-xl bg-[#76539b] px-5 py-2 font-semibold text-white hover:bg-[#60417f] disabled:opacity-60">
      {submitting ? 'در حال ثبت...' : submitText}
    </button>
  </div>
);
