/**
 * Habino Accounting Kernel (هسته استاندارد حسابداری هابینو)
 * پیاده‌سازی اصول پایه‌ای و سخت‌گیرانه ثبت، ذخیره‌سازی، ویرایش، حذف زنجیره‌ای و یکپارچگی داده‌های مالی
 * مطابق دستورالعمل قطعی و ACID پلتفرم هابینو
 */

import { AccountingEntry, Client, Invoice, Check, Transaction, Project, InventoryItem, BankAccount, TafsiliType } from '../types';
import { toBaseCurrency, BASE_FINANCIAL_CURRENCY, IRT_TO_IRR_MULTIPLIER } from './currencyUtils';
import { resolveAccountCoding } from './chartOfAccountsData';
import { getTransactionAccountCode, getTransactionPurpose } from './transactionAccounting';
import { habinoFinancialAuditLogger } from './errorLogger';


export interface AccountingValidationResult {
  valid: boolean;
  errorMessage?: string;
}

export class HabinoAccountingKernel {
  /**
   * هوشمندسازی و الصاق اطلاعات کدینگ ۳ سطحی و تفصیلی شناور به آرتیکل سند
   */
  public static enrichEntry(
    entry: AccountingEntry,
    tafsiliInfo?: { title?: string; type?: TafsiliType; code?: string }
  ): AccountingEntry {
    const coding = resolveAccountCoding(entry.accountCode);
    return {
      ...entry,
      moeinCode: coding.moein?.code || entry.accountCode,
      kolCode: coding.kol?.code || entry.accountCode.substring(0, 2),
      groupCode: coding.group?.code || entry.accountCode.substring(0, 1),
      tafsiliTitle: tafsiliInfo?.title || entry.tafsiliTitle,
      tafsiliType: tafsiliInfo?.type || entry.tafsiliType,
      tafsiliCode: tafsiliInfo?.code || entry.tafsiliCode
    };
  }

  /**
   * تولید شناسه یکتای جهانی (UUID)
   */
  public static generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'habino-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * 🧩 ۱) اصول پایه‌ای اعتبارسنجی ثبت سند
   * - بررسی انتخاب مخاطب
   * - بررسی مبالغ بدهکار و بستانکار
   */
  public static validateDocumentEntry(params: {
    clientId?: string;
    clientsList?: Client[];
    debit?: number;
    credit?: number;
    amount?: number;
  }): AccountingValidationResult {
    // مخاطب (طرف حساب) را بررسی کند
    if (!params.clientId || params.clientId.trim() === '') {
      return {
        valid: false,
        errorMessage: 'ثبت سند بدون انتخاب مخاطب مجاز نیست.'
      };
    }

    // بررسی فعال بودن یا وجود مخاطب
    if (params.clientsList && params.clientsList.length > 0) {
      const clientExists = params.clientsList.some(c => c.id === params.clientId);
      if (!clientExists) {
        return {
          valid: false,
          errorMessage: 'ثبت سند بدون انتخاب مخاطب مجاز نیست.'
        };
      }
    }

    // مبالغ بدهکار و بستانکار
    const debit = params.debit ?? (params.amount && params.amount > 0 ? params.amount : 0);
    const credit = params.credit ?? 0;

    if (debit === 0 && credit === 0) {
      return {
        valid: false,
        errorMessage: 'مبلغ سند نامعتبر است.'
      };
    }

    return { valid: true };
  }

