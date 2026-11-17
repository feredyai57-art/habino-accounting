#!/usr/bin/env tsx
/**
 * اسکریپت اجرای تست خودکار سناریوهای حسابداری، پروژه‌ها و حقوق و دستمزد هابینو
 * Habino Accounting Automated Scenario Test Runner (CLI)
 * 
 * نحوه اجرا:
 * npm run test:accounting
 * یا
 * npx tsx scripts/run-accounting-tests.ts
 */

import { AccountingAutomatedTestEngine } from '../src/lib/accountingAutomatedTestEngine';
import { HabinoAccountingKernel } from '../src/lib/accountingKernel';
import { HabinoAtomicTransactionWrapper } from '../src/lib/atomicTransactionWrapper';
import { getClientLedgerSummary } from '../src/lib/clientLedger';
import { getEntriesWithRunningBalance } from '../src/lib/ledgerBalances';
import {
  hasFinancialRecordsNotSafelyOlderThan,
  mergeCloudAccountingEntriesWithLocal,
  mergeCloudClientsWithLocal,
  getInvoiceAccountingEntries,
  mergeCloudInvoicesWithLocal,
  resolveInvoiceTenantId
} from '../src/lib/invoiceSync';
import { fetchAllSupabasePages } from '../src/lib/supabasePagination';
import {
  isClientOutboxUpdateStale,
  normalizeSupabaseClientRow,
  resolveClientCreditFields,
  SupabaseSyncEngine
} from '../src/lib/supabaseSyncEngine';
import { OutboxItem, retainLatestClientOutboxItems } from '../src/lib/offlineOutboxQueue';
import { Client, Invoice } from '../src/types';
import { applyInvoiceWideDiscount, calculateItemTotal, calculateSubtotal, calculateTotalDiscount, calculateTotalTax } from '../src/lib/calculations';
import {
  calculateAccountingCycle,
  calculateSalesOutputVat
} from '../src/lib/financialAccountingEngine';
import { HabinoJsonbSchemaValidator } from '../src/lib/jsonbSchemaValidator';
import { isModuleRelevantToGuild } from '../src/lib/moduleVisibility';

// رنگ‌های خروجی کنسول ANSI
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m'
};

console.log('\n' + colors.cyan + colors.bright + '========================================================================================' + colors.reset);
console.log(colors.cyan + colors.bright + '      موتور تست و ممیزی خودکار سناریوهای حسابداری، پروژه‌ها و حقوق دستمزد هابینو         ' + colors.reset);
console.log(colors.cyan + colors.bright + '========================================================================================' + colors.reset);
console.log(colors.dim + 'مرجع یکپارچه: قوانین ۹‌گانه مالی، قانون کار ایران ماده ۸۴، ماده ۳۸ تأمین اجتماعی و GAAP/IFRS\n' + colors.reset);

const startTime = Date.now();
const result = AccountingAutomatedTestEngine.runAllScenarios();
const totalTime = Date.now() - startTime;

console.log(colors.bright + 'فهرست نتایج اجرای سناریوهای تست خودکار:' + colors.reset);
console.log('----------------------------------------------------------------------------------------');

result.scenarios.forEach((sc, index) => {
  const statusIcon = sc.status === 'passed' ? `${colors.green}✔ قبول${colors.reset}` : `${colors.red}✖ مردود${colors.reset}`;
  const numStr = (index + 1).toString().padStart(2, ' ');
  const timeStr = `${sc.executionTimeMs}ms`.padStart(6, ' ');
  const categoryTag = `[${sc.categoryFa}]`.padEnd(25, ' ');
  
  console.log(`${colors.bright}${numStr}.${colors.reset} ${statusIcon} ${colors.yellow}${timeStr}${colors.reset} | ${colors.blue}${categoryTag}${colors.reset} | ${sc.title}`);
  
  if (sc.status === 'failed') {
    console.log(`   ${colors.red}خطا: ${sc.actualOutcome}${colors.reset}`);
  }
  
  if (sc.mathDetails && sc.mathDetails.formulaNotes.length > 0) {
    const firstNote = sc.mathDetails.formulaNotes[0];
    console.log(`   ${colors.dim}↳ ${firstNote}${colors.reset}`);
  }
});

