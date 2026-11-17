/**
 * PoC: اثبات نقص مقایسه lexicographic تاریخ در trialBalanceEngine
 * Run: npx tsx scripts/poc-date-comparison.ts
 */
import { computeMultiColumnTrialBalance } from '../src/lib/trialBalanceEngine';
import { AccountingEntry } from '../src/types';

function mkEntry(date: string, debit: number, credit: number): AccountingEntry {
  return {
    id: 'e-' + Math.random(),
    tenantId: 't1',
    documentNumber: 'DOC-INV-1',
    date,
    description: 'test',
    accountCode: '10201',
    accountTitle: 'دریافتنی',
    debit,
    credit,
    clientId: 'c1',
    created_at: new Date().toISOString()
  } as AccountingEntry;
}

const START = '1405/01/01'; // ASCII, as produced by JalaliDateInput
const END = '1405/12/31';   // ASCII, as typed by user in the trial-balance filter

console.log('=== سناریو ۱: تاریخ‌های فارسی غیرقالب‌بندی‌شده (مسیر پیش‌فرض فرم) ===');
// new Date().toLocaleDateString('fa-IR') => "۱۴۰۵/۷/۲۷" (Persian digits, NOT zero-padded)
const persianDates = ['۱۴۰۵/۷/۲۷', '۱۴۰۵/۹/۱۵', '۱۴۰۵/۱۰/۱', '۱۴۰۵/۱۲/۲۸'];
const persianEntries = persianDates.map((d, i) => mkEntry(d, 1000 * (i + 1), 0));
persianEntries.push(mkEntry('۱۴۰۵/۱۲/۲۸', 0, 1000 * persianDates.length));

const r1 = computeMultiColumnTrialBalance({
  entries: persianEntries,
  mode: '4_col',
  level: 'moein',
  startDate: START,
  endDate: END
});
console.log('تاریخ‌های ورودی :', persianDates.join('  '));
console.log('جمع بدهکار طی دوره (انتظار 10000):', r1.totals.periodDebit);
console.log('جمع بستانکار طی دوره (انتظار 4000):', r1.totals.periodCredit);
console.log('isBalanced:', r1.isBalanced, '| difference:', r1.difference);
console.log(
  r1.totals.periodDebit === 10000
    ? '✅ درست'
    : '❌ آرتیکل‌ها از تراز آزمایشی طی دوره حذف/دسته‌بندی نادرست شدند'
);

console.log('\n=== سناریو ۲: ترتیب‌دهی اشتباه ماه‌ها (مقایسه بدون zero-padding) ===');
const july = '۱۴۰۵/۷/۲۷';
const october = '۱۴۰۵/۱۰/۱';
console.log(`"${july}" < "${october}" ->`, july < october, '(انتظار: true چون تیر/مرداد قبل از مهر است)');

console.log('\n=== سناریو ۳: اختلاط سیستم ارقام (فارسی در برابر لاتین) ===');
const mixedA = '۱۴۰۵/۰۱/۰۱'; // فارسی
const mixedB = '1405/12/31';  // لاتین
console.log(`"${mixedA}" < "${mixedB}" ->`, mixedA < mixedB, '(انتظار: true — اولی خیلی زودتر است)');

console.log('\n=== سناریو ۴: گارد تراز کردکار — تفاوت زیر ۱ ریال پنهان می‌شود ===');
const kernel = await import('../src/lib/accountingKernel');
const entries = [
  mkEntry('1405/01/01', 100.4, 0),
  mkEntry('1405/01/01', 0, 99.6)
];
try {
  kernel.HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(entries, 'DOC-TEST');
  console.log('❌ گارد تراز، انحراف ۰.۸ ریالی را عبور داد (Math.round هر طرف جداگانه)');
} catch (e) {
  console.log('✅ گارد تراز انحراف را گرفت:', (e as Error).message);
}
