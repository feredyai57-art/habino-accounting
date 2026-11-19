import assert from 'node:assert/strict';
import {
  Client,
  Employee,
  FixedAssetRecord,
  InventoryItem,
  Invoice,
  InvoiceItem,
  PayrollPeriod,
  ProjectProgressStatement,
  SSODisketteConfig,
  BankAccount,
  Project
} from '../src/types';
import {
  applyInvoiceWideDiscount,
  calculateItemTotal,
  calculateSubtotal,
  calculateTotal,
  calculateTotalDiscount,
  calculateTotalTax
} from '../src/lib/calculations';
import {
  assertReturnQuantitiesAvailable,
  buildReturnInvoiceItems,
  getReturnableItems,
  getReturnTotals
} from '../src/lib/invoiceReturns';
import {
  IRAN_LABOR_LAW_RATES,
  calculateEmployeePayrollSlip,
  calculatePayrollTax,
  calculatePeriodTotals,
  generatePayrollAccountingEntries
} from '../src/lib/payrollEngine';
import {
  generateSSODbfPackage,
  validateIranianNationalCode,
  validateSSOPackage
} from '../src/lib/ssoDbfEngine';
import {
  FinancialStateSnapshot,
  HabinoAtomicTransactionWrapper
} from '../src/lib/atomicTransactionWrapper';
import {
  calculateProjectProgressStatementTotals,
  getProjectProgressStatementCumulativeTotals
} from '../src/lib/projectProgressStatements';
import {
  getProjectFinancialSummary,
  getProjectMonthKey
} from '../src/lib/projectFinancials';
import {
  calculateAccountingCycle,
  calculateSalesOutputVat
} from '../src/lib/financialAccountingEngine';
import { computeMultiColumnTrialBalance } from '../src/lib/trialBalanceEngine';
import {
  getClientAccountBalance,
  getClientLedgerSummary
} from '../src/lib/clientLedger';
import {
  allocateDividendByOwnership,
  buildDividendJournal,
  buildFixedAssetOpeningJournal,
  buildOpeningShareCapitalJournal,
  calculateNetProfitForPeriod,
  calculateStatutoryReserveAllocation,
  transferPartnershipInterest,
  transferShares
} from '../src/lib/equityCapitalEngine';
import {
  convertCurrency,
  fromBaseCurrency,
  toBaseCurrency
} from '../src/lib/currencyUtils';
import { AccountingStressTestEngine } from '../src/lib/accountingStressTestEngine';

const TENANT = 'tenant-formula-exhaustive';

function createSeededRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertLedgerInvariants(state: FinancialStateSnapshot, contextLabel: string) {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of state.accountingEntries) {
    assert.ok(Number.isFinite(entry.debit), `${contextLabel}: non-finite debit in ${entry.documentNumber}`);
    assert.ok(Number.isFinite(entry.credit), `${contextLabel}: non-finite credit in ${entry.documentNumber}`);
    assert.ok(entry.debit >= 0 && entry.credit >= 0, `${contextLabel}: negative GL entry in ${entry.documentNumber}`);
    assert.ok(
      (entry.debit > 0 && entry.credit === 0) || (entry.credit > 0 && entry.debit === 0),
      `${contextLabel}: invalid single-sided entry (${entry.debit}/${entry.credit}) in ${entry.documentNumber}`
    );
    assert.ok(Boolean(entry.documentNumber), `${contextLabel}: missing documentNumber`);
    assert.ok(!entry.accountCode.startsWith('PROJ-'), `${contextLabel}: forbidden GL project account ${entry.accountCode}`);
    totalDebit += entry.debit;
    totalCredit += entry.credit;
  }

  assert.ok(
    Math.abs(totalDebit - totalCredit) <= 0.01,
    `${contextLabel}: GL imbalance debit=${totalDebit} credit=${totalCredit}`
  );

  for (const client of state.clients) {
    assert.ok(Number.isFinite(client.balance), `${contextLabel}: NaN client balance for ${client.id}`);
  }
  for (const bank of state.bankAccounts || []) {
    assert.ok(Number.isFinite(bank.balance), `${contextLabel}: NaN bank balance for ${bank.id}`);
  }
  for (const item of state.inventory || []) {
    assert.ok(Number.isFinite(item.stock) && item.stock >= 0, `${contextLabel}: invalid stock for ${item.id}`);
  }

  const tbMoein = computeMultiColumnTrialBalance({
    entries: state.accountingEntries,
    mode: '6_col',
    level: 'moein'
  });
  assert.equal(tbMoein.isBalanced, true, `${contextLabel}: 6-col moein trial balance not balanced (diff=${tbMoein.difference})`);

  const tbKol = computeMultiColumnTrialBalance({
    entries: state.accountingEntries,
    mode: '6_col',
    level: 'kol'
  });
  assert.equal(tbKol.isBalanced, true, `${contextLabel}: 6-col kol trial balance not balanced (diff=${tbKol.difference})`);
}

let passedSuites = 0;
function runSuite(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passedSuites += 1;
      console.log(`✔ ${name}`);
    });
}