console.log('----------------------------------------------------------------------------------------');
console.log('\n' + colors.bright + 'خلاصه شاخص‌های ریاضی و تراز آزمایشی:' + colors.reset);
console.log(` • کل سناریوهای ارزیابی‌شده: ${colors.cyan}${result.totalScenarios}${colors.reset}`);
console.log(` • سناریوهای موفق:          ${colors.green}${result.passedScenarios}${colors.reset}`);
console.log(` • سناریوهای ناموفق:        ${result.failedScenarios > 0 ? colors.red : colors.green}${result.failedScenarios}${colors.reset}`);
console.log(` • درصد قبولی (Pass Rate):   ${colors.green}${colors.bright}${result.passRatePercent}%${colors.reset}`);
console.log(` • تعداد کل آرتیکل‌های دوبل: ${colors.cyan}${result.totalEntriesEvaluated} ردیف سند${colors.reset}`);
console.log(` • مجموع گردش بدهکار:        ${colors.yellow}${result.totalDebitSum.toLocaleString('fa-IR')} ریال${colors.reset}`);
console.log(` • مجموع گردش بستانکار:      ${colors.yellow}${result.totalCreditSum.toLocaleString('fa-IR')} ریال${colors.reset}`);
console.log(` • اختلاف ریالی (تراز بودن): ${result.totalDiscrepancyRial === 0 ? colors.green + '۰ ریال (کاملاً متوازن)' : colors.red + result.totalDiscrepancyRial.toLocaleString('fa-IR') + ' ریال'}${colors.reset}`);
console.log(` • تراز آزمایشی ۶ ستونی:     ${result.allTrialBalancesBalanced ? colors.green + 'تایید ریاضی ۱۰۰٪ (Zero Discrepancy)' : colors.red + 'دارای ناترازی!'}${colors.reset}`);
console.log(` • شناسه گواهی ممیزی:        ${colors.magenta}${result.certificateHash}${colors.reset}`);
console.log(` • زمان کل پردازش:           ${colors.cyan}${result.totalExecutionTimeMs} میلی‌ثانیه${colors.reset}\n`);

// 🛡️ آزمون‌های منفی اعتبارسنجی مقادیر عددی (مصوب بنیانگذار مهندس فرید تهرانی)
console.log(colors.bright + 'آزمون‌های منفی اعتبارسنجی مقادیر عددی و ممانعت از ارقام نامعتبر (Strict Numeric Invariant):' + colors.reset);

let strictChecksPassed = true;

// 1. آزمون رد NaN
try {
  HabinoAccountingKernel.assertDoubleEntryBalanceInvariant([
    { id: '1', documentNumber: 'DOC-TEST-1', date: '1403/01/01', accountCode: '10101', accountTitle: 'صندوق', debit: NaN, credit: 0, description: 'تست NaN', clientName: 'مشتری' },
    { id: '2', documentNumber: 'DOC-TEST-1', date: '1403/01/01', accountCode: '40101', accountTitle: 'درآمد', debit: 0, credit: NaN, description: 'تست NaN', clientName: 'مشتری' }
  ], 'TEST-NAN');
  console.log(`${colors.red}✖ خطای رد نشدن NaN${colors.reset}`);
  strictChecksPassed = false;
} catch (e: any) {
  if (e.message.includes('غیرعددی یا نامعتبر (NaN/Infinity)')) {
    console.log(`${colors.green}✔ رد موفق آرتیکل با مقدار NaN (عدم تبدیل خاموش به صفر)${colors.reset}`);
  } else {
    console.log(`${colors.red}✖ خطای غیرمنتظره در تست NaN: ${e.message}${colors.reset}`);
    strictChecksPassed = false;
  }
}

// 2. آزمون رد مبالغ منفی
try {
  HabinoAccountingKernel.assertDoubleEntryBalanceInvariant([
    { id: '1', documentNumber: 'DOC-TEST-2', date: '1403/01/01', accountCode: '10101', accountTitle: 'صندوق', debit: -50000, credit: 0, description: 'تست منفی', clientName: 'مشتری' },
    { id: '2', documentNumber: 'DOC-TEST-2', date: '1403/01/01', accountCode: '40101', accountTitle: 'درآمد', debit: 0, credit: -50000, description: 'تست منفی', clientName: 'مشتری' }
  ], 'TEST-NEGATIVE');
  console.log(`${colors.red}✖ خطای رد نشدن مبالغ منفی${colors.reset}`);
  strictChecksPassed = false;
} catch (e: any) {
  if (e.message.includes('مبلغ منفی است')) {
    console.log(`${colors.green}✔ رد موفق آرتیکل با مبالغ منفی (ممنوعیت ارقام منفی در دفاتر دوبل)${colors.reset}`);
  } else {
    console.log(`${colors.red}✖ خطای غیرمنتظره در تست ارقام منفی: ${e.message}${colors.reset}`);
    strictChecksPassed = false;
  }
}

// 3. آزمون رد فیلد Null
try {
  HabinoAccountingKernel.assertDoubleEntryBalanceInvariant([
    { id: '1', documentNumber: 'DOC-TEST-3', date: '1403/01/01', accountCode: '10101', accountTitle: 'صندوق', debit: null as any, credit: 0, description: 'تست Null', clientName: 'مشتری' },
    { id: '2', documentNumber: 'DOC-TEST-3', date: '1403/01/01', accountCode: '40101', accountTitle: 'درآمد', debit: 0, credit: 50000, description: 'تست Null', clientName: 'مشتری' }
  ], 'TEST-NULL');
  console.log(`${colors.red}✖ خطای رد نشدن مقدار Null${colors.reset}`);
  strictChecksPassed = false;
} catch (e: any) {
  if (e.message.includes('تهی (null/undefined)')) {
    console.log(`${colors.green}✔ رد موفق آرتیکل با فیلد Null / Undefined${colors.reset}`);
  } else {
    console.log(`${colors.red}✖ خطای غیرمنتظره در تست Null: ${e.message}${colors.reset}`);
    strictChecksPassed = false;
  }
}

