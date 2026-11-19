# پرامپت مهندسی‌شده: شناسنامه ۳۶۰ درجه طرف‌حساب، چاپ تکی و دسته‌ای لیست مشتریان + رویت خواندنی در سیناپس

> **مرجع معماری:** منطبق بر `AGENTS.md` و `HABINO_KNOWLEDGE_BASE.md` (حفظ ۱۰۰٪ هسته حسابداری، اجرای صرفاً افزایشی و کم‌توکن، و ایمنی چندمستأجری).  
> **محدوده این پرامپت:** افزودن نمای کامل پروفایل طرف‌حساب (شامل کد پستی و مختصات نقشه)، چاپ رسمی شناسنامه تکی و لیست دسته‌ای (با دو قالب «گزارش مدیریتی» و «برگه ارسال/پیک»)، خروجی CSV دفترچه نشانی، و دسترسی خواندنی کم‌توکن برای یوزر مجازی / سیناپس.

---

## قوانین رایج و استاندارد پرامپت‌نویسی هابینو (Token-Efficiency & Surgical Engineering Rules)

1. **قانون ویرایش جراحی صرف (Surgical Patch Only):** فایل‌های بزرگ مثل `Clients.tsx`، `SynapseVoiceChat.tsx` و `exportUtils.ts` نباید کامل خوانده یا کامل بازنویسی شوند؛ فقط با `grep -n` خطوط هدف پیدا و با پنجره محدود Patch شوند.
2. **قانون منطقه ممنوعه (Do-Not-Touch Zone):** دست زدن به `accountingKernel.ts`، `atomicTransactionWrapper.ts`، `invoiceSync.ts`، `supabaseSyncEngine.ts`، منطق نقشه `OnlineAddressMapPicker*.tsx` و مسیرهای `server.ts` اکیداً ممنوع است.
3. **قانون ماژولاریته برای صرفه‌جویی توکن:** به‌جای شلوغ‌کردن فایل `Clients.tsx`، مودال جدید در یک فایل مجزا (`src/components/ClientProfilePrintModal.tsx`) ساخته شود و فقط دکمه‌ها و state اتصال با چند خط وارد `Clients.tsx` شود.
4. **قانون بدون پکیج جدید:** اجرای کامل با امکانات موجود پروژه (`lucide-react`، `window.print()` با کلاس‌های `print:*` مشابه `ClientStatementModal.tsx`) بدون نصب هیچ کتابخانه اضافی.
5. **قانون بهینه‌سازی توکن در هوش مصنوعی (Lazy & Compact Context):** در اتصال به سیناپس/یوزر مجازی، هرگز کل آرایه `clients` یا فاکتورها به پرامپت LLM ارسال نشود؛ فقط حداکثر ۵ تا ۱۰ رکورد منطبق با جستجو و صرفاً فیلدهای ضروری (`name, companyName, phone, nationalCode, postalCode, address, lat, lng, balance`) ارسال گردد.
6. **قانون سازگاری با محیط اجرا و RTL:** استفاده از Tailwind Logical Properties (`ms-`/`me-`/`text-start`)، ممنوعیت کامل `window.open` و `window.alert` (چاپ فقط با `window.print()` + کلاس‌های `@media print` / `print:hidden`)، و حفظ تفکیک مستأجران و دسترسی‌های RBAC.
7. **قانون تأیید یک‌باره و گزارش فشرده:** اجرای تست و بیلد فقط یک‌بار در پایان (`npm run typecheck && npm run lint && npm run build` و `npm run test:core-accounting`) همراه با گزارش کوتاه فهرست فایل‌های تغییریافته و نتیجه تست‌ها.

---

## پرامپت اجرایی آماده کپی برای تیم توسعه

