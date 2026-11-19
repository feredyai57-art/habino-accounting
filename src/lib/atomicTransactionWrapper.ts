/**
 * Habino Atomic Financial Transaction Wrapper
 * لایه تراکنش‌های اتمیک و مکانیزم Rollback قطعی
 * انطباق ۱۰۰٪ با ۹ اصل پایه‌ای ثبت سند و دفتر کل هابینو
 * جهت به صفر رساندن ناترازی دیتابیس در شرایط خطا
 */

import { 
  Invoice, 
  AccountingEntry, 
  Client, 
  Transaction, 
  Installment, 
  Check, 
  Project,
  InventoryItem,
  BankAccount
} from '../types';
import { HabinoAccountingKernel } from './accountingKernel';
import { HabinoDistributedLockManager, LockAcquisitionResult } from './distributedLockEngine';
import { HabinoJsonbSchemaValidator } from './jsonbSchemaValidator';
import { habinoFinancialAuditLogger } from './errorLogger';
import { getCurrentDocumentTimestamp } from './documentTime';
import { getClientAccountBalance } from './clientLedger';
import { cleanDateStr, jalaliToGregorian } from './dateUtils';
import {
  assertReturnQuantitiesAvailable,
  getReturnedQuantities,
  getReturnInvoiceType,
  getReturnTotals
} from './invoiceReturns';
import { getAllAccountMoeins } from './chartOfAccountsData';
import {
  getTransactionAccountCode,
  getTransactionPartyBalanceDelta,
  isTransactionCounterAccountAllowed,
  getTransactionPurpose,
  getTransactionPurposeGroups
} from './transactionAccounting';

export interface FinancialStateSnapshot {
  invoices: Invoice[];
  accountingEntries: AccountingEntry[];
  clients: Client[];
  transactions: Transaction[];
  installments: Installment[];
  checks: Check[];
  projects: Project[];
  inventory?: InventoryItem[];
  bankAccounts?: BankAccount[];
}

export interface AtomicOperationResult<T> {
  success: boolean;
  data?: T;
  errorMessage?: string;
  rollbackOccurred: boolean;
}

/**
 * مدیر قفل‌گذاری همزمانی رکوردها (Record Lock Manager)
 * جلوگیری از Race Condition در ویرایش‌ها و تراکنش‌های همزمان با پشتیبانی از قفل توزیع‌شده
 */
export interface BatchInvoiceSettlementItem {
  invoiceId: string;
  amount: number;
  paymentMethod: 'cash' | 'bank' | 'check';
  bankId?: string;
  referenceNumber?: string;
  checkDetails?: {
    checkNumber: string;
    sayadNumber?: string;
    dueDate: string;
    bankName: string;
  };
  notes?: string;
  date?: string;
}

export interface BatchSettlementResult {
  settledInvoices: Invoice[];
  createdTransactions: Transaction[];
  createdEntries: AccountingEntry[];
  createdChecks: Check[];
  totalAmountSettled: number;
}

export interface CreateInstallmentPlanInput {
  invoiceId: string;
  totalInstallments: number;
  firstDueDate: string;
  totalInterest: number;
  totalServiceFee: number;
  approvedBy: string;
}

export interface CreateInstallmentPlanResult {
  nextState: FinancialStateSnapshot;
  invoice: Invoice;
  installments: Installment[];
  accountingEntries: AccountingEntry[];
}

export interface RecordInstallmentPaymentInput {
  installmentId: string;
  amount: number;
  paymentMethod: 'cash' | 'bank';
  bankAccountId?: string;
  date: string;
  idempotencyKey: string;
}

export interface RecordInstallmentPaymentResult {
  nextState: FinancialStateSnapshot;
  invoice: Invoice;
  installment: Installment;
  transaction: Transaction;
  accountingEntries: AccountingEntry[];
  client: Client;
  bankAccount?: BankAccount;
}

export interface CloseFiscalYearParams {
  fiscalYear: number;
  closingDate?: string;
  retainedEarningsAccountCode?: string;
  retainedEarningsTitle?: string;
  closingDocumentNumber?: string;
  openingDocumentNumber?: string;
  counterpartyClientId: string;
}

export interface CloseFiscalYearResult {
  fiscalYear: number;
  closingDocumentNumber: string;
  openingDocumentNumber: string;
  totalRevenue: number;
  totalExpense: number;
  netProfitOrLoss: number;
  closingEntriesCount: number;
  openingEntriesCount: number;
}

export class HabinoRecordLockManager {
  private static locks = new Set<string>();

  public static tryLock(resourceKeys: string[]): (() => void) | null {
    if (resourceKeys.some(k => this.locks.has(k))) {
      return null;
    }
    resourceKeys.forEach(k => this.locks.add(k));
    return () => {
      resourceKeys.forEach(k => this.locks.delete(k));
    };
  }

  public static isLocked(resourceKey: string): boolean {
    return this.locks.has(resourceKey);
  }

  public static clearAll(): void {
    this.locks.clear();
  }

  /**
   * دریافت قفل توزیع‌شده چندکاربره به همراه ضربان قلب در سطح سرور و بین تب‌ها
   */
  public static async acquireDistributedLock(params: {
    tenantId: string;
    resourceType: 'invoice' | 'client' | 'check' | 'transaction' | 'installment' | 'project';
    resourceId: string;
    userId: string;
    userName: string;
    ttlSeconds?: number;
  }): Promise<LockAcquisitionResult> {
    return HabinoDistributedLockManager.acquireLock(params);
  }

  /**
   * آزادسازی قفل توزیع‌شده
   */
  public static async releaseDistributedLock(
    tenantId: string,
    resourceType: 'invoice' | 'client' | 'check' | 'transaction' | 'installment' | 'project',
    resourceId: string
  ): Promise<boolean> {
    return HabinoDistributedLockManager.releaseLock(tenantId, resourceType, resourceId);
  }
}

export class HabinoAtomicTransactionWrapper {
  private static roundMoney(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  private static allocateInstallmentPayment(installment: Installment, amount: number): {
    principal: number;
    interest: number;
    serviceFee: number;
  } {
    const components = {
      principal: this.roundMoney(installment.principalAmount - installment.paidPrincipalAmount),
      interest: this.roundMoney(installment.interestAmount - installment.paidInterestAmount),
      serviceFee: this.roundMoney(installment.serviceFeeAmount - installment.paidServiceFeeAmount)
    };
    const total = this.roundMoney(components.principal + components.interest + components.serviceFee);
    if (total !== this.roundMoney(installment.amount - installment.paidAmount) || total <= 0) {
      throw new Error('تفکیک مبالغ این قسط با مانده آن سازگار نیست.');
    }

    let principal = amount === total ? components.principal :
      this.roundMoney(Math.min(components.principal, amount * components.principal / total));
    let interest = amount === total ? components.interest :
      this.roundMoney(Math.min(components.interest, amount * components.interest / total));
    let serviceFee = this.roundMoney(amount - principal - interest);
    if (serviceFee > components.serviceFee) {
      const overflow = serviceFee - components.serviceFee;
      serviceFee = components.serviceFee;
      const principalExtra = Math.min(this.roundMoney(components.principal - principal), overflow);
      principal = this.roundMoney(principal + principalExtra);
      interest = this.roundMoney(interest + overflow - principalExtra);
    } else if (serviceFee < 0) {
      const deficit = -serviceFee;
      serviceFee = 0;
      interest = this.roundMoney(interest - Math.min(interest, deficit));
      principal = this.roundMoney(amount - interest);
    }

    if (this.roundMoney(principal + interest + serviceFee) !== amount) {
      throw new Error('تخصیص مبلغ دریافتی به اجزای قسط دقیق نیست.');
    }
    return { principal, interest, serviceFee };
  }

  private static installmentDueDate(firstDueDate: string, monthOffset: number): string {
    const match = cleanDateStr(firstDueDate).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!match) throw new Error('تاریخ اولین سررسید معتبر نیست.');

    let year = Number(match[1]);
    let month = Number(match[2]) + monthOffset;
    const day = Number(match[3]);
    while (month > 12) {
      year++;
      month -= 12;
    }

    const maxDay = month <= 6 ? 31 : month <= 11 ? 30 : (() => {
      const start = jalaliToGregorian(year, 1, 1);
      const next = jalaliToGregorian(year + 1, 1, 1);
      const days = Math.round(
        (Date.UTC(next.gy, next.gm - 1, next.gd) - Date.UTC(start.gy, start.gm - 1, start.gd)) / 86400000
      );
      return days - 336;
    })();
    if (month < 1 || month > 12 || day < 1 || day > maxDay) {
      throw new Error('تاریخ اولین سررسید معتبر نیست.');
    }

    return `${year}/${String(month).padStart(2, '0')}/${String(Math.min(day, maxDay)).padStart(2, '0')}`;
  }

  public static atomicCreateInstallmentPlan(
    currentState: FinancialStateSnapshot,
    input: CreateInstallmentPlanInput,
    tenantId: string
  ): CreateInstallmentPlanResult {
    const snapshot = this.createWorkingSnapshot(currentState);
    const invoice = snapshot.invoices.find(item => item.id === input.invoiceId);
    if (!invoice) throw new Error('فاکتور انتخاب‌شده یافت نشد.');
    if (invoice.tenantId && invoice.tenantId !== tenantId) throw new Error('این فاکتور متعلق به مستأجر جاری نیست.');
    if (!['sale', 'service'].includes(invoice.type) || ['draft', 'cancelled'].includes(invoice.status) || invoice.is_deleted) {
      throw new Error('فقط فاکتور قطعی فروش یا خدمات قابل تقسیط است.');
    }
    if (!invoice.clientId || !snapshot.clients.some(client =>
      client.id === invoice.clientId && (!client.tenantId || client.tenantId === tenantId)
    )) {
      throw new Error('طرف‌حساب معتبر برای این فاکتور یافت نشد.');
    }
    if (snapshot.installments.some(item => item.invoiceId === invoice.id) || invoice.metadata?.installmentPlan) {
      throw new Error('برای این فاکتور قبلاً برنامه اقساط ثبت شده است.');
    }

    const principal = this.roundMoney(Number(invoice.remainingAmount));
    const interest = this.roundMoney(Number(input.totalInterest));
    const serviceFee = this.roundMoney(Number(input.totalServiceFee));
    if (!Number.isFinite(principal) || principal <= 0 ||
        !Number.isFinite(interest) || interest < 0 ||
        !Number.isFinite(serviceFee) || serviceFee < 0 ||
        !Number.isInteger(input.totalInstallments) || input.totalInstallments < 1 || input.totalInstallments > 60 ||
        !input.approvedBy) {
      throw new Error('اطلاعات برنامه اقساط یا مبالغ واردشده معتبر نیست.');
    }

    const lockKeys = [`invoice:${tenantId}:${invoice.id}`, `client:${tenantId}:${invoice.clientId}`];
    const releaseLock = HabinoRecordLockManager.tryLock(lockKeys);
    if (!releaseLock) throw new Error('این فاکتور هم‌زمان در حال ویرایش است؛ دوباره تلاش کنید.');

    try {
      const total = this.roundMoney(principal + interest + serviceFee);
      const split = (amount: number, index: number) => {
        const base = this.roundMoney(amount / input.totalInstallments);
        return index === input.totalInstallments - 1
          ? this.roundMoney(amount - base * index)
          : base;
      };
      const approvedAt = new Date().toISOString();
      const client = snapshot.clients.find(item => item.id === invoice.clientId)!;
      const installments: Installment[] = Array.from({ length: input.totalInstallments }, (_, index) => {
        const principalAmount = split(principal, index);
        const interestAmount = split(interest, index);
        const serviceFeeAmount = split(serviceFee, index);
        return {
          id: HabinoAccountingKernel.generateUUID(),
          tenantId,
          invoiceId: invoice.id,
          installmentNumber: index + 1,
          totalInstallments: input.totalInstallments,
          amount: this.roundMoney(principalAmount + interestAmount + serviceFeeAmount),
          principalAmount,
          interestAmount,
          serviceFeeAmount,
          paidAmount: 0,
          paidPrincipalAmount: 0,
          paidInterestAmount: 0,
          paidServiceFeeAmount: 0,
          dueDate: this.installmentDueDate(input.firstDueDate, index),
          status: 'pending',
          clientId: client.id,
          clientName: client.name,
          planApprovedBy: input.approvedBy,
          planApprovedAt: approvedAt
        };
      });

      const feeItems = [
        ...(interest > 0 ? [{
          id: HabinoAccountingKernel.generateUUID(),
          description: 'بهره فروش اقساطی',
          quantity: 1,
          unitPrice: interest,
          discount: 0,
          taxRate: 0,
          total: interest
        }] : []),
        ...(serviceFee > 0 ? [{
          id: HabinoAccountingKernel.generateUUID(),
          description: 'کارمزد خدمات تقسیط',
          quantity: 1,
          unitPrice: serviceFee,
          discount: 0,
          taxRate: 0,
          total: serviceFee
        }] : [])
      ];
      const updatedInvoice: Invoice = {
        ...invoice,
        items: [...invoice.items, ...feeItems],
        subtotal: this.roundMoney(invoice.subtotal + interest + serviceFee),
        grandTotal: this.roundMoney(invoice.grandTotal + interest + serviceFee),
        remainingAmount: this.roundMoney(invoice.remainingAmount + interest + serviceFee),
        metadata: {
          ...invoice.metadata,
          installmentPlan: {
            approvedBy: input.approvedBy,
            approvedAt,
            principalAmount: principal,
            interestAmount: interest,
            serviceFeeAmount: serviceFee,
            totalPayable: total
          }
        },
        updated_at: approvedAt
      };

      const accountingEntries: AccountingEntry[] = [];
      if (interest + serviceFee > 0) {
        const documentNumber = `INST-PLAN-${invoice.invoiceNumber || invoice.id}`;
        if (interest > 0) {
          accountingEntries.push(
            this.installmentEntry(tenantId, documentNumber, input.firstDueDate, '10201', 'حساب‌ها و اسناد دریافتنی تجاری', interest, 0, invoice, invoice.id),
            this.installmentEntry(tenantId, documentNumber, input.firstDueDate, '20501', 'بهره تحقق‌نیافته فروش اقساطی', 0, interest, invoice, invoice.id)
          );
        }
        if (serviceFee > 0) {
          accountingEntries.push(
            this.installmentEntry(tenantId, documentNumber, input.firstDueDate, '10201', 'حساب‌ها و اسناد دریافتنی تجاری', serviceFee, 0, invoice, invoice.id),
            this.installmentEntry(tenantId, documentNumber, input.firstDueDate, '20502', 'کارمزد خدمات تحقق‌نیافته اقساط', 0, serviceFee, invoice, invoice.id)
          );
        }
        HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(accountingEntries, documentNumber);
      }

      snapshot.invoices = snapshot.invoices.map(item => item.id === invoice.id ? updatedInvoice : item);
      snapshot.installments.push(...installments);
      snapshot.accountingEntries.push(...accountingEntries);
      if (interest + serviceFee > 0) {
        const clientIndex = snapshot.clients.findIndex(item => item.id === invoice.clientId);
        snapshot.clients[clientIndex] = {
          ...snapshot.clients[clientIndex],
          balance: (Number(snapshot.clients[clientIndex].balance) || 0) + interest + serviceFee
        };
      }

      return { nextState: snapshot, invoice: updatedInvoice, installments, accountingEntries };
    } finally {
      releaseLock();
    }
  }

