import assert from 'node:assert/strict';
import { calculateSubtotal, calculateTotal, calculateTotalTax } from '../src/lib/calculations';
import { HabinoAccountingKernel } from '../src/lib/accountingKernel';
import {
  FinancialStateSnapshot,
  HabinoAtomicTransactionWrapper
} from '../src/lib/atomicTransactionWrapper';
import {
  getClientAccountBalance,
  getClientBalanceBeforeInvoice,
  getClientEntryDocumentLabel,
  getClientLedgerSummary,
  isClientOpeningEntry
} from '../src/lib/clientLedger';
import { getEntriesWithRunningBalance } from '../src/lib/ledgerBalances';
import {
  getProjectFinancialEntries,
  getProjectFinancialSummary,
  getProjectMonthKey
} from '../src/lib/projectFinancials';
import {
  calculateProjectProgressStatementTotals,
  getProjectProgressStatementCumulativeTotals
} from '../src/lib/projectProgressStatements';
import { affectsProfitAndLoss, getTransactionPartyBalanceDelta } from '../src/lib/transactionAccounting';
import { formatDocumentTime } from '../src/lib/documentTime';
import { orderOutboxItemsForSync } from '../src/lib/offlineOutboxOrdering';
import { validateOpeningPeriodJournalEntries } from '../src/lib/openingPeriodValidation';
import { SupabaseSyncEngine } from '../src/lib/supabaseSyncEngine';
import {
  filterRowsForTenant,
  mergeCloudRowsWithLocal,
  recoverLocalRowsFromSnapshot
} from '../src/lib/invoiceSync';
import { FixedAssetRecord, Invoice, InvoiceItem, InventoryItem } from '../src/types';
import { validateFixedAssetOpeningRegister } from '../src/lib/openingPeriodValidation';

const tenantId = 'tenant-core-accounting-regression';

const createEmptyState = (inventory: InventoryItem[] = []): FinancialStateSnapshot => ({
  invoices: [],
  accountingEntries: [],
  clients: [],
  transactions: [],
  installments: [],
  checks: [],
  projects: [],
  inventory
});

const createItem = (itemId: string, quantity: number): InvoiceItem => ({
  id: `line-${itemId}`,
  itemId,
  code: 'SKU-001',
  description: 'کالای آزمون',
  quantity,
  unitPrice: 1_000_000,
  discount: 250_000,
  taxRate: 10,
  total: quantity * 1_000_000 - 250_000 + (quantity * 1_000_000 - 250_000) * 0.1
});

const createInvoice = (
  clientId: string,
  type: Invoice['type'],
  invoiceNumber: string,
  item: InvoiceItem
): Omit<Invoice, 'id'> => {
  const subtotal = calculateSubtotal([item]);
  const totalDiscount = item.discount;
  const totalTax = calculateTotalTax([item]);
  const grandTotal = calculateTotal([item]);

  return {
    tenantId,
    invoiceNumber,
    clientId,
    clientName: 'طرف‌حساب آزمون',
    type,
    status: 'pending',
    template: 'professional',
    date: '1405/01/02',
    items: [item],
    subtotal,
    totalDiscount,
    totalTax,
    grandTotal,
    amountPaid: 0,
    remainingAmount: grandTotal
  };
};

const assertBalanced = (entries: FinancialStateSnapshot['accountingEntries'], documentNumber: string) => {
  const documentEntries = entries.filter(entry => entry.documentNumber === documentNumber);
  assert.ok(documentEntries.length > 0, `expected ledger entries for ${documentNumber}`);
  HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(documentEntries, documentNumber);
};

const projectEntries = [
  {
    id: 'project-revenue',
    documentNumber: 'PROJECT-REVENUE',
    date: '1405/01/01',
    description: 'درآمد پروژه',
    accountCode: '40101',
    accountTitle: 'درآمد',
    debit: 0,
    credit: 500_000,
    projectTag: 'project-summary-test'
  },
  {
    id: 'project-direct-cost',
    documentNumber: 'PROJECT-DIRECT-COST',
    date: '1405/01/01',
    description: 'بهای تمام‌شده پروژه',
    accountCode: '50102',
    accountTitle: 'بهای تمام‌شده',
    debit: 150_000,
    credit: 0,
    projectTag: 'project-summary-test'
  },
  {
    id: 'project-operating-expense',
    documentNumber: 'PROJECT-EXPENSE',
    date: '1405/01/01',
    description: 'هزینه پروژه',
    accountCode: '60102',
    accountTitle: 'هزینه',
    debit: 100_000,
    credit: 0,
    projectTag: 'project-summary-test'
  },
  {
    id: 'project-cash',
    documentNumber: 'PROJECT-CASH',
    date: '1405/01/01',
    description: 'تسویه نقدی فاکتور',
    accountCode: '10101',
    accountTitle: 'صندوق',
    debit: 500_000,
    credit: 0,
    projectTag: 'project-summary-test'
  },
  {
    id: 'other-project-revenue',
    documentNumber: 'OTHER-PROJECT-REVENUE',
    date: '1405/01/01',
    description: 'درآمد پروژه دیگر',
    accountCode: '40101',
    accountTitle: 'درآمد',
    debit: 0,
    credit: 900_000,
    projectTag: 'another-project'
  }
];
const projectSummary = getProjectFinancialSummary('project-summary-test', projectEntries);
assert.deepEqual(projectSummary, {
  income: 500_000,
  directCosts: 150_000,
  operatingExpenses: 100_000,
  ledgerLineCount: 3
});
console.log('✔ project reporting aggregates tagged P&L entries and excludes cash, balance-sheet, and other-project rows');
assert.deepEqual(
  getProjectFinancialSummary('project-summary-test', [
    ...projectEntries,
    {
      id: 'project-revenue-next-month',
      documentNumber: 'PROJECT-REVENUE-NEXT-MONTH',
      date: '1405/02/01',
      description: 'درآمد ماه بعد',
      accountCode: '40101',
      accountTitle: 'درآمد',
      debit: 0,
      credit: 250_000,
      projectTag: 'project-summary-test'
    }
  ], '1405/01'),
  projectSummary
);
assert.equal(getProjectMonthKey('2026-03-21'), '1405/01');
assert.equal(getProjectMonthKey('۱۴۰۵/۰۱/۱۲'), '1405/01');
assert.equal(getProjectFinancialEntries('project-summary-test', projectEntries, '1405/01').length, 3);
console.log('✔ project history filters ledger entries by Jalali month, including Gregorian database dates');

const progressLines = [{
  id: 'progress-line-1',
  description: 'اجرای دیوارچینی',
  unit: 'مترمربع',
  previousQuantity: 40,
  currentQuantity: 10,
  unitRate: 50_000
}];
const progressDeductions = [
  { id: 'retention', title: 'حسن انجام کار', amount: 25_000 },
  { id: 'advance', title: 'استرداد پیش‌پرداخت', amount: 10_000 }
];
assert.deepEqual(
  calculateProjectProgressStatementTotals(progressLines, 10, progressDeductions),
  {
    previousAmount: 2_000_000,
    currentAmount: 500_000,
    cumulativeAmount: 2_500_000,
    vatAmount: 50_000,
    deductionsAmount: 35_000,
    payableAmount: 515_000
  }
);
assert.equal(
  getProjectProgressStatementCumulativeTotals([
    {
      id: 'approved-statement',
      number: 'PV-001',
      date: '1405/01/01',
      period: '1405/01',
      status: 'approved',
      lines: progressLines,
      vatRate: 0,
      deductions: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'submitted-statement',
      number: 'PV-002',
      date: '1405/02/01',
      period: '1405/02',
      status: 'submitted',
      lines: [{ ...progressLines[0], currentQuantity: 20 }],
      vatRate: 0,
      deductions: [],
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z'
    }
  ]),
  500_000,
  'only approved progress statements contribute to the approved cumulative total'
);
console.log('✔ progress statements calculate cumulative quantities, VAT, manual deductions, payable amount, and approved-only totals');
assert.deepEqual(
  orderOutboxItemsForSync([
    { type: 'check' as const, createdAt: 1 },
    { type: 'bankAccount' as const, createdAt: 3 },
    { type: 'client' as const, createdAt: 2 },
    { type: 'equityEvent' as const, createdAt: 6 },
    { type: 'equityOwnership' as const, createdAt: 5 },
    { type: 'equityProfile' as const, createdAt: 4 },
    { type: 'fixedAsset' as const, createdAt: 7 },
    { type: 'entries' as const, createdAt: 4 }
  ]).map(item => item.type),
  ['client', 'equityProfile', 'equityOwnership', 'equityEvent', 'fixedAsset', 'bankAccount', 'check', 'entries']
);
assert.deepEqual(
  orderOutboxItemsForSync([
    { type: 'check' as const, createdAt: 2 },
    { type: 'check' as const, createdAt: 1 }
  ]).map(item => item.createdAt),
  [1, 2],
  'same-type updates are synced oldest-first so the latest local state wins'
);
console.log('✔ offline outbox syncs clients, bank accounts, and installments before dependent checks and ledger entries');