  /**
   * 🧩 ۲) ایجاد رکوردهای دوبل دفتر کل برای فاکتور (فروش، خرید، مرجوعی)
   */
  public static createDoubleEntryForInvoice(
    invoice: Invoice,
    tenantId: string
  ): AccountingEntry[] {
    const entries: AccountingEntry[] = [];
    const docNum = `DOC-INV-${invoice.invoiceNumber}`;
    const dateStr = invoice.date;
    const invType = invoice.type || 'sale';

    if (invType === 'purchase') {
      // فاکتور خرید: بدهکار موجودی کالا/هزینه، بستانکار طرف‌حساب تامین‌کننده
      const netAmount = invoice.subtotal - (invoice.totalDiscount || 0);
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `خرید کالا/تجهیزات فاکتور شماره ${invoice.invoiceNumber} از ${invoice.clientName || 'تأمین‌کننده'}`,
        accountCode: '10301',
        accountTitle: 'موجودی کالا و ملزومات مصرفی',
        debit: netAmount,
        credit: 0,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      if (invoice.totalTax > 0) {
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `مالیات بر ارزش افزوده خرید فاکتور ${invoice.invoiceNumber}`,
          accountCode: '20301',
          accountTitle: 'مالیات و عوارض ارزش افزوده پرداختنی',
          debit: invoice.totalTax,
          credit: 0,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
      }

      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `بدهی بابت فاکتور خرید شماره ${invoice.invoiceNumber} به ${invoice.clientName || 'تأمین‌کننده'}`,
        accountCode: '20101',
        accountTitle: 'حساب‌های پرداختنی تجاری (تأمین‌کنندگان)',
        debit: 0,
        credit: invoice.grandTotal,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      if (invoice.amountPaid > 0) {
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `تسویه فوری/پرداخت نقدی وجه فاکتور خرید ${invoice.invoiceNumber}`,
          accountCode: '20101',
          accountTitle: 'حساب‌های پرداختنی تجاری (تأمین‌کنندگان)',
          debit: invoice.amountPaid,
          credit: 0,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `خروج وجه نقد/بانک بابت پرداخت فاکتور خرید ${invoice.invoiceNumber}`,
          accountCode: '10102',
          accountTitle: 'بانک‌ها و حساب‌های جاری ریالی',
          debit: 0,
          credit: invoice.amountPaid,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
      }
    } else if (invType === 'sale_return') {
      const returnIsCash = invoice.metadata?.returnSettlementMethod === 'cash';
      const netAmount = invoice.subtotal - (invoice.totalDiscount || 0);
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `مرجوعی فروش و ابطال درآمد فاکتور شماره ${invoice.invoiceNumber} - ${invoice.clientName || 'مشتری'}`,
        accountCode: '40101',
        accountTitle: 'درآمد ارائه خدمات و فروش (برگشتی)',
        debit: netAmount,
        credit: 0,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      if (invoice.totalTax > 0) {
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `تعدیل مالیات ارزش افزوده برگشت از فروش فاکتور ${invoice.invoiceNumber}`,
          accountCode: '20301',
          accountTitle: 'مالیات و عوارض ارزش افزوده پرداختنی',
          debit: invoice.totalTax,
          credit: 0,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
      }

      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تسویه برگشت از فروش شماره ${invoice.invoiceNumber}`,
        accountCode: returnIsCash ? '10101' : '10201',
        accountTitle: returnIsCash ? 'موجودی نقد و بانک‌ها' : 'حساب‌ها و اسناد دریافتنی تجاری (مشتریان)',
        debit: 0,
        credit: invoice.grandTotal,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });
    } else if (invType === 'purchase_return') {
      const returnIsCash = invoice.metadata?.returnSettlementMethod === 'cash';
      const netAmount = invoice.subtotal - (invoice.totalDiscount || 0);
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تسویه برگشت از خرید فاکتور شماره ${invoice.invoiceNumber} به ${invoice.clientName || 'تأمین‌کننده'}`,
        accountCode: returnIsCash ? '10101' : '20101',
        accountTitle: returnIsCash ? 'موجودی نقد و بانک‌ها' : 'حساب‌های پرداختنی تجاری (تأمین‌کنندگان)',
        debit: invoice.grandTotal,
        credit: 0,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `برگشت کالای خریداری شده فاکتور ${invoice.invoiceNumber}`,
        accountCode: '10301',
        accountTitle: 'موجودی کالا و ملزومات مصرفی',
        debit: 0,
        credit: netAmount,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      if (invoice.totalTax > 0) {
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `تعدیل ارزش افزوده برگشت از خرید فاکتور ${invoice.invoiceNumber}`,
          accountCode: '20301',
          accountTitle: 'مالیات و عوارض ارزش افزوده پرداختنی',
          debit: 0,
          credit: invoice.totalTax,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
      }
    } else {
      // پیش‌فرض: فاکتور فروش یا خدمات
      // ۱. بدهکار: حساب‌ها و اسناد دریافتنی تجاری
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `شناسایی طلب فاکتور رسمی شماره ${invoice.invoiceNumber} - ${invoice.clientName || 'مشتری'}`,
        accountCode: '10201',
        accountTitle: 'حساب‌ها و اسناد دریافتنی تجاری (مشتریان)',
        debit: invoice.grandTotal,
        credit: 0,
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      // ۲. بستانکار: درآمد فروش / ارائه خدمات
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `درآمد عملیاتی حاصل از فاکتور ${invoice.invoiceNumber}`,
        accountCode: '40101',
        accountTitle: 'درآمد ارائه خدمات و فروش',
        debit: 0,
        credit: invoice.subtotal - (invoice.totalDiscount || 0),
        clientId: invoice.clientId,
        projectTag: invoice.projectId,
        created_at: new Date().toISOString()
      });

      // ۳. بستانکار: مالیات بر ارزش افزوده (در صورت وجود)
      if (invoice.totalTax > 0) {
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `مالیات و عوارض ارزش افزوده فاکتور ${invoice.invoiceNumber}`,
          accountCode: '20301',
          accountTitle: 'مالیات و عوارض ارزش افزوده پرداختنی',
          debit: 0,
          credit: invoice.totalTax,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
      }