  public static atomicRecordInstallmentPayment(
    currentState: FinancialStateSnapshot,
    input: RecordInstallmentPaymentInput,
    tenantId: string
  ): RecordInstallmentPaymentResult {
    const snapshot = this.createWorkingSnapshot(currentState);
    const duplicate = snapshot.transactions.find(tx => tx.metadata?.installmentPaymentId === input.idempotencyKey);
    if (duplicate) {
      const installment = snapshot.installments.find(item => item.id === input.installmentId);
      const invoice = installment && snapshot.invoices.find(item => item.id === installment.invoiceId);
      const client = installment && snapshot.clients.find(item => item.id === installment.clientId);
      if (!installment || !invoice || !client) throw new Error('پرداخت تکراری ثبت شده، اما اسناد مرتبط یافت نشدند.');
      return {
        nextState: snapshot,
        installment,
        invoice,
        client,
        transaction: duplicate,
        accountingEntries: snapshot.accountingEntries.filter(entry => entry.referenceId === installment.id),
        bankAccount: duplicate.cashAccountId ? snapshot.bankAccounts?.find(bank => bank.id === duplicate.cashAccountId) : undefined
      };
    }

    const installment = snapshot.installments.find(item => item.id === input.installmentId);
    if (!installment || (installment.tenantId && installment.tenantId !== tenantId)) {
      throw new Error('قسط متعلق به مستأجر جاری یافت نشد.');
    }
    const invoice = snapshot.invoices.find(item => item.id === installment.invoiceId);
    const client = snapshot.clients.find(item => item.id === installment.clientId);
    if (!invoice || !client || (invoice.tenantId && invoice.tenantId !== tenantId) ||
        !['sale', 'service'].includes(invoice.type) || invoice.status === 'cancelled' || invoice.is_deleted) {
      throw new Error('فاکتور یا طرف‌حساب مرتبط با قسط یافت نشد.');
    }

    const lockKeys = [`invoice:${tenantId}:${invoice.id}`, `installment:${tenantId}:${installment.id}`, `client:${tenantId}:${client.id}`];
    const releaseLock = HabinoRecordLockManager.tryLock(lockKeys);
    if (!releaseLock) throw new Error('این قسط هم‌زمان در حال ثبت یا ویرایش است؛ دوباره تلاش کنید.');

    try {
      const amount = this.roundMoney(Number(input.amount));
      const outstanding = this.roundMoney(installment.amount - installment.paidAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding ||
          amount > this.roundMoney(invoice.remainingAmount) ||
          !input.idempotencyKey || !input.date) {
        throw new Error('مبلغ یا مشخصات دریافت قسط معتبر نیست یا از مانده قابل‌وصول بیشتر است.');
      }

      let bankAccount: BankAccount | undefined;
      let cashAccountCode = '10101';
      let cashAccountTitle = 'صندوق ریالی و وجوه نقد';
      if (input.paymentMethod === 'bank') {
        bankAccount = snapshot.bankAccounts?.find(item =>
          item.id === input.bankAccountId && (!item.tenantId || item.tenantId === tenantId)
        );
        if (!bankAccount) throw new Error('برای دریافت بانکی، حساب بانکی معتبر انتخاب کنید.');
        cashAccountCode = bankAccount.accountCode || '10102';
        cashAccountTitle = bankAccount.accountTitle || `بانک ${bankAccount.bankName}`;
      } else if (input.paymentMethod !== 'cash') {
        throw new Error('روش دریافت قسط پشتیبانی نمی‌شود.');
      }

      const allocation = this.allocateInstallmentPayment(installment, amount);
      const principalPaid = allocation.principal;
      const interestPaid = allocation.interest;
      const serviceFeePaid = allocation.serviceFee;

      const transactionId = HabinoAccountingKernel.generateUUID();
      const documentNumber = `INST-PAY-${input.idempotencyKey}`;
      const entryDate = input.date;
      const entries: AccountingEntry[] = [
        this.installmentEntry(tenantId, documentNumber, entryDate, cashAccountCode, cashAccountTitle, amount, 0, invoice, installment.id),
        this.installmentEntry(tenantId, documentNumber, entryDate, '10201', 'حساب‌ها و اسناد دریافتنی تجاری', 0, amount, invoice, installment.id)
      ];

      const revenueEntries: AccountingEntry[] = [];
      const revenueDocumentNumber = `INST-REV-${input.idempotencyKey}`;
      if (interestPaid > 0) {
        revenueEntries.push(
          this.installmentEntry(tenantId, revenueDocumentNumber, entryDate, '20501', 'بهره تحقق‌نیافته فروش اقساطی', interestPaid, 0, invoice, installment.id),
          this.installmentEntry(tenantId, revenueDocumentNumber, entryDate, '40104', 'درآمد بهره فروش اقساطی', 0, interestPaid, invoice, installment.id)
        );
      }
      if (serviceFeePaid > 0) {
        revenueEntries.push(
          this.installmentEntry(tenantId, revenueDocumentNumber, entryDate, '20502', 'کارمزد خدمات تحقق‌نیافته اقساط', serviceFeePaid, 0, invoice, installment.id),
          this.installmentEntry(tenantId, revenueDocumentNumber, entryDate, '40105', 'درآمد کارمزد خدمات تقسیط', 0, serviceFeePaid, invoice, installment.id)
        );
      }
      HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(entries, documentNumber);
      if (revenueEntries.length > 0) {
        HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(revenueEntries, revenueDocumentNumber);
      }

      const now = new Date().toISOString();
      const updatedInstallment: Installment = {
        ...installment,
        paidAmount: this.roundMoney(installment.paidAmount + amount),
        paidPrincipalAmount: this.roundMoney(installment.paidPrincipalAmount + principalPaid),
        paidInterestAmount: this.roundMoney(installment.paidInterestAmount + interestPaid),
        paidServiceFeeAmount: this.roundMoney(installment.paidServiceFeeAmount + serviceFeePaid),
        status: amount === outstanding ? 'paid' : installment.status,
        paidDate: amount === outstanding ? input.date : installment.paidDate
      };
      const invoiceRemaining = this.roundMoney(invoice.remainingAmount - amount);
      const updatedInvoice: Invoice = {
        ...invoice,
        amountPaid: this.roundMoney(invoice.amountPaid + amount),
        remainingAmount: Math.max(0, invoiceRemaining),
        status: invoiceRemaining <= 0 ? 'paid' : invoice.status,
        updated_at: now
      };
      const updatedClient: Client = {
        ...client,
        balance: (Number(client.balance) || 0) - amount
      };
      const transaction: Transaction = {
        id: transactionId,
        tenantId,
        date: input.date,
        type: 'income',
        category: 'دریافت قسط فاکتور',
        amount,
        description: `وصول قسط ${installment.installmentNumber} از ${installment.totalInstallments} - فاکتور ${invoice.invoiceNumber}`,
        fromAccount: cashAccountCode,
        toAccount: '10201',
        clientId: client.id,
        clientName: client.name,
        cashAccountId: bankAccount?.id,
        relatedInvoiceId: invoice.id,
        metadata: {
          installmentId: installment.id,
          installmentPaymentId: input.idempotencyKey,
          principalAmount: principalPaid,
          interestAmount: interestPaid,
          serviceFeeAmount: serviceFeePaid
        },
        created_at: now
      };

      snapshot.installments = snapshot.installments.map(item => item.id === installment.id ? updatedInstallment : item);
      snapshot.invoices = snapshot.invoices.map(item => item.id === invoice.id ? updatedInvoice : item);
      snapshot.clients = snapshot.clients.map(item => item.id === client.id ? updatedClient : item);
      snapshot.transactions.push(transaction);
      snapshot.accountingEntries.push(...entries, ...revenueEntries);
      if (bankAccount && snapshot.bankAccounts) {
        const bankIndex = snapshot.bankAccounts.findIndex(item => item.id === bankAccount!.id);
        snapshot.bankAccounts[bankIndex] = {
          ...bankAccount,
          balance: (Number(bankAccount.balance) || 0) + amount
        };
        bankAccount = snapshot.bankAccounts[bankIndex];
      }

      return {
        nextState: snapshot,
        installment: updatedInstallment,
        invoice: updatedInvoice,
        client: updatedClient,
        transaction,
        accountingEntries: [...entries, ...revenueEntries],
        bankAccount
      };
    } finally {
      releaseLock();
    }
  }

  private static installmentEntry(
    tenantId: string,
    documentNumber: string,
    date: string,
    accountCode: string,
    accountTitle: string,
    debit: number,
    credit: number,
    invoice: Invoice,
    referenceId: string
  ): AccountingEntry {
    return {
      id: HabinoAccountingKernel.generateUUID(),
      tenantId,
      documentNumber,
      date,
      description: `تقسیط/وصول فاکتور ${invoice.invoiceNumber}`,
      accountCode,
      accountTitle,
      debit,
      credit,
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      referenceId,
      created_at: new Date().toISOString()
    };
  }

  /**
   * عکس‌برداری عمیق (Deep Snapshot) از وضعیت برای بازگشت‌پذیری قطعی
   */
  public static createSnapshot(state: FinancialStateSnapshot): FinancialStateSnapshot {
    return {
      invoices: JSON.parse(JSON.stringify(state.invoices)),
      accountingEntries: JSON.parse(JSON.stringify(state.accountingEntries)),
      clients: JSON.parse(JSON.stringify(state.clients)),
      transactions: JSON.parse(JSON.stringify(state.transactions)),
      installments: JSON.parse(JSON.stringify(state.installments)),
      checks: JSON.parse(JSON.stringify(state.checks)),
      projects: JSON.parse(JSON.stringify(state.projects)),
      inventory: state.inventory ? JSON.parse(JSON.stringify(state.inventory)) : undefined,
      bankAccounts: state.bankAccounts ? JSON.parse(JSON.stringify(state.bankAccounts)) : undefined
    };
  }

  private static createWorkingSnapshot(state: FinancialStateSnapshot): FinancialStateSnapshot {
    return {
      invoices: [...state.invoices],
      accountingEntries: [...state.accountingEntries],
      clients: [...state.clients],
      transactions: [...state.transactions],
      installments: [...state.installments],
      checks: [...state.checks],
      projects: [...state.projects],
      inventory: state.inventory ? [...state.inventory] : undefined,
      bankAccounts: state.bankAccounts ? [...state.bankAccounts] : undefined
    };
  }

