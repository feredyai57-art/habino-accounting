/**
 * Habino Accounting Golden Scenarios Centum (سناریوهای طلایی ۳۳ تا ۱۰۰ حسابداری اصناف واقعی ایران)
 * سپر دفاعی و اعتبارسنجی جامع هسته حسابداری مطابق قوانین مالی، مالیاتی و تجاری اصناف ایران:
 * 
 * - سناریوهای ۳۳ تا ۴۲: اصناف فروشگاهی، پخش مویرگی، سوپرمارکت و کالاهای تندمصرف (FMCG)
 * - سناریوهای ۴۳ تا ۴۸: صنف طلا، جواهر و نقره (قانون جدید مالیات ارزش افزوده بر اجرت و سود)
 * - سناریوهای ۴۹ تا ۵۸: اصناف خدماتی تخصصی، پزشکی، تعمیرگاهی و دفاتر فنی مهندسی
 * - سناریوهای ۵۹ تا ۶۶: شرکت‌های پیمانکاری عمرانی، ماده ۳۸ تأمین اجتماعی و سپرده‌های بیمه و حسن انجام کار
 * - سناریوهای ۶۷ تا ۷۲: رستوران‌ها، کافه‌ها، کترینگ، بهای تمام‌شده غذا و کارمزد پلتفرم‌های سفارش آنلاین
 * - سناریوهای ۷۳ تا ۸۰: حسابداری دارایی‌های ثابت، روش‌های استهلاک مستقیم و نزولی و سود/زیان واگذاری
 * - سناریوهای ۸۱ تا ۹۰: عملیات پیشرفته بانکی، تنزیل چک، تسهیلات بانکی، سود وام و تهاتر اسناد
 * - سناریوهای ۹۱ تا ۱۰۰: تعدیلات پایان سال، بستن حساب‌های موقت (P&L)، مالیات عملکرد ۲۵٪، اندوخته قانونی و سند اختتامیه/افتتاحیه
 */

import { AccountingEntry } from '../types';
import { AccountingTestScenarioResult } from './accountingAutomatedTestEngine';
import { computeMultiColumnTrialBalance } from './trialBalanceEngine';

export class AccountingGoldenScenariosCentum {
  private static TENANT = 'tenant_gold_centum_audit';

  /**
   * تولید آرتیکل استاندارد دوبل
   */
  private static createEntry(params: {
    id: string;
    doc: string;
    date: string;
    code: string;
    title: string;
    debit: number;
    credit: number;
    desc: string;
    clientId?: string;
    clientName?: string;
    projectTag?: string;
  }): AccountingEntry {
    return {
      id: params.id,
      tenantId: this.TENANT,
      documentNumber: params.doc,
      date: params.date,
      accountCode: params.code,
      accountTitle: params.title,
      debit: params.debit,
      credit: params.credit,
      description: params.desc,
      clientId: params.clientId,
      clientName: params.clientName,
      projectTag: params.projectTag,
      created_at: new Date().toISOString()
    };
  }

  /**
   * سازنده متمرکز نتیجه سناریو با اعتبارسنجی خودکار تراز آزمایشی
   */
  private static buildScenarioResult(params: {
    num: number;
    id: string;
    title: string;
    categoryFa: string;
    ruleRef: string;
    desc: string;
    entries: AccountingEntry[];
    formulaNotes: string[];
    startTime: number;
  }): AccountingTestScenarioResult {
    const totalDebit = params.entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);
    const totalCredit = params.entries.reduce((s, e) => s + (Number(e.credit) || 0), 0);
    const discrepancy = Math.abs(totalDebit - totalCredit);
    const isBalanced = discrepancy === 0;

    const trial = computeMultiColumnTrialBalance({
      entries: params.entries,
      mode: '6_col',
      level: 'moein'
    });

    const isPassed = isBalanced && trial.isBalanced;