const inventoryItem: InventoryItem = {
  id: 'inventory-widget',
  tenantId,
  name: 'کالای آزمون',
  code: 'SKU-001',
  unit: 'عدد',
  buyPrice: 800_000,
  sellPrice: 1_000_000,
  stock: 10,
  type: 'good'
};

let state = createEmptyState([inventoryItem]);
const registeredClient = HabinoAtomicTransactionWrapper.atomicRegisterClient(
  state,
  { name: 'طرف‌حساب آزمون', balance: 10_000_000 },
  tenantId
);
state = registeredClient.nextState;
const clientId = registeredClient.client.id;

const cashOpeningEntries = HabinoAccountingKernel.createDoubleEntryForBankAccountOpeningBalance({
  id: 'cash-opening-test',
  tenantId,
  accountType: 'cash',
  bankName: 'صندوق آزمون',
  accountNumber: '',
  balance: 3_000_000,
  holderName: 'مسئول صندوق'
}, tenantId);
const bankOpeningEntries = HabinoAccountingKernel.createDoubleEntryForBankAccountOpeningBalance({
  id: 'bank-opening-test',
  tenantId,
  accountType: 'bank',
  bankName: 'بانک آزمون',
  accountNumber: '12345',
  balance: 5_000_000,
  holderName: 'صاحب حساب'
}, tenantId);
const legacyBankOpeningEntries = HabinoAccountingKernel.createDoubleEntryForBankAccountOpeningBalance({
  id: 'legacy-bank-opening-test',
  tenantId,
  bankName: 'بانک قدیمی',
  accountNumber: '67890',
  balance: 2_000_000,
  holderName: 'صاحب حساب'
}, tenantId);
assert.equal(cashOpeningEntries[0].accountCode, '10101', 'cash opening balance should post to the cash register account');
assert.equal(bankOpeningEntries[0].accountCode, '10102', 'bank opening balance should post to the bank account');
assert.equal(legacyBankOpeningEntries[0].accountCode, '10102', 'legacy accounts without a type should remain bank accounts');
assertBalanced(cashOpeningEntries, cashOpeningEntries[0].documentNumber);
assertBalanced(bankOpeningEntries, bankOpeningEntries[0].documentNumber);
assertBalanced(legacyBankOpeningEntries, legacyBankOpeningEntries[0].documentNumber);
const openingFixedAssetEntries = [
  {
    id: 'asset-opening-test',
    tenantId,
    documentNumber: 'DOC-OPN-ASSET-TEST',
    date: '1405/01/01',
    description: 'افتتاحیه ساختمان آزمون',
    accountCode: '20602',
    accountTitle: 'ساختمان و بنا',
    debit: 2_000_000,
    credit: 0,
    referenceId: 'asset-opening-test'
  },
  {
    id: 'asset-depreciation-opening-test',
    tenantId,
    documentNumber: 'DOC-OPN-ASSET-TEST',
    date: '1405/01/01',
    description: 'استهلاک انباشته ساختمان آزمون',
    accountCode: '21101',
    accountTitle: 'استهلاک انباشته دارایی‌های ثابت',
    debit: 0,
    credit: 200_000,
    referenceId: 'asset-opening-test'
  },
  {
    id: 'opening-equity-test',
    tenantId,
    documentNumber: 'DOC-OPN-ASSET-TEST',
    date: '1405/01/01',
    description: 'تراز افتتاحیه',
    accountCode: '30103',
    accountTitle: 'حساب تراز افتتاحیه',
    debit: 0,
    credit: 1_800_000,
    referenceId: 'asset-opening-test'
  }
];
const fixedAssetRecord: FixedAssetRecord = {
  id: 'asset-opening-test',
  tenantId,
  assetTag: 'BLD-001',
  title: 'ساختمان آزمون',
  assetClass: 'building',
  accountCode: '20602',
  acquisitionDate: '1400/01/01',
  inServiceDate: '1400/02/01',
  grossCost: 2_000_000,
  accumulatedDepreciation: 200_000,
  residualValue: 0,
  usefulLifeMonths: 240,
  depreciationMethod: 'straight_line',
  valuationReference: 'گزارش ارزش‌گذاری آزمون',
  journalDocumentNumber: 'DOC-OPN-ASSET-TEST',
  status: 'active'
};
assert.deepEqual(validateFixedAssetOpeningRegister(openingFixedAssetEntries, [fixedAssetRecord]), []);
assert.ok(validateFixedAssetOpeningRegister(openingFixedAssetEntries, [{ ...fixedAssetRecord, grossCost: 2_100_000 }]).length > 0);
assert.ok(validateFixedAssetOpeningRegister(openingFixedAssetEntries.map(entry => ({ ...entry, referenceId: undefined })), [fixedAssetRecord]).length > 0);
const fixedAssetOpeningSummary = HabinoAccountingKernel.createOpeningBalanceSheetSummary({
  clients: [],
  inventory: [],
  bankAccounts: [],
  entries: openingFixedAssetEntries
});
assert.equal(fixedAssetOpeningSummary.totalNonCurrentAssets, 1_800_000);
assert.equal(fixedAssetOpeningSummary.isBalanced, true);
const finalizedOpeningEntries = [
  ...openingFixedAssetEntries,
  {
    ...openingFixedAssetEntries[0],
    id: 'opening-equity-reclass-debit',
    documentNumber: 'DOC-OPN-CAP-TEST',
    description: 'تخصیص تراز افتتاحیه به سرمایه شریک',
    accountCode: '30103',
    accountTitle: 'حساب تراز افتتاحیه',
    debit: 1_800_000,
    credit: 0
  },
  {
    ...openingFixedAssetEntries[0],
    id: 'opening-partner-capital-credit',
    documentNumber: 'DOC-OPN-CAP-TEST',
    description: 'آورده مستند شریک',
    accountCode: '30101',
    accountTitle: 'سرمایه شرکا و حقوق صاحبان سهام',
    debit: 0,
    credit: 1_800_000,
    tafsiliCode: '4001',
    tafsiliTitle: 'شریک آزمون',
    tafsiliType: 'partner' as const
  }
];
assert.deepEqual(validateOpeningPeriodJournalEntries(finalizedOpeningEntries), []);
assert.ok(validateOpeningPeriodJournalEntries(openingFixedAssetEntries).some(error => error.includes('۳۰۱۰۳')));
assert.ok(validateOpeningPeriodJournalEntries([
  ...finalizedOpeningEntries,
  {
    ...openingFixedAssetEntries[0],
    id: 'opening-capital-without-partner',
    documentNumber: 'DOC-OPN-CAP-INVALID',
    accountCode: '30101',
    accountTitle: 'سرمایه شرکا و حقوق صاحبان سهام',
    debit: 0,
    credit: 100_000
  },
  {
    ...openingFixedAssetEntries[0],
    id: 'opening-capital-counterpart',
    documentNumber: 'DOC-OPN-CAP-INVALID',
    accountCode: '30103',
    accountTitle: 'حساب تراز افتتاحیه',
    debit: 100_000,
    credit: 0
  }
]).some(error => error.includes('تفصیلی معتبر شریک')));
assert.ok(validateOpeningPeriodJournalEntries([
  ...finalizedOpeningEntries,
  {
    ...openingFixedAssetEntries[0],
    id: 'opening-partner-current-without-detail',
    documentNumber: 'DOC-OPN-PARTNER-CURRENT-INVALID',
    description: 'جاری شریک بدون تفصیلی',
    accountCode: '30102',
    accountTitle: 'جاری شرکا و سهامداران',
    debit: 0,
    credit: 100_000,
    referenceId: undefined
  },
  {
    ...openingFixedAssetEntries[0],
    id: 'opening-partner-current-offset',
    documentNumber: 'DOC-OPN-PARTNER-CURRENT-INVALID',
    accountCode: '30103',
    accountTitle: 'حساب تراز افتتاحیه',
    debit: 100_000,
    credit: 0,
    referenceId: undefined
  }
]).some(error => error.includes('حساب جاری شرکا')));
const unbalancedOpeningSummary = HabinoAccountingKernel.createOpeningBalanceSheetSummary({
  clients: [],
  inventory: [],
  bankAccounts: [],
  entries: bankOpeningEntries.slice(0, 1)
});
assert.equal(unbalancedOpeningSummary.totalEquity, 0);
assert.equal(unbalancedOpeningSummary.isBalanced, false);
console.log('✔ cash and bank opening balances post to their distinct ledger accounts');
console.log('✔ opening balance verification uses posted equity and includes net fixed assets');
console.log('✔ opening-period close validates partner detail, fixed-asset depreciation, and temporary-equity classification');