// 4. آزمون رد آرتیکل با بدهکار و بستانکار هر دو صفر
try {
  HabinoAccountingKernel.assertDoubleEntryBalanceInvariant([
    { id: '1', documentNumber: 'DOC-TEST-4', date: '1403/01/01', accountCode: '10101', accountTitle: 'صندوق', debit: 0, credit: 0, description: 'تست صفر', clientName: 'مشتری' },
    { id: '2', documentNumber: 'DOC-TEST-4', date: '1403/01/01', accountCode: '40101', accountTitle: 'درآمد', debit: 0, credit: 0, description: 'تست صفر', clientName: 'مشتری' }
  ], 'TEST-ZERO');
  console.log(`${colors.red}✖ خطای رد نشدن آرتیکل بدون گردش${colors.reset}`);
  strictChecksPassed = false;
} catch (e: any) {
  if (e.message.includes('فاقد گردش است')) {
    console.log(`${colors.green}✔ رد موفق آرتیکل بدون گردش مالی (بدهکار و بستانکار صفر)${colors.reset}`);
  } else {
    console.log(`${colors.red}✖ خطای غیرمنتظره در تست صفر: ${e.message}${colors.reset}`);
    strictChecksPassed = false;
  }
}

// 5. مانده اول دوره باید از گردش فاکتور جدا بماند و هنگام تطبیق بازسازی نشود
const openingBalanceClient: Client = {
  id: 'client-opening-balance-regression',
  name: 'آزمون مانده اول دوره',
  balance: 26_500_000
};
const openingBalanceInvoice: Invoice = {
  id: 'invoice-opening-balance-regression',
  invoiceNumber: 'OPENING-REGRESSION',
  clientId: openingBalanceClient.id,
  clientName: openingBalanceClient.name,
  type: 'sale',
  status: 'pending',
  template: 'professional',
  date: '1405/01/02',
  items: [],
  subtotal: 13_050_000,
  totalDiscount: 0,
  totalTax: 1_450_000,
  grandTotal: 14_500_000,
  amountPaid: 0,
  remainingAmount: 14_500_000
};
const openingBalanceEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
  { ...openingBalanceClient, balance: 12_000_000 },
  'tenant-opening-balance-regression'
);
const renamedOpeningClient = HabinoAtomicTransactionWrapper.atomicUpdateClient(
  {
    invoices: [openingBalanceInvoice],
    accountingEntries: openingBalanceEntries,
    clients: [openingBalanceClient],
    transactions: [],
    installments: [],
    checks: [],
    projects: [],
    inventory: []
  },
  openingBalanceClient.id,
  { name: 'نام جدید آزمون مانده اول دوره' },
  'tenant-opening-balance-regression'
);
const renamedOpeningDebit = renamedOpeningClient.nextState.accountingEntries
  .filter(entry => entry.documentNumber?.startsWith('DOC-OPN') && entry.accountCode === '10201')
  .reduce((total, entry) => total + entry.debit, 0);