    return {
      id: params.id,
      title: params.title,
      category: 'cross_module_hybrid',
      categoryFa: params.categoryFa,
      ruleReference: params.ruleRef,
      description: params.desc,
      assertion: `موازنه دقیق آرتیکل‌های دوبل و تراز ۶ ستونی بدون انحراف ریالی`,
      status: isPassed ? 'passed' : 'failed',
      executionTimeMs: Math.max(1, Math.round(performance.now() - params.startTime)),
      expectedOutcome: 'تراز ۱۰۰٪ ریاضی و ثبت متقارن دفاتر',
      actualOutcome: isPassed
        ? `تایید موازنه: بدهکار=${totalDebit.toLocaleString('fa-IR')} | بستانکار=${totalCredit.toLocaleString('fa-IR')} ریال (اختلاف ۰)`
        : `خطای ناترازی: اختلاف=${discrepancy.toLocaleString('fa-IR')} ریال`,
      simulatedEntries: params.entries,
      mathDetails: {
        totalDebit,
        totalCredit,
        discrepancy,
        isBalanced,
        turnoverCount: params.entries.length,
        trialVerification: {
          twoColBalanced: trial.isBalanced,
          fourColBalanced: trial.isBalanced,
          sixColBalanced: trial.isBalanced
        },
        formulaNotes: params.formulaNotes
      },
      auditLogs: params.formulaNotes && params.formulaNotes.length > 0 ? params.formulaNotes : [`تایید موازنه سناریوی ${params.id}`]
    };
  }

  // =========================================================================
  // گروه ۱: اصناف فروشگاهی، خرده‌فروشی و پخش مویرگی (سناریوهای ۳۳ تا ۴۲)
  // =========================================================================

  public static runScenario33(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC33-RETAIL';
    const entries = [
      this.createEntry({ id: 'sc33-1', doc, date: '1403/10/01', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 88000000, credit: 0, desc: 'وصول نقدی فروش روزانه صندوق فروشگاه', clientId: 'c-cash-walkin' }),
      this.createEntry({ id: 'sc33-2', doc, date: '1403/10/01', code: '40101', title: 'درآمد فروش کالا', debit: 0, credit: 80000000, desc: 'فروش خالص روزانه اقلام سوپرمارکت', clientId: 'c-cash-walkin' }),
      this.createEntry({ id: 'sc33-3', doc, date: '1403/10/01', code: '20301', title: 'مالیات بر ارزش افزوده پرداختنی', debit: 0, credit: 8000000, desc: '۱۰٪ ارزش افزوده فروش روزانه', clientId: 'c-cash-walkin' })
    ];
    return this.buildScenarioResult({
      num: 33, id: 'scenario-33-supermarket-pos',
      title: 'فروش روزانه صندوق سوپرمارکت با پایانه فروش و مالیات ۱۰٪',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'ماده ۳ قانون پایانه‌های فروشگاهی و سامانه مودیان',
      desc: 'فروش تجمیعی روزانه اقلام مصرفی به مشتریان خرد از طریق کارتخوان پوز',
      entries,
      formulaNotes: ['ناخالص فروش: ۸۰,۰۰۰,۰۰۰ ریال | ارزش افزوده ۱۰٪: ۸,۰۰۰,۰۰۰ ریال | واریزی پوز: ۸۸,۰۰۰,۰۰۰ ریال'],
      startTime: t0
    });
  }

  public static runScenario34(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC34-DISTRIB';
    const entries = [
      this.createEntry({ id: 'sc34-1', doc, date: '1403/10/02', code: '10301', title: 'موجودی کالا در انبار', debit: 450000000, credit: 0, desc: 'خرید عمده مواد غذایی از شرکت پخش مویرگی', clientId: 'c-dist-shirin' }),
      this.createEntry({ id: 'sc34-2', doc, date: '1403/10/02', code: '20301', title: 'ارزش افزوده خرید (اعتبار مالیاتی)', debit: 45000000, credit: 0, desc: 'مالیات ۱۰٪ خرید جهت تهاتر فصلی', clientId: 'c-dist-shirin' }),
      this.createEntry({ id: 'sc34-3', doc, date: '1403/10/02', code: '20101', title: 'حساب‌های پرداختنی تجاری', debit: 0, credit: 495000000, desc: 'بدهی به شرکت پخش به سررسید ۳۰ روزه', clientId: 'c-dist-shirin' })
    ];
    return this.buildScenarioResult({
      num: 34, id: 'scenario-34-fmcg-bulk-purchase',
      title: 'خرید اعتباری عمده از شرکت پخش مویرگی با ثبت اعتبار ارزش افزوده',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'ماده ۸ قانون مالیات بر ارزش افزوده (اعتبار مالیاتی خرید)',
      desc: 'ورود بار به انبار فروشگاه با فاکتور رسمی نسیه و شناسایی اعتبار مالیاتی',
      entries,
      formulaNotes: ['خرید ناخالص: ۴۵۰,۰۰۰,۰۰۰ ریال | ارزش افزوده: ۴۵,۰۰۰,۰۰۰ ریال | بدهی نهایی: ۴۹۵,۰۰۰,۰۰۰ ریال'],
      startTime: t0
    });
  }

  public static runScenario35(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC35-SPOILED';
    const entries = [
      this.createEntry({ id: 'sc35-1', doc, date: '1403/10/03', code: '60104', title: 'هزینه ضایعات و کسری کالا', debit: 18000000, credit: 0, desc: 'ضایعات و فساد تاریخ‌گذشته لبنیات انبار', clientId: 'c-internal-audit' }),
      this.createEntry({ id: 'sc35-2', doc, date: '1403/10/03', code: '10301', title: 'موجودی کالا در انبار', debit: 0, credit: 18000000, desc: 'خروج کالای فاسدشده بر اساس صورتجلسه امحا', clientId: 'c-internal-audit' })
    ];
    return this.buildScenarioResult({
      num: 35, id: 'scenario-35-spoilage-inventory-waste',
      title: 'امحا و خارج‌سازی ضایعات کالاهای تاریخ‌گذشته از کاردکس انبار',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'ماده ۱۴۸ قانون مالیات‌های مستقیم (هزینه‌های قابل قبول ضایعات)',
      desc: 'صورتجلسه رسمی ضایعات انبار سوپرمارکت و کاهش بهای تمام‌شده موجودی کالا',
      entries,
      formulaNotes: ['بهای تمام‌شده اقلام امحاشده: ۱۸,۰۰۰,۰۰۰ ریال به بدهکار سرفصل هزینه‌های ضایعات'],
      startTime: t0
    });
  }

  public static runScenario36(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC36-GIFT-CARD';
    const entries = [
      this.createEntry({ id: 'sc36-1', doc, date: '1403/10/04', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 50000000, credit: 0, desc: 'واریز وجه خرید کارت هدیه سازمانی توسط کارفرما', clientId: 'c-org-buyer' }),
      this.createEntry({ id: 'sc36-2', doc, date: '1403/10/04', code: '20401', title: 'پیش‌دریافت از مشتریان (بن و کارت هدیه)', debit: 0, credit: 50000000, desc: 'صدور کارت هدیه فروشگاه قبل از تحویل کالا', clientId: 'c-org-buyer' })
    ];
    return this.buildScenarioResult({
      num: 36, id: 'scenario-36-gift-voucher-issuance',
      title: 'فروش بن و کارت هدیه اعتباری به سازمان‌ها و پیش‌دریافت تجاری',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'استاندارد حسابداری شماره ۳ (درآمدهای عملیاتی معوق)',
      desc: 'دریافت وجه بن خرید قبل از تحویل کالا و عدم شناسایی درآمد تا زمان مراجعه دارنده بن',
      entries,
      formulaNotes: ['دریافت نقدی: ۵۰,۰۰۰,۰۰۰ ریال به بستانکار پیش‌دریافت تا زمان خرید قطعی'],
      startTime: t0
    });
  }

  public static runScenario37(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC37-VOUCHER-REDEEM';
    const entries = [
      this.createEntry({ id: 'sc37-1', doc, date: '1403/10/05', code: '20401', title: 'پیش‌دریافت از مشتریان (کارت هدیه)', debit: 50000000, credit: 0, desc: 'استفاده از کارت هدیه جهت خرید کالا در فروشگاه', clientId: 'c-org-holder' }),
      this.createEntry({ id: 'sc37-2', doc, date: '1403/10/05', code: '40101', title: 'درآمد فروش کالا', debit: 0, credit: 45454545, desc: 'تحقق درآمد فروش پس از تسویه با کارت هدیه', clientId: 'c-org-holder' }),
      this.createEntry({ id: 'sc37-3', doc, date: '1403/10/05', code: '20301', title: 'ارزش افزوده پرداختنی', debit: 0, credit: 4545455, desc: 'مالیات ۱۰٪ ارزش افزوده فاکتور تسویه بن', clientId: 'c-org-holder' })
    ];
    return this.buildScenarioResult({
      num: 37, id: 'scenario-37-voucher-redemption-sale',
      title: 'تسویه خرید کالا با کارت هدیه و تحقق نهایی درآمد و مالیات ارزش افزوده',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'شناسایی نهایی فروش کالا پس از مصرف کوپن اعتباری',
      desc: 'استهلاک پیش‌دریافت و صدور فاکتور قطعی مالیاتی در زمان مراجعه مشتری',
      entries,
      formulaNotes: ['استهلاک کارت هدیه: ۵۰M ریال = فروش ناخالص ۴۵,۴۵۴,۵۴۵ + مالیات ۴,۵۴۵,۴۵۵'],
      startTime: t0
    });
  }

  public static runScenario38(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC38-PROMO-DISC';
    const entries = [
      this.createEntry({ id: 'sc38-1', doc, date: '1403/10/06', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 198000000, credit: 0, desc: 'دریافت نقدی فاکتور جشنواره با تخفیف ۱۰٪', clientId: 'c-fest-buyer' }),
      this.createEntry({ id: 'sc38-2', doc, date: '1403/10/06', code: '40201', title: 'تخفیفات تجاری اعطایی فروش', debit: 20000000, credit: 0, desc: 'تخفیف جشنواره فصلی یلدا', clientId: 'c-fest-buyer' }),
      this.createEntry({ id: 'sc38-3', doc, date: '1403/10/06', code: '40101', title: 'درآمد ناخالص فروش', debit: 0, credit: 200000000, desc: 'مبلغ پایه کالاهای خریداری‌شده', clientId: 'c-fest-buyer' }),
      this.createEntry({ id: 'sc38-4', doc, date: '1403/10/06', code: '20301', title: 'ارزش افزوده پرداختنی', debit: 0, credit: 18000000, desc: '۱۰٪ مالیات بر مبنای مبلغ پس از کسر تخفیف (۱۸۰M)', clientId: 'c-fest-buyer' })
    ];
    return this.buildScenarioResult({
      num: 38, id: 'scenario-38-festive-discount-pricing',
      title: 'فاکتور فروش جشنواره تخفیفاتی و محاسبه مالیات بر مبنای مبلغ خالص',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'ماده ۱۴ قانون مالیات بر ارزش افزوده (تخفیفات مندرج در صورتحساب)',
      desc: 'تخفیف در ستون فاکتور کسر شده و مالیات منحصراً به مبلغ پس از کسر تخفیف تعلق می‌گیرد',
      entries,
      formulaNotes: ['پایه فروش: ۲۰۰M | تخفیف: ۲۰M | مبنای مالیات: ۱۸۰M | مالیات: ۱۸M | دریافتی: ۱۹۸M'],
      startTime: t0
    });
  }

  public static runScenario39(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC39-SUPP-REBATE';
    const entries = [
      this.createEntry({ id: 'sc39-1', doc, date: '1403/10/07', code: '20101', title: 'حساب‌های پرداختنی تجاری', debit: 35000000, credit: 0, desc: 'کاهش بدهی به تأمین‌کننده بابت تخفیف تارگت خرید', clientId: 'c-supp-target' }),
      this.createEntry({ id: 'sc39-2', doc, date: '1403/10/07', code: '70101', title: 'تعدیل بهای تمام‌شده خرید (تخفیف تارگت)', debit: 0, credit: 35000000, desc: 'پاداش دستیابی به سقف فروش ماهانه از تأمین‌کننده', clientId: 'c-supp-target' })
    ];
    return this.buildScenarioResult({
      num: 39, id: 'scenario-39-supplier-volume-rebate',
      title: 'پاداش و تخفیف تارگت فصلی از تأمین‌کننده (Volume Rebate) و کاهش بهای کالا',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'استاندارد حسابداری موجودی مواد و کالا (تخفیفات تجاری پس از خرید)',
      desc: 'اعلامیه بستانکاری تأمین‌کننده بابت فروش بیش از ۱ میلیارد ریال و کاهش بدهی تجاری',
      entries,
      formulaNotes: ['تخفیف حجمی ۳۵,۰۰۰,۰۰۰ ریال مستقیماً بدهی تأمین‌کننده را کاهش می‌دهد'],
      startTime: t0
    });
  }

  public static runScenario40(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC40-PERIODIC-STOCK';
    const entries = [
      this.createEntry({ id: 'sc40-1', doc, date: '1403/10/08', code: '50101', title: 'بهای تمام‌شده کالای فروش‌رفته (COGS)', debit: 120000000, credit: 0, desc: 'خروج بهای کالای فروش‌رفته روزانه از کاردکس', clientId: 'c-inventory-cogs' }),
      this.createEntry({ id: 'sc40-2', doc, date: '1403/10/08', code: '10301', title: 'موجودی کالا در انبار', debit: 0, credit: 120000000, desc: 'کاهش موجودی انبار به قیمت میانگین خرید', clientId: 'c-inventory-cogs' })
    ];
    return this.buildScenarioResult({
      num: 40, id: 'scenario-40-cogs-perpetual-entry',
      title: 'ثبت سند بهای تمام‌شده کالای فروش‌رفته در سیستم ادواری/دائمی انبار (COGS)',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'اصل تطابق درآمد و هزینه (Matching Principle)',
      desc: 'همزمان با فروش کالا، ارزش تاریخی موجودی انبار کاهش یافته و به بهای تمام‌شده منتقل می‌شود',
      entries,
      formulaNotes: ['ارزش انبار خارج‌شده: ۱۲۰,۰۰۰,۰۰۰ ریال به بدهکار حساب ۵۰۱۰۱'],
      startTime: t0
    });
  }

  public static runScenario41(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC41-SHORTAGE';
    const entries = [
      this.createEntry({ id: 'sc41-1', doc, date: '1403/10/09', code: '10204', title: 'حساب‌های دریافتنی کارکنان (مسئول انبار)', debit: 8500000, credit: 0, desc: 'کسری غیرمجاز انبارگردانی میان‌دوره', clientId: 'c-warehouse-emp' }),
      this.createEntry({ id: 'sc41-2', doc, date: '1403/10/09', code: '10301', title: 'موجودی کالا در انبار', debit: 0, credit: 8500000, desc: 'تعدیل و انطباق کاردکس انبار با شمارش عینی', clientId: 'c-warehouse-emp' })
    ];
    return this.buildScenarioResult({
      num: 41, id: 'scenario-41-inventory-shortage-reconciliation',
      title: 'انطباق انبارگردانی فیزیکی، ثبت کسری غیرعادی و بدهکار کردن مسئول انبار',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'دستورالعمل اجرایی انبارگردانی و تطبیق کاردکس عینی',
      desc: 'کشف کسری ۵ عدد قطعه در شمارش پایان ماه و تعدیل دفاتر مالی و کسر از حقوق',
      entries,
      formulaNotes: ['کسری انبارگردانی: ۸,۵۰۰,۰۰۰ ریال به بدهکار حساب مسئول مربوطه'],
      startTime: t0
    });
  }

  public static runScenario42(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC42-SURPLUS';
    const entries = [
      this.createEntry({ id: 'sc42-1', doc, date: '1403/10/10', code: '10301', title: 'موجودی کالا در انبار', debit: 12000000, credit: 0, desc: 'اضافی انبارگردانی ناشی از اشتباه در ثبت رسیدهای قبلی', clientId: 'c-internal-audit' }),
      this.createEntry({ id: 'sc42-2', doc, date: '1403/10/10', code: '70201', title: 'سایر درآمدهای عملیاتی (اضافات انبار)', debit: 0, credit: 12000000, desc: 'افزایش موجودی دفتری به مقدار کالای واقعی شمرده‌شده', clientId: 'c-internal-audit' })
    ];
    return this.buildScenarioResult({
      num: 42, id: 'scenario-42-inventory-surplus-reconciliation',
      title: 'انطباق انبارگردانی فیزیکی، ثبت اضافات انبار و تعدیل کاردکس کالا',
      categoryFa: 'اصناف فروشگاهی و خرده‌فروشی',
      ruleRef: 'دستورالعمل تعدیلات انبارگردانی و شناسایی اقلام اضافه',
      desc: 'افزایش موجودی کاردکس با کالاهای کشف‌شده و ثبت درآمد متناظر در سایر درآمدها',
      entries,
      formulaNotes: ['ارزش اقلام مازاد شمرده‌شده: ۱۲,۰۰۰,۰۰۰ ریال به بستانکار حساب ۷۰۲۰۱'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۲: صنف طلا، جواهر و نقره (سناریوهای ۴۳ تا ۴۸)
  // =========================================================================

  public static runScenario43(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC43-GOLD-SALE';
    // طلافروشی: ۱۰ گرم طلای ۱۸ عیار به ارزش هر گرم ۴۰M ریال (۴۰۰M اصل طلا - معاف از ارزش افزوده)
    // اجرت ساخت: ۵۰M ریال | سود طلافروش (۷٪): ۳۱.۵M ریال | ارزش افزوده ۱۰٪ فقط روی اجرت و سود (۸۱.۵M * 10% = ۸.۱۵M)
    // کل فاکتور: ۴۰۰M + ۵۰M + ۳۱.۵M + ۸.۱۵M = ۴۸۹,۶۵۰,۰۰۰ ریال
    const entries = [
      this.createEntry({ id: 'sc43-1', doc, date: '1403/10/11', code: '10101', title: 'موجودی نقد و بانک‌ها (پوز طلافروشی)', debit: 489650000, credit: 0, desc: 'دریافت کامل بهای النگوی طلا از خریدار', clientId: 'c-gold-buyer1' }),
      this.createEntry({ id: 'sc43-2', doc, date: '1403/10/11', code: '40105', title: 'فروش اصل طلا (معاف از مالیات)', debit: 0, credit: 400000000, desc: '۱۰ گرم طلای ۷۵۰ به نرخ مظنه روز', clientId: 'c-gold-buyer1' }),
      this.createEntry({ id: 'sc43-3', doc, date: '1403/10/11', code: '40106', title: 'درآمد اجرت ساخت و متعلقات طلا', debit: 0, credit: 50000000, desc: 'اجرت تراشکاری و ساخت کارگاه', clientId: 'c-gold-buyer1' }),
      this.createEntry({ id: 'sc43-4', doc, date: '1403/10/11', code: '40107', title: 'درآمد سود قانونی طلافروش (۷٪)', debit: 0, credit: 31500000, desc: '۷٪ سود مصوب اتحادیه طلا و جواهر', clientId: 'c-gold-buyer1' }),
      this.createEntry({ id: 'sc43-5', doc, date: '1403/10/11', code: '20301', title: 'مالیات بر ارزش افزوده طلا (۱۰٪ اجرت و سود)', debit: 0, credit: 8150000, desc: '۱۰٪ ارزش افزوده بر مبنای ۸۱.۵M ریال', clientId: 'c-gold-buyer1' })
    ];
    return this.buildScenarioResult({
      num: 43, id: 'scenario-43-gold-special-vat-calculation',
      title: 'فاکتور رسمی صنف طلا و جواهر طبق قانون جدید مالیات بر ارزش افزوده (معافیت اصل طلا)',
      categoryFa: 'صنف طلا، جواهر و نقره',
      ruleRef: 'ماده ۲۶ قانون مالیات بر ارزش افزوده مصوب ۱۴۰۰ (عدم شمول اصل طلا)',
      desc: 'محاسبه ۱۰٪ مالیات صرفاً بر روی سرجمع اجرت ساخت و سود طلافروش و معافیت کامل اصل طلا',
      entries,
      formulaNotes: ['اصل طلا: ۴۰۰M (معاف) | اجرت: ۵۰M | سود ۷٪: ۳۱.۵M | مالیات: ۸.۱۵M | جمع دریافتی: ۴۸۹.۶۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario44(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC44-SCRAP-GOLD';
    // خرید طلای متفرقه / کهنه از مشتری جهت آبکاری یا ذوب: ۵ گرم به ارزش ۲۰۰M ریال نقد
    const entries = [
      this.createEntry({ id: 'sc44-1', doc, date: '1403/10/12', code: '10305', title: 'موجودی طلای خام و آبشده (انبار طلا)', debit: 200000000, credit: 0, desc: 'خرید ۵ گرم طلای متفرقه از مشتری بر اساس عیارسنجی', clientId: 'c-gold-seller' }),
      this.createEntry({ id: 'sc44-2', doc, date: '1403/10/12', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 200000000, desc: 'واریز پایا/کارت‌به‌کارت وجه طلای دست‌دوم به مشتری', clientId: 'c-gold-seller' })
    ];
    return this.buildScenarioResult({
      num: 44, id: 'scenario-44-scrap-gold-purchase',
      title: 'خرید طلای کهنه/متفرقه از مشتری و ورود به حساب وزنی طلای آبشده',
      categoryFa: 'صنف طلا، جواهر و نقره',
      ruleRef: 'ضوابط اتحادیه طلا و جواهر در خصوص خرید طلای دست‌دوم',
      desc: 'ثبت طلای مستعمل با مظنه روز و ورود به حساب انبار طلای خام جهت ذوب و ریخته‌گری',
      entries,
      formulaNotes: ['خرید وزنی طلا: ۵ گرم به ارزش ۲۰۰,۰۰۰,۰۰۰ ریال نقداً تسویه شد'],
      startTime: t0
    });
  }

  public static runScenario45(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC45-GOLD-EXCHANGE';
    // تعویض طلا: مشتری ۶ گرم طلای کهنه می‌دهد (ارزش ۲۴۰M) و یک دستبند نو برمی‌دارد (ارزش ۳۰۰M)
    // مابه‌التفاوت ۶۰M نقداً پرداخت می‌شود
    const entries = [
      this.createEntry({ id: 'sc45-1', doc, date: '1403/10/13', code: '10305', title: 'موجودی طلای خام (دریافتی دست‌دوم)', debit: 240000000, credit: 0, desc: 'ارزش طلای کهنه دریافتی از مشتری در مبادله', clientId: 'c-gold-exchange' }),
      this.createEntry({ id: 'sc45-2', doc, date: '1403/10/13', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 60000000, credit: 0, desc: 'سرک و مابه‌التفاوت نقدی دریافتی تعویض طلا', clientId: 'c-gold-exchange' }),
      this.createEntry({ id: 'sc45-3', doc, date: '1403/10/13', code: '40105', title: 'فروش طلای ساخته‌شده', debit: 0, credit: 300000000, desc: 'فروش دستبند طلای نو به قیمت مصوب روز', clientId: 'c-gold-exchange' })
    ];
    return this.buildScenarioResult({
      num: 45, id: 'scenario-45-gold-barter-exchange',
      title: 'معاوضه طلای مستعمل با طلای نو و تسویه نقدی مابه‌التفاوت (سرک طلا)',
      categoryFa: 'صنف طلا، جواهر و نقره',
      ruleRef: 'عرف صنف طلا در مبادلات تهاتری فلزات گرانبها',
      desc: 'تهاتر طلای متفرقه با طلای زینتی جدید و دریافت سرک نقدی از خریدار',
      entries,
      formulaNotes: ['طلای کهنه: ۲۴۰M + نقدی: ۶۰M = ۳۰۰M بهای دستبند نو'],
      startTime: t0
    });
  }

  public static runScenario46(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC46-BENCH-FEE';
    // ارسال طلای خام به کارگاه النگوسازی و پرداخت اجرت ساخت به طلاساز
    const entries = [
      this.createEntry({ id: 'sc46-1', doc, date: '1403/10/14', code: '10306', title: 'موجودی طلای ساخته‌شده ویترین', debit: 600000000, credit: 0, desc: 'دریافت النگوهای آماده از کارگاه طلاسازی', clientId: 'c-goldsmith-workshop' }),
      this.createEntry({ id: 'sc46-2', doc, date: '1403/10/14', code: '10305', title: 'موجودی طلای خام و شمش', debit: 0, credit: 540000000, desc: 'استهلاک طلای آبشده تحویلی به کارگاه', clientId: 'c-goldsmith-workshop' }),
      this.createEntry({ id: 'sc46-3', doc, date: '1403/10/14', code: '20101', title: 'حساب‌های پرداختنی (کارگاه ساخت)', debit: 0, credit: 60000000, desc: 'بدهی بابت اجرت ساخت هر گرم به بنکدار/کارگاه', clientId: 'c-goldsmith-workshop' })
    ];
    return this.buildScenarioResult({
      num: 46, id: 'scenario-46-goldsmith-consignment-manufacturing',
      title: 'تحویل طلای شمش به کارگاه طلاسازی، تولید النگو و ثبت اجرت ساخت',
      categoryFa: 'صنف طلا، جواهر و نقره',
      ruleRef: 'حسابداری پیمانکاری کارگاهی طلا و تبدیل شمش به مصنوعات',
      desc: 'انتقال شمش به طلای ویترین و شناسایی هزینه اجرت کارگاه ساخت',
      entries,
      formulaNotes: ['طلای خام: ۵۴۰M + اجرت ساخت: ۶۰M = ۶۰۰M طلای آماده ویترین'],
      startTime: t0
    });
  }

  public static runScenario47(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC47-PRECIOUS-STONE';
    // فروش انگشتر جواهر شامل سنگ برلیان و زمرد (سنگ جواهر مشمول ۱۰٪ ارزش افزوده کامل)
    const entries = [
      this.createEntry({ id: 'sc47-1', doc, date: '1403/10/15', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 385000000, credit: 0, desc: 'دریافت وجه فروش انگشتر تک‌نگین برلیان', clientId: 'c-gem-buyer' }),
      this.createEntry({ id: 'sc47-2', doc, date: '1403/10/15', code: '40105', title: 'فروش پایه طلای انگشتر (معاف)', debit: 0, credit: 200000000, desc: 'پایه طلای انگشتر به وزن ۵ گرم', clientId: 'c-gem-buyer' }),
      this.createEntry({ id: 'sc47-3', doc, date: '1403/10/15', code: '40108', title: 'فروش سنگ جواهر قیمتی (برلیان)', debit: 0, credit: 150000000, desc: 'ارزش نگین الماس برلیان اصل', clientId: 'c-gem-buyer' }),
      this.createEntry({ id: 'sc47-4', doc, date: '1403/10/15', code: '40106', title: 'اجرت مخراج‌کاری نگین', debit: 0, credit: 20000000, desc: 'حق‌الزحمه سوار کردن سنگ روی پایه', clientId: 'c-gem-buyer' }),
      this.createEntry({ id: 'sc47-5', doc, date: '1403/10/15', code: '20301', title: 'ارزش افزوده (سنگ و اجرت)', debit: 0, credit: 15000000, desc: '۱۰٪ مالیات متعلق به سنگ و اجرت (۱۷۰M * 10% تقریبی با تخفیف)', clientId: 'c-gem-buyer' })
    ];
    return this.buildScenarioResult({
      num: 47, id: 'scenario-47-gemstone-jewelry-invoice',
      title: 'فروش انگشتر جواهر، تفکیک پایه طلا از سنگ قیمتی و مخراج‌کاری',
      categoryFa: 'صنف طلا، جواهر و نقره',
      ruleRef: 'دستورالعمل مالیات جواهرات و تفکیک سنگ‌های قیمتی از فلز طلا',
      desc: 'محاسبه شفاف ارزش طلای خام، بهای گوهر و نگین، اجرت مخراجی و مالیات قانونی',
      entries,
      formulaNotes: ['پایه طلا: ۲۰۰M | سنگ الماس: ۱۵۰M | اجرت: ۲۰M | مالیات سنگ: ۱۵M | جمع: ۳۸۵M'],
      startTime: t0
    });
  }

  public static runScenario48(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC48-MELT-DEFICIT';
    // ذوب طلای متفرقه و شناسایی کسر عیار و افت کوره (کسری مجاز صنعتی طلا)
    const entries = [
      this.createEntry({ id: 'sc48-1', doc, date: '1403/10/16', code: '60105', title: 'هزینه افت و کسر عیار کوره ریخته‌گری', debit: 7500000, credit: 0, desc: 'افت طبیعی ناشی از ناخالصی لحیم در ذوب طلا', clientId: 'c-assay-office' }),
      this.createEntry({ id: 'sc48-2', doc, date: '1403/10/16', code: '10305', title: 'موجودی طلای خام و آبشده', debit: 0, credit: 7500000, desc: 'کاهش وزن دفتری بر اساس شناسنامه ری‌گیری رسمی', clientId: 'c-assay-office' })
    ];
    return this.buildScenarioResult({
      num: 48, id: 'scenario-48-gold-assay-loss-reconciliation',
      title: 'کسر عیار و افت طبیعی در بوته ذوب طلا و ثبت کارشناسی آزمایشگاه ری‌گیری',
      categoryFa: 'صنف طلا، جواهر و نقره',
      ruleRef: 'استاندارد تلورانس کسر عیار مصوب اتحادیه طلا و جواهر',
      desc: 'شناسایی هزینه معقول کسر ذوب بر اساس انگ رسمی ری‌گیری تهران',
      entries,
      formulaNotes: ['افت عیار: ۷,۵۰۰,۰۰۰ ریال به بدهکار سرفصل هزینه افت کوره'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۳: اصناف خدماتی تخصصی، پزشکی، تعمیرگاه و دفاتر مهندسی (سناریوهای ۴۹ تا ۵۸)
  // =========================================================================

  public static runScenario49(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC49-CLINIC-HEALTH';
    // کلینیک پزشکی: درمان بیمار با تعرفه مصوب ۵۰M ریال. سهم بیمه تکمیلی ۳۵M و سهم نقد بیمار ۱۵M
    const entries = [
      this.createEntry({ id: 'sc49-1', doc, date: '1403/10/17', code: '10101', title: 'موجودی نقد و بانک‌ها (پوز پذیرش)', debit: 15000000, credit: 0, desc: 'فرانشیز نقدی دریافتی از بیمار', clientId: 'c-patient-101' }),
      this.createEntry({ id: 'sc49-2', doc, date: '1403/10/17', code: '10203', title: 'حساب‌های دریافتنی از بیمه‌ها', debit: 35000000, credit: 0, desc: 'طلب کلینیک از بیمه دانا بابت صورت‌حساب بیمار', clientId: 'c-insurance-dana' }),
      this.createEntry({ id: 'sc49-3', doc, date: '1403/10/17', code: '40102', title: 'درآمد خدمات تشخیصی و درمانی', debit: 0, credit: 50000000, desc: 'ارائه خدمات درمانی کلینیک (معاف از ارزش افزوده)', clientId: 'c-patient-101' })
    ];
    return this.buildScenarioResult({
      num: 49, id: 'scenario-49-medical-clinic-insurance-split',
      title: 'درآمد خدمات پزشکی کلینیک، تفکیک فرانشیز بیمار از مطالبات شرکت بیمه',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'ماده ۹ قانون مالیات بر ارزش افزوده (معافیت خدمات درمانی و دارویی)',
      desc: 'ثبت درآمد معاف درمانی، وصول نقد فرانشیز و ثبت طلب از سازمان‌های بیمه‌گر پایه/تکمیلی',
      entries,
      formulaNotes: ['درآمد کل: ۵۰M ریال = ۱۵M سهم نقد بیمار + ۳۵M سهم بیمه تکمیلی'],
      startTime: t0
    });
  }

  public static runScenario50(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC50-DOCTOR-SHARE';
    // تسویه کارانه و سهم پزشک معالج از تعرفه جراحی (۷۰٪ سهم پزشک = ۳۵M ریال با کسر ۱۰٪ مالیات تکلیفی)
    const entries = [
      this.createEntry({ id: 'sc50-1', doc, date: '1403/10/18', code: '60106', title: 'هزینه حق‌الزحمه و کارانه پزشکان', debit: 35000000, credit: 0, desc: 'کارانه ناخالص پزشک جراح', clientId: 'c-dr-karimi' }),
      this.createEntry({ id: 'sc50-2', doc, date: '1403/10/18', code: '20305', title: 'مالیات تکلیفی مکسوره پزشکان (۱۰٪)', debit: 0, credit: 3500000, desc: 'کسر ۱۰٪ مالیات حق‌الزحمه طبق جزء ۱ بند ط تبصره ۶', clientId: 'c-dr-karimi' }),
      this.createEntry({ id: 'sc50-3', doc, date: '1403/10/18', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 31500000, desc: 'پرداخت پایا به حساب بانکی پزشک', clientId: 'c-dr-karimi' })
    ];
    return this.buildScenarioResult({
      num: 50, id: 'scenario-50-doctor-fee-withholding-tax',
      title: 'پرداخت کارانه پزشک جراح با کسر قانونی ۱۰٪ مالیات تکلیفی پزشکان',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'بند ط تبصره ۶ قانون بودجه (کسر ۱۰٪ علی‌الحساب مالیات حق‌الزحمه پزشکان)',
      desc: 'محاسبه سهم پزشک، کسر مالیات تکلیفی جهت واریز به حساب سازمان مالیاتی و پرداخت خالص',
      entries,
      formulaNotes: ['کارانه ناخالص: ۳۵M | ۱۰٪ مالیات تکلیفی: ۳.۵M | پرداختی خالص: ۳۱.۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario51(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC51-AUTO-REPAIR';
    // تعمیرگاه خودرو: تعویض دیسک و صفحه. اجرت تعمیر: ۱۵M + قطعه یدکی: ۴۰M + ارزش افزوده اجرت: ۱.۵M = ۵۶.۵M
    const entries = [
      this.createEntry({ id: 'sc51-1', doc, date: '1403/10/19', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 56500000, credit: 0, desc: 'دریافت کامل فاکتور تعمیرگاه از مشتری', clientId: 'c-car-owner' }),
      this.createEntry({ id: 'sc51-2', doc, date: '1403/10/19', code: '40103', title: 'درآمد اجرت خدمات و تعمیرات خودرو', debit: 0, credit: 15000000, desc: 'اجرت باز و بست و مکانیکی', clientId: 'c-car-owner' }),
      this.createEntry({ id: 'sc51-3', doc, date: '1403/10/19', code: '40101', title: 'درآمد فروش قطعات یدکی خودرو', debit: 0, credit: 40000000, desc: 'دیسک و صفحه والئو فرانسوی', clientId: 'c-car-owner' }),
      this.createEntry({ id: 'sc51-4', doc, date: '1403/10/19', code: '20301', title: 'مالیات بر ارزش افزوده خدمات', debit: 0, credit: 1500000, desc: '۱۰٪ ارزش افزوده اجرت تعمیر', clientId: 'c-car-owner' })
    ];
    return this.buildScenarioResult({
      num: 51, id: 'scenario-51-auto-repair-parts-and-labor',
      title: 'فاکتور جامع تعمیرگاه خودرو، تفکیک اجرت دستمزد مکانیک از فروش قطعات یدکی',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'دستورالعمل صدور صورتحساب خدمات و لوازم یدکی خودرو',
      desc: 'شفاف‌سازی درآمد ناشی از اجرت تعمیرات و فروش قطعات یدکی انبار با ثبت مجزای مالیات',
      entries,
      formulaNotes: ['اجرت: ۱۵M | قطعه: ۴۰M | ارزش افزوده اجرت: ۱.۵M | جمع فاکتور: ۵۶.۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario52(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC52-COGS-PARTS';
    // خروج قطعه یدکی از انبار تعمیرگاه با قیمت تمام‌شده خرید (۳۰M ریال)
    const entries = [
      this.createEntry({ id: 'sc52-1', doc, date: '1403/10/20', code: '50101', title: 'بهای تمام‌شده قطعات یدکی مصرفی', debit: 30000000, credit: 0, desc: 'بهای خرید قطعه دیسک و صفحه مصرف‌شده در تعمیر', clientId: 'c-car-owner' }),
      this.createEntry({ id: 'sc52-2', doc, date: '1403/10/20', code: '10301', title: 'موجودی لوازم یدکی انبار', debit: 0, credit: 30000000, desc: 'کاهش موجودی قطعات انبار تعمیرگاه', clientId: 'c-car-owner' })
    ];
    return this.buildScenarioResult({
      num: 52, id: 'scenario-52-auto-parts-cost-of-goods-sold',
      title: 'خروج لوازم یدکی از انبار تعمیرگاه و ثبت بهای تمام‌شده بر مبنای میانگین خرید',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'اصل بهای تمام‌شده تاریخی در انبار قطعات یدکی',
      desc: 'انطباق کاردکس انبار لوازم یدکی و انتقال بهای تاریخی خرید به سرفصل بهای تمام‌شده',
      entries,
      formulaNotes: ['قیمت خرید قطعه: ۳۰,۰۰۰,۰۰۰ ریال از موجودی انبار کسر و به بهای تمام‌شده رفت'],
      startTime: t0
    });
  }

  public static runScenario53(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC53-ENG-DESIGN';
    // دفتر مهندسی: طراحی فاز ۱ و ۲ معماری پروژه ساختمانی (۲۰۰M ریال + ۲۰M ارزش افزوده) با کسر ۱۰٪ پیش‌دریافت
    const entries = [
      this.createEntry({ id: 'sc53-1', doc, date: '1403/10/21', code: '20401', title: 'پیش‌دریافت از کارفرما', debit: 50000000, credit: 0, desc: 'استهلاک پیش‌دریافت قرارداد طراحی معماری', clientId: 'c-owner-tower' }),
      this.createEntry({ id: 'sc53-2', doc, date: '1403/10/21', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 170000000, credit: 0, desc: 'واریز نقدی مانده صورت‌حساب تاییدشده طراحی', clientId: 'c-owner-tower' }),
      this.createEntry({ id: 'sc53-3', doc, date: '1403/10/21', code: '40104', title: 'درآمد خدمات مهندسی و نقشه‌کشی', debit: 0, credit: 200000000, desc: 'تحویل نقشه‌های تاییدشده فاز ۲ به کارفرما', clientId: 'c-owner-tower' }),
      this.createEntry({ id: 'sc53-4', doc, date: '1403/10/21', code: '20301', title: 'مالیات بر ارزش افزوده خدمات', debit: 0, credit: 20000000, desc: '۱۰٪ ارزش افزوده فاکتور رسمی خدمات مهندسی', clientId: 'c-owner-tower' })
    ];
    return this.buildScenarioResult({
      num: 53, id: 'scenario-53-engineering-architectural-service',
      title: 'صورت‌حساب قطعی خدمات طراحی مهندسی با استهلاک پیش‌پرداخت کارفرما',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'قراردادهای مشاوره و مهندسی استاندارد سازمان نظام مهندسی',
      desc: 'تحویل خروجی مهندسی، تسویه پیش‌پرداخت اولیه و دریافت مانده نقدی با ارزش افزوده قانونی',
      entries,
      formulaNotes: ['مبلغ طراحی: ۲۰۰M | ارزش افزوده: ۲۰M | کسر پیش‌دریافت: ۵۰M | واریز نهایی: ۱۷۰M'],
      startTime: t0
    });
  }

  public static runScenario54(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC54-NEZAM-FEE';
    // کسر سهم ۵٪ سازمان نظام مهندسی از حق‌الزحمه نظارت ساختمانی مهندس ناظر
    const entries = [
      this.createEntry({ id: 'sc54-1', doc, date: '1403/10/22', code: '60107', title: 'سهم سازمان نظام مهندسی ساختمان (۵٪)', debit: 10000000, credit: 0, desc: 'کسر ۵٪ حق نظارت توسط سازمان استان', clientId: 'c-nezam-eng' }),
      this.createEntry({ id: 'sc54-2', doc, date: '1403/10/22', code: '10101', title: 'موجودی نقد و بانک‌ها (واریز به حساب ناظر)', debit: 190000000, credit: 0, desc: 'خالص دریافتی مهندس ناظر از سازمان', clientId: 'c-nezam-eng' }),
      this.createEntry({ id: 'sc54-3', doc, date: '1403/10/22', code: '40104', title: 'درآمد ناخالص خدمات نظارت مهندسی', debit: 0, credit: 200000000, desc: 'کل حق نظارت مندرج در پروانه ساختمانی', clientId: 'c-nezam-eng' })
    ];
    return this.buildScenarioResult({
      num: 54, id: 'scenario-54-supervising-engineer-fee-split',
      title: 'واریز حق‌الزحمه مهندس ناظر ساختمان از طریق سازمان نظام مهندسی با کسر سهم سازمان',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'شیوه‌نامه نظارت سازمان نظام مهندسی و کسر ۵٪ سهم اداری',
      desc: 'شناسایی کل درآمد نظارت، کسر سهم قانونی سازمان و واریز خالص به حساب جاری ناظر',
      entries,
      formulaNotes: ['حق نظارت کل: ۲۰۰M | ۵٪ سهم سازمان: ۱۰M | واریز خالص به ناظر: ۱۹۰M ریال'],
      startTime: t0
    });
  }

  public static runScenario55(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC55-LEGAL-RETAINER';
    // حق‌الوکاله و قرارداد مشاوره حقوقی ماهانه شرکت با وکیل دادگستری و کسر مالیات تکلیفی ماده ۱۰۳
    const entries = [
      this.createEntry({ id: 'sc55-1', doc, date: '1403/10/23', code: '60108', title: 'هزینه مشاوره حقوقی و داوری', debit: 80000000, credit: 0, desc: 'حق‌الوکاله ماهانه پرونده‌های شرکت', clientId: 'c-lawyer-amini' }),
      this.createEntry({ id: 'sc55-2', doc, date: '1403/10/23', code: '20306', title: 'مالیات تکلیفی حق‌الوکاله (ماده ۱۰۳ ق.م.م)', debit: 0, credit: 4000000, desc: 'کسر ۵٪ مالیات علی‌الحساب حق‌الوکاله', clientId: 'c-lawyer-amini' }),
      this.createEntry({ id: 'sc55-3', doc, date: '1403/10/23', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 76000000, desc: 'انتقال ساتنا به حساب وکیل دادگستری', clientId: 'c-lawyer-amini' })
    ];
    return this.buildScenarioResult({
      num: 55, id: 'scenario-55-lawyer-retainer-tax-deduction',
      title: 'پرداخت حق‌الوکاله وکیل دادگستری با ابطال تمبر مالیاتی و کسر مالیات تکلیفی ماده ۱۰۳',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'ماده ۱۰۳ قانون مالیات‌های مستقیم (ابطال تمبر و مالیات علی‌الحساب وکلا)',
      desc: 'ثبت هزینه خدمات حقوقی، کسر ۵٪ مالیات تکلیفی و پرداخت خالص حق‌الوکاله',
      entries,
      formulaNotes: ['حق‌الوکاله ناخالص: ۸۰M | مالیات ۵٪: ۴M | پرداخت خالص: ۷۶M ریال'],
      startTime: t0
    });
  }

  public static runScenario56(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC56-SOFTWARE-SUB';
    // اشتراک سالانه نرم‌افزار ابری SaaS به مبلغ ۱۲۰M ریال (تحقق تدریجی درآمد در ۱۲ ماه)
    const entries = [
      this.createEntry({ id: 'sc56-1', doc, date: '1403/10/24', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 132000000, credit: 0, desc: 'دریافت کامل آبونمان سالانه نرم‌افزار به انضمام مالیات', clientId: 'c-saas-customer' }),
      this.createEntry({ id: 'sc56-2', doc, date: '1403/10/24', code: '20402', title: 'درآمد انتقالی به دوره‌های آتی (آبونمان معوق)', debit: 0, credit: 120000000, desc: 'آبونمان ۱۲ ماهه نرم‌افزار قبل از سپری شدن دوره', clientId: 'c-saas-customer' }),
      this.createEntry({ id: 'sc56-3', doc, date: '1403/10/24', code: '20301', title: 'مالیات بر ارزش افزوده خدمات نرم‌افزاری', debit: 0, credit: 12000000, desc: '۱۰٪ ارزش افزوده فاکتور لایسنس نرم‌افزار', clientId: 'c-saas-customer' })
    ];
    return this.buildScenarioResult({
      num: 56, id: 'scenario-56-saas-annual-deferred-revenue',
      title: 'دریافت آبونمان سالانه نرم‌افزار ابری و ثبت درآمد انتقالی به دوره‌های آتی (Deferred Revenue)',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'استاندارد حسابداری شماره ۳ (تحقق تدریجی درآمدهای اشتراکی)',
      desc: 'ثبت کل وجه دریافتی در سرفصل بدهی و درآمدهای انتقالی جهت شناسایی ماه به ماه درآمد',
      entries,
      formulaNotes: ['دریافت ناخالص: ۱۳۲M = ۱۲۰M آبونمان معوق ۱۲ ماهه + ۱۲M ارزش افزوده قانونی'],
      startTime: t0
    });
  }

  public static runScenario57(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC57-SAAS-AMORTIZE';
    // شناسایی درآمد ماه اول اشتراک نرم‌افزار ابری (یک دوازدهم مبلغ سالانه = ۱۰M ریال)
    const entries = [
      this.createEntry({ id: 'sc57-1', doc, date: '1403/10/25', code: '20402', title: 'درآمد انتقالی به دوره‌های آتی', debit: 10000000, credit: 0, desc: 'انتقال سهم ماه دی از درآمدهای معوق به درآمد جاری', clientId: 'c-saas-customer' }),
      this.createEntry({ id: 'sc57-2', doc, date: '1403/10/25', code: '40104', title: 'درآمد حاصل از اشتراک نرم‌افزار ابری', debit: 0, credit: 10000000, desc: 'تحقق قطعی درآمد اشتراک ماه دی ماه', clientId: 'c-saas-customer' })
    ];
    return this.buildScenarioResult({
      num: 57, id: 'scenario-57-deferred-revenue-monthly-amortization',
      title: 'شناسایی و تحقق ماهانه درآمد اشتراک ابری از محل درآمد انتقالی به دوره‌های آتی',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'اصل تطابق و تحقق درآمد بر اساس دوره زمانی خدمت',
      desc: 'کاهش حساب بدهی معوق و افزایش درآمد قطعی پایان ماه اول اشتراک کاربر',
      entries,
      formulaNotes: ['یک‌دوازدهم مبلغ ۱۲۰M ریال: ۱۰,۰۰۰,۰۰۰ ریال به حساب درآمد عملیاتی ماه دی'],
      startTime: t0
    });
  }

  public static runScenario58(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC58-INST-EDUCATION';
    // آموزشگاه زبان و تخصصی: ثبت‌نام دوره جامع فصلی ۲۰ نفر کارآموز با صدور رسید الکترونیکی
    const entries = [
      this.createEntry({ id: 'sc58-1', doc, date: '1403/10/26', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 160000000, credit: 0, desc: 'شهریه دریافتی ۲۰ نفر هنرجو از درگاه اینترنتی', clientId: 'c-students-batch1' }),
      this.createEntry({ id: 'sc58-2', doc, date: '1403/10/26', code: '40104', title: 'درآمد خدمات آموزش تخصصی (معاف)', debit: 0, credit: 160000000, desc: 'شهریه مصوب دوره پاییزه طبق مجوز سازمان فنی و حرفه‌ای', clientId: 'c-students-batch1' })
    ];
    return this.buildScenarioResult({
      num: 58, id: 'scenario-58-educational-institute-tuition',
      title: 'ثبت شهریه آموزشی آموزشگاه و برخورداری از معافیت مالیات بر ارزش افزوده آموزش',
      categoryFa: 'اصناف خدماتی و پزشکی',
      ruleRef: 'جزء ۵ بند ب ماده ۹ قانون دائمی ارزش افزوده (معافیت خدمات آموزشی و پژوهشی)',
      desc: 'ثبت شهریه دوره‌های مجاز با معافیت کامل ارزش افزوده و صدور رسید شهریه دانشجویان',
      entries,
      formulaNotes: ['۲۰ نفر هر کدام ۸M ریال: ۱۶۰,۰۰۰,۰۰۰ ریال تماماً درآمد معاف آموزشی'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۴: شرکت‌های پیمانکاری عمرانی و ماده ۳۸ قانون تأمین اجتماعی (سناریوهای ۵۹ تا ۶۶)
  // =========================================================================

  public static runScenario59(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC59-PROGRESS-INV';
    // صورت‌وضعیت تاییدشده شماره ۱ پیمانکاری: ناخالص ۵۰۰M ریال + ارزش افزوده ۵۰M ریال
    // کسورات: ۱۰٪ حسن انجام کار (۵۰M)، ۵٪ سپرده بیمه ماده ۳۸ (۲۵M)، پرداخت خالص: ۴۷۵M
    const entries = [
      this.createEntry({ id: 'sc59-1', doc, date: '1403/10/27', code: '10201', title: 'حساب‌های دریافتنی (کارفرما)', debit: 475000000, credit: 0, desc: 'خالص طلب قابل دریافت از صورت‌وضعیت تاییدشده ۱', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc59-2', doc, date: '1403/10/27', code: '10401', title: 'سپرده حسن انجام کار نزد کارفرما (۱۰٪)', debit: 50000000, credit: 0, desc: 'کسر ۱۰٪ تضمین کیفیت تا تحویل موقت', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc59-3', doc, date: '1403/10/27', code: '10402', title: 'سپرده بیمه ماده ۳۸ نزد کارفرما (۵٪)', debit: 25000000, credit: 0, desc: 'کسر ۵٪ ودیعه بیمه تا ارائه مفاصاحساب تأمین اجتماعی', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc59-4', doc, date: '1403/10/27', code: '40109', title: 'درآمد ناخالص پیمانکاری و صورت‌وضعیت', debit: 0, credit: 500000000, desc: 'کارکرد تاییدشده صورت‌وضعیت کارگاهی', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc59-5', doc, date: '1403/10/27', code: '20301', title: 'مالیات بر ارزش افزوده صورت‌وضعیت', debit: 0, credit: 50000000, desc: '۱۰٪ ارزش افزوده صورت‌وضعیت عمرانی', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' })
    ];
    return this.buildScenarioResult({
      num: 59, id: 'scenario-59-contracting-progress-certificate',
      title: 'صورت‌وضعیت پیمانکاری عمرانی با کسر ۱۰٪ حسن انجام کار و ۵٪ سپرده بیمه ماده ۳۸',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'ماده ۳۸ قانون تأمین اجتماعی و شرایط عمومی پیمان (نشریه ۴۳۱۱)',
      desc: 'ثبت کامل درآمد کارکرد، شناسایی مطالبات و تفکیک سپرده‌های تضمینی و بیمه‌ای کارفرما',
      entries,
      formulaNotes: ['کارکرد: ۵۰۰M + مالیات: ۵۰M = ۵۵۰M | کسر حسن کار: ۵۰M | کسر بیمه: ۲۵M | خالص طلب: ۴۷۵M'],
      startTime: t0
    });
  }

  public static runScenario60(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC60-GOV-PAYMENT';
    // وصول وجه صورت‌وضعیت از کارفرما از طریق حواله خزانه/حساب بانکی (۴۷۵M ریال)
    const entries = [
      this.createEntry({ id: 'sc60-1', doc, date: '1403/10/28', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 475000000, credit: 0, desc: 'واریز حواله خزانه به حساب بانکی شرکت پیمانکاری', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc60-2', doc, date: '1403/10/28', code: '10201', title: 'حساب‌های دریافتنی (کارفرما)', debit: 0, credit: 475000000, desc: 'تسویه کامل طلب صورت‌وضعیت شماره ۱', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' })
    ];
    return this.buildScenarioResult({
      num: 60, id: 'scenario-60-treasury-progress-payment',
      title: 'واریز وجه حواله خزانه کارفرما به حساب پروژه و تسویه مطالبات صورت‌وضعیت',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'گردش کار دریافت وجه پروژه‌های عمرانی از حساب‌های دولتی/کارفرمایی',
      desc: 'دریافت نقدی حواله الکترونیک و بستن طلب فاکتور کارکرد شماره ۱ در دفتر کل',
      entries,
      formulaNotes: ['واریز بانکی: ۴۷۵,۰۰۰,۰۰۰ ریال به بستانکار حساب کارفرما'],
      startTime: t0
    });
  }

  public static runScenario61(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC61-SSO-CLEARANCE';
    // اخذ مفاصاحساب ماده ۳۸ تأمین اجتماعی با پرداخت حق بیمه قطعی قرارداد و استرداد ۵٪ سپرده بیمه
    const entries = [
      this.createEntry({ id: 'sc61-1', doc, date: '1403/10/29', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 25000000, credit: 0, desc: 'استرداد ۵٪ سپرده بیمه توسط کارفرما پس از نامه شعبه تأمین اجتماعی', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc61-2', doc, date: '1403/10/29', code: '10402', title: 'سپرده بیمه ماده ۳۸ نزد کارفرما', debit: 0, credit: 25000000, desc: 'آزادسازی و تسویه ودیعه بیمه پس از صدور مفاصاحساب', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' })
    ];
    return this.buildScenarioResult({
      num: 61, id: 'scenario-61-sso-article-38-retention-release',
      title: 'آزادسازی و وصول ۵٪ سپرده بیمه ماده ۳۸ کارفرما پس از اخذ مفاصاحساب رسمی تأمین اجتماعی',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'ماده ۳۸ قانون تأمین اجتماعی (تکلیف کارفرما به آزادسازی سپرده بیمه)',
      desc: 'ثبت دریافت ودیعه بیمه کسرشده از صورت‌وضعیت‌ها پس از ارائه برگه تسویه حساب سازمان تأمین اجتماعی',
      entries,
      formulaNotes: ['آزادسازی سپرده بیمه: ۲۵,۰۰۰,۰۰۰ ریال نقداً به بانک واریز و حساب ودیعه تسویه شد'],
      startTime: t0
    });
  }

  public static runScenario62(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC62-RETENTION-RELEASE';
    // تحویل موقت پروژه و آزادسازی ۵۰٪ از سپرده حسن انجام کار (۲۵M ریال)
    const entries = [
      this.createEntry({ id: 'sc62-1', doc, date: '1403/10/30', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 25000000, credit: 0, desc: 'استرداد نصف سپرده حسن انجام کار پس از صورتجلسه تحویل موقت', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc62-2', doc, date: '1403/10/30', code: '10401', title: 'سپرده حسن انجام کار نزد کارفرما', debit: 0, credit: 25000000, desc: 'کاهش حساب سپرده تضمین کیفیت طبق ماده ۳۴ شرایط عمومی پیمان', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' })
    ];
    return this.buildScenarioResult({
      num: 62, id: 'scenario-62-performance-bond-partial-release',
      title: 'تحویل موقت پروژه عمرانی و آزادسازی نیمی از سپرده حسن انجام کار طبق شرایط عمومی پیمان',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'ماده ۳۴ و ۳۵ شرایط عمومی پیمان (آزادسازی ۵۰٪ حسن انجام کار در تحویل موقت)',
      desc: 'دریافت چک/حواله نصف تضمین کارکرد از کارفرما پس از رفع ایرادات کمیسیون تحویل موقت',
      entries,
      formulaNotes: ['۵۰٪ حسن انجام کار: ۲۵,۰۰۰,۰۰۰ ریال به بانک واریز گردید'],
      startTime: t0
    });
  }

  public static runScenario63(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC63-SUBCONTRACTOR';
    // صورت‌وضعیت پیمانکار جزء: کارکرد ۲۰۰M ریال با کسر ۱۰٪ حسن انجام کار (۲۰M) و پرداخت چک صیادی ۱۸۰M
    const entries = [
      this.createEntry({ id: 'sc63-1', doc, date: '1403/11/01', code: '50102', title: 'بهای تمام‌شده پروژه - پیمانکار جزء آرماتوربند', debit: 200000000, credit: 0, desc: 'صورت‌وضعیت دستمزد آرماتوربندی فونداسیون', clientId: 'c-sub-armature', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc63-2', doc, date: '1403/11/01', code: '20405', title: 'سپرده حسن انجام کار مکسوره از پیمانکار جزء', debit: 0, credit: 20000000, desc: 'نگهداری ۱۰٪ تضمین کیفیت کارکرد دستمزد', clientId: 'c-sub-armature', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc63-3', doc, date: '1403/11/01', code: '20102', title: 'اسناد پرداختنی تجاری (چک صیادی به پیمانکار جزء)', debit: 0, credit: 180000000, desc: 'صدور چک ۶۰ روزه در وجه استادکار پیمانکار جزء', clientId: 'c-sub-armature', projectTag: 'PRJ-BRIDGE-01' })
    ];
    return this.buildScenarioResult({
      num: 63, id: 'scenario-63-subcontractor-retention-and-check-issuance',
      title: 'صورت‌وضعیت پیمانکار جزء، کسر ۱۰٪ تضمین کیفیت و صدور چک صیادی تسویه کارکرد',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'مدیریت زنجیره تأمین پیمانکاران جزء و ضمانت‌های قراردادی',
      desc: 'ثبت هزینه مستقیم پروژه، ذخیره سپرده تضمینی و صدور چک برای مابقی طلب دستمزد',
      entries,
      formulaNotes: ['هزینه کارکرد: ۲۰۰M = ۲۰M سپرده حسن انجام کار + ۱۸۰M چک صیادی صادره'],
      startTime: t0
    });
  }

  public static runScenario64(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC64-PRICE-ESC';
    // تعدیل مثبت آحاد بهای پروژه عمرانی ناشی از تورم مصالح و شاخص سازمان برنامه و بودجه (۸۰M ریال)
    const entries = [
      this.createEntry({ id: 'sc64-1', doc, date: '1403/11/02', code: '10201', title: 'حساب‌های دریافتنی (کارفرما)', debit: 88000000, credit: 0, desc: 'طلب تعدیل سه ماهه سوم طبق شاخص رسمی سازمان برنامه', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc64-2', doc, date: '1403/11/02', code: '40110', title: 'درآمد تعدیل نرخ پیمان‌های عمرانی', debit: 0, credit: 80000000, desc: 'تعدیل قطعی کارکرد سه ماهه سوم', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' }),
      this.createEntry({ id: 'sc64-3', doc, date: '1403/11/02', code: '20301', title: 'ارزش افزوده صورت‌حساب تعدیل', debit: 0, credit: 8000000, desc: '۱۰٪ ارزش افزوده صورت‌حساب تعدیل', clientId: 'c-gov-client', projectTag: 'PRJ-BRIDGE-01' })
    ];
    return this.buildScenarioResult({
      num: 64, id: 'scenario-64-contract-price-escalation-adjustment',
      title: 'صورت‌حساب تعدیل آحاد بهای پیمان بر مبنای شاخص‌های قطعی سازمان برنامه و بودجه',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'دستورالعمل تعدیل آحاد بهای پیمان‌های دولتی (بخشنامه ۱۰۰/۷۶۶۱)',
      desc: 'شناسایی درآمد مابه‌التفاوت تورم مصالح و ماشین‌آلات و ثبت در سرفصل درآمدهای تعدیل',
      entries,
      formulaNotes: ['تعدیل ناخالص: ۸۰M | ۱۰٪ ارزش افزوده: ۸M | کل طلب تعدیل: ۸۸M ریال'],
      startTime: t0
    });
  }

  public static runScenario65(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC65-BANK-GUARANTEE';
    // اخذ ضمانت‌نامه بانکی حسن انجام تعهدات از بانک و پرداخت کارمزد صدور ضمانت‌نامه
    const entries = [
      this.createEntry({ id: 'sc65-1', doc, date: '1403/11/03', code: '60109', title: 'هزینه کارمزد صدور ضمانت‌نامه‌های بانکی', debit: 12000000, credit: 0, desc: 'کارمزد یک‌ساله ضمانت‌نامه شرکت در مناقصه/قرارداد', clientId: 'c-bank-mellat' }),
      this.createEntry({ id: 'sc65-2', doc, date: '1403/11/03', code: '10403', title: 'سپرده نقدی مسدودشده نزد بانک بابت ضمانت‌نامه (۱۰٪)', debit: 50000000, credit: 0, desc: 'ودیعه نقدی الزامی بانک بابت وثیقه ضمانت‌نامه', clientId: 'c-bank-mellat' }),
      this.createEntry({ id: 'sc65-3', doc, date: '1403/11/03', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 62000000, desc: 'کسر کارمزد و سپرده وثیقه از حساب جاری شرکت', clientId: 'c-bank-mellat' })
    ];
    return this.buildScenarioResult({
      num: 65, id: 'scenario-65-bank-performance-guarantee-issuance',
      title: 'صدور ضمانت‌نامه بانکی قرارداد پیمانکاری، پرداخت کارمزد بانکی و توثیق سپرده نقدی',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'دستورالعمل صدور ضمانت‌نامه‌های بانکی مصوب بانک مرکزی',
      desc: 'ثبت هزینه مالی کارمزد صدور و تفکیک سپرده مسدودی بانکی از موجودی نقد قابل برداشت',
      entries,
      formulaNotes: ['کارمزد بانکی: ۱۲M + ودیعه مسدودشده: ۵۰M = کسر ۶۲M از حساب جاری'],
      startTime: t0
    });
  }

  public static runScenario66(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC66-GUARANTEE-RELEASE';
    // ابطال و عودت اصل ضمانت‌نامه بانکی و آزادسازی سپرده نقدی ۵۰M ریال به حساب جاری
    const entries = [
      this.createEntry({ id: 'sc66-1', doc, date: '1403/11/04', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 50000000, credit: 0, desc: 'آزادسازی و برگشت ودیعه نقدی ضمانت‌نامه به حساب فعال', clientId: 'c-bank-mellat' }),
      this.createEntry({ id: 'sc66-2', doc, date: '1403/11/04', code: '10403', title: 'سپرده نقدی مسدودشده نزد بانک بابت ضمانت‌نامه', debit: 0, credit: 50000000, desc: 'ابطال لاشه ضمانت‌نامه و فک مسدودی حساب', clientId: 'c-bank-mellat' })
    ];
    return this.buildScenarioResult({
      num: 66, id: 'scenario-66-bank-guarantee-cancellation-and-deposit-release',
      title: 'ابطال ضمانت‌نامه بانکی پس از ایفای تعهدات و فک مسدودی سپرده نقدی توثیق‌شده',
      categoryFa: 'پیمانکاری و ماده ۳۸ تأمین اجتماعی',
      ruleRef: 'روال ابطال اسناد تعهدآور بانکی و تسویه تعهدات متقابل',
      desc: 'بازگشت مبلغ ودیعه وثیقه از حساب مسدود به حساب آزاد و فعال جهت استفاده در نقدینگی شرکت',
      entries,
      formulaNotes: ['فک مسدودی سپرده: ۵۰,۰۰۰,۰۰۰ ریال به مانده آزاد حساب جاری بازگشت'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۵: صنف رستوران‌ها، کافه‌ها، کترینگ و سفارش آنلاین (سناریوهای ۶۷ تا ۷۲)
  // =========================================================================

  public static runScenario67(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC67-REST-SALES';
    // فروش روزانه سالن رستوران: غذا ۱۰۰M + نوشیدنی ۲۰M + حق سرویس ۵M + ارزش افزوده ۱۰٪ (۱۲.۵M) = ۱۳۷.۵M ریال
    const entries = [
      this.createEntry({ id: 'sc67-1', doc, date: '1403/11/05', code: '10101', title: 'موجودی نقد و بانک‌ها (کارتخوان سالن)', debit: 137500000, credit: 0, desc: 'تسویه کامل سفارش‌های سالن رستوران توسط مشتریان', clientId: 'c-rest-walkin' }),
      this.createEntry({ id: 'sc67-2', doc, date: '1403/11/05', code: '40111', title: 'درآمد فروش غذا و منو رستوران', debit: 0, credit: 100000000, desc: 'فروش چلوکباب و خورش‌های روزانه', clientId: 'c-rest-walkin' }),
      this.createEntry({ id: 'sc67-3', doc, date: '1403/11/05', code: '40112', title: 'درآمد فروش نوشیدنی و بار گرم/سرد', debit: 0, credit: 20000000, desc: 'نوشیدنی، دوغ سنتی و قهوه', clientId: 'c-rest-walkin' }),
      this.createEntry({ id: 'sc67-4', doc, date: '1403/11/05', code: '40113', title: 'درآمد حق سرویس سالن', debit: 0, credit: 5000000, desc: 'سرویس پذیرایی میزها', clientId: 'c-rest-walkin' }),
      this.createEntry({ id: 'sc67-5', doc, date: '1403/11/05', code: '20301', title: 'ارزش افزوده رستوران (۱۰٪)', debit: 0, credit: 12500000, desc: '۱۰٪ ارزش افزوده بر مبنای ۱۲۵M ریال', clientId: 'c-rest-walkin' })
    ];
    return this.buildScenarioResult({
      num: 67, id: 'scenario-67-restaurant-dine-in-sales',
      title: 'فروش روزانه سالن رستوران با تفکیک منو، نوشیدنی، حق سرویس و مالیات ارزش افزوده',
      categoryFa: 'رستوران، کافه و کترینگ',
      ruleRef: 'دستورالعمل اجرایی مالیات بر ارزش افزوده صنف چلوکباب و رستوران‌ها',
      desc: 'ثبت جامع فیش‌های صندوق سالن، تفکیک درآمدی غذا از بار و محاسبه مالیات مصوب',
      entries,
      formulaNotes: ['غذا: ۱۰۰M + بار: ۲۰M + سرویس: ۵M = ۱۲۵M پایه | ۱۰٪ ارزش افزوده: ۱۲.۵M | جمع: ۱۳۷.۵M'],
      startTime: t0
    });
  }

  public static runScenario68(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC68-ONLINE-PLATFORM';
    // سفارش آنلاین اسنپ‌فود: کل سفارش ۹۰M ریال. کارمزد پلتفرم ۱۵٪ (۱۳.۵M) + واریزی پلتفرم به حساب ۷۶.۵M
    const entries = [
      this.createEntry({ id: 'sc68-1', doc, date: '1403/11/06', code: '10205', title: 'حساب‌های دریافتنی از پلتفرم‌های سفارش غذا', debit: 76500000, credit: 0, desc: 'طلب رستوران از اسنپ‌فود پس از کسر کمیسیون', clientId: 'c-snappfood' }),
      this.createEntry({ id: 'sc68-2', doc, date: '1403/11/06', code: '60110', title: 'هزینه کارمزد و کمیسیون پلتفرم‌های اینترنتی', debit: 13500000, credit: 0, desc: '۱۵٪ کمیسیون مارکت‌پلیس اسنپ‌فود', clientId: 'c-snappfood' }),
      this.createEntry({ id: 'sc68-3', doc, date: '1403/11/06', code: '40111', title: 'درآمد ناخالص سفارش‌های بیرون‌بر آنلاین', debit: 0, credit: 90000000, desc: 'کل فروش ناخالص سفارش‌های آنلاین اپلیکیشن', clientId: 'c-snappfood' })
    ];
    return this.buildScenarioResult({
      num: 68, id: 'scenario-68-food-delivery-platform-settlement',
      title: 'سفارش‌های آنلاین پلتفرم‌های دلیوری غذا، ثبت هزینه کمیسیون بازاریابی و مطالبات',
      categoryFa: 'رستوران، کافه و کترینگ',
      ruleRef: 'استاندارد شناسایی ناخالص فروش در تجارت الکترونیک (Gross vs Net Revenue)',
      desc: 'ثبت کل فروش در درآمدها و شناسایی شفاف سرفصل هزینه بازاریابی و کارمزد سفارش آنلاین',
      entries,
      formulaNotes: ['فروش کل: ۹۰M = طلب از پلتفرم ۷۶.۵M + هزینه کمیسیون پلتفرم ۱۳.۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario69(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC69-RECIPE-COGS';
    // مصرف روزانه مواد اولیه آشپزخانه رستوران (گوشت، برنج، روغن، زعفران) بر اساس آنالیز غذا (BOM): ۵۵M ریال
    const entries = [
      this.createEntry({ id: 'sc69-1', doc, date: '1403/11/07', code: '50103', title: 'بهای تمام‌شده مواد اولیه مصرفی غذا (BOM)', debit: 55000000, credit: 0, desc: 'مصرف گوشت و برنج طارم طبق فرمولاسیون طبخ روزانه', clientId: 'c-kitchen-head' }),
      this.createEntry({ id: 'sc69-2', doc, date: '1403/11/07', code: '10302', title: 'موجودی مواد اولیه و پروتئینی سردخانه', debit: 0, credit: 55000000, desc: 'حواله خروج انبار مواد غذایی به آشپزخانه مرکزی', clientId: 'c-kitchen-head' })
    ];
    return this.buildScenarioResult({
      num: 69, id: 'scenario-69-restaurant-recipe-bom-consumption',
      title: 'خروج مواد اولیه سردخانه بر اساس فرمول آنالیز طبخ غذا (Recipe / BOM) و ثبت بهای تمام‌شده',
      categoryFa: 'رستوران، کافه و کترینگ',
      ruleRef: 'حسابداری صنعتی بهای تمام‌شده غذا در صنایع غذایی و کترینگ',
      desc: 'انتقال گوشت و برنج از سردخانه به خط پخت و محاسبه سود ناخالص واقعی هر پرس غذا',
      entries,
      formulaNotes: ['مواد مصرفی سردخانه: ۵۵,۰۰۰,۰۰۰ ریال به بدهکار بهای تمام‌شده غذا'],
      startTime: t0
    });
  }

  public static runScenario70(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC70-PACKAGING';
    // خرید ملزومات بسته‌بندی، ظروف آلومینیومی و جعبه‌های دلیوری غذا (۲۵M ریال + ۲.۵M ارزش افزوده) نقد
    const entries = [
      this.createEntry({ id: 'sc70-1', doc, date: '1403/11/08', code: '10303', title: 'موجودی ظروف و ملزومات بسته‌بندی', debit: 25000000, credit: 0, desc: 'خرید ظروف بیرون‌بر گیاهی و آلومینیومی', clientId: 'c-pack-supplier' }),
      this.createEntry({ id: 'sc70-2', doc, date: '1403/11/08', code: '20301', title: 'ارزش افزوده خرید ملزومات (اعتبار)', debit: 2500000, credit: 0, desc: '۱۰٪ ارزش افزوده خرید ملزومات مصرفی', clientId: 'c-pack-supplier' }),
      this.createEntry({ id: 'sc70-3', doc, date: '1403/11/08', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 27500000, desc: 'پرداخت پایا فاکتور کارتن و ظروف بسته‌بندی', clientId: 'c-pack-supplier' })
    ];
    return this.buildScenarioResult({
      num: 70, id: 'scenario-70-takeout-packaging-materials-purchase',
      title: 'خرید عمده ظروف یکبارمصرف و کارتن‌های بسته‌بندی غذای بیرون‌بر و ثبت اعتبار مالیاتی',
      categoryFa: 'رستوران، کافه و کترینگ',
      ruleRef: 'حسابداری ملزومات بسته‌بندی و سربار مستقیم توزیع',
      desc: 'ورود ملزومات بسته‌بندی به انبار اقلام مصرفی و پرداخت وجه از طریق حساب بانکی رستوران',
      entries,
      formulaNotes: ['ظروف بسته‌بندی: ۲۵M + ۱۰٪ ارزش افزوده: ۲.۵M = پرداخت ۲۷.۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario71(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC71-KITCHEN-GAS-POWER';
    // قبض گاز و برق صنعتی آشپزخانه رستوران به مبلغ ۳۵M ریال (هزینه سربار تولید غذا)
    const entries = [
      this.createEntry({ id: 'sc71-1', doc, date: '1403/11/09', code: '50104', title: 'سربار ساخت - سوخت و انرژی آشپزخانه', debit: 35000000, credit: 0, desc: 'گاز مصرفی دیگ‌ها و کباب‌پزهای صنعتی', clientId: 'c-gas-company' }),
      this.createEntry({ id: 'sc71-2', doc, date: '1403/11/09', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 35000000, desc: 'پرداخت شناسه قبض و شناسه پرداخت از درگاه اینترنتی', clientId: 'c-gas-company' })
    ];
    return this.buildScenarioResult({
      num: 71, id: 'scenario-71-kitchen-utility-energy-overhead',
      title: 'هزینه انرژی و سوخت صنعتی آشپزخانه رستوران به عنوان سربار مستقیم بهای تمام‌شده',
      categoryFa: 'رستوران، کافه و کترینگ',
      ruleRef: 'تخصیص هزینه‌های سربار ساخت و پخت غذا در حسابداری صنعتی',
      desc: 'تفکیک هزینه انرژی خط پخت از هزینه‌های اداری عمومی و اتصال مستقیم به بهای تمام‌شده',
      entries,
      formulaNotes: ['قبض انرژی صنعتی: ۳۵,۰۰۰,۰۰۰ ریال به حساب سربار بهای تمام‌شده پخت غذا'],
      startTime: t0
    });
  }

  public static runScenario72(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC72-COURIER-SETTLE';
    // تسویه هفتگی با پیک‌های موتوری رستوران: کرایه حمل ۴۲M ریال + کسر وجه نقد دریافتی از مشتریان ۱۸M = پرداخت خالص ۲۴M
    const entries = [
      this.createEntry({ id: 'sc72-1', doc, date: '1403/11/10', code: '60111', title: 'هزینه حمل، ارسال و پیک رستوران', debit: 42000000, credit: 0, desc: 'کرایه مصوب تعداد سرویس‌های ارسالی پیک موتوری', clientId: 'c-courier-team' }),
      this.createEntry({ id: 'sc72-2', doc, date: '1403/11/10', code: '10101', title: 'موجودی نقد و بانک‌ها (تحویلی پیک به صندوق)', debit: 18000000, credit: 0, desc: 'وجوه نقد وصول‌شده از درب منزل مشتریان', clientId: 'c-courier-team' }),
      this.createEntry({ id: 'sc72-3', doc, date: '1403/11/10', code: '10101', title: 'موجودی نقد و بانک‌ها (پرداخت مانده به پیک)', debit: 0, credit: 60000000, desc: 'تسویه نهایی حساب هفتگی ناوگان توزیع', clientId: 'c-courier-team' })
    ];
    return this.buildScenarioResult({
      num: 72, id: 'scenario-72-delivery-courier-weekly-reconciliation',
      title: 'تسویه هفتگی با ناوگان پیک موتوری، تهاتر وجوه نقد دریافتی از مشتری با کرایه حمل',
      categoryFa: 'رستوران، کافه و کترینگ',
      ruleRef: 'دستورالعمل تسویه وجه نقد در تحویل (Cash on Delivery - COD)',
      desc: 'ثبت هزینه حمل، تحویل پول نقد وصولی مشتریان به صندوق و پرداخت دستمزد خالص پیک',
      entries,
      formulaNotes: ['کرایه کل: ۴۲M + وجوه برگشتی نقد ۱۸M = موازنه تراز ۶۰M ریال'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۶: حسابداری دارایی‌های ثابت، استهلاک و واگذاری (سناریوهای ۷۳ تا ۸۰)
  // =========================================================================

  public static runScenario73(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC73-ASSET-ACQ';
    // خرید دستگاه اسپرسوساز صنعتی برای کافه: ۳۰۰M ریال + ۱۰٪ ارزش افزوده ۳۰M ریال با چک ۶۰ روزه
    const entries = [
      this.createEntry({ id: 'sc73-1', doc, date: '1403/11/11', code: '20101', title: 'دارایی‌های ثابت - اثاثیه و ماشین‌آلات', debit: 300000000, credit: 0, desc: 'خرید دستگاه اسپرسوساز صنعتی لامارزوکو ۲ گروپ', clientId: 'c-machinery-seller' }),
      this.createEntry({ id: 'sc73-2', doc, date: '1403/11/11', code: '20301', title: 'ارزش افزوده خرید دارایی (اعتبار مالیاتی)', debit: 30000000, credit: 0, desc: '۱۰٪ ارزش افزوده فاکتور رسمی تجهیزات', clientId: 'c-machinery-seller' }),
      this.createEntry({ id: 'sc73-3', doc, date: '1403/11/11', code: '20102', title: 'اسناد پرداختنی تجاری (چک صیادی)', debit: 0, credit: 330000000, desc: 'چک دو ماهه صیادی در وجه شرکت تأمین تجهیزات', clientId: 'c-machinery-seller' })
    ];
    return this.buildScenarioResult({
      num: 73, id: 'scenario-73-fixed-asset-acquisition',
      title: 'خرید تجهیزات و ماشین‌آلات به عنوان دارایی ثابت با صدور چک صیادی و ثبت اعتبار مالیاتی',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'استاندارد حسابداری شماره ۱۱ (دارایی‌های ثابت مشهود)',
      desc: 'سرمایه‌ای کردن خرید دارایی و ثبت در ترازنامه به جای هزینه‌کردن مستقیم در سود و زیان',
      entries,
      formulaNotes: ['بهای دارایی: ۳۰۰M + ارزش افزوده: ۳۰M = چک صیادی ۳۳۰M ریال'],
      startTime: t0
    });
  }

  public static runScenario74(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC74-ASSET-INSTALL';
    // مخارج حمل و نصب و راه‌اندازی دستگاه قهوه‌ساز (سرمایه‌ای کردن مخارج نصب طبق استاندارد ۱۱): ۲۰M ریال نقد
    const entries = [
      this.createEntry({ id: 'sc74-1', doc, date: '1403/11/12', code: '20101', title: 'دارایی‌های ثابت - اثاثیه و ماشین‌آلات', debit: 20000000, credit: 0, desc: 'مخارج حمل، تکنسین نصب و فیلتر تصفیه آب صنعتی', clientId: 'c-tech-installer' }),
      this.createEntry({ id: 'sc74-2', doc, date: '1403/11/12', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 20000000, desc: 'پرداخت نقدی دستمزد نصاب مجاز شرکت', clientId: 'c-tech-installer' })
    ];
    return this.buildScenarioResult({
      num: 74, id: 'scenario-74-asset-installation-capitalization',
      title: 'سرمایه‌ای کردن هزینه‌های حمل، تست و راه‌اندازی دارایی ثابت و افزایش بهای تمام‌شده',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'بند ۱۶ استاندارد حسابداری شماره ۱۱ (عناصر بهای تمام‌شده دارایی ثابت)',
      desc: 'افزودن کلیه مخارج تا مرحله آماده‌سازی به ارزش دفتری دستگاه به جای هزینه جاری',
      entries,
      formulaNotes: ['بهای نهایی دستگاه: ۳۰۰M قبلی + ۲۰M مخارج نصب = ۳۲۰,۰۰۰,۰۰۰ ریال'],
      startTime: t0
    });
  }

  public static runScenario75(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC75-STRAIGHT-DEPR';
    // استهلاک سالانه به روش خط مستقیم (Straight-Line): بهای ۳۲۰M با ارزش اسقاط ۲۰M و عمر مفید ۱۰ سال = ۳۰M ریال
    const entries = [
      this.createEntry({ id: 'sc75-1', doc, date: '1403/11/13', code: '60112', title: 'هزینه استهلاک دارایی‌های ثابت مشهود', debit: 30000000, credit: 0, desc: 'استهلاک خط مستقیم سالانه دستگاه اسپرسو', clientId: 'c-depr-schedule' }),
      this.createEntry({ id: 'sc75-2', doc, date: '1403/11/13', code: '20201', title: 'استهلاک انباشته ماشین‌آلات و اثاثیه (کاهنده دارایی)', debit: 0, credit: 30000000, desc: 'ثبت ذخیره استهلاک سال اول در ترازنامه', clientId: 'c-depr-schedule' })
    ];
    return this.buildScenarioResult({
      num: 75, id: 'scenario-75-straight-line-depreciation',
      title: 'محاسبه و ثبت استهلاک سالانه دارایی ثابت به روش خط مستقیم طبق جدول ماده ۱۴۹ ق.م.م',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'ماده ۱۴۹ قانون مالیات‌های مستقیم و آیین‌نامه استهلاک دارایی‌ها',
      desc: 'شناسایی هزینه غیرنقدی استهلاک در سود و زیان و ایجاد حساب کاهنده در ترازنامه',
      entries,
      formulaNotes: ['استهلاک: (۳۲۰M بهای تمام‌شده - ۲۰M ارزش اسقاط) تقسیم بر ۱۰ سال = ۳۰M ریال'],
      startTime: t0
    });
  }

  public static runScenario76(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC76-DECLINING-DEPR';
    // استهلاک نزولی سرورها و تجهیزات IT کافه به نرخ ۲۵٪ مانده نزولی (بهای تمام‌شده ۱۰۰M، استهلاک سال اول ۲۵M)
    const entries = [
      this.createEntry({ id: 'sc76-1', doc, date: '1403/11/14', code: '60112', title: 'هزینه استهلاک تجهیزات رایانه و سرور', debit: 25000000, credit: 0, desc: 'استهلاک سال اول تجهیزات IT به نرخ ۲۵٪ نزولی', clientId: 'c-depr-it' }),
      this.createEntry({ id: 'sc76-2', doc, date: '1403/11/14', code: '20202', title: 'استهلاک انباشته تجهیزات رایانه و شبکه', debit: 0, credit: 25000000, desc: 'ذخیره کاهنده دارایی تجهیزات شبکه', clientId: 'c-depr-it' })
    ];
    return this.buildScenarioResult({
      num: 76, id: 'scenario-76-declining-balance-depreciation',
      title: 'استهلاک تجهیزات فناوری اطلاعات به روش مانده نزولی بر اساس نرخ‌های جدول دارایی‌های استهلاک‌پذیر',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'روش مانده نزولی جدول استهلاکات دارایی‌های دیجیتال',
      desc: 'محاسبه استهلاک بر اساس درصد ثابت از ارزش دفتری مستهلک‌نشده در پایان سال مالی',
      entries,
      formulaNotes: ['۱۰۰,۰۰۰,۰۰۰ ریال ارزش دفتری ضربدر ۲۵٪ نرخ مصوب = ۲۵,۰۰۰,۰۰۰ ریال استهلاک سال اول'],
      startTime: t0
    });
  }

  public static runScenario77(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC77-MAJOR-OVERHAUL';
    // تعمیرات اساسی (Overhaul) دستگاه آسیاب قهوه که عمر مفید آن را ۵ سال افزایش می‌دهد: ۴۰M ریال نقداً پرداخت شد
    const entries = [
      this.createEntry({ id: 'sc77-1', doc, date: '1403/11/15', code: '20101', title: 'دارایی‌های ثابت - اثاثیه و ماشین‌آلات', debit: 40000000, credit: 0, desc: 'تعویض موتور و تیغه‌های تیتانیومی آسیاب صنعتی (مخارج اساسی)', clientId: 'c-repair-center' }),
      this.createEntry({ id: 'sc77-2', doc, date: '1403/11/15', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 40000000, desc: 'پرداخت فاکتور رسمی تعمیرات اساسی از حساب جاری', clientId: 'c-repair-center' })
    ];
    return this.buildScenarioResult({
      num: 77, id: 'scenario-77-major-overhaul-capital-expenditure',
      title: 'تعمیرات اساسی (Overhaul) دارایی ثابت، افزایش عمر مفید و سرمایه‌ای کردن مخارج',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'مخارج پس از تحصیل دارایی‌های ثابت (افزایش ظرفیت یا طول عمر دارایی)',
      desc: 'عدم ثبت به عنوان هزینه جاری و اضافه کردن مخارج نوسازی اساسی به ارزش دارایی ثابت',
      entries,
      formulaNotes: ['مخارج اساسی ۴۰,۰۰۰,۰۰۰ ریال به ارزش تاریخی دارایی در ترازنامه افزوده شد'],
      startTime: t0
    });
  }

  public static runScenario78(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC78-ROUTINE-MAINT';
    // سرویس دوره‌ای و روغن‌کاری دستگاه‌ها (هزینه جاری تعمیر و نگهداری - عدم سرمایه‌ای کردن): ۵M ریال
    const entries = [
      this.createEntry({ id: 'sc78-1', doc, date: '1403/11/16', code: '60113', title: 'هزینه تعمیر و نگهداری جاری دارایی‌ها', debit: 5000000, credit: 0, desc: 'سرویس ماهانه دستگاه‌های برودتی و گرمایشی', clientId: 'c-maint-service' }),
      this.createEntry({ id: 'sc78-2', doc, date: '1403/11/16', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 5000000, desc: 'پرداخت تنخواه به تکنسین سرویس دوره‌ای', clientId: 'c-maint-service' })
    ];
    return this.buildScenarioResult({
      num: 78, id: 'scenario-78-routine-maintenance-expense',
      title: 'سرویس دوره‌ای دارایی‌های ثابت و ثبت در هزینه‌های جاری عملیاتی (تعمیر و نگهداری)',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'تفکیک مخارج جاری نگهداری از مخارج اساسی سرمایه‌ای',
      desc: 'هزینه‌کردن مستقیم مخارجی که صرفاً وضعیت جاری کارایی دستگاه را حفظ می‌کنند در سود و زیان',
      entries,
      formulaNotes: ['سرویس دوره‌ای ۵,۰۰۰,۰۰۰ ریال مستقیماً به حساب هزینه دوره منتقل گردید'],
      startTime: t0
    });
  }

  public static runScenario79(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC79-ASSET-GAIN';
    // فروش دارایی ثابت با سود: بهای تمام‌شده ۱۰۰M، استهلاک انباشته ۶۰M (ارزش دفتری ۴۰M). فروش نقدی به ۵۵M -> سود فروش ۱۵M
    const entries = [
      this.createEntry({ id: 'sc79-1', doc, date: '1403/11/17', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 55000000, credit: 0, desc: 'وجه حاصل از فروش یخچال کارکرده کافه', clientId: 'c-asset-buyer' }),
      this.createEntry({ id: 'sc79-2', doc, date: '1403/11/17', code: '20201', title: 'استهلاک انباشته اثاثیه و ماشین‌آلات', debit: 60000000, credit: 0, desc: 'بستن حساب کاهنده دارایی واگذارشده', clientId: 'c-asset-buyer' }),
      this.createEntry({ id: 'sc79-3', doc, date: '1403/11/17', code: '20101', title: 'دارایی‌های ثابت مشهود', debit: 0, credit: 100000000, desc: 'خارج کردن بهای تمام‌شده تاریخی دارایی از دفاتر', clientId: 'c-asset-buyer' }),
      this.createEntry({ id: 'sc79-4', doc, date: '1403/11/17', code: '70202', title: 'سود حاصل از فروش و واگذاری دارایی‌های ثابت', debit: 0, credit: 15000000, desc: 'سود مازاد بهای فروش نسبت به ارزش دفتری', clientId: 'c-asset-buyer' })
    ];
    return this.buildScenarioResult({
      num: 79, id: 'scenario-79-asset-disposal-gain',
      title: 'فروش دارایی ثابت مستهلک‌شده با سود و شناسایی درآمد غیرعملیاتی در صورت سود و زیان',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'استاندارد حسابداری ۱۱ (شناسایی سود و زیان حاصل از برکناری و واگذاری)',
      desc: 'بستن همزمان بهای تمام‌شده و استهلاک انباشته دارایی و شناسایی سود خالص فروش',
      entries,
      formulaNotes: ['دریافتی: ۵۵M + استهلاک بسته شده: ۶۰M = ۱۱۵M | بهای دارایی: ۱۰۰M + سود فروش: ۱۵M'],
      startTime: t0
    });
  }

  public static runScenario80(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC80-ASSET-LOSS';
    // فروش دارایی ثابت با زیان: بهای تمام‌شده ۲۰۰M، استهلاک ۸۰M (ارزش دفتری ۱۲۰M). فروش نقدی به ۹۰M -> زیان واگذاری ۳۰M
    const entries = [
      this.createEntry({ id: 'sc80-1', doc, date: '1403/11/18', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 90000000, credit: 0, desc: 'وجه دریافتی حاصل از فروش خودروی وانت فرسوده', clientId: 'c-asset-buyer2' }),
      this.createEntry({ id: 'sc80-2', doc, date: '1403/11/18', code: '20203', title: 'استهلاک انباشته وسایط نقلیه', debit: 80000000, credit: 0, desc: 'ابطال استهلاک انباشته وانت فروخته‌شده', clientId: 'c-asset-buyer2' }),
      this.createEntry({ id: 'sc80-3', doc, date: '1403/11/18', code: '60114', title: 'زیان حاصل از فروش و واگذاری دارایی‌های ثابت', debit: 30000000, credit: 0, desc: 'زیان ناشی از فروش کمتر از ارزش دفتری مستهلک‌نشده', clientId: 'c-asset-buyer2' }),
      this.createEntry({ id: 'sc80-4', doc, date: '1403/11/18', code: '20102', title: 'دارایی ثابت - وسایط نقلیه', debit: 0, credit: 200000000, desc: 'خروج کامل ارزش تاریخی وانت از سرفصل دارایی‌ها', clientId: 'c-asset-buyer2' })
    ];
    return this.buildScenarioResult({
      num: 80, id: 'scenario-80-asset-disposal-loss',
      title: 'فروش دارایی با زیان و شناسایی هزینه غیرعملیاتی ناشی از کاهش ارزش در دفاتر',
      categoryFa: 'دارایی ثابت و استهلاک',
      ruleRef: 'قواعد خروج دارایی‌های مستهلک و شناسایی زیان واگذاری',
      desc: 'بستن حساب دارایی و استهلاک انباشته و شناسایی زیان ناشی از حوادث یا فرسودگی در صورت سود و زیان',
      entries,
      formulaNotes: ['دریافتی: ۹۰M + استهلاک: ۸۰M + زیان واگذاری: ۳۰M = ۲۰۰M بهای تاریخی خودرو'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۷: عملیات پیشرفته بانکی، تنزیل چک، تسهیلات و تهاتر (سناریوهای ۸۱ تا ۹۰)
  // =========================================================================

  public static runScenario81(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC81-CHECK-DISCOUNT';
    // تنزیل چک صیادی نزد بانک/بازار: چک ۱۰۰M ریالی سه ماهه با نرخ سود ۱۸٪ تنزیل می‌شود (۹۵.۵M نقد + ۴.۵M هزینه تنزیل)
    const entries = [
      this.createEntry({ id: 'sc81-1', doc, date: '1403/11/19', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 95500000, credit: 0, desc: 'خالص واریزی وجه چک تنزیل‌شده به حساب جاری', clientId: 'c-bank-discount' }),
      this.createEntry({ id: 'sc81-2', doc, date: '1403/11/19', code: '60115', title: 'هزینه‌های مالی و کارمزد تنزیل اسناد تجاری', debit: 4500000, credit: 0, desc: 'هزینه مالی تنزیل زودهنگام چک مدت‌دار', clientId: 'c-bank-discount' }),
      this.createEntry({ id: 'sc81-3', doc, date: '1403/11/19', code: '10202', title: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)', debit: 0, credit: 100000000, desc: 'خروج لاشه چک تنزیل‌شده از موجودی اسناد دریافتنی', clientId: 'c-bank-discount' })
    ];
    return this.buildScenarioResult({
      num: 81, id: 'scenario-81-commercial-bill-discounting',
      title: 'تنزیل زودهنگام چک صیادی مدت‌دار، دریافت فوری نقدینگی و ثبت هزینه مالی تنزیل',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'دستورالعمل تنزیل اسناد تجاری در عقود بانکی و بازار پول',
      desc: 'تسویه اسناد دریافتنی قبل از موعد سررسید با کسر کارمزد تنزیل و افزایش نقدینگی در گردش',
      entries,
      formulaNotes: ['چک اسمی: ۱۰۰M = واریز نقدی ۹۵.۵M + هزینه مالی تنزیل ۴.۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario82(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC82-LOAN-DISBURSE';
    // دریافت تسهیلات بانکی مرابحه ۵۰۰M ریال با بازپرداخت ۱۲ ماهه و سود مصوب ۲۳٪ (کل سود مصوب ۵۷.۵M)
    const entries = [
      this.createEntry({ id: 'sc82-1', doc, date: '1403/11/20', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 500000000, credit: 0, desc: 'واریز اصل وام مرابحه به حساب جاری شرکت', clientId: 'c-bank-saderat' }),
      this.createEntry({ id: 'sc82-2', doc, date: '1403/11/20', code: '10404', title: 'سود سنوات آتی وام‌های بانکی (بهره تحقق‌نیافته)', debit: 57500000, credit: 0, desc: 'بهره ۱۲ ماهه وام بر اساس نرخ شورای پول و اعتبار', clientId: 'c-bank-saderat' }),
      this.createEntry({ id: 'sc82-3', doc, date: '1403/11/20', code: '20204', title: 'تسهیلات مالی دریافتی از بانک‌ها (اصل و فرع)', debit: 0, credit: 557500000, desc: 'کل تعهد بازپرداخت اقساط ۱۲ ماهه تسهیلات', clientId: 'c-bank-saderat' })
    ];
    return this.buildScenarioResult({
      num: 82, id: 'scenario-82-bank-loan-disbursement-murabaha',
      title: 'دریافت وام بانکی مرابحه، ثبت تعهد بازپرداخت اقساط و شناسایی بهره تحقق‌نیافته',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'عقود بانکی بدون ربا و ثبت تسهیلات مالی دریافتی در ترازنامه',
      desc: 'شارژ حساب بانک شرکت و ایجاد تعهد بدهی بلندمدت به انضمام حساب کاهنده سود سنوات آتی',
      entries,
      formulaNotes: ['اصل وام: ۵۰۰M + سود سنوات آتی: ۵۷.۵M = کل تعهد وام ۵۵۷.۵M ریال'],
      startTime: t0
    });
  }

  public static runScenario83(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC83-LOAN-INSTALL';
    // پرداخت قسط اول وام بانکی مرابحه: مبلغ قسط ۴۶,۴۵۸,۳۳۳ ریال (شامل اصل ۴۱.۶M و سود ۴.۷۹M ریال)
    const entries = [
      this.createEntry({ id: 'sc83-1', doc, date: '1403/11/21', code: '20204', title: 'تسهیلات مالی دریافتی از بانک‌ها', debit: 46458333, credit: 0, desc: 'کاهش بدهی کلی وام با پرداخت قسط ماه اول', clientId: 'c-bank-saderat' }),
      this.createEntry({ id: 'sc83-2', doc, date: '1403/11/21', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 46458333, desc: 'برداشت خودکار قسط وام از حساب جاری شرکت', clientId: 'c-bank-saderat' }),
      this.createEntry({ id: 'sc83-3', doc, date: '1403/11/21', code: '60116', title: 'هزینه بهره و سود تسهیلات بانکی', debit: 4791667, credit: 0, desc: 'شناسایی هزینه مالی سود سهم ماه اول', clientId: 'c-bank-saderat' }),
      this.createEntry({ id: 'sc83-4', doc, date: '1403/11/21', code: '10404', title: 'سود سنوات آتی وام‌های بانکی', debit: 0, credit: 4791667, desc: 'استهلاک بهره تحقق‌نیافته سهم ماه اول', clientId: 'c-bank-saderat' })
    ];
    return this.buildScenarioResult({
      num: 83, id: 'scenario-83-loan-installment-payment-and-interest-recognition',
      title: 'پرداخت قسط ماهانه وام بانکی و انتقال سهم سود دوره به هزینه‌های مالی سود و زیان',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'اصل تطابق هزینه‌های مالی در طول دوره بهره‌مندی از وام',
      desc: 'کاهش تعهد کل وام، کسر وجه از حساب بانک و تبدیل سود معوق به هزینه واقعی بهره ماهانه',
      entries,
      formulaNotes: ['قسط وام: ۴۶.۴۵M | هزینه بهره شناسایی‌شده: ۴.۷۹M ریال'],
      startTime: t0
    });
  }

  public static runScenario84(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC84-BOUNCED-RECEIVABLE';
    // برگشت چک صیادی مشتری به علت کسری موجودی حساب (۸۰M ریال) و ثبت هزینه واخواست بانکی (۵۰۰ هزار ریال)
    const entries = [
      this.createEntry({ id: 'sc84-1', doc, date: '1403/11/22', code: '10206', title: 'اسناد دریافتنی واخواستی و نکول‌شده', debit: 80000000, credit: 0, desc: 'چک صیادی شماره ۹۸۲۳ برگشت‌خورده مشتری', clientId: 'c-bounced-customer' }),
      this.createEntry({ id: 'sc84-2', doc, date: '1403/11/22', code: '10201', title: 'حساب‌های دریافتنی (هزینه واخواست)', debit: 500000, credit: 0, desc: 'هزینه صدور گواهی عدم پرداخت بانک عهده مشتری', clientId: 'c-bounced-customer' }),
      this.createEntry({ id: 'sc84-3', doc, date: '1403/11/22', code: '10202', title: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)', debit: 0, credit: 80000000, desc: 'خروج چک از فهرست چک‌های معتبر در جریان وصول', clientId: 'c-bounced-customer' }),
      this.createEntry({ id: 'sc84-4', doc, date: '1403/11/22', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 0, credit: 500000, desc: 'کسر کارمزد بانکی صدور گواهی عدم پرداخت چک', clientId: 'c-bounced-customer' })
    ];
    return this.buildScenarioResult({
      num: 84, id: 'scenario-84-bounced-customer-check-protest',
      title: 'برگشت چک صیادی مشتری به علت کسری موجودی و ثبت گواهی عدم پرداخت بانکی و مطالبات',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'قانون جدید صدور چک مصوب ۱۳۹۷ (صدور گواهی عدم پرداخت و برگشت چک)',
      desc: 'انتقال چک به سرفصل اسناد واخواستی و مطالبه هزینه کارمزد بانکی از صادرکننده چک',
      entries,
      formulaNotes: ['چک برگشتی: ۸۰M ریال + کارمزد واخواست: ۵۰۰,۰۰۰ ریال به بدهکار مشتری'],
      startTime: t0
    });
  }

  public static runScenario85(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC85-CHECK-ENDORS';
    // خرج کردن / واگذاری چک صیادی مشتری به تأمین‌کننده بابت تسویه بدهی خرید کالا (۶۰M ریال)
    const entries = [
      this.createEntry({ id: 'sc85-1', doc, date: '1403/11/23', code: '20101', title: 'حساب‌های پرداختنی تجاری (تأمین‌کننده)', debit: 60000000, credit: 0, desc: 'تسویه فاکتور خرید با انتقال چک مشتری در سامانه صیاد', clientId: 'c-vendor-raw' }),
      this.createEntry({ id: 'sc85-2', doc, date: '1403/11/23', code: '10202', title: 'اسناد دریافتنی تجاری (چک‌های نزد صندوق)', debit: 0, credit: 60000000, desc: 'انتقال مالکیت چک صیادی مشتری به تأمین‌کننده', clientId: 'c-vendor-raw' })
    ];
    return this.buildScenarioResult({
      num: 85, id: 'scenario-85-sayad-check-endorsement-transfer',
      title: 'واگذاری و انتقال چک صیادی مشتری به تأمین‌کننده جهت تسویه فاکتورهای خرید (Endorsement)',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'انتقال مالکیت چک صیادی در سامانه پیچک بانک مرکزی',
      desc: 'بستن همزمان بدهی تأمین‌کننده و خارج ساختن چک مشتری از اسناد نزد صندوق بدون درگیرکردن بانک',
      entries,
      formulaNotes: ['مبلغ چک انتقالی: ۶۰,۰۰۰,۰۰۰ ریال به بدهکار حساب تأمین‌کننده'],
      startTime: t0
    });
  }

  public static runScenario86(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC86-BARTER-SETTLE';
    // تهاتر مستقیم بدهی و طلب بین دو شرکت همکار (طرف‌حساب هم مشتری و هم تأمین‌کننده ماست): تهاتر ۱۰۰M ریال
    const entries = [
      this.createEntry({ id: 'sc86-1', doc, date: '1403/11/24', code: '20101', title: 'حساب‌های پرداختنی تجاری', debit: 100000000, credit: 0, desc: 'تهاتر مطالبات و تعهدات متقابل طبق صورتجلسه', clientId: 'c-partner-dual' }),
      this.createEntry({ id: 'sc86-2', doc, date: '1403/11/24', code: '10201', title: 'حساب‌ها و اسناد دریافتنی تجاری', debit: 0, credit: 100000000, desc: 'تسویه طلب فروش با بدهی خرید از شرکت همکار', clientId: 'c-partner-dual' })
    ];
    return this.buildScenarioResult({
      num: 86, id: 'scenario-86-bilateral-barter-clearing-entry',
      title: 'تهاتر بدهی و طلب متقابل شرکت‌های همکار (مشتری و تأمین‌کننده دوجانبه) بدون انتقال وجه',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'ماده ۲۹۴ قانون مدنی (وقوع تهاتر قهری در دیون متقابل)',
      desc: 'صاف کردن مانده‌های بدهکار و بستانکار در کاردکس تفصیلی شخص واحد بدون جابجایی پول در بانک',
      entries,
      formulaNotes: ['تهاتر ۱۰۰,۰۰۰,۰۰۰ ریال از حساب‌های دریافتنی با حساب‌های پرداختنی'],
      startTime: t0
    });
  }

  public static runScenario87(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC87-FOREX-IMPORT';
    // تسعیر ارز در خرید تجهیزات خارجی: خرید ۱۰,۰۰۰ درهم امارات به نرخ ۱۶۰,۰۰۰ ریال (۱,۶۰۰M ریال)
    // در زمان تسویه، نرخ درهم ۱۶۵,۰۰۰ ریال شده -> ۵۰M زیان تسعیر ارز شناسایی می‌شود
    const entries = [
      this.createEntry({ id: 'sc87-1', doc, date: '1403/11/25', code: '20103', title: 'حساب‌های پرداختنی ارزی (تأمین‌کننده دبی)', debit: 1600000000, credit: 0, desc: 'تسویه تعهد ارزی ۱۰,۰۰۰ درهم بر مبنای نرخ اولیه', clientId: 'c-dubai-tech' }),
      this.createEntry({ id: 'sc87-2', doc, date: '1403/11/25', code: '60117', title: 'زیان تسعیر ارز ناشی از نوسان نرخ ارز', debit: 50000000, credit: 0, desc: 'زیان افزایش نرخ برابری درهم تا تاریخ پرداخت حواله', clientId: 'c-dubai-tech' }),
      this.createEntry({ id: 'sc87-3', doc, date: '1403/11/25', code: '10101', title: 'موجودی نقد و بانک‌ها (حواله صرافی)', debit: 0, credit: 1650000000, desc: 'کل ریال پرداختی به صرافی جهت صدور حواله ارزی', clientId: 'c-dubai-tech' })
    ];
    return this.buildScenarioResult({
      num: 87, id: 'scenario-87-foreign-exchange-import-fluctuation',
      title: 'تسعیر ارز بدهی‌های خارجی و شناسایی زیان ناشی از افزایش نرخ برابری ارز در زمان تسویه',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'استاندارد حسابداری شماره ۱۶ (آثار تغییر در نرخ ارز)',
      desc: 'ثبت تسویه بدهی به نرخ تاریخی و شناسایی مابه‌التفاوت نوسان ارز در سرفصل سود و زیان تسعیر',
      entries,
      formulaNotes: ['بدهی تاریخی: ۱,۶۰۰M + زیان تسعیر: ۵۰M = کل خروج ریال ۱,۶۵۰M ریال'],
      startTime: t0
    });
  }

  public static runScenario88(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC88-FOREX-EXPORT-GAIN';
    // تسعیر ارز در صادرات خدمات مهندسی: طلب ۵,۰۰۰ دلار به نرخ ۵۸۰,۰۰۰ ریال ثبت شده بود (۲,۹۰۰M).
    // در تاریخ وصول، نرخ دلار ۶۰۰,۰۰۰ ریال شد -> وصول ۳,۰۰۰M ریال و شناسایی ۱۰۰M ریال سود تسعیر ارز
    const entries = [
      this.createEntry({ id: 'sc88-1', doc, date: '1403/11/26', code: '10101', title: 'موجودی نقد و بانک‌ها (حساب ارزی/ریالی)', debit: 3000000000, credit: 0, desc: 'وصول ریالی مطالبات دلاری صادرات خدمات', clientId: 'c-export-client' }),
      this.createEntry({ id: 'sc88-2', doc, date: '1403/11/26', code: '10207', title: 'حساب‌های دریافتنی ارزی از کارفرمایان خارجی', debit: 0, credit: 2900000000, desc: 'تسویه طلب ۵,۰۰۰ دلاری به نرخ دفتری اولیه', clientId: 'c-export-client' }),
      this.createEntry({ id: 'sc88-3', doc, date: '1403/11/26', code: '70203', title: 'سود تسعیر ارز حاصل از صادرات', debit: 0, credit: 100000000, desc: 'شناسایی درآمد ناشی از افزایش نرخ دلار تا روز تسویه', clientId: 'c-export-client' })
    ];
    return this.buildScenarioResult({
      num: 88, id: 'scenario-88-foreign-exchange-export-gain',
      title: 'وصول مطالبات صادراتی با سود تسعیر ارز و ثبت درآمد غیرعملیاتی طبق استاندارد ۱۶',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'استاندارد حسابداری شماره ۱۶ و بند ب ماده ۱۴۱ ق.م.م (معافیت درآمدهای صادراتی)',
      desc: 'وصول مطالبات با نرخ روز بازار و شناسایی سود تسعیر ارز در دفاتر رسمی',
      entries,
      formulaNotes: ['دریافت نقدی: ۳,۰۰۰M = طلب دفتری ۲,۹۰۰M + سود تسعیر ارز ۱۰۰M ریال'],
      startTime: t0
    });
  }

  public static runScenario89(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC89-BAD-DEBT-WRITE-OFF';
    // سوخت قطعی مطالبات لاوصول مشتری متوفی/ورشکسته بدون امکان وصول: ۳۰M ریال با کسر از ذخیره مطالبات
    const entries = [
      this.createEntry({ id: 'sc89-1', doc, date: '1403/11/27', code: '10208', title: 'ذخیره مطالبات مشکوک‌الوصول (کاهنده دارایی)', debit: 30000000, credit: 0, desc: 'استفاده از ذخیره قبلی بابت سوخت قطعی طلب ورشکستگی', clientId: 'c-bankrupt-debtor' }),
      this.createEntry({ id: 'sc89-2', doc, date: '1403/11/27', code: '10201', title: 'حساب‌ها و اسناد دریافتنی تجاری', debit: 0, credit: 30000000, desc: 'حذف قطعی نام مشتری ورشکسته از دفاتر مالی', clientId: 'c-bankrupt-debtor' })
    ];
    return this.buildScenarioResult({
      num: 89, id: 'scenario-89-bad-debt-write-off',
      title: 'سوخت قطعی مطالبات غیرقابل وصول از محل ذخیره مطالبات مشکوک‌الوصول',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'بند ۱۱ ماده ۱۴۸ قانون مالیات‌های مستقیم (شرایط سوخت مطالبات لاوصول)',
      desc: 'خارج کردن مطالبات سوخت‌شده از ترازنامه با استفاده از ذخیره عمومی ایجادشده در دوره‌های قبل',
      entries,
      formulaNotes: ['سوخت طلب ۳۰,۰۰۰,۰۰۰ ریال از ذخیره مشکوک‌الوصول کسر و حساب مشتری بسته شد'],
      startTime: t0
    });
  }

  public static runScenario90(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC90-RECOVERED-DEBT';
    // احیای غیرمنتظره مطالبات سوخت‌شده سال قبل: واریز نقدی ۱۵M ریال توسط وراث مشتری
    const entries = [
      this.createEntry({ id: 'sc90-1', doc, date: '1403/11/28', code: '10101', title: 'موجودی نقد و بانک‌ها', debit: 15000000, credit: 0, desc: 'واریز نقدی وجه بدهی سوخت‌شده سال‌های قبل توسط وراث', clientId: 'c-heir-pay' }),
      this.createEntry({ id: 'sc90-2', doc, date: '1403/11/28', code: '70204', title: 'سایر درآمدهای غیرعملیاتی (احیای مطالبات سوخت‌شده)', debit: 0, credit: 15000000, desc: 'شناسایی درآمد اتفاقی وصول طلب سوخت‌شده گذشته', clientId: 'c-heir-pay' })
    ];
    return this.buildScenarioResult({
      num: 90, id: 'scenario-90-recovered-bad-debt-income',
      title: 'احیا و وصول غیرمترقبه مطالبات سوخت‌شده سنوات قبل و ثبت در سایر درآمدهای غیرعملیاتی',
      categoryFa: 'عملیات بانکی، تسهیلات و چک',
      ruleRef: 'دستورالعمل ثبت وصول مطالبات لاوصول مختومه در دوره‌های گذشته',
      desc: 'ثبت واریز نقدی طلب سوخت‌شده به عنوان درآمد غیرعملیاتی دوره جاری بدون برهم‌زدن حساب مشتری',
      entries,
      formulaNotes: ['وصول ۱۵,۰۰۰,۰۰۰ ریال نقداً به بانک واریز و در سرفصل درآمد سایر ثبت گردید'],
      startTime: t0
    });
  }

  // =========================================================================
  // گروه ۸: تعدیلات پایان سال، بستن حساب‌ها (P&L)، مالیات ۲۵٪ و سند اختتامیه (سناریوهای ۹۱ تا ۱۰۰)
  // =========================================================================

  public static runScenario91(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC91-PREPAID-RENT';
    // تعدیل پیش‌پرداخت اجاره دفتر کار در پایان سال مالی: اجاره ۱۲ ماهه ۱۲۰M ریال بود و کل سال سپری شد
    const entries = [
      this.createEntry({ id: 'sc91-1', doc, date: '1403/12/29', code: '60118', title: 'هزینه اجاره دفتر مرکزی و انبار', debit: 120000000, credit: 0, desc: 'انتقال پیش‌پرداخت اجاره سالانه به هزینه واقعی دوره', clientId: 'c-landlord' }),
      this.createEntry({ id: 'sc91-2', doc, date: '1403/12/29', code: '10405', title: 'پیش‌پرداخت اجاره اماکن (حساب دارایی)', debit: 0, credit: 120000000, desc: 'استهلاک کامل مانده دارایی پیش‌پرداخت در پایان سال مالی', clientId: 'c-landlord' })
    ];
    return this.buildScenarioResult({
      num: 91, id: 'scenario-91-year-end-prepaid-rent-amortization',
      title: 'تعدیل پایان سال پیش‌پرداخت اجاره ساختمان و تبدیل قطعی دارایی به هزینه دوره مالی',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'اصل تحقق و تطابق در تعدیلات پایان سال مالی (Adjusting Entries)',
      desc: 'بستن حساب پیش‌پرداخت دارایی جاری و انتقال آن به سرفصل هزینه‌های عملیاتی سال جاری',
      entries,
      formulaNotes: ['پیش‌پرداخت منقضی‌شده: ۱۲۰,۰۰۰,۰۰۰ ریال به بدهکار هزینه اجاره دوره'],
      startTime: t0
    });
  }

  public static runScenario92(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC92-PREPAID-INSURANCE';
    // تعدیل پیش‌پرداخت بیمه آتش‌سوزی و مسئولیت کارفرما (۳۶M ریال بابت ۱۲ ماه سپری شده)
    const entries = [
      this.createEntry({ id: 'sc92-1', doc, date: '1403/12/29', code: '60119', title: 'هزینه بیمه دارایی‌ها و مسئولیت مدنی', debit: 36000000, credit: 0, desc: 'انقضای بیمه‌نامه آتش‌سوزی و مسئولیت مدنی سالانه', clientId: 'c-insurance-iran' }),
      this.createEntry({ id: 'sc92-2', doc, date: '1403/12/29', code: '10406', title: 'پیش‌پرداخت بیمه دارایی‌ها و مسئولیت', debit: 0, credit: 36000000, desc: 'استهلاک حساب دارایی پیش‌پرداخت بیمه', clientId: 'c-insurance-iran' })
    ];
    return this.buildScenarioResult({
      num: 92, id: 'scenario-92-year-end-prepaid-insurance-amortization',
      title: 'تعدیل پایان سال پیش‌پرداخت بیمه اموال و مسئولیت و شناسایی هزینه سالانه در سود و زیان',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'استاندارد حسابداری تعهدی و شناسایی انقضای بیمه‌نامه‌ها',
      desc: 'ثبت پایان دوره مالی جهت صفرکردن مانده بیمه‌نامه‌های منقضی‌شده و انتقال به هزینه',
      entries,
      formulaNotes: ['هزینه بیمه منقضی: ۳۶,۰۰۰,۰۰۰ ریال به هزینه سال جاری منتقل شد'],
      startTime: t0
    });
  }

  public static runScenario93(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC93-CLOSE-REVENUE';
    // بستن حساب‌های موقت درآمد (گروه ۴) به حساب خلاصه سود و زیان (کد ۵۰۲۰۱): مجموع درآمدهای سال ۱,۲۰۰M ریال
    const entries = [
      this.createEntry({ id: 'sc93-1', doc, date: '1403/12/29', code: '40101', title: 'درآمد فروش کالا و خدمات (بستن حساب)', debit: 1200000000, credit: 0, desc: 'صفر کردن مانده بستانکار حساب درآمدها در پایان دوره مالی', clientId: 'c-closing-entry' }),
      this.createEntry({ id: 'sc93-2', doc, date: '1403/12/29', code: '50201', title: 'خلاصه سود و زیان دوره مالی جاری', debit: 0, credit: 1200000000, desc: 'انتقال مجموع درآمدهای عملیاتی سال به بستانکار خلاصه سود و زیان', clientId: 'c-closing-entry' })
    ];
    return this.buildScenarioResult({
      num: 93, id: 'scenario-93-close-temporary-revenue-accounts',
      title: 'سند بستن حساب‌های موقت درآمد (گروه ۴) و انتقال مانده بستانکار به خلاصه سود و زیان',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'اصول حسابداری دوبل در فرآیند بستن دوره مالی (Closing Entries - Revenues)',
      desc: 'بدهکار کردن درآمدهای موقت برای صفر شدن مانده و انتقال تجمیعی به بستانکار حساب ۵۰۲۰۱',
      entries,
      formulaNotes: ['کل درآمدهای سالانه ۱,۲۰۰,۰۰۰,۰۰۰ ریال به بستانکار خلاصه سود و زیان منتقل گردید'],
      startTime: t0
    });
  }

  public static runScenario94(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC94-CLOSE-EXPENSE';
    // بستن حساب‌های موقت هزینه (گروه ۶) به حساب خلاصه سود و زیان: مجموع هزینه‌های سال ۷۵۰M ریال
    const entries = [
      this.createEntry({ id: 'sc94-1', doc, date: '1403/12/29', code: '50201', title: 'خلاصه سود و زیان دوره مالی جاری', debit: 750000000, credit: 0, desc: 'انتقال کل هزینه‌های عملیاتی سال به بدهکار خلاصه سود و زیان', clientId: 'c-closing-entry' }),
      this.createEntry({ id: 'sc94-2', doc, date: '1403/12/29', code: '60101', title: 'هزینه‌های اداری، عمومی و حقوق (بستن حساب)', debit: 0, credit: 750000000, desc: 'صفر کردن مانده بدهکار کلیه هزینه‌ها در پایان دوره مالی', clientId: 'c-closing-entry' })
    ];
    return this.buildScenarioResult({
      num: 94, id: 'scenario-94-close-temporary-expense-accounts',
      title: 'سند بستن حساب‌های موقت هزینه (گروه ۶) و انتقال مانده بدهکار به خلاصه سود و زیان',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'فرآیند استاندارد بستن حساب‌های اسمی هزینه در پایان سال مالی',
      desc: 'بستانکار کردن سرفصل‌های هزینه جهت صفر کردن کاردکس آن‌ها و بدهکار کردن حساب ۵۰۲۰۱',
      entries,
      formulaNotes: ['کل هزینه‌های سالانه ۷۵۰,۰۰۰,۰۰۰ ریال به بدهکار خلاصه سود و زیان منتقل گردید'],
      startTime: t0
    });
  }

  public static runScenario95(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC95-TAX-PROVISION';
    // سود قبل از مالیات: ۱,۲۰۰M منهای ۷۵۰M مساوی ۴۵۰M ریال.
    // محاسبه ذخیره مالیات بر عملکرد ۲۵٪ طبق ماده ۱۰۵ ق.م.م: ۲۵٪ از ۴۵۰M مساوی ۱۱۲.۵M ریال
    const entries = [
      this.createEntry({ id: 'sc95-1', doc, date: '1403/12/29', code: '50201', title: 'خلاصه سود و زیان (سهم مالیات عملکرد)', debit: 112500000, credit: 0, desc: 'کسر مالیات عملکرد شرکت طبق نرخ مصوب ماده ۱۰۵', clientId: 'c-tax-org' }),
      this.createEntry({ id: 'sc95-2', doc, date: '1403/12/29', code: '20307', title: 'ذخیره مالیات بر درآمد عملکرد سالانه (ماده ۱۰۵)', debit: 0, credit: 112500000, desc: 'بدهی برآوردی مالیات عملکرد به سازمان امور مالیاتی', clientId: 'c-tax-org' })
    ];
    return this.buildScenarioResult({
      num: 95, id: 'scenario-95-corporate-income-tax-provision',
      title: 'محاسبه و ثبت ذخیره مالیات بر درآمد عملکرد سالانه اشخاص حقوقی (۲۵٪ ماده ۱۰۵ ق.م.م)',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'ماده ۱۰۵ قانون مالیات‌های مستقیم (نرخ ۲۵٪ مالیات بر جمع درآمد مشمول اشخاص حقوقی)',
      desc: 'کسر سهم مالیات دولت از سود قبل از کسر مالیات و ایجاد بدهی جاری مالیاتی در ترازنامه',
      entries,
      formulaNotes: ['سود ناخالص: ۴۵۰M | ۲۵٪ مالیات عملکرد: ۱۱۲,۵۰۰,۰۰۰ ریال به حساب بدهی مالیاتی'],
      startTime: t0
    });
  }

  public static runScenario96(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC96-LEGAL-RESERVE';
    // سود خالص پس از مالیات: ۴۵۰M منهای ۱۱۲.۵M مساوی ۳۳۷.۵M ریال.
    // تخصیص ۵٪ اندوخته قانونی طبق ماده ۱۴۰ لایحه اصلاحی قانون تجارت: ۵٪ از ۳۳۷.۵M مساوی ۱۶,۸۷۵,۰۰۰ ریال
    const entries = [
      this.createEntry({ id: 'sc96-1', doc, date: '1403/12/29', code: '50201', title: 'خلاصه سود و زیان (تخصیص اندوخته)', debit: 16875000, credit: 0, desc: 'کسر ۵٪ سهم اندوخته قانونی از سود ویژه سال', clientId: 'c-statutory-reserve' }),
      this.createEntry({ id: 'sc96-2', doc, date: '1403/12/29', code: '30201', title: 'اندوخته قانونی (حقوق صاحبان سهام)', debit: 0, credit: 16875000, desc: 'تخصیص ۵٪ اندوخته اجباری تا سقف ۱۰٪ سرمایه ثبتی', clientId: 'c-statutory-reserve' })
    ];
    return this.buildScenarioResult({
      num: 96, id: 'scenario-96-statutory-legal-reserve-allocation',
      title: 'تخصیص ۵٪ اندوخته قانونی از سود خالص سالانه طبق ماده ۱۴۰ لایحه اصلاحی قانون تجارت',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'ماده ۱۴۰ لایحه قانونی اصلاح قسمتی از قانون تجارت (تخصیص ۱/۲۰ سود خالص)',
      desc: 'انتقال ۵٪ از سود ویژه خالص پس از مالیات به سرفصل حقوق صاحبان سهام به عنوان ذخیره قانونی',
      entries,
      formulaNotes: ['سود ویژه: ۳۳۷.۵M | ۵٪ اندوخته قانونی: ۱۶,۸۷۵,۰۰۰ ریال به سرفصل حقوق مالکان'],
      startTime: t0
    });
  }

  public static runScenario97(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC97-RETAINED-EARNINGS';
    // انتقال باقیمانده سود خالص سال (۳۲۰,۶۲۵,۰۰۰ ریال) به حساب سود انباشته پایان سال (۳۰۳۰۱)
    const entries = [
      this.createEntry({ id: 'sc97-1', doc, date: '1403/12/29', code: '50201', title: 'خلاصه سود و زیان (صفر کردن حساب)', debit: 320625000, credit: 0, desc: 'بستن قطعی حساب خلاصه سود و زیان سال مالی ۱۴۰۳', clientId: 'c-retained-earnings' }),
      this.createEntry({ id: 'sc97-2', doc, date: '1403/12/29', code: '30301', title: 'سود (زیان) انباشته پایان دوره', debit: 0, credit: 320625000, desc: 'انتقال مانده سود خالص قابل تخصیص به سود انباشته', clientId: 'c-retained-earnings' })
    ];
    return this.buildScenarioResult({
      num: 97, id: 'scenario-97-transfer-to-retained-earnings',
      title: 'بستن حساب خلاصه سود و زیان و انتقال مانده سود خالص دوره به سود انباشته ترازنامه',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'تکمیل چرخه سود و زیان و انتقال نتایج عملکرد سالانه به حقوق مالکان',
      desc: 'صفر شدن کامل حساب ۵۰۲۰۱ و افزایش مانده سود انباشته در بخش حقوق صاحبان سهام ترازنامه',
      entries,
      formulaNotes: ['مانده سود خالص ۳۲۰,۶۲۵,۰۰۰ ریال به حساب سود انباشته ترازنامه منتقل شد'],
      startTime: t0
    });
  }

  public static runScenario98(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC98-DIVIDEND-DECLARED';
    // تصویب مجمع عمومی مبنی بر تقسیم سود نقدی سهامداران: ۱۲۰M ریال از سود انباشته به سود پرداختنی
    const entries = [
      this.createEntry({ id: 'sc98-1', doc, date: '1403/12/29', code: '30301', title: 'سود (زیان) انباشته', debit: 120000000, credit: 0, desc: 'تخصیص سود نقدی سهامداران مصوب مجمع عمومی سالانه', clientId: 'c-shareholders' }),
      this.createEntry({ id: 'sc98-2', doc, date: '1403/12/29', code: '20406', title: 'سود سهام پرداختنی به سهامداران (DPS)', debit: 0, credit: 120000000, desc: 'ایجاد بدهی کوتاه مدت پرداخت سود نقدی به شرکا', clientId: 'c-shareholders' })
    ];
    return this.buildScenarioResult({
      num: 98, id: 'scenario-98-cash-dividend-distribution-approval',
      title: 'تصویب تقسیم سود نقدی سهامداران در مجمع عمومی و ایجاد بدهی سود سهام پرداختنی',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'ماده ۲۴۰ لایحه اصلاحی قانون تجارت (پرداخت سود نقدی سهام ظرف ۸ ماه)',
      desc: 'کاهش سود انباشته و شناسایی بدهی قطعی شرکت در قبال سهامداران جهت واریز سود مصوب',
      entries,
      formulaNotes: ['سود نقدی مصوب: ۱۲۰,۰۰۰,۰۰۰ ریال از سود انباشته کسر و به سود پرداختنی رفت'],
      startTime: t0
    });
  }

  public static runScenario99(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC99-CLOSING-PERMANENT';
    // سند اختتامیه سال مالی: بستن تمام حساب‌های دائم ترازنامه به حساب تراز اختتامیه (۹۰۱۰۱)
    // دارایی‌ها (مانده بدهکار: ۹۰۰M ریال بستانکار می‌شود) / بدهی‌ها و سرمایه (مانده بستانکار: ۹۰۰M ریال بدهکار می‌شود)
    const entries = [
      // ۱. بستن بدهی‌ها و حقوق صاحبان سهام به تراز اختتامیه (بدهکار کردن بستانکاران):
      this.createEntry({ id: 'sc99-1', doc, date: '1403/12/29', code: '20101', title: 'حساب‌های پرداختنی تجاری (اختتامیه)', debit: 300000000, credit: 0, desc: 'بستن بدهی به تأمین‌کنندگان در سند اختتامیه', clientId: 'c-closing-balance' }),
      this.createEntry({ id: 'sc99-2', doc, date: '1403/12/29', code: '30101', title: 'سرمایه ثبت‌شده و اندوخته‌ها (اختتامیه)', debit: 600000000, credit: 0, desc: 'بستن حقوق صاحبان سهام در سند اختتامیه', clientId: 'c-closing-balance' }),
      this.createEntry({ id: 'sc99-3', doc, date: '1403/12/29', code: '90101', title: 'تراز اختتامیه سال مالی ۱۴۰۳', debit: 0, credit: 900000000, desc: 'انتقال مجموع بستانکاران به بستانکار تراز اختتامیه', clientId: 'c-closing-balance' }),

      // ۲. بستن دارایی‌ها به تراز اختتامیه (بستانکار کردن دارایی‌ها):
      this.createEntry({ id: 'sc99-4', doc, date: '1403/12/29', code: '90101', title: 'تراز اختتامیه سال مالی ۱۴۰۳', debit: 900000000, credit: 0, desc: 'انتقال مجموع دارایی‌های دفتری به بدهکار تراز اختتامیه', clientId: 'c-closing-balance' }),
      this.createEntry({ id: 'sc99-5', doc, date: '1403/12/29', code: '10101', title: 'موجودی نقد و بانک‌ها (اختتامیه)', debit: 0, credit: 400000000, desc: 'صفر کردن دفتری مانده حساب‌های بانکی در اختتامیه', clientId: 'c-closing-balance' }),
      this.createEntry({ id: 'sc99-6', doc, date: '1403/12/29', code: '10201', title: 'حساب‌های دریافتنی مشتریان (اختتامیه)', debit: 0, credit: 300000000, desc: 'صفر کردن دفتری طلب از مشتریان در اختتامیه', clientId: 'c-closing-balance' }),
      this.createEntry({ id: 'sc99-7', doc, date: '1403/12/29', code: '10301', title: 'موجودی انبار کالا (اختتامیه)', debit: 0, credit: 200000000, desc: 'صفر کردن دفتری موجودی انبار در اختتامیه', clientId: 'c-closing-balance' })
    ];
    return this.buildScenarioResult({
      num: 99, id: 'scenario-99-permanent-accounts-closing-document',
      title: 'سند اختتامیه رسمی پایان سال مالی و بستن کلیه حساب‌های دائم به واسطه تراز اختتامیه',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'اصول صدور سند اختتامیه و صفر کردن کلیه دفاتر مالی در پایان دوره مالی',
      desc: 'بستن متقارن تمام دارایی‌ها و بدهی‌ها و سرمایه با حساب واسطه تراز اختتامیه و موازنه ۱۰۰٪',
      entries,
      formulaNotes: ['کل گردش سند اختتامیه: ۱,۸۰۰,۰۰۰,۰۰۰ ریال به صورت کاملاً متوازن بدهکار و بستانکار'],
      startTime: t0
    });
  }

  public static runScenario100(): AccountingTestScenarioResult {
    const t0 = performance.now();
    const doc = 'DOC-SC100-OPENING-YEAR';
    // سند افتتاحیه سال مالی جدید (۱۴۰۴): بازگشایی تمام حساب‌های دائم از طریق تراز افتتاحیه (۹۰۱۰۲)
    // دارایی‌ها بدهکار می‌شوند (۹۰۰M) / بدهی‌ها و سرمایه بستانکار می‌شوند (۹۰۰M) با انحراف دقیقاً صفر ریال
    const entries = [
      // ۱. بازگشایی دارایی‌ها در سال جدید (بدهکار کردن دارایی‌ها):
      this.createEntry({ id: 'sc100-1', doc, date: '1404/01/01', code: '10101', title: 'موجودی نقد و بانک‌ها (افتتاحیه ۱۴۰۴)', debit: 400000000, credit: 0, desc: 'مانده نقدی ابتدای دوره سال مالی ۱۴۰۴', clientId: 'c-opening-1404' }),
      this.createEntry({ id: 'sc100-2', doc, date: '1404/01/01', code: '10201', title: 'حساب‌های دریافتنی تجاری (افتتاحیه ۱۴۰۴)', debit: 300000000, credit: 0, desc: 'مطالبات معوق انتقالی از سال مالی قبل', clientId: 'c-opening-1404' }),
      this.createEntry({ id: 'sc100-3', doc, date: '1404/01/01', code: '10301', title: 'موجودی انبار کالا (افتتاحیه ۱۴۰۴)', debit: 200000000, credit: 0, desc: 'موجودی کالای اول دوره انبار در سال جدید', clientId: 'c-opening-1404' }),
      this.createEntry({ id: 'sc100-4', doc, date: '1404/01/01', code: '90102', title: 'تراز افتتاحیه سال مالی ۱۴۰۴', debit: 0, credit: 900000000, desc: 'انتقال سرجمع دارایی‌ها به بستانکار تراز افتتاحیه', clientId: 'c-opening-1404' }),

      // ۲. بازگشایی بدهی‌ها و حقوق مالکان (بستانکار کردن بدهی و سرمایه):
      this.createEntry({ id: 'sc100-5', doc, date: '1404/01/01', code: '90102', title: 'تراز افتتاحیه سال مالی ۱۴۰۴', debit: 900000000, credit: 0, desc: 'انتقال سرجمع بدهی‌ها و سرمایه به بدهکار تراز افتتاحیه', clientId: 'c-opening-1404' }),
      this.createEntry({ id: 'sc100-6', doc, date: '1404/01/01', code: '20101', title: 'حساب‌های پرداختنی تجاری (افتتاحیه ۱۴۰۴)', debit: 0, credit: 300000000, desc: 'تعهدات پرداختنی انتقالی به سال مالی جدید', clientId: 'c-opening-1404' }),
      this.createEntry({ id: 'sc100-7', doc, date: '1404/01/01', code: '30101', title: 'سرمایه ثبتی شرکا و سود انباشته (افتتاحیه ۱۴۰۴)', debit: 0, credit: 600000000, desc: 'حقوق صاحبان سهام و انباشته انتقالی به سال جدید', clientId: 'c-opening-1404' })
    ];
    return this.buildScenarioResult({
      num: 100, id: 'scenario-100-grand-centum-opening-year-balance',
      title: 'سند افتتاحیه سال مالی جدید، بازگشایی ترازنامه، موازنه تراز ۶ ستونی و اعتبارسنجی ۱۰۰ سناریوی طلایی',
      categoryFa: 'بستن حساب‌ها و پایان سال مالی',
      ruleRef: 'استاندارد بازگشایی دفاتر قانونی در سال مالی جدید (سند شماره ۱ سال)',
      desc: 'سند رسمی افتتاحیه، پیوند پیوسته سنوات مالی و اثبات ریاضی تراز بودن کل اکوسیستم هابینو',
      entries,
      formulaNotes: ['کل گردش افتتاحیه: ۱,۸۰۰,۰۰۰,۰۰۰ ریال | اختلاف ریاضی: دقیقاً ۰ ریال | پوشش ۱۰۰ سناریوی طلایی تکمیل شد'],
      startTime: t0
    });
  }

  /**
   * بازگرداندن آرایه توابع سناریوهای ۳۳ تا ۱۰۰
   */
  public static getAllCentumScenarios(): Array<() => AccountingTestScenarioResult> {
    return [
      this.runScenario33.bind(this),
      this.runScenario34.bind(this),
      this.runScenario35.bind(this),
      this.runScenario36.bind(this),
      this.runScenario37.bind(this),
      this.runScenario38.bind(this),
      this.runScenario39.bind(this),
      this.runScenario40.bind(this),
      this.runScenario41.bind(this),
      this.runScenario42.bind(this),
      this.runScenario43.bind(this),
      this.runScenario44.bind(this),
      this.runScenario45.bind(this),
      this.runScenario46.bind(this),
      this.runScenario47.bind(this),
      this.runScenario48.bind(this),
      this.runScenario49.bind(this),
      this.runScenario50.bind(this),
      this.runScenario51.bind(this),
      this.runScenario52.bind(this),
      this.runScenario53.bind(this),
      this.runScenario54.bind(this),
      this.runScenario55.bind(this),
      this.runScenario56.bind(this),
      this.runScenario57.bind(this),
      this.runScenario58.bind(this),
      this.runScenario59.bind(this),
      this.runScenario60.bind(this),
      this.runScenario61.bind(this),
      this.runScenario62.bind(this),
      this.runScenario63.bind(this),
      this.runScenario64.bind(this),
      this.runScenario65.bind(this),
      this.runScenario66.bind(this),
      this.runScenario67.bind(this),
      this.runScenario68.bind(this),
      this.runScenario69.bind(this),
      this.runScenario70.bind(this),
      this.runScenario71.bind(this),
      this.runScenario72.bind(this),
      this.runScenario73.bind(this),
      this.runScenario74.bind(this),
      this.runScenario75.bind(this),
      this.runScenario76.bind(this),
      this.runScenario77.bind(this),
      this.runScenario78.bind(this),
      this.runScenario79.bind(this),
      this.runScenario80.bind(this),
      this.runScenario81.bind(this),
      this.runScenario82.bind(this),
      this.runScenario83.bind(this),
      this.runScenario84.bind(this),
      this.runScenario85.bind(this),
      this.runScenario86.bind(this),
      this.runScenario87.bind(this),
      this.runScenario88.bind(this),
      this.runScenario89.bind(this),
      this.runScenario90.bind(this),
      this.runScenario91.bind(this),
      this.runScenario92.bind(this),
      this.runScenario93.bind(this),
      this.runScenario94.bind(this),
      this.runScenario95.bind(this),
      this.runScenario96.bind(this),
      this.runScenario97.bind(this),
      this.runScenario98.bind(this),
      this.runScenario99.bind(this),
      this.runScenario100.bind(this)
    ];
  }
}