const openingEntries = state.accountingEntries.filter(entry =>
  entry.documentNumber.startsWith('DOC-OPN') && entry.referenceId === clientId
);
assert.equal(openingEntries.length, 2, 'opening balance should create a two-line journal');
assertBalanced(openingEntries, openingEntries[0].documentNumber);
assert.equal(getClientLedgerSummary(openingEntries, clientId).balance, 10_000_000);
console.log('✔ contact registration and balanced opening-balance journal');

const updatedClient = HabinoAtomicTransactionWrapper.atomicUpdateClient(
  state,
  clientId,
  { balance: 12_000_000, name: 'طرف‌حساب به‌روزشده' },
  tenantId
);
state = updatedClient.nextState;
const legacyOpeningEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
  { ...updatedClient.client, balance: 20_000_000 },
  tenantId
).map(entry => ({ ...entry, clientId: undefined, referenceId: undefined }));
assert.ok(legacyOpeningEntries.every(entry =>
  isClientOpeningEntry(entry, clientId, updatedClient.client.name)
), 'opening rows without client references should be identified from their document number');
const openingReconciliation = SupabaseSyncEngine.reconcileLedgerAndOpeningBalances({
  clients: [{ ...updatedClient.client, balance: 20_000_000 }],
  inventory: [],
  bankAccounts: [],
  accountingEntries: [
    ...legacyOpeningEntries,
    ...legacyOpeningEntries.map(entry => ({
      ...entry,
      id: `${entry.id}-duplicate`,
      clientId,
      referenceId: clientId
    }))
  ],
  invoices: []
}, tenantId);
const reconciledClientOpeningEntries = openingReconciliation.reconciledEntries.filter(entry =>
  isClientOpeningEntry(entry, clientId, updatedClient.client.name)
);
assert.equal(reconciledClientOpeningEntries.length, 2, 'reconciliation should replace legacy duplicate opening rows with one balanced journal');
assert.equal(
  getClientLedgerSummary(reconciledClientOpeningEntries, clientId, updatedClient.client.name).balance,
  20_000_000,
  'reconciled opening journal should contribute the opening balance only once'
);
assertBalanced(reconciledClientOpeningEntries, reconciledClientOpeningEntries[0].documentNumber);
console.log('✔ reconciliation replaces duplicate legacy opening rows with one balanced journal');

const updatedOpeningEntries = state.accountingEntries.filter(entry =>
  entry.documentNumber.startsWith('DOC-OPN') && entry.referenceId === clientId
);
assert.equal(updatedOpeningEntries.length, 2, 'updating opening balance should replace, not duplicate, its journal');
assert.equal(getClientLedgerSummary(updatedOpeningEntries, clientId).balance, 12_000_000);
assert.ok(updatedOpeningEntries.every(entry => entry.description.includes('طرف‌حساب به‌روزشده')));
console.log('✔ opening-balance update keeps contact ledger in sync');

const postedBalanceUpdate = HabinoAtomicTransactionWrapper.atomicUpdateClient(
  state,
  clientId,
  { balance: 11_500_000 },
  tenantId,
  false
);
const preservedOpeningEntries = postedBalanceUpdate.nextState.accountingEntries.filter(entry =>
  entry.documentNumber.startsWith('DOC-OPN') && entry.referenceId === clientId
);
assert.equal(
  getClientLedgerSummary(preservedOpeningEntries, clientId).balance,
  12_000_000,
  'document-driven balance changes must not rewrite the original opening journal'
);
assert.equal(postedBalanceUpdate.client.balance, 11_500_000);
console.log('✔ document-driven contact balance changes preserve the opening journal');

const creditOpeningEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
  { ...updatedClient.client, balance: -12_000_000 },
  tenantId
).map(entry => ({ ...entry, clientId: undefined }));
assert.equal(
  getClientLedgerSummary(creditOpeningEntries, clientId).balance,
  -12_000_000,
  'opening-balance ledger rows should be linked by referenceId if legacy sync omitted clientId'
);
const invoiceAfterCreditOpening = createInvoice(
  clientId,
  'sale',
  'CORE-INV-CREDIT-OPENING',
  {
    ...createItem(inventoryItem.id, 1),
    unitPrice: 12_000_000,
    discount: 0,
    total: 13_200_000
  }
);
const creditOpeningAndInvoiceLedger = [
  ...creditOpeningEntries,
  ...HabinoAccountingKernel.createDoubleEntryForInvoice(
    { ...invoiceAfterCreditOpening, id: 'invoice-credit-opening' },
    tenantId
  )
];
assert.equal(
  getClientLedgerSummary(creditOpeningAndInvoiceLedger, clientId).balance,
  1_200_000,
  'credit opening balance must offset the sale invoice on the client statement'
);
console.log('✔ credit opening balance is included in client statement when linked by reference');

const screenshotOpeningEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
  { ...updatedClient.client, balance: 5_000_000 },
  tenantId
).map(entry => ({ ...entry, clientId: undefined, referenceId: undefined }));
const screenshotInvoice = createInvoice(
  clientId,
  'sale',
  'CORE-INV-OPENING-SUMMARY',
  {
    ...createItem(inventoryItem.id, 1),
    unitPrice: 10_000_000,
    discount: 0,
    taxRate: 10,
    total: 11_000_000
  }
);
const screenshotLedger = [
  ...screenshotOpeningEntries,
  ...HabinoAccountingKernel.createDoubleEntryForInvoice(
    { ...screenshotInvoice, id: 'invoice-opening-summary' },
    tenantId
  )
];
assert.equal(
  getClientLedgerSummary(screenshotLedger, clientId, updatedClient.client.name).balance,
  16_000_000,
  'legacy opening entries should be found by their document number when both client links are absent'
);
assert.equal(
  getClientAccountBalance(screenshotLedger, clientId, 5_000_000, updatedClient.client.name),
  16_000_000,
  'client list balance should come from the detailed ledger instead of stale client.balance'
);
console.log('✔ client summary and statement match opening balance plus invoice ledger');

const screenshotPreviewOpeningEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
  { ...updatedClient.client, balance: -24_900_000 },
  tenantId
).map(entry => ({ ...entry, created_at: '2026-10-20T10:00:00.000Z' }));
const screenshotPreviewInvoice: Invoice = {
  ...createInvoice(clientId, 'sale', '1001', createItem('screenshot-item', 1)),
  id: 'invoice-screenshot-1001',
  created_at: '2026-10-23T10:00:00.000Z',
  previousBalance: 7_000_000,
  subtotal: 29_000_000,
  totalDiscount: 0,
  totalTax: 2_900_000,
  grandTotal: 31_900_000,
  remainingAmount: 31_900_000
};
const screenshotInvoiceEntries = HabinoAccountingKernel.createDoubleEntryForInvoice(
  screenshotPreviewInvoice,
  tenantId
).map(entry => ({
  ...entry,
  created_at: screenshotPreviewInvoice.created_at
}));
const screenshotPriorBalance = getClientBalanceBeforeInvoice(
  [...screenshotPreviewOpeningEntries, ...screenshotInvoiceEntries],
  screenshotPreviewInvoice,
  7_000_000,
  updatedClient.client.name
);
assert.equal(
  screenshotPriorBalance,
  -24_900_000,
  'invoice preview should use the credit opening balance, not the current post-invoice client balance'
);
assert.equal(
  screenshotPriorBalance + screenshotPreviewInvoice.grandTotal,
  7_000_000,
  'invoice total debt should not count the current invoice twice'
);
assert.equal(
  getClientEntryDocumentLabel(screenshotInvoiceEntries.find(entry => entry.accountCode === '10201')!, [screenshotPreviewInvoice]),
  'فاکتور فروش'
);
assert.equal(
  getClientEntryDocumentLabel(
    { ...screenshotInvoiceEntries.find(entry => entry.accountCode === '10201')!, documentNumber: 'DOC-INV-RETURN' },
    [{ ...screenshotPreviewInvoice, invoiceNumber: 'RETURN', type: 'sale_return' }]
  ),
  'برگشت از فروش'
);
console.log('✔ invoice preview balance and client-statement document labels match the ledger');

const screenshotLegacyOpening = {
  ...screenshotOpeningEntries[0],
  documentNumber: 'DOC-OPN-#HABINO-M',
  description: `مانده حساب اول دوره (بدهکاری اولیه) - ${updatedClient.client.name}`
};
const screenshotLegacyInvoice = {
  ...HabinoAccountingKernel.createDoubleEntryForInvoice(
    { ...screenshotInvoice, id: 'invoice-screenshot-legacy' },
    tenantId
  ).find(entry => entry.accountCode === '10201')!,
  clientId,
  referenceId: undefined
};
assert.equal(
  getClientLedgerSummary(
    [screenshotLegacyOpening, screenshotLegacyInvoice],
    clientId,
    updatedClient.client.name
  ).balance,
  16_000_000,
  'screenshot-style opening entries must match by exact normalized party name'
);
console.log('✔ screenshot-style opening entry resolves using the exact party name');

const legacyOpeningId = 'HABINO-M';
const legacyOpeningEntry = {
  ...HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
    {
      ...updatedClient.client,
      id: legacyOpeningId,
      balance: 4_000_000
    },
    tenantId
  )[0],
  documentNumber: 'DOC-OPN-#HABINO-M',
  clientId: undefined,
  referenceId: undefined
};
assert.equal(
  getClientLedgerSummary([legacyOpeningEntry], legacyOpeningId).balance,
  4_000_000,
  'legacy opening document numbers containing # must remain linked to their client'
);
console.log('✔ legacy #HABINO-M opening document is included in client ledger');

const saleInvoice = createInvoice(clientId, 'sale', 'CORE-INV-SALE', createItem(inventoryItem.id, 2));
assert.equal(saleInvoice.subtotal, 2_000_000);
assert.equal(saleInvoice.totalDiscount, 250_000);
assert.equal(saleInvoice.totalTax, 175_000);
assert.equal(saleInvoice.grandTotal, 1_925_000);
const staleClientState = createEmptyState();
staleClientState.invoices = [{ ...screenshotInvoice, id: 'invoice-opening-summary' }];
staleClientState.accountingEntries = screenshotLedger;
staleClientState.clients = [{ ...updatedClient.client, balance: 5_000_000 }];
const invoiceAfterStaleClientBalance = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(
  staleClientState,
  createInvoice(clientId, 'sale', 'CORE-INV-AFTER-STALE-BALANCE', {
    ...createItem(inventoryItem.id, 1),
    unitPrice: 1_000_000,
    discount: 0,
    taxRate: 0,
    total: 1_000_000
  }),
  tenantId
);
assert.equal(invoiceAfterStaleClientBalance.invoice.previousBalance, 16_000_000);
assert.equal(invoiceAfterStaleClientBalance.invoice.totalDebt, 17_000_000);
assert.equal(
  invoiceAfterStaleClientBalance.nextState.clients.find(client => client.id === clientId)?.balance,
  17_000_000,
  'new invoice should repair a stale client balance using the detailed ledger'
);
console.log('✔ new invoice repairs stale client balance from detailed ledger');

const registeredSale = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(
  state,
  saleInvoice,
  tenantId
);
state = registeredSale.nextState;
assert.equal(state.inventory?.[0].stock, 8, 'sale invoice should reduce stock by its item quantity');
assert.equal(state.clients.find(client => client.id === clientId)?.balance, 13_925_000);
assert.ok(registeredSale.invoice.created_at && !Number.isNaN(Date.parse(registeredSale.invoice.created_at)));
const saleEntries = state.accountingEntries.filter(entry => entry.documentNumber === 'DOC-INV-CORE-INV-SALE');
assertBalanced(state.accountingEntries, 'DOC-INV-CORE-INV-SALE');
assert.ok(saleEntries.every(entry => entry.created_at === registeredSale.invoice.created_at));
assert.notEqual(formatDocumentTime(registeredSale.invoice.created_at), '—');
assert.equal(formatDocumentTime(registeredSale.invoice.created_at).split(':').length, 3);
assert.equal(getClientLedgerSummary(
  saleEntries,
  clientId
).balance, 1_925_000);
console.log('✔ invoice totals, contact balance, inventory deduction, ledger posting, and timestamp');

const zeroStockItem = { ...inventoryItem, id: 'zero-stock-widget', stock: 0 };
const zeroStockClientState = HabinoAtomicTransactionWrapper.atomicRegisterClient(
  createEmptyState([zeroStockItem]),
  { name: 'مشتری آزمون موجودی صفر' },
  tenantId
);
const zeroStockSaleState = zeroStockClientState.nextState;
const zeroStockInvoice = createInvoice(
  zeroStockClientState.client.id,
  'sale',
  'CORE-INV-ZERO-STOCK',
  createItem(zeroStockItem.id, 1)
);
const zeroStockStateBeforeSale = JSON.stringify(zeroStockSaleState);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterInvoice(zeroStockSaleState, zeroStockInvoice, tenantId),
  /موجودی کالای «کالای آزمون» کافی نیست\. موجودی فعلی: 0، مقدار موردنیاز: 1/
);
assert.equal(
  JSON.stringify(zeroStockSaleState),
  zeroStockStateBeforeSale,
  'a sale with insufficient stock must roll back without changing any financial or inventory state'
);
console.log('✔ sale invoice with zero stock is rejected atomically without mutating books or inventory');

const installmentBaseState = HabinoAtomicTransactionWrapper.createSnapshot(state);
const installmentPlan = HabinoAtomicTransactionWrapper.atomicCreateInstallmentPlan(
  installmentBaseState,
  {
    invoiceId: registeredSale.invoice.id,
    totalInstallments: 2,
    firstDueDate: '1405/02/10',
    totalInterest: 100_000,
    totalServiceFee: 50_000,
    approvedBy: 'accountant-test'
  },
  tenantId
);
assert.equal(installmentPlan.installments.reduce((sum, item) => sum + item.principalAmount, 0), 1_925_000);
assert.equal(installmentPlan.installments.reduce((sum, item) => sum + item.interestAmount, 0), 100_000);
assert.equal(installmentPlan.installments.reduce((sum, item) => sum + item.serviceFeeAmount, 0), 50_000);
assert.equal(installmentPlan.invoice.remainingAmount, registeredSale.invoice.remainingAmount + 150_000);
assert.equal(installmentPlan.nextState.clients.find(client => client.id === clientId)?.balance, 14_075_000);
assertBalanced(installmentPlan.nextState.accountingEntries, `INST-PLAN-${registeredSale.invoice.invoiceNumber}`);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicCreateInstallmentPlan(
    installmentPlan.nextState,
    {
      invoiceId: registeredSale.invoice.id,
      totalInstallments: 2,
      firstDueDate: '1405/02/10',
      totalInterest: 0,
      totalServiceFee: 0,
      approvedBy: 'accountant-test'
    },
    tenantId
  ),
  /قبلاً برنامه اقساط/
);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateInvoice(
    installmentPlan.nextState,
    registeredSale.invoice.id,
    { grandTotal: installmentPlan.invoice.grandTotal + 1 },
    tenantId
  ),
  /برنامه اقساط تأییدشده/
);
console.log('✔ installment plans require a finalized open invoice, split principal/charges, and post balanced accruals');