  /**
   * 🧩 ۱ و ۲) اجرای اتمیک ثبت سند و ذخیره‌سازی در دفتر کل و حساب اشخاص
   * در صورت بروز هرگونه خطا، کل عملیات بلافاصله Rollback می‌شود.
   */
  public static atomicRegisterInvoice(
    currentState: FinancialStateSnapshot,
    invoiceData: Omit<Invoice, 'id'> & { id?: string },
    tenantId: string,
    explicitInvoiceId?: string
  ): { nextState: FinancialStateSnapshot; invoice: Invoice } {
    // تهیه نسخه پشتیبان برای رول‌بک
    const snapshot = this.createWorkingSnapshot(currentState);
    let releaseReturnLock: (() => void) | null = null;

    try {
      // 🧩 ۱) اصول پایه‌ای ثبت سند: بررسی حضور و صحت فرمت مخاطب (client_id)
      const isProforma = invoiceData.type === 'proforma_sale' || 
                         invoiceData.type === 'proforma_purchase' || 
                         invoiceData.type === 'proforma';
      const isReturn = invoiceData.type === 'sale_return' || invoiceData.type === 'purchase_return';
      const originalInvoiceId = invoiceData.metadata?.originalInvoiceId;
      if (isReturn && !originalInvoiceId && !explicitInvoiceId) {
        throw new Error('صدور فاکتور برگشت باید از روی فاکتور مرجع انجام شود.');
      }
      if (
        isReturn &&
        !explicitInvoiceId &&
        (invoiceData.items || []).some(item => !item.sourceItemId)
      ) {
        throw new Error('هر قلم برگشتی باید به ردیف متناظر فاکتور اصلی متصل باشد.');
      }
      if (
        isReturn &&
        snapshot.invoices.some(invoice =>
          invoice.invoiceNumber === invoiceData.invoiceNumber &&
          (invoice.tenantId || tenantId) === tenantId &&
          invoice.id !== explicitInvoiceId
        )
      ) {
        throw new Error('شماره فاکتور برگشت تکراری است؛ دوباره تلاش کنید.');
      }
      if (isReturn && typeof originalInvoiceId === 'string') {
        releaseReturnLock = HabinoRecordLockManager.tryLock([`return-source:${originalInvoiceId}`]);
        if (!releaseReturnLock) {
          throw new Error('فاکتور مرجع هم‌زمان در حال پردازش برگشت دیگری است. دوباره تلاش کنید.');
        }
        const originalInvoice = snapshot.invoices.find(invoice =>
          invoice.id === originalInvoiceId &&
          (invoice.tenantId || tenantId) === tenantId &&
          invoice.status !== 'cancelled' &&
          !invoice.is_deleted
        );
        if (!originalInvoice || getReturnInvoiceType(originalInvoice.type) !== invoiceData.type) {
          throw new Error('فاکتور مرجع برگشت یافت نشد یا نوع سند با فاکتور مرجع سازگار نیست.');
        }
        if (originalInvoice.clientId !== (invoiceData.clientId || invoiceData.client_id)) {
          throw new Error('طرف‌حساب فاکتور برگشت باید با فاکتور مرجع یکسان باشد.');
        }
        assertReturnQuantitiesAvailable(originalInvoice, snapshot.invoices, invoiceData.items || []);
        const returnTotals = getReturnTotals(invoiceData.items || []);
        if (
          Math.abs(returnTotals.subtotal - invoiceData.subtotal) > 0.01 ||
          Math.abs(returnTotals.totalDiscount - invoiceData.totalDiscount) > 0.01 ||
          Math.abs(returnTotals.totalTax - invoiceData.totalTax) > 0.01 ||
          Math.abs(returnTotals.grandTotal - invoiceData.grandTotal) > 0.01
        ) {
          throw new Error('جمع مبلغ فاکتور برگشت با اقلام انتخاب‌شده مطابقت ندارد.');
        }
        if (
          !explicitInvoiceId &&
          invoiceData.metadata?.returnSettlementMethod !== 'account' &&
          invoiceData.metadata?.returnSettlementMethod !== 'cash'
        ) {
          throw new Error('روش تسویه فاکتور برگشت معتبر نیست.');
        }
        if (
          !explicitInvoiceId &&
          invoiceData.metadata?.returnSettlementMethod === 'account' &&
          invoiceData.amountPaid > 0
        ) {
          throw new Error('در روش تعدیل مانده طرف‌حساب، مبلغ پرداخت نقدی باید صفر باشد.');
        }
        if (
          invoiceData.metadata?.returnSettlementMethod === 'cash' &&
          Math.abs(invoiceData.amountPaid - invoiceData.grandTotal) > 0.01
        ) {
          throw new Error('در روش تسویه نقدی، مبلغ بازپرداخت باید برابر کل مبلغ برگشت باشد.');
        }
        if (invoiceData.metadata?.returnSettlementMethod === 'cash') {
          const cashRefundedPreviously = snapshot.invoices
            .filter(invoice =>
              invoice.metadata?.originalInvoiceId === originalInvoice.id &&
              invoice.metadata?.returnSettlementMethod === 'cash' &&
              (invoice.type === 'sale_return' || invoice.type === 'purchase_return') &&
              invoice.status !== 'cancelled' &&
              !invoice.is_deleted
            )
            .reduce((total, invoice) => total + (Number(invoice.amountPaid) || 0), 0);
          const refundableBalance = Math.max(0, (Number(originalInvoice.amountPaid) || 0) - cashRefundedPreviously);
          if (invoiceData.amountPaid > refundableBalance + 0.01) {
            throw new Error(`مبلغ بازپرداخت نقدی از مبلغ دریافتی/پرداختی باقیمانده فاکتور اصلی بیشتر است (حداکثر ${refundableBalance}).`);
          }
        }
      }

      let rawCId = invoiceData.clientId || invoiceData.client_id;
      if (!rawCId || String(rawCId).trim() === '') {
        if (isProforma) {
          // برای پیش‌فاکتور (سند خنثی برآورد قیمت)، در صورت عدم انتخاب طرف‌حساب، شناسه خنثی تخصیص داده می‌شود
          rawCId = 'client-inquiry-neutral';
          if (!invoiceData.clientName) {
            invoiceData.clientName = 'متقاضی استعلام (پیش‌فاکتور)';
          }
        } else {
          throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
        }
      }

      const cleanClientId = String(rawCId).trim();
      const forbiddenKeywords = ['null', 'undefined', 'nan', '[object object]', '0', 'none', 'false', '""', "''"];
      if (forbiddenKeywords.includes(cleanClientId.toLowerCase())) {
        if (isProforma) {
          rawCId = 'client-inquiry-neutral';
        } else {
          throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
        }
      }

      // اعتبارسنجی فرمت الفبانومریک استاندارد یا UUID
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      const standardIdentifierRegex = /^[a-zA-Z0-9_\-.:]{2,128}$/;
      if (!uuidRegex.test(cleanClientId) && !standardIdentifierRegex.test(cleanClientId)) {
        if (!isProforma) {
          throw new Error('فرمت شناسه طرف‌حساب نامعتبر است.');
        }
      }

      if (/[<>'";\\`]/.test(cleanClientId) || /\s/.test(cleanClientId)) {
        if (!isProforma) {
          throw new Error('شناسه مخاطب حاوی کاراکترهای غیرمجاز است.');
        }
      }

      // صدور سند فقط باید به کاردکس ثبت‌شده متصل شود؛ ساخت کاردکس از نام یا شناسه ناشناخته ممنوع است.
      const clientIndex = snapshot.clients.findIndex(c => c.id === cleanClientId);
      if (clientIndex === -1 && !isProforma) {
        throw new Error('طرف‌حساب انتخاب‌شده در فهرست طرف‌های حساب یافت نشد؛ آن را دوباره انتخاب کنید.');
      }

      // اطمینان از مقداردهی هماهنگ هر دو فیلد clientId و client_id
      invoiceData.clientId = cleanClientId;
      invoiceData.client_id = cleanClientId;

      // بررسی مبالغ
      if (invoiceData.grandTotal <= 0 && (!invoiceData.items || invoiceData.items.length === 0)) {
        throw new Error('مبلغ سند نامعتبر است.');
      }

      // اعتبارسنجی و پالایش اقلام فاکتور و متادیتا بر اساس اسکیمای JSONB
      let sanitizedItems = invoiceData.items || [];
      if (sanitizedItems.length > 0) {
        const itemValidation = HabinoJsonbSchemaValidator.validateInvoiceItems(sanitizedItems);
        if (!itemValidation.isValid) {
          throw new Error(`خطای اسکیمای اقلام فاکتور: ${itemValidation.errors.join(' | ')}`);
        }
        sanitizedItems = itemValidation.sanitizedItems;
      }

      // پالایش و اعتبارسنجی متادیتای صنف سند
      let sanitizedMeta: Record<string, any> = {};
      if (invoiceData.metadata) {
        const guildType = invoiceData.metadata.guild_type || invoiceData.metadata.guildCategory;
        const metaVal = HabinoJsonbSchemaValidator.validateGuildMetadata(guildType, invoiceData.metadata);
        if (!metaVal.isValid) {
          throw new Error(`خطای اسکیمای متادیتا: ${metaVal.errors.join(' | ')}`);
        }
        sanitizedMeta = metaVal.sanitizedData;
      }

      // محاسبه و ثبت مانده حساب از قبل طرف‌حساب و جمع کل بدهی
      const targetClient = snapshot.clients[clientIndex] || {
        id: cleanClientId,
        name: invoiceData.clientName || 'متقاضی استعلام (پیش‌فاکتور)',
        tenantId,
        balance: 0,
        type: 'individual' as const
      };
      const createdAt = invoiceData.created_at || getCurrentDocumentTimestamp();
      const previousBalance = invoiceData.previousBalance !== undefined
        ? invoiceData.previousBalance
        : getClientAccountBalance(
            snapshot.accountingEntries,
            targetClient.id,
            targetClient.balance || 0,
            targetClient.name
          );

      let calculatedTotalDebt = invoiceData.totalDebt;
      if (calculatedTotalDebt === undefined) {
        if (isReturn && invoiceData.metadata?.returnSettlementMethod === 'cash') {
          calculatedTotalDebt = previousBalance;
        } else if (invoiceData.type === 'sale' || invoiceData.type === 'service') {
          calculatedTotalDebt = previousBalance + invoiceData.remainingAmount;
        } else if (invoiceData.type === 'purchase') {
          calculatedTotalDebt = previousBalance - invoiceData.remainingAmount;
        } else if (invoiceData.type === 'sale_return') {
          calculatedTotalDebt = previousBalance - invoiceData.grandTotal;
        } else if (invoiceData.type === 'purchase_return') {
          calculatedTotalDebt = previousBalance + invoiceData.grandTotal;
        } else {
          calculatedTotalDebt = previousBalance + invoiceData.remainingAmount;
        }
      }

      // شناسه یکتا (UUID) - در صورت ارائه شناسه مشخص (مانند ویرایش سند با حفظ قطعی UUID)، از همان استفاده می‌شود
      const invoiceId = explicitInvoiceId || (invoiceData as any).id || HabinoAccountingKernel.generateUUID();
      const newInvoice: Invoice = {
        ...invoiceData,
        id: invoiceId,
        tenantId,
        items: sanitizedItems,
        metadata: sanitizedMeta,
        previousBalance,
        totalDebt: calculatedTotalDebt,
        created_at: createdAt
      };

      // ۱. ذخیره سند در جدول سندها
      snapshot.invoices.unshift(newInvoice);

      // ۲. ایجاد ردیف‌های متناظر در دفتر کل (General Ledger)
      if (!isProforma) {
        const doubleEntries = HabinoAccountingKernel.createDoubleEntryForInvoice(newInvoice, tenantId);
        if (!doubleEntries || doubleEntries.length === 0) {
          throw new Error('خطا در محاسبه اسناد دوبل دفتر کل.');
        }
        snapshot.accountingEntries.push(...doubleEntries.map(entry => ({
          ...entry,
          created_at: createdAt
        })));

        // ۳. به‌روزرسانی مانده در حساب اشخاص (Client Account)
        const targetClient = snapshot.clients[clientIndex];

        let balanceDelta = 0;
        const returnIsPaidInCash = isReturn &&
          newInvoice.metadata?.returnSettlementMethod === 'cash';
        if (newInvoice.type === 'sale' || newInvoice.type === 'service') {
          // در فروش: مشتری به اندازه باقیمانده تسویه‌نشده بدهکار می‌شود (مثبت)
          balanceDelta = newInvoice.remainingAmount;
        } else if (newInvoice.type === 'purchase') {
          // در خرید: تأمین‌کننده بستانکار می‌شود (منفی)
          balanceDelta = -newInvoice.remainingAmount;
        } else if (newInvoice.type === 'sale_return' && !returnIsPaidInCash) {
          // برگشت از فروش: بستانکاری مشتری
          balanceDelta = -newInvoice.grandTotal;
        } else if (newInvoice.type === 'purchase_return' && !returnIsPaidInCash) {
          // برگشت از خرید: بدهکاری تأمین‌کننده
          balanceDelta = newInvoice.grandTotal;
        }

        snapshot.clients[clientIndex] = {
          ...targetClient,
          balance: previousBalance + balanceDelta
        };

        // ۴. ثبت تراکنش صندوق/بانک در صورت پرداخت نقدی فوری
        if (newInvoice.amountPaid > 0) {
          const isExpense = newInvoice.type === 'purchase' || newInvoice.type === 'sale_return';
          const categoryTitle = 
            newInvoice.type === 'purchase' ? 'خرید کالا و خدمات' :
            newInvoice.type === 'sale_return' ? 'مرجوعی از فروش' :
            newInvoice.type === 'purchase_return' ? 'استرداد خرید' :
            'درآمد فروش / خدمات';

          const newTx: Transaction = {
            id: HabinoAccountingKernel.generateUUID(),
            tenantId,
            date: newInvoice.date,
            type: isExpense ? 'expense' : 'income',
            category: categoryTitle,
            amount: newInvoice.amountPaid,
            description: `${isExpense ? 'پرداخت وجه' : 'دریافت وجه'} فاکتور شماره ${newInvoice.invoiceNumber}`,
            clientId: newInvoice.clientId,
            clientName: newInvoice.clientName,
            projectId: newInvoice.projectId, // فقط برچسب پروژه
            relatedInvoiceId: newInvoice.id,
            created_at: createdAt
          };
          snapshot.transactions.unshift(newTx);
        }

        // ۵. به‌روزرسانی موجودی انبار کالاها (Inventory & Invoices Synergy)
        if (snapshot.inventory && newInvoice.items && newInvoice.items.length > 0) {
          for (const item of newInvoice.items) {
            const qty = Number(item.quantity) || 1;
            const invIndex = snapshot.inventory.findIndex(inv => 
              (item.itemId && inv.id === item.itemId) ||
              inv.id === item.id || (item.description && inv.name && inv.name.trim().toLowerCase() === item.description.trim().toLowerCase()) ||
              (item.code && inv.code && inv.code.trim() === item.code.trim())
            );

            if (invIndex !== -1 && snapshot.inventory[invIndex].type !== 'service') {
              const currentStock = Number(snapshot.inventory[invIndex].stock) || 0;
              let stockDelta = 0;
              if (newInvoice.type === 'sale' || newInvoice.type === 'service') {
                if (newInvoice.type === 'sale' && currentStock < qty) {
                  throw new Error(
                    `موجودی کالای «${snapshot.inventory[invIndex].name}» کافی نیست. موجودی فعلی: ${currentStock}، مقدار موردنیاز: ${qty}.`
                  );
                }
                stockDelta = -qty;
              } else if (newInvoice.type === 'purchase') {
                stockDelta = qty;
              } else if (newInvoice.type === 'sale_return') {
                stockDelta = qty;
              } else if (newInvoice.type === 'purchase_return') {
                if (currentStock < qty) {
                  throw new Error(`موجودی کالای «${item.description}» برای ثبت برگشت خرید کافی نیست.`);
                }
                stockDelta = -qty;
              }
              snapshot.inventory[invIndex] = {
                ...snapshot.inventory[invIndex],
                stock: Math.max(0, currentStock + stockDelta),
                buyPrice: newInvoice.type === 'purchase' ? Number(item.unitPrice) || snapshot.inventory[invIndex].buyPrice : snapshot.inventory[invIndex].buyPrice
              };
            }
          }
        }
      }

      // 🛡️ ثبت رویداد حسابداری مطابق گره ۱ بخش ۸.۳ کتابخانه دانش (ممنوعیت مطلق ثبت مبالغ)
      habinoFinancialAuditLogger.logEvent('TRANSACTION_POSTED', {
        docIdentifier: newInvoice.invoiceNumber ? `INV-${newInvoice.invoiceNumber}` : newInvoice.id,
        tenantId,
        status: 'SUCCESS',
        summaryFa: `ثبت قطعی و متوازن سند فاکتور شماره #${newInvoice.invoiceNumber || newInvoice.id}`,
        metadata: {
          invoiceId: newInvoice.id,
          type: newInvoice.type,
          isProforma
        }
      });

      return { nextState: snapshot, invoice: newInvoice };
    } catch (error: any) {
      // 🛡️ ثبت رول‌بک قطعی مطابق گره ۲ بخش ۸.۳ (INVARIANT_VIOLATION_ROLLBACK): هیچ تغییری ذخیره نمی‌شود
      habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
        docIdentifier: invoiceData.invoiceNumber ? `INV-${invoiceData.invoiceNumber}` : 'UNKNOWN',
        tenantId,
        status: 'ROLLBACK',
        summaryFa: `تراکنش ثبت سند با خطا متوقف و عملیات بازگشت (Rollback) اعمال گردید: ${error?.message || error}`,
        metadata: { error: error?.message || String(error) }
      });
      console.warn('[AtomicTransactionWrapper] Transaction aborted. Rolling back:', error?.message || error);
      const msg = error?.message?.includes('برگشت') || error?.message?.includes('مرجع') || error?.message?.includes('تسویه نقدی') || error?.message?.includes('فاکتور برگشت') || error?.message?.includes('بازپرداخت') || error?.message?.includes('موجودی')
        ? error.message
        : error?.message?.includes('فهرست طرف‌های حساب')
        ? error.message
        : error?.message?.includes('مخاطب')
        ? 'ثبت سند بدون انتخاب مخاطب مجاز نیست.' 
        : error?.message?.includes('مبلغ')
        ? 'مبلغ سند نامعتبر است.'
        : 'خطا در ثبت سند. هیچ تغییری ذخیره نشد.';
      throw new Error(msg);
    } finally {
      releaseReturnLock?.();
    }
  }

  /**
   * 🧩 ۳) اصول حذف سند با آبشار کامل، بازگشت مانده‌ها و پشتیبانی از Soft Delete
   */
  public static atomicDeleteInvoice(
    currentState: FinancialStateSnapshot,
    invoiceId: string,
    softDelete: boolean = false
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const target = snapshot.invoices.find(inv => inv.id === invoiceId);
      if (!target) {
        throw new Error('سند موردنظر یافت نشد.');
      }
      const invoiceInstallments = snapshot.installments.filter(inst => inst.invoiceId === invoiceId);
      if (invoiceInstallments.some(inst => Number(inst.paidAmount) > 0)) {
        throw new Error('فاکتور دارای قسط وصول‌شده یا وصول جزئی است؛ برای حفظ سوابق مالی، حذف آن مجاز نیست و باید سند اصلاحی ثبت شود.');
      }
      if (snapshot.checks.some(check =>
        check.relatedInstallmentId && invoiceInstallments.some(inst => inst.id === check.relatedInstallmentId)
      )) {
        throw new Error('فاکتور دارای چک مرتبط با قسط است؛ ابتدا چک را تعیین تکلیف کنید.');
      }
      const linkedReturns = snapshot.invoices.filter(invoice =>
        invoice.metadata?.originalInvoiceId === target.id &&
        (invoice.type === 'sale_return' || invoice.type === 'purchase_return') &&
        invoice.status !== 'cancelled' &&
        !invoice.is_deleted
      );
      if (linkedReturns.length > 0) {
        throw new Error('حذف فاکتور اصلی دارای اسناد برگشت فعال مجاز نیست؛ ابتدا اسناد برگشت را تعیین تکلیف کنید.');
      }

      // ۱. اصلاح و تعدیل حساب مخاطب (برگشت مانده)
      if (target.clientId) {
        const clientIndex = snapshot.clients.findIndex(c => c.id === target.clientId);
        if (clientIndex !== -1) {
          const targetClient = snapshot.clients[clientIndex];
          const curBal = Number(targetClient.balance) || 0;
          const remainingAmt = Number(target.remainingAmount) || 0;
          const grandTot = Number(target.grandTotal) || 0;

          let balanceReversion = 0;
          if (target.type === 'sale' || target.type === 'service') {
            balanceReversion = -remainingAmt;
          } else if (target.type === 'purchase') {
            balanceReversion = remainingAmt;
          } else if (target.type === 'sale_return' && target.metadata?.returnSettlementMethod !== 'cash') {
            balanceReversion = grandTot;
          } else if (target.type === 'purchase_return' && target.metadata?.returnSettlementMethod !== 'cash') {
            balanceReversion = -grandTot;
          }

          snapshot.clients[clientIndex] = {
            ...targetClient,
            balance: curBal + balanceReversion
          };
        }
      }

      // ۲. حذف یا نشانه‌گذاری در جدول سندها
      if (softDelete) {
        const nowIso = new Date().toISOString();
        snapshot.invoices = snapshot.invoices.map(inv => {
          if (inv.id === invoiceId) {
            return {
              ...inv,
              is_deleted: true,
              deleted_at: nowIso,
              metadata: {
                ...(inv.metadata || {}),
                is_deleted: true,
                deleted_at: nowIso
              }
            };
          }
          return inv;
        });
      } else {
        snapshot.invoices = snapshot.invoices.filter(inv => inv.id !== invoiceId);
      }

      // ۳. حذف تمام ردیف‌های دفتر کل مرتبط با شماره سند یا شناسه فاکتور
      const targetDocNum = String(target.invoiceNumber || '').trim();
      snapshot.accountingEntries = snapshot.accountingEntries.filter(
        entry => {
          if (!entry) return false;
          if (entry.referenceId && entry.referenceId === invoiceId) return false;
          if (targetDocNum && entry.documentNumber && String(entry.documentNumber).includes(targetDocNum)) return false;
          return true;
        }
      );

      // ۴. حذف تراکنش‌های نقد مرتبط و بازگردانی بودجه/درآمد پروژه‌ها
      const relatedTxs = snapshot.transactions.filter(
        tx => tx && (tx.relatedInvoiceId === invoiceId ||
              (targetDocNum && tx.description && String(tx.description).includes(`شماره ${targetDocNum}`)))
      );

      for (const tx of relatedTxs) {
        if (tx.projectId) {
          const prjIndex = snapshot.projects.findIndex(p => p.id === tx.projectId);
          if (prjIndex !== -1) {
            const prj = snapshot.projects[prjIndex];
            if (tx.type === 'income') {
              snapshot.projects[prjIndex] = {
                ...prj,
                totalIncome: Math.max(0, (prj.totalIncome || 0) - tx.amount)
              };
            } else {
              snapshot.projects[prjIndex] = {
                ...prj,
                totalExpense: Math.max(0, (prj.totalExpense || 0) - tx.amount)
              };
            }
          }
        }
      }

      snapshot.transactions = snapshot.transactions.filter(
        tx => tx && tx.relatedInvoiceId !== invoiceId &&
              !(targetDocNum && tx.description && String(tx.description).includes(`شماره ${targetDocNum}`))
      );

      // ۵. حذف اقساط مرتبط
      snapshot.installments = snapshot.installments.filter(
        inst => inst && inst.invoiceId !== invoiceId
      );

      // ۶. حذف یا خنثی‌سازی چک‌های متصل
      const installmentIds = new Set(invoiceInstallments.map(inst => inst.id));
      snapshot.checks = snapshot.checks.filter(
        chk => chk && chk.relatedInvoiceId !== invoiceId && !installmentIds.has(chk.relatedInstallmentId || '')
      );

      // ۷. بازگردانی موجودی انبار کالاها (Inventory Stock Reversion)
      if (snapshot.inventory && target.items && target.items.length > 0) {
        for (const item of target.items) {
          if (!item) continue;
          const qty = Number(item.quantity) || 1;
          const invIndex = snapshot.inventory.findIndex(inv => 
            inv && (
              (item.itemId && inv.id === item.itemId) ||
              inv.id === item.id ||
              (item.description && inv.name && inv.name.trim().toLowerCase() === item.description.trim().toLowerCase()) ||
              (item.code && inv.code && inv.code.trim() === item.code.trim())
            )
          );

          if (invIndex !== -1 && snapshot.inventory[invIndex].type !== 'service') {
            const currentStock = Number(snapshot.inventory[invIndex].stock) || 0;
            let stockDelta = 0;
            if (target.type === 'sale' || target.type === 'service') {
              stockDelta = qty; // برگشت به انبار
            } else if (target.type === 'purchase') {
              stockDelta = -qty;
            } else if (target.type === 'sale_return') {
              stockDelta = -qty;
            } else if (target.type === 'purchase_return') {
              stockDelta = qty;
            }
            snapshot.inventory[invIndex] = {
              ...snapshot.inventory[invIndex],
              stock: Math.max(0, currentStock + stockDelta)
            };
          }
        }
      }

      // 🛡️ ثبت رویداد ابطال سند مطابق گره ۱ بخش ۸.۳ کتابخانه دانش
      habinoFinancialAuditLogger.logEvent('TRANSACTION_VOIDED', {
        docIdentifier: target.invoiceNumber ? `INV-${target.invoiceNumber}` : target.id,
        status: 'SUCCESS',
        summaryFa: `ابطال و حذف سند شماره #${target.invoiceNumber || target.id}`,
        metadata: { invoiceId, softDelete }
      });

      // 🛡️ ثبت رخداد پاکسازی آبشاری بدون رکورد یتیم مطابق گره ۳ بخش ۸.۳
      habinoFinancialAuditLogger.logEvent('CASCADE_MUTATION', {
        docIdentifier: target.invoiceNumber ? `INV-${target.invoiceNumber}` : target.id,
        status: 'SUCCESS',
        summaryFa: `حذف آبشاری و متقارن ردیف‌های متناظر دفتر کل و اسناد شخص بدون ایجاد رکورد یتیم`,
        metadata: { invoiceId }
      });

      return snapshot;
    } catch (error: any) {
      habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
        docIdentifier: invoiceId,
        status: 'ROLLBACK',
        summaryFa: `عملیات حذف سند با خطا مواجه شد و برگشت (Rollback) اعمال گردید: ${error?.message || error}`,
        metadata: { invoiceId, error: error?.message || String(error) }
      });
      console.warn('[AtomicTransactionWrapper] Delete failed. Rolling back:', error?.message || error);
      if (error?.message === 'سند موردنظر یافت نشد.') {
        throw error;
      }
      throw new Error(error?.message || 'حذف سند ناموفق بود. هیچ تغییری اعمال نشد.');
    }
  }

  /**
   * 🧩 ۴) اصول ویرایش سند با بازسازی کامل و حفظ یکتایی UUID
   * - قفل‌گذاری همزمانی روی سند و طرف‌حساب‌های متأثر
   * - در صورت تغییر طرف‌حساب، تسویه کامل طرف‌حساب پیشین و اعمال دقیق روی طرف‌حساب جدید
   * - اعتبارسنجی سقف اعتبار برای طرف‌حساب جدید
   */
  public static atomicUpdateInvoice(
    currentState: FinancialStateSnapshot,
    invoiceId: string,
    updates: Partial<Invoice>,
    tenantId: string
  ): { nextState: FinancialStateSnapshot; invoice: Invoice } {
    // ۱. بررسی وجود سند
    const existing = currentState.invoices.find(inv => inv.id === invoiceId);
    if (!existing) {
      throw new Error('سند موردنظر یافت نشد.');
    }
    if (
      currentState.installments.some(item => item.invoiceId === existing.id) ||
      existing.metadata?.installmentPlan
    ) {
      throw new Error('فاکتور دارای برنامه اقساط تأییدشده است؛ ویرایش مستقیم آن مجاز نیست و باید سند اصلاحی ثبت شود.');
    }
    const returnTypes: Invoice['type'][] = ['sale_return', 'purchase_return'];
    if (
      updates.type !== undefined &&
      updates.type !== existing.type &&
      (returnTypes.includes(existing.type) || returnTypes.includes(updates.type))
    ) {
      throw new Error('نوع سند برگشت قابل تغییر نیست و اسناد برگشت فقط از مسیر ارجاع به فاکتور اصلی صادر می‌شوند.');
    }
    const isDraft = existing.status === 'draft' ||
      ['proforma', 'proforma_sale', 'proforma_purchase'].includes(existing.type);
    if (!isDraft) {
      const protectedFields: (keyof Invoice)[] = [
        'invoiceNumber', 'clientId', 'client_id', 'clientName', 'type', 'date', 'dueDate',
        'items', 'subtotal', 'totalDiscount', 'totalTax', 'grandTotal',
        'previousBalance', 'totalDebt', 'notes', 'terms', 'projectId'
      ];
      const hasDocumentEdits = protectedFields.some(key =>
        updates[key] !== undefined &&
        JSON.stringify(updates[key]) !== JSON.stringify(existing[key])
      );
      if (hasDocumentEdits) {
        throw new Error('اطلاعات مالی سند ثبت‌شده قفل است؛ برای اصلاح، سند اصلاحی ثبت کنید.');
      }
      if (
        updates.status !== undefined &&
        updates.status !== existing.status &&
        (existing.status === 'cancelled' || !['pending', 'paid', 'overdue'].includes(updates.status))
      ) {
        throw new Error('وضعیت سند ثبت‌شده فقط از مسیر عملیاتی مجاز قابل تغییر است.');
      }
    }
    const hasLinkedReturns = currentState.invoices.some(invoice =>
      invoice.metadata?.originalInvoiceId === existing.id &&
      (invoice.type === 'sale_return' || invoice.type === 'purchase_return') &&
      invoice.status !== 'cancelled' &&
      !invoice.is_deleted
    );
    if (hasLinkedReturns && updates.clientId && updates.clientId !== existing.clientId) {
      throw new Error('تغییر طرف‌حساب فاکتور دارای اسناد برگشت فعال مجاز نیست.');
    }
    if (hasLinkedReturns && updates.items) {
      const returnedQuantities = getReturnedQuantities(existing, currentState.invoices);
      for (const originalItem of existing.items) {
        if ((returnedQuantities[originalItem.id] || 0) <= 0) continue;
        const updatedItem = updates.items.find(item => item.id === originalItem.id);
        if (
          !updatedItem ||
          updatedItem.quantity < returnedQuantities[originalItem.id] ||
          updatedItem.unitPrice !== originalItem.unitPrice ||
          updatedItem.discount !== originalItem.discount ||
          updatedItem.taxRate !== originalItem.taxRate
        ) {
          throw new Error(`تغییر قلم «${originalItem.description}» پس از ثبت برگشت مرتبط مجاز نیست.`);
        }
      }
      if (hasLinkedReturns && updates.amountPaid !== undefined) {
        const cashRefunded = currentState.invoices
          .filter(invoice =>
            invoice.metadata?.originalInvoiceId === existing.id &&
            invoice.metadata?.returnSettlementMethod === 'cash' &&
            (invoice.type === 'sale_return' || invoice.type === 'purchase_return') &&
            invoice.status !== 'cancelled' &&
            !invoice.is_deleted
          )
          .reduce((total, invoice) => total + (Number(invoice.amountPaid) || 0), 0);
        if (updates.amountPaid < cashRefunded - 0.01) {
          throw new Error('مبلغ پرداختی فاکتور اصلی از مجموع بازپرداخت نقدی اسناد برگشت کمتر نمی‌تواند باشد.');
        }
      }
    }

    // بررسی قفل همزمانی روی رکوردها
    const lockKeys = [invoiceId, existing.clientId];
    if (updates.clientId && updates.clientId !== existing.clientId) {
      lockKeys.push(updates.clientId);
    }
    const releaseLocks = HabinoRecordLockManager.tryLock(lockKeys);

    try {
      // ۲. نسخه قبلی سند را کاملاً حذف کن (Rollback موقت اثرات نسخه قبلی در تمام دفاتر)
      const clearedState = this.atomicDeleteInvoice(currentState, invoiceId);

      // ۳. سناریوی تغییر طرف‌حساب (Client Change Handling)
      const isClientChanged = updates.clientId && updates.clientId !== existing.clientId;
      const isProforma = (existing.type === 'proforma' || updates.type === 'proforma' || 
                          existing.type === 'proforma_sale' || updates.type === 'proforma_sale' || 
                          existing.type === 'proforma_purchase' || updates.type === 'proforma_purchase');
      let newClientName = updates.clientName || existing.clientName;

      if (isClientChanged) {
        let newClient = clearedState.clients.find(c => c.id === updates.clientId);
        if (!newClient && updates.clientName) {
          newClient = clearedState.clients.find(c => c.name === updates.clientName);
        }
        if (!newClient) {
          if (isProforma || updates.clientId === 'client-inquiry-neutral' || !updates.clientId) {
            const fallbackClientId = updates.clientId || 'client-inquiry-neutral';
            newClient = {
              id: fallbackClientId,
              name: updates.clientName || existing.clientName || 'متقاضی استعلام (پیش‌فاکتور)',
              tenantId,
              balance: 0,
              type: 'individual'
            };
            clearedState.clients.push(newClient);
          } else {
            throw new Error('طرف‌حساب انتخابی جدید در سیستم یافت نشد.');
          }
        }
        newClientName = newClient.name;

        // اعتبارسنجی سقف اعتبار طرف‌حساب جدید (فقط برای فاکتورهای قطعی فروش و خدمات)
        if (!isProforma) {
          const projectedDebt = (updates.remainingAmount !== undefined ? updates.remainingAmount : existing.remainingAmount) || 0;
          const creditValidation = HabinoAccountingKernel.validateCreditLimit(newClient, projectedDebt);
          if (creditValidation.isExceeded) {
            console.warn(`[Habino Accounting] هشدار سقف اعتبار:`, creditValidation.messageFa);
          }
        }
      }

      // ۴. ترکیب اطلاعات جدید با حفظ دقیق همان UUID و داده‌های امضا و اشتراک
      const mergedInvoiceData: Omit<Invoice, 'id'> & { id?: string } = {
        ...existing,
        ...updates,
        id: invoiceId,
        clientName: newClientName,
        tenantId,
        signatureUrl: updates.signatureUrl !== undefined ? updates.signatureUrl : existing.signatureUrl,
        isSigned: updates.isSigned !== undefined ? updates.isSigned : existing.isSigned,
        signedAt: updates.signedAt !== undefined ? updates.signedAt : existing.signedAt,
        shareToken: updates.shareToken !== undefined ? updates.shareToken : existing.shareToken,
        signatureMetadata: updates.signatureMetadata !== undefined ? updates.signatureMetadata : existing.signatureMetadata,
        // در صورت تغییر طرف‌حساب، مانده پیشین و بدهی نهایی از حساب طرف‌حساب جدید بازسازی خواهد شد
        ...(isClientChanged ? { previousBalance: undefined, totalDebt: undefined } : {})
      };

      // ۵. بازسازی نسخه جدید سند در دفتر کل و حساب اشخاص با حفظ قطعی همان UUID
      const { nextState, invoice } = this.atomicRegisterInvoice(
        clearedState, 
        mergedInvoiceData, 
        tenantId,
        invoiceId
      );

      return { nextState, invoice };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Update failed. Rolling back to original state:', error?.message || error);
      if (error?.message === 'سند موردنظر یافت نشد.' || error?.message?.includes('طرف‌حساب')) {
        throw error;
      }
      throw new Error(error?.message || 'خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
    } finally {
      if (releaseLocks) {
        releaseLocks();
      }
    }
  }

  /**
   * 🧩 ۶) ثبت پیش‌پرداخت پروژه به صورت اتمیک
   */
  public static atomicRegisterProjectAdvance(
    currentState: FinancialStateSnapshot,
    params: {
      projectId: string;
      amount: number;
      date: string;
      description: string;
      tenantId: string;
    }
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const project = snapshot.projects.find(p => p.id === params.projectId);
      if (!project) {
        throw new Error('پروژه موردنظر یافت نشد.');
      }

      if (!project.clientId) {
        throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
      }

      if (params.amount <= 0) {
        throw new Error('مبلغ سند نامعتبر است.');
      }

      // ایجاد رکوردهای دوبل دفتر کل
      const entries = HabinoAccountingKernel.createProjectAdvanceEntry({
        project,
        amount: params.amount,
        date: params.date,
        description: params.description,
        tenantId: params.tenantId
      });
      snapshot.accountingEntries.push(...entries);

      // ثبت در حساب کارفرما (کاهش بدهی کارفرما یا ایجاد بستانکاری)
      const clientIndex = snapshot.clients.findIndex(c => c.id === project.clientId);
      if (clientIndex !== -1) {
        const client = snapshot.clients[clientIndex];
        snapshot.clients[clientIndex] = {
          ...client,
          balance: (client.balance || 0) - params.amount
        };
      }

      // ثبت تراکنش دریافت نقدی
      snapshot.transactions.unshift({
        id: HabinoAccountingKernel.generateUUID(),
        tenantId: params.tenantId,
        date: params.date,
        type: 'income',
        category: 'پیش‌پرداخت پروژه',
        amount: params.amount,
        description: `پیش‌دریافت پروژه: ${project.title} - ${params.description}`,
        clientId: project.clientId,
        clientName: project.clientName,
        projectId: project.id // فقط برچسب پروژه
      });

      return snapshot;
    } catch (error) {
      console.warn('[AtomicTransactionWrapper] Project advance failed:', error);
      throw new Error('خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
    }
  }

  /**
   * 🧩 ۷) ثبت سود پروژه به صورت اتمیک
   */
  public static atomicCloseProjectProfit(
    currentState: FinancialStateSnapshot,
    params: {
      projectId: string;
      date: string;
      tenantId: string;
    }
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const projectIndex = snapshot.projects.findIndex(p => p.id === params.projectId);
      if (projectIndex === -1) {
        throw new Error('پروژه موردنظر یافت نشد.');
      }

      const project = snapshot.projects[projectIndex];
      const netProfit = project.netProfit || ((project.totalIncome || 0) - (project.totalExpense || 0));

      if (netProfit === 0) {
        throw new Error('مبلغ سند نامعتبر است.');
      }

      // ایجاد رکوردهای دوبل سود در دفتر کل
      const entries = HabinoAccountingKernel.createProjectProfitEntry({
        project,
        netProfit,
        date: params.date,
        tenantId: params.tenantId
      });
      snapshot.accountingEntries.push(...entries);

      // علامت‌گذاری پروژه به عنوان تکمیل‌شده
      snapshot.projects[projectIndex] = {
        ...project,
        status: 'completed'
      };

      return snapshot;
    } catch (error) {
      console.warn('[AtomicTransactionWrapper] Close project profit failed:', error);
      throw new Error('خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
    }
  }

  /**
   * 🧩 ۲) ثبت اتمیک تراکنش مالی (درآمد / هزینه / صندوق و بانک)
   * با ایجاد ردیف‌های متناظر در دفتر کل و به‌روزرسانی مانده مخاطب
   */
  public static atomicRegisterTransaction(
    currentState: FinancialStateSnapshot,
    txData: Omit<Transaction, 'id'>,
    tenantId: string
  ): { nextState: FinancialStateSnapshot; transaction: Transaction } {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const purpose = getTransactionPurpose(txData as Transaction);
      const isPartnerCurrentTransaction = purpose === 'owner_contribution' || purpose === 'owner_withdrawal';
      const hasPartnerDetail = Boolean(txData.partnerTafsiliCode?.trim() && txData.partnerTafsiliTitle?.trim());
      // 🧩 ۱) بررسی انتخاب مخاطب
      if ((!txData.clientId || txData.clientId.trim() === '') && !(isPartnerCurrentTransaction && hasPartnerDetail)) {
        throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
      }

      // بررسی وجود مخاطب
      const clientIndex = txData.clientId
        ? snapshot.clients.findIndex(c => c.id === txData.clientId && (!c.tenantId || c.tenantId === tenantId))
        : -1;
      if (clientIndex === -1 && !(isPartnerCurrentTransaction && hasPartnerDetail)) {
        throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
      }

      // بررسی مبلغ
      if (!txData.amount || txData.amount <= 0) {
        throw new Error('مبلغ سند نامعتبر است.');
      }

      const client = clientIndex >= 0 ? snapshot.clients[clientIndex] : undefined;
      const txId = HabinoAccountingKernel.generateUUID();
      if (
        isPartnerCurrentTransaction && !hasPartnerDetail
      ) {
        throw new Error('برای ثبت آورده یا برداشت، تفصیلی شریک الزامی است.');
      }
      const accountDetails = getAllAccountMoeins();
      const cashAccount = txData.cashAccountId
        ? snapshot.bankAccounts?.find(account =>
            account.id === txData.cashAccountId && (!account.tenantId || account.tenantId === tenantId)
          )
        : undefined;
      const destinationAccount = txData.destinationAccountId
        ? snapshot.bankAccounts?.find(account =>
            account.id === txData.destinationAccountId && (!account.tenantId || account.tenantId === tenantId)
          )
        : undefined;
      if (!cashAccount) {
        throw new Error('انتخاب حساب صندوق یا بانک مبدأ الزامی است.');
      }
      if (purpose === 'transfer') {
        if (!destinationAccount) throw new Error('انتخاب حساب مقصد انتقال الزامی است.');
        if (destinationAccount.id === cashAccount.id) throw new Error('حساب مبدأ و مقصد انتقال باید متفاوت باشند.');
      } else if (txData.type === 'transfer') {
        throw new Error('نوع رویداد و ماهیت حسابداری تراکنش با هم سازگار نیستند.');
      }

      const selectedCounterAccountCode = getTransactionAccountCode(txData as Transaction);
      const counterAccount = selectedCounterAccountCode
        ? accountDetails.find(account => account.code === selectedCounterAccountCode)
        : undefined;
      if (purpose !== 'transfer') {
        if (!counterAccount) throw new Error('انتخاب حساب مقابل از کدینگ حساب‌ها الزامی است.');
        if (!isTransactionCounterAccountAllowed(purpose, counterAccount.code, counterAccount.groupCode)) {
          throw new Error('حساب انتخاب‌شده با نوع رویداد مالی سازگار نیست.');
        }
      }
      if (txData.type !== 'income' &&
        (Number(cashAccount.balance) || 0) < Number(txData.amount)) {
        throw new Error(
          cashAccount.accountType === 'cash'
            ? 'موجودی صندوق برای ثبت این پرداخت کافی نیست.'
            : 'موجودی حساب بانکی مبدأ برای ثبت این پرداخت یا انتقال کافی نیست.'
        );
      }
      if (txData.type !== 'transfer' && txData.type !== ([
        'revenue', 'receivable_collection', 'customer_advance', 'loan_proceeds', 'owner_contribution'
      ].includes(purpose) ? 'income' : 'expense')) {
        throw new Error('نوع رویداد و ماهیت حسابداری تراکنش با هم سازگار نیستند.');
      }

      const createdAt = txData.created_at || getCurrentDocumentTimestamp();
      const newTx: Transaction = {
        ...txData,
        id: txId,
        tenantId,
        clientName: txData.clientName || client?.name || txData.partnerTafsiliTitle || '',
        created_at: createdAt
      };

      // ۱. ذخیره در جدول تراکنش‌ها
      snapshot.transactions.unshift(newTx);

      // ۲. ایجاد رکوردهای متناظر در دفتر کل (General Ledger)
      const doubleEntries = HabinoAccountingKernel.createDoubleEntryForTransaction(
        newTx,
        tenantId,
        cashAccount ? cashAccount.accountType || 'bank' : undefined,
        {
          cashAccountCode: cashAccount?.accountCode,
          cashAccountTitle: cashAccount?.accountTitle,
          counterAccountCode: counterAccount?.code,
          counterAccountTitle: counterAccount?.title,
          counterTafsiliCode: txData.partnerTafsiliCode,
          counterTafsiliTitle: txData.partnerTafsiliTitle,
          counterTafsiliType: txData.partnerTafsiliCode ? 'partner' : undefined,
          destinationAccountCode: destinationAccount?.accountCode,
          destinationAccountTitle: destinationAccount?.accountTitle || destinationAccount?.bankName
        }
      );
      snapshot.accountingEntries.push(...doubleEntries.map(entry => ({
        ...entry,
        created_at: createdAt
      })));
      if (snapshot.bankAccounts) {
        const sourceDelta = newTx.type === 'income' ? newTx.amount : -newTx.amount;
        snapshot.bankAccounts = snapshot.bankAccounts.map(account =>
          account.id === cashAccount.id || account.id === destinationAccount?.id
            ? {
                ...account,
                balance: Number(account.balance || 0) +
                  (account.id === cashAccount.id ? sourceDelta : newTx.amount)
              }
            : account
        );
      }

      const partyBalanceDelta = getTransactionPartyBalanceDelta(newTx);
      if (partyBalanceDelta !== 0 && client) {
        snapshot.clients[clientIndex] = {
          ...client,
          balance: (client.balance || 0) + partyBalanceDelta
        };
      }

      // ۴. اگر برچسب پروژه دارد، فقط برچسب ذخیره می‌شود و مجموع درآمدهای پروژه به‌روز می‌شود
      if (newTx.projectId) {
        const prjIndex = snapshot.projects.findIndex(p => p.id === newTx.projectId);
        if (prjIndex !== -1) {
          const prj = snapshot.projects[prjIndex];
          if (purpose === 'revenue') {
            snapshot.projects[prjIndex] = {
              ...prj,
              totalIncome: (prj.totalIncome || 0) + newTx.amount
            };
          } else if (purpose === 'expense') {
            snapshot.projects[prjIndex] = {
              ...prj,
              totalExpense: (prj.totalExpense || 0) + newTx.amount
            };
          }
        }
      }

      return { nextState: snapshot, transaction: newTx };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Transaction creation failed. Rolling back:', error?.message || error);
      const msg = error?.message?.includes('مخاطب')
        ? 'ثبت سند بدون انتخاب مخاطب مجاز نیست.'
        : error?.message?.includes('مبلغ')
        ? 'مبلغ سند نامعتبر است.'
        : error?.message?.includes('صندوق') || error?.message?.includes('حساب بانکی')
        ? error.message
        : 'خطا در ثبت سند. هیچ تغییری ذخیره نشد.';
      throw new Error(msg);
    }
  }

  /**
   * 🧩 ۳) حذف اتمیک تراکنش مالی و بازگشت کامل مانده‌ها
   */
  public static atomicDeleteTransaction(
    currentState: FinancialStateSnapshot,
    transactionId: string
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const target = snapshot.transactions.find(tx => tx.id === transactionId);
      if (!target) {
        throw new Error('سند موردنظر یافت نشد.');
      }

      // ۱. برگشت اثر مالی روی مانده حساب اشخاص
      if (target.clientId) {
        const clientIndex = snapshot.clients.findIndex(c => c.id === target.clientId);
        if (clientIndex !== -1) {
          const client = snapshot.clients[clientIndex];
          const balanceReversion = -getTransactionPartyBalanceDelta(target);
          snapshot.clients[clientIndex] = {
            ...client,
            balance: (client.balance || 0) + balanceReversion
          };
        }
      }

      if (snapshot.bankAccounts) {
        const accountDelta = target.type === 'income' ? -target.amount : target.amount;
        snapshot.bankAccounts = snapshot.bankAccounts.map(account =>
          account.id === target.cashAccountId
            ? { ...account, balance: Number(account.balance || 0) + accountDelta }
            : account.id === target.destinationAccountId
            ? { ...account, balance: Number(account.balance || 0) - target.amount }
            : account
        );
      }

      // ۲. برگشت برچسب پروژه در صورت وجود
      if (target.projectId) {
        const prjIndex = snapshot.projects.findIndex(p => p.id === target.projectId);
        if (prjIndex !== -1) {
          const prj = snapshot.projects[prjIndex];
          const purpose = getTransactionPurpose(target);
          if (purpose === 'revenue') {
            snapshot.projects[prjIndex] = {
              ...prj,
              totalIncome: Math.max(0, (prj.totalIncome || 0) - target.amount)
            };
          } else if (purpose === 'expense') {
            snapshot.projects[prjIndex] = {
              ...prj,
              totalExpense: Math.max(0, (prj.totalExpense || 0) - target.amount)
            };
          }
        }
      }

      // ۳. حذف رکوردهای دفتر کل متناظر با این تراکنش
      const docPrefix = `DOC-TX-${target.id.slice(0, 8)}`;
      snapshot.accountingEntries = snapshot.accountingEntries.filter(
        e => !e.documentNumber.includes(docPrefix)
      );

      // ۴. حذف از جدول تراکنش‌ها
      snapshot.transactions = snapshot.transactions.filter(tx => tx.id !== transactionId);

      return snapshot;
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Transaction deletion failed. Rolling back:', error?.message || error);
      if (error?.message === 'سند موردنظر یافت نشد.') {
        throw error;
      }
      throw new Error('حذف سند ناموفق بود. هیچ تغییری اعمال نشد.');
    }
  }

  /**
   * 🧩 ۲) ثبت اتمیک سند چک (صیادی / عادی) در جریان وصول یا واگذاری
   */
  public static atomicRegisterCheck(
    currentState: FinancialStateSnapshot,
    checkData: Omit<Check, 'id'>,
    tenantId: string
  ): { nextState: FinancialStateSnapshot; check: Check } {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const rawCId = checkData.clientId;
      if (!rawCId || String(rawCId).trim() === '') {
        throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
      }

      const cleanClientId = String(rawCId).trim();
      const forbiddenKeywords = ['null', 'undefined', 'nan', '[object object]', '0', 'none', 'false', '""', "''"];
      if (forbiddenKeywords.includes(cleanClientId.toLowerCase())) {
        throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
      }

      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      const standardIdentifierRegex = /^[a-zA-Z0-9_\-.:]{2,128}$/;
      if (!uuidRegex.test(cleanClientId) && !standardIdentifierRegex.test(cleanClientId)) {
        throw new Error('فرمت شناسه طرف‌حساب نامعتبر است.');
      }

      if (/[<>'";\\`]/.test(cleanClientId) || /\s/.test(cleanClientId)) {
        throw new Error('شناسه مخاطب حاوی کاراکترهای غیرمجاز است.');
      }

      const clientIndex = snapshot.clients.findIndex(c => c.id === cleanClientId);
      if (clientIndex === -1) {
        throw new Error('طرف‌حساب انتخاب‌شده در فهرست طرف‌های حساب یافت نشد؛ آن را دوباره انتخاب کنید.');
      }

      if (!checkData.amount || checkData.amount <= 0) {
        throw new Error('مبلغ سند نامعتبر است.');
      }

      const bankAccount = checkData.type === 'payable'
        ? snapshot.bankAccounts?.find(account =>
            account.id === checkData.bankAccountId &&
            account.accountType !== 'cash' &&
            (!account.tenantId || account.tenantId === tenantId)
          )
        : undefined;
      if (checkData.type === 'payable' && (!bankAccount || !bankAccount.accountCode)) {
        throw new Error('برای صدور چک پرداختی، حساب بانکی معتبر و متصل به دفتر کل انتخاب کنید.');
      }

      let linkedInstallment: Installment | undefined;
      let linkedInvoice: Invoice | undefined;
      let installmentAllocation: { principal: number; interest: number; serviceFee: number } | undefined;
      if (checkData.relatedInstallmentId) {
        linkedInstallment = snapshot.installments.find(item => item.id === checkData.relatedInstallmentId);
        linkedInvoice = linkedInstallment && snapshot.invoices.find(item => item.id === linkedInstallment.invoiceId);
        if (checkData.type !== 'receivable' || !linkedInstallment || !linkedInvoice ||
            linkedInstallment.clientId !== cleanClientId || linkedInvoice.clientId !== cleanClientId ||
            (linkedInstallment.tenantId && linkedInstallment.tenantId !== tenantId) ||
            (linkedInvoice.tenantId && linkedInvoice.tenantId !== tenantId) ||
            checkData.amount > this.roundMoney(linkedInstallment.amount - linkedInstallment.paidAmount) ||
            checkData.amount > this.roundMoney(linkedInvoice.remainingAmount)) {
          throw new Error('چک باید از نوع دریافتی و به قسطِ بازِ متعلق به همان طرف‌حساب و مستأجر متصل باشد.');
        }
        installmentAllocation = this.allocateInstallmentPayment(linkedInstallment, this.roundMoney(checkData.amount));
      }

      const checkId = HabinoAccountingKernel.generateUUID();
      const createdAt = checkData.created_at || getCurrentDocumentTimestamp();
      const checkMetadata = {
        ...checkData.metadata,
        ...(bankAccount ? {
          bankAccountCode: bankAccount.accountCode,
          bankAccountTitle: bankAccount.accountTitle || bankAccount.bankName
        } : {}),
        ...(installmentAllocation ? { installmentPayment: installmentAllocation } : {})
      };
      const newCheck: Check = {
        ...checkData,
        bankName: bankAccount?.bankName || checkData.bankName,
        metadata: checkMetadata,
        id: checkId,
        tenantId,
        created_at: createdAt
      };

      // ۱. ذخیره در جدول چک‌ها
      snapshot.checks.unshift(newCheck);

      // ۲. ایجاد رکوردهای دوبل دفتر کل
      const entries = HabinoAccountingKernel.createDoubleEntryForCheck(newCheck, tenantId);
      snapshot.accountingEntries.push(...entries.map(entry => ({
        ...entry,
        created_at: createdAt
      })));

      if (linkedInstallment && linkedInvoice && installmentAllocation) {
        const paymentDate = newCheck.issueDate;
        const revenueDocumentNumber = `DOC-CHK-INST-REV-${newCheck.checkNumber || checkId}`;
        const revenueEntries: AccountingEntry[] = [];
        if (installmentAllocation.interest > 0) {
          revenueEntries.push(
            this.installmentEntry(tenantId, revenueDocumentNumber, paymentDate, '20501', 'بهره تحقق‌نیافته فروش اقساطی', installmentAllocation.interest, 0, linkedInvoice, linkedInstallment.id),
            this.installmentEntry(tenantId, revenueDocumentNumber, paymentDate, '40104', 'درآمد بهره فروش اقساطی', 0, installmentAllocation.interest, linkedInvoice, linkedInstallment.id)
          );
        }
        if (installmentAllocation.serviceFee > 0) {
          revenueEntries.push(
            this.installmentEntry(tenantId, revenueDocumentNumber, paymentDate, '20502', 'کارمزد خدمات تحقق‌نیافته اقساط', installmentAllocation.serviceFee, 0, linkedInvoice, linkedInstallment.id),
            this.installmentEntry(tenantId, revenueDocumentNumber, paymentDate, '40105', 'درآمد کارمزد خدمات تقسیط', 0, installmentAllocation.serviceFee, linkedInvoice, linkedInstallment.id)
          );
        }
        if (revenueEntries.length > 0) {
          HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(revenueEntries, revenueDocumentNumber);
          snapshot.accountingEntries.push(...revenueEntries);
        }

        const installmentPaidAmount = this.roundMoney(linkedInstallment.paidAmount + newCheck.amount);
        snapshot.installments = snapshot.installments.map(item => item.id === linkedInstallment!.id ? {
          ...item,
          paidAmount: installmentPaidAmount,
          paidPrincipalAmount: this.roundMoney(item.paidPrincipalAmount + installmentAllocation!.principal),
          paidInterestAmount: this.roundMoney(item.paidInterestAmount + installmentAllocation!.interest),
          paidServiceFeeAmount: this.roundMoney(item.paidServiceFeeAmount + installmentAllocation!.serviceFee),
          status: installmentPaidAmount >= item.amount ? 'paid' : 'pending',
          paidDate: installmentPaidAmount >= item.amount ? paymentDate : item.paidDate,
          checkId
        } : item);
        const invoiceRemaining = this.roundMoney(linkedInvoice.remainingAmount - newCheck.amount);
        snapshot.invoices = snapshot.invoices.map(item => item.id === linkedInvoice!.id ? {
          ...item,
          amountPaid: this.roundMoney(item.amountPaid + newCheck.amount),
          remainingAmount: Math.max(0, invoiceRemaining),
          status: invoiceRemaining <= 0 ? 'paid' : item.status,
          updated_at: createdAt
        } : item);
      }

      // ۳. به‌روزرسانی مانده مخاطب (دریافت چک: کاهش بدهی خریدار؛ صدور چک: کاهش طلب فروشنده)
      const client = snapshot.clients[clientIndex];
      const delta = (newCheck.type === 'receivable' || (newCheck.type as any) === 'in') ? -newCheck.amount : newCheck.amount;
      snapshot.clients[clientIndex] = {
        ...client,
        balance: (client.balance || 0) + delta
      };

      return { nextState: snapshot, check: newCheck };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Check registration failed. Rolling back:', error?.message || error);
      const msg = error?.message?.includes('فهرست طرف‌های حساب')
        ? error.message
        : error?.message?.includes('حساب بانکی')
        ? error.message
        : error?.message?.includes('مخاطب')
        ? 'ثبت سند بدون انتخاب مخاطب مجاز نیست.'
        : error?.message?.includes('مبلغ')
        ? 'مبلغ سند نامعتبر است.'
        : 'خطا در ثبت سند. هیچ تغییری ذخیره نشد.';
      throw new Error(msg);
    }
  }

  /**
   * 🧩 ۳) حذف اتمیک سند چک با بازگشت کامل ردیف‌های دفتر کل و مانده‌ها
   */
  public static atomicDeleteCheck(
    currentState: FinancialStateSnapshot,
    checkId: string
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const target = snapshot.checks.find(c => c.id === checkId);
      if (!target) {
        throw new Error('سند موردنظر یافت نشد.');
      }
      if (target.relatedInstallmentId) {
        throw new Error('حذف چک متصل به قسط مجاز نیست؛ وضعیت چک را به‌روزرسانی کنید تا سابقه مالی حفظ شود.');
      }
      if (['cleared', 'endorsed', 'bounced'].includes(target.status)) {
        throw new Error('حذف چک وصول‌شده، واگذارشده یا برگشتی مجاز نیست؛ برای حفظ سوابق مالی سند اصلاحی ثبت کنید.');
      }

      // ۱. برگشت مانده مخاطب
      if (target.clientId) {
        const clientIndex = snapshot.clients.findIndex(c => c.id === target.clientId);
        if (clientIndex !== -1) {
          const client = snapshot.clients[clientIndex];
          const rev = (target.type === 'receivable' || (target.type as any) === 'in') ? target.amount : -target.amount;
          snapshot.clients[clientIndex] = {
            ...client,
            balance: (client.balance || 0) + rev
          };
        }
      }

      // ۲. حذف ردیف‌های دفتر کل مرتبط با چک و پاس شدن آن
      const docPrefix = `DOC-CHK-${target.checkNumber || target.id.slice(0, 8)}`;
      const clrPrefix = `DOC-CHK-CLR-${target.checkNumber || target.id.slice(0, 8)}`;
      snapshot.accountingEntries = snapshot.accountingEntries.filter(
        e => !e.documentNumber.includes(docPrefix) && !e.documentNumber.includes(clrPrefix)
      );

      // ۳. حذف از جدول چک‌ها
      snapshot.checks = snapshot.checks.filter(c => c.id !== checkId);

      return snapshot;
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Check deletion failed. Rolling back:', error?.message || error);
      if (error?.message === 'سند موردنظر یافت نشد.' ||
          error?.message?.includes('حذف چک متصل') ||
          error?.message?.includes('حذف چک وصول‌شده')) {
        throw error;
      }
      throw new Error('حذف سند ناموفق بود. هیچ تغییری اعمال نشد.');
    }
  }

  /**
   * 🧩 ۴) به‌روزرسانی اتمیک وضعیت چک (وصول، پاس‌شدن یا برگشت)
   * با اتصال خودکار به اقساط و ثبت اسناد بانک
   */
  public static atomicUpdateCheck(
    currentState: FinancialStateSnapshot,
    checkId: string,
    updates: Partial<Check>,
    tenantId: string
  ): { nextState: FinancialStateSnapshot; check: Check } {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const checkIndex = snapshot.checks.findIndex(c => c.id === checkId);
      if (checkIndex === -1) {
        throw new Error('سند موردنظر یافت نشد.');
      }

      const prevCheck = snapshot.checks[checkIndex];
      if (['bounced', 'cancelled'].includes(prevCheck.status) && updates.status && updates.status !== prevCheck.status) {
        throw new Error('وضعیت نهایی چک قابل تغییر نیست.');
      }
      if (prevCheck.status === 'cleared' && updates.status && !['cleared', 'bounced'].includes(updates.status)) {
        throw new Error('چک وصول‌شده فقط با ثبت برگشت می‌تواند تغییر وضعیت دهد.');
      }
      if (prevCheck.status === 'endorsed' && updates.status && !['endorsed', 'bounced'].includes(updates.status)) {
        throw new Error('چک واگذارشده فقط در صورت برگشت قابل تغییر وضعیت است.');
      }
      if (updates.status === 'cleared' && prevCheck.status !== 'pending') {
        throw new Error('فقط چک در جریان وصول را می‌توان وصول کرد.');
      }
      if (updates.status === 'endorsed' && prevCheck.status !== 'pending') {
        throw new Error('فقط چک دریافتیِ در جریان وصول را می‌توان به طرف‌حساب دیگری واگذار کرد.');
      }
      const mergedCheck: Check = {
        ...prevCheck,
        ...updates
      };

      // اگر وضعیت به پاس‌شده/وصول‌شده تغییر کرد
      if (updates.status === 'cleared' && prevCheck.status !== 'cleared') {
        const clearDate = new Date().toLocaleDateString('fa-IR');
        const clearingBankAccount = snapshot.bankAccounts?.find(account =>
          account.id === mergedCheck.bankAccountId &&
          (mergedCheck.type === 'receivable'
            ? !account.accountType || account.accountType === 'cash' || account.accountType === 'bank'
            : account.accountType !== 'cash') &&
          (!account.tenantId || account.tenantId === tenantId)
        );
        if (!clearingBankAccount || !clearingBankAccount.accountCode) {
          const message = mergedCheck.type === 'receivable'
            ? 'برای وصول چک دریافتی، صندوق یا حساب بانکی مقصدِ متصل به دفتر کل را انتخاب کنید؛ وضعیت چک تغییر نکرد.'
            : 'برای تسویه چک پرداختی، حساب بانکی متصل به دفتر کل یافت نشد؛ وضعیت چک تغییر نکرد.';
          throw new Error(message);
        }
        if (
          mergedCheck.type === 'payable' &&
          (Number(clearingBankAccount.balance) || 0) < Number(mergedCheck.amount)
        ) {
          throw new Error('موجودی بانک برای پاس‌شدن این چک کافی نیست؛ چک در وضعیت در جریان باقی ماند.');
        }
        mergedCheck.metadata = {
          ...mergedCheck.metadata,
          bankAccountId: clearingBankAccount.id,
          bankAccountCode: clearingBankAccount.accountCode,
          bankAccountTitle: clearingBankAccount.accountTitle || clearingBankAccount.bankName
        };
        const clrEntries = HabinoAccountingKernel.createDoubleEntryForCheckClearing(
          mergedCheck,
          tenantId,
          clearDate
        );
        HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(
          clrEntries,
          clrEntries[0]?.documentNumber || `DOC-CHK-CLR-${mergedCheck.checkNumber}`
        );
        snapshot.accountingEntries.push(...clrEntries);
        if (clearingBankAccount && snapshot.bankAccounts) {
          snapshot.bankAccounts = snapshot.bankAccounts.map(account =>
            account.id === clearingBankAccount!.id
              ? {
                  ...account,
                  balance: (Number(account.balance) || 0) +
                    (mergedCheck.type === 'receivable' ? mergedCheck.amount : -mergedCheck.amount)
                }
              : account
          );
        }
      }

      if (updates.status === 'endorsed' && prevCheck.status !== 'endorsed') {
        if (mergedCheck.type !== 'receivable') {
          throw new Error('فقط چک دریافتی را می‌توان به طرف‌حساب دیگری واگذار کرد.');
        }
        const endorseeId = String(mergedCheck.metadata?.endorsedToClientId || '');
        const endorsee = snapshot.clients.find(client =>
          client.id === endorseeId &&
          client.id !== mergedCheck.clientId &&
          (!client.tenantId || client.tenantId === tenantId)
        );
        if (!endorsee) {
          throw new Error('طرف‌حساب دریافت‌کننده چک معتبر نیست؛ چک واگذار نشد.');
        }

        const endorsementDate = getCurrentDocumentTimestamp();
        const endorsementDoc = `DOC-CHK-ENDORSE-${mergedCheck.checkNumber || mergedCheck.id}`;
        mergedCheck.metadata = {
          ...mergedCheck.metadata,
          endorsedToClientId: endorsee.id,
          endorsedToClientName: endorsee.name,
          endorsedAt: endorsementDate
        };
        const endorsementEntries: AccountingEntry[] = [
          {
            id: HabinoAccountingKernel.generateUUID(),
            tenantId,
            documentNumber: endorsementDoc,
            date: endorsementDate,
            description: `واگذاری چک شماره ${mergedCheck.checkNumber} به ${endorsee.name}`,
            accountCode: '20101',
            accountTitle: 'حساب‌های پرداختنی تجاری',
            debit: mergedCheck.amount,
            credit: 0,
            clientId: endorsee.id,
            referenceId: mergedCheck.id,
            created_at: new Date().toISOString()
          },
          {
            id: HabinoAccountingKernel.generateUUID(),
            tenantId,
            documentNumber: endorsementDoc,
            date: endorsementDate,
            description: `خروج چک واگذارشده شماره ${mergedCheck.checkNumber} از اسناد دریافتنی`,
            accountCode: '10202',
            accountTitle: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)',
            debit: 0,
            credit: mergedCheck.amount,
            clientId: mergedCheck.clientId,
            referenceId: mergedCheck.id,
            created_at: new Date().toISOString()
          }
        ];
        HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(endorsementEntries, endorsementDoc);
        snapshot.accountingEntries.push(...endorsementEntries);
        const endorseeIndex = snapshot.clients.findIndex(client => client.id === endorsee.id);
        snapshot.clients[endorseeIndex] = {
          ...endorsee,
          balance: (Number(endorsee.balance) || 0) + mergedCheck.amount
        };
      }

      if (updates.status === 'bounced' && prevCheck.status !== 'bounced') {
        const reversalDate = getCurrentDocumentTimestamp();
        const checkNumber = prevCheck.checkNumber || prevCheck.id;

        if (prevCheck.status === 'cleared') {
          const clearingAccount = snapshot.bankAccounts?.find(account =>
            account.id === (prevCheck.bankAccountId || prevCheck.metadata?.bankAccountId) &&
            (!account.tenantId || account.tenantId === tenantId)
          );
          const clearingAccountCode = prevCheck.metadata?.bankAccountCode || clearingAccount?.accountCode;
          if (!clearingAccount || !clearingAccountCode) {
            throw new Error('حساب مقصد وصول چک برای ثبت برگشت بانکی یافت نشد؛ وضعیت تغییر نکرد.');
          }
          const clearingReversalDoc = `DOC-CHK-RETURN-CLR-${checkNumber}`;
          const clearingReversalEntries: AccountingEntry[] = prevCheck.type === 'receivable'
            ? [
                {
                  id: HabinoAccountingKernel.generateUUID(),
                  tenantId,
                  documentNumber: clearingReversalDoc,
                  date: reversalDate,
                  description: `برگشت وجه وصول چک شماره ${checkNumber} از صندوق یا بانک`,
                  accountCode: '10202',
                  accountTitle: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)',
                  debit: prevCheck.amount,
                  credit: 0,
                  clientId: prevCheck.clientId,
                  referenceId: prevCheck.id,
                  created_at: new Date().toISOString()
                },
                {
                  id: HabinoAccountingKernel.generateUUID(),
                  tenantId,
                  documentNumber: clearingReversalDoc,
                  date: reversalDate,
                  description: `کسر وجه برگشتی چک شماره ${checkNumber} از حساب مقصد`,
                  accountCode: clearingAccountCode,
                  accountTitle: prevCheck.metadata?.bankAccountTitle || clearingAccount.bankName,
                  debit: 0,
                  credit: prevCheck.amount,
                  clientId: prevCheck.clientId,
                  referenceId: prevCheck.id,
                  created_at: new Date().toISOString()
                }
              ]
            : [
                {
                  id: HabinoAccountingKernel.generateUUID(),
                  tenantId,
                  documentNumber: clearingReversalDoc,
                  date: reversalDate,
                  description: `بازگشت وجه چک پرداختی برگشتی شماره ${checkNumber} به حساب`,
                  accountCode: clearingAccountCode,
                  accountTitle: prevCheck.metadata?.bankAccountTitle || clearingAccount.bankName,
                  debit: prevCheck.amount,
                  credit: 0,
                  clientId: prevCheck.clientId,
                  referenceId: prevCheck.id,
                  created_at: new Date().toISOString()
                },
                {
                  id: HabinoAccountingKernel.generateUUID(),
                  tenantId,
                  documentNumber: clearingReversalDoc,
                  date: reversalDate,
                  description: `بازگشت چک پرداختی برگشتی شماره ${checkNumber} به اسناد پرداختنی`,
                  accountCode: '20102',
                  accountTitle: 'اسناد پرداختنی تجاری (چک‌های عهده بانک)',
                  debit: 0,
                  credit: prevCheck.amount,
                  clientId: prevCheck.clientId,
                  referenceId: prevCheck.id,
                  created_at: new Date().toISOString()
                }
              ];
          HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(clearingReversalEntries, clearingReversalDoc);
          snapshot.accountingEntries.push(...clearingReversalEntries);
          snapshot.bankAccounts = (snapshot.bankAccounts || []).map(account =>
            account.id === clearingAccount.id
              ? {
                  ...account,
                  balance: (Number(account.balance) || 0) +
                    (prevCheck.type === 'receivable' ? -prevCheck.amount : prevCheck.amount)
                }
              : account
          );
        }

        const allocation = prevCheck.metadata?.installmentPayment;
        const installmentIndex = snapshot.installments.findIndex(item => item.id === prevCheck.relatedInstallmentId);
        const linkedInstallment = snapshot.installments[installmentIndex];
        const linkedInvoice = linkedInstallment && snapshot.invoices.find(item => item.id === linkedInstallment.invoiceId);
        const linkedClient = linkedInstallment && snapshot.clients.find(item => item.id === linkedInstallment.clientId);
        if (prevCheck.relatedInstallmentId &&
            (!allocation || installmentIndex < 0 || !linkedInstallment || !linkedInvoice || !linkedClient)) {
          throw new Error('اطلاعات پیوند چک و قسط برای برگشت کامل یافت نشد؛ وضعیت تغییر نکرد.');
        }

        if (prevCheck.relatedInstallmentId && allocation && linkedInstallment && linkedInvoice && linkedClient) {
          const reversalDoc = `DOC-CHK-BOUNCE-${checkNumber}`;
          const reversalEntries: AccountingEntry[] = [
            this.installmentEntry(tenantId, reversalDoc, reversalDate, '10201', 'حساب‌ها و اسناد دریافتنی تجاری', prevCheck.amount, 0, linkedInvoice, linkedInstallment.id),
            this.installmentEntry(tenantId, reversalDoc, reversalDate, '10202', 'اسناد دریافتنی نزد صندوق', 0, prevCheck.amount, linkedInvoice, linkedInstallment.id)
          ];
          if (Number(allocation.interest) > 0) {
            reversalEntries.push(
              this.installmentEntry(tenantId, reversalDoc, reversalDate, '40104', 'درآمد بهره فروش اقساطی', Number(allocation.interest), 0, linkedInvoice, linkedInstallment.id),
              this.installmentEntry(tenantId, reversalDoc, reversalDate, '20501', 'بهره تحقق‌نیافته فروش اقساطی', 0, Number(allocation.interest), linkedInvoice, linkedInstallment.id)
            );
          }
          if (Number(allocation.serviceFee) > 0) {
            reversalEntries.push(
              this.installmentEntry(tenantId, reversalDoc, reversalDate, '40105', 'درآمد کارمزد خدمات تقسیط', Number(allocation.serviceFee), 0, linkedInvoice, linkedInstallment.id),
              this.installmentEntry(tenantId, reversalDoc, reversalDate, '20502', 'کارمزد خدمات تقسیط تحقق‌نیافته', 0, Number(allocation.serviceFee), linkedInvoice, linkedInstallment.id)
            );
          }
          HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(reversalEntries, reversalDoc);
          snapshot.accountingEntries.push(...reversalEntries);
          const paidAmount = this.roundMoney(linkedInstallment.paidAmount - prevCheck.amount);
          snapshot.installments[installmentIndex] = {
            ...linkedInstallment,
            paidAmount: Math.max(0, paidAmount),
            paidPrincipalAmount: Math.max(0, this.roundMoney(linkedInstallment.paidPrincipalAmount - Number(allocation.principal))),
            paidInterestAmount: Math.max(0, this.roundMoney(linkedInstallment.paidInterestAmount - Number(allocation.interest))),
            paidServiceFeeAmount: Math.max(0, this.roundMoney(linkedInstallment.paidServiceFeeAmount - Number(allocation.serviceFee))),
            status: paidAmount >= linkedInstallment.amount ? 'paid' : 'pending',
            paidDate: paidAmount >= linkedInstallment.amount ? linkedInstallment.paidDate : undefined,
            checkId: linkedInstallment.checkId === prevCheck.id ? undefined : linkedInstallment.checkId
          };
          const invoiceRemaining = this.roundMoney(linkedInvoice.remainingAmount + prevCheck.amount);
          snapshot.invoices = snapshot.invoices.map(item => item.id === linkedInvoice.id ? {
            ...item,
            amountPaid: Math.max(0, this.roundMoney(item.amountPaid - prevCheck.amount)),
            remainingAmount: invoiceRemaining,
            status: invoiceRemaining > 0 && item.status === 'paid' ? 'pending' : item.status,
            updated_at: reversalDate
          } : item);
          const clientIndex = snapshot.clients.findIndex(item => item.id === linkedClient.id);
          snapshot.clients[clientIndex] = {
            ...linkedClient,
            balance: (Number(linkedClient.balance) || 0) + prevCheck.amount
          };
          if (prevCheck.type === 'receivable' && prevCheck.status === 'endorsed') {
            const endorseeId = String(prevCheck.metadata?.endorsedToClientId || '');
            const endorseeIndex = snapshot.clients.findIndex(item => item.id === endorseeId);
            if (endorseeIndex < 0) {
              throw new Error('طرف‌حساب دریافت‌کننده چک برای برگشت یافت نشد؛ وضعیت تغییر نکرد.');
            }
            const endorsementReversalDoc = `DOC-CHK-BOUNCE-ENDORSE-${checkNumber}`;
            const endorsementReversalEntries: AccountingEntry[] = [
              {
                id: HabinoAccountingKernel.generateUUID(),
                tenantId,
                documentNumber: endorsementReversalDoc,
                date: reversalDate,
                description: `برگشت واگذاری چک شماره ${checkNumber} و اعاده بدهی به دریافت‌کننده`,
                accountCode: '10202',
                accountTitle: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)',
                debit: prevCheck.amount,
                credit: 0,
                clientId: prevCheck.clientId,
                referenceId: prevCheck.id,
                created_at: new Date().toISOString()
              },
              {
                id: HabinoAccountingKernel.generateUUID(),
                tenantId,
                documentNumber: endorsementReversalDoc,
                date: reversalDate,
                description: `برگشت واگذاری چک شماره ${checkNumber} به ${snapshot.clients[endorseeIndex].name}`,
                accountCode: '20101',
                accountTitle: 'حساب‌های پرداختنی تجاری',
                debit: 0,
                credit: prevCheck.amount,
                clientId: endorseeId,
                referenceId: prevCheck.id,
                created_at: new Date().toISOString()
              }
            ];
            HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(endorsementReversalEntries, endorsementReversalDoc);
            snapshot.accountingEntries.push(...endorsementReversalEntries);
            snapshot.clients[endorseeIndex] = {
              ...snapshot.clients[endorseeIndex],
              balance: (Number(snapshot.clients[endorseeIndex].balance) || 0) - prevCheck.amount
            };
          }
        } else if (prevCheck.type === 'receivable' && prevCheck.status === 'endorsed') {
          const endorseeId = String(prevCheck.metadata?.endorsedToClientId || '');
          const originalClientIndex = snapshot.clients.findIndex(item => item.id === prevCheck.clientId);
          const endorseeIndex = snapshot.clients.findIndex(item => item.id === endorseeId);
          if (originalClientIndex < 0 || endorseeIndex < 0) {
            throw new Error('طرف‌حساب صادرکننده یا دریافت‌کننده چک برای برگشت یافت نشد؛ وضعیت تغییر نکرد.');
          }
          const endorsementReversalDoc = `DOC-CHK-BOUNCE-ENDORSE-${checkNumber}`;
          const endorsementReversalEntries: AccountingEntry[] = [
            {
              id: HabinoAccountingKernel.generateUUID(),
              tenantId,
              documentNumber: endorsementReversalDoc,
              date: reversalDate,
              description: `برگشت واگذاری چک شماره ${checkNumber} و اعاده بدهی به دریافت‌کننده`,
              accountCode: '10201',
              accountTitle: 'حساب‌ها و اسناد دریافتنی تجاری',
              debit: prevCheck.amount,
              credit: 0,
              clientId: prevCheck.clientId,
              referenceId: prevCheck.id,
              created_at: new Date().toISOString()
            },
            {
              id: HabinoAccountingKernel.generateUUID(),
              tenantId,
              documentNumber: endorsementReversalDoc,
              date: reversalDate,
              description: `برگشت واگذاری چک شماره ${checkNumber} به ${snapshot.clients[endorseeIndex].name}`,
              accountCode: '20101',
              accountTitle: 'حساب‌های پرداختنی تجاری',
              debit: 0,
              credit: prevCheck.amount,
              clientId: endorseeId,
              referenceId: prevCheck.id,
              created_at: new Date().toISOString()
            }
          ];
          HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(endorsementReversalEntries, endorsementReversalDoc);
          snapshot.accountingEntries.push(...endorsementReversalEntries);
          snapshot.clients[originalClientIndex] = {
            ...snapshot.clients[originalClientIndex],
            balance: (Number(snapshot.clients[originalClientIndex].balance) || 0) + prevCheck.amount
          };
          snapshot.clients[endorseeIndex] = {
            ...snapshot.clients[endorseeIndex],
            balance: (Number(snapshot.clients[endorseeIndex].balance) || 0) - prevCheck.amount
          };
        } else {
          const clientIndex = snapshot.clients.findIndex(item => item.id === prevCheck.clientId);
          if (clientIndex < 0) {
            throw new Error('طرف‌حساب چک برای ثبت برگشت یافت نشد؛ وضعیت تغییر نکرد.');
          }
          const bounceDoc = `DOC-CHK-BOUNCE-${checkNumber}`;
          const receivableCheck = prevCheck.type === 'receivable';
          const bounceEntries: AccountingEntry[] = [
            {
              id: HabinoAccountingKernel.generateUUID(),
              tenantId,
              documentNumber: bounceDoc,
              date: reversalDate,
              description: `برگشت چک شماره ${checkNumber}`,
              accountCode: receivableCheck ? '10201' : '20102',
              accountTitle: receivableCheck ? 'حساب‌ها و اسناد دریافتنی تجاری' : 'اسناد پرداختنی تجاری (چک‌های عهده بانک)',
              debit: prevCheck.amount,
              credit: 0,
              clientId: prevCheck.clientId,
              referenceId: prevCheck.id,
              created_at: new Date().toISOString()
            },
            {
              id: HabinoAccountingKernel.generateUUID(),
              tenantId,
              documentNumber: bounceDoc,
              date: reversalDate,
              description: `اعاده مانده طرف‌حساب بابت چک برگشتی شماره ${checkNumber}`,
              accountCode: receivableCheck ? '10202' : '20101',
              accountTitle: receivableCheck ? 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)' : 'حساب‌های پرداختنی تجاری',
              debit: 0,
              credit: prevCheck.amount,
              clientId: prevCheck.clientId,
              referenceId: prevCheck.id,
              created_at: new Date().toISOString()
            }
          ];
          HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(bounceEntries, bounceDoc);
          snapshot.accountingEntries.push(...bounceEntries);
          snapshot.clients[clientIndex] = {
            ...snapshot.clients[clientIndex],
            balance: (Number(snapshot.clients[clientIndex].balance) || 0) +
              (receivableCheck ? prevCheck.amount : -prevCheck.amount)
          };
        }
      }

      snapshot.checks[checkIndex] = mergedCheck;
      return { nextState: snapshot, check: mergedCheck };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Check update failed. Rolling back:', error?.message || error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
    }
  }

  /**
   * 🧩 ۱ و ۲) ثبت اتمیک اسناد حسابداری دفتر کل (General Ledger Journal Entries)
   * با اعتبارسنجی تراز بودن مجموع بدهکار و بستانکار و به‌روزرسانی مانده اشخاص
   */
  public static atomicRegisterJournalEntries(
    currentState: FinancialStateSnapshot,
    entries: Omit<AccountingEntry, 'id'>[],
    tenantId: string
  ): { nextState: FinancialStateSnapshot; createdEntries: AccountingEntry[] } {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      if (!entries || entries.length === 0) {
        throw new Error('اطلاعات واردشده ناقص است.');
      }

      let totalDebit = 0;
      let totalCredit = 0;

      for (const e of entries) {
        totalDebit += Number(e.debit) || 0;
        totalCredit += Number(e.credit) || 0;
      }

      if (totalDebit === 0 && totalCredit === 0) {
        throw new Error('مبلغ سند نامعتبر است.');
      }

      // بررسی تراز بودن سند دوبل
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`سند تراز نیست. مجموع بدهکار (${totalDebit.toLocaleString('fa-IR')}) با مجموع بستانکار (${totalCredit.toLocaleString('fa-IR')}) برابر نیست.`);
      }

      const createdEntries: AccountingEntry[] = [];

      for (const e of entries) {
        const newEntry: AccountingEntry = {
          ...e,
          id: HabinoAccountingKernel.generateUUID(),
          tenantId,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0
        };

        createdEntries.push(newEntry);
        snapshot.accountingEntries.push(newEntry);

        // اگر طرف‌حساب انتخاب شده باشد و حساب مربوط به اشخاص باشد، مانده شخص تعدیل می‌شود
        if (newEntry.clientId) {
          const clientIndex = snapshot.clients.findIndex(c => c.id === newEntry.clientId);
          if (clientIndex !== -1) {
            const targetClient = snapshot.clients[clientIndex];
            const curBal = targetClient.balance || 0;
            // بدهکار شخص: بدهی شخص بیشتر می‌شود (+debit)
            // بستانکار شخص: طلب شخص یا تسویه (-credit)
            const delta = (Number(e.debit) || 0) - (Number(e.credit) || 0);
            snapshot.clients[clientIndex] = {
              ...targetClient,
              balance: curBal + delta
            };
          }
        }
      }

      return { nextState: snapshot, createdEntries };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Journal registration failed. Rolling back:', error?.message || error);
      throw error;
    }
  }

  /**
   * 🧩 ۳) حذف اتمیک سند دفتر کل بر اساس شماره سند
   */
  public static atomicDeleteJournalDocument(
    currentState: FinancialStateSnapshot,
    documentNumber: string
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const targetEntries = snapshot.accountingEntries.filter(
        e => e.documentNumber === documentNumber
      );

      if (targetEntries.length === 0) {
        throw new Error('سند موردنظر یافت نشد.');
      }

      // خنثی‌سازی اثر بر حساب اشخاص
      for (const entry of targetEntries) {
        if (entry.clientId) {
          const clientIndex = snapshot.clients.findIndex(c => c.id === entry.clientId);
          if (clientIndex !== -1) {
            const targetClient = snapshot.clients[clientIndex];
            const curBal = targetClient.balance || 0;
            const delta = (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
            snapshot.clients[clientIndex] = {
              ...targetClient,
              balance: curBal - delta
            };
          }
        }
      }

      // حذف ردیف‌ها
      snapshot.accountingEntries = snapshot.accountingEntries.filter(
        e => e.documentNumber !== documentNumber
      );

      return snapshot;
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Journal deletion failed. Rolling back:', error?.message || error);
      throw error;
    }
  }

  /**
   * 🧩 ثبت اتمیک طرف‌حساب جدید به همراه ثبت سند افتتاحیه در دفتر کل
   */
  public static atomicRegisterClient(
    currentState: FinancialStateSnapshot,
    clientData: Omit<Client, 'id'>,
    tenantId: string
  ): { nextState: FinancialStateSnapshot; client: Client } {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      if (!clientData.name || clientData.name.trim() === '') {
        throw new Error('نام طرف‌حساب الزامی است.');
      }

      const clientId = HabinoAccountingKernel.generateUUID();
      const nowIso = new Date().toISOString();
      const newClient: Client = {
        ...clientData,
        id: clientId,
        tenantId,
        balance: Number(clientData.balance) || 0,
        created_at: clientData.created_at || (clientData as any).createdAt || nowIso,
        createdAt: (clientData as any).createdAt || clientData.created_at || nowIso
      };

      // ۱. ثبت در جدول اشخاص
      snapshot.clients.unshift(newClient);

      // ۲. در صورت وجود مانده اول دوره، ثبت سند دوبل در دفتر کل
      if (newClient.balance !== 0) {
        const openingEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
          newClient,
          tenantId
        );
        snapshot.accountingEntries.push(...openingEntries);
      }

      return { nextState: snapshot, client: newClient };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Client registration failed. Rolling back:', error?.message || error);
      throw error;
    }
  }

  /**
   * 🧩 به‌روزرسانی اتمیک طرف‌حساب و هماهنگ‌سازی سند افتتاحیه دفتر کل
   */
  public static atomicUpdateClient(
    currentState: FinancialStateSnapshot,
    clientId: string,
    updated: Partial<Client>,
    tenantId: string,
    openingBalanceUpdate = true
  ): { nextState: FinancialStateSnapshot; client: Client } {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const clientIndex = snapshot.clients.findIndex(c => c.id === clientId);
      if (clientIndex === -1) {
        throw new Error('طرف‌حساب موردنظر یافت نشد.');
      }

      const prevClient = snapshot.clients[clientIndex];
      const newBalance = updated.balance !== undefined ? (Number(updated.balance) || 0) : prevClient.balance;

      const mergedClient: Client = {
        ...prevClient,
        ...updated,
        balance: newBalance
      };

      snapshot.clients[clientIndex] = mergedClient;

      // در صورتی که مانده تغییر کرده باشد یا نام تغییر کرده باشد، اسناد افتتاحیه قبلی خنثی و به‌روز می‌شوند
      const balanceChanged = updated.balance !== undefined && updated.balance !== prevClient.balance;
      const nameChanged = updated.name !== undefined && updated.name !== prevClient.name;

      if (balanceChanged && openingBalanceUpdate) {
        // حذف اسناد افتتاحیه پیشین این شخص
        snapshot.accountingEntries = snapshot.accountingEntries.filter(
          e => !(e.referenceId === clientId && e.documentNumber && e.documentNumber.startsWith('DOC-OPN'))
        );

        // تولید سند افتتاحیه جدید با مانده به‌روزشده
        if (mergedClient.balance !== 0) {
          const openingEntries = HabinoAccountingKernel.createDoubleEntryForClientOpeningBalance(
            mergedClient,
            tenantId
          );
          snapshot.accountingEntries.push(...openingEntries);
        }
      } else if (nameChanged) {
        snapshot.accountingEntries = snapshot.accountingEntries.map(entry => {
          if (
            entry.referenceId !== clientId ||
            !entry.documentNumber?.startsWith('DOC-OPN') ||
            !prevClient.name
          ) {
            return entry;
          }

          return {
            ...entry,
            description: entry.description.replace(prevClient.name, mergedClient.name)
          };
        });
      }

      return { nextState: snapshot, client: mergedClient };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Client update failed. Rolling back:', error?.message || error);
      throw error;
    }
  }

  /**
   * 🧩 حذف اتمیک طرف‌حساب با پاکسازی اسناد افتتاحیه دفتر کل
   */
  public static atomicDeleteClient(
    currentState: FinancialStateSnapshot,
    clientId: string
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const targetClient = snapshot.clients.find(c => c.id === clientId);
      if (!targetClient) {
        throw new Error('طرف‌حساب موردنظر یافت نشد.');
      }

      // اعتبارسنجی نبود فاکتورهای وابسته
      const hasActiveInvoices = snapshot.invoices.some(
        inv => inv.clientId === clientId && !inv.is_deleted
      );
      if (hasActiveInvoices) {
        throw new Error('امکان حذف طرف‌حساب دارای فاکتور فعال وجود ندارد.');
      }

      // اعتبارسنجی نبود چک‌های وابسته
      const hasChecks = snapshot.checks.some(chk => chk.clientId === clientId);
      if (hasChecks) {
        throw new Error('امکان حذف طرف‌حساب دارای چک ثبت‌شده وجود ندارد.');
      }

      // حذف اسناد افتتاحیه متناظر از دفتر کل
      snapshot.accountingEntries = snapshot.accountingEntries.filter(
        e => !(e.referenceId === clientId && e.documentNumber && e.documentNumber.startsWith('DOC-OPN'))
      );

      // حذف از جدول اشخاص
      snapshot.clients = snapshot.clients.filter(c => c.id !== clientId);

      return snapshot;
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Client deletion failed. Rolling back:', error?.message || error);
      throw error;
    }
  }

  /**
   * حذف اتمیک پروژه به همراه پاکسازی برچسب‌ها از دفتر کل و اسناد
   * بر اساس اصل ۳ و اصل ۹ حسابداری هابینو
   */
  public static atomicDeleteProject(
    currentState: FinancialStateSnapshot,
    projectId: string
  ): FinancialStateSnapshot {
    const snapshot = this.createWorkingSnapshot(currentState);

    try {
      const projectIndex = snapshot.projects.findIndex(p => p.id === projectId);
      if (projectIndex === -1) {
        throw new Error('سند موردنظر یافت نشد.');
      }

      // ۱. پاکسازی برچسب پروژه از تمام ردیف‌های مرتبط در دفتر کل (پروژه فقط برچسب است، حساب ندارد)
      snapshot.accountingEntries = snapshot.accountingEntries.map(entry => {
        if (entry.projectTag === projectId) {
          const { projectTag, ...rest } = entry;
          return rest as AccountingEntry;
        }
        return entry;
      });

      // ۲. پاکسازی برچسب پروژه از تمام تراکنش‌ها
      snapshot.transactions = snapshot.transactions.map(tx => {
        if (tx.projectId === projectId) {
          const { projectId: _, ...rest } = tx;
          return rest as Transaction;
        }
        return tx;
      });

      // ۳. پاکسازی برچسب پروژه از فاکتورها
      snapshot.invoices = snapshot.invoices.map(inv => {
        if (inv.projectId === projectId) {
          const { projectId: _, ...rest } = inv;
          return rest as Invoice;
        }
        return inv;
      });

      // ۴. حذف از جدول پروژه‌ها
      snapshot.projects = snapshot.projects.filter(p => p.id !== projectId);

      return snapshot;
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Project deletion failed. Rolling back:', error?.message || error);
      if (error?.message === 'سند موردنظر یافت نشد.') {
        throw error;
      }
      throw new Error('حذف سند ناموفق بود. هیچ تغییری اعمال نشد.');
    }
  }

  /**
   * 🧩 ۱۰) تسویه اتمیک دسته‌ای چند فاکتور هم‌زمان با چک، نقد یا حواله بانکی
   * مطابق با قوانین ۹‌گانه مالی، با تضمین Rollback ۱۰۰٪ و ثبت دوبل متوازن در دفتر کل
   */
  public static atomicBatchSettleInvoices(
    currentState: FinancialStateSnapshot,
    settlements: BatchInvoiceSettlementItem[],
    tenantId: string,
    operationDate?: string
  ): { nextState: FinancialStateSnapshot; result: BatchSettlementResult } {
    if (!settlements || settlements.length === 0) {
      throw new Error('اطلاعات واردشده ناقص است.');
    }

    const snapshot = this.createWorkingSnapshot(currentState);
    const dateStr = operationDate || new Date().toISOString().split('T')[0];

    // قفل‌گذاری روی کلیه فاکتورها و طرف‌حساب‌های درگیر
    const invoiceIds = settlements.map(s => s.invoiceId);
    const affectedInvoices = snapshot.invoices.filter(i => invoiceIds.includes(i.id));
    const affectedClientIds = Array.from(new Set(affectedInvoices.map(i => i.clientId).filter(Boolean)));
    const lockKeys = [...invoiceIds, ...affectedClientIds];
    const releaseLocks = HabinoRecordLockManager.tryLock(lockKeys);

    try {
      const settledInvoices: Invoice[] = [];
      const createdTransactions: Transaction[] = [];
      const createdEntries: AccountingEntry[] = [];
      const createdChecks: Check[] = [];
      let totalAmountSettled = 0;

      for (const item of settlements) {
        const settlementTimestamp = getCurrentDocumentTimestamp();
        // ۱. بررسی وجود فاکتور
        const invIndex = snapshot.invoices.findIndex(i => i.id === item.invoiceId);
        if (invIndex === -1) {
          throw new Error('سند موردنظر یافت نشد.');
        }
        const invoice = snapshot.invoices[invIndex];

        // ۲. بررسی وجود و اعتبار طرف‌حساب (قانون ۱: مخاطب اجباری)
        const clientId = invoice.clientId || invoice.client_id;
        if (!clientId || String(clientId).trim() === '') {
          throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
        }
        const clientIndex = snapshot.clients.findIndex(c => c.id === clientId);
        if (clientIndex === -1) {
          throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
        }
        const client = snapshot.clients[clientIndex];

        // ۳. بررسی مبلغ تسویه
        const amount = Number(item.amount);
        if (!amount || isNaN(amount) || amount <= 0) {
          throw new Error('مبلغ سند نامعتبر است.');
        }

        const currentRemaining = invoice.remainingAmount !== undefined ? invoice.remainingAmount : invoice.grandTotal;
        const newPaidAmount = (invoice.amountPaid || 0) + amount;
        const newRemaining = Math.max(0, currentRemaining - amount);
        const newStatus = newRemaining === 0 ? 'paid' : 'pending';

        // ۴. به‌روزرسانی فاکتور
        const updatedInvoice: Invoice = {
          ...invoice,
          amountPaid: newPaidAmount,
          remainingAmount: newRemaining,
          status: newStatus as any
        };
        snapshot.invoices[invIndex] = updatedInvoice;
        settledInvoices.push(updatedInvoice);
        totalAmountSettled += amount;

        // ۵. تولید سند ثبت در دفتر کل (سند دوبل متوازن تسویه)
        // بدهکار: صندوق (10101)، بانک (10102)، یا چک دریافتی (10202)
        // بستانکار: حساب‌های دریافتنی مشتریان (10201)
        const settleDocNumber = `DOC-SETTLE-${invoice.invoiceNumber || invoice.id.slice(0, 8)}`;
        let debitAccountCode = '10101';
        let debitAccountTitle = 'صندوق ریالی و وجوه نقد';

        if (item.paymentMethod === 'bank') {
          debitAccountCode = '10102';
          debitAccountTitle = 'بانک‌ها و حساب‌های جاری ریالی';
        } else if (item.paymentMethod === 'check') {
          debitAccountCode = '10202';
          debitAccountTitle = 'اسناد دریافتنی نزد صندوق (چک‌های صیادی)';
        }

        const desc = `تسویه ${item.paymentMethod === 'check' ? 'چکی' : item.paymentMethod === 'bank' ? 'بانکی' : 'نقدی'} فاکتور #${invoice.invoiceNumber || invoice.id} - ${client.name} ${item.notes ? `(${item.notes})` : ''}`;

        const debitEntry: AccountingEntry = {
          id: HabinoAccountingKernel.generateUUID(),
          tenantId,
          documentNumber: settleDocNumber,
          date: dateStr,
          description: desc,
          accountCode: debitAccountCode,
          accountTitle: debitAccountTitle,
          groupCode: '1',
          kolCode: item.paymentMethod === 'check' ? '12' : '10',
          moeinCode: debitAccountCode,
          tafsiliCode: client.id,
          tafsiliTitle: client.name,
          tafsiliType: 'client',
          debit: amount,
          credit: 0,
          clientId: client.id,
          referenceId: invoice.id,
          created_at: settlementTimestamp
        };

        const creditEntry: AccountingEntry = {
          id: HabinoAccountingKernel.generateUUID(),
          tenantId,
          documentNumber: settleDocNumber,
          date: dateStr,
          description: `کاهش مطالبات تجاری بابت تسویه فاکتور #${invoice.invoiceNumber || invoice.id} - ${client.name}`,
          accountCode: '10201',
          accountTitle: 'حساب‌ها و اسناد دریافتنی تجاری (مشتریان)',
          groupCode: '1',
          kolCode: '12',
          moeinCode: '10201',
          tafsiliCode: client.id,
          tafsiliTitle: client.name,
          tafsiliType: 'client',
          debit: 0,
          credit: amount,
          clientId: client.id,
          referenceId: invoice.id,
          created_at: settlementTimestamp
        };

        snapshot.accountingEntries.push(debitEntry, creditEntry);
        createdEntries.push(debitEntry, creditEntry);

        // ۶. به‌روزرسانی مانده طرف‌حساب (کاهش بدهی مشتری)
        snapshot.clients[clientIndex] = {
          ...client,
          balance: (client.balance || 0) - amount
        };

        // ۷. ثبت تراکنش دریافت مالی (Income Transaction)
        const txId = HabinoAccountingKernel.generateUUID();
        const transaction: Transaction = {
          id: txId,
          tenantId,
          date: dateStr,
          type: 'income',
          category: 'تسویه فاکتور',
          amount,
          description: desc,
          clientId: client.id,
          clientName: client.name,
          relatedInvoiceId: invoice.id,
          fromAccount: client.name,
          toAccount: debitAccountTitle,
          created_at: settlementTimestamp
        };
        snapshot.transactions.unshift(transaction);
        createdTransactions.push(transaction);

        // ۸. در صورت پرداخت چکی، ایجاد سند چک صیادی
        if (item.paymentMethod === 'check' && item.checkDetails) {
          const chkId = HabinoAccountingKernel.generateUUID();
          const checkRecord: Check = {
            id: chkId,
            tenantId,
            checkNumber: item.checkDetails.checkNumber,
            sayadNumber: item.checkDetails.sayadNumber,
            bankName: item.checkDetails.bankName,
            amount,
            issueDate: dateStr,
            dueDate: item.checkDetails.dueDate || dateStr,
            type: 'receivable',
            status: 'pending',
            clientId: client.id,
            clientName: client.name,
            description: `چک بابت تسویه فاکتور #${invoice.invoiceNumber || invoice.id}`,
            relatedInvoiceId: invoice.id,
            created_at: settlementTimestamp
          };
          snapshot.checks.unshift(checkRecord);
          createdChecks.push(checkRecord);
        }
      }

      return {
        nextState: snapshot,
        result: {
          settledInvoices,
          createdTransactions,
          createdEntries,
          createdChecks,
          totalAmountSettled
        }
      };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Batch settlement failed. Rolling back entirely:', error?.message || error);
      if (
        error?.message === 'سند موردنظر یافت نشد.' ||
        error?.message === 'ثبت سند بدون انتخاب مخاطب مجاز نیست.' ||
        error?.message === 'مبلغ سند نامعتبر است.'
      ) {
        throw error;
      }
      throw new Error('خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
    } finally {
      if (releaseLocks) {
        releaseLocks();
      }
    }
  }

  /**
   * 🧩 ۱۱) بستن اتمیک حساب‌های پایان سال مالی (Fiscal Year-End Closing)
   * بستن حساب‌های موقت (درآمدها و هزینه‌ها) به سود/زیان انباشته و صدور سند افتتاحیه متوازن سال بعد
   */
  public static atomicCloseFiscalYear(
    currentState: FinancialStateSnapshot,
    params: CloseFiscalYearParams,
    tenantId: string
  ): { nextState: FinancialStateSnapshot; result: CloseFiscalYearResult } {
    // ۱. بررسی طرف‌حساب الزامی (قانون ۱: سند بدون مخاطب مجاز نیست)
    if (!params.counterpartyClientId || String(params.counterpartyClientId).trim() === '') {
      throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
    }

    const snapshot = this.createWorkingSnapshot(currentState);
    const client = snapshot.clients.find(c => c.id === params.counterpartyClientId);
    if (!client) {
      throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
    }

    const closingDocNumber = params.closingDocumentNumber || `DOC-CLS-${params.fiscalYear}`;
    const openingDocNumber = params.openingDocumentNumber || `DOC-OPN-${params.fiscalYear + 1}`;
    const closingDate = params.closingDate || `${params.fiscalYear}/12/29`;
    const retainedEarningsCode = params.retainedEarningsAccountCode || '30201';
    const retainedEarningsTitle = params.retainedEarningsTitle || 'سود (زیان) انباشته سیستم';

    try {
      // ۲. جمع‌آوری مانده حساب‌های درآمد (کدهای معین شروع با ۴۰ یا گروه ۶)
      // و حساب‌های بهای تمام‌شده و هزینه (کدهای معین شروع با ۵۰ و ۶۰ یا گروه ۷ و ۸)
      const revenueBalances: Record<string, { code: string; title: string; credit: number; debit: number }> = {};
      const expenseBalances: Record<string, { code: string; title: string; credit: number; debit: number }> = {};

      snapshot.accountingEntries.forEach(entry => {
        // نادیده گرفتن اسناد اختتامیه قبلی
        if (entry.documentNumber.startsWith('DOC-CLS')) return;

        const code = String(entry.accountCode || '');
        const group = String(entry.groupCode || '');

        // تشخیص حساب‌های درآمدی (گروه ۶ یا کدهای معین ۴۰xxx)
        const isRevenue = group === '6' || code.startsWith('40') || code.startsWith('60') && !code.startsWith('601');
        // تشخیص حساب‌های هزینه‌ای (گروه ۷ و ۸ یا کدهای معین ۵۰xxx و ۶۰xxx)
        const isExpense = group === '7' || group === '8' || code.startsWith('50') || code.startsWith('601') || code.startsWith('8');

        if (isRevenue) {
          if (!revenueBalances[code]) {
            revenueBalances[code] = { code, title: entry.accountTitle, credit: 0, debit: 0 };
          }
          revenueBalances[code].credit += entry.credit || 0;
          revenueBalances[code].debit += entry.debit || 0;
        } else if (isExpense) {
          if (!expenseBalances[code]) {
            expenseBalances[code] = { code, title: entry.accountTitle, credit: 0, debit: 0 };
          }
          expenseBalances[code].credit += entry.credit || 0;
          expenseBalances[code].debit += entry.debit || 0;
        }
      });

      let totalRevenue = 0;
      let totalExpense = 0;
      const closingEntries: AccountingEntry[] = [];

      // بستن درآمدهای با مانده خالص بستانکار: بدهکار کردن حساب‌های درآمد
      Object.values(revenueBalances).forEach(rev => {
        const netCredit = rev.credit - rev.debit;
        if (netCredit > 0) {
          totalRevenue += netCredit;
          closingEntries.push({
            id: HabinoAccountingKernel.generateUUID(),
            tenantId,
            documentNumber: closingDocNumber,
            date: closingDate,
            description: `بستن حساب درآمد ${rev.title} در پایان سال مالی ${params.fiscalYear}`,
            accountCode: rev.code,
            accountTitle: rev.title,
            groupCode: '6',
            debit: netCredit,
            credit: 0,
            clientId: client.id,
            created_at: new Date().toISOString()
          });
        }
      });

      // بستن هزینه‌های با مانده خالص بدهکار: بستانکار کردن حساب‌های هزینه
      Object.values(expenseBalances).forEach(exp => {
        const netDebit = exp.debit - exp.credit;
        if (netDebit > 0) {
          totalExpense += netDebit;
          closingEntries.push({
            id: HabinoAccountingKernel.generateUUID(),
            tenantId,
            documentNumber: closingDocNumber,
            date: closingDate,
            description: `بستن حساب هزینه ${exp.title} در پایان سال مالی ${params.fiscalYear}`,
            accountCode: exp.code,
            accountTitle: exp.title,
            groupCode: '8',
            debit: 0,
            credit: netDebit,
            clientId: client.id,
            created_at: new Date().toISOString()
          });
        }
      });

      const netProfitOrLoss = totalRevenue - totalExpense;

      // ثبت مابه‌التفاوت در سود (زیان) انباشته
      if (netProfitOrLoss > 0) {
        // سود خالص: بستانکار کردن سود انباشته
        closingEntries.push({
          id: HabinoAccountingKernel.generateUUID(),
          tenantId,
          documentNumber: closingDocNumber,
          date: closingDate,
          description: `انتقال سود خالص سال مالی ${params.fiscalYear} به سود انباشته`,
          accountCode: retainedEarningsCode,
          accountTitle: retainedEarningsTitle,
          groupCode: '5',
          kolCode: '53',
          moeinCode: retainedEarningsCode,
          debit: 0,
          credit: netProfitOrLoss,
          clientId: client.id,
          created_at: new Date().toISOString()
        });
      } else if (netProfitOrLoss < 0) {
        // زیان خالص: بدهکار کردن سود (زیان) انباشته
        const absLoss = Math.abs(netProfitOrLoss);
        closingEntries.push({
          id: HabinoAccountingKernel.generateUUID(),
          tenantId,
          documentNumber: closingDocNumber,
          date: closingDate,
          description: `انتقال زیان خالص سال مالی ${params.fiscalYear} به سود (زیان) انباشته`,
          accountCode: retainedEarningsCode,
          accountTitle: retainedEarningsTitle,
          groupCode: '5',
          kolCode: '53',
          moeinCode: retainedEarningsCode,
          debit: absLoss,
          credit: 0,
          clientId: client.id,
          created_at: new Date().toISOString()
        });
      }

      // اعتبارسنجی تراز بودن سند اختتامیه
      const sumDebits = closingEntries.reduce((s, e) => s + (e.debit || 0), 0);
      const sumCredits = closingEntries.reduce((s, e) => s + (e.credit || 0), 0);
      if (Math.abs(sumDebits - sumCredits) > 1) {
        throw new Error('خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
      }

      // ۳. افزودن رکوردهای اختتامیه به دفتر کل
      snapshot.accountingEntries.push(...closingEntries);

      // ۴. صدور سند افتتاحیه سال مالی جدید برای حساب‌های دائم (ترازنامه)
      const openingDate = `${params.fiscalYear + 1}/01/01`;
      const openingEntries: AccountingEntry[] = [];

      // محاسبه تراز مانده دائمی حساب‌های دارایی، بدهی و حقوق صاحبان سهام
      const permanentAccounts: Record<string, { code: string; title: string; group: string; netBalance: number }> = {};
      snapshot.accountingEntries.forEach(entry => {
        if (entry.documentNumber.startsWith('DOC-OPN')) return; // سندهای افتتاحیه قبلی تکرار نشوند
        const grp = String(entry.groupCode || '');
        // گروه‌های ۱ تا ۵ دائمی هستند
        if (['1', '2', '3', '4', '5'].includes(grp)) {
          const key = entry.accountCode;
          if (!permanentAccounts[key]) {
            permanentAccounts[key] = {
              code: key,
              title: entry.accountTitle,
              group: grp,
              netBalance: 0
            };
          }
          permanentAccounts[key].netBalance += (entry.debit || 0) - (entry.credit || 0);
        }
      });

      Object.values(permanentAccounts).forEach(acc => {
        if (acc.netBalance !== 0) {
          openingEntries.push({
            id: HabinoAccountingKernel.generateUUID(),
            tenantId,
            documentNumber: openingDocNumber,
            date: openingDate,
            description: `مانده افتتاحیه سال مالی ${params.fiscalYear + 1} - ${acc.title}`,
            accountCode: acc.code,
            accountTitle: acc.title,
            groupCode: acc.group,
            debit: acc.netBalance > 0 ? acc.netBalance : 0,
            credit: acc.netBalance < 0 ? Math.abs(acc.netBalance) : 0,
            clientId: client.id,
            created_at: new Date().toISOString()
          });
        }
      });

      if (openingEntries.length > 0) {
        const opnDebit = openingEntries.reduce((s, e) => s + (e.debit || 0), 0);
        const opnCredit = openingEntries.reduce((s, e) => s + (e.credit || 0), 0);
        if (Math.abs(opnDebit - opnCredit) <= 1) {
          snapshot.accountingEntries.push(...openingEntries);
        }
      }

      return {
        nextState: snapshot,
        result: {
          fiscalYear: params.fiscalYear,
          closingDocumentNumber: closingDocNumber,
          openingDocumentNumber: openingDocNumber,
          totalRevenue,
          totalExpense,
          netProfitOrLoss,
          closingEntriesCount: closingEntries.length,
          openingEntriesCount: openingEntries.length
        }
      };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Fiscal close failed. Rolling back:', error?.message || error);
      if (error?.message === 'ثبت سند بدون انتخاب مخاطب مجاز نیست.') {
        throw error;
      }
      throw new Error('خطا در ثبت سند. هیچ تغییری ذخیره نشد.');
    }
  }

  /**
   * اجرای اتمیک یک دسته از عملیات مالی با تضمین Rollback قطعی در صورت بروز هرگونه خطا
   */
  public static executeAtomicTransaction<T>(
    currentState: FinancialStateSnapshot,
    transactionFn: (state: FinancialStateSnapshot) => T
  ): { nextState: FinancialStateSnapshot; result: T } {
    const snapshot = this.createSnapshot(currentState);
    try {
      const result = transactionFn(snapshot);
      return { nextState: snapshot, result };
    } catch (error: any) {
      console.warn('[AtomicTransactionWrapper] Batch transaction rolled back:', error?.message || error);
      throw error;
    }
  }

  /**
   * اعتبارسنجی انطباق متن پیام‌های خطای استاندارد ۹‌گانه سامانه هابینو
   */
  public static validateStandardErrorMessage(message: string): boolean {
    const standardErrors = [
      'ثبت سند بدون انتخاب مخاطب مجاز نیست.',
      'مبلغ سند نامعتبر است.',
      'سند موردنظر یافت نشد.',
      'حذف سند ناموفق بود. هیچ تغییری اعمال نشد.',
      'خطا در ثبت سند. هیچ تغییری ذخیره نشد.',
      'اطلاعات واردشده ناقص است.'
    ];
    return standardErrors.includes(message.trim());
  }
}