      // ۴. در صورت پرداخت نقدی فوری در زمان ثبت فاکتور
      if (invoice.amountPaid > 0) {
        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `وصول نقدی وجه فاکتور ${invoice.invoiceNumber}`,
          accountCode: '10101',
          accountTitle: 'موجودی نقد و بانک‌ها',
          debit: invoice.amountPaid,
          credit: 0,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });

        entries.push({
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `کاهش مانده بدهکاری با دریافت نقدی فاکتور ${invoice.invoiceNumber}`,
          accountCode: '10201',
          accountTitle: 'حساب‌ها و اسناد دریافتنی تجاری (مشتریان)',
          debit: 0,
          credit: invoice.amountPaid,
          clientId: invoice.clientId,
          projectTag: invoice.projectId,
          created_at: new Date().toISOString()
        });
      }
    }

    // 🛡️ اعمال شرط تغییرناپذیری تراز (Double-Entry Balance Invariant Guard - DEF-01)
    this.assertDoubleEntryBalanceInvariant(entries, docNum);

    return entries.map(entry => ({
      ...entry,
      referenceId: invoice.id || entry.referenceId
    }));
  }

  /**
   * 🛡️ گارد تغییرناپذیری تراز سند دوبل (Double-Entry Balance Invariant Guard)
   * اگر مجموع بدهکار و بستانکار حتی ۱ ریال ناتراز باشد، بلافاصله خطا صادر کرده و مانع ثبت می‌شود.
   * بر اساس استاندارد مالی هابینو: واحد پول پایه ریال بوده و انحراف مجاز دقیقاً صفر ریال (0 IRR) است.
   */
  public static assertDoubleEntryBalanceInvariant(entries: AccountingEntry[], docIdentifier: string): void {
    if (!entries || entries.length === 0) {
      const err = `[CRITICAL INVARIANT VIOLATION] سند ${docIdentifier} فاقد آرتیکل است! ثبت سند بدون آرتیکل مجاز نمی‌باشد.`;
      habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
        docIdentifier,
        status: 'BLOCKED',
        summaryFa: `انسداد سند: سند ${docIdentifier} فاقد هرگونه آرتیکل حسابداری است.`,
        metadata: { entriesCount: 0 }
      });
      throw new Error(err);
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rawDebit = entry.debit;
      const rawCredit = entry.credit;

      // 🛡️ اعتبارسنجی سختگیرانه مقادیر عددی بدهکار و بستانکار (مصوب بنیانگذار)
      // ممانعت مطلق از تبدیل خاموش مقادیر نامعتبر، رشته‌های غیرعددی، NaN، Null، نامتناهی یا مبالغ منفی
      if (rawDebit === null || rawDebit === undefined || rawCredit === null || rawCredit === undefined) {
        const err = `[CRITICAL INVARIANT VIOLATION] آرتیکل ردیف ${i + 1} در سند ${docIdentifier} دارای فیلد بدهکار یا بستانکار تهی (null/undefined) است.`;
        habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
          docIdentifier,
          status: 'BLOCKED',
          summaryFa: `انسداد سند: آرتیکل دارای مقادیر تهی بدهکار/بستانکار است.`,
          metadata: { entriesCount: entries.length, violationType: 'NULL_OR_UNDEFINED_FIELD' }
        });
        throw new Error(err);
      }

      const debitNum = Number(rawDebit);
      const creditNum = Number(rawCredit);

      if (
        typeof rawDebit === 'boolean' ||
        typeof rawCredit === 'boolean' ||
        isNaN(debitNum) ||
        isNaN(creditNum) ||
        !isFinite(debitNum) ||
        !isFinite(creditNum)
      ) {
        const err = `[CRITICAL INVARIANT VIOLATION] آرتیکل ردیف ${i + 1} در سند ${docIdentifier} دارای مقدار غیرعددی یا نامعتبر (NaN/Infinity) است.`;
        habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
          docIdentifier,
          status: 'BLOCKED',
          summaryFa: `انسداد سند: مقادیر بدهکار یا بستانکار نامعتبر یا غیرعددی هستند.`,
          metadata: { entriesCount: entries.length, violationType: 'INVALID_NUMERIC_VALUE' }
        });
        throw new Error(err);
      }

      if (debitNum < 0 || creditNum < 0) {
        const err = `[CRITICAL INVARIANT VIOLATION] آرتیکل ردیف ${i + 1} در سند ${docIdentifier} دارای مبلغ منفی است! ثبت ارقام منفی در دفاتر دوبل مجاز نمی‌باشد.`;
        habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
          docIdentifier,
          status: 'BLOCKED',
          summaryFa: `انسداد سند: شناسایی رقم منفی در آرتیکل دفتر کل هابینو.`,
          metadata: { entriesCount: entries.length, violationType: 'NEGATIVE_AMOUNT_REJECTED' }
        });
        throw new Error(err);
      }

      if (debitNum === 0 && creditNum === 0) {
        const err = `[CRITICAL INVARIANT VIOLATION] آرتیکل ردیف ${i + 1} در سند ${docIdentifier} فاقد گردش است (بدهکار و بستانکار هر دو صفر).`;
        habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
          docIdentifier,
          status: 'BLOCKED',
          summaryFa: `انسداد سند: آرتیکل بدون گردش مالی (صفر ریال).`,
          metadata: { entriesCount: entries.length, violationType: 'ZERO_AMOUNT_ARTICLE' }
        });
        throw new Error(err);
      }

      totalDebit += debitNum;
      totalCredit += creditNum;
    }

    const discrepancy = Math.abs(Math.round(totalDebit) - Math.round(totalCredit));
    if (discrepancy !== 0) {
      const err = `[CRITICAL INVARIANT VIOLATION] سند ${docIdentifier} تراز نیست! مجموع بدهکار=${totalDebit} | مجموع بستانکار=${totalCredit} | انحراف=${discrepancy} ریال`;
      // 🛡️ ثبت رویداد نقض توازن بر اساس گره ۲ بخش ۸.۳ کتابخانه دانش (بدون افشای مبالغ در لاگ)
      habinoFinancialAuditLogger.logEvent('INVARIANT_VIOLATION_ROLLBACK', {
        docIdentifier,
        status: 'BLOCKED',
        summaryFa: `شناسایی ناترازی و انسداد ثبت سند به دلیل نقض گارد تغییرناپذیری توازن دفتر کل (Double-Entry Invariant Violation)`,
        metadata: { entriesCount: entries.length, violationType: 'UNBALANCED_ENTRIES' }
      });
      throw new Error(err);
    }
  }

  /**
   * 🧩 اصول ثبت مانده اول دوره / افتتاحیه اشخاص (Client Opening Balance)
   * - ذخیره‌سازی مبالغ بر پایه واحد پول ثابت (ریال) به همراه برچسب‌های مالی
   * - اگر مانده مثبت باشد (بدهکار به ما): بدهکار حساب‌های دریافتنی (۱۰۲۰۱)، بستانکار حساب تراز افتتاحیه (۳۰۱۰۳)
   * - اگر مانده منفی باشد (بستانکار از ما): بدهکار حساب تراز افتتاحیه (۳۰۱۰۳)، بستانکار حساب‌های پرداختنی (۲۰۱۰۱)
   * - سند دوبل متوازن با شماره DOC-OPN-... و شناسه یکتا
   */
  public static createDoubleEntryForClientOpeningBalance(
    client: Client,
    tenantId: string
  ): AccountingEntry[] {
    const rawBalance = Number(client.balance) || 0;
    if (rawBalance === 0) {
      return [];
    }

    const entries: AccountingEntry[] = [];
    const docNum = `DOC-OPN-${client.id.substring(0, 8).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('fa-IR');
    const partyName = client.name || 'طرف‌حساب';
    const baseAmount = toBaseCurrency(Math.abs(rawBalance), 'IRT');

    if (rawBalance > 0) {
      // مشتری بدهکار است
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `مانده حساب اول دوره (بدهکاری اولیه) - ${partyName}`,
        accountCode: '10201',
        accountTitle: 'حساب‌ها و اسناد دریافتنی تجاری (مشتریان)',
        debit: rawBalance,
        credit: 0,
        clientId: client.id,
        referenceId: client.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: baseAmount,
        baseCredit: 0,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      });

      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تراز افتتاحیه / حساب مقابل مانده طرف‌حساب ${partyName}`,
        accountCode: '30103',
        accountTitle: 'حساب تراز افتتاحیه',
        debit: 0,
        credit: rawBalance,
        clientId: client.id,
        referenceId: client.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: 0,
        baseCredit: baseAmount,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      });
    } else {
      // طرف‌حساب بستانکار است (طلبکار از ما)
      const absBal = Math.abs(rawBalance);
      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تراز افتتاحیه / حساب مقابل مانده طرف‌حساب ${partyName}`,
        accountCode: '30103',
        accountTitle: 'حساب تراز افتتاحیه',
        debit: absBal,
        credit: 0,
        clientId: client.id,
        referenceId: client.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: baseAmount,
        baseCredit: 0,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      });

      entries.push({
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `مانده حساب اول دوره (بستانکاری اولیه) - ${partyName}`,
        accountCode: '20101',
        accountTitle: 'حساب‌ها و اسناد پرداختنی تجاری (تأمین‌کنندگان)',
        debit: 0,
        credit: absBal,
        clientId: client.id,
        referenceId: client.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: 0,
        baseCredit: baseAmount,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      });
    }

    return entries;
  }

  /**
   * 🧩 اصول ثبت سند افتتاحیه موجودی کالای اول دوره انبار
   * - بدهکار: حساب ۱۰۳۰۱ (موجودی کالا و ملزومات اول دوره)
   * - بستانکار: حساب ۳۰۱۰۳ (تراز افتتاحیه، جدا از آورده واقعی شرکا)
   */
  public static createDoubleEntryForInventoryOpeningBalance(
    item: InventoryItem,
    tenantId: string
  ): AccountingEntry[] {
    const stock = Number(item.stock) || 0;
    const buyPrice = Number(item.buyPrice) || 0;
    const totalVal = stock * buyPrice;
    if (totalVal <= 0) return [];

    const docNum = `DOC-OPN-INV-${item.id.substring(0, 8).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('fa-IR');
    const baseAmount = toBaseCurrency(totalVal, 'IRT');

    return [
      {
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تراز افتتاحیه / موجودی کالای اول دوره - ${item.name} (${stock} عدد به بهای ${buyPrice})`,
        accountCode: '10301',
        accountTitle: 'موجودی کالا و قطعات مصرفی',
        debit: totalVal,
        credit: 0,
        referenceId: item.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: baseAmount,
        baseCredit: 0,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      },
      {
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تراز افتتاحیه / حساب مقابل موجودی کالا - ${item.name}`,
        accountCode: '30103',
        accountTitle: 'حساب تراز افتتاحیه',
        debit: 0,
        credit: totalVal,
        referenceId: item.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: 0,
        baseCredit: baseAmount,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      }
    ];
  }

  /**
   * 🧩 اصول ثبت سند افتتاحیه حساب‌های بانکی و صندوق
   * - بدهکار: حساب ۱۰۱۰۱ (موجودی نقد و بانک‌ها اول دوره)
   * - بستانکار: حساب ۳۰۱۰۳ (تراز افتتاحیه، جدا از آورده واقعی شرکا)
   */
  public static createDoubleEntryForBankAccountOpeningBalance(
    bank: BankAccount,
    tenantId: string
  ): AccountingEntry[] {
    const rawBalance = Number(bank.balance) || 0;
    if (rawBalance <= 0) return [];

    const docNum = `DOC-OPN-BNK-${bank.id.substring(0, 8).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('fa-IR');
    const baseAmount = toBaseCurrency(rawBalance, 'IRT');
    const accountCode = bank.accountCode || (bank.accountType === 'cash' ? '10101' : '10102');
    const accountTitle = bank.accountTitle ||
      (bank.accountType === 'cash' ? 'صندوق ریالی و وجوه نقد' : 'بانک‌ها و حساب‌های جاری ریالی');

    return [
      {
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تراز افتتاحیه / ${bank.accountType === 'cash' ? 'موجودی صندوق' : 'موجودی بانک'} اول دوره - ${bank.bankName}${bank.accountNumber ? ` (${bank.accountNumber})` : ''}`,
        accountCode,
        accountTitle,
        debit: rawBalance,
        credit: 0,
        referenceId: bank.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: baseAmount,
        baseCredit: 0,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      },
      {
        id: this.generateUUID(),
        tenantId,
        documentNumber: docNum,
        date: dateStr,
        description: `تراز افتتاحیه / حساب مقابل موجودی ${bank.accountType === 'cash' ? 'صندوق' : 'بانک'} - ${bank.bankName}`,
        accountCode: '30103',
        accountTitle: 'حساب تراز افتتاحیه',
        debit: 0,
        credit: rawBalance,
        referenceId: bank.id,
        baseCurrency: BASE_FINANCIAL_CURRENCY,
        baseDebit: 0,
        baseCredit: baseAmount,
        exchangeRate: IRT_TO_IRR_MULTIPLIER,
        created_at: new Date().toISOString()
      }
    ];
  }

  /**
   * 🧩 اعتبارسنجی سقف اعتبار طرف‌حساب (Credit Limit Check)
   */
  public static validateCreditLimit(
    client: Client,
    additionalDebt: number
  ): {
    isExceeded: boolean;
    isBlocked: boolean;
    currentBalance: number;
    projectedBalance: number;
    creditLimit: number;
    remainingCredit: number;
    messageFa?: string;
  } {
    const currentBalance = Number(client.balance) || 0;
    const creditLimit = Number(client.creditLimit) || 0;
    const isBlocked = !!client.isBlockedForCredit;
    const projectedBalance = currentBalance + Math.max(0, additionalDebt);

    if (isBlocked && additionalDebt > 0) {
      return {
        isExceeded: true,
        isBlocked: true,
        currentBalance,
        projectedBalance,
        creditLimit,
        remainingCredit: 0,
        messageFa: `طرف‌حساب «${client.name}» در سامانه مسدودیت اعتباری دارد و صدور فاکتور نسیه یا ثبت بدهی جدید برای وی مجاز نمی‌باشد.`
      };
    }

    if (creditLimit <= 0) {
      return {
        isExceeded: false,
        isBlocked: false,
        currentBalance,
        projectedBalance,
        creditLimit: 0,
        remainingCredit: Infinity
      };
    }

    const remainingCredit = creditLimit - currentBalance;
    const isExceeded = projectedBalance > creditLimit;

    return {
      isExceeded,
      isBlocked: false,
      currentBalance,
      projectedBalance,
      creditLimit,
      remainingCredit,
      messageFa: isExceeded
        ? `هشدار سقف اعتبار: بدهی طرف‌حساب پس از این سند به ${projectedBalance.toLocaleString('fa-IR')} خواهد رسید که از سقف مجاز (${creditLimit.toLocaleString('fa-IR')}) بیشتر است.`
        : undefined
    };
  }

  /**
   * 🧩 محاسبه ترازنامه افتتاحیه کامل سیستم (Opening Balance Sheet)
   * تضمین تساوی: دارایی‌ها = بدهی‌ها + سرمایه اول دوره
   */
  public static createOpeningBalanceSheetSummary(params: {
    clients: Client[];
    inventory: InventoryItem[];
    bankAccounts: BankAccount[];
    entries: AccountingEntry[];
  }): {
    totalCashAssets: number;
    totalReceivables: number;
    totalInventoryAssets: number;
    totalNonCurrentAssets: number;
    totalAssets: number;
    totalPayables: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    discrepancy: number;
    isBalanced: boolean;
  } {
    const openingEntries = params.entries.filter(entry =>
      entry.documentNumber?.startsWith('DOC-OPN')
    );
    const debitBalance = (entries: AccountingEntry[]) =>
      entries.reduce(
        (sum, entry) => sum + (Number(entry.debit) || 0) - (Number(entry.credit) || 0),
        0
      );
    const creditBalance = (entries: AccountingEntry[]) => {
      const balance = -debitBalance(entries);
      return Math.abs(balance) < 0.01 ? 0 : balance;
    };
    const entriesByGroup = (groupCode: string) => openingEntries.filter(
      entry => resolveAccountCoding(entry.accountCode).group?.code === groupCode
    );

    const currentAssetEntries = entriesByGroup('1');
    const nonCurrentAssetEntries = entriesByGroup('2');
    const liabilityEntries = [...entriesByGroup('3'), ...entriesByGroup('4')];
    const equityEntries = entriesByGroup('5');
    const totalCashAssets = debitBalance(
      currentAssetEntries.filter(entry => entry.accountCode.startsWith('101'))
    );
    const totalReceivables = debitBalance(
      currentAssetEntries.filter(entry => entry.accountCode === '10201')
    );
    const totalInventoryAssets = debitBalance(
      currentAssetEntries.filter(entry => entry.accountCode === '10301')
    );
    const totalNonCurrentAssets = debitBalance(nonCurrentAssetEntries);
    const totalAssets = debitBalance([...currentAssetEntries, ...nonCurrentAssetEntries]);
    const totalPayables = creditBalance(liabilityEntries);
    const totalEquity = creditBalance(equityEntries);
    const totalLiabilitiesAndEquity = totalPayables + totalEquity;
    const discrepancy = Math.abs(totalAssets - totalLiabilitiesAndEquity);

    return {
      totalCashAssets,
      totalReceivables,
      totalInventoryAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalPayables,
      totalEquity,
      totalLiabilitiesAndEquity,
      discrepancy,
      isBalanced: discrepancy < 0.01
    };
  }

  /**
   * 🧩 ۶) اصول ثبت پیش‌پرداخت پروژه
   * - در حساب کارفرما ثبت شود
   * - برچسب پروژه داشته باشد
   * - در دفتر کل ذخیره شود
   * بدهکار: بانک / اسناد دریافتنی
   * بستانکار: کارفرما
   */
  public static createProjectAdvanceEntry(params: {
    project: Project;
    amount: number;
    date: string;
    description: string;
    tenantId: string;
  }): AccountingEntry[] {
    const docNum = `DOC-PRJ-ADV-${params.project.id.slice(0, 8)}`;
    return [
      {
        id: this.generateUUID(),
        tenantId: params.tenantId,
        documentNumber: docNum,
        date: params.date,
        description: `دریافت پیش‌پرداخت پروژه ${params.project.title}: ${params.description}`,
        accountCode: '10101',
        accountTitle: 'موجودی نقد و بانک‌ها',
        debit: params.amount,
        credit: 0,
        clientId: params.project.clientId,
        projectTag: params.project.id,
        referenceId: params.project.id,
        created_at: new Date().toISOString()
      },
      {
        id: this.generateUUID(),
        tenantId: params.tenantId,
        documentNumber: docNum,
        date: params.date,
        description: `پیش‌دریافت کارفرما (${params.project.clientName || 'کارفرما'}) بابت پروژه ${params.project.title}`,
        accountCode: '20201',
        accountTitle: 'پیش‌دریافت از مشتریان / کارفرمایان',
        debit: 0,
        credit: params.amount,
        clientId: params.project.clientId,
        projectTag: params.project.id,
        referenceId: params.project.id,
        created_at: new Date().toISOString()
      }
    ];
  }

  /**
   * 🧩 ۷) اصول ثبت سود پروژه
   * - پس از تکمیل پروژه
   * - بدهکار: حساب سود پروژه
   * - بستانکار: حساب سود سیستم
   */
  public static createProjectProfitEntry(params: {
    project: Project;
    netProfit: number;
    date: string;
    tenantId: string;
  }): AccountingEntry[] {
    const docNum = `DOC-PRJ-PROFIT-${params.project.id.slice(0, 8)}`;
    return [
      {
        id: this.generateUUID(),
        tenantId: params.tenantId,
        documentNumber: docNum,
        date: params.date,
        description: `شناسایی و بستن سود خالص پروژه ${params.project.title}`,
        accountCode: '50101',
        accountTitle: 'حساب سود پروژه',
        debit: params.netProfit,
        credit: 0,
        clientId: params.project.clientId,
        projectTag: params.project.id,
        referenceId: params.project.id,
        created_at: new Date().toISOString()
      },
      {
        id: this.generateUUID(),
        tenantId: params.tenantId,
        documentNumber: docNum,
        date: params.date,
        description: `انتقال سود به حساب سود و زیان انباشته سیستم - پروژه ${params.project.title}`,
        accountCode: '30201',
        accountTitle: 'حساب سود سیستم (سود انباشته)',
        debit: 0,
        credit: params.netProfit,
        clientId: params.project.clientId,
        projectTag: params.project.id,
        referenceId: params.project.id,
        created_at: new Date().toISOString()
      }
    ];
  }

  /**
   * 🧩 ایجاد رکوردهای دوبل دفتر کل برای تراکنش‌های نقد و بانک (درآمد و هزینه)
   */
  public static createDoubleEntryForTransaction(
    tx: Transaction,
    tenantId: string,
    accountType: BankAccount['accountType'] = 'cash',
    accountDetails?: {
      cashAccountCode?: string;
      cashAccountTitle?: string;
      expenseAccountCode?: string;
      expenseAccountTitle?: string;
      counterAccountCode?: string;
      counterAccountTitle?: string;
      counterTafsiliCode?: string;
      counterTafsiliTitle?: string;
      counterTafsiliType?: AccountingEntry['tafsiliType'];
      destinationAccountCode?: string;
      destinationAccountTitle?: string;
    }
  ): AccountingEntry[] {
    const docNum = `DOC-TX-${tx.id.slice(0, 8)}`;
    const dateStr = tx.date;
    const purpose = getTransactionPurpose(tx);
    const cashAccountCode = accountDetails?.cashAccountCode ||
      (accountType === 'bank' ? '10102' : '10101');
    const cashAccountTitle = accountDetails?.cashAccountTitle ||
      (accountType === 'bank' ? 'بانک‌ها و حساب‌های جاری ریالی' : 'صندوق ریالی و وجوه نقد');
    const counterAccountCode = accountDetails?.counterAccountCode ||
      getTransactionAccountCode(tx) ||
      (purpose === 'revenue' ? '40102' : '60102');
    const counterAccountTitle = accountDetails?.counterAccountTitle ||
      accountDetails?.expenseAccountTitle ||
      (purpose === 'revenue' ? 'درآمد ارائه خدمات فنی و مهندسی' : 'حساب مقابل تراکنش');
    const baseEntry = {
      tenantId,
      documentNumber: docNum,
      date: dateStr,
      clientId: tx.clientId,
      clientName: tx.clientName,
      projectTag: tx.projectId,
      referenceId: tx.id,
      created_at: new Date().toISOString()
    };

    if (purpose === 'transfer') {
      return [
        {
          id: this.generateUUID(),
          ...baseEntry,
          description: `انتقال وجه به ${accountDetails?.destinationAccountTitle || tx.toAccount || 'حساب مقصد'}: ${tx.description}`,
          accountCode: accountDetails?.destinationAccountCode || '',
          accountTitle: accountDetails?.destinationAccountTitle || tx.toAccount || 'حساب مقصد',
          debit: tx.amount,
          credit: 0
        },
        {
          id: this.generateUUID(),
          ...baseEntry,
          description: `انتقال وجه از ${cashAccountTitle}: ${tx.description}`,
          accountCode: cashAccountCode,
          accountTitle: cashAccountTitle,
          debit: 0,
          credit: tx.amount
        }
      ];
    }

    if (tx.type === 'income') {
      return [
        {
          id: this.generateUUID(),
          ...baseEntry,
          description: `دریافت وجه (${tx.category}): ${tx.description}`,
          accountCode: cashAccountCode,
          accountTitle: cashAccountTitle,
          debit: tx.amount,
          credit: 0
        },
        {
          id: this.generateUUID(),
          ...baseEntry,
          description: `${tx.category}: ${tx.description}`,
          accountCode: counterAccountCode,
          accountTitle: counterAccountTitle,
          debit: 0,
          credit: tx.amount,
          ...(counterAccountCode === '30101' || counterAccountCode === '30102' ? {
            tafsiliCode: accountDetails?.counterTafsiliCode,
            tafsiliTitle: accountDetails?.counterTafsiliTitle,
            tafsiliType: accountDetails?.counterTafsiliType
          } : {})
        }
      ];
    }

    return [
      {
        id: this.generateUUID(),
        ...baseEntry,
        description: `${tx.category}: ${tx.description}`,
        accountCode: counterAccountCode,
        accountTitle: counterAccountTitle,
        debit: tx.amount,
        credit: 0,
        ...(counterAccountCode === '30101' || counterAccountCode === '30102' ? {
          tafsiliCode: accountDetails?.counterTafsiliCode,
          tafsiliTitle: accountDetails?.counterTafsiliTitle,
          tafsiliType: accountDetails?.counterTafsiliType
        } : {})
      },
      {
        id: this.generateUUID(),
        ...baseEntry,
        description: `پرداخت وجه از ${cashAccountTitle}: ${tx.description}`,
        accountCode: cashAccountCode,
        accountTitle: cashAccountTitle,
        debit: 0,
        credit: tx.amount
      }
    ];
  }

  /**
   * 🧩 ایجاد رکوردهای دوبل دفتر کل برای ثبت سند چک (دریافتی یا پرداختی)
   */
  public static createDoubleEntryForCheck(
    check: Check,
    tenantId: string
  ): AccountingEntry[] {
    const docNum = `DOC-CHK-${check.checkNumber || check.id.slice(0, 8)}`;
    const dateStr = check.issueDate;
    const isIncoming = check.type === 'receivable';

    if (isIncoming) {
      return [
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `دریافت چک صیادی شماره ${check.checkNumber} از ${check.clientName || 'مشتری'}`,
          accountCode: '10202',
          accountTitle: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)',
          debit: check.amount,
          credit: 0,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        },
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `تسویه حساب با دریافت چک شماره ${check.checkNumber}`,
          accountCode: '10201',
          accountTitle: 'حساب‌ها و اسناد دریافتنی تجاری (مشتریان)',
          debit: 0,
          credit: check.amount,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        }
      ];
    } else {
      return [
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `تسویه بدهی با صدور چک شماره ${check.checkNumber} در وجه ${check.clientName || 'تأمین‌کننده'}`,
          accountCode: '20101',
          accountTitle: 'حساب‌های پرداختنی تجاری (تأمین‌کنندگان)',
          debit: check.amount,
          credit: 0,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        },
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: dateStr,
          description: `صدور چک پرداختنی شماره ${check.checkNumber} عهده بانک ${check.bankName}`,
          accountCode: '20102',
          accountTitle: 'اسناد پرداختنی تجاری (چک‌های عهده بانک)',
          debit: 0,
          credit: check.amount,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        }
      ];
    }
  }

  /**
   * 🧩 ایجاد رکوردهای دوبل وصول یا پاس شدن چک در بانک
   */
  public static createDoubleEntryForCheckClearing(
    check: Check,
    tenantId: string,
    clearDate: string
  ): AccountingEntry[] {
    const docNum = `DOC-CHK-CLR-${check.checkNumber || check.id.slice(0, 8)}`;
    const isIncoming = check.type === 'receivable';

    if (isIncoming) {
      return [
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: clearDate,
          description: `وصول چک شماره ${check.checkNumber} به صندوق یا حساب مقصد`,
          accountCode: check.metadata?.bankAccountCode || '10101',
          accountTitle: check.metadata?.bankAccountTitle || 'صندوق ریالی و وجوه نقد',
          debit: check.amount,
          credit: 0,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        },
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: clearDate,
          description: `خروج چک وصول‌شده شماره ${check.checkNumber} از اسناد در جریان وصول`,
          accountCode: '10202',
          accountTitle: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)',
          debit: 0,
          credit: check.amount,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        }
      ];
    } else {
      return [
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: clearDate,
          description: `پاس شدن و تسویه چک عهده بانک شماره ${check.checkNumber}`,
          accountCode: '20102',
          accountTitle: 'اسناد پرداختنی تجاری (چک‌های عهده بانک)',
          debit: check.amount,
          credit: 0,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        },
        {
          id: this.generateUUID(),
          tenantId,
          documentNumber: docNum,
          date: clearDate,
          description: `برداشت وجه چک شماره ${check.checkNumber} از حساب بانکی`,
          accountCode: check.metadata?.bankAccountCode || '10102',
          accountTitle: check.metadata?.bankAccountTitle || `بانک ${check.bankName}`,
          debit: 0,
          credit: check.amount,
          clientId: check.clientId,
          referenceId: check.id,
          created_at: new Date().toISOString()
        }
      ];
    }
  }
}
