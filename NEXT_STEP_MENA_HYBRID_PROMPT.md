# پرامپت قدم بعدی (فاز ۶ — گام ۱): انتزاع `IHabinoDataProvider` + زیرساخت پایه چندکشوری خاورمیانه (MENA)

> **اصل اجرایی (مصوب کتابخانه دانش `HABINO_KNOWLEDGE_BASE.md` — ADR-009 و ADR-010):**
> * **حفظ ۱۰۰٪ هسته مالی:** فایل‌های `accountingKernel.ts` و `atomicTransactionWrapper.ts` به هیچ وجه نباید بازنویسی یا تغییر منطق داده شوند.
> * **مصرف حداقل توکن و تغییر جراحی (Surgical):** این گام صرفاً زیرساخت آداپتور داده، پشتیبانی اعشار/ارز خاورمیانه و پروفایل انطباق کشوری را با سازگاری کامل (Backward Compatibility) با نسخه ابری فعلی اضافه می‌کند.
> * **تذکر پیش‌نیاز:** در صورت عدم اجرای پرامپت امنیتی قبلی (`ADMIN_SUPPORT_INFRA_REFACTOR_PROMPTS.md`)، ابتدا اصلاح تابع SQL `current_platform_admin_tier()` و ایمن‌سازی اندپوینت‌های هوش مصنوعی در `server.ts` را اعمال کنید.

---

## پرامپت کپی‌پست برای تیم توسعه