const invoiceLedgerEntries = HabinoAccountingKernel.createDoubleEntryForInvoice(
  openingBalanceInvoice,
  'tenant-opening-balance-regression'
);
const syncScopedInvoiceEntries = getInvoiceAccountingEntries(
  [
    ...openingBalanceEntries,
    ...invoiceLedgerEntries,
    {
      ...invoiceLedgerEntries[0],
      id: 'different-tenant-entry',
      tenantId: 'tenant-other',
      referenceId: undefined
    }
  ],
  openingBalanceInvoice,
  'tenant-opening-balance-regression'
);
const tenantResolvedFromAllView = resolveInvoiceTenantId({
  isSuperAdmin: true,
  activeTenantId: 'all',
  userTenantId: 'tenant-main',
  clientTenantId: 'tenant-preview',
  invoiceTenantId: 'all'
});
const tenantResolvedForRegularUser = resolveInvoiceTenantId({
  isSuperAdmin: false,
  activeTenantId: 'all',
  userTenantId: 'tenant-preview',
  clientTenantId: 'tenant-other'
});
const clientLedgerSummary = getClientLedgerSummary(
  [...openingBalanceEntries, ...invoiceLedgerEntries],
  openingBalanceClient.id
);
const normalizedClientWithCredit = normalizeSupabaseClientRow({
  id: 'client-credit-round-trip',
  tenant_id: 'tenant-credit-regression',
  name: 'مخاطب آزمون',
  credit_limit: 75_000_000,
  is_blocked_for_credit: true
}, 'tenant-fallback');
const normalizedClientWithCreditMetadata = normalizeSupabaseClientRow({
  id: 'client-credit-metadata-round-trip',
  tenant_id: 'tenant-credit-regression',
  name: 'مخاطب آزمون متادیتا',
  credit_limit: 0,
  is_blocked_for_credit: false,
  metadata: {
    habino_credit_limit: 45_000_000,
    habino_is_blocked_for_credit: true
  }
}, 'tenant-fallback');
const normalizedClientWithConflictingCreditMetadata = normalizeSupabaseClientRow({
  id: 'client-credit-conflicting-metadata-round-trip',
  tenant_id: 'tenant-credit-regression',
  name: 'مخاطب آزمون با متادیتای قدیمی',
  credit_limit: 80_000_000,
  metadata: {
    habino_credit_limit: 0
  }
}, 'tenant-fallback');
const normalizedClientWithLegacyCreditMetadata = normalizeSupabaseClientRow({
  id: 'client-credit-legacy-metadata-round-trip',
  tenant_id: 'tenant-credit-regression',
  name: 'مخاطب آزمون متادیتای قدیمی',
  credit_limit: 0,
  is_blocked_for_credit: false,
  metadata: {
    credit_limit: 30_000_000,
    is_blocked_for_credit: true
  }
}, 'tenant-fallback');
const normalizedClientWithMetadataOnlyCredit = normalizeSupabaseClientRow({
  id: 'client-credit-metadata-only-round-trip',
  tenant_id: 'tenant-credit-regression',
  name: 'مخاطب آزمون فقط متادیتا',
  metadata: {
    habino_credit_limit: 55_000_000
  }
}, 'tenant-fallback');
const locallySavedCreditClient: Client = {
  id: 'client-refresh-credit-regression',
  tenantId: 'tenant-credit-regression',
  name: 'مخاطب با سقف محلی',
  creditLimit: 70_000_000,
  isBlockedForCredit: true,
  metadata: { habino_credit_limit: 70_000_000 }
};
const zeroCreditCloudClient: Client = {
  ...locallySavedCreditClient,
  creditLimit: 0,
  isBlockedForCredit: false,
  metadata: { habino_credit_limit: 0 }
};
const mergedClientAfterRefresh = mergeCloudClientsWithLocal(
  [locallySavedCreditClient],
  [zeroCreditCloudClient],
  'tenant-credit-regression'
)[0];
const mergedClientWithAuthoritativeCredit = mergeCloudClientsWithLocal(
  [locallySavedCreditClient],
  [{ ...zeroCreditCloudClient, creditLimit: 85_000_000 }],
  'tenant-credit-regression'
)[0];
const preservedRemoteCreditFields = resolveClientCreditFields(
  { id: 'client-partial-update', name: 'ویرایش جزئی' },
  {
    id: 'client-partial-update',
    tenant_id: 'tenant-credit-regression',
    credit_limit: 65_000_000,
    is_blocked_for_credit: true,
    metadata: {}
  },
  'tenant-credit-regression'
);
const explicitCreditLimitReset = resolveClientCreditFields(
  { id: 'client-explicit-reset', name: 'حذف سقف', creditLimit: 0 },
  {
    id: 'client-explicit-reset',
    tenant_id: 'tenant-credit-regression',
    credit_limit: 65_000_000,
    metadata: {}
  },
  'tenant-credit-regression'
);
const queuedOldClientUpdate: OutboxItem<Client> = {
  id: 'outbox-client-old',
  type: 'client',
  tenantId: 'tenant-credit-regression',
  payload: { id: 'client-queued-regression', name: 'مخاطب قدیمی', creditLimit: 0 },
  createdAt: 100,
  status: 'pending',
  attempts: 0,
  maxAttempts: 5
};
const queuedLatestClientUpdate: OutboxItem<Client> = {
  ...queuedOldClientUpdate,
  id: 'outbox-client-latest',
  payload: { id: 'client-queued-regression', name: 'مخاطب جدید', creditLimit: 90_000_000 },
  createdAt: 200
};
const retainedClientOutbox = retainLatestClientOutboxItems([
  queuedLatestClientUpdate,
  queuedOldClientUpdate
]);
const staleClientOutboxIsSkipped = isClientOutboxUpdateStale(
  { habino_client_sync_at: new Date(queuedOldClientUpdate.createdAt + 1).toISOString() },
  queuedOldClientUpdate.createdAt
);
const freshClientOutboxIsRetained = !isClientOutboxUpdateStale(
  { habino_client_sync_at: new Date(queuedOldClientUpdate.createdAt - 1).toISOString() },
  queuedOldClientUpdate.createdAt
);
const legacyUpdatedAtDoesNotSkipQueuedClient = !isClientOutboxUpdateStale(
  { updated_at: new Date(queuedOldClientUpdate.createdAt + 60_000).toISOString() },
  queuedOldClientUpdate.createdAt
);
const guildModuleVisibilityPasses =
  isModuleRelevantToGuild('projects', 'contracting') &&
  isModuleRelevantToGuild('projects', 'commercial') &&
  isModuleRelevantToGuild('invoices', 'commercial') &&
  !isModuleRelevantToGuild('barcode_scanner', 'services');