const installmentCheck = HabinoAtomicTransactionWrapper.atomicRegisterCheck(
  installmentPlan.nextState,
  {
    tenantId,
    checkNumber: 'INST-CHECK-001',
    bankName: 'بانک آزمون',
    amount: installmentPlan.installments[0].amount,
    issueDate: '1405/02/10',
    dueDate: '1405/03/10',
    type: 'receivable',
    status: 'pending',
    clientId,
    clientName: 'طرف‌حساب آزمون',
    relatedInvoiceId: registeredSale.invoice.id,
    relatedInstallmentId: installmentPlan.installments[0].id
  },
  tenantId
);
assert.equal(installmentCheck.nextState.installments[0].status, 'paid');
assert.equal(installmentCheck.nextState.invoices.find(invoice => invoice.id === registeredSale.invoice.id)?.remainingAmount, 1_037_500);
assertBalanced(installmentCheck.nextState.accountingEntries, 'DOC-CHK-INST-CHECK-001');
assertBalanced(installmentCheck.nextState.accountingEntries, 'DOC-CHK-INST-REV-INST-CHECK-001');
const bouncedInstallmentCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  installmentCheck.nextState,
  installmentCheck.check.id,
  { status: 'bounced' },
  tenantId
);
assert.equal(bouncedInstallmentCheck.nextState.installments[0].paidAmount, 0);
assert.equal(bouncedInstallmentCheck.nextState.invoices.find(invoice => invoice.id === registeredSale.invoice.id)?.remainingAmount, 2_075_000);
assertBalanced(bouncedInstallmentCheck.nextState.accountingEntries, 'DOC-CHK-BOUNCE-INST-CHECK-001');
console.log('✔ check receipts settle linked installments and bounced checks restore invoice, client, and ledger balances');

const partialInstallmentPayment = HabinoAtomicTransactionWrapper.atomicRecordInstallmentPayment(
  installmentPlan.nextState,
  {
    installmentId: installmentPlan.installments[0].id,
    amount: 300_000,
    paymentMethod: 'cash',
    date: '1405/02/10',
    idempotencyKey: 'core-regression-payment-1'
  },
  tenantId
);
assert.equal(partialInstallmentPayment.installment.status, 'pending');
assert.equal(partialInstallmentPayment.installment.paidAmount, 300_000);
assert.equal(partialInstallmentPayment.invoice.remainingAmount, installmentPlan.invoice.remainingAmount - 300_000);
assert.equal(partialInstallmentPayment.nextState.clients.find(client => client.id === clientId)?.balance, 13_775_000);
assertBalanced(partialInstallmentPayment.nextState.accountingEntries, 'INST-PAY-core-regression-payment-1');
assertBalanced(partialInstallmentPayment.nextState.accountingEntries, 'INST-REV-core-regression-payment-1');
const duplicateInstallmentPayment = HabinoAtomicTransactionWrapper.atomicRecordInstallmentPayment(
  partialInstallmentPayment.nextState,
  {
    installmentId: installmentPlan.installments[0].id,
    amount: 300_000,
    paymentMethod: 'cash',
    date: '1405/02/10',
    idempotencyKey: 'core-regression-payment-1'
  },
  tenantId
);
assert.equal(duplicateInstallmentPayment.transaction.id, partialInstallmentPayment.transaction.id);
assert.equal(duplicateInstallmentPayment.nextState.accountingEntries.length, partialInstallmentPayment.nextState.accountingEntries.length);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicDeleteInvoice(partialInstallmentPayment.nextState, registeredSale.invoice.id),
  /قسط وصول‌شده یا وصول جزئی/
);
console.log('✔ installment receipts support partial payment, balanced ledger postings, idempotent retries, and protect paid invoices');

const repeatInvoiceState = HabinoAtomicTransactionWrapper.createSnapshot(state);
const clientsBeforeRepeatInvoice = repeatInvoiceState.clients.length;
const repeatedInvoice = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(
  repeatInvoiceState,
  createInvoice(clientId, 'sale', 'CORE-INV-SAME-CARDEX', {
    ...createItem(inventoryItem.id, 1),
    unitPrice: 1_000_000,
    discount: 0,
    taxRate: 0,
    total: 1_000_000
  }),
  tenantId
);
assert.equal(repeatedInvoice.nextState.clients.length, clientsBeforeRepeatInvoice);
assert.equal(repeatedInvoice.nextState.clients.filter(client => client.id === clientId).length, 1);
assert.equal(
  repeatedInvoice.nextState.clients.find(client => client.id === clientId)?.balance,
  repeatInvoiceState.clients.find(client => client.id === clientId)!.balance + 1_000_000
);
assert.ok(repeatedInvoice.nextState.accountingEntries
  .filter(entry => entry.documentNumber === 'DOC-INV-CORE-INV-SAME-CARDEX')
  .every(entry => entry.clientId === clientId));
console.log('✔ subsequent invoices update the existing client account without creating another contact');

const unknownClientInvoice = createInvoice('unknown-client-id', 'sale', 'CORE-INV-UNKNOWN-CONTACT', createItem(inventoryItem.id, 1));
const stateBeforeUnknownClientInvoice = JSON.stringify(state);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, unknownClientInvoice, tenantId),
  /طرف‌حساب انتخاب‌شده در فهرست طرف‌های حساب یافت نشد/
);
assert.equal(JSON.stringify(state), stateBeforeUnknownClientInvoice);
console.log('✔ invoices cannot create a new client cardex from an unknown contact ID');

const stateBeforeInvalidReturnConversion = JSON.stringify(state);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateInvoice(
    state,
    registeredSale.invoice.id,
    { type: 'sale_return' },
    tenantId
  ),
  /نوع سند برگشت قابل تغییر نیست/
);
assert.equal(
  JSON.stringify(state),
  stateBeforeInvalidReturnConversion,
  'a regular invoice must not be reclassified as a return invoice'
);
console.log('✔ regular invoices cannot be reclassified as return invoices');

const stateBeforePostedInvoiceEdit = JSON.stringify(state);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateInvoice(
    state,
    registeredSale.invoice.id,
    { client_id: 'changed-contact-id' },
    tenantId
  ),
  /اطلاعات مالی سند ثبت‌شده قفل است/
);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateInvoice(
    state,
    registeredSale.invoice.id,
    { grandTotal: registeredSale.invoice.grandTotal + 1 },
    tenantId
  ),
  /اطلاعات مالی سند ثبت‌شده قفل است/
);
assert.equal(JSON.stringify(state), stateBeforePostedInvoiceEdit);
const operationalStatusUpdate = HabinoAtomicTransactionWrapper.atomicUpdateInvoice(
  state,
  registeredSale.invoice.id,
  { status: 'overdue' },
  tenantId
);
assert.equal(operationalStatusUpdate.invoice.status, 'overdue');
console.log('✔ posted invoice financial details are immutable without changing accounting state');

const purchaseInvoice = createInvoice(clientId, 'purchase', 'CORE-INV-PURCHASE', createItem(inventoryItem.id, 2));
const registeredPurchase = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(
  state,
  purchaseInvoice,
  tenantId
);
state = registeredPurchase.nextState;
assert.equal(state.inventory?.[0].stock, 10, 'purchase invoice should increase stock by its item quantity');
assertBalanced(state.accountingEntries, 'DOC-INV-CORE-INV-PURCHASE');
console.log('✔ purchase invoice increases inventory and posts a balanced journal');

