import React, { useState } from 'react';
import { useAccounting } from '../lib/store';
import { formatCurrency } from '../lib/currencyUtils';
import { getAllAccountMoeins } from '../lib/chartOfAccountsData';
import { Plus, Trash2, Landmark, Wallet, AlertCircle } from 'lucide-react';

export const Banks: React.FC = () => {
  const { bankAccounts, settings, addBankAccount, deleteBankAccount } = useAccounting();
  const cashAndBankAccounts = getAllAccountMoeins().filter(account => account.kolCode === '10');
  const isOpeningPeriod = settings.openingPeriodStatus !== 'completed';
  const [showModal, setShowModal] = useState(false);
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash');
  const [bankName, setBankName] = useState('صندوق اصلی');
  const [accountNumber, setAccountNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [accountCode, setAccountCode] = useState('10101');
  const [balance, setBalance] = useState<number>(0);
  const [holderName, setHolderName] = useState(settings.ownerName || '');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || (accountType === 'bank' && !accountNumber.trim())) return;

    try {
      await addBankAccount({
        accountType,
        accountCode,
        accountTitle: cashAndBankAccounts.find(account => account.code === accountCode)?.title,
        bankName: bankName.trim(),
        accountNumber: accountType === 'bank' ? accountNumber.trim() : '',
        cardNumber: accountType === 'bank' ? cardNumber.trim() : '',
        balance: isOpeningPeriod ? Number(balance) || 0 : 0,
        holderName: (holderName || settings.ownerName || '').trim()
      });
      setShowModal(false);
      setBankName(accountType === 'cash' ? 'صندوق اصلی' : 'بانک سامان');
      setAccountNumber('');
      setCardNumber('');
      setBalance(0);
      setAccountCode('10101');
      setHolderName(settings.ownerName);
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const cashAccounts = bankAccounts.filter(account => account.accountType === 'cash');
  const bankAccountsList = bankAccounts.filter(account => account.accountType !== 'cash');
  const totalCash = cashAccounts.reduce((total, account) => total + (Number(account.balance) || 0), 0);
  const totalBank = bankAccountsList.reduce((total, account) => total + (Number(account.balance) || 0), 0);

  const openAccountModal = (type: 'cash' | 'bank') => {
    setAccountType(type);
    setBankName(type === 'cash' ? 'صندوق اصلی' : 'بانک سامان');
    setAccountCode(type === 'cash' ? '10101' : '10102');
    setHolderName(settings.ownerName || '');
    setFormError(null);
    setShowModal(true);
  };

  return (
    <div className="space-y-6" id="banks-module">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">صندوق و حساب‌های بانکی</h2>
          <p className="text-sm text-slate-500">مدیریت موجودی نقد صندوق‌ها و مانده حساب‌های بانکی</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAccountModal('cash')}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-xs"
          >
            <Plus className="w-4 h-4" />
            افزودن صندوق
          </button>
          <button
            type="button"
            onClick={() => openAccountModal('bank')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-xs"
          >
            <Plus className="w-4 h-4" />
            افزودن حساب بانکی
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-600" />صندوق‌ها</h3>
          <span className="text-xs font-bold text-emerald-700">جمع موجودی: {formatCurrency(totalCash, settings.currency)}</span>
        </div>
        {cashAccounts.length === 0 ? (
          <div className="p-5 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-sm text-emerald-800">
            هنوز صندوقی ثبت نشده است. برای ثبت وجه نقد در دسترس، «افزودن صندوق» را انتخاب کنید.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cashAccounts.map(account => (
              <div key={account.id} className="bg-gradient-to-br from-emerald-900 to-emerald-800 text-white p-6 rounded-3xl shadow-lg relative space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-6 h-6 text-emerald-300" />
                    <span className="font-bold text-base">{account.bankName}</span>
                  </div>
                  <button type="button" onClick={() => deleteBankAccount(account.id)} className="text-emerald-200 hover:text-rose-300 p-1" title="حذف صندوق">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-emerald-200">نوع دارایی</p>
                  <p className="font-bold text-lg">وجه نقد صندوق</p>
                  <p className="text-[11px] text-emerald-200 mt-1">
                    حساب دفتر کل: {account.accountCode || '10101'} - {account.accountTitle || 'صندوق ریالی و وجوه نقد'}
                  </p>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-emerald-700 text-xs">
                  <div>
                    <span className="text-emerald-200 block">مسئول صندوق:</span>
                    <span className="font-medium text-white">{account.holderName || '—'}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-emerald-200 block">موجودی:</span>
                    <span className="font-bold text-sm text-emerald-300">{formatCurrency(account.balance, settings.currency)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Landmark className="w-4 h-4 text-blue-600" />حساب‌های بانکی</h3>
          <span className="text-xs font-bold text-blue-700">جمع مانده: {formatCurrency(totalBank, settings.currency)}</span>
        </div>
        {bankAccountsList.length === 0 ? (
          <div className="p-5 bg-blue-50/70 border border-blue-200 rounded-2xl text-sm text-blue-800">
            هنوز حساب بانکی ثبت نشده است. حساب‌های بانکی و کارتخوان‌ها را از «افزودن حساب بانکی» اضافه کنید.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccountsList.map(account => (
              <div key={account.id} className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-3xl shadow-lg relative space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-6 h-6 text-blue-400" />
                    <span className="font-bold text-base">{account.bankName}</span>
                  </div>
                  <button type="button" onClick={() => deleteBankAccount(account.id)} className="text-slate-400 hover:text-rose-400 p-1" title="حذف حساب">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-slate-400">شماره کارت / حساب</p>
                  <p className="font-mono text-lg tracking-widest font-bold text-slate-100">{account.cardNumber || account.accountNumber || '—'}</p>
                  <p className="text-[11px] text-slate-300 mt-1">
                    حساب دفتر کل: {account.accountCode || '10102'} - {account.accountTitle || 'بانک‌ها و حساب‌های جاری ریالی'}
                  </p>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-400 block">صاحب حساب:</span>
                    <span className="font-medium text-slate-200">{account.holderName || '—'}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-slate-400 block">موجودی:</span>
                    <span className="font-bold text-sm text-emerald-400">{formatCurrency(account.balance, settings.currency)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-3">افزودن {accountType === 'cash' ? 'صندوق جدید' : 'حساب بانکی جدید'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setAccountType('cash'); setAccountCode('10101'); setBankName('صندوق اصلی'); }} className={`p-2.5 rounded-xl border font-bold ${accountType === 'cash' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>صندوق نقدی</button>
                <button type="button" onClick={() => { setAccountType('bank'); setAccountCode('10102'); setBankName('بانک سامان'); }} className={`p-2.5 rounded-xl border font-bold ${accountType === 'bank' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>حساب بانکی</button>
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">{accountType === 'cash' ? 'نام صندوق *' : 'نام بانک *'}</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">حساب معین دفتر کل *</label>
                <select
                  required
                  value={accountCode}
                  onChange={event => setAccountCode(event.target.value)}
                  className="w-full p-2.5 bg-slate-50 border rounded-xl"
                >
                  {cashAndBankAccounts
                    .filter(account =>
                      account.code === (accountType === 'cash' ? '10101' : '10102') ||
                      (!account.isSystem && account.code !== (accountType === 'cash' ? '10102' : '10101'))
                    )
                    .map(account => (
                    <option key={account.code} value={account.code}>
                      {account.code} - {account.title}
                    </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  برای تفکیک کاردکس هر بانک یا صندوق، حساب معین جداگانه انتخاب کنید.
                </p>
              </div>

              {accountType === 'bank' && (
                <>
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">شماره حساب *</label>
                    <input type="text" required value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono" />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">شماره کارت (۱۶ رقم)</label>
                    <input type="text" value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="6037-...." className="w-full p-2.5 bg-slate-50 border rounded-xl font-mono" />
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold text-slate-600 block mb-1">{accountType === 'cash' ? 'مسئول صندوق' : 'صاحب حساب'}</label>
                <input
                  type="text"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  required
                  className="w-full p-2.5 bg-slate-50 border rounded-xl"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  نام مسئول / دارنده را ثبت کنید (فارسی یا انگلیسی). به صورت پیش‌فرض نام صاحب کسب‌وکار از تنظیمات وارد می‌شود و قابل تغییر است.
                </p>
              </div>

              {isOpeningPeriod ? (
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">مانده {accountType === 'cash' ? 'صندوق' : 'حساب'} در اول دوره</label>
                  <input type="number" min="0" value={balance || ''} onChange={e => setBalance(Number(e.target.value))} placeholder="۰" className="w-full p-2.5 bg-slate-50 border rounded-xl" />
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  مانده اولیه صفر است؛ تغییر مانده {accountType === 'cash' ? 'صندوق' : 'بانک'} باید با سند دریافت، پرداخت یا انتقال ثبت شود.
                </p>
              )}

              {formError && (
                <div role="alert" className="flex items-start gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
                >
                  افزودن حساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