const locallySavedInvoice: Invoice = {
  ...openingBalanceInvoice,
  id: 'invoice-local-unsynced',
  invoiceNumber: 'LOCAL-UNSYNCED',
  tenantId: 'tenant-opening-balance-regression'
};
const unrelatedTenantInvoice: Invoice = {
  ...openingBalanceInvoice,
  id: 'invoice-other-tenant',
  invoiceNumber: 'OTHER-TENANT',
  tenantId: 'tenant-other'
};
const emptyCloudInvoiceMerge = mergeCloudInvoicesWithLocal(
  [locallySavedInvoice, unrelatedTenantInvoice],
  [],
  'tenant-opening-balance-regression'
);
const retainedLedgerAfterCloudFailure = mergeCloudAccountingEntriesWithLocal(
  invoiceLedgerEntries,
  undefined
);
const authoritativeEmptyCloudLedger = mergeCloudAccountingEntriesWithLocal(
  invoiceLedgerEntries,
  []
);
const emptyCloudLedgerWithNoLocalRecords = mergeCloudAccountingEntriesWithLocal([], []);
const postResetFinancialRecordsPreserved = hasFinancialRecordsNotSafelyOlderThan(
  [{ created_at: '2026-10-23T12:00:00.000Z' }],
  '2026-10-23T11:59:00.000Z'
);
const undatedFinancialRecordsPreserved = hasFinancialRecordsNotSafelyOlderThan(
  [{ created_at: undefined }],
  '2026-10-23T11:59:00.000Z'
);
const preResetFinancialRecordsCanBePurged = !hasFinancialRecordsNotSafelyOlderThan(
  [{ created_at: '2026-10-23T11:58:00.000Z' }],
  '2026-10-23T11:59:00.000Z'
);
const originalWindow = (globalThis as any).window;
const originalLocalStorage = (globalThis as any).localStorage;
const resetStorage = new Map<string, string>([
  ['habino_pnl_purged_for_testing_v2', 'true'],
  ['habino_factory_reset_completed', '2026-10-23T11:59:00.000Z']
]);
(globalThis as any).window = {};
(globalThis as any).localStorage = { getItem: (key: string) => resetStorage.get(key) || null };
const resetMarkerInvoiceMerge = mergeCloudInvoicesWithLocal(
  [{ ...locallySavedInvoice, created_at: '2026-10-23T12:00:00.000Z' }],
  [],
  'tenant-opening-balance-regression'
);
const resetMarkerLedgerMerge = mergeCloudAccountingEntriesWithLocal(
  invoiceLedgerEntries.map(entry => ({ ...entry, created_at: '2026-10-23T12:00:00.000Z' })),
  [],
  'tenant-opening-balance-regression'
);
const partialCloudLedgerMerge = mergeCloudAccountingEntriesWithLocal(
  [{ ...invoiceLedgerEntries[0], id: 'local-opening-entry', documentNumber: 'DOC-OPN-LOCAL', created_at: '2026-10-23T12:00:00.000Z' }],
  [{ ...invoiceLedgerEntries[1], id: 'remote-ledger-entry', created_at: '2026-10-23T12:00:00.000Z' }],
  'tenant-opening-balance-regression'
);
if (originalWindow === undefined) delete (globalThis as any).window;
else (globalThis as any).window = originalWindow;
if (originalLocalStorage === undefined) delete (globalThis as any).localStorage;
else (globalThis as any).localStorage = originalLocalStorage;
const paginatedRows = await fetchAllSupabasePages(async (from, to) => {
  const rows = Array.from({ length: 2501 }, (_, index) => index).slice(from, to + 1);
  return { data: rows, error: null };
});
const failedPageResult = await fetchAllSupabasePages(async (from) => (
  from === 0
    ? { data: [1, 2], error: null }
    : { data: null, error: { message: 'temporary network error' } }
), 2);
const partiallySyncedInvoiceMerge = mergeCloudInvoicesWithLocal(
  [locallySavedInvoice, unrelatedTenantInvoice],
  [{
    ...openingBalanceInvoice,
    id: 'invoice-cloud-existing',
    invoiceNumber: 'CLOUD-EXISTING',
    tenantId: 'tenant-opening-balance-regression'
  }],
  'tenant-opening-balance-regression'
);
const independentAccountBalances = getEntriesWithRunningBalance([
  {
    id: 'ar-opening',
    documentNumber: 'OPENING',
    date: '1405/01/01',
    description: 'مانده افتتاحیه دریافتنی',
    accountCode: '10201',
    accountTitle: 'دریافتنی',
    debit: 12_000_000,
    credit: 0
  },
  {
    id: 'revenue',
    documentNumber: 'INVOICE',
    date: '1405/01/02',
    description: 'درآمد فاکتور',
    accountCode: '40101',
    accountTitle: 'درآمد',
    debit: 0,
    credit: 14_500_000
  },
  {
    id: 'ar-invoice',
    documentNumber: 'INVOICE',
    date: '1405/01/02',
    description: 'مطالبه فاکتور',
    accountCode: '10201',
    accountTitle: 'دریافتنی',
    debit: 14_500_000,
    credit: 0
  }
]);
const reconciledOpening = SupabaseSyncEngine.reconcileLedgerAndOpeningBalances(
  {
    clients: [openingBalanceClient],
    inventory: [],
    bankAccounts: [],
    accountingEntries: [...openingBalanceEntries, ...invoiceLedgerEntries],
    invoices: [openingBalanceInvoice]
  },
  'tenant-opening-balance-regression'
);
const reconciledOpeningDebit = reconciledOpening.reconciledEntries
  .filter(entry => entry.documentNumber?.startsWith('DOC-OPN') && entry.accountCode === '10201')
  .reduce((total, entry) => total + entry.debit, 0);
