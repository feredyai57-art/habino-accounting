# پرامپت ارتقای افزونه‌محور نقشه آنلاین (`addon_geo_mapping`) — فقط تغییرات افزایشی

> **وضعیت:** پرامپت اولیهٔ پیاده‌سازی نقشه آنلاین (`OnlineAddressMapPicker` و پروکسی `/api/maps/*`) قبلاً توسط تیم توسعه اجرا شده است.
> **محدوده این پرامپت:** **فقط** تبدیل قابلیت نقشه آنلاین به یک افزونه مستقل قابل‌فروش (`addon_geo_mapping`)، اعمال کنترل دسترسی و سهمیه ماهانه + کش سمت سرور برای مهار هزینه API، و نمایش دکمه ارتقای غیرمزاحم + لینک مسیریابی برای خریداران افزونه.

---

## پرامپت اجرایی آماده کپی (فقط ارتقای جدید)

```text
نقش تو: مهندس ارشد Full-Stack و زیرساخت SaaS در هابینو.
هدف: تبدیل قابلیت نقشه آنلاین (که قبلاً پیاده‌سازی شده) به یک افزونه مستقل پولی با شناسه `addon_geo_mapping`، مهار هزینه API با سهمیه ماهانه و کش در سرور، و حفظ کامل ورود دستی آدرس برای کاربران بدون افزونه.

⛔ قوانین الزامی اجرا با حداقل مصرف توکن (Token-Efficiency & Surgical Rules — تخطی ممنوع):
۱. فقط ارتقای اخیر: هیچ بخشی از پیاده‌سازی پایه نقشه یا فرم‌های `Clients.tsx`، `Settings.tsx`، `Projects.tsx` و `PayrollStudio.tsx` را بازنویسی نکن. فقط فایل‌های محدود زیر را ویرایش جراحی کن.
۲. ویرایش جراحی صرف (Surgical Patch Only): فایل‌های `authEngine.ts`، `licenseEngine.ts` و `server.ts` را کامل نخوان و کامل بازنویسی نکن. با `grep -n` و پنجره ۳۰ تا ۴۰ خطی اطراف بخش هدف، Patch دقیق بزن.
۳. استفاده مجدد از زیرساخت موجود: `LicenseManager.tsx`، `UpgradeModal.tsx` و `hasAddon()` در `store.tsx` همین الان از `HABINO_ADDONS` می‌خوانند؛ پس به آن فایل‌ها دست نزن.
۴. منطقه ممنوعه (Do-Not-Touch): مطلقاً به `accountingKernel.ts`، `atomicTransactionWrapper.ts`، قوانین RBAC و کدهای غیرمرتبط دست نزن.
۵. بررسی و بیلد یک‌باره: فقط پس از اتمام تمام تغییرات، یک‌بار `npm run typecheck && npm run build` و `npm run test:license-entitlements` را اجرا کن.
۶. گزارش نهایی فوق‌کوتاه: در پایان فقط فهرست فایل‌های تغییریافته و نتیجه تست‌ها را در حداکثر ۵ خط بنویس.

گام ۱ — ثبت افزونه در کاتالوگ و موتور سریال (`src/lib/authEngine.ts` و `src/lib/licenseEngine.ts`):
- در `src/lib/authEngine.ts` داخل آرایه `HABINO_ADDONS`، یک آیتم جدید اضافه کن:
  * `id: 'addon_geo_mapping'`
  * `title: 'افزونه نقشه آنلاین، موقعیت‌یاب و لینک مسیریابی مشتری'`
  * `category: 'operational'`, `status: 'available'`, `billingType: 'yearly'`
  * `priceToman: 590000` (یا قیمت پیشنهادی سازگار با کاتالوگ), `badge: 'پخش، پروژه و ارسال کالا'`
  * `unlocksModules: ['geo_mapping']`
- در `src/lib/licenseEngine.ts` داخل `ADDON_CODES` (حوالی خط ۲۵):
  * `'addon_geo_mapping': 'GEO'` را اضافه کن تا صدور سریال و اعتبارسنجی آفلاین/آنلاین خودکار کار کند.

گام ۲ — قفل افزونه، سهمیه ماهانه و کش در پروکسی نقشه (`server.ts`):
- فقط در بلاک مسیرهای موجود `GET /api/maps/reverse-geocode` و `GET /api/maps/search` یک میدل‌ور/هلپر سبک اضافه کن که سه کار انجام دهد:
  1. **بررسی دسترسی افزونه (Entitlement Guard):** توکن JWT مستأجر را چک کند؛ اگر در محیط پروداکشن Supabase تنظیم شده است، فعال بودن پلن `enterprise` یا وجود `'addon_geo_mapping'` در `active_addons` مستأجر را تایید کند و در صورت نداشتن افزونه پاسخ `403` با `{ available: false, reason: 'ADDON_REQUIRED', addonId: 'addon_geo_mapping' }` برگرداند.
  2. **سهمیه ماهانه + Rate Limit به‌ازای هر مستأجر:** شمارنده مصرف ماهانه (مثلاً `MAP_MONTHLY_QUOTA_PER_TENANT` با پیش‌فرض `2500` درخواست در ماه برای هر `tenantId`) + محدودیت دقیقه‌ای اعمال کند و در صورت عبور از سقف، `429` با `{ available: false, reason: 'MAP_QUOTA_EXCEEDED' }` بدهد.
  3. **کش حافظه با TTL (کاهش ۵۰٪ هزینه API):** مختصات `lat/lng` را برای `reverse-geocode` به ۴ رقم اعشار گرد کرده و نتایج تکراری `reverse-geocode` و `search` را حداقل به مدت ۳۰ دقیقه در حافظه (LRU/Map با سقف کلید ایمن) کش کند.

گام ۳ — ارتقای غیرمزاحم کامپوننت `src/components/common/OnlineAddressMapPicker.tsx`:
- وضعیت افزونه را با `hasAddon('addon_geo_mapping')` از `useAccounting()` بخوان.
- **قانون طلایی UX:** فیلد متنی آدرس همیشه آزاد و قابل تایپ باقی بماند؛ فقط قابلیت نقشه آنلاین و جستجو پشت `hasAddon('addon_geo_mapping')` قرار گیرد.
- اگر مستأجر افزونه را نداشت:
  * با کلیک روی دکمه «انتخاب روی نقشه (افزونه)»، به‌جای فراخوانی API نقشه، یک کارت/مودال کوچک معرفی ارزش افزونه (پیدا کردن سریع روی نقشه + ارسال لینک مسیریابی برای پیک/نصاب) همراه با دکمه رفتن به بخش خرید افزونه/لایسنس نمایش داده شود.
- اگر مستأجر افزونه را داشت و مختصات `lat/lng` ثبت شده بود:
  * کنار فیلد یا خلاصه آدرس، یک لینک تگ `<a href="..." target="_blank" rel="noopener noreferrer">` با عنوان «مسیریابی روی نقشه» اضافه شود (بدون استفاده از `window.open`).
  * اگر سرور خطای `403 ADDON_REQUIRED` یا `429 MAP_QUOTA_EXCEEDED` برگرداند، پیام فارسی شفاف و بدون کرش نمایش دهد.

تأیید نهایی پس از اجرا:
- `npm run typecheck && npm run build`
- `npm run test:license-entitlements`
```
