import { getSupabaseClient, getSupabaseConfig } from './supabase';

export type SupportNoteCategory = 'license' | 'accounting_fix' | 'onboarding' | 'bug_report';

export interface SupportNote {
  id: string;
  tenantId: string;
  authorId: string;
  timestamp: string;
  category: SupportNoteCategory;
  content: string;
}

const getPlatformSession = async () => {
  if (!getSupabaseConfig().isConfigured) {
    throw new Error('اتصال ابری برای پرونده مشترک پشتیبانی پیکربندی نشده است.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(`اعتبارسنجی نشست پشتیبانی ناموفق بود: ${error.message}`);
  if (!data.user || !['super_admin', 'hubino_support'].includes(data.user.app_metadata?.role)) {
    throw new Error('برای استفاده از پرونده پشتیبانی، نشست معتبر پلتفرمی لازم است.');
  }

  return client;
};

export async function listSupportNotes(tenantId: string): Promise<SupportNote[]> {
  const client = await getPlatformSession();
  const { data, error } = await client
    .from('platform_support_notes')
    .select('id, tenant_id, created_by, category, content, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`بارگذاری پرونده تماس‌ها ناموفق بود: ${error.message}`);

  return (data || []).map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    authorId: row.created_by,
    timestamp: row.created_at,
    category: row.category,
    content: row.content
  }));
}

export async function addSupportNote(
  tenantId: string,
  category: SupportNoteCategory,
  content: string
): Promise<SupportNote> {
  const client = await getPlatformSession();
  const { data, error } = await client
    .from('platform_support_notes')
    .insert({ tenant_id: tenantId, category, content: content.trim() })
    .select('id, tenant_id, created_by, category, content, created_at')
    .single();

  if (error) throw new Error(`ثبت یادداشت تماس ناموفق بود: ${error.message}`);

  return {
    id: data.id,
    tenantId: data.tenant_id,
    authorId: data.created_by,
    timestamp: data.created_at,
    category: data.category,
    content: data.content
  };
}

export async function issuePlatformLicense(
  tenantId: string,
  plan: 'starter' | 'professional' | 'enterprise',
  durationDays: number
): Promise<{ serialKey: string; expiresAt: string | null; isLifetime: boolean }> {
  const client = await getPlatformSession();
  const { data, error } = await client.rpc('rpc_issue_habino_license', {
    p_tenant_id: tenantId,
    p_plan: plan,
    p_duration_days: durationDays
  });

  if (error) throw new Error(`صدور لایسنس از سرویس امن ناموفق بود: ${error.message}`);
  if (!data?.serial_key) throw new Error('سرویس صدور لایسنس پاسخ معتبری برنگرداند.');
  return {
    serialKey: data.serial_key,
    expiresAt: data.expires_at,
    isLifetime: Boolean(data.is_lifetime)
  };
}

export async function issuePlatformAddonLicense(
  tenantId: string,
  addonId: string,
  durationDays = 365
): Promise<{ serialKey: string; expiresAt: string }> {
  const client = await getPlatformSession();
  const { data, error } = await client.rpc('rpc_issue_habino_addon_license', {
    p_tenant_id: tenantId,
    p_addon_id: addonId,
    p_duration_days: durationDays
  });

  if (error) throw new Error(`صدور لایسنس افزونه از سرویس امن ناموفق بود: ${error.message}`);
  if (!data?.serial_key || !data.expires_at) throw new Error('سرویس صدور افزونه پاسخ معتبری برنگرداند.');
  return { serialKey: data.serial_key, expiresAt: data.expires_at };
}