const receivablesLedgerBalance = reconciledOpening.reconciledEntries
  .filter(entry => entry.accountCode === '10201')
  .reduce((total, entry) => total + entry.debit - entry.credit, 0);
const openingOnlySummary = HabinoAccountingKernel.createOpeningBalanceSheetSummary({
  clients: [openingBalanceClient],
  inventory: [],
  bankAccounts: [],
  entries: reconciledOpening.reconciledEntries
});
const repairedCorruptOpening = SupabaseSyncEngine.reconcileLedgerAndOpeningBalances(
  {
    clients: [openingBalanceClient],
    inventory: [],
    bankAccounts: [],
    accountingEntries: [
      ...HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
        openingBalanceClient,
        'tenant-opening-balance-regression'
      ),
      ...invoiceLedgerEntries
    ],
    invoices: [openingBalanceInvoice]
  },
  'tenant-opening-balance-regression'
);
const repairedCorruptOpeningDebit = repairedCorruptOpening.reconciledEntries
  .filter(entry => entry.documentNumber?.startsWith('DOC-OPN') && entry.accountCode === '10201')
  .reduce((total, entry) => total + entry.debit, 0);
const recoveredMissingOpening = SupabaseSyncEngine.reconcileLedgerAndOpeningBalances(
  {
    clients: [openingBalanceClient],
    inventory: [],
    bankAccounts: [],
    accountingEntries: invoiceLedgerEntries,
    invoices: [openingBalanceInvoice]
  },
  'tenant-opening-balance-regression'
);
const recoveredOpeningDebit = recoveredMissingOpening.reconciledEntries
  .filter(entry => entry.documentNumber?.startsWith('DOC-OPN') && entry.accountCode === '10201')
  .reduce((total, entry) => total + entry.debit, 0);

if (
  renamedOpeningDebit === 12_000_000 &&
  renamedOpeningClient.nextState.accountingEntries.some(entry =>
    entry.documentNumber?.startsWith('DOC-OPN') &&
    entry.description.includes('نام جدید آزمون مانده اول دوره')
  ) &&
  reconciledOpeningDebit === 12_000_000 &&
  receivablesLedgerBalance === 26_500_000 &&
  openingOnlySummary.totalReceivables === 12_000_000 &&
  clientLedgerSummary.totalDebit === 26_500_000 &&
  clientLedgerSummary.totalCredit === 0 &&
  clientLedgerSummary.balance === 26_500_000 &&
  normalizedClientWithCredit.creditLimit === 75_000_000 &&
  normalizedClientWithCredit.isBlockedForCredit === true &&
  normalizedClientWithCreditMetadata.creditLimit === 45_000_000 &&
  normalizedClientWithCreditMetadata.isBlockedForCredit === true &&
  normalizedClientWithConflictingCreditMetadata.creditLimit === 80_000_000 &&
  normalizedClientWithLegacyCreditMetadata.creditLimit === 30_000_000 &&
  normalizedClientWithLegacyCreditMetadata.isBlockedForCredit === true &&
  normalizedClientWithMetadataOnlyCredit.creditLimit === 55_000_000 &&
  mergedClientAfterRefresh.creditLimit === 70_000_000 &&
  mergedClientAfterRefresh.isBlockedForCredit === true &&
  mergedClientWithAuthoritativeCredit.creditLimit === 85_000_000 &&
  preservedRemoteCreditFields.creditLimit === 65_000_000 &&
  preservedRemoteCreditFields.isBlockedForCredit === true &&
  explicitCreditLimitReset.creditLimit === 0 &&
  retainedClientOutbox.length === 1 &&
  retainedClientOutbox[0].id === queuedLatestClientUpdate.id &&
  staleClientOutboxIsSkipped &&
  freshClientOutboxIsRetained &&
  legacyUpdatedAtDoesNotSkipQueuedClient &&
  guildModuleVisibilityPasses &&
  syncScopedInvoiceEntries.length === invoiceLedgerEntries.length &&
  syncScopedInvoiceEntries.every(entry => entry.documentNumber.startsWith('DOC-INV-')) &&
  tenantResolvedFromAllView === 'tenant-preview' &&
  tenantResolvedForRegularUser === 'tenant-preview' &&
  independentAccountBalances.find(entry => entry.id === 'revenue')?.runningBalance === 14_500_000 &&
  independentAccountBalances.find(entry => entry.id === 'ar-invoice')?.runningBalance === 26_500_000 &&
  emptyCloudInvoiceMerge.length === 2 &&
  retainedLedgerAfterCloudFailure === invoiceLedgerEntries &&
  authoritativeEmptyCloudLedger === invoiceLedgerEntries &&
  emptyCloudLedgerWithNoLocalRecords.length === 0 &&
  postResetFinancialRecordsPreserved &&
  undatedFinancialRecordsPreserved &&
  preResetFinancialRecordsCanBePurged &&
  resetMarkerInvoiceMerge.some(invoice => invoice.id === locallySavedInvoice.id) &&
  resetMarkerLedgerMerge.length === invoiceLedgerEntries.length &&
  partialCloudLedgerMerge.some(entry => entry.id === 'local-opening-entry') &&
  partialCloudLedgerMerge.some(entry => entry.id === 'remote-ledger-entry') &&
  paginatedRows.data?.length === 2501 &&
  failedPageResult.data === null &&
  failedPageResult.error?.message === 'temporary network error' &&
  emptyCloudInvoiceMerge.some(invoice => invoice.id === locallySavedInvoice.id) &&
  emptyCloudInvoiceMerge.some(invoice => invoice.id === unrelatedTenantInvoice.id) &&
  partiallySyncedInvoiceMerge.length === 3 &&
  partiallySyncedInvoiceMerge.some(invoice => invoice.id === locallySavedInvoice.id) &&
  partiallySyncedInvoiceMerge.some(invoice => invoice.id === unrelatedTenantInvoice.id) &&
  partiallySyncedInvoiceMerge.some(invoice => invoice.id === 'invoice-cloud-existing') &&
  repairedCorruptOpeningDebit === 12_000_000 &&
  recoveredOpeningDebit === 12_000_000
) {
  console.log(`${colors.green}✔ حفاظت از اسناد محلی در همگام‌سازی خالی و جلوگیری از پاکسازی داده‌های مالی جدید پس از ریست${colors.reset}`);
} else {
  console.log(`${colors.red}✖ خطا در جداسازی مانده اول دوره از گردش فاکتور${colors.reset}`);
  strictChecksPassed = false;
}

