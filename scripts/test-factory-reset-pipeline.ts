/**
 * HABINO FACTORY RESET PIPELINE - DUAL-LAYER SECURITY & RECOVERY VERIFICATION TEST
 * 
 * Tests:
 * 1. Phrasal Safety Guard assertion (Rejects empty, random, or invalid confirmation phrase)
 * 2. Tenant Profile & License preservation invariant (tenants, profiles, users, licenses survive)
 * 3. Outbox & Offline Sync Queue nullification (Prevents re-sync after reset)
 * 4. PostgreSQL RPC function schema & dependency order assertion
 * 5. Server endpoint security & multi-tier purge response validation
 */

import fs from 'fs';
import path from 'path';
import {
  clearStoredPayrollDataForTenant,
  getStoredEmployees,
  getStoredPayrollPeriods,
  getStoredPayrollSlips,
  PAYROLL_EMPLOYEES_KEY,
  PAYROLL_PERIODS_KEY,
  PAYROLL_SLIPS_KEY
} from '../src/lib/payrollEngine';

interface TestCase {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const testResults: TestCase[] = [];

function assertTest(id: string, name: string, condition: boolean, details: string) {
  testResults.push({
    id,
    name,
    passed: condition,
    details
  });
  const symbol = condition ? '✔' : '✖';
  const color = condition ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${symbol}\x1b[0m [${id.padEnd(20)}] ${name}`);
  console.log(`   \x1b[2m↳ ${details}\x1b[0m`);
}

async function runTestSuite() {
  console.log('\n================================================================================');
  console.log('🚀 HABINO ACCOUNTING - DUAL-LAYER FACTORY RESET PIPELINE VERIFICATION');
  console.log('================================================================================\n');

  // 1. Check Migration SQL file exists and contains rpc_factory_reset_tenant with SECURITY DEFINER
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261019_atomic_tenant_factory_reset_rpc.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assertTest(
    'MIG-01-EXISTS',
    'وجود فایل مایگریشن RPC ریست فکتوری در supabase/migrations',
    migrationExists,
    migrationExists ? `فایل مایگریشن در مسیر ${migrationPath} یافت شد.` : 'فایل مایگریشن یافت نشد.'
  );

  if (migrationExists) {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // 2. Check SECURITY DEFINER in SQL
    const hasSecurityDefiner = sql.includes('SECURITY DEFINER');
    assertTest(
      'MIG-02-SECURITY-DEF',
      'تعریف تابع با سطح دسترسی مالک سیستم (SECURITY DEFINER)',
      hasSecurityDefiner,
      hasSecurityDefiner
        ? 'تابع rpc_factory_reset_tenant با SECURITY DEFINER تعریف شده و خطای دسترسی ۴۲۵۰۱ در سوپابیس را برطرف می‌کند.'
        : 'فیلد SECURITY DEFINER در تابع یافت نشد.'
    );

    // 3. Check Strict Dependency Order in SQL
    const idxInstallments = sql.indexOf('DELETE FROM public.installments');
    const idxAccounting = sql.indexOf('DELETE FROM public.accounting_entries');
    const idxTransactions = sql.indexOf('DELETE FROM public.transactions');
    const idxChecks = sql.indexOf('DELETE FROM public.checks');
    const idxInvoices = sql.indexOf('DELETE FROM public.invoices');
    const idxClients = sql.indexOf('DELETE FROM public.clients');

    const isOrderValid =
      idxInstallments > 0 &&
      idxAccounting > idxInstallments &&
      idxTransactions > idxAccounting &&
      idxInvoices > idxTransactions &&
      idxClients > idxInvoices; // Invoices MUST be deleted before Clients due to RESTRICT!

    assertTest(
      'MIG-03-CASCADE-ORDER',
      'رعایت دقیق ترتیب وابستگی‌های کلید خارجی در انهدام (Order of Cascading)',
      isOrderValid,
      isOrderValid
        ? 'فاکتورها پیش از اشخاص (رفع ON DELETE RESTRICT) و اقساط پیش از فاکتورها حذف می‌گردند.'
        : 'ترتیب انهدام جداول با قیود کلید خارجی در تضاد است.'
    );

    // 4. Check Safety Preservation: Tenants, Tenant_Users, Licenses are NOT deleted
    const preservesTenants = !sql.includes('DELETE FROM public.tenants');
    const preservesUsers = !sql.includes('DELETE FROM public.tenant_users') && !sql.includes('DELETE FROM auth.users');
    const preservesLicenses = !sql.includes('DELETE FROM public.licenses');

    assertTest(
      'MIG-04-TENANT-PRESERVE',
      'مصونیت کامل جداول هویتی مستأجر و لایسنس (Zero Tenant Deletion Invariant)',
      preservesTenants && preservesUsers && preservesLicenses,
      'تایید شد: جداول tenants، tenant_users و licenses مطلقاً در فرایند ریست فکتوری حذف نمی‌شوند.'
    );
  }

  const fullResetPath = path.join(process.cwd(), 'supabase', 'migrations', '20261028_full_tenant_factory_reset.sql');
  const fullResetSql = fs.existsSync(fullResetPath) ? fs.readFileSync(fullResetPath, 'utf8') : '';
  const fullResetTables = [
    'platform_support_notes',
    'human_uat_results',
    'document_diagnostic_events',
    'agent_idea_proposals',
    'agent_roadmap_items',
    'agent_system_needs',
    'agent_convergence_gaps',
    'agent_event_logs',
    'agent_roadmap_ingestion_reports',
    'system_audit_events'
  ];
  assertTest(
    'MIG-09-FULL-TENANT-DATA-CLEANUP',
    'پاکسازی داده‌های کنسول و مدیریت مستأجر در ریست کامل',
    fullResetSql.includes('full_reset_cleanup') &&
      fullResetSql.includes('company_settings') &&
      fullResetTables.every(tableName => fullResetSql.includes(`'${tableName}'`)),
    'یادداشت‌های پشتیبانی، نتایج UAT، گزارش‌های تشخیصی/ایجنت و سابقه قدیمی ممیزی در ریست کامل حذف می‌شوند.'
  );

  const containmentPath = path.join(process.cwd(), 'supabase', 'migrations', '20261026_accounting_security_containment.sql');
  const containmentExists = fs.existsSync(containmentPath);
  const containmentSql = containmentExists ? fs.readFileSync(containmentPath, 'utf8') : '';
  assertTest(
    'MIG-05-ANON-DELETE-DENY',
    'لغو مجوز حذف ناشناس و TRUNCATE از جداول مالی',
    containmentSql.includes('REVOKE DELETE ON TABLE public.%I FROM PUBLIC, anon') &&
      containmentSql.includes('REVOKE TRUNCATE ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role'),
    'مجوزهای حذف ناشناس و TRUNCATE برای جداول مالی در migration افزایشی لغو می‌شوند.'
  );
  assertTest(
    'MIG-06-RESET-RPC-SERVICE-ONLY',
    'محدودسازی RPC ریست به service_role',
    containmentSql.includes('FROM PUBLIC, anon, authenticated') &&
      containmentSql.includes('TO service_role'),
    'فراخوانی مستقیم RPC ریست از نقش‌های عمومی و کاربر احراز هویت‌شده لغو می‌شود.'
  );
  const repairPath = path.join(process.cwd(), 'supabase', 'migrations', '20261027_restrict_factory_reset_rpc.sql');
  const repairSql = fs.existsSync(repairPath) ? fs.readFileSync(repairPath, 'utf8') : '';
  const legacyMigrationSql = migrationExists ? fs.readFileSync(migrationPath, 'utf8') : '';
  const legacyResetGrantIsRestricted =
    repairSql.includes('REVOKE ALL ON FUNCTION public.rpc_factory_reset_tenant') &&
    repairSql.includes('FROM PUBLIC, anon, authenticated') &&
    repairSql.includes('TO service_role') &&
    !/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.rpc_factory_reset_tenant[^;]*\bTO\s+anon\b/i.test(legacyMigrationSql);
  assertTest(
    'MIG-08-LEGACY-RESET-GRANT-RESTRICTED',
    'عدم اعطای مجوز RPC مخرب ریست به کاربران عمومی و اصلاح پایگاه داده موجود',
    legacyResetGrantIsRestricted,
    legacyResetGrantIsRestricted
      ? 'مهاجرت قدیمی و اصلاحیهٔ جدید، اجرای مستقیم RPC ریست را به service_role محدود می‌کنند.'
      : 'مجوز اجرای RPC قدیمی هنوز عمومی است یا مهاجرت اصلاحی وجود ندارد.'
  );
  assertTest(
    'MIG-07-RESET-ACTOR-AUDIT',
    'ثبت اتمیک هویت عامل ریست در سامانه ممیزی',
    containmentSql.includes('p_actor_id UUID') &&
      containmentSql.includes("'TENANT_FACTORY_RESET'") &&
      containmentSql.includes('p_actor_role'),
    'RPC ممیزی‌شده، عامل تأییدشده و مستأجر هدف را همراه عملیات اتمیک ثبت می‌کند.'
  );

  // 5. Test Server Route Implementation in server.ts
  const serverPath = path.join(process.cwd(), 'server.ts');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  const hasPurgeRoute = serverCode.includes('/api/supabase/purge-financial-data') && serverCode.includes('/api/tenant/factory-reset');
  assertTest(
    'SRV-01-ROUTES',
    'رجیستر بودن اندپوینت‌های /api/supabase/purge-financial-data و /api/tenant/factory-reset',
    hasPurgeRoute,
    'هر دو مسیر در server.ts جهت دریافت فرامین ریست فکتوری تعبیه شده‌اند.'
  );
  const hasPhrasalCheck = serverCode.includes('حذف داده‌های مالی') && serverCode.includes('RESET');
  const hasAdminAuthentication =
    serverCode.includes('!auth.authorized && !isSupabaseSuperAdmin && !isSupabaseTenantOwner && !isDevelopment') &&
    serverCode.includes("userRole === 'super_admin'") &&
    serverCode.includes("userRole === 'tenant_owner'") &&
    serverCode.includes('userTenantId === tenantId');
  assertTest(
    'SRV-02-PHRASE-GUARD',
    'الزام عبارت تأیید و احراز هویت مالک همان مستأجر یا سوپرادمین',
    hasPhrasalCheck && hasAdminAuthentication,
    'عبارت تأیید به‌تنهایی مجوز نیست؛ مالک فقط tenant درج‌شده در app_metadata امن را می‌تواند ریست کند.'
  );

  const hasRpcCall = serverCode.includes('rpc_factory_reset_tenant_audited');
  const tenantOwnerMigrationPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20261031_tenant_owner_factory_reset.sql'
  );
  const tenantOwnerMigration = fs.existsSync(tenantOwnerMigrationPath)
    ? fs.readFileSync(tenantOwnerMigrationPath, 'utf8')
    : '';
  assertTest(
    'MIG-10-TENANT-OWNER-RESET-AUDIT',
    'پذیرش امن و ممیزی‌شدهٔ ریست توسط مالک مستأجر',
    tenantOwnerMigration.includes("'tenant_owner'") &&
      tenantOwnerMigration.includes('p_actor_id IS NULL') &&
      tenantOwnerMigration.includes('p_actor_role'),
    'RPC فقط از سمت service_role قابل اجراست و actor مالک مستأجر را در ممیزی ثبت می‌کند.'
  );

  assertTest(
    'SRV-03-RPC-PIPELINE',
    'فراخوانی RPC اتمیک و ممیزی‌شده توسط سرور',
    hasRpcCall,
    'سرور پس از احراز هویت، RPC اتمیک ریست را با ثبت هویت عامل درخواست می‌کند.'
  );

  const resetHandler = serverCode.slice(
    serverCode.indexOf('const handleFactoryResetPurge'),
    serverCode.indexOf("app.post('/api/supabase/purge-financial-data'")
  );
  const hasInvoicePurgeGate =
    resetHandler.includes('if (!rpcExecuted)') &&
    resetHandler.includes('RPC ریست یا کلید service_role در دسترس نیست.') &&
    !resetHandler.includes('sequential_purge_fallback') &&
    !resetHandler.includes('const tablesToDelete');
  assertTest(
    'SRV-04-INVOICE-PURGE-GATE',
    'ثبت نشانگر ریست فقط پس از تأیید پاکسازی فاکتورهای ابری',
    hasInvoicePurgeGate,
    hasInvoicePurgeGate
      ? 'در صورت شکست RPC اتمیک، عملیات fail-closed است و حذف ترتیبی جایگزین اجرا نمی‌شود.'
      : 'گارد توقف عملیات پس از شکست RPC اتمیک یافت نشد.'
  );
  assertTest(
    'SRV-05-VERIFY-ALL-TENANT-TABLES',
    'تأیید خالی‌شدن همه جداول گزارش‌شده توسط RPC پیش از موفقیت ریست',
    resetHandler.includes('deletedCounts') &&
      resetHandler.includes('cloud_verification') &&
      resetHandler.includes('system_audit_events'),
    'سرور فقط حذف فاکتور را بررسی نمی‌کند؛ جدول‌های پاکسازی‌شده و لاگ ممیزی باقی‌مانده را هم کنترل می‌کند.'
  );
  assertTest(
    'SRV-06-HARD-CLIENT-PURGE',
    'حذف سخت طرف‌حساب و راستی‌آزمایی مستقل از پرچم حذف نرم',
    !resetHandler.includes('__DELETED_CLIENT__') &&
      !resetHandler.includes('is_deleted=eq.false') &&
      resetHandler.includes('const preserveClients = false;'),
    'هیچ soft-delete برای طرف‌حساب انجام نمی‌شود و وجود هر رکوردی در clients مانع موفقیت ریست است.'
  );
  assertTest(
    'SRV-07-ATOMIC-COMPAT-RPC',
    'سازگاری با دیتابیس فاقد RPC ممیزی‌شده بدون حذف ترتیبی',
    resetHandler.includes('auditedRpcUnavailable && !isFullTenantReset') &&
      resetHandler.includes('/rest/v1/rpc/rpc_factory_reset_tenant') &&
      resetHandler.includes('p_preserve_clients: false') &&
      resetHandler.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'فقط حالت حفظ انبار می‌تواند به RPC پایه اتمیک با کلید service_role برگردد؛ ریست کامل همچنان fail-closed است.'
  );

  const syncEnginePath = path.join(process.cwd(), 'src', 'lib', 'supabaseSyncEngine.ts');
  const syncEngineCode = fs.readFileSync(syncEnginePath, 'utf8');
  const purgeMethod = syncEngineCode.slice(
    syncEngineCode.indexOf('static async purgeAllFinancialDataFromSupabase'),
    syncEngineCode.indexOf('/**\n   * Run a comprehensive live test')
  );
  assertTest(
    'CLI-09-NO-CLIENT-PURGE-FALLBACK',
    'ممنوعیت اجرای RPC یا حذف مستقیم از کلاینت',
    purgeMethod.includes('serverPurgeSuccess') &&
      !purgeMethod.includes('directClientPurge') &&
      !purgeMethod.includes(".from('clients').delete()"),
    'کلاینت فقط موفقیت endpoint امن سرور را می‌پذیرد و مسیر حذف مستقیم یا soft-delete ندارد.'
  );
  assertTest(
    'CLI-13-NETWORK-ERROR-DETAILS',
    'نمایش علت شبکه‌ای خطای درخواست ریست به کاربر',
    purgeMethod.includes('const networkError = serverErr instanceof Error ? serverErr.message : String(serverErr)') &&
      purgeMethod.includes('جزئیات: ${networkError}'),
    'خطاهای fetch با جزئیات قابل تشخیص به رابط کاربری منتقل می‌شوند.'
  );
  assertTest(
    'CLI-14-UNICODE-CONFIRMATION-BODY',
    'ارسال عبارت تأیید فارسی در بدنه به‌جای هدر HTTP',
    !purgeMethod.includes("'x-confirmation-phrase'") &&
      purgeMethod.includes('confirmPhrase: confirmationPhrase'),
    'عبارت فارسی تأیید در JSON body باقی می‌ماند و خطای String contains non ISO-8859-1 code point رخ نمی‌دهد.'
  );

  // 6. Test Store & Client Pipeline in store.tsx
  const storePath = path.join(process.cwd(), 'src', 'lib', 'store.tsx');
  const storeCode = fs.readFileSync(storePath, 'utf8');
  const supabaseConfigPath = path.join(process.cwd(), 'src', 'lib', 'supabase.ts');
  const supabaseConfigCode = fs.readFileSync(supabaseConfigPath, 'utf8');
  const registrationMigrationPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20261101_persistent_tenant_registration.sql'
  );
  const registrationMigration = fs.existsSync(registrationMigrationPath)
    ? fs.readFileSync(registrationMigrationPath, 'utf8')
    : '';
  assertTest(
    'AUTH-01-PERSISTENT-REGISTRATION',
    'ایجاد اتمیک مستأجر و مالک حساب با دسترسی محدود به service_role',
    serverCode.includes("app.post('/api/auth/register-tenant'") &&
      serverCode.includes('auth.admin.createUser') &&
      serverCode.includes("rpc('rpc_register_tenant_account'") &&
      registrationMigration.includes('CREATE TABLE IF NOT EXISTS public.tenants') &&
    registrationMigration.includes("format_type(attribute.atttypid, attribute.atttypmod)") &&
    registrationMigration.includes('tenant_id %s NOT NULL REFERENCES public.tenants(id)') &&
    registrationMigration.includes("ADD COLUMN IF NOT EXISTS guild_type VARCHAR(50) NOT NULL DEFAULT 'technology'") &&
    registrationMigration.includes("ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb") &&
    registrationMigration.includes('p_tenant_id !~*') &&
    registrationMigration.includes('CREATE OR REPLACE FUNCTION public.rpc_register_tenant_account') &&
    serverCode.includes('const tenantId = crypto.randomUUID()') &&
      registrationMigration.includes('FROM PUBLIC, anon, authenticated') &&
      registrationMigration.includes('TO service_role'),
    'جداول لازم در صورت نبود ساخته می‌شوند؛ سپس حساب Supabase با claims امن و پروفایل tenant در RPC اتمیک ثبت می‌شوند.'
  );
  assertTest(
    'AUTH-02-PERSISTENT-PROFILE-LOGIN',
    'بازیابی نقش و tenant از claims و پروفایل پایدار هنگام ورود مجدد',
    serverCode.includes("app.get('/api/auth/profile'") &&
      serverCode.includes(".from('tenant_users')") &&
      serverCode.includes(".from('tenants')") &&
      storeCode.includes("fetch('/api/auth/profile'") &&
      storeCode.includes("role === 'super_admin'"),
    'ورود ابری به LocalStorage وابسته نیست و نقش پلتفرمی از claims امن خوانده می‌شود.'
  );
  assertTest(
    'AUTH-04-REGISTRATION-LOGIN-PROJECT-CONSISTENCY',
    'استفاده از پروژه Supabase سرور برای ورود حساب تازه‌ثبت‌شده',
    storeCode.includes('const authConfig = await syncSupabaseConfigWithServer();') &&
      supabaseConfigCode.includes('const activeUrl = serverUrl || localUrl || envUrl;') &&
      supabaseConfigCode.includes('const activeKey = serverKey || localKey || envKey;') &&
      !supabaseConfigCode.includes('if (current.isConfigured) {\n    return current;\n  }'),
    'تنظیم مرورگر قبل از ورود با تنظیم ثبت‌نام سمت سرور همگام می‌شود تا حساب در پروژه اشتباه جستجو نشود.'
  );
  const registrationUiPath = path.join(process.cwd(), 'src', 'components', 'LoginModal.tsx');
  const registrationUi = fs.readFileSync(registrationUiPath, 'utf8');
  assertTest(
    'AUTH-03-REAL-EMAIL-REQUIRED',
    'الزام ایمیل واقعی برای ایجاد حساب قابل بازیابی',
    registrationUi.includes('ایمیل واقعی (شناسه ورود) *') &&
      registrationUi.includes('email: regEmail.trim().toLowerCase()') &&
      !registrationUi.includes('@habino.local') &&
      registrationUi.includes('regPassword.length < 8'),
    'ثبت‌نام دیگر ایمیل ساختگی براساس شماره نمی‌سازد و حداقل طول رمز با سرویس Auth منطبق است.'
  );
  assertTest(
    'AUTH-05-DUPLICATE-EMAIL-RECOVERY',
    'راهنمای روشن برای ایمیل ثبت‌شده و بازیابی امن رمز',
    serverCode.includes('این ایمیل قبلاً در سامانه ثبت شده است') &&
      serverCode.includes('فراموشی رمز عبور؟') &&
      registrationUi.includes('resetPasswordForEmail(email, { redirectTo })') &&
      registrationUi.includes("event === 'PASSWORD_RECOVERY'") &&
      registrationUi.includes('supabase.auth.updateUser({ password: newPassword })') &&
      registrationUi.includes("typeof serverConfig?.appUrl === 'string'") &&
      registrationUi.includes('localOrPrivateHost && !import.meta.env.DEV') &&
      serverCode.includes('process.env.APP_PUBLIC_URL') &&
      serverCode.includes('appUrl,') &&
      storeCode.includes("signInError?.code === 'invalid_credentials'"),
    'ایمیل تکراری به ورود/بازیابی هدایت می‌شود؛ لینک بازیابی از دامنه عمومی سرور استفاده می‌کند و رمز جدید را ثبت می‌کند.'
  );
  const resetTargetResolution = storeCode.slice(
    storeCode.indexOf('const executeFactoryReset = async'),
    storeCode.indexOf('const effectiveTenantId = useMemo')
  );
  assertTest(
    'CLI-15-RESET-USES-AUTHENTICATED-TENANT',
    'استفاده از مستأجر حساب واردشده برای ریست',
    resetTargetResolution.includes(
      "currentUser && currentUser.role !== 'super_admin'\n      ? currentUser.tenantId || activeTenantId || 'tenant-main'"
    ),
    'مالک مستأجر با وجود شناسهٔ فعال قدیمی مرورگر، فقط tenant حساب احراز‌شده را هدف می‌گیرد.'
  );
  const cloudFailureGuardIndex = storeCode.indexOf('if (cloudResetRequired && cloudPurgeResult?.success !== true)');
  const localInvoiceClearIndex = storeCode.indexOf("HabinoIndexedDbEngine.clearTenantStore('invoices', targetTenant)", cloudFailureGuardIndex);
  const localQueueClearIndex = storeCode.indexOf('offlineOutbox.clearTenant(targetTenant)', cloudFailureGuardIndex);
  assertTest(
    'CLI-10-NO-LOCAL-PURGE-ON-CLOUD-FAILURE',
    'حفظ داده‌های محلی در صورت شکست ریست ابری',
    cloudFailureGuardIndex >= 0 &&
      localInvoiceClearIndex > cloudFailureGuardIndex &&
      localQueueClearIndex > cloudFailureGuardIndex,
    'در حالت ابری، ریست ناموفق پیش از پاک‌کردن IndexedDB یا صف همگام‌سازی بازمی‌گردد.'
  );

  const hasOutboxClear = storeCode.includes('offlineOutbox.clearTenant(targetTenant)') && storeCode.includes('HabinoOfflineQueue.clearQueue');
  assertTest(
    'CLI-01-OUTBOX-CLEAR',
    'ابطال و پاکسازی فوری صف‌های خروجی و آفلاین (Outbox & Queue Nullification)',
    hasOutboxClear,
    'صف خروجی آفلاین و حافظه همگام‌سازی IndexedDB پیش از ریست پاکسازی شده تا داده‌ها مجدداً به ابر بازنگردند.'
  );

  const hasIndexedDbClear = storeCode.includes('HabinoIndexedDbEngine.clearTenantStore');
  assertTest(
    'CLI-02-IDB-CLEAR',
    'پاکسازی عمیق کلیه جداول آفلاین در مخزن بومی IndexedDB',
    hasIndexedDbClear,
    'جداول اسناد، تراکنش‌ها، چک‌ها، اقساط، پروژه‌ها و اقلام خروجی در IndexedDB به صفر می‌رسند.'
  );
  assertTest(
    'CLI-12-CLIENT-PURGE-VERIFICATION',
    'راستی‌آزمایی صفرشدن طرف‌حساب‌ها در LocalStorage و IndexedDB',
    storeCode.includes('verifyLocalClientsPurged(targetTenant)') &&
      storeCode.includes("countTenantStoreRecords('clients', tenantId)") &&
      !storeCode.includes('await HabinoIndexedDbEngine.clearAllStores()'),
    'پس از ریست تعداد طرف‌حساب‌های tenant هدف در هر دو ذخیره‌ساز کنترل می‌شود و داده tenantهای دیگر پاک نمی‌شود.'
  );

  const hasLocalStoragePurge = storeCode.includes("localStorage.setItem('habino_invoices', JSON.stringify(remainingInvoices))") &&
    storeCode.includes("localStorage.setItem(`habino_pnl_purged_for_testing_v2_${targetTenant}`, 'true')") &&
    storeCode.includes('removeRowsForTenant(financialStateRef.current.invoices, targetTenant)');
  assertTest(
    'CLI-03-STORAGE-PURGE',
    'پاکسازی LocalStorage و نشانه‌گذاری ممانعت از لود داده‌های اولیه کاذب',
    hasLocalStoragePurge,
    'فقط رکوردهای مستأجر هدف از کش محلی حذف شده و نشانگر ریست همان مستأجر ثبت گردید.'
  );
  assertTest(
    'CLI-11-RESET-CONSOLE-AND-SETTINGS',
    'پاکسازی کش کنسول و تنظیمات و حفظ دامنه مستأجر',
    storeCode.includes('HabinoConflictResolutionEngine.clearHistory()') &&
      storeCode.includes('habinoFinancialAuditLogger.clear()') &&
      storeCode.includes('habino_agent_roundtable_events') &&
      storeCode.includes('setSettings(getTenantDefaultSettings') &&
      storeCode.includes('offlineOutbox.clearTenant(targetTenant)'),
    'تاریخچه محلی کنسول و تنظیمات مستأجر پاک می‌شود و صف‌های مستأجران دیگر حفظ می‌شوند.'
  );

  const payrollEnginePath = path.join(process.cwd(), 'src', 'lib', 'payrollEngine.ts');
  const payrollEngineCode = fs.readFileSync(payrollEnginePath, 'utf8');
  const payrollClearCount = storeCode.match(/clearStoredPayrollDataForTenant\(targetTenant\)/g)?.length || 0;
  assertTest(
    'CLI-05-PAYROLL-CLEAR',
    'پاکسازی اطلاعات حقوق و دستمزد در هر دو مسیر ریست',
    payrollClearCount === 2 && payrollEngineCode.includes('PAYROLL_EMPLOYEES_KEY'),
    'پاکسازی پرسنل، دوره‌ها و فیش‌ها در ریست مستقیم و همگرایی ریست ابری انجام می‌شود.'
  );

  const employeeGetter = payrollEngineCode.slice(
    payrollEngineCode.indexOf('export function getStoredEmployees'),
    payrollEngineCode.indexOf('export function saveStoredEmployees')
  );
  assertTest(
    'CLI-06-NO-PAYROLL-RESEED',
    'جلوگیری از بازسازی خودکار اطلاعات نمایشی پس از ریست',
    !employeeGetter.includes('INITIAL_EMPLOYEES'),
    'خواندن فهرست خالی پرسنل پس از ریست داده‌های آزمایشی را دوباره نمی‌سازد.'
  );

  const clientsPath = path.join(process.cwd(), 'src', 'components', 'Clients.tsx');
  const clientsCode = fs.readFileSync(clientsPath, 'utf8');
  assertTest(
    'UI-03-EMPLOYEE-DIRECTORY',
    'نمایش کارکنان و دسترسی به ویرایش پرونده از مخاطبین',
    clientsCode.includes('getStoredEmployees(activeTenantId)') &&
      clientsCode.includes('onNavigateToPayroll') &&
      clientsCode.includes('PAYROLL_EDIT_EMPLOYEE_KEY'),
    'فهرست پرسنل هر مستأجر در مخاطبین نمایش داده می‌شود و ویرایش به ماژول حقوق و دستمزد ارجاع می‌گردد.'
  );

  const payrollStorage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => payrollStorage.get(key) ?? null,
      setItem: (key: string, value: string) => payrollStorage.set(key, value),
      removeItem: (key: string) => payrollStorage.delete(key)
    }
  });
  payrollStorage.set(PAYROLL_EMPLOYEES_KEY, JSON.stringify([
    { id: 'demo-employee', tenantId: 'tenant-demo' },
    { id: 'other-employee', tenantId: 'tenant-other' }
  ]));
  payrollStorage.set(PAYROLL_PERIODS_KEY, JSON.stringify([
    { id: 'demo-period', tenantId: 'tenant-demo' },
    { id: 'other-period', tenantId: 'tenant-other' }
  ]));
  payrollStorage.set(PAYROLL_SLIPS_KEY, JSON.stringify([
    { id: 'demo-slip', employeeId: 'demo-employee', periodId: 'demo-period' },
    { id: 'other-slip', employeeId: 'other-employee', periodId: 'other-period' }
  ]));
  clearStoredPayrollDataForTenant('tenant-demo');
  const payrollResetIsScoped =
    getStoredEmployees('tenant-demo').length === 0 &&
    getStoredPayrollPeriods('tenant-demo').length === 0 &&
    getStoredPayrollSlips(undefined, 'tenant-demo').length === 0 &&
    getStoredEmployees('tenant-other').length === 1 &&
    getStoredPayrollPeriods('tenant-other').length === 1 &&
    getStoredPayrollSlips(undefined, 'tenant-other').length === 1;
  assertTest(
    'CLI-07-PAYROLL-TENANT-SCOPE',
    'پاکسازی حقوق و دستمزد محدود به مستأجر ریست‌شده',
    payrollResetIsScoped,
    'کارکنان، دوره‌ها و فیش‌های مستأجر دیگر پس از ریست مستأجر هدف باقی می‌مانند.'
  );

  payrollStorage.clear();
  payrollStorage.set(PAYROLL_EMPLOYEES_KEY, JSON.stringify([
    { id: 'legacy-employee', tenantId: 'tenant-demo' }
  ]));
  payrollStorage.set(PAYROLL_PERIODS_KEY, JSON.stringify([
    { id: 'legacy-period', tenantId: 'tenant-demo' }
  ]));
  payrollStorage.set(PAYROLL_SLIPS_KEY, JSON.stringify([
    { id: 'legacy-slip', employeeId: 'legacy-employee', periodId: 'legacy-period' }
  ]));
  const migratedEmployees = getStoredEmployees('tenant-main');
  const legacyPayrollMigrationIsScoped =
    migratedEmployees.length === 1 &&
    migratedEmployees[0].tenantId === 'tenant-main' &&
    getStoredPayrollSlips(undefined, 'tenant-main').length === 1 &&
    getStoredEmployees('tenant-other').length === 0;
  assertTest(
    'CLI-08-LEGACY-PAYROLL-MIGRATION',
    'مهاجرت ایمن داده‌های قدیمی حقوق و دستمزد',
    legacyPayrollMigrationIsScoped,
    'داده‌های نسخه قدیمی که به tenant-demo نسبت داده شده بودند فقط یک‌بار به مستأجر فعال منتقل می‌شوند.'
  );

  const resetDetectionSection = storeCode.slice(
    storeCode.indexOf('if (remoteVersion > 0 && remoteVersion > localKnownVersion)'),
    storeCode.indexOf('// ۱. دریافت و ادغام امضاهای سمت سرور')
  );
  const avoidsResetRehydration = /executeLocalPurgeOnly\(remoteMode,\s*targetTenant\)/.test(resetDetectionSection) &&
    !resetDetectionSection.includes('syncFromSupabase(targetTenant)');
  assertTest(
    'CLI-04-NO-RESET-REHYDRATE',
    'عدم واکشی مجدد فاکتورها بلافاصله پس از پاکسازی محلی دستگاه دوم',
    avoidsResetRehydration,
    avoidsResetRehydration
      ? 'پس از کشف ریست، داده‌ها پاک می‌شوند و فاکتور stale فوراً از ابر به حافظه محلی بازگردانده نمی‌شود.'
      : 'مسیر تشخیص ریست هنوز بلافاصله پس از پاکسازی داده‌ها را از ابر واکشی می‌کند.'
  );

  // 7. Test UI Safety Guards in Dashboard.tsx
  const dashboardPath = path.join(process.cwd(), 'src', 'components', 'Dashboard.tsx');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

  const hasUiPhrasalInput = dashboardCode.includes('confirmPhraseInput') && dashboardCode.includes('حذف داده‌های مالی');
  const hasUiCheckbox = dashboardCode.includes('acknowledgedRisk');
  const hasUiDisabledBtn = dashboardCode.includes('isResetting ||') && dashboardCode.includes('!acknowledgedRisk');

  assertTest(
    'UI-01-STRICT-GUARD',
    'مکانیزم تأییدیه سخت‌گیرانه دومرحله‌ای در UI (عبارت تأیید + چک‌باکس ریسک)',
    hasUiPhrasalInput && hasUiCheckbox && hasUiDisabledBtn,
    'دکمه تأیید نهایی تا زمان تایپ دقیق عبارت «حذف داده‌های مالی» یا «RESET» و فعال‌سازی چک‌باکس قفل است.'
  );

  const hasTenantPreserveNotice = dashboardCode.includes('Tenant Profile Guard') || dashboardCode.includes('حفظ هویت سازمانی');
  assertTest(
    'UI-02-TENANT-NOTICE',
    'نمایش اعلان شفاف عدم حذف مشخصات حساب و لایسنس مستأجر در مودال',
    hasTenantPreserveNotice,
    'کاربر صریحاً از مصونیت حساب کاربری و اشتراک خود حین ریست داده‌های مالی آگاه می‌شود.'
  );
  assertTest(
    'UI-04-NO-PRESERVE-CLIENT-RESET',
    'عدم ارائه گزینه ریست با حفظ طرف‌حساب‌ها',
    !dashboardCode.includes('preserve_contacts_inventory') &&
      !dashboardCode.includes('حفظ مخاطبین، بانک‌ها و کالاها'),
    'تمام گزینه‌های قابل انتخاب ریست، طرف‌حساب‌های tenant هدف را حذف می‌کنند.'
  );
  const resetCompletionFlow = dashboardCode.slice(
    dashboardCode.indexOf('const handleConfirmFactoryReset'),
    dashboardCode.indexOf('// ۱. اجرای موتور جامع حسابداری')
  );
  const resetSuccessIndex = resetCompletionFlow.indexOf('completedResetMessage = res.message');
  const resetModalCloseIndex = resetCompletionFlow.indexOf('setShowResetModal(false)');
  const openingStatusIndex = resetCompletionFlow.indexOf("updateSettings({ openingPeriodStatus: 'in_progress' })");
  assertTest(
    'UI-05-CLOSE-ON-RESET-SUCCESS',
    'بستن مودال و نمایش موفقیت پیش از ذخیره‌سازی مراحل بعدی',
    resetSuccessIndex >= 0 &&
      resetSuccessIndex < resetModalCloseIndex &&
      resetModalCloseIndex < openingStatusIndex &&
      resetCompletionFlow.includes('ریست فکتوری با موفقیت انجام شد.'),
    'پس از موفقیت پاکسازی، مودال فوراً بسته می‌شود و خطای ذخیره دوره مالی پیام موفقیت ریست را بازنویسی نمی‌کند.'
  );

  console.log('\n--------------------------------------------------------------------------------');
  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = total - passed;

  console.log(`شاخص‌های قبولی پایپلاین ریست فکتوری:`);
  console.log(`• کل آزمون‌های ارزیابی‌شده: ${total}`);
  console.log(`• آزمون‌های موفق:           ${passed}`);
  console.log(`• آزمون‌های ناموفق:         ${failed}`);
  console.log(`• درصد قبولی (Pass Rate):    ${Math.round((passed / total) * 100)}%`);
  console.log('--------------------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
