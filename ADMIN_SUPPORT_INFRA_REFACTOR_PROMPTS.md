# پرامپت تکمیلی پایدارسازی دیتابیس (RLS)، امنیت مسیرهای هوش مصنوعی و تکمیل زیرساخت مخزن

> **دستور مستقیم بنیان‌گذار خطاب به معمار ارشد (الزام اجرایی):**
> **«این عملیات باید با مصرف کمترین توکن، حداقل تغییرات جراحی (Surgical Edits) و با بیشترین سرعت ممکن انجام پذیرد.»**
>
> **توضیح وضعیت:** موارد سبک فرانت‌اند (`SecurityGates.tsx`، `posDeviceSurveyService.ts`، `geminiService.ts` و اصلاحات جزئی `HabinoAdminPanel.tsx`) توسط مشاور ارشد مستقیم اصلاح شدند. پرامپت زیر منحصراً برای اصلاح موارد باقی‌ماندهٔ سمت دیتابیس، بک‌اند و فایل‌های پیکربندی ریشهٔ پروژه است.

---

## پرامپت اجرایی برای تیم توسعه / معمار ارشد

```text
نقش تو: مهندس ارشد امنیت، بک‌اند و Supabase در هابینو.
هدف: تکمیل هم‌خوانی RLS با استاندارد تفکیک نقش‌ها، ایمن‌سازی اندپوینت‌های عمومی هوش مصنوعی در server.ts، پاکسازی متد متروکه در store.tsx و بازگرداندن فایل‌های پیکربندی ریشهٔ پروژه بدون دستکاری هستهٔ حسابداری.

گام ۱ — اصلاح تابع RLS در Supabase (فایل جدید `supabase/migrations/20261119_fix_platform_admin_tier_sre.sql`):
- به دلیل انتقال نقش `sre` از `super_admin` به `hubino_support`، تابع `public.current_platform_admin_tier()` را با یک مایگریشن تکمیلی دقیقاً به این صورت بازتعریف و در Supabase اعمال کن:
```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.current_platform_admin_tier()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
    SELECT CASE
        WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN NULL
        WHEN auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin' THEN 'founder'
        WHEN auth.jwt() -> 'app_metadata' ->> 'role' = 'hubino_support' THEN
            CASE
                WHEN auth.jwt() -> 'app_metadata' ->> 'admin_tier' IN ('support', 'billing', 'sre')
                    THEN auth.jwt() -> 'app_metadata' ->> 'admin_tier'
                ELSE 'support'
            END
        ELSE NULL
    END;
$function$;

REVOKE ALL ON FUNCTION public.current_platform_admin_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_platform_admin_tier() TO authenticated;

COMMIT;
```

گام ۲ — ایمن‌سازی اندپوینت‌های هوش مصنوعی در `server.ts`:
- برای مسیرهای `POST /api/ai/omni` (و `/api/openai/chat`، حوالی خط ۱۵۷۹)، `POST /api/gemini/cashflow-insights` (حوالی خط ۳۵۵۹)، `POST /api/gemini/categorize-transaction` (حوالی خط ۳۶۰۴) و `POST /api/gemini/voice-synapse` (حوالی خط ۳۶۲۹):
  * یک میدل‌ور/هلپر مشترک `requireAuthenticatedAiUser(req, res)` (بر مبنای الگوی `authClient.auth.getUser(accessToken)` در `/api/support/ai-reply` + Rate Limit به‌ازای `user.id`) اضافه کن تا در محیط عملیاتی بدون نشست معتبر JWT، درخواست با `401` رد شود (در حالت توسعهٔ آفلاین بدون تنظیم Supabase می‌توان تنها با بررسی کنترل‌شده یا Rate Limit روی IP اجازه داد).
  * در `/api/gemini/voice-synapse` اطمینان حاصل کن `voiceAuthStatus === 'authenticated'` و دسترسی `super_admin` فقط در صورتی فعال شود که نقش واقعی کاربر در JWT برابر `'super_admin'` (بنیان‌گذار) باشد، نه صرفاً از `req.body` کلاینت.

گام ۳ — پاکسازی کد متروکه در `src/lib/store.tsx`:
- متد `changeUserRole` (خط ۱۵۲۲ تا ۱۶۲۵) به اندپوینت ناموجود `PATCH /api/auth/platform-users/role` متصل است و در رابط کاربری نیز استفاده نمی‌شود (مدیریت اپراتورها از طریق `updatePlatformOperatorRole` و `POST /api/admin/operators/role` انجام می‌شود).
- برای جلوگیری از خطا و سردرگمی، `changeUserRole` را یا به `updatePlatformOperatorRole` متصل کن و یا در صورت عدم نیاز کامل حذف و از اینترفیس Context خارج کن.

گام ۴ — بازگرداندن فایل‌های پیکربندی ریشهٔ پروژه:
- فایل‌های `package.json` (دارای `"type": "module"` و اسکریپت‌های `dev`، `build`، `lint`، `typecheck` و تست‌ها)، `tsconfig.json` و `metadata.json` در بارگذاری اخیر از ریشهٔ پروژه حذف شده‌اند؛ این سه فایل را از آخرین نسخهٔ سالم مخزن به ریشهٔ پروژه بازگردانید.
```

---

## چک‌لیست تأیید پس از اجرا

```bash
npm run typecheck
npm run lint
npm run build
npm run test:license-entitlements
npm run test:security
npm run test:core-accounting
```