const makeMathRegressionInvoice = (overrides: Partial<Invoice>): Invoice => ({
  ...openingBalanceInvoice,
  items: [{
    id: 'math-regression-item',
    description: 'خدمت آزمون',
    quantity: 1,
    unitPrice: 1_000,
    discount: 0,
    taxRate: 10,
    total: 1_100
  }],
  subtotal: 1_000,
  totalDiscount: 0,
  totalTax: 100,
  grandTotal: 1_100,
  ...overrides
});

const mathRegressionPnl = calculateAccountingCycle({
  invoices: [
    makeMathRegressionInvoice({ id: 'math-sale', type: 'sale' }),
    makeMathRegressionInvoice({
      id: 'math-return',
      type: 'sale_return',
      items: [{
        id: 'math-return-item',
        description: 'خدمت آزمون',
        quantity: 1,
        unitPrice: 200,
        discount: 0,
        taxRate: 10,
        total: 220
      }],
      subtotal: 200,
      totalTax: 20,
      grandTotal: 220
    }),
    makeMathRegressionInvoice({
      id: 'math-proforma',
      type: 'proforma_sale',
      subtotal: 9_000,
      totalTax: 900,
      grandTotal: 9_900
    }),
    makeMathRegressionInvoice({
      id: 'math-draft',
      status: 'draft',
      subtotal: 5_000,
      totalTax: 500,
      grandTotal: 5_500
    })
  ],
  transactions: [{
    id: 'invoice-linked-expense',
    date: '1405/01/02',
    type: 'expense',
    category: 'پرداخت فاکتور',
    amount: 1_000,
    description: 'تسویه خرید فاکتور',
    relatedInvoiceId: 'math-purchase'
  }],
  inventory: [],
  bankAccounts: [{
    id: 'math-test-bank',
    bankName: 'بانک آزمون',
    accountNumber: '0001',
    balance: 9_900,
    holderName: 'آزمون'
  }],
  clients: [{
    id: 'math-test-payable',
    name: 'بستانکار آزمون',
    balance: -100
  }]
});
const salesOutputVatRegression = calculateSalesOutputVat([
  makeMathRegressionInvoice({ id: 'math-sale-vat', type: 'sale' }),
  makeMathRegressionInvoice({
    id: 'math-service-vat',
    type: 'service',
    totalTax: 200
  }),
  makeMathRegressionInvoice({
    id: 'math-return-vat',
    type: 'sale_return',
    totalTax: 20
  }),
  makeMathRegressionInvoice({
    id: 'math-proforma-vat',
    type: 'proforma_sale',
    totalTax: 5_000
  }),
  makeMathRegressionInvoice({
    id: 'math-draft-vat',
    type: 'sale',
    status: 'draft',
    totalTax: 5_000
  })
]);
const invalidDiscountValidation = HabinoJsonbSchemaValidator.validateInvoiceItems([{
  id: 'invalid-discount',
  description: 'تخفیف نامعتبر',
  quantity: 1,
  unitPrice: 100,
  discount: 101,
  taxRate: 10,
  total: 0
}]);
const invalidTaxValidation = HabinoJsonbSchemaValidator.validateInvoiceItems([{
  id: 'invalid-tax',
  description: 'نرخ مالیات نامعتبر',
  quantity: 1,
  unitPrice: 100,
  discount: 0,
  taxRate: 101,
  total: 0
}]);
const invoiceCalculationItems = HabinoJsonbSchemaValidator.validateInvoiceItems([{
  id: 'invoice-calculation-regression',
  description: 'خدمت چندتعدادی',
  quantity: '3',
  unitPrice: '1000000',
  discount: '250000',
  taxRate: '10',
  total: 0
}]).sanitizedItems;
const invoiceCalculationSubtotal = calculateSubtotal(invoiceCalculationItems);
const invoiceCalculationDiscount = calculateTotalDiscount(invoiceCalculationItems);
const invoiceCalculationTax = calculateTotalTax(invoiceCalculationItems);
const invoiceCalculationGrandTotal =
  invoiceCalculationSubtotal - invoiceCalculationDiscount + invoiceCalculationTax;