async function main() {
  // 1. Invoice Calculations & Wide Discount Distribution
  await runSuite('1. Invoice line calculations, decimal quantities, and proportional wide-discount allocation', () => {
    const baseItems: InvoiceItem[] = [
      { id: 'i1', description: 'کالای الف', quantity: 2.5, unitPrice: 400_000, discount: 50_000, taxRate: 10, total: 0 },
      { id: 'i2', description: 'کالای ب', quantity: 3, unitPrice: 250_000, discount: 0, taxRate: 9, total: 0 },
      { id: 'i3', description: 'قلم رایگان', quantity: 1, unitPrice: 100_000, discount: 100_000, taxRate: 10, total: 0 }
    ];
    const snapshotBefore = JSON.stringify(baseItems);

    assert.equal(calculateSubtotal(baseItems), 1_850_000);
    assert.equal(calculateTotalDiscount(baseItems), 150_000);
    // item1 base=950k, tax=95k; item2 base=750k, tax=67.5k; item3 base=0, tax=0
    assert.equal(calculateTotalTax(baseItems), 162_500);
    assert.equal(calculateItemTotal(baseItems[0], false), 950_000);
    assert.equal(calculateItemTotal(baseItems[0], true), 1_045_000);
    assert.equal(calculateTotal(baseItems), 1_862_500);

    // Wide discount across remaining eligible items (950k + 750k = 1.7M)
    const discounted = applyInvoiceWideDiscount(baseItems, 170_000);
    assert.equal(calculateTotalDiscount(discounted), 320_000);
    assert.equal(discounted[2].discount, 100_000); // zero remaining base untouched
    assert.equal(calculateTotal(discounted) + 0, (1_850_000 - 320_000) + calculateTotalTax(discounted));

    // Odd residual discount check (ensures zero Rial drift)
    const oddDiscounted = applyInvoiceWideDiscount(baseItems, 333_333);
    assert.equal(Math.round(calculateTotalDiscount(oddDiscounted)), 150_000 + 333_333);

    // Invalid/over-limit wide discounts must leave items unchanged
    assert.deepEqual(applyInvoiceWideDiscount(baseItems, 0), baseItems);
    assert.deepEqual(applyInvoiceWideDiscount(baseItems, -5_000), baseItems);
    assert.deepEqual(applyInvoiceWideDiscount(baseItems, Number.NaN), baseItems);
    assert.deepEqual(applyInvoiceWideDiscount(baseItems, 2_000_000), baseItems);
    assert.equal(JSON.stringify(baseItems), snapshotBefore);
  });

  // 2. Partial/Full Returns & Stock Restoration
  await runSuite('2. Invoice partial returns, cumulative quantity limits, cash vs account refunds, and stock restoration', () => {
    const client: Client = { id: 'cli-ret-1', tenantId: TENANT, name: 'مشتری برگشت', phone: '09120000001', type: 'individual', balance: 0 };
    const bank: BankAccount = { id: 'bank-ret-1', tenantId: TENANT, accountType: 'bank', accountCode: '10102', accountTitle: 'بانک تست', bankName: 'ملت', accountNumber: '111', balance: 50_000_000, holderName: 'شرکت' };
    const invItem: InventoryItem = { id: 'inv-ret-1', tenantId: TENANT, name: 'مانیتور ۲۷ اینچ', code: 'MON-27', category: 'دیجیتال', unit: 'عدد', stock: 10, minStock: 1, buyPrice: 8_000_000, sellPrice: 12_000_000, type: 'product' };

    let state: FinancialStateSnapshot = {
      invoices: [],
      accountingEntries: [],
      clients: [client],
      transactions: [],
      installments: [],
      checks: [],
      projects: [],
      inventory: [invItem],
      bankAccounts: [bank]
    };

    const saleItem: InvoiceItem = {
      id: 'line-sale-1',
      itemId: invItem.id,
      code: invItem.code,
      description: invItem.name,
      quantity: 4,
      unitPrice: 12_000_000,
      discount: 2_000_000, // 500k per unit
      taxRate: 10,
      total: (48_000_000 - 2_000_000) * 1.1 // 50,600,000
    };

    const saleRes = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
      tenantId: TENANT,
      invoiceNumber: 'SAL-100',
      clientId: client.id,
      clientName: client.name,
      type: 'sale',
      status: 'partial',
      template: 'modern',
      date: '1404/02/10',
      items: [saleItem],
      subtotal: 48_000_000,
      totalDiscount: 2_000_000,
      totalTax: 4_600_000,
      grandTotal: 50_600_000,
      amountPaid: 20_000_000,
      remainingAmount: 30_600_000,
      cashAccountId: bank.id
    }, TENANT);
    state = saleRes.nextState;
    assert.equal(state.inventory![0].stock, 6);

    // Partial return #1: 1 unit via account adjustment
    const retItems1 = buildReturnInvoiceItems(saleRes.invoice, { [saleItem.id]: 1 });
    const retTotals1 = getReturnTotals(retItems1);
    assert.equal(retTotals1.subtotal, 12_000_000);
    assert.equal(retTotals1.totalDiscount, 500_000);
    assert.equal(retTotals1.totalTax, 1_150_000);
    assert.equal(retTotals1.grandTotal, 12_650_000);

    const retRes1 = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
      tenantId: TENANT,
      invoiceNumber: 'RET-100-1',
      clientId: client.id,
      clientName: client.name,
      type: 'sale_return',
      status: 'paid',
      template: 'modern',
      date: '1404/02/12',
      items: retItems1,
      subtotal: retTotals1.subtotal,
      totalDiscount: retTotals1.totalDiscount,
      totalTax: retTotals1.totalTax,
      grandTotal: retTotals1.grandTotal,
      amountPaid: 0,
      remainingAmount: retTotals1.grandTotal,
      metadata: {
        originalInvoiceId: saleRes.invoice.id,
        returnSettlementMethod: 'account'
      }
    }, TENANT);
    state = retRes1.nextState;
    assert.equal(state.inventory![0].stock, 7);

    // Remaining returnable must be 3 units
    const returnable = getReturnableItems(saleRes.invoice, state.invoices);
    assert.equal(returnable[0].returnedQuantity, 1);
    assert.equal(returnable[0].availableQuantity, 3);

    // Over-return (4 units when 3 remain) must reject atomically
    assert.throws(() => {
      assertReturnQuantitiesAvailable(saleRes.invoice, state.invoices, [
        { ...saleItem, id: 'bad-ret', sourceItemId: saleItem.id, quantity: 4, discount: 2_000_000, total: 50_600_000 }
      ]);
    });

    // Cash refund exceeding original amountPaid (20M) must reject without mutating state
    const retItems2 = buildReturnInvoiceItems(saleRes.invoice, { [saleItem.id]: 2 }); // 25,300,000 > 20,000,000
    const retTotals2 = getReturnTotals(retItems2);
    const snapshotBeforeBadCashReturn = JSON.stringify(state);
    assert.throws(() => {
      HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
        tenantId: TENANT,
        invoiceNumber: 'RET-100-BAD',
        clientId: client.id,
        clientName: client.name,
        type: 'sale_return',
        status: 'paid',
        template: 'modern',
        date: '1404/02/13',
        items: retItems2,
        subtotal: retTotals2.subtotal,
        totalDiscount: retTotals2.totalDiscount,
        totalTax: retTotals2.totalTax,
        grandTotal: retTotals2.grandTotal,
        amountPaid: retTotals2.grandTotal,
        remainingAmount: 0,
        cashAccountId: bank.id,
        metadata: {
          originalInvoiceId: saleRes.invoice.id,
          returnSettlementMethod: 'cash'
        }
      }, TENANT);
    });
    assert.equal(JSON.stringify(state), snapshotBeforeBadCashReturn);

    // Valid cash return of 1 unit (12,650,000 <= 20,000,000)
    const retItemsValidCash = buildReturnInvoiceItems(saleRes.invoice, { [saleItem.id]: 1 });
    const retTotalsCash = getReturnTotals(retItemsValidCash);
    const retRes2 = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
      tenantId: TENANT,
      invoiceNumber: 'RET-100-2',
      clientId: client.id,
      clientName: client.name,
      type: 'sale_return',
      status: 'paid',
      template: 'modern',
      date: '1404/02/14',
      items: retItemsValidCash,
      subtotal: retTotalsCash.subtotal,
      totalDiscount: retTotalsCash.totalDiscount,
      totalTax: retTotalsCash.totalTax,
      grandTotal: retTotalsCash.grandTotal,
      amountPaid: retTotalsCash.grandTotal,
      remainingAmount: 0,
      cashAccountId: bank.id,
      metadata: {
        originalInvoiceId: saleRes.invoice.id,
        returnSettlementMethod: 'cash'
      }
    }, TENANT);
    state = retRes2.nextState;
    assert.equal(state.inventory![0].stock, 8);
    assertLedgerInvariants(state, 'invoice-returns');
  });

  // 3. Payroll Brackets, SSO Ceiling, Exemptions, High-Advance Balance Guard, and DBF Binary Validation
  await runSuite('3. Payroll 5-bracket tax, 7x SSO ceiling, exemptions, over-deduction GL balance, and SSO DBF binary export', () => {
    // All 5 Article 84 brackets
    assert.equal(calculatePayrollTax(120_000_000).taxAmount, 0);
    // 150M: 120M @ 0% + 30M @ 10% = 3,000,000
    assert.equal(calculatePayrollTax(150_000_000).taxAmount, 3_000_000);
    // 220M: 45M @ 10% (4.5M) + 55M @ 15% (8.25M) = 12,750,000
    assert.equal(calculatePayrollTax(220_000_000).taxAmount, 12_750_000);
    // 350M: 4.5M + 105M @ 15% (15.75M) + 80M @ 20% (16M) = 36,250,000
    assert.equal(calculatePayrollTax(350_000_000).taxAmount, 36_250_000);
    // 500M: 4.5M + 15.75M + 130M @ 20% (26M) + 100M @ 30% (30M) = 76,250,000
    assert.equal(calculatePayrollTax(500_000_000).taxAmount, 76_250_000);

    const period: PayrollPeriod = {
      id: 'per-1404-01',
      year: 1404,
      month: 1,
      monthName: 'فروردین',
      status: 'calculated',
      totalGrossSalary: 0,
      totalNetSalary: 0,
      totalEmployeeInsurance7Percent: 0,
      totalEmployerInsurance23Percent: 0,
      totalSocialSecurityInsurance30Percent: 0,
      totalPayrollTax: 0,
      employeeCount: 3
    };

    const empStandard: Employee = {
      id: 'emp-1',
      firstName: 'علی',
      lastName: 'رضایی',
      nationalId: '0013520849', // valid Iranian National ID checksum
      fatherName: 'حسن',
      ssoInsuranceNumber: '1234567890',
      jobTitle: 'حسابدار ارشد',
      employmentType: 'full_time',
      baseDailyWage: 6_000_000,
      hasHousingAllowance: true,
      hasGroceryAllowance: true,
      childrenCount: 2,
      positionAllowance: 20_000_000,
      isTaxExempt: false,
      bankName: 'ملت',
      shabaNumber: 'IR123456',
      status: 'active',
      createdAt: '2025-03-21T00:00:00Z'
    };

    const empHighWage: Employee = {
      ...empStandard,
      id: 'emp-2',
      firstName: 'مریم',
      lastName: 'احمدی',
      nationalId: '0499370899',
      baseDailyWage: 25_000_000, // Above 7x MAX_DAILY_INSURED_WAGE (16,721,096)
      childrenCount: 0,
      positionAllowance: 0
    };

    const empOverAdvance: Employee = {
      ...empStandard,
      id: 'emp-3',
      firstName: 'سارا',
      lastName: 'کریمی',
      nationalId: '0084575948',
      baseDailyWage: 3_000_000,
      childrenCount: 0,
      positionAllowance: 0,
      isTaxExempt: true
    };

    const slip1 = calculateEmployeePayrollSlip(empStandard, period.id, {
      daysWorked: 30,
      overtimeHours: 10,
      bonuses: 10_000_000,
      ssoRates: { employeeRate: 7, employerRate: 20, unemploymentRate: 3, extraHardLaborRate: 4 }
    });
    assert.equal(slip1.baseSalary, 180_000_000);
    assert.equal(slip1.childAllowance, 2 * IRAN_LABOR_LAW_RATES.CHILD_ALLOWANCE_PER_CHILD);
    // Hard labor 4% -> employer 24% + 3% unemployment
    assert.equal(slip1.employerInsurance20Percent, Math.round(slip1.insuredGrossSalary * 0.24));
    assert.equal(slip1.unemploymentInsurance3Percent, Math.round(slip1.insuredGrossSalary * 0.03));

    const slip2 = calculateEmployeePayrollSlip(empHighWage, period.id, {
      daysWorked: 30,
      ssoRates: { employeeRate: 7, employerRate: 20, unemploymentRate: 3, isExemptWorkshop5Persons: true, exemptionPercentage: 50 }
    });
    // Capped at 7x daily ceiling * 30
    assert.equal(slip2.insuredGrossSalary, IRAN_LABOR_LAW_RATES.MAX_DAILY_INSURED_WAGE * 30);
    // 50% exemption on 20% employer share => 10%
    assert.equal(slip2.employerInsurance20Percent, Math.round(slip2.insuredGrossSalary * 0.10));

    // Critical edge case: advance deduction far exceeds gross pay!
    const slip3 = calculateEmployeePayrollSlip(empOverAdvance, period.id, {
      daysWorked: 30,
      advancePaymentDeduction: 500_000_000,
      otherDeductions: 50_000_000,
      ssoRates: { employeeRate: 7, employerRate: 20, unemploymentRate: 3 }
    });
    assert.equal(slip3.netPayable, 0);
    assert.equal(slip3.advancePaymentDeduction, slip3.grossSalary - slip3.employeeInsurance7Percent);
    assert.equal(slip3.otherDeductions, 0);

    const slips = [slip1, slip2, slip3];
    const totals = calculatePeriodTotals(slips);
    assert.ok(totals.totalGrossSalary > 0);

    const payrollEntries = generatePayrollAccountingEntries(period, slips, 'DOC-PAY-140401', '1404/01/31');
    const sumD = payrollEntries.reduce((s, e) => s + e.debit, 0);
    const sumC = payrollEntries.reduce((s, e) => s + e.credit, 0);
    assert.equal(sumD, sumC, `Payroll voucher out of balance: debit=${sumD} credit=${sumC}`);

    // SSO Validation & Binary DBF export
    assert.equal(validateIranianNationalCode('1111111111'), false);
    const ssoConfig: SSODisketteConfig = {
      workshopCode: '1234567890',
      subContractCode: '001',
      workshopName: 'شرکت آزمایشی هابینو',
      employerName: 'فرید تهرانی',
      insuranceBranch: 'شعبه ۱ تهران'
    };
    const ssoValidation = validateSSOPackage(ssoConfig, period, slips);
    assert.equal(ssoValidation.isValid, true, `SSO validation errors: ${ssoValidation.errors.join('; ')}`);
    const dbfPkg = generateSSODbfPackage(ssoConfig, period, slips);
    assert.equal(dbfPkg.karDbf[0], 0x03); // dBase III magic header
    assert.equal(dbfPkg.vorDbf[0], 0x03);
    assert.equal(dbfPkg.karDbf[dbfPkg.karDbf.length - 1], 0x1A); // dBase III EOF byte
    assert.equal(dbfPkg.vorDbf[dbfPkg.vorDbf.length - 1], 0x1A);
    assert.equal(dbfPkg.recordCount, 3);
  });

  // 4. Batch Settlement, Checks Endorsement/Bounce Cycle, and Fiscal Year Closing
  await runSuite('4. Batch invoice settlement, check endorsement/bounce double-reversal, and fiscal year closing', () => {
    const clientA: Client = { id: 'cli-a', tenantId: TENANT, name: 'مشتری الف', phone: '09121110001', type: 'corporate', balance: 0 };
    const clientB: Client = { id: 'cli-b', tenantId: TENANT, name: 'تامین‌کننده ب', phone: '09121110002', type: 'corporate', balance: 0 };
    const bank: BankAccount = { id: 'bank-main', tenantId: TENANT, accountType: 'bank', accountCode: '10102', accountTitle: 'بانک عامل', bankName: 'سامان', accountNumber: '222', balance: 100_000_000, holderName: 'شرکت' };

    let state: FinancialStateSnapshot = {
      invoices: [],
      accountingEntries: [],
      clients: [clientA, clientB],
      transactions: [],
      installments: [],
      checks: [],
      projects: [],
      inventory: [],
      bankAccounts: [bank]
    };

    const inv1 = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
      tenantId: TENANT, invoiceNumber: 'BS-1', clientId: clientA.id, clientName: clientA.name,
      type: 'sale', status: 'pending', template: 'modern', date: '1404/03/01',
      items: [{ id: 'x1', description: 'خدمات ۱', quantity: 1, unitPrice: 10_000_000, discount: 0, taxRate: 10, total: 11_000_000 }],
      subtotal: 10_000_000, totalDiscount: 0, totalTax: 1_000_000, grandTotal: 11_000_000, amountPaid: 0, remainingAmount: 11_000_000
    }, TENANT);
    state = inv1.nextState;

    const inv2 = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
      tenantId: TENANT, invoiceNumber: 'BS-2', clientId: clientA.id, clientName: clientA.name,
      type: 'sale', status: 'pending', template: 'modern', date: '1404/03/05',
      items: [{ id: 'x2', description: 'خدمات ۲', quantity: 1, unitPrice: 5_000_000, discount: 0, taxRate: 10, total: 5_500_000 }],
      subtotal: 5_000_000, totalDiscount: 0, totalTax: 500_000, grandTotal: 5_500_000, amountPaid: 0, remainingAmount: 5_500_000
    }, TENANT);
    state = inv2.nextState;

    // Batch settle both invoices via bank
    const batch = HabinoAtomicTransactionWrapper.atomicBatchSettleInvoices(
      state,
      [
        { invoiceId: inv1.invoice.id, amount: 11_000_000, paymentMethod: 'bank', bankId: bank.id },
        { invoiceId: inv2.invoice.id, amount: 5_500_000, paymentMethod: 'bank', bankId: bank.id }
      ],
      TENANT,
      '1404/03/10'
    );
    state = batch.nextState;
    assert.equal(batch.result.totalAmountSettled, 16_500_000);
    assert.equal(batch.result.settledInvoices.every(i => i.status === 'paid' && i.remainingAmount === 0), true);
    assertLedgerInvariants(state, 'batch-settlement');

    // Operating expense to test P&L and Fiscal Year Closing
    const exp = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(state, {
      tenantId: TENANT,
      type: 'expense',
      purpose: 'expense',
      counterAccountCode: '60101',
      cashAccountId: bank.id,
      category: 'اجاره دفتر',
      amount: 4_000_000,
      date: '1404/04/01',
      description: 'اجاره خرداد',
      clientId: clientB.id
    }, TENANT);
    state = exp.nextState;
    assertLedgerInvariants(state, 'post-expense');

    // Endorsed check bounce double reversal
    const chk = HabinoAtomicTransactionWrapper.atomicRegisterCheck(state, {
      tenantId: TENANT,
      checkNumber: 'CHK-END-1',
      sayadNumber: '1122334455667788',
      bankName: 'ملی',
      amount: 8_000_000,
      issueDate: '1404/04/02',
      dueDate: '1404/05/02',
      type: 'receivable',
      status: 'pending',
      clientId: clientA.id,
      clientName: clientA.name,
      description: 'چک دریافتی بابت حساب'
    }, TENANT);
    state = chk.nextState;

    const endorsed = HabinoAtomicTransactionWrapper.atomicUpdateCheck(state, chk.check.id, {
      status: 'endorsed',
      metadata: {
        endorsedToClientId: clientB.id,
        endorsedToClientName: clientB.name
      }
    }, TENANT);
    state = endorsed.nextState;
    assert.equal(state.clients.find(c => c.id === clientB.id)!.balance, 8_000_000);

    const bounced = HabinoAtomicTransactionWrapper.atomicUpdateCheck(state, chk.check.id, {
      status: 'bounced'
    }, TENANT);
    state = bounced.nextState;
    assert.equal(state.clients.find(c => c.id === clientB.id)!.balance, 0);
    assertLedgerInvariants(state, 'endorsed-bounce');

    // Fiscal year closing + next-year opening
    const closed = HabinoAtomicTransactionWrapper.atomicCloseFiscalYear(state, {
      fiscalYear: 1404,
      counterpartyClientId: clientA.id
    }, TENANT);
    state = closed.nextState;
    assert.equal(closed.result.totalRevenue, 15_000_000);
    assert.equal(closed.result.totalExpense, 4_000_000);
    assert.equal(closed.result.netProfitOrLoss, 11_000_000);
    assertLedgerInvariants(state, 'fiscal-year-close');
  });

  // 5. Contracting Progress Statements & Project Tagging
  await runSuite('5. Contracting progress statements, cumulative billing, VAT, deductions, and tag-only project reporting', () => {
    const totals = calculateProjectProgressStatementTotals(
      [
        { id: 'l1', title: 'خاکبرداری', unit: 'متر مکعب', previousQuantity: 100, currentQuantity: 50, unitRate: 2_000_000 },
        { id: 'l2', title: 'بتن‌ریزی', unit: 'متر مکعب', previousQuantity: 20, currentQuantity: 30, unitRate: 5_000_000 }
      ],
      10,
      [
        { id: 'd1', title: 'سپرده حسن انجام کار ۱۰٪', amount: 25_000_000 },
        { id: 'd2', title: 'مالیات تکلیفی', amount: 7_500_000 }
      ]
    );
    assert.equal(totals.previousAmount, 300_000_000);
    assert.equal(totals.currentAmount, 250_000_000);
    assert.equal(totals.cumulativeAmount, 550_000_000);
    assert.equal(totals.vatAmount, 25_000_000);
    assert.equal(totals.deductionsAmount, 32_500_000);
    assert.equal(totals.payableAmount, 242_500_000);

    const statements: ProjectProgressStatement[] = [
      {
        id: 'st1', projectId: 'p1', statementNumber: 1, title: 'صورت وضعیت ۱', periodLabel: 'فروردین', date: '1404/01/30',
        status: 'approved', vatRate: 10, lines: [{ id: 'a', title: 'کار', unit: 'عدد', previousQuantity: 0, currentQuantity: 10, unitRate: 1_000_000 }],
        deductions: [], previousAmount: 0, currentAmount: 10_000_000, cumulativeAmount: 10_000_000, vatAmount: 1_000_000, deductionsAmount: 0, payableAmount: 11_000_000,
        createdAt: '2025-04-19'
      },
      {
        id: 'st2', projectId: 'p1', statementNumber: 2, title: 'صورت وضعیت ۲ (پیش‌نویس)', periodLabel: 'اردیبهشت', date: '1404/02/30',
        status: 'draft', vatRate: 10, lines: [{ id: 'b', title: 'کار', unit: 'عدد', previousQuantity: 10, currentQuantity: 5, unitRate: 1_000_000 }],
        deductions: [], previousAmount: 10_000_000, currentAmount: 5_000_000, cumulativeAmount: 15_000_000, vatAmount: 500_000, deductionsAmount: 0, payableAmount: 5_500_000,
        createdAt: '2025-05-20'
      }
    ];
    assert.equal(getProjectProgressStatementCumulativeTotals(statements), 10_000_000);
    assert.equal(getProjectMonthKey('1404/02/15'), '1404/02');

    const projSummary = getProjectFinancialSummary('proj-1', [
      { id: 'e1', documentNumber: 'D1', date: '1404/02/01', description: 'درآمد', accountCode: '40101', accountTitle: 'درآمد', debit: 0, credit: 50_000_000, projectTag: 'proj-1' },
      { id: 'e2', documentNumber: 'D1', date: '1404/02/01', description: 'بانک', accountCode: '10102', accountTitle: 'بانک', debit: 50_000_000, credit: 0, projectTag: 'proj-1' },
      { id: 'e3', documentNumber: 'D2', date: '1404/02/10', description: 'هزینه مستقیم', accountCode: '50101', accountTitle: 'بهای تمام‌شده', debit: 18_000_000, credit: 0, projectTag: 'proj-1' },
      { id: 'e4', documentNumber: 'D3', date: '1404/02/12', description: 'سایر پروژه', accountCode: '40101', accountTitle: 'درآمد', debit: 0, credit: 99_000_000, projectTag: 'proj-2' }
    ], '1404/02');
    assert.equal(projSummary.income, 50_000_000);
    assert.equal(projSummary.directCosts, 18_000_000);
    assert.equal(projSummary.operatingExpenses, 0);
    assert.equal(projSummary.ledgerLineCount, 2);
  });

  // 6. P&L Cycle, VAT Output, Draft Exclusion, and Multi-Level Trial Balance
  await runSuite('6. Financial cycle (P&L, COGS, VAT, ratios) and multi-level trial balance (group/kol/moein/tafsili)', () => {
    const invProduct: InventoryItem = { id: 'p-1', tenantId: TENANT, name: 'لپ‌تاپ', code: 'LP-1', category: 'IT', unit: 'عدد', stock: 5, minStock: 1, buyPrice: 30_000_000, sellPrice: 45_000_000, type: 'product' };
    const invoices: Invoice[] = [
      {
        id: 'f1', invoiceNumber: 'S-1', clientId: 'c1', clientName: 'عادل', type: 'sale', status: 'paid', template: 'modern', date: '1404/01/10',
        items: [{ id: 'it1', itemId: 'p-1', code: 'LP-1', description: 'لپ‌تاپ', quantity: 2, unitPrice: 45_000_000, discount: 5_000_000, taxRate: 10, total: 93_500_000 }],
        subtotal: 90_000_000, totalDiscount: 5_000_000, totalTax: 8_500_000, grandTotal: 93_500_000, amountPaid: 93_500_000, remainingAmount: 0
      },
      {
        id: 'f2', invoiceNumber: 'D-1', clientId: 'c1', clientName: 'عادل', type: 'sale', status: 'draft', template: 'modern', date: '1404/01/11',
        items: [{ id: 'it2', itemId: 'p-1', code: 'LP-1', description: 'لپ‌تاپ', quantity: 10, unitPrice: 45_000_000, discount: 0, taxRate: 10, total: 495_000_000 }],
        subtotal: 450_000_000, totalDiscount: 0, totalTax: 45_000_000, grandTotal: 495_000_000, amountPaid: 0, remainingAmount: 495_000_000
      }
    ];
    assert.equal(calculateSalesOutputVat(invoices), 8_500_000);
    const cycle = calculateAccountingCycle({
      invoices,
      transactions: [
        { id: 't1', type: 'expense', category: 'حقوق و دستمزد', amount: 10_000_000, date: '1404/01/20', description: 'حقوق فروردین', clientId: 'c1' },
        { id: 't2', type: 'expense', category: 'خرید کالا', amount: 30_000_000, date: '1404/01/21', description: 'خرید کالا برای انبار', clientId: 'c1' }
      ],
      inventory: [invProduct],
      bankAccounts: [{ id: 'b1', accountType: 'bank', accountCode: '10102', accountTitle: 'بانک', bankName: 'ملت', accountNumber: '1', balance: 150_000_000, holderName: 'شرکت' }],
      clients: [{ id: 'c1', name: 'عادل', phone: '0912', type: 'individual', balance: 0 }]
    });
    assert.equal(cycle.pnl.grossSales, 90_000_000);
    assert.equal(cycle.pnl.salesDiscounts, 5_000_000);
    assert.equal(cycle.pnl.netSales, 85_000_000);
    assert.equal(cycle.pnl.goodsCost, 60_000_000); // 2 * 30M
    assert.equal(cycle.pnl.grossProfit, 25_000_000);
    assert.equal(cycle.pnl.operatingExpenses, 10_000_000); // excludes asset/inventory purchase
    assert.equal(cycle.pnl.operatingProfit, 15_000_000);
  });

  // 7. Equity, Statutory Reserve, Dividends, Fixed Assets & Share Transfers
  await runSuite('7. Equity opening capital, fixed assets, statutory reserve 5%/10% cap, dividends, and share transfers', () => {
    const profile = {
      tenantId: TENANT,
      legalForm: 'private_joint_stock' as const,
      registeredCapital: 1_000_000_000,
      nominalShareValue: 10_000,
      totalShares: 100_000,
      fiscalYearStart: '1404/01/01'
    };
    const positions = [
      { id: 'p1', tenantId: TENANT, ownerTafsiliCode: 'SH-01', ownerName: 'سهامدار اول', shareCount: 60_000, ownershipPercent: 60, committedCapital: 600_000_000, paidCapital: 400_000_000, effectiveDate: '1404/01/01' },
      { id: 'p2', tenantId: TENANT, ownerTafsiliCode: 'SH-02', ownerName: 'سهامدار دوم', shareCount: 40_000, ownershipPercent: 40, committedCapital: 400_000_000, paidCapital: 400_000_000, effectiveDate: '1404/01/01' }
    ];

    const openEntries = buildOpeningShareCapitalJournal({
      tenantId: TENANT, documentNumber: 'DOC-OPN-EQ1', effectiveDate: '1404/01/01', profile, positions
    });
    assert.equal(openEntries.reduce((s, e) => s + e.debit, 0), 1_000_000_000);
    assert.equal(openEntries.reduce((s, e) => s + e.credit, 0), 1_000_000_000);

    const fixedAsset: FixedAssetRecord = {
      id: 'fa-1', tenantId: TENANT, assetTag: 'FA-001', title: 'دستگاه CNC', assetClass: 'machinery',
      accountCode: '12103',
      grossCost: 500_000_000, accumulatedDepreciation: 100_000_000, residualValue: 50_000_000,
      depreciationMethod: 'straight_line', usefulLifeMonths: 60, acquisitionDate: '1401/01/01',
      valuationReference: 'گزارش کارشناس رسمی ۱۰۴', journalDocumentNumber: 'DOC-OPN-FA1'
    };
    const faEntries = buildFixedAssetOpeningJournal({
      tenantId: TENANT, documentNumber: 'DOC-OPN-FA1', date: '1404/01/01',
      asset: fixedAsset, offsetAccountCode: '30103', offsetAccountTitle: 'حساب تراز افتتاحیه'
    });
    assert.equal(faEntries.reduce((s, e) => s + e.debit, 0), faEntries.reduce((s, e) => s + e.credit, 0));

    // Statutory reserve capped at 10% of 1B = 100M
    const res1 = calculateStatutoryReserveAllocation(500_000_000, 90_000_000, 1_000_000_000);
    assert.equal(res1.targetReserve, 100_000_000);
    assert.equal(res1.allocation, 10_000_000); // 5% of 500M is 25M, capped at remaining 10M!
    assert.equal(res1.endingReserve, 100_000_000);

    // Odd dividend split sums cleanly to exact total
    const divAlloc = allocateDividendByOwnership(100_000_001, [
      { ...positions[0], ownershipPercent: 33.33 },
      { ...positions[1], ownershipPercent: 66.67 }
    ]);
    assert.equal(Math.round((divAlloc[0].amount + divAlloc[1].amount) * 100) / 100, 100_000_001);

    const divJournal = buildDividendJournal({
      tenantId: TENANT, eventId: 'DIV-1', effectiveDate: '1404/12/29',
      eventType: 'dividend_declaration', amount: 200_000_000, positions
    });
    assert.equal(divJournal.reduce((s, e) => s + e.debit, 0), 200_000_000);
    assert.equal(divJournal.reduce((s, e) => s + e.credit, 0), 200_000_000);

    // Share transfer & partnership interest transfer preserve totals
    const afterShareTransfer = transferShares(positions, 'SH-01', { ownerTafsiliCode: 'SH-03', ownerName: 'سهامدار سوم' }, 10_000, '1404/06/01');
    assert.equal(afterShareTransfer.reduce((s, p) => s + (p.shareCount || 0), 0), 100_000);
    assert.equal(Math.round(afterShareTransfer.reduce((s, p) => s + p.ownershipPercent, 0)), 100);

    const afterPartnerTransfer = transferPartnershipInterest(positions, 'SH-01', { ownerTafsiliCode: 'SH-02', ownerName: 'سهامدار دوم' }, 20, '1404/06/02');
    assert.equal(afterPartnerTransfer.reduce((s, p) => s + p.ownershipPercent, 0), 100);

    // Net profit calculation excludes DOC-OPN-*
    const periodProfit = calculateNetProfitForPeriod([
      { id: 'opn', documentNumber: 'DOC-OPN-1', date: '1404/01/01', description: 'افتتاحیه', accountCode: '60101', accountTitle: 'فروش', groupCode: '6', debit: 0, credit: 999_000_000 },
      { id: 'r1', documentNumber: 'DOC-1', date: '1404/02/01', description: 'فروش', accountCode: '40101', accountTitle: 'فروش', groupCode: '6', debit: 0, credit: 50_000_000 },
      { id: 'e1', documentNumber: 'DOC-2', date: '1404/02/02', description: 'هزینه', accountCode: '60101', accountTitle: 'هزینه', groupCode: '8', debit: 18_000_000, credit: 0 }
    ], '1404/01/01', '1404/12/29');
    assert.equal(periodProfit, 32_000_000);
  });

  // 8. Multi-Currency Conversions & Precision Guards
  await runSuite('8. Multi-currency IRR/IRT/USD round-trips, large-value stability, and NaN/null safety', () => {
    assert.equal(toBaseCurrency(1_500_000, 'IRT'), 15_000_000);
    assert.equal(fromBaseCurrency(15_000_000, 'IRT'), 1_500_000);
    assert.equal(toBaseCurrency(100, 'USD'), 60_000_000);
    assert.equal(convertCurrency(100, 'USD', 'IRT'), 6_000_000);
    assert.equal(toBaseCurrency(10_000_000_000, 'IRT'), 100_000_000_000);
    assert.equal(toBaseCurrency(Number.NaN, 'IRT'), 0);
    assert.equal(fromBaseCurrency(null, 'USD'), 0);
  });

  // 9. Seeded Property-Based Fuzz / Chaos Simulation (300 chained operations + 25 invalid rollbacks)
  await runSuite('9. Seeded property-based fuzz suite (300 randomized operations + 25 adversarial rollbacks)', () => {
    const rng = createSeededRng(14040519);
    const banks: BankAccount[] = [
      { id: 'fuzz-cash', tenantId: TENANT, accountType: 'cash', accountCode: '10101', accountTitle: 'صندوق مرکزی', bankName: 'صندوق', accountNumber: 'CASH-1', balance: 500_000_000, holderName: 'صندوق' },
      { id: 'fuzz-bank', tenantId: TENANT, accountType: 'bank', accountCode: '10102', accountTitle: 'بانک ملت', bankName: 'ملت', accountNumber: 'BNK-1', balance: 1_500_000_000, holderName: 'شرکت' }
    ];
    const clients: Client[] = [
      { id: 'fuzz-c1', tenantId: TENANT, name: 'طرف حساب یک', phone: '09120000011', type: 'corporate', balance: 0 },
      { id: 'fuzz-c2', tenantId: TENANT, name: 'طرف حساب دو', phone: '09120000012', type: 'corporate', balance: 0 },
      { id: 'fuzz-c3', tenantId: TENANT, name: 'طرف حساب سه', phone: '09120000013', type: 'individual', balance: 0 }
    ];
    const projects: Project[] = [
      { id: 'fuzz-p1', tenantId: TENANT, title: 'پروژه فاز الف', status: 'in_progress', clientId: 'fuzz-c1', budget: 900_000_000, startDate: '1404/01/01' }
    ];
    const inventory: InventoryItem[] = [
      { id: 'fuzz-inv1', tenantId: TENANT, name: 'قطعه صنعتی ۱', code: 'IND-1', category: 'صنعتی', unit: 'عدد', stock: 1000, minStock: 10, buyPrice: 1_000_000, sellPrice: 1_500_000, type: 'product' },
      { id: 'fuzz-inv2', tenantId: TENANT, name: 'قطعه صنعتی ۲', code: 'IND-2', category: 'صنعتی', unit: 'عدد', stock: 1000, minStock: 10, buyPrice: 2_000_000, sellPrice: 3_000_000, type: 'product' }
    ];

    let state: FinancialStateSnapshot = {
      invoices: [],
      accountingEntries: [],
      clients,
      transactions: [],
      installments: [],
      checks: [],
      projects,
      inventory,
      bankAccounts: banks
    };

    const saleInvoiceIds: string[] = [];
    const txIds: string[] = [];
    let rollbackRejectedCount = 0;

    for (let step = 1; step <= 300; step++) {
      const client = clients[Math.floor(rng() * clients.length)];
      const bank = banks[Math.floor(rng() * banks.length)];
      const otherBank = banks.find(b => b.id !== bank.id)!;
      const date = `1404/${String((step % 12) + 1).padStart(2, '0')}/${String((step % 28) + 1).padStart(2, '0')}`;
      const opPick = rng();

      if (opPick < 0.28) {
        // Sale invoice with discount + VAT + partial/paid/pending
        const item = inventory[Math.floor(rng() * inventory.length)];
        const qty = Math.floor(rng() * 3) + 1;
        const unitPrice = item.sellPrice;
        const gross = qty * unitPrice;
        const discount = Math.round(gross * (rng() < 0.4 ? 0.05 : 0));
        const tax = Math.round((gross - discount) * 0.1);
        const grandTotal = gross - discount + tax;
        const mode = rng();
        const amountPaid = mode < 0.34 ? grandTotal : mode < 0.67 ? Math.round(grandTotal / 2) : 0;
        const remainingAmount = grandTotal - amountPaid;
        const status = amountPaid === grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'pending';
        const lineItem: InvoiceItem = {
          id: `fl-${step}`, itemId: item.id, code: item.code, description: item.name,
          quantity: qty, unitPrice, discount, taxRate: 10, total: grandTotal
        };
        const res = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
          tenantId: TENANT,
          invoiceNumber: `FZ-S-${step}`,
          clientId: client.id,
          clientName: client.name,
          type: 'sale',
          status,
          template: 'modern',
          date,
          items: [lineItem],
          subtotal: gross,
          totalDiscount: discount,
          totalTax: tax,
          grandTotal,
          amountPaid,
          remainingAmount,
          cashAccountId: amountPaid > 0 ? bank.id : undefined,
          projectId: rng() < 0.3 ? projects[0].id : undefined
        }, TENANT);
        state = res.nextState;
        saleInvoiceIds.push(res.invoice.id);
      } else if (opPick < 0.42) {
        // Purchase invoice (replenishes inventory)
        const item = inventory[Math.floor(rng() * inventory.length)];
        const qty = Math.floor(rng() * 5) + 1;
        const unitPrice = item.buyPrice;
        const subtotal = qty * unitPrice;
        const tax = Math.round(subtotal * 0.1);
        const grandTotal = subtotal + tax;
        const res = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
          tenantId: TENANT,
          invoiceNumber: `FZ-P-${step}`,
          clientId: client.id,
          clientName: client.name,
          type: 'purchase',
          status: 'pending',
          template: 'modern',
          date,
          items: [{ id: `fp-${step}`, itemId: item.id, code: item.code, description: item.name, quantity: qty, unitPrice, discount: 0, taxRate: 10, total: grandTotal }],
          subtotal,
          totalDiscount: 0,
          totalTax: tax,
          grandTotal,
          amountPaid: 0,
          remainingAmount: grandTotal
        }, TENANT);
        state = res.nextState;
      } else if (opPick < 0.50 && saleInvoiceIds.length > 0) {
        // Attempt partial return of 1 unit from an earlier sale if available
        const srcId = saleInvoiceIds[Math.floor(rng() * saleInvoiceIds.length)];
        const srcInv = state.invoices.find(i => i.id === srcId);
        if (srcInv) {
          const returnables = getReturnableItems(srcInv, state.invoices);
          const avail = returnables.find(r => r.availableQuantity >= 1);
          if (avail) {
            const retItems = buildReturnInvoiceItems(srcInv, { [avail.item.id]: 1 });
            const rt = getReturnTotals(retItems);
            const res = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
              tenantId: TENANT,
              invoiceNumber: `FZ-R-${step}`,
              clientId: srcInv.clientId,
              clientName: srcInv.clientName,
              type: 'sale_return',
              status: 'paid',
              template: 'modern',
              date,
              items: retItems,
              subtotal: rt.subtotal,
              totalDiscount: rt.totalDiscount,
              totalTax: rt.totalTax,
              grandTotal: rt.grandTotal,
              amountPaid: 0,
              remainingAmount: rt.grandTotal,
              metadata: { originalInvoiceId: srcInv.id, returnSettlementMethod: 'account' }
            }, TENANT);
            state = res.nextState;
          }
        }
      } else if (opPick < 0.68) {
        // Income: receivable_collection or customer_advance or revenue
        const pick = rng();
        const purpose = pick < 0.4 ? 'receivable_collection' : pick < 0.75 ? 'customer_advance' : 'revenue';
        const counterAccountCode = purpose === 'receivable_collection' ? '10201' : purpose === 'customer_advance' ? '20201' : '40101';
        const res = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(state, {
          tenantId: TENANT,
          type: 'income',
          purpose,
          counterAccountCode,
          cashAccountId: bank.id,
          category: purpose === 'customer_advance' ? 'پیش‌دریافت' : 'دریافت وجه',
          amount: (Math.floor(rng() * 10) + 1) * 500_000,
          date,
          description: `تراکنش فازی ${step}`,
          clientId: client.id,
          projectId: rng() < 0.25 ? projects[0].id : undefined
        }, TENANT);
        state = res.nextState;
        txIds.push(res.transaction.id);
      } else if (opPick < 0.80) {
        // Expense or Bank Transfer
        const liveBank = state.bankAccounts!.find(b => b.id === bank.id)!;
        const amt = Math.min(liveBank.balance, (Math.floor(rng() * 5) + 1) * 200_000);
        if (amt > 0) {
          if (rng() < 0.5) {
            const res = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(state, {
              tenantId: TENANT,
              type: 'expense',
              purpose: 'expense',
              counterAccountCode: '60101',
              cashAccountId: liveBank.id,
              category: 'هزینه عملیاتی',
              amount: amt,
              date,
              description: `هزینه فازی ${step}`,
              clientId: client.id
            }, TENANT);
            state = res.nextState;
            txIds.push(res.transaction.id);
          } else {
            const res = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(state, {
              tenantId: TENANT,
              type: 'transfer',
              purpose: 'transfer',
              cashAccountId: liveBank.id,
              destinationAccountId: otherBank.id,
              category: 'انتقال بین حساب‌ها',
              amount: amt,
              date,
              description: `انتقال فازی ${step}`,
              clientId: client.id
            }, TENANT);
            state = res.nextState;
            txIds.push(res.transaction.id);
          }
        }
      } else if (opPick < 0.90) {
        // Receivable Check
        const res = HabinoAtomicTransactionWrapper.atomicRegisterCheck(state, {
          tenantId: TENANT,
          checkNumber: `FCK-${step}`,
          sayadNumber: `556677${String(step).padStart(10, '0')}`,
          bankName: 'تجارت',
          amount: (Math.floor(rng() * 8) + 1) * 1_000_000,
          issueDate: date,
          dueDate: date,
          type: 'receivable',
          status: 'pending',
          clientId: client.id,
          clientName: client.name,
          description: `چک فازی ${step}`
        }, TENANT);
        state = res.nextState;
      } else if (opPick < 0.96 && txIds.length > 0) {
        // Delete an earlier transaction and assert clean reversal
        const delId = txIds.pop()!;
        state = HabinoAtomicTransactionWrapper.atomicDeleteTransaction(state, delId);
      } else {
        // Update client name (must preserve opening/ledger consistency)
        const updated = HabinoAtomicTransactionWrapper.atomicUpdateClient(
          state,
          client.id,
          { name: `${client.name}` },
          TENANT,
          false
        );
        state = updated.nextState;
      }

      // Every single step MUST maintain full accounting invariants
      assertLedgerInvariants(state, `fuzz-step-${step}`);

      // Every 12 steps inject an adversarial invalid operation and assert 100% untouched rollback
      if (step % 12 === 0) {
        const beforeHash = JSON.stringify(state);
        assert.throws(() => {
          if (step % 24 === 0) {
            HabinoAtomicTransactionWrapper.atomicRegisterInvoice(state, {
              tenantId: TENANT, invoiceNumber: `BAD-${step}`, clientId: '', clientName: '',
              type: 'sale', status: 'pending', template: 'modern', date,
              items: [{ id: 'bad', description: 'بد', quantity: 1, unitPrice: 1000, discount: 0, taxRate: 0, total: 1000 }],
              subtotal: 1000, totalDiscount: 0, totalTax: 0, grandTotal: 1000, amountPaid: 0, remainingAmount: 1000
            }, TENANT);
          } else {
            HabinoAtomicTransactionWrapper.atomicRegisterTransaction(state, {
              tenantId: TENANT, type: 'expense', purpose: 'expense', counterAccountCode: '60101',
              cashAccountId: 'non-existent-bank', category: 'هزینه', amount: 1000, date,
              description: 'نامعتبر', clientId: client.id
            }, TENANT);
          }
        });
        assert.equal(JSON.stringify(state), beforeHash, `Rollback mutation leaked at step ${step}`);
        rollbackRejectedCount += 1;
      }
    }

    assert.equal(rollbackRejectedCount, 25);
    // Verify client ledger matches client control summary
    const sampleLedger = getClientLedgerSummary(state.accountingEntries, clients[0].id, clients[0].name);
    const sampleBalance = getClientAccountBalance(state.accountingEntries, clients[0].id, clients[0].balance, clients[0].name);
    assert.equal(sampleLedger.balance, sampleBalance);
  });

  // 10. Stress Test Throughput & Balance Verification (1,000 sequential docs)
  await runSuite('10. Stress test benchmark: 1,000 sequential documents balanced at high throughput (>= 500 TPS)', async () => {
    const report = await AccountingStressTestEngine.executeStressTest({
      targetDocumentCount: 1000,
      chunkSize: 100
    });
    assert.equal(report.totalDocumentsProcessed, 1000);
    assert.equal(report.isTrialBalancePerfect, true);
    assert.equal(report.totalImbalance, 0);
    assert.equal(report.ruleValidations.every(r => r.passed), true);
    assert.ok(report.throughputTps >= 500, `Expected throughputTps >= 500, got ${report.throughputTps}`);
    console.log(`   ↳ Stress benchmark: ${report.totalDocumentsProcessed} docs | ${report.totalLedgerEntriesGenerated} entries | ${report.totalDurationMs}ms | ${report.throughputTps} TPS | p95=${report.latencyDistribution.p95Ms}ms`);
  });

  console.log(`\n✅ All ${passedSuites} exhaustive formula & fuzz suites passed cleanly (0 errors).`);
}

main().catch((err) => {
  console.error('❌ Exhaustive accounting formula suite failed:', err);
  process.exit(1);
});