const cashAccountState = {
  ...state,
  bankAccounts: [{
    id: 'cashbox-account-test',
    tenantId,
    accountType: 'cash' as const,
    bankName: 'صندوق آزمون',
    accountNumber: '',
    balance: 1_000_000,
    holderName: 'مسئول صندوق'
  }]
};
const registeredCashReceipt = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
  cashAccountState,
  {
    tenantId,
    date: '1405/01/03',
    type: 'income',
    category: 'دریافت نقدی',
    amount: 25_000,
    description: 'دریافت آزمایشی از صندوق',
    clientId,
    cashAccountId: 'cashbox-account-test'
  },
  tenantId
);
assert.equal(registeredCashReceipt.nextState.bankAccounts?.[0].balance, 1_025_000);
assert.ok(registeredCashReceipt.nextState.accountingEntries.some(entry =>
  entry.referenceId === registeredCashReceipt.transaction.id && entry.accountCode === '10101'
));
const deletedCashReceipt = HabinoAtomicTransactionWrapper.atomicDeleteTransaction(
  registeredCashReceipt.nextState,
  registeredCashReceipt.transaction.id
);
assert.equal(deletedCashReceipt.bankAccounts?.[0].balance, 1_000_000);

const bankAccountState = {
  ...state,
  bankAccounts: [{
    id: 'bank-account-test',
    tenantId,
    accountType: 'bank' as const,
    accountCode: '10108',
    accountTitle: 'بانک آزمون - حساب مستقل',
    bankName: 'بانک آزمون',
    accountNumber: '12345',
    balance: 1_000_000,
    holderName: 'صاحب حساب'
  }]
};
const registeredBankPayment = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
  bankAccountState,
  {
    tenantId,
    date: '1405/01/03',
    type: 'expense',
    category: 'هزینه بانکی',
    amount: 25_000,
    description: 'پرداخت آزمایشی از بانک',
    expenseAccountCode: '60102',
    clientId,
    cashAccountId: 'bank-account-test'
  },
  tenantId
);
assert.equal(registeredBankPayment.nextState.bankAccounts?.[0].balance, 975_000);
assert.ok(registeredBankPayment.nextState.accountingEntries.some(entry =>
  entry.referenceId === registeredBankPayment.transaction.id && entry.accountCode === '10108'
));
assert.ok(registeredBankPayment.nextState.accountingEntries.some(entry =>
  entry.referenceId === registeredBankPayment.transaction.id &&
  entry.accountCode === '60102' &&
  entry.debit === 25_000
));
const deletedBankPayment = HabinoAtomicTransactionWrapper.atomicDeleteTransaction(
  registeredBankPayment.nextState,
  registeredBankPayment.transaction.id
);
assert.equal(deletedBankPayment.bankAccounts?.[0].balance, 1_000_000);
console.log('✔ cash and bank transactions update their selected balances and reverse on deletion');

const registeredReceipt = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
  cashAccountState,
  {
    tenantId,
    date: '1405/01/02',
    type: 'income',
    purpose: 'revenue',
    category: 'دریافت آزمون',
    amount: 100_000,
    description: 'دریافت آزمایشی',
    clientId,
    cashAccountId: 'cashbox-account-test',
    counterAccountCode: '40102'
  },
  tenantId
);
assert.ok(registeredReceipt.transaction.created_at);
assert.ok(registeredReceipt.nextState.accountingEntries
  .filter(entry => entry.documentNumber.startsWith('DOC-TX'))
  .some(entry => entry.created_at === registeredReceipt.transaction.created_at));
assert.ok(registeredReceipt.nextState.accountingEntries.some(entry =>
  entry.referenceId === registeredReceipt.transaction.id && entry.accountCode === '40102' && entry.credit === 100_000
));

assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterTransaction(cashAccountState, {
    tenantId,
    date: '1405/01/02',
    type: 'income',
    purpose: 'revenue',
    category: 'دریافت آزمون',
    amount: 100_000,
    description: 'دریافت بدون مخاطب',
    cashAccountId: 'cashbox-account-test',
    counterAccountCode: '40102'
  }, tenantId),
  /مخاطب/
);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterTransaction(cashAccountState, {
    tenantId,
    date: '1405/01/02',
    type: 'income',
    purpose: 'revenue',
    category: 'دریافت آزمون',
    amount: 100_000,
    description: 'دریافت بدون حساب صندوق یا بانک',
    clientId,
    counterAccountCode: '40102'
  }, tenantId),
  /حساب صندوق یا بانک/
);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterTransaction(cashAccountState, {
    tenantId,
    date: '1405/01/02',
    type: 'income',
    purpose: 'owner_contribution',
    category: 'آورده شریک',
    amount: 100_000,
    description: 'آورده شریک بدون تفصیلی',
    cashAccountId: 'cashbox-account-test',
    counterAccountCode: '30102'
  }, tenantId),
  /مخاطب/
);
const partnerContribution = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(cashAccountState, {
  tenantId,
  date: '1405/01/02',
  type: 'income',
  purpose: 'owner_contribution',
  category: 'آورده شریک',
  amount: 100_000,
  description: 'آورده شریک با تفصیلی',
  cashAccountId: 'cashbox-account-test',
  counterAccountCode: '30102',
  partnerTafsiliCode: '4001',
  partnerTafsiliTitle: 'شریک آزمون'
}, tenantId);
assert.ok(partnerContribution.nextState.accountingEntries.some(entry =>
  entry.referenceId === partnerContribution.transaction.id &&
  entry.accountCode === '30102' &&
  entry.tafsiliCode === '4001' &&
  entry.tafsiliType === 'partner'
));
assert.equal(partnerContribution.transaction.clientId, undefined);
console.log('✔ receipts require a contact and cash/bank account and only true revenue posts to income accounts');

const transferState = {
  ...state,
  bankAccounts: [
    { ...cashAccountState.bankAccounts[0] },
    {
      id: 'destination-bank-account-test',
      tenantId,
      accountType: 'bank' as const,
      accountCode: '10109',
      accountTitle: 'بانک مقصد آزمون',
      bankName: 'بانک مقصد',
      accountNumber: '99887',
      balance: 500_000,
      holderName: 'صاحب حساب'
    }
  ]
};
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
    transferState,
    {
      tenantId,
      date: '1405/01/03',
      type: 'transfer',
      purpose: 'transfer',
      category: 'انتقال بین حساب‌ها',
      amount: 1_000_001,
      description: 'انتقال بیش از مانده',
      clientId,
      cashAccountId: 'cashbox-account-test',
      destinationAccountId: 'destination-bank-account-test'
    },
    tenantId
  ),
  /موجودی صندوق.*کافی نیست/
);
const registeredTransfer = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
  transferState,
  {
    tenantId,
    date: '1405/01/03',
    type: 'transfer',
    purpose: 'transfer',
    category: 'انتقال بین حساب‌ها',
    amount: 20_000,
    description: 'انتقال آزمایشی',
    clientId,
    cashAccountId: 'cashbox-account-test',
    destinationAccountId: 'destination-bank-account-test'
  },
  tenantId
);
assert.deepEqual(
  registeredTransfer.nextState.bankAccounts?.map(account => account.balance),
  [980_000, 520_000]
);
assertBalanced(registeredTransfer.nextState.accountingEntries, `DOC-TX-${registeredTransfer.transaction.id.slice(0, 8)}`);
assert.equal(getTransactionPartyBalanceDelta(registeredTransfer.transaction), 0);
const deletedTransfer = HabinoAtomicTransactionWrapper.atomicDeleteTransaction(
  registeredTransfer.nextState,
  registeredTransfer.transaction.id
);
assert.deepEqual(deletedTransfer.bankAccounts?.map(account => account.balance), [1_000_000, 500_000]);
console.log('✔ internal transfers post a balanced journal and reverse both account balances on deletion');

const customerAdvance = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
  cashAccountState,
  {
    tenantId,
    date: '1405/01/03',
    type: 'income',
    purpose: 'customer_advance',
    category: 'پیش‌دریافت',
    amount: 30_000,
    description: 'پیش‌دریافت آزمون',
    clientId,
    cashAccountId: 'cashbox-account-test',
    counterAccountCode: '20201'
  },
  tenantId
);
assert.equal(affectsProfitAndLoss(customerAdvance.transaction), false);
assert.equal(getTransactionPartyBalanceDelta(customerAdvance.transaction), -30_000);
assert.ok(customerAdvance.nextState.accountingEntries.some(entry =>
  entry.referenceId === customerAdvance.transaction.id && entry.accountCode === '20201' && entry.credit === 30_000
));
console.log('✔ customer advances are liabilities, not income, and remain linked to the party ledger');