const invoiceWideDiscountSource = [
  { id: 'discount-row-1', description: 'قلم اول', quantity: 2, unitPrice: 1_000, discount: 100, taxRate: 10, total: 0 },
  { id: 'discount-row-2', description: 'قلم دوم', quantity: 1, unitPrice: 1_000, discount: 0, taxRate: 5, total: 0 }
];
const invoiceWideDiscountItems = applyInvoiceWideDiscount(invoiceWideDiscountSource, 580);
const excessiveInvoiceDiscount = applyInvoiceWideDiscount(invoiceWideDiscountSource, 2_901);
const invoiceCalculationInvoice = makeMathRegressionInvoice({
  items: invoiceCalculationItems,
  subtotal: invoiceCalculationSubtotal,
  totalDiscount: invoiceCalculationDiscount,
  totalTax: invoiceCalculationTax,
  grandTotal: invoiceCalculationGrandTotal
});
const invoiceCalculationLedger = HabinoAccountingKernel.createDoubleEntryForInvoice(
  invoiceCalculationInvoice,
  'tenant-invoice-calculation-regression'
);

if (
  mathRegressionPnl.pnl.grossSales === 1_000 &&
  mathRegressionPnl.pnl.salesReturns === 200 &&
  mathRegressionPnl.pnl.netSales === 800 &&
  mathRegressionPnl.pnl.operatingExpenses === 0 &&
  mathRegressionPnl.ratios.currentRatio === 99 &&
  mathRegressionPnl.ratios.quickRatio === 99 &&
  salesOutputVatRegression === 280 &&
  invalidDiscountValidation.isValid === false &&
  invalidTaxValidation.isValid === false &&
  invoiceCalculationSubtotal === 3_000_000 &&
  invoiceCalculationDiscount === 250_000 &&
  invoiceCalculationTax === 275_000 &&
  invoiceCalculationGrandTotal === 3_025_000 &&
  invoiceWideDiscountItems[0].discount === 480 &&
  invoiceWideDiscountItems[1].discount === 200 &&
  calculateTotalDiscount(invoiceWideDiscountItems) === 680 &&
  calculateTotalTax(invoiceWideDiscountItems) === 192 &&
  excessiveInvoiceDiscount === invoiceWideDiscountSource &&
  Math.abs(calculateItemTotal(invoiceCalculationItems[0]) - invoiceCalculationItems[0].total) < 0.000001 &&
  invoiceCalculationLedger.reduce((total, entry) => total + entry.debit, 0) === 3_025_000 &&
  invoiceCalculationLedger.reduce((total, entry) => total + entry.credit, 0) === 3_025_000
) {
  console.log(`${colors.green}✔ محاسبه نرمال‌شده ردیف چندتعدادی، تخفیف، مالیات و تراز دفتر کل فاکتور تایید شد${colors.reset}`);
} else {
  console.log(`${colors.red}✖ خطا در محاسبه سود و زیان یا اعتبارسنجی مبالغ فاکتور${colors.reset}`);
  strictChecksPassed = false;
}

console.log('----------------------------------------------------------------------------------------\n');

if (result.failedScenarios > 0 || !strictChecksPassed) {
  console.log(colors.bgRed + colors.bright + ` ✖ از میان ${result.totalScenarios} سناریو یا آزمون‌های سختگیرانه، خطا رخ داده است! لطفاً گزارش بالا را بررسی فرمایید. ` + colors.reset + '\n');
  process.exit(1);
} else {
  console.log(colors.bgGreen + colors.bright + ` ✔ تمامی ${result.totalScenarios} سناریوی آزمون و کلیه آزمون‌های منفی اعتبارسنجی سختگیرانه با موفقیت ۱۰۰٪ و تراز کامل سپری شدند. ` + colors.reset + '\n');
  process.exit(0);
}