```text
نقش تو: معمار ارشد سیستم و مهندس TypeScript در هابینو.
مرجع معماری: مطابق ADR-009 و ADR-010 در HABINO_KNOWLEDGE_BASE.md و فاز ۶ نقشه راه (roadmapEngine.ts).
هدف: اجرای گام اول فاز ۶ بدون دستکاری هسته حسابداری دوبل و با حفظ کامل رفتار فعلی نسخه ابری ایران.

⛔ قوانین الزامی اجرا با حداقل مصرف توکن (Token-Efficiency & Surgical Rules — تخطی ممنوع):
۱. ویرایش جراحی صرف (Surgical Patch Only): فایل‌های موجود (`types.ts`, `currencyUtils.ts`, `roadmapEngine.ts`, `store.tsx`) را کامل بازنویسی نکن؛ فقط خطوط هدف را با پنجره محدود بخوان و Patch موضعی بزن.
۲. منطقه ممنوعه (Do-Not-Touch): به `accountingKernel.ts`، `atomicTransactionWrapper.ts`، کامپوننت‌های UI مالی و منطق Sync فعلی `supabaseSyncEngine.ts` دست نزن؛ هیچ Refactor غیرمرتبطی انجام نده.
۳. بدون پکیج جدید: این گام با تایپ‌اسکریپت خالص انجام می‌شود و نیازی به نصب هیچ پکیج npm جدید نیست.
۴. بررسی و بیلد یک‌باره (Single Final Check): تمام فایل‌ها را تغییر بده و در انتها فقط یک‌بار `npm run typecheck && npm run lint && npm run build` و تست‌های هسته/لایسنس را اجرا کن.
۵. گزارش نهایی فوق‌کوتاه: در پایان فقط فهرست فایل‌های تغییریافته و نتیجه تست‌ها را در حداکثر ۶ خط بنویس.

وظایف دقیق (فقط همین موارد را با حداقل تغییرات پیاده‌سازی کن):

۱. ایجاد فایل جدید `src/lib/dataProvider.ts`:
- تعریف نوع `HabinoRuntimeMode = 'cloud' | 'local_sqlite' | 'hybrid_lan'`.
- تعریف اینترفیس استاندارد `IHabinoDataProvider` شامل متدهای انتزاعی حداقل برای:
  * `readonly mode: HabinoRuntimeMode`
  * `loadTenantSnapshot(tenantId: string)` و `saveTenantSnapshot(tenantId: string, snapshot)`
  * `upsertEntity(tenantId, collection, record)` و `deleteEntity(tenantId, collection, id)`
  * `flushOutbox(tenantId)` و `getHealthStatus()`
- پیاده‌سازی `CloudSupabaseDataProvider implements IHabinoDataProvider` به‌صورت Wrapper تمیز روی `supabaseSyncEngine.ts` و `indexedDbEngine.ts` موجود (بدون بازنویسی منطق Sync فعلی).
- پیاده‌سازی تابع `getActiveDataProvider(): IHabinoDataProvider` که بر اساس `import.meta.env.VITE_HABINO_RUNTIME_MODE || 'cloud'` آداپتور ابری را برمی‌گرداند و برای `local_sqlite` و `hybrid_lan` تا زمان تکمیل فاز ۷ و ۸ خطای مشخص راهنما صادر کند.

۲. آماده‌سازی پایه چندکشوری خاورمیانه در `src/types.ts`:
- گسترش `CurrencyType` با حفظ کامل مقادیر فعلی (`'IRT' | 'IRR' | 'USD'`) به همراه ارزهای هدف خاورمیانه:
  `'AFN' | 'TJS' | 'SAR' | 'AED' | 'IQD' | 'OMR' | 'KWD' | 'BHD' | 'EUR'`
- افزودن فیلدهای اختیاری با Backward Compatibility کامل در `CompanySettings`:
  * `countryCode?: 'IR' | 'AF' | 'TJ' | 'SA' | 'AE' | 'IQ' | 'OM' | 'INTL'`
  * `locale?: 'fa-IR' | 'fa-AF' | 'tg-TJ' | 'ar-SA' | 'ar-AE' | 'ar-IQ' | 'en-US'`
  * `calendarSystem?: 'jalali_ir' | 'jalali_af' | 'hijri_gregorian' | 'gregorian'`
  * `decimalPrecision?: 0 | 2 | 3`

۳. ارتقای دقت اعشار و ارز چندکشوری در `src/lib/currencyUtils.ts`:
- بدون تغییر رفتار پیش‌فرض ایران (`IRT` و `IRR` با ۰ رقم اعشار)، توابع زیر را اضافه و بهینه کن:
  * `getCurrencyDecimals(currency: CurrencyType): 0 | 2 | 3` (۰ برای IRR/IRT/IQD، ۲ برای AFN/TJS/SAR/AED/USD/EUR، ۳ برای OMR/KWD/BHD).
  * `toMinorUnits(amount, currency)` و `fromMinorUnits(minorAmount, currency)` برای حذف خطای ممیز شناور در محاسبات ۲ و ۳ رقم اعشاری.
  * ارتقای `formatCurrency(amount, currency, locale?)` تا بدون `Math.round()` اجباری برای ارزهای ۲ و ۳ اعشاری، ارقام اعشاری را دقیق فرمت کند (در حالی که `IRT`/`IRR` همچنان بدون اعشار و کاملاً سازگار با گذشته باقی بمانند).

۴. ایجاد پلاگین انطباق کشوری سبک `src/lib/compliancePack.ts`:
- تعریف `CountryComplianceProfile` شامل: `countryCode`, `defaultCurrency`, `defaultCalendar`, `defaultLocale`, `direction ('rtl' | 'ltr')`, `enableTaxpayerSystem`, `enableSayadChecks`, `enableSsoInsurance`, `vatScheme ('ir_moadian' | 'gcc_zatca' | 'gcc_fta' | 'simple')`, `defaultVatRate`.
- پیاده‌سازی `getComplianceProfile(countryCode?: string): CountryComplianceProfile` برای `IR`, `AF`, `TJ`, `SA`, `AE`, `IQ`, `OM`, `INTL` با پیش‌فرض `'IR'` (تضمین صفر تغییر برای مشتریان فعلی ایران).

۵. به‌روزرسانی وضعیت مایلستون در `src/lib/roadmapEngine.ts`:
- پس از پاس شدن تمام تست‌ها، وضعیت `m-601` را به `'completed'` و `m-602` را به `'in_progress'` تغییر بده.

محدودیت‌ها:
- به `accountingKernel.ts`، `atomicTransactionWrapper.ts` و کامپوننت‌های UI مالی دست نزن.
- تمام کلاس‌های جدید UI در صورت افزودن نباید از `ml-`/`mr-` استفاده کنند و باید از Tailwind Logical Properties (`ms-`/`me-`/`text-start`) پیروی کنند.

تأیید نهایی پس از اجرا:
- اجرای `npm run typecheck && npm run lint && npm run build`
- اجرای `npm run test:core-accounting && npm run test:license-entitlements`
```