```text
نقش تو: مهندس ارشد Frontend و معماری UI/UX در هابینو حسابداری.
هدف: تکمیل چرخه بهره‌برداری از پروفایل و نشانی طرف‌حساب‌ها شامل:
۱) نمایش کامل مشخصات هویتی و مکانی طرف‌حساب (همراه با کد پستی، مختصات و لینک مسیریابی نقشه)،
۲) مودال شناسنامه ۳۶۰ درجه تکی + چاپ رسمی،
۳) چاپ دسته‌ای و خروجی CSV لیست طرف‌حساب‌ها (با دو قالب «گزارش مدیریتی کامل» و «برگه ارسال/پیک بدون ارقام مالی»)،
۴) دسترسی خواندنی کم‌توکن به پروفایل و نشانی طرف‌حساب‌ها برای یوزر مجازی / هوش سیناپس.

⛔ قوانین الزامی اجرا با حداقل مصرف توکن (Token-Efficiency & Surgical Rules — تخطی ممنوع):
۱. ویرایش جراحی صرف (Surgical Patch Only): فایل‌های `Clients.tsx`، `exportUtils.ts`، `synapseReasoningEngine.ts` و `SynapseVoiceChat.tsx` را کامل نخوان و بازنویسی نکن؛ فقط با `grep -n` نقاط اتصال را پیدا و Patch محدود بزن.
۲. منطقه ممنوعه (Do-Not-Touch): مطلقاً به `accountingKernel.ts`، `atomicTransactionWrapper.ts`، `invoiceSync.ts`، `supabaseSyncEngine.ts`، `OnlineAddressMapPicker*.tsx` و `server.ts` دست نزن.
۳. بدون پکیج جدید: هیچ کتابخانه npm جدیدی نصب نکن. برای چاپ از الگوی موجود `ClientStatementModal.tsx` (`window.print()` با کلاس‌های `print:hidden` و `print:*`) استفاده کن؛ استفاده از `window.open` و `window.alert` ممنوع است.
۴. مصرف حداقلی توکن در سیناپس: فقط زمانی که پرسش کاربر شامل کلیدواژه‌های طرف‌حساب/آدرس/پروفایل/تلفن/کدپستی/چاپ لیست باشد، حداکثر ۱۰ رکورد خلاصه (`name`, `companyName`, `phone`, `nationalCode`, `economicCode`, `postalCode`, `address`, `lat`, `lng`, `balance`) به `SynapseReasoningContext` تزریق شود؛ در مکالمات عادی هیچ بار اضافه‌ای اضافه نکن.
۵. رعایت RTL و RBAC: تمام استایل‌ها با Logical Properties (`ms-`, `me-`, `text-start`) و منطبق با مجوز کاربر (`hasPermission`) باشند.
۶. بررسی یک‌باره در پایان: پس از اتمام تمام تغییرات، فقط یک‌بار `npm run typecheck && npm run lint && npm run build` و `npm run test:core-accounting` را اجرا کن و گزارش نهایی را در حداکثر ۶ خط بنویس.

گام ۱ — ایجاد کامپوننت جدید `src/components/ClientProfilePrintModal.tsx`:
- یک مودال واحد با دو حالت کاری `mode: 'single' | 'directory'` بساز:
  * **حالت `single` (شناسنامه ۳۶۰ درجه تکی یک طرف‌حساب):**
    - نمایش کامل هویت (نام، نوع حقیقی/حقوقی، نام شرکت، کد ملی/شناسه ملی، کد اقتصادی، ایمیل، تلفن)،
    - نمایش بخش مکانی: نشانی کامل، کد پستی (`postalCode`)، مختصات (`lat`/`lng` یا `latitude`/`longitude`) و لینک مستقیم `<a href="https://www.openstreetmap.org/?mlat=...&mlon=...#map=16/..." target="_blank" rel="noopener noreferrer">` برای مسیریابی (در صورت وجود مختصات)،
    - نمایش خلاصه وضعیت اعتبار و مالی (مانده حساب فعلی از `getClientAccountBalance`، سقف اعتبار، وضعیت مسدودی اعتبار، تعداد فاکتورها و چک‌ها)،
    - دکمه «چاپ شناسنامه طرف‌حساب» با `window.print()` در قالب رسمی A4 و امضا/مهر سازمان.
  * **حالت `directory` (لیست قابل چاپ طرف‌حساب‌ها بر اساس `filteredClients` فعلی):**
    - انتخاب قالب چاپ در بالای مودال (با `print:hidden`):
      ۱) **نسخه مدیریتی کامل:** نام، شرکت، نوع، تلفن، کد ملی/اقتصادی، کد پستی، نشانی، مانده فعلی و وضعیت بدهکار/بستانکار.
      ۲) **برگه ارسال و پیک (بدون ارقام مالی):** نام، نام شرکت، تلفن، کد پستی، نشانی کامل و مختصات (برای تحویل کالا/پیک بدون افشای مانده مالی).
    - نمایش نام کسب‌وکار از `settings.companyName` و تاریخ چاپ در هدر صفحه چاپی + دکمه چاپ (`window.print()`) و دکمه «خروجی اکسل (CSV)».
  * اگر کاربر مجوز مالی (`hasPermission('accounting:view_reports')`) نداشت، در حالت `directory` به‌طور پیش‌فرض قالب «برگه ارسال و پیک (بدون ارقام مالی)» نمایش داده شود و ستون مانده/اعتبار پنهان بماند.

گام ۲ — افزودن تابع خروجی CSV در `src/lib/exportUtils.ts`:
- تابع `exportClientsDirectoryToCsv(clients, balancesMap, currency, includeFinancials: boolean)` را مشابه `exportClientStatementToCsv` با BOM UTF-8 (`\uFEFF`) و Escape استاندارد CSV اضافه کن تا در اکسل فارسی بدون بهم‌ریختگی حروف باز شود.

گام ۳ — اتصال غیرمزاحم در `src/components/Clients.tsx`:
- در بخش بازشوی هر ردیف (Expanded Accordion حوالی خطوط ۶۵۴ تا ۷۱۰):
  * علاوه بر `client.address`، فیلدهای `client.postalCode` (کد پستی)، مختصات (`lat/lng`) و لینک باز کردن روی نقشه (در صورت وجود مختصات) را نمایش بده.
  * کنار دکمه «مشاهده و چاپ کارت حساب تفصیلی»، دکمه **«شناسنامه و چاپ پروفایل»** را اضافه کن که مودال `ClientProfilePrintModal` را در حالت `'single'` باز کند.
- در نوار ابزار بالای لیست مشتریان:
  * دو دکمه سبک **«چاپ لیست مخاطبین»** (بازکننده `ClientProfilePrintModal` در حالت `'directory'` روی `filteredClients` فعلی) و **«خروجی CSV»** اضافه کن.

گام ۴ — دسترسی خواندنی کم‌توکن برای یوزر مجازی / سیناپس (`src/lib/agents/synapseReasoningEngine.ts` و `src/components/SynapseVoiceChat.tsx`):
- در `SynapseReasoningContext` فیلد اختیاری و فشرده `clientProfiles?: Array<{ name: string; companyName?: string; phone?: string; nationalCode?: string; postalCode?: string; address?: string; lat?: number; lng?: number; balance: number }>` اضافه کن.
- در `SynapseVoiceChat.tsx` یک فیلتر هوشمند سبک بنویس: فقط وقتی پیام/درخواست شامل کلیدواژه‌های مرتبط با طرف‌حساب/آدرس/پروفایل/مختصات/تلفن/لیست مشتریان است، بر اساس تطبیق متن یا حداکثر ۱۰ مشتری برتر، آرایه فشرده `clientProfiles` را پاس بده.
- در `synapseReasoningEngine.ts` یک هندلر خواندنی (Read-Only طبق قانون ۳ `AGENTS.md`) اضافه کن تا در پاسخ به پرسش‌هایی مثل «مشخصات/آدرس/تلفن/پروفایل فلان مشتری چیه؟» یا «لیست آدرس مشتریان را بده»، اطلاعات کامل پروفایل و نشانی (و در صورت درخواست چاپ، راهنمای باز کردن چاپ لیست) را به‌صورت دقیق و کوتاه اعلام کند (و در صورت درخواست خروجی چاپی لیست، رویداد سبک `CustomEvent('habino:open-clients-directory-print')` را در مرورگر منتشر کند یا وضعیت را گزارش دهد؛ و اگر کاربر فقط نقش محدود دارد بدون دسترسی مالی، ارقام مانده را در پاسخ صوتی افشا نکند).

تأیید نهایی پس از اجرا:
- `npm run typecheck && npm run lint && npm run build`
- `npm run test:core-accounting`
```
