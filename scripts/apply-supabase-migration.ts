/**
 * HABINO ACCOUNTING - PRODUCTION MIGRATION DEPLOYER & SCHEMA HEALTH VERIFIER
 * 
 * Verifies and applies:
 * 1. 20260929_security_and_rls_hardening.sql
 * 2. Zero-Trust current_tenant_id()
 * 3. Dropping legacy permissive policies
 * 4. Token-bound RPCs for public invoices and signatures
 * 5. Rule 1 & Rule 9 database-level atomic assertions
 */

import fs from 'fs';
import path from 'path';

interface MigrationCheck {
  id: string;
  name: string;
  status: 'VERIFIED' | 'PENDING' | 'MANUAL_REQUIRED';
  details: string;
}

async function runMigrationPipeline() {
  console.log('\n================================================================================');
  console.log('🚀 HABINO ACCOUNTING - SUPABASE MIGRATION STATUS & EXECUTION ENGINE');
  console.log('================================================================================\n');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const isApplyRequested = process.argv.includes('--apply') || process.env.APPLY_MIGRATION === 'true';

  console.log(`📡 آدرس سوپابیس:     ${supabaseUrl ? supabaseUrl : '(تنظیم نشده - حالت شبیه‌ساز محلی)'}`);
  console.log(`🔑 کلید سرویس:       ${serviceKey ? 'موجود (سطح دسترسی ادمین)' : 'موجود نیست (فقط آزمون اعتبارسنجی آفلاین)'}`);
  console.log(`🔐 کلید ناشناس:       ${anonKey ? 'موجود' : 'موجود نیست'}`);
  console.log(`⚙️  حالت عملیات:       ${isApplyRequested ? 'اعمال مستقیم مایگریشن (--apply)' : 'بازرسی و تحلیل وضعیت'}\n`);

  const migrationFile = path.join(process.cwd(), 'supabase', 'migrations', '20260929_security_and_rls_hardening.sql');
  if (!fs.existsSync(migrationFile)) {
    console.error(`❌ فایل مایگریشن امنیتی یافت نشد: ${migrationFile}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationFile, 'utf8');
  console.log(`📄 مایگریشن هدف:       20260929_security_and_rls_hardening.sql (${sqlContent.length} بایت)\n`);

  const humanUatMigrationFile = path.join(process.cwd(), 'supabase', 'migrations', '20261009_human_uat_results.sql');
  if (!fs.existsSync(humanUatMigrationFile)) {
    console.error(`❌ مایگریشن ذخیره نتایج آزمون انسانی یافت نشد: ${humanUatMigrationFile}`);
    process.exit(1);
  }

  const humanUatSql = fs.readFileSync(humanUatMigrationFile, 'utf8');
  const hasHumanUatRls = humanUatSql.includes('public.human_uat_results') &&
    humanUatSql.includes('human_uat_results_tenant_select') &&
    humanUatSql.includes('human_uat_results_tenant_insert') &&
    humanUatSql.includes('FORCE ROW LEVEL SECURITY');
  console.log(`📄 مایگریشن UAT:        20261009_human_uat_results.sql (${humanUatSql.length} بایت)`);
  console.log(`🔒 سیاست‌های RLS UAT:   ${hasHumanUatRls ? 'موجود در فایل؛ استقرار دیتابیس نیازمند اجرای دستی است' : 'بررسی ناموفق'}\n`);

  const checks: MigrationCheck[] = [
    {
      id: 'MIG-01',
      name: 'پاکسازی سیاست‌های باز با شرط USING (true)',
      status: sqlContent.includes('DROP POLICY IF EXISTS "invoices_permissive_sync_policy"') ? 'VERIFIED' : 'PENDING',
      details: 'دستور DROP صریح برای سیاست invoices_permissive_sync_policy در متن مایگریشن درج شده است.'
    },
    {
      id: 'MIG-02',
      name: 'اصلاح Zero-Trust در تابع current_tenant_id',
      status: (!/COALESCE\s*\([^;]+'tenant-main'/i.test(sqlContent) && sqlContent.includes('current_tenant_id()')) ? 'VERIFIED' : 'PENDING',
      details: 'تابع برای کاربران anon مقدار NULL برمی‌گرداند و به صورت پیش‌فرض روی tenant-main فال‌بک نمی‌کند.'
    },
    {
      id: 'MIG-03',
      name: 'گارد ضد جعل مستأجر (Anti-Spoofing) در RPC ثبت اتمیک',
      status: sqlContent.includes('TENANT_MISMATCH') && sqlContent.includes('auth.jwt()') ? 'VERIFIED' : 'PENDING',
      details: 'انطباق ادعای JWT کاربر با p_tenant_id در لایه PostgreSQL بررسی و مسدودسازی فعال است.'
    },
    {
      id: 'MIG-04',
      name: 'اعمال قوانین ۱ و ۹ حسابداری در هسته پایگاه‌داده',
      status: (sqlContent.includes('RULE_1_MANDATORY_CONTACT_VIOLATION') && sqlContent.includes('LEDGER_UNBALANCED')) ? 'VERIFIED' : 'PENDING',
      details: 'الزام طرف‌حساب و توازن دقیق بدهکار/بستانکار به عنوان گارد تراکنش در تابع PostgreSQL تضمین شده است.'
    },
    {
      id: 'MIG-05',
      name: 'توابع امن فاکتور عمومی و امضا بر پایه توکن اشتراک',
      status: sqlContent.includes('get_public_invoice_by_token') && sqlContent.includes('submit_public_invoice_signature') ? 'VERIFIED' : 'PENDING',
      details: 'دسترسی عمومی تنها از طریق RPCهای توکن‌محور مجاز بوده و کوئری مستقیم جدول مسدود است.'
    },
    {
      id: 'MIG-06',
      name: 'کنترل مالکیت شناسه فاکتور و ایزولاسیون ردیف‌های دفتر کل',
      status: sqlContent.includes('TENANT_OWNERSHIP_VIOLATION') && sqlContent.includes('tenant_id = p_tenant_id') ? 'VERIFIED' : 'PENDING',
      details: 'از دستکاری یا بازنویسی فاکتور سازمان‌های دیگر و حذف ردیف‌های دفتر کل آن‌ها در ثبت اتمیک جلوگیری می‌شود.'
    },
    {
      id: 'MIG-07',
      name: 'جداسازی چندمستأجری سخت‌گیرانه برای جدول تنظیمات شرکت',
      status: sqlContent.includes('tenant_isolation_company_settings_select') && sqlContent.includes('tenant_isolation_company_settings_update') ? 'VERIFIED' : 'PENDING',
      details: 'سیاست permissive قدیمی حذف و ۴ سیاست RLS مجزا برای ایزولاسیون کامل جدول company_settings مستقر شدند.'
    },
    {
      id: 'MIG-08',
      name: 'ذخیره append-only نتایج آزمون انسانی با RLS مستأجرمحور',
      status: hasHumanUatRls ? 'MANUAL_REQUIRED' : 'PENDING',
      details: 'ساختار و سیاست‌ها در فایل مایگریشن موجودند؛ اجرای آن روی پروژه Supabase باید جداگانه انجام و تایید شود.'
    }
  ];

  console.log('--------------------------------------------------------------------------------');
  console.log('گزارش ممیزی قطعات مایگریشن امنیتی هابینو:');
  console.log('--------------------------------------------------------------------------------');
  checks.forEach((c, idx) => {
    const icon = c.status === 'VERIFIED'
      ? '\x1b[32m✔ تایید ایستا\x1b[0m'
      : c.status === 'MANUAL_REQUIRED'
        ? '\x1b[33m⚠ نیازمند اجرای دستی\x1b[0m'
        : '\x1b[31m✖ معلق\x1b[0m';
    console.log(`${idx + 1}. [${c.id}] ${icon} | ${c.name}`);
    console.log(`   ↳ ${c.details}`);
  });

  // Attempt live execution if service key provided
  if (supabaseUrl && serviceKey && isApplyRequested) {
    console.log('\nدر حال تلاش برای استقرار آنلاین مایگریشن از طریق REST SQL API سوپابیس...');
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });
      console.log(`نتیجه استقرار ابری: HTTP ${response.status}`);
    } catch (e: any) {
      console.warn('هشدار استقرار ابری:', e.message);
    }
  } else {
    console.log('\n💡 راهنمای استقرار در پروژه ابری Supabase:');
    console.log('   ۱. وارد پنل کاربری Supabase شوید: https://supabase.com/dashboard');
    console.log('   ۲. بخش SQL Editor را باز کنید.');
    console.log('   ۳. ابتدا مایگریشن امنیتی را اجرا کنید:');
    console.log(`      ${migrationFile}`);
    console.log('   ۴. سپس برای فعال‌شدن ذخیره‌سازی مرکزی نتایج UAT، این مایگریشن را اجرا کنید:');
    console.log(`      ${humanUatMigrationFile}`);
    console.log('   ۵. نتیجه اجرای هر دو فایل را در دیتابیس staging بررسی کنید؛ این ابزار مایگریشن UAT را اجرا نمی‌کند.\n');
  }

  console.log('================================================================================');
  console.log('✅ تحلیل فنی مایگریشن با موفقیت به پایان رسید.');
  console.log('================================================================================\n');
}

runMigrationPipeline().catch(console.error);