const registeredCheck = HabinoAtomicTransactionWrapper.atomicRegisterCheck(
  state,
  {
    tenantId,
    checkNumber: 'CHECK-TIME-TEST',
    bankName: 'بانک آزمون',
    amount: 100_000,
    issueDate: '1405/01/02',
    dueDate: '1405/02/02',
    type: 'receivable',
    status: 'pending',
    clientId
  },
  tenantId
);
assert.ok(registeredCheck.check.created_at);
assert.ok(registeredCheck.nextState.accountingEntries
  .filter(entry => entry.documentNumber.startsWith('DOC-CHK'))
  .some(entry => entry.created_at === registeredCheck.check.created_at));
const registeredCheckEntries = registeredCheck.nextState.accountingEntries
  .filter(entry => entry.referenceId === registeredCheck.check.id);
assert.equal(registeredCheckEntries.length, 2);
assert.ok(registeredCheckEntries.some(entry =>
  entry.accountCode === '10202' &&
  entry.debit === registeredCheck.check.amount &&
  entry.credit === 0
));
assert.ok(registeredCheckEntries.some(entry =>
  entry.accountCode === '10201' &&
  entry.debit === 0 &&
  entry.credit === registeredCheck.check.amount
));
console.log('✔ receipt/payment and check records preserve their registration timestamps');

const payableCheckData = {
  tenantId,
  checkNumber: 'CHECK-PAYABLE-ACCOUNT-TEST',
  bankName: 'بانک آزمون',
  amount: 100_000,
  issueDate: '1405/01/02',
  dueDate: '1405/02/02',
  type: 'payable' as const,
  status: 'pending' as const,
  clientId
};
const stateBeforeUnlinkedPayableCheck = JSON.stringify(state);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterCheck(state, payableCheckData, tenantId),
  /حساب بانکی معتبر/
);
assert.equal(JSON.stringify(state), stateBeforeUnlinkedPayableCheck);

const payableBankAccount = {
  id: 'bank-account-payable-check-test',
  tenantId,
  accountType: 'bank' as const,
  accountCode: '10105',
  accountTitle: 'بانک آزمایشی مستقل',
  bankName: 'بانک آزمون',
  accountNumber: '54321',
  balance: 500_000,
  holderName: 'صاحب حساب'
};
const zeroBalancePayableBank = { ...payableBankAccount, balance: 0 };
const zeroBalancePayableState = {
  ...state,
  bankAccounts: [zeroBalancePayableBank]
};
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
    zeroBalancePayableState,
    {
      tenantId,
      date: '1405/01/03',
      type: 'expense',
      purpose: 'expense',
      category: 'هزینه آزمون',
      amount: 1,
      description: 'پرداخت از بانک بدون موجودی',
      clientId,
      cashAccountId: zeroBalancePayableBank.id,
      counterAccountCode: '60102'
    },
    tenantId
  ),
  /موجودی حساب بانکی مبدأ.*کافی نیست/
);
const registeredUnfundedPayableCheck = HabinoAtomicTransactionWrapper.atomicRegisterCheck(
  zeroBalancePayableState,
  { ...payableCheckData, bankAccountId: zeroBalancePayableBank.id },
  tenantId
);
const stateBeforeUnfundedCheckClear = JSON.stringify(registeredUnfundedPayableCheck.nextState);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateCheck(
    registeredUnfundedPayableCheck.nextState,
    registeredUnfundedPayableCheck.check.id,
    { status: 'cleared' },
    tenantId
  ),
  /موجودی بانک.*کافی نیست/
);
assert.equal(JSON.stringify(registeredUnfundedPayableCheck.nextState), stateBeforeUnfundedCheckClear);
const payableCheckState = {
  ...state,
  bankAccounts: [payableBankAccount]
};
const registeredPayableCheck = HabinoAtomicTransactionWrapper.atomicRegisterCheck(
  payableCheckState,
  { ...payableCheckData, bankAccountId: payableBankAccount.id },
  tenantId
);
assert.equal(registeredPayableCheck.check.bankAccountId, payableBankAccount.id);
assert.equal(registeredPayableCheck.check.metadata?.bankAccountCode, payableBankAccount.accountCode);
const clearedPayableCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  registeredPayableCheck.nextState,
  registeredPayableCheck.check.id,
  { status: 'cleared' },
  tenantId
);
assert.equal(clearedPayableCheck.nextState.bankAccounts?.[0].balance, 400_000);
assert.ok(clearedPayableCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber.startsWith('DOC-CHK-CLR-CHECK-PAYABLE-ACCOUNT-TEST') &&
  entry.accountCode === payableBankAccount.accountCode &&
  entry.credit === payableCheckData.amount
));
const bouncedClearedPayableCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  clearedPayableCheck.nextState,
  registeredPayableCheck.check.id,
  { status: 'bounced' },
  tenantId
);
assert.equal(bouncedClearedPayableCheck.nextState.bankAccounts?.[0].balance, 500_000);
assert.equal(
  bouncedClearedPayableCheck.nextState.clients.find(client => client.id === clientId)?.balance,
  state.clients.find(client => client.id === clientId)?.balance
);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateCheck(
    clearedPayableCheck.nextState,
    registeredPayableCheck.check.id,
    { status: 'pending' },
    tenantId
  ),
  /چک وصول‌شده فقط با ثبت برگشت/
);
console.log('✔ payable checks require a tenant bank account and clear against its ledger account');

const receivableCheckState = {
  ...registeredCheck.nextState,
  bankAccounts: [payableBankAccount]
};
const stateBeforeUnlinkedReceivableClearance = JSON.stringify(receivableCheckState);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicUpdateCheck(
    receivableCheckState,
    registeredCheck.check.id,
    { status: 'cleared' },
    tenantId
  ),
  /حساب بانکی مقصد/
);
assert.equal(JSON.stringify(receivableCheckState), stateBeforeUnlinkedReceivableClearance);

const clearedReceivableCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  receivableCheckState,
  registeredCheck.check.id,
  { status: 'cleared', bankAccountId: payableBankAccount.id },
  tenantId
);
assert.equal(clearedReceivableCheck.nextState.bankAccounts?.[0].balance, 600_000);
assert.equal(clearedReceivableCheck.check.metadata?.bankAccountCode, payableBankAccount.accountCode);
assert.ok(clearedReceivableCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-CLR-CHECK-TIME-TEST' &&
  entry.accountCode === payableBankAccount.accountCode &&
  entry.debit === registeredCheck.check.amount &&
  entry.credit === 0
));
assert.ok(clearedReceivableCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-CLR-CHECK-TIME-TEST' &&
  entry.accountCode === '10202' &&
  entry.debit === 0 &&
  entry.credit === registeredCheck.check.amount
));
const bouncedClearedReceivableCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  clearedReceivableCheck.nextState,
  registeredCheck.check.id,
  { status: 'bounced' },
  tenantId
);
assert.equal(bouncedClearedReceivableCheck.nextState.bankAccounts?.[0].balance, 500_000);
assert.equal(
  bouncedClearedReceivableCheck.nextState.clients.find(client => client.id === clientId)?.balance,
  registeredCheck.nextState.clients.find(client => client.id === clientId)?.balance + registeredCheck.check.amount
);
console.log('✔ received-check collection selects the cash/bank destination and bounced checks reverse both balances');

const cashSettlementAccount = {
  ...payableBankAccount,
  id: 'cashbox-received-check-test',
  accountType: 'cash' as const,
  accountCode: '10101',
  accountTitle: 'صندوق آزمایشی',
  balance: 50_000
};
const cashCollectedCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  { ...registeredCheck.nextState, bankAccounts: [cashSettlementAccount] },
  registeredCheck.check.id,
  { status: 'cleared', bankAccountId: cashSettlementAccount.id },
  tenantId
);
assert.equal(cashCollectedCheck.nextState.bankAccounts?.[0].balance, 150_000);
assert.ok(cashCollectedCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-CLR-CHECK-TIME-TEST' &&
  entry.accountCode === '10101' &&
  entry.debit === registeredCheck.check.amount
));
console.log('✔ received checks can also be collected into the cash account');

const bouncedPendingReceivableCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  registeredCheck.nextState,
  registeredCheck.check.id,
  { status: 'bounced' },
  tenantId
);
assert.equal(
  bouncedPendingReceivableCheck.nextState.clients.find(client => client.id === clientId)?.balance,
  state.clients.find(client => client.id === clientId)?.balance
);
assert.ok(bouncedPendingReceivableCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-BOUNCE-CHECK-TIME-TEST' &&
  entry.accountCode === '10201' &&
  entry.debit === registeredCheck.check.amount
));
assert.ok(bouncedPendingReceivableCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-BOUNCE-CHECK-TIME-TEST' &&
  entry.accountCode === '10202' &&
  entry.credit === registeredCheck.check.amount
));

const endorsee = {
  ...state.clients[0],
  id: 'check-endorsee-client',
  name: 'طرف‌حساب دریافت‌کننده',
  balance: 0
};
const endorsementState = {
  ...registeredCheck.nextState,
  clients: [...registeredCheck.nextState.clients, endorsee]
};
const endorsedCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  endorsementState,
  registeredCheck.check.id,
  {
    status: 'endorsed',
    metadata: { endorsedToClientId: endorsee.id, endorsedToClientName: endorsee.name }
  },
  tenantId
);
assert.equal(endorsedCheck.nextState.clients.find(client => client.id === endorsee.id)?.balance, registeredCheck.check.amount);
assert.ok(endorsedCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-ENDORSE-CHECK-TIME-TEST' &&
  entry.accountCode === '20101' &&
  entry.debit === registeredCheck.check.amount
));
const bouncedEndorsedCheck = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
  endorsedCheck.nextState,
  registeredCheck.check.id,
  { status: 'bounced' },
  tenantId
);
assert.equal(
  bouncedEndorsedCheck.nextState.clients.find(client => client.id === endorsee.id)?.balance,
  0
);
assert.equal(
  bouncedEndorsedCheck.nextState.clients.find(client => client.id === clientId)?.balance,
  registeredCheck.nextState.clients.find(client => client.id === clientId)?.balance + registeredCheck.check.amount
);
assert.ok(bouncedEndorsedCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-BOUNCE-ENDORSE-CHECK-TIME-TEST' &&
  entry.accountCode === '10201' &&
  entry.debit === registeredCheck.check.amount
));
assert.ok(bouncedEndorsedCheck.nextState.accountingEntries.some(entry =>
  entry.documentNumber === 'DOC-CHK-BOUNCE-ENDORSE-CHECK-TIME-TEST' &&
  entry.accountCode === '20101' &&
  entry.credit === registeredCheck.check.amount
));
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicDeleteCheck(
    bouncedEndorsedCheck.nextState,
    registeredCheck.check.id
  ),
  /حذف چک وصول‌شده/
);
console.log('✔ endorsed checks settle the recipient and a bounce restores both counterparties');

const unknownClientCheck = {
  tenantId,
  checkNumber: 'CHECK-UNKNOWN-CONTACT',
  bankName: 'بانک آزمون',
  amount: 100_000,
  issueDate: '1405/01/02',
  dueDate: '1405/02/02',
  type: 'receivable' as const,
  status: 'pending' as const,
  clientId: 'unknown-client-id',
  clientName: 'طرف‌حساب آزمون'
};
const stateBeforeUnknownClientCheck = JSON.stringify(state);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterCheck(state, unknownClientCheck, tenantId),
  /طرف‌حساب انتخاب‌شده در فهرست طرف‌های حساب یافت نشد/
);
assert.equal(JSON.stringify(state), stateBeforeUnknownClientCheck);
console.log('✔ checks cannot create a new client cardex from an unknown contact ID');

const invalidInvoice = createInvoice('', 'sale', 'CORE-INV-NO-CONTACT', createItem(inventoryItem.id, 1));
const stateBeforeInvalidInvoice = JSON.stringify(state);
assert.throws(
  () => HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, invalidInvoice, tenantId),
  /ثبت سند بدون انتخاب مخاطب مجاز نیست/
);
assert.equal(JSON.stringify(state), stateBeforeInvalidInvoice, 'rejected invoice must not partially change state');
console.log('✔ invoice without a contact is rejected without partial changes');

const runningBalances = getEntriesWithRunningBalance(state.accountingEntries);
const receivableBalances = runningBalances.filter(entry => entry.accountCode === '10201');
assert.ok(receivableBalances.length > 0, 'general ledger should include receivable account movements');
const lastReceivableBalance = receivableBalances[receivableBalances.length - 1];
assert.equal(lastReceivableBalance.runningBalance, 13_925_000);
assert.equal(lastReceivableBalance.balanceType, 'بد');

const allDebits = state.accountingEntries.reduce((total, entry) => total + entry.debit, 0);
const allCredits = state.accountingEntries.reduce((total, entry) => total + entry.credit, 0);
assert.equal(allDebits, allCredits, 'all posted journals should keep the general ledger balanced');
console.log('✔ general-ledger running balance and aggregate double-entry invariant');

const localInvoices = [{ id: 'local-invoice' }];
const localLedger = [{ id: 'local-ledger-entry' }];
const localInventory = [{ id: 'local-stock-item' }];
for (const [name, rows] of [
  ['invoices', localInvoices],
  ['ledger', localLedger],
  ['inventory', localInventory]
] as const) {
  assert.equal(
    mergeCloudRowsWithLocal(rows, []),
    rows,
    `empty cloud ${name} response must preserve nonempty local data`
  );
}
assert.deepEqual(
  mergeCloudRowsWithLocal(localInventory, [{ id: 'remote-stock-item' }]),
  [{ id: 'remote-stock-item' }, { id: 'local-stock-item' }],
  'partial cloud data must merge without dropping unsynced local rows'
);
assert.deepEqual(
  recoverLocalRowsFromSnapshot([], [{ id: 'recovered-invoice' }]),
  [{ id: 'recovered-invoice' }],
  'empty local collection should recover from the IndexedDB snapshot'
);
assert.deepEqual(
  recoverLocalRowsFromSnapshot([{ id: 'current-invoice' }], [{ id: 'stale-invoice' }]),
  [{ id: 'current-invoice' }],
  'nonempty local data remains authoritative over the recovery snapshot'
);
assert.deepEqual(
  filterRowsForTenant(
    [{ id: 'main-record', tenantId: 'tenant-main' }, { id: 'other-record', tenantId: 'tenant-other' }],
    'tenant-main'
  ),
  [{ id: 'main-record', tenantId: 'tenant-main' }],
  'IndexedDB recovery must not cross tenant boundaries'
);

const existingStorage = (globalThis as any).localStorage;
const existingWindow = (globalThis as any).window;
const globalResetStorage = new Map<string, string>([
  ['habino_factory_reset_completed', '2026-10-23T11:59:00.000Z'],
  ['habino_pnl_purged_for_testing_v2', 'true']
]);
(globalThis as any).window = {};
(globalThis as any).localStorage = { getItem: (key: string) => globalResetStorage.get(key) || null };
const newTrialTenantClient = {
  id: 'trial-client',
  tenantId: 'tenant-new-trial',
  created_at: '2026-10-23T12:00:00.000Z'
};
assert.deepEqual(
  mergeCloudRowsWithLocal([newTrialTenantClient], [], 'tenant-new-trial'),
  [newTrialTenantClient],
  'legacy global reset markers must not clear a newly registered tenant'
);
assert.deepEqual(
  mergeCloudRowsWithLocal(
    [
      { id: 'other-tenant-client', tenantId: 'tenant-other' },
      { id: 'local-trial-client', tenantId: 'tenant-new-trial' }
    ],
    [{ id: 'remote-trial-client', tenantId: 'tenant-new-trial' }],
    'tenant-new-trial'
  ),
  [
    { id: 'other-tenant-client', tenantId: 'tenant-other' },
    { id: 'remote-trial-client', tenantId: 'tenant-new-trial' },
    { id: 'local-trial-client', tenantId: 'tenant-new-trial' }
  ],
  'sync must preserve other tenants and merge partially synced local records'
);
if (existingStorage === undefined) delete (globalThis as any).localStorage;
else (globalThis as any).localStorage = existingStorage;
if (existingWindow === undefined) delete (globalThis as any).window;
else (globalThis as any).window = existingWindow;
console.log('✔ empty cloud responses preserve local data and missing collections recover safely');

console.log('All core accounting regression tests passed.');
